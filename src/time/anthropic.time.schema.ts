import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const getCurrentTimeTool = {
  name: 'getCurrentTime',
  description:
    'Get the current date and time in UTC as an ISO 8601 string. Takes no arguments. This does not provide appointment availability or the barbershop local timezone.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
} satisfies Tool;

export const addDurationToDatetimeTool = {
  name: 'add_duration_to_datetime',
  description:
    'Add a duration in minutes to an ISO 8601 datetime with an explicit timezone (Z or UTC offset). Returns an ISO 8601 datetime in UTC. Negative durations subtract time. This adds elapsed time, not calendar time, and does not check appointment availability.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      datetime: {
        type: 'string',
        description:
          'ISO 8601 datetime with a timezone, for example 2026-11-06T10:00:00+03:00.',
      },
      duration_minutes: {
        type: 'number',
        description:
          'Duration in minutes to add; may be fractional or negative.',
      },
    },
    required: ['datetime', 'duration_minutes'],
    additionalProperties: false,
  },
} satisfies Tool;
