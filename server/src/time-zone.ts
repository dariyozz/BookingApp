import { formatInTimeZone } from 'date-fns-tz';

export const SCHEDULING_TIME_ZONE = 'Europe/Skopje';

export function parseSkopjeLocal(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new RangeError('Enter a valid date and time in Europe/Skopje.');
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const localWallTime = Date.UTC(year, month - 1, day, hour, minute);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() + 1 !== month ||
    normalizedDate.getUTCDate() !== day
  ) {
    throw new RangeError('Enter a valid calendar date.');
  }

  const possibleOffsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    possibleOffsets.add(getOffsetMilliseconds(new Date(localWallTime + hours * 60 * 60 * 1000)));
  }

  const candidates = [...possibleOffsets]
    .map((offset) => new Date(localWallTime - offset))
    .filter(
      (candidate) =>
        formatInTimeZone(candidate, SCHEDULING_TIME_ZONE, 'yyyy-MM-dd HH:mm') === `${date} ${time}`,
    );

  if (candidates.length === 0) {
    throw new RangeError('That local time does not exist in Europe/Skopje because of a daylight-saving change.');
  }
  if (candidates.length > 1) {
    throw new RangeError('That local time is ambiguous in Europe/Skopje because of a daylight-saving change.');
  }

  return candidates[0];
}

function getOffsetMilliseconds(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const renderedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return renderedAsUtc - instant.getTime();
}
