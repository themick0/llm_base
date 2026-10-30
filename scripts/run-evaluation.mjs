import 'dotenv/config';
import { readFile, rename, writeFile } from 'node:fs/promises';

const datasetPath = 'datasets/aws-prompt-evaluation.json';
const outputPath = 'datasets/aws-prompt-evaluation-results.json';
const port = process.env.PORT ?? '3000';
const prefix = process.env.API_PREFIX ?? 'api';
const endpoint = `http://127.0.0.1:${port}/${prefix}/llm/generate`;
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
const results = [];

for (const [index, entry] of dataset.entries()) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: entry.task }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Task ${index + 1} failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  if (typeof body.response !== 'string') {
    throw new Error(`Task ${index + 1} returned an unexpected response format`);
  }

  let answer = body.response;

  try {
    const structuredResponse = JSON.parse(answer);

    if (typeof structuredResponse.agentText === 'string') {
      answer = structuredResponse.agentText;
    }
  } catch {
    // Plain-text responses do not need structured-output extraction.
  }

  results.push({ task: entry.task, answer });

  await writeFile(`${outputPath}.tmp`, `${JSON.stringify(results, null, 2)}\n`);
  await rename(`${outputPath}.tmp`, outputPath);

  console.log(`Saved ${index + 1}/${dataset.length}`);
}
