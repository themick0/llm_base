import { z } from 'zod';
import type { ToolSchema } from 'src/llm/create-tool';

export const setReminderSchema = {
  name: 'setReminder',
  description:
    'Schedule a one-time reminder in the server console. Use only when the customer requests a barbershop-related reminder. Takes message and remindAt (a future ISO 8601 datetime with Z or an explicit UTC offset). Reminders are stored in memory and lost on server restart. This does not send a chat, SMS, email, or push notification and does not create a booking.',
  inputSchema: z.strictObject({
    message: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .describe('Reminder text, from 1 to 1000 non-whitespace characters.'),
    remindAt: z.iso
      .datetime({ offset: true })
      .describe(
        'Future ISO 8601 datetime with timezone, for example 2027-01-15T09:30:00+03:00.',
      ),
  }),
} satisfies ToolSchema<z.ZodObject>;
