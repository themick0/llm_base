import { readFile } from 'node:fs/promises';

async function main() {
  const filePath =
    process.argv[2] ?? 'datasets/aws-prompt-evaluation-auto-scored.json';
  const content = await readFile(filePath, 'utf8');
  const results = JSON.parse(content);

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Expected a nonempty JSON array of scored results');
  }

  let total = 0;

  for (const [index, result] of results.entries()) {
    const score = result?.score;

    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10
    ) {
      throw new Error(
        `Invalid score at index ${index}: expected a number from 0 to 10`,
      );
    }

    total += score;
  }

  const averageScore = total / results.length;

  console.log(
    JSON.stringify(
      { file: filePath, count: results.length, averageScore },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Failed to calculate the average score',
  );
  process.exitCode = 1;
});
