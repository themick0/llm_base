import { webSearchSchema } from 'src/web-search/web-search-tools.schema';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import { LlmService } from 'src/llm/llm.service';
import { MAX_TOOL_ROUNDS } from 'src/llm/constants';

import { createTimeTools } from 'src/time/time-tools';
import type { ToolDefinition } from 'src/llm/tool-definition';
import { TimeService } from 'src/time/time.service';
import { parsedResponse } from './fixtures/anthropic';

const [getCurrentTimeTool, addDurationToDatetimeTool] = createTimeTools(
  new TimeService(),
).map((tool) => tool.schema);

const timestamp = '2026-11-01T12:00:00.000Z';

function toolResponse(
  name = 'getCurrentTime',
  input: unknown = {},
): Awaited<ReturnType<MessageStream['finalMessage']>> {
  return {
    ...parsedResponse,
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tool_time_1',
        name,
        input,
        caller: { type: 'direct' },
      },
    ],
  };
}

function setup(
  responses: Array<Awaited<ReturnType<MessageStream['finalMessage']>> | Error>,
  enableTool = true,
  tools?: ToolDefinition[],
) {
  const client = new Anthropic({ apiKey: 'test-key' });
  const timeService = new TimeService();
  const clock = mock.method(timeService, 'getCurrentTime', () => timestamp);
  const calls: Parameters<Anthropic['messages']['stream']>[0][] = [];

  mock.method(
    client.messages,
    'stream',
    (params: Parameters<Anthropic['messages']['stream']>[0]) => {
      const stream = new MessageStream(null);
      const response = responses[calls.length];

      calls.push(params);

      mock.method(stream, 'finalMessage', async () => {
        if (response instanceof Error) {
          throw response;
        }

        assert.ok(response, 'Unexpected additional API request');

        return response;
      });

      return stream;
    },
  );

  const service = new LlmService(
    client,
    'test-model',
    { info() {} },
    tools ?? (enableTool ? createTimeTools(timeService) : []),
  );

  return { service, calls, clock };
}

test('executes getCurrentTime and sends the matching tool result before the final answer', async () => {
  const tool = toolResponse();
  const { service, calls, clock } = setup([
    tool,
    parsedResponse,
    parsedResponse,
  ]);
  const result = await service.generate('What is the current UTC time?');

  assert.deepEqual(result, { response: 'Hello' });
  assert.deepEqual(calls[0].tools, [
    getCurrentTimeTool,
    addDurationToDatetimeTool,
  ]);
  assert.equal(getCurrentTimeTool.strict, true);
  assert.equal(clock.mock.callCount(), 1);
  assert.deepEqual(calls[1].messages, [
    { role: 'user', content: 'What is the current UTC time?' },
    { role: 'assistant', content: tool.content },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tool_time_1', content: timestamp },
      ],
    },
  ]);

  await service.generate('Follow up');

  assert.deepEqual(calls[2].messages.slice(0, 3), calls[1].messages);
  assert.deepEqual(calls[2].messages[3], {
    role: 'assistant',
    content: parsedResponse.content,
  });
  assert.equal(calls[0].messages.length, 1);
});

test('preserves all final content blocks in history while returning only text', async () => {
  const finalMessage: Awaited<ReturnType<MessageStream['finalMessage']>> = {
    ...parsedResponse,
    content: [
      {
        type: 'thinking',
        thinking: 'Test reasoning',
        signature: 'test-signature',
      },
      ...parsedResponse.content,
      { ...parsedResponse.content[0], text: 'Second text block' },
    ],
  };
  const { service, calls } = setup([finalMessage, parsedResponse], false);

  const result = await service.generate('First request');

  assert.deepEqual(result, { response: 'Hello\nSecond text block' });

  await service.generate('Follow up');

  assert.deepEqual(calls[1].messages, [
    { role: 'user', content: 'First request' },
    { role: 'assistant', content: finalMessage.content },
    { role: 'user', content: 'Follow up' },
  ]);
});

for (const [name, input] of [
  ['unknownTool', {}],
  ['getCurrentTime', { timezone: 'UTC' }],
] as const) {
  test(`returns a tool error for ${name} with ${JSON.stringify(input)}`, async () => {
    const { service, calls, clock } = setup([
      toolResponse(name, input),
      parsedResponse,
    ]);

    await service.generate('Time?');

    assert.equal(clock.mock.callCount(), 0);
    assert.deepEqual(calls[1].messages.at(-1), {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_time_1',
          content:
            name === 'unknownTool'
              ? 'Unknown or unavailable tool.'
              : 'Invalid arguments for getCurrentTime.',
          is_error: true,
        },
      ],
    });
  });
}

test('failed tool turns do not pollute conversation history', async () => {
  const { service, calls } = setup([
    toolResponse(),
    new Error('Provider failed'),
    parsedResponse,
  ]);

  await assert.rejects(service.generate('Time?'), /Provider failed/);
  await service.generate('Retry');

  assert.deepEqual(calls[2].messages, [{ role: 'user', content: 'Retry' }]);
});

