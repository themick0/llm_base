import { createTool } from 'src/llm/create-tool';
import type { LocalToolDefinition } from 'src/llm/tool-definition';
import { setReminderSchema } from 'src/reminders/reminder-tools.schema';
import type { ReminderService } from 'src/reminders/reminder.service';

export function createReminderTools(
  service: ReminderService,
): LocalToolDefinition[] {
  return [
    createTool(setReminderSchema, (input) => {
      const reminder = service.setReminder(input);

      return JSON.stringify({
        ...reminder,
        status: 'scheduled',
        delivery: 'serverConsole',
        persistence: 'untilServerRestart',
      });
    }),
  ];
}
