import { barbershopSystemPrompt } from 'src/prompts/barbershop-prompts';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  ToolUnion,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import type { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import { ANTHROPIC_MAX_TOKENS, MAX_TOOL_ROUNDS } from 'src/llm/constants';
import { textFromMessage } from 'src/llm/utils/text-from-message';
import type { ToolDefinition } from 'src/llm/tool-definition';

export class LlmService {
  private readonly messages: MessageParam[] = [];
  private pendingRequest: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly logger: Pick<FastifyBaseLogger, 'info'>,
    private readonly tools: readonly ToolDefinition[] = [],
    private readonly serverTools: readonly (ToolUnion & {
      name: string;
    })[] = [],
  ) {
    const names = new Set<string>();

    for (const schema of [
      ...tools.map((tool) => tool.schema),
      ...serverTools,
    ]) {
      if (names.has(schema.name)) {
        throw new Error(`Duplicate tool name: ${schema.name}`);
      }

      names.add(schema.name);
    }
  }

  generate(
    prompt: string,
    systemPrompt: string = barbershopSystemPrompt,
    responseSchema?: z.ZodType,
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
    responseSchema: z.ZodType | undefined,
  ): Promise<{ response: string }> {
    const turnMessages: MessageParam[] = [{ role: 'user', content: prompt }];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.requestMessage(
        [...this.messages, ...turnMessages],
        systemPrompt,
        responseSchema,
      );

      if (response.stop_reason === 'pause_turn') {
        if (round === MAX_TOOL_ROUNDS) {
          throw new Error('Maximum tool call rounds exceeded');
        }

        turnMessages.push({ role: 'assistant', content: response.content });
        continue;
      }

      if (response.stop_reason === 'tool_use') {
        if (round === MAX_TOOL_ROUNDS) {
          throw new Error('Maximum tool call rounds exceeded');
        }

        const toolCalls = response.content.filter(
          (block) => block.type === 'tool_use',
        );

        if (toolCalls.length === 0) {
          throw new Error('Tool-use response contains no tool calls');
        }

        const toolResults: ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          toolResults.push(await this.executeTool(toolCall));
        }

        turnMessages.push({ role: 'assistant', content: response.content });
        turnMessages.push({ role: 'user', content: toolResults });

        continue;
      }

      const text = textFromMessage(response);

      turnMessages.push({ role: 'assistant', content: response.content });
      this.messages.push(...turnMessages);

      return { response: text };
    }

    throw new Error('Maximum tool call rounds exceeded');
  }

  private async requestMessage(
    messages: MessageParam[],
    systemPrompt: string,
    responseSchema: z.ZodType | undefined,
  ): Promise<Message> {
    const tools = [
      ...this.tools.map((tool) => tool.schema),
      ...this.serverTools,
    ];

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages,
      tools: tools.length ? tools : undefined,
      output_config: responseSchema
        ? { format: zodOutputFormat(responseSchema) }
        : undefined,
    });

    stream.on('text', (text) => this.logger.info('%s', text));

    return stream.finalMessage();
  }

  private async executeTool(
    toolCall: ToolUseBlock,
  ): Promise<ToolResultBlockParam> {
    const tool = this.tools.find(
      (candidate) => candidate.schema.name === toolCall.name,
    );
    const result: ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: toolCall.id,
    };

    if (!tool) {
      return {
        ...result,
        content: 'Unknown or unavailable tool.',
        is_error: true,
      };
    }

    try {
      return { ...result, content: await tool.execute(toolCall.input) };
    } catch (error) {
      return {
        ...result,
        content:
          error instanceof Error ? error.message : 'Tool execution failed.',
        is_error: true,
      };
    }
  }
}