test('bounds repeated tool calls', async () => {
  const responses = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, () =>
    toolResponse(),
  );
  const { service, calls, clock } = setup(responses);

  await assert.rejects(
    service.generate('Time?'),
    /Maximum tool call rounds exceeded/,
  );

  assert.equal(calls.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(clock.mock.callCount(), MAX_TOOL_ROUNDS);
});

test('services without configured tools do not advertise tools', async () => {
  const { service, calls } = setup([parsedResponse], false);

  await service.generate('Evaluate this answer');

  assert.equal(calls[0].tools, undefined);
});

test('TimeService returns the current instant in ISO UTC format', () => {
  const service = new TimeService();
  const before = Date.now();
  const actual = service.getCurrentTime();
  const after = Date.now();

  assert.equal(new Date(actual).toISOString(), actual);
  assert.ok(Date.parse(actual) >= before && Date.parse(actual) <= after);
});

test('adds elapsed minutes across dates and normalizes timezone offsets', () => {
  const service = new TimeService();

  assert.equal(
    service.addDurationToDatetime('2026-12-31T23:45:00-02:00', 30),
    '2027-01-01T02:15:00.000Z',
  );
  assert.equal(
    service.addDurationToDatetime('2026-03-01T00:00:00Z', -0.5),
    '2026-02-28T23:59:30.000Z',
  );
  assert.throws(() =>
    service.addDurationToDatetime('2026-02-30T12:00:00Z', 10),
  );
  assert.throws(() => service.addDurationToDatetime('2026-11-06T12:00:00', 10));
  assert.throws(() => service.addDurationToDatetime(timestamp, Infinity));
  assert.throws(() =>
    service.addDurationToDatetime(timestamp, Number.MAX_VALUE),
  );
});

test('executes addDurationToDatetime and returns its result to the model', async () => {
  const { service, calls } = setup([
    toolResponse('addDurationToDatetime', {
      datetime: '2026-11-06T10:00:00+03:00',
      durationMinutes: 90,
    }),
    parsedResponse,
  ]);

  await service.generate('Add 90 minutes to the appointment time');

  assert.deepEqual(calls[1].messages.at(-1), {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool_time_1',
        content: '2026-11-06T08:30:00.000Z',
      },
    ],
  });
});

for (const input of [
  { datetime: timestamp },
  { datetime: timestamp, durationMinutes: '30' },
  { datetime: timestamp, durationMinutes: 30, extra: true },
  { datetime: 'invalid', durationMinutes: 30 },
  { datetime: timestamp, durationMinutes: Number.MAX_VALUE },
]) {
  test(`returns a tool error for invalid duration input ${JSON.stringify(input)}`, async () => {
    const { service, calls } = setup([
      toolResponse('addDurationToDatetime', input),
      parsedResponse,
    ]);

    await service.generate('Add duration');

    const content = calls[1].messages.at(-1)?.content;

    assert.ok(Array.isArray(content));
    const result = content[0];

    assert.equal(result.type, 'tool_result');
    if (result.type === 'tool_result') {
      assert.equal(result.is_error, true);
      assert.equal(result.tool_use_id, 'tool_time_1');
    }
  });
}

test('dispatches an unrelated async tool and preserves structured content and call IDs', async () => {
  const content = [{ type: 'text' as const, text: '{"available":false}' }];
  const inputs: unknown[] = [];
  const tool: ToolDefinition = {
    execution: 'local',
    schema: {
      name: 'checkAvailability',
      description: 'Check availability for a date.',
      input_schema: { type: 'object' },
    },
    async execute(input) {
      await Promise.resolve();
      inputs.push(input);

      return content;
    },
  };
  const response = toolResponse('checkAvailability', { date: '2027-01-15' });
  const secondCall = {
    type: 'tool_use' as const,
    id: 'second_call',
    name: 'checkAvailability',
    input: { date: '2027-01-16' },
    caller: { type: 'direct' as const },
  };
  response.content.push(secondCall);
  const { service, calls, clock } = setup([response, parsedResponse], false, [
    tool,
  ]);

  await service.generate('Check two dates');

  assert.deepEqual(calls[0].tools, [tool.schema]);
  assert.deepEqual(inputs, [{ date: '2027-01-15' }, { date: '2027-01-16' }]);
  assert.equal(clock.mock.callCount(), 0);
  assert.deepEqual(calls[1].messages.at(-1)?.content, [
    { type: 'tool_result', tool_use_id: 'tool_time_1', content },
    { type: 'tool_result', tool_use_id: 'second_call', content },
  ]);
});

