import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { LocalToolDefinition } from 'src/llm/tool-definition';

export interface ToolSchema<Input extends z.ZodObject> {
  name: string;
  description: string;
  inputSchema: Input;
}

export function createTool<Input extends z.ZodObject>(
  definition: ToolSchema<Input>,
  execute: (
    input: z.output<Input>,
  ) => ReturnType<LocalToolDefinition['execute']>,
): LocalToolDefinition {
  return {
    execution: 'local',
    schema: {
      name: definition.name,
      description: definition.description,
      strict: true,
      input_schema: {
        ...zodOutputFormat(definition.inputSchema).schema,
        type: 'object',
      },
    },
    execute(input) {
      const parsed = definition.inputSchema.safeParse(input);

      if (!parsed.success) {
        throw new Error(`Invalid arguments for ${definition.name}.`);
      }

      return execute(parsed.data);
    },
  };
}
