const DAY_NAMES = new Map([
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6]
]);

const WEEKDAYS = [1, 2, 3, 4, 5];

export function parseNaturalRecurrence(input) {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const timeMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const time = timeMatch ? normalizeTime(timeMatch[1], timeMatch[2], timeMatch[3]) : '09:00';

  if (/every\s+(day|daily)/.test(text)) {
    return { frequency: 'daily', time, daysOfWeek: [] };
  }

  if (/every\s+weekday/.test(text)) {
    return { frequency: 'weekdays', time, daysOfWeek: WEEKDAYS };
  }

  for (const [name, value] of DAY_NAMES) {
    if (text.includes(`every ${name}`)) {
      return { frequency: 'weekly', time, daysOfWeek: [value] };
    }
  }

  return null;
}

export function shouldOccurOnDate(rule, dateString) {
  const day = dayOfWeek(dateString);

  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekdays') return WEEKDAYS.includes(day);
  if (rule.frequency === 'weekly') return normalizeDays(rule.daysOfWeek).includes(day);
  if (rule.frequency === 'monthly') {
    const date = new Date(`${dateString}T00:00:00`);
    return date.getDate() === Number(rule.dayOfMonth || 1);
  }

  return false;
}

export function buildOccurrencesForDate(rules, dateString, existingTasks) {
  return rules
    .filter((rule) => shouldOccurOnDate(rule, dateString))
    .filter((rule) => !existingTasks.some((task) => Number(task.recurringRuleId) === Number(rule.id) && task.scheduledDate === dateString))
    .map((rule) => ({
      recurringRuleId: rule.id,
      title: rule.title,
      helper: rule.helper || '',
      scheduledDate: dateString,
      scheduledTime: rule.time,
      reminderAt: `${dateString}T${rule.time}:00`
    }));
}

export function normalizeDays(days) {
  if (Array.isArray(days)) return days.map(Number);
  if (typeof days === 'string' && days.trim()) {
    return days.split(',').map((day) => Number(day.trim())).filter((day) => Number.isInteger(day));
  }
  return [];
}

export function normalizeTime(hour, minute = '00', meridiem = '') {
  let parsedHour = Number(hour);
  const parsedMinute = Number(minute || '00');
  const ampm = meridiem?.toLowerCase();

  if (ampm === 'pm' && parsedHour < 12) parsedHour += 12;
  if (ampm === 'am' && parsedHour === 12) parsedHour = 0;

  return `${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
}

function dayOfWeek(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}