for (const asynchronous of [false, true]) {
  test(`converts ${asynchronous ? 'async' : 'sync'} handler failures to tool errors`, async () => {
    const fail = () => {
      throw new Error('Lookup failed');
    };
    const tool: ToolDefinition = {
      execution: 'local',
      schema: { name: 'lookup', input_schema: { type: 'object' } },
      execute: asynchronous ? async () => fail() : fail,
    };
    const { service, calls } = setup(
      [toolResponse('lookup'), parsedResponse],
      false,
      [tool],
    );

    await service.generate('Look up a record');

    assert.deepEqual(calls[1].messages.at(-1)?.content, [
      {
        type: 'tool_result',
        tool_use_id: 'tool_time_1',
        content: 'Lookup failed',
        is_error: true,
      },
    ]);
  });
}

test('rejects duplicate tool registrations', () => {
  const tool: ToolDefinition = {
    execution: 'local',
    schema: { name: 'lookup', input_schema: { type: 'object' } },
    execute: () => 'Found',
  };

  assert.throws(
    () => setup([], false, [tool, tool]),
    /Duplicate tool name: lookup/,
  );
});

test('does not execute a time tool that is not registered', async () => {
  const { service, calls, clock } = setup(
    [toolResponse(), parsedResponse],
    false,
  );

  await service.generate('Time?');

  assert.equal(clock.mock.callCount(), 0);
  assert.deepEqual(calls[1].messages.at(-1)?.content, [
    {
      type: 'tool_result',
      tool_use_id: 'tool_time_1',
      content: 'Unknown or unavailable tool.',
      is_error: true,
    },
  ]);
});

test('resumes server search turns, preserves citations, and never dispatches search locally', async () => {
  const paused: Awaited<ReturnType<MessageStream['finalMessage']>> = {
    ...parsedResponse,
    stop_reason: 'pause_turn',
    content: [
      {
        type: 'server_tool_use',
        id: 'search_1',
        name: 'web_search',
        input: { query: 'history of barbershops' },
        caller: { type: 'direct' },
      },
    ],
  };
  const answer: Awaited<ReturnType<MessageStream['finalMessage']>> = {
    ...parsedResponse,
    content: [
      {
        type: 'text',
        text: 'Barbershops have a long history.',
        parsed_output: null,
        citations: [
          {
            type: 'web_search_result_location',
            url: 'https://en.wikipedia.org/wiki/Barber',
            title: 'Barber',
            cited_text: 'History of barbers',
            encrypted_index: 'test',
          },
        ],
      },
    ],
  };
  const { service, calls, clock } = setup(
    [paused, answer, parsedResponse],
    false,
    [{ execution: 'server', schema: webSearchSchema }],
  );

  const result = await service.generate('Tell me about barbershops');

  assert.deepEqual(calls[0].tools, [webSearchSchema]);
  assert.equal(calls[0].output_config, undefined);
  assert.deepEqual(calls[1].messages.at(-1), {
    role: 'assistant',
    content: paused.content,
  });
  assert.match(result.response, /https:\/\/en.wikipedia.org\/wiki\/Barber/);
  assert.equal(clock.mock.callCount(), 0);
  await service.generate('Follow up');
  assert.deepEqual(calls[2].messages[2], {
    role: 'assistant',
    content: answer.content,
  });
});

test('bounds repeated server pause turns', async () => {
  const paused = { ...parsedResponse, stop_reason: 'pause_turn' as const };
  const { service, calls } = setup(
    Array.from({ length: MAX_TOOL_ROUNDS + 1 }, () => paused),
    false,
    [{ execution: 'server', schema: webSearchSchema }],
  );

  await assert.rejects(
    service.generate('Search'),
    /Maximum tool call rounds exceeded/,
  );
  assert.equal(calls.length, MAX_TOOL_ROUNDS + 1);
});

test('advertises mixed tools together and only executes local handlers', async () => {
  let executions = 0;
  const localTool: ToolDefinition = {
    execution: 'local',
    schema: { name: 'lookup', input_schema: { type: 'object' } },
    execute: () => {
      executions += 1;
      return 'Found';
    },
  };
  const { service, calls } = setup(
    [
      toolResponse('lookup'),
      parsedResponse,
      toolResponse('web_search'),
      parsedResponse,
    ],
    false,
    [localTool, { execution: 'server', schema: webSearchSchema }],
  );

  await service.generate('Look up a record');
  await service.generate('Search');

  assert.deepEqual(calls[0].tools, [localTool.schema, webSearchSchema]);
  assert.equal(executions, 1);
  assert.deepEqual(calls[3].messages.at(-1)?.content, [
    {
      type: 'tool_result',
      tool_use_id: 'tool_time_1',
      content: 'Unknown or unavailable tool.',
      is_error: true,
    },
  ]);
});

test('rejects name collisions between local and server tools', () => {
  assert.throws(
    () =>
      setup([], false, [
        {
          execution: 'local',
          schema: { name: 'web_search', input_schema: { type: 'object' } },
          execute: () => 'Unexpected',
        },
        { execution: 'server', schema: webSearchSchema },
      ]),
    /Duplicate tool name: web_search/,
  );
});
