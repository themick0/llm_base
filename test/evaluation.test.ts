import { loadConfig } from 'src/config';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { GRANDER_SYSTEM_PROMPT } from 'src/evaluation/grander-prompt';
import { EvaluationSchema } from 'src/evaluation/evaluation.schema';
import { PromptEvaluator } from 'src/evaluation/PromptEvaluator';
import { LlmService, type LlmClient } from 'src/llm/llm.service';

const evaluation = {
  strengths: ['Maintains the assigned role'],
  weaknesses: ['Could be more concise'],
  reasoning: 'Correct redirection with minor verbosity.',
  score: 9,
};

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'llm-evaluation-'));
  const datasetPath = join(directory, 'tasks.json');
  const outputPath = join(directory, 'results.json');

  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    datasetPath,
    JSON.stringify([{ task: 'First' }, { task: 'Second' }]),
  );

  return { datasetPath, outputPath };
}

test('generates then grades every task and checkpoints the requested shape', async (t) => {
  const paths = await fixture(t);
  const calls: string[] = [];
  let servicesCreated = 0;

  const results = await new PromptEvaluator({
    ...paths,
    assistantSystemPrompt: 'Reference barbershop prompt',
    createServices() {
      servicesCreated += 1;

      return {
        assistant: {
          async generate(task, prompt) {
            assert.equal(prompt, 'Reference barbershop prompt');
            calls.push(`assistant:${task}`);

            return {
              response: JSON.stringify({ agentText: `Answer to ${task}` }),
            };
          },
        },
        grander: {
          async generate(input, prompt, schema) {
            const data = JSON.parse(input);

            assert.equal(prompt, GRANDER_SYSTEM_PROMPT);
            assert.equal(schema, EvaluationSchema);
            assert.equal(
              data.assistantSystemPrompt,
              'Reference barbershop prompt',
            );
            assert.equal(data.solution, `Answer to ${data.task}`);
            calls.push(`grander:${data.task}`);

            return { response: JSON.stringify(evaluation) };
          },
        },
      };
    },
    async onProgress() {
      // Checkpoints are written before progress is reported.
      JSON.parse(await readFile(paths.outputPath, 'utf8'));
    },
  }).run();

  assert.equal(servicesCreated, 2);
  assert.deepEqual(calls, [
    'assistant:First',
    'grander:First',
    'assistant:Second',
    'grander:Second',
  ]);
  assert.deepEqual(results, [
    { task: 'First', response: 'Answer to First', ...evaluation },
    { task: 'Second', response: 'Answer to Second', ...evaluation },
  ]);
  assert.deepEqual(
    JSON.parse(await readFile(paths.outputPath, 'utf8')),
    results,
  );
});

for (const invalid of [
  ...[0, 11, -1, '9'].map((score) => JSON.stringify({ ...evaluation, score })),
  JSON.stringify({ ...evaluation, strengths: [] }),
  JSON.stringify({
    ...evaluation,
    weaknesses: ['One', 'Two', 'Three', 'Four'],
  }),
  JSON.stringify({ ...evaluation, reasoning: '' }),
  '{"score":9}',
  'not JSON',
]) {
  test(`rejects invalid grander output and preserves completed results: ${invalid}`, async (t) => {
    const paths = await fixture(t);
    let task = 0;

    await assert.rejects(
      new PromptEvaluator({
        ...paths,
        assistantSystemPrompt: 'Reference prompt',
        createServices() {
          task += 1;
          const current = task;

          return {
            assistant: {
              async generate() {
                return { response: '{"agentText":"Answer"}' };
              },
            },
            grander: {
              async generate() {
                return {
                  response:
                    current === 1 ? JSON.stringify(evaluation) : invalid,
                };
              },
            },
          };
        },
      }).run(),
      /Task 2 failed; 1 completed results/,
    );

    assert.deepEqual(JSON.parse(await readFile(paths.outputPath, 'utf8')), [
      { task: 'First', response: 'Answer', ...evaluation },
    ]);
  });
}

test('does not overwrite the input dataset', async (t) => {
  const paths = await fixture(t);

  await assert.rejects(
    new PromptEvaluator({
      ...paths,
      outputPath: resolve(paths.datasetPath),
      assistantSystemPrompt: 'Reference prompt',
      createServices() {
        throw new Error('Must not run');
      },
    }).run(),
    /paths must be different/,
  );
});

test('generate sends the grander prompt and numeric score schema to Anthropic', async () => {
  let received = false;
  const client: LlmClient = {
    messages: {
      stream(params) {
        assert.equal(params.system, GRANDER_SYSTEM_PROMPT);
        assert.equal(params.messages.at(-1)?.role, 'user');
        assert.equal(params.output_config?.format?.type, 'json_schema');

        const format = params.output_config?.format;

        if (format?.type === 'json_schema') {
          assert.deepEqual(format.schema.required, [
            'strengths',
            'weaknesses',
            'reasoning',
            'score',
          ]);
        }

        received = true;

        return {
          on() {},
          async finalMessage() {
            // Only the content property is consumed by generate.
            return {
              content: [{ type: 'text', text: JSON.stringify(evaluation) }],
            } as Awaited<
              ReturnType<
                import('src/llm/llm.service').LlmStream['finalMessage']
              >
            >;
          },
        };
      },
    },
  };
  const service = new LlmService(client, 'test-model', { info() {} });
  const result = await service.generate(
    'Evaluation input',
    GRANDER_SYSTEM_PROMPT,
    EvaluationSchema,
  );

  assert.equal(received, true);
  assert.deepEqual(JSON.parse(result.response), evaluation);
});

test('loads a separate Grander model and falls back to the assistant model', () => {
  const separate = loadConfig({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_MODEL: 'assistant-model',
    ANTHROPIC_GRANDER_MODEL: 'grander-model',
  });
  const fallback = loadConfig({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_MODEL: 'assistant-model',
  });

  assert.equal(separate.anthropicModel, 'assistant-model');
  assert.equal(separate.anthropicGranderModel, 'grander-model');
  assert.equal(fallback.anthropicGranderModel, 'assistant-model');
});
