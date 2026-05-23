import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOccurrencesForDate,
  parseNaturalRecurrence,
  shouldOccurOnDate
} from '../recurrence.js';

describe('parseNaturalRecurrence', () => {
  test('parses every day at 9am', () => {
    assert.deepEqual(parseNaturalRecurrence('every day at 9am'), {
      frequency: 'daily',
      time: '09:00',
      daysOfWeek: []
    });
  });

  test('parses every weekday at 9am', () => {
    assert.deepEqual(parseNaturalRecurrence('every weekday at 9am'), {
      frequency: 'weekdays',
      time: '09:00',
      daysOfWeek: [1, 2, 3, 4, 5]
    });
  });

  test('parses every monday at 10:30', () => {
    assert.deepEqual(parseNaturalRecurrence('every monday at 10:30'), {
      frequency: 'weekly',
      time: '10:30',
      daysOfWeek: [1]
    });
  });

  test('parses every friday at 4pm', () => {
    assert.deepEqual(parseNaturalRecurrence('every friday at 4pm'), {
      frequency: 'weekly',
      time: '16:00',
      daysOfWeek: [5]
    });
  });
});

describe('shouldOccurOnDate', () => {
  test('daily rules occur every day', () => {
    assert.equal(shouldOccurOnDate({ frequency: 'daily', daysOfWeek: [] }, '2026-05-21'), true);
  });

  test('weekday rules occur on weekdays only', () => {
    assert.equal(shouldOccurOnDate({ frequency: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] }, '2026-05-22'), true);
    assert.equal(shouldOccurOnDate({ frequency: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] }, '2026-05-23'), false);
  });

  test('weekly rules occur on selected weekday', () => {
    assert.equal(shouldOccurOnDate({ frequency: 'weekly', daysOfWeek: [4] }, '2026-05-21'), true);
    assert.equal(shouldOccurOnDate({ frequency: 'weekly', daysOfWeek: [4] }, '2026-05-22'), false);
  });
});

describe('buildOccurrencesForDate', () => {
  test('builds duplicate-safe occurrence payloads for due rules', () => {
    const rules = [
      { id: 1, title: 'Check LMS', frequency: 'daily', daysOfWeek: [], time: '09:00', helper: '' },
      { id: 2, title: 'Friday report', frequency: 'weekly', daysOfWeek: [5], time: '16:00', helper: 'Sarah' }
    ];

    const existing = [{ recurringRuleId: 1, scheduledDate: '2026-05-21' }];

    assert.deepEqual(buildOccurrencesForDate(rules, '2026-05-21', existing), []);
    assert.deepEqual(buildOccurrencesForDate(rules, '2026-05-22', []), [
      {
        recurringRuleId: 1,
        title: 'Check LMS',
        helper: '',
        scheduledDate: '2026-05-22',
        scheduledTime: '09:00',
        reminderAt: '2026-05-22T09:00:00'
      },
      {
        recurringRuleId: 2,
        title: 'Friday report',
        helper: 'Sarah',
        scheduledDate: '2026-05-22',
        scheduledTime: '16:00',
        reminderAt: '2026-05-22T16:00:00'
      }
    ]);
  });
});
