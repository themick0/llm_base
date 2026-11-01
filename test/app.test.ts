import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import { createApp } from 'src/app';
import { loadConfig } from 'src/config';
import { SYSTEM_PROMPT } from 'src/llm/constants';
import type { LlmClient } from 'src/llm/llm.service';

const response: Message = {
  container: null,
  diagnostics: null,
  stop_details: null,
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'test-model',
  content: [{ type: 'text', text: 'Hello', citations: null }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    speed: null,
    input_tokens: 1,
    output_tokens: 1,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
  },
};

function setup() {
  const calls: MessageCreateParamsNonStreaming[] = [];
  let fail = false;
  const client: LlmClient = {
    messages: {
      stream(params) {
        calls.push(params);
        return {
          on(_event, listener) {
            listener('Hello');
          },
          async finalMessage() {
            await new Promise((resolve) => setTimeout(resolve, 1));
            if (fail) {
              fail = false;
              throw new Error('secret provider error');
            }
            return response;
          },
        };
      },
    },
  };
  const config = loadConfig({
    ANTHROPIC_API_KEY: 'test-key',
    NODE_ENV: 'test',
    API_PREFIX: 'custom',
  });
  const app = createApp(config, client);
  const send = (prompt: string) =>
    app.inject({
      method: 'POST',
      url: '/custom/llm/generate',
      payload: { prompt },
    });
  return {
    app,
    calls,
    send,
    failNext() {
      fail = true;
    },
  };
}

test('health uses the configured prefix', async (t) => {
  const { app } = setup();
  t.after(() => app.close());
  const result = await app.inject('/custom/health');
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), { status: 'ok' });
});

test('returns response text and keeps requests independent', async (t) => {
  const { app, calls, send } = setup();
  t.after(() => app.close());
  const first = await send('First');
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { response: 'Hello' });
  await send('Second');
  assert.deepEqual(calls[1].messages, [{ role: 'user', content: 'Second' }]);
  assert.equal(calls[0].max_tokens, 1024);
  assert.equal(calls[0].system, SYSTEM_PROMPT);
  assert.equal(calls[0].stop_sequences, undefined);

  for (const call of calls) {
    assert.equal(call.messages.at(-1)?.role, 'user');
  }
});

for (const [name, payload] of Object.entries({
  missing: {},
  empty: { prompt: '' },
  whitespace: { prompt: '   ' },
  number: { prompt: 123 },
  extra: { prompt: 'Hello', extra: true },
  long: { prompt: 'a'.repeat(10001) },
})) {
  test(`rejects invalid body: ${name}`, async (t) => {
    const { app, calls } = setup();
    t.after(() => app.close());
    const result = await app.inject({
      method: 'POST',
      url: '/custom/llm/generate',
      payload,
    });
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });
}

test('failed requests do not enter history or block the next request', async (t) => {
  const { app, calls, send, failNext } = setup();
  t.after(() => app.close());
  failNext();
  const failed = await send('Failed');
  assert.equal(failed.statusCode, 502);
  assert.deepEqual(failed.json(), { detail: 'Anthropic request failed' });
  assert.equal((await send('Retry')).statusCode, 200);
  assert.deepEqual(calls[1].messages, [{ role: 'user', content: 'Retry' }]);
});

test('simultaneous requests keep separate user messages', async (t) => {
  const { app, calls, send } = setup();
  t.after(() => app.close());
  await Promise.all([send('One'), send('Two')]);
  assert.deepEqual(
    calls.map((call) => call.messages),
    [[{ role: 'user', content: 'One' }], [{ role: 'user', content: 'Two' }]],
  );
});

for (const invalid of [
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: 'abc' },
  { NODE_ENV: 'invalid' },
  { API_PREFIX: 'a/b' },
  { ANTHROPIC_API_KEY: ' ' },
  { ANTHROPIC_MODEL: '' },
  { ANTHROPIC_GRANDER_MODEL: '   ' },
]) {
  test(`rejects invalid settings: ${Object.keys(invalid)[0]}`, () => {
    assert.throws(() =>
      loadConfig({ ANTHROPIC_API_KEY: 'test-key', ...invalid }),
    );
  });
}
