import type { Message } from '@anthropic-ai/sdk/resources/messages';

export const response: Message = {
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

export const parsedResponse = {
  ...response,
  content: [
    {
      type: 'text' as const,
      text: 'Hello',
      citations: null,
      parsed_output: null,
    },
  ],
  parsed_output: null,
};
