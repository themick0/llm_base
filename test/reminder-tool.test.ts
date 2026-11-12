import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReminderService, type Reminder } from 'src/reminders/reminder.service';
import { createReminderTools } from 'src/reminders/reminder-tools';

const now = Date.parse('2027-01-01T00:00:00Z');

test('schedules a reminder through the tool and delivers it exactly once', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const delivered: Reminder[] = [];
  const service = new ReminderService((reminder) => delivered.push(reminder));
  t.after(() => service.close());
  const [tool] = createReminderTools(service);
  const result = JSON.parse(
    tool.execute({
      message: '  Call the barbershop  ',
      remindAt: '2027-01-01T03:01:00+03:00',
    }) as string,
  );

  assert.equal(result.status, 'scheduled');
  assert.equal(result.remindAt, '2027-01-01T00:01:00.000Z');
  assert.equal(result.message, 'Call the barbershop');
  assert.equal(result.delivery, 'serverConsole');
  assert.ok(result.id);
  t.mock.timers.tick(59_999);
  assert.equal(delivered.length, 0);
  t.mock.timers.tick(1);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].id, result.id);
  t.mock.timers.tick(60_000);
  assert.equal(delivered.length, 1);
});

test('rejects invalid reminders without scheduling delivery', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const delivered: Reminder[] = [];
  const service = new ReminderService((reminder) => delivered.push(reminder));
  t.after(() => service.close());

  for (const input of [
    {},
    { message: ' ', remindAt: '2027-01-02T00:00:00Z' },
    { message: 'x'.repeat(1001), remindAt: '2027-01-02T00:00:00Z' },
    { message: 'Call', remindAt: '2027-01-02T00:00:00' },
    { message: 'Call', remindAt: '2027-02-30T00:00:00Z' },
    { message: 'Call', remindAt: '2027-01-01T00:00:00Z' },
    { message: 'Call', remindAt: '2026-01-01T00:00:00Z' },
    { message: 'Call', remindAt: '2027-01-02T00:00:00Z', extra: true },
  ]) {
    assert.throws(() => createReminderTools(service)[0].execute(input));
  }

  t.mock.timers.tick(86_400_000);
  assert.equal(delivered.length, 0);
});

test('handles reminders beyond the Node timer limit and cancels timers on close', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const delivered: Reminder[] = [];
  const service = new ReminderService((reminder) => delivered.push(reminder));
  t.after(() => service.close());
  const delay = 2_147_483_647 + 60_000;

  service.setReminder({
    message: 'Call',
    remindAt: new Date(now + delay).toISOString(),
  });
  t.mock.timers.tick(2_147_483_647);
  assert.equal(delivered.length, 0);
  t.mock.timers.tick(60_000);
  assert.equal(delivered.length, 1);
  service.setReminder({
    message: 'Cancel on close',
    remindAt: new Date(Date.now() + 60_000).toISOString(),
  });
  service.close();
  t.mock.timers.tick(60_000);
  assert.equal(delivered.length, 1);
  assert.throws(
    () =>
      service.setReminder({
        message: 'Call',
        remindAt: '2028-01-01T00:00:00Z',
      }),
    /closed/,
  );
});
