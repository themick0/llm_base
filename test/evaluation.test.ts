import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { JUDGE_SYSTEM_PROMPT } from 'src/evaluation/judge-prompt';
import { runEvaluation, ScoreSchema } from 'src/evaluation/run-evaluation';
import { LlmService, type LlmClient } from 'src/llm/llm.service';

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

  const results = await runEvaluation({
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
        judge: {
          async generate(input, prompt, schema) {
            const data = JSON.parse(input);

            assert.equal(prompt, JUDGE_SYSTEM_PROMPT);
            assert.equal(schema, ScoreSchema);
            assert.equal(
              data.assistantSystemPrompt,
              'Reference barbershop prompt',
            );
            assert.equal(data.response, `Answer to ${data.task}`);
            calls.push(`judge:${data.task}`);

            return { response: '{"score":9}' };
          },
        },
      };
    },
    async onProgress() {
      // Checkpoints are written before progress is reported.
      JSON.parse(await readFile(paths.outputPath, 'utf8'));
    },
  });

  assert.equal(servicesCreated, 2);
  assert.deepEqual(calls, [
    'assistant:First',
    'judge:First',
    'assistant:Second',
    'judge:Second',
  ]);
  assert.deepEqual(results, [
    { task: 'First', response: 'Answer to First', score: 9 },
    { task: 'Second', response: 'Answer to Second', score: 9 },
  ]);
  assert.deepEqual(
    JSON.parse(await readFile(paths.outputPath, 'utf8')),
    results,
  );
});

for (const invalid of [
  '{"score":11}',
  '{"score":-1}',
  '{"score":"9"}',
  'not JSON',
]) {
  test(`rejects invalid judge output and preserves completed results: ${invalid}`, async (t) => {
    const paths = await fixture(t);
    let task = 0;

    await assert.rejects(
      runEvaluation({
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
            judge: {
              async generate() {
                return { response: current === 1 ? '{"score":10}' : invalid };
              },
            },
          };
        },
      }),
      /Task 2 failed; 1 completed results/,
    );

    assert.deepEqual(JSON.parse(await readFile(paths.outputPath, 'utf8')), [
      { task: 'First', response: 'Answer', score: 10 },
    ]);
  });
}

test('does not overwrite the input dataset', async (t) => {
  const paths = await fixture(t);

  await assert.rejects(
    runEvaluation({
      ...paths,
      outputPath: resolve(paths.datasetPath),
      assistantSystemPrompt: 'Reference prompt',
      createServices() {
        throw new Error('Must not run');
      },
    }),
    /paths must be different/,
  );
});

test('generate sends the judge prompt and numeric score schema to Anthropic', async () => {
  let received = false;
  const client: LlmClient = {
    messages: {
      stream(params) {
        assert.equal(params.system, JUDGE_SYSTEM_PROMPT);
        assert.equal(params.messages.at(-1)?.role, 'user');
        assert.equal(params.output_config?.format?.type, 'json_schema');

        const format = params.output_config?.format;

        if (format?.type === 'json_schema') {
          assert.deepEqual(format.schema.required, ['score']);
        }

        received = true;

        return {
          on() {},
          async finalMessage() {
            // Only the content property is consumed by generate.
            return {
              content: [{ type: 'text', text: '{"score":8}' }],
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
    JUDGE_SYSTEM_PROMPT,
    ScoreSchema,
  );

  assert.equal(received, true);
  assert.equal(result.response, '{"score":8}');
});
