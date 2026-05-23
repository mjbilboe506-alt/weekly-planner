import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildOccurrencesForDate, normalizeDays } from './recurrence.js';

export function createPlannerStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);

  return {
    createTask(input) {
      const now = new Date().toISOString();
      const task = normalizeTaskInput(input);
      const result = db.prepare(`
        INSERT INTO tasks (
          title, notes, status, scheduled_date, scheduled_time, reminder_at,
          helper, recurring_rule_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.title,
        task.notes,
        task.status,
        task.scheduledDate,
        task.scheduledTime,
        task.reminderAt,
        task.helper,
        task.recurringRuleId,
        now,
        now
      );

      return getTask(db, result.lastInsertRowid);
    },

    listTasks({ date } = {}) {
      const rows = db.prepare("SELECT * FROM tasks ORDER BY COALESCE(scheduled_time, '99:99'), created_at").all();
      const tasks = rows.map(mapTask);
      const active = tasks.filter((task) => task.status !== 'archived');
      return {
        scheduled: active.filter((task) => task.scheduledDate === date),
        unscheduled: active.filter((task) => !task.scheduledDate),
        all: active
      };
    },

    updateTaskStatus(id, status) {
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
      return getTask(db, id);
    },

    snoozeTask(id, minutes, from = new Date()) {
      const reminderAt = addMinutes(from, minutes);
      db.prepare('UPDATE tasks SET status = ?, reminder_at = ?, updated_at = ? WHERE id = ?')
        .run('snoozed', reminderAt, new Date().toISOString(), id);
      return getTask(db, id);
    },

    dueReminders(now = new Date()) {
      const nowLocal = toLocalDateTime(now);
      return db.prepare(`
        SELECT * FROM tasks
        WHERE reminder_at IS NOT NULL
          AND reminder_at <= ?
          AND status IN ('todo', 'doing', 'snoozed')
        ORDER BY reminder_at ASC
      `).all(nowLocal).map(mapTask);
    },

    createRecurringRule(input) {
      const now = new Date().toISOString();
      const days = normalizeDays(input.daysOfWeek).join(',');
      const result = db.prepare(`
        INSERT INTO recurring_rules (
          title, notes, frequency, days_of_week, day_of_month, time,
          helper, natural_text, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        input.title,
        input.notes || '',
        input.frequency,
        days,
        input.dayOfMonth || null,
        input.time,
        input.helper || '',
        input.naturalText || '',
        now,
        now
      );
      return getRecurringRule(db, result.lastInsertRowid);
    },

    listRecurringRules() {
      return db.prepare('SELECT * FROM recurring_rules WHERE active = 1 ORDER BY created_at DESC').all().map(mapRecurringRule);
    },

    generateDueTasks(date) {
      const rules = this.listRecurringRules();
      const existing = db.prepare('SELECT recurring_rule_id, scheduled_date FROM tasks WHERE scheduled_date = ? AND recurring_rule_id IS NOT NULL').all(date).map((row) => ({
        recurringRuleId: row.recurring_rule_id,
        scheduledDate: row.scheduled_date
      }));
      const occurrences = buildOccurrencesForDate(rules, date, existing);
      return occurrences.map((occurrence) => this.createTask({
        ...occurrence,
        status: 'todo'
      }));
    },

    close() {
      db.close();
    }
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      scheduled_date TEXT,
      scheduled_time TEXT,
      reminder_at TEXT,
      helper TEXT NOT NULL DEFAULT '',
      recurring_rule_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL,
      days_of_week TEXT NOT NULL DEFAULT '',
      day_of_month INTEGER,
      time TEXT NOT NULL,
      helper TEXT NOT NULL DEFAULT '',
      natural_text TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function normalizeTaskInput(input) {
  return {
    title: input.title?.trim(),
    notes: input.notes || '',
    status: input.status || 'todo',
    scheduledDate: input.scheduledDate || null,
    scheduledTime: input.scheduledTime || null,
    reminderAt: input.reminderAt || null,
    helper: input.helper || '',
    recurringRuleId: input.recurringRuleId || null
  };
}

function getTask(db, id) {
  return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
}

function getRecurringRule(db, id) {
  return mapRecurringRule(db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(id));
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    notes: row.notes,
    status: row.status,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    reminderAt: row.reminder_at,
    helper: row.helper,
    recurringRuleId: row.recurring_rule_id === null ? null : Number(row.recurring_rule_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRecurringRule(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    notes: row.notes,
    frequency: row.frequency,
    daysOfWeek: normalizeDays(row.days_of_week),
    dayOfMonth: row.day_of_month,
    time: row.time,
    helper: row.helper,
    naturalText: row.natural_text,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function addMinutes(from, minutes) {
  const date = new Date(from.getTime() + Number(minutes) * 60 * 1000);
  return toLocalDateTime(date);
}

export function toLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}
