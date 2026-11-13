import type {
  Tool,
  ToolUnion,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

export type ToolHandler = (
  input: unknown,
) => ToolResultBlockParam['content'] | Promise<ToolResultBlockParam['content']>;

export interface LocalToolDefinition {
  execution: 'local';
  schema: Tool;
  execute: ToolHandler;
}

export interface ServerToolDefinition {
  execution: 'server';
  schema: Exclude<Extract<ToolUnion, { name: string }>, Tool>;
  execute?: never;
}

export type ToolDefinition = LocalToolDefinition | ServerToolDefinition;
