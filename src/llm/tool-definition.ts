import type {
  Tool,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

export interface ToolDefinition {
  schema: Tool;
  execute(
    input: unknown,
  ): ToolResultBlockParam['content'] | Promise<ToolResultBlockParam['content']>;
}
