import { createTool } from 'src/llm/create-tool';
import type { LocalToolDefinition } from 'src/llm/tool-definition';
import {
  addDurationToDatetimeSchema,
  getCurrentTimeSchema,
} from 'src/time/time-tools.schema';
import type { TimeService } from 'src/time/time.service';

export function createTimeTools(
  timeService: TimeService,
): LocalToolDefinition[] {
  return [
    createTool(getCurrentTimeSchema, () => timeService.getCurrentTime()),
    createTool(addDurationToDatetimeSchema, (input) =>
      timeService.addDurationToDatetime(input.datetime, input.durationMinutes),
    ),
  ];
}
