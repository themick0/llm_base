import Anthropic from '@anthropic-ai/sdk';
import { resolve } from 'node:path';
import { loadConfig } from 'src/config';
import { runEvaluation } from 'src/evaluation/run-evaluation';
import {
  ANTHROPIC_MAX_RETRIES,
  ANTHROPIC_TIMEOUT_MS,
  SYSTEM_PROMPT,
} from 'src/llm/constants';
import { LlmService } from 'src/llm/llm.service';

async function main() {
  const config = loadConfig();
  const datasetPath = resolve(
    process.argv[2] ?? 'datasets/aws-prompt-evaluation.json',
  );
  const outputPath = resolve(
    process.argv[3] ?? 'datasets/aws-prompt-evaluation-auto-scored.json',
  );
  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  });
  const logger = { info: () => undefined };

  await runEvaluation({
    datasetPath,
    outputPath,
    assistantSystemPrompt: SYSTEM_PROMPT,
    createServices: () => ({
      assistant: new LlmService(client, config.anthropicModel, logger),
      judge: new LlmService(client, config.anthropicModel, logger),
    }),
    onProgress: (completed, total) =>
      console.log(`Saved ${completed}/${total}`),
  });

  console.log(`Evaluation completed: ${outputPath}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
