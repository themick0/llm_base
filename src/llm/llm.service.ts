import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { ANTHROPIC_MAX_TOKENS, SYSTEM_PROMPT } from 'src/llm/constants';

const LlmResponseSchema = z.object({
  agentText: z.string().describe('The generated response'),
});

export interface LlmStream {
  on(event: 'text', listener: (text: string) => void): unknown;
  finalMessage(): Promise<Message>;
}

export interface LlmClient {
  messages: { stream(params: MessageCreateParamsNonStreaming): LlmStream };
}

export class LlmService {
  private readonly messages: MessageParam[] = [];
  private pendingRequest: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: LlmClient,
    private readonly model: string,
    private readonly logger: Pick<FastifyBaseLogger, 'info'>,
  ) {}

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  addAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
  }

  generate(
    prompt: string,
    systemPrompt: string = SYSTEM_PROMPT,
    responseSchema: z.ZodType = LlmResponseSchema,
  ): Promise<{ response: string }> {
    const request = this.pendingRequest.then(() =>
      this.generateWithHistory(prompt, systemPrompt, responseSchema),
    );
    this.pendingRequest = request.catch(() => undefined);

    return request;
  }

  private async generateWithHistory(
    prompt: string,
    systemPrompt: string,
    responseSchema: z.ZodType,
  ): Promise<{ response: string }> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [...this.messages, { role: 'user', content: prompt }],
      output_config: {
        format: zodOutputFormat(responseSchema),
      },
    });

    stream.on('text', (text) => this.logger.info('%s', text));

    const response = await stream.finalMessage();
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // this.addUserMessage(prompt);
    // this.addAssistantMessage(text);

    return { response: text };
  }
}
