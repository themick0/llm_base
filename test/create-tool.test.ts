import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createTool } from 'src/llm/create-tool';

test('validates tool input before invoking an async handler and passes normalized values', async () => {
  const calls: string[] = [];
  const tool = createTool(
    {
      name: 'lookup',
      description: 'Look up a record.',
      inputSchema: z.strictObject({ query: z.string().trim().min(1) }),
    },
    async ({ query }) => {
      calls.push(query);

      return JSON.stringify({ query });
    },
  );

  for (const input of [
    {},
    { query: ' ' },
    { query: 42 },
    { query: 'test', extra: true },
  ]) {
    assert.throws(() => tool.execute(input), /Invalid arguments for lookup/);
  }

  assert.deepEqual(calls, []);
  assert.equal(await tool.execute({ query: ' test ' }), '{"query":"test"}');
  assert.deepEqual(calls, ['test']);
  assert.equal(tool.schema.strict, true);
  assert.equal(tool.schema.input_schema.type, 'object');
  assert.equal(tool.schema.input_schema.additionalProperties, false);
  assert.deepEqual(tool.schema.input_schema.required, ['query']);
  assert.ok(tool.schema.input_schema.properties);
  assert.ok(Object.hasOwn(tool.schema.input_schema.properties, 'query'));
});
