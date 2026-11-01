import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AnswerSchema,
  DatasetSchema,
  EvaluationSchema,
  type EvaluationResult,
} from 'src/evaluation/evaluation.schema';
import { GRANDER_SYSTEM_PROMPT } from 'src/evaluation/grander-prompt';
import type { LlmService } from 'src/llm/llm.service';

export interface PromptEvaluatorOptions {
  datasetPath: string;
  outputPath: string;
  assistantSystemPrompt: string;
  createServices: () => {
    assistant: Pick<LlmService, 'generate'>;
    grander: Pick<LlmService, 'generate'>;
  };
  onProgress?: (completed: number, total: number) => void | Promise<void>;
}

export class PromptEvaluator {
  constructor(private readonly options: PromptEvaluatorOptions) {}

  async run(): Promise<EvaluationResult[]> {
    const { datasetPath, outputPath } = this.options;

    if (resolve(datasetPath) === resolve(outputPath)) {
      throw new Error('Dataset and output paths must be different');
    }

    const content = await readFile(datasetPath, 'utf8');
    const dataset = DatasetSchema.parse(JSON.parse(content));
    const results: EvaluationResult[] = [];

    await this.saveResults(results);

    for (const [index, { task }] of dataset.entries()) {
      try {
        const result = await this.evaluateTask(task);

        results.push(result);

        await this.saveResults(results);
        await this.options.onProgress?.(index + 1, dataset.length);
      } catch (error) {
        throw new Error(
          `Task ${index + 1} failed; ${results.length} completed results were saved to ${outputPath}`,
          { cause: error },
        );
      }
    }

    return results;
  }

  private async evaluateTask(task: string): Promise<EvaluationResult> {
    // Fresh services isolate tasks and keep the Grander out of the assistant's history.
    const { assistant, grander } = this.options.createServices();
    const generated = await assistant.generate(
      task,
      this.options.assistantSystemPrompt,
    );
    const { agentText: response } = AnswerSchema.parse(
      JSON.parse(generated.response),
    );
    const granderInput = JSON.stringify({
      assistantSystemPrompt: this.options.assistantSystemPrompt,
      task,
      solution: response,
    });

    const graded = await grander.generate(
      granderInput,
      GRANDER_SYSTEM_PROMPT,
      EvaluationSchema,
    );
    const evaluation = EvaluationSchema.parse(JSON.parse(graded.response));

    return { task, response, ...evaluation };
  }

  private async saveResults(results: EvaluationResult[]): Promise<void> {
    const { outputPath } = this.options;
    const temporaryPath = `${outputPath}.tmp`;
    const content = `${JSON.stringify(results, null, 2)}\n`;

    await writeFile(temporaryPath, content);
    await rename(temporaryPath, outputPath);
  }
}
