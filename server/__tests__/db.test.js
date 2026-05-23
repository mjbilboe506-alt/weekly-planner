import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlannerStore } from '../db.js';

describe('planner store', () => {
  test('creates a task and returns it in today agenda', () => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-db-'));
    const store = createPlannerStore(join(dir, 'planner.db'));

    const task = store.createTask({
      title: 'Check LMS',
      scheduledDate: '2026-05-21',
      scheduledTime: '09:00',
      reminderAt: '2026-05-21T09:00:00',
      helper: ''
    });

    const agenda = store.listTasks({ date: '2026-05-21' });
    assert.equal(task.title, 'Check LMS');
    assert.equal(agenda.scheduled[0].title, 'Check LMS');
    assert.equal(agenda.unscheduled.length, 0);

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('snoozes a task reminder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-db-'));
    const store = createPlannerStore(join(dir, 'planner.db'));
    const task = store.createTask({
      title: 'Call prospects',
      scheduledDate: '2026-05-21',
      scheduledTime: '13:00',
      reminderAt: '2026-05-21T13:00:00',
      helper: ''
    });

    const snoozed = store.snoozeTask(task.id, 10, new Date('2026-05-21T13:00:00'));
    assert.equal(snoozed.status, 'snoozed');
    assert.equal(snoozed.reminderAt, '2026-05-21T13:10:00');

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('creates recurring task instances once per date', () => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-db-'));
    const store = createPlannerStore(join(dir, 'planner.db'));

    store.createRecurringRule({
      title: 'Check LMS',
      frequency: 'daily',
      daysOfWeek: [],
      time: '09:00',
      helper: ''
    });

    assert.equal(store.generateDueTasks('2026-05-21').length, 1);
    assert.equal(store.generateDueTasks('2026-05-21').length, 0);
    assert.equal(store.listTasks({ date: '2026-05-21' }).scheduled.length, 1);

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
