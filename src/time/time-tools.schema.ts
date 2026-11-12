import { z } from 'zod';
import type { ToolSchema } from 'src/llm/create-tool';

export const getCurrentTimeSchema = {
  name: 'getCurrentTime',
  description:
    'Get the current date and time in UTC as an ISO 8601 string. Takes no arguments. This does not provide appointment availability or the barbershop local timezone.',
  inputSchema: z.strictObject({}),
} satisfies ToolSchema<z.ZodObject>;

export const addDurationToDatetimeSchema = {
  name: 'addDurationToDatetime',
  description:
    'Add a duration in minutes to an ISO 8601 datetime with an explicit timezone (Z or UTC offset). Returns an ISO 8601 datetime in UTC. Negative durations subtract time. This adds elapsed time, not calendar time, and does not check appointment availability.',
  inputSchema: z.strictObject({
    datetime: z.iso
      .datetime({ offset: true })
      .describe(
        'ISO 8601 datetime with a timezone, for example 2026-11-06T10:00:00+03:00.',
      ),
    durationMinutes: z
      .number()
      .describe('Duration in minutes to add; may be fractional or negative.'),
  }),
} satisfies ToolSchema<z.ZodObject>;
