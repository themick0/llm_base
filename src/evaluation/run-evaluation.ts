import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { JUDGE_SYSTEM_PROMPT } from 'src/evaluation/judge-prompt';
import type { LlmService } from 'src/llm/llm.service';

const DatasetSchema = z.array(z.object({ task: z.string().min(1) })).min(1);
const AnswerSchema = z.object({ agentText: z.string() }).strict();
export const ScoreSchema = z
  .object({ score: z.number().min(0).max(10) })
  .strict();

export interface EvaluationResult {
  task: string;
  response: string;
  score: number;
}

interface EvaluationOptions {
  datasetPath: string;
  outputPath: string;
  assistantSystemPrompt: string;
  createServices: () => {
    assistant: Pick<LlmService, 'generate'>;
    judge: Pick<LlmService, 'generate'>;
  };
  onProgress?: (completed: number, total: number) => void | Promise<void>;
}

async function saveResults(path: string, results: EvaluationResult[]) {
  const temporaryPath = `${path}.tmp`;
  const content = `${JSON.stringify(results, null, 2)}\n`;

  await writeFile(temporaryPath, content);
  await rename(temporaryPath, path);
}

export async function runEvaluation(
  options: EvaluationOptions,
): Promise<EvaluationResult[]> {
  const content = await readFile(options.datasetPath, 'utf8');
  const dataset = DatasetSchema.parse(JSON.parse(content));
  const results: EvaluationResult[] = [];

  if (resolve(options.datasetPath) === resolve(options.outputPath)) {
    throw new Error('Dataset and output paths must be different');
  }

  await saveResults(options.outputPath, results);

  for (const [index, { task }] of dataset.entries()) {
    // Fresh services isolate tasks and keep the judge out of the assistant's history.
    const { assistant, judge } = options.createServices();

    try {
      const generated = await assistant.generate(
        task,
        options.assistantSystemPrompt,
      );
      const { agentText: response } = AnswerSchema.parse(
        JSON.parse(generated.response),
      );
      const judgeInput = JSON.stringify({
        assistantSystemPrompt: options.assistantSystemPrompt,
        task,
        response,
      });

      const graded = await judge.generate(
        judgeInput,
        JUDGE_SYSTEM_PROMPT,
        ScoreSchema,
      );
      const { score } = ScoreSchema.parse(JSON.parse(graded.response));

      results.push({ task, response, score });

      await saveResults(options.outputPath, results);
      await options.onProgress?.(index + 1, dataset.length);
    } catch (error) {
      throw new Error(
        `Task ${index + 1} failed; ${results.length} completed results were saved to ${options.outputPath}`,
        { cause: error },
      );
    }
  }

  return results;
}
