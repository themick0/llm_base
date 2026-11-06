import { z } from 'zod';

const MILLISECONDS_PER_MINUTE = 60_000;
const datetimeSchema = z.iso.datetime({ offset: true });

export class TimeService {
  public getCurrentTime(): string {
    return new Date().toISOString();
  }

  public addDurationToDatetime(
    datetime: string,
    durationMinutes: number,
  ): string {
    if (
      !datetimeSchema.safeParse(datetime).success ||
      !Number.isFinite(durationMinutes)
    ) {
      throw new Error(
        'Expected an ISO 8601 datetime with a timezone and a finite duration in minutes.',
      );
    }

    const result = new Date(
      Date.parse(datetime) + durationMinutes * MILLISECONDS_PER_MINUTE,
    );

    if (Number.isNaN(result.getTime())) {
      throw new Error('The resulting datetime is outside the supported range.');
    }

    return result.toISOString();
  }
}
