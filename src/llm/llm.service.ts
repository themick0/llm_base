import type Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { FastifyBaseLogger } from 'fastify';
import {
  ANTHROPIC_MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  SYSTEM_PROMPT,
} from 'src/llm/constants';
import { textFromMessage } from 'src/llm/utils/text-from-message';
import {
  addDurationToDatetimeTool,
  getCurrentTimeTool,
} from 'src/time/anthropic.time.schema';
import { TimeService } from 'src/time/time.service';

const LlmResponseSchema = z.object({
  agentText: z.string().describe('The generated response'),
});

export class LlmService {
  private readonly messages: MessageParam[] = [];
  private pendingRequest: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly logger: Pick<FastifyBaseLogger, 'info'>,
    private readonly timeService?: TimeService,
    private readonly tools?: Tool[],
  ) {}

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
    const turnMessages: MessageParam[] = [{ role: 'user', content: prompt }];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.requestMessage(
        [...this.messages, ...turnMessages],
        systemPrompt,
        responseSchema,
      );

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

        const toolResults = toolCalls.map((toolCall) =>
          this.executeTool(toolCall),
        );

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
    responseSchema: z.ZodType,
    tools: Tool[] | undefined = this.tools,
  ): Promise<Message> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages,
      tools,
      output_config: {
        format: zodOutputFormat(responseSchema),
      },
    });

    stream.on('text', (text) => this.logger.info('%s', text));

    return stream.finalMessage();
  }

  private executeTool(toolCall: ToolUseBlock): ToolResultBlockParam {
    if (toolCall.name === addDurationToDatetimeTool.name && this.timeService) {
      const input = z
        .object({
          datetime: z.string(),
          duration_minutes: z.number(),
        })
        .strict()
        .safeParse(toolCall.input);

      if (!input.success) {
        return {
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content:
            'add_duration_to_datetime expects datetime and duration_minutes, with no extra arguments.',
          is_error: true,
        };
      }

      try {
        return {
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: this.timeService.addDurationToDatetime(
            input.data.datetime,
            input.data.duration_minutes,
          ),
        };
      } catch (error) {
        return {
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content:
            error instanceof Error
              ? error.message
              : 'Unable to add duration to datetime.',
          is_error: true,
        };
      }
    }

    if (toolCall.name !== getCurrentTimeTool.name || !this.timeService) {
      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: 'Unknown or unavailable tool.',
        is_error: true,
      };
    }

    const input = z.object({}).strict().safeParse(toolCall.input);

    if (!input.success) {
      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: 'getCurrentTime expects an empty object with no arguments.',
        is_error: true,
      };
    }

    return {
      type: 'tool_result',
      tool_use_id: toolCall.id,
      content: this.timeService.getCurrentTime(),
    };
  }
}
