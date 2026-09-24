export interface CalendarEventInput {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  url?: string;
  uid?: string;
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toUtcStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcs(event: CalendarEventInput) {
  const uid = event.uid || `profox-${crypto.randomUUID()}@profoxwebdesigner.com`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProFox//Native Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(event.startAt)}`,
    `DTEND:${toUtcStamp(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description || '')}`,
    `LOCATION:${escapeIcs(event.location || 'Online')}`,
    ...(event.url ? [`URL:${escapeIcs(event.url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

export function downloadIcs(event: CalendarEventInput, filename = 'profox-meeting.ics') {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
