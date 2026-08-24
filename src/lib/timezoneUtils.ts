export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function zonedLocalToIso(localValue: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid timezone: ${timeZone}`);
  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Choose a valid date and time.');
  const [, year, month, day, hour, minute] = match;
  const desiredUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

  const adjust = (candidate: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(candidate));
    const values: Record<string, string> = {};
    for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
    const renderedUtc = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second)
    );
    return desiredUtc - (renderedUtc - candidate);
  };

  let result = adjust(desiredUtc);
  result = adjust(result);
  return new Date(result).toISOString();
}

export function formatInTimeZone(iso: string, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options
  }).format(new Date(iso));
}
