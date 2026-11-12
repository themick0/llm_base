import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import { createApp } from 'src/app';
import { loadConfig } from 'src/config';
import { parsedResponse } from './fixtures/anthropic';
import { barbershopSystemPrompt } from 'src/prompts/barbershop-prompts';

function setup() {
  const calls: Parameters<Anthropic['messages']['stream']>[0][] = [];
  let fail = false;
  const client = new Anthropic({ apiKey: 'test-key' });

  mock.method(
    client.messages,
    'stream',
    (params: Parameters<Anthropic['messages']['stream']>[0]) => {
      const stream = new MessageStream(null);

      calls.push(params);

      mock.method(stream, 'finalMessage', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));

        if (fail) {
          fail = false;
          throw new Error('secret provider error');
        }

        return parsedResponse;
      });

      return stream;
    },
  );
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

test('returns response text and includes conversation history', async (t) => {
  const { app, calls, send } = setup();
  t.after(() => app.close());
  const first = await send('First');
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { response: 'Hello' });
  await send('Second');
  assert.deepEqual(calls[1].messages, [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: parsedResponse.content },
    { role: 'user', content: 'Second' },
  ]);
  assert.equal(calls[0].max_tokens, 1024);
  assert.equal(calls[0].system, barbershopSystemPrompt);
  assert.equal(calls[0].stop_sequences, undefined);
  assert.equal(calls[0].output_config, undefined);
  const search = calls[0].tools?.find(
    (tool) => 'name' in tool && tool.name === 'web_search',
  );
  assert.ok(search && 'allowed_domains' in search);
  assert.deepEqual(search.allowed_domains, ['wikipedia.org']);
  assert.ok(
    calls[0].tools?.some(
      (tool) => 'name' in tool && tool.name === 'setReminder',
    ),
  );

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

test('simultaneous requests use sequential conversation history', async (t) => {
  const { app, calls, send } = setup();
  t.after(() => app.close());
  await Promise.all([send('One'), send('Two')]);
  assert.deepEqual(
    calls.map((call) => call.messages),
    [
      [{ role: 'user', content: 'One' }],
      [
        { role: 'user', content: 'One' },
        { role: 'assistant', content: parsedResponse.content },
        { role: 'user', content: 'Two' },
      ],
    ],
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

test('serves the chat page with the configured API endpoint without calling the model', async (t) => {
  const { app, calls } = setup();
  t.after(() => app.close());

  const result = await app.inject('/');

  assert.equal(result.statusCode, 200);
  assert.match(result.headers['content-type'] ?? '', /text\/html/);
  assert.ok(result.body.includes('/custom/llm/generate'));
  assert.equal(calls.length, 0);
});
