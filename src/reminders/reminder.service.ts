import { randomUUID } from 'node:crypto';

const maxTimerDelay = 2_147_483_647;

export interface ReminderInput {
  message: string;
  remindAt: string;
}

export interface Reminder {
  id: string;
  message: string;
  remindAt: string;
}

export class ReminderService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(private readonly onReminder: (reminder: Reminder) => void) {}

  setReminder(input: ReminderInput): Reminder {
    if (this.closed) {
      throw new Error('The reminder service is closed.');
    }

    if (Date.parse(input.remindAt) <= Date.now()) {
      throw new Error('The reminder time must be in the future.');
    }

    const reminder: Reminder = {
      id: randomUUID(),
      message: input.message,
      remindAt: new Date(input.remindAt).toISOString(),
    };

    this.schedule(reminder);

    return reminder;
  }

  close(): void {
    this.closed = true;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }

  private schedule(reminder: Reminder): void {
    const remaining = Date.parse(reminder.remindAt) - Date.now();
    const timer = setTimeout(
      () => {
        if (Date.parse(reminder.remindAt) > Date.now()) {
          this.schedule(reminder);
          return;
        }

        this.timers.delete(reminder.id);
        this.onReminder(reminder);
      },
      Math.min(Math.max(remaining, 1), maxTimerDelay),
    );

    timer.unref();
    this.timers.set(reminder.id, timer);
  }
}
