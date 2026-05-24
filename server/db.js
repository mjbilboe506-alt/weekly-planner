import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildOccurrencesForDate, normalizeDays } from './recurrence.js';

const DEFAULT_SETTINGS = {
  accentColor: '#d8b45f',
  secondaryColor: '#8b5cf6',
  soundTone: 'signal',
  soundVolume: '0.22',
  workStart: '08:00',
  workEnd: '17:00'
};

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
          title, notes, status, priority, category, focus,
          scheduled_date, scheduled_time, reminder_at,
          helper, recurring_rule_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.title,
        task.notes,
        task.status,
        task.priority,
        task.category,
        task.focus ? 1 : 0,
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
      const rows = db.prepare(`
        SELECT * FROM tasks
        ORDER BY scheduled_date IS NULL, scheduled_date, COALESCE(scheduled_time, '99:99'), created_at
      `).all();
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

    updateTask(id, input) {
      const current = getTask(db, id);
      if (!current) return null;
      const task = normalizeTaskInput({ ...current, ...input });
      db.prepare(`
        UPDATE tasks
        SET title = ?, notes = ?, status = ?, priority = ?, category = ?, focus = ?,
            scheduled_date = ?, scheduled_time = ?, reminder_at = ?, helper = ?, updated_at = ?
        WHERE id = ?
      `).run(
        task.title,
        task.notes,
        task.status,
        task.priority,
        task.category,
        task.focus ? 1 : 0,
        task.scheduledDate,
        task.scheduledTime,
        task.reminderAt,
        task.helper,
        new Date().toISOString(),
        id
      );
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
      return db.prepare('SELECT * FROM recurring_rules ORDER BY active DESC, created_at DESC').all().map(mapRecurringRule);
    },

    updateRecurringRule(id, input) {
      const current = getRecurringRule(db, id);
      if (!current) return null;
      const next = {
        ...current,
        ...input,
        daysOfWeek: input.daysOfWeek === undefined ? current.daysOfWeek : input.daysOfWeek
      };
      db.prepare(`
        UPDATE recurring_rules
        SET title = ?, notes = ?, frequency = ?, days_of_week = ?, day_of_month = ?, time = ?,
            helper = ?, natural_text = ?, active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.title,
        next.notes || '',
        next.frequency,
        normalizeDays(next.daysOfWeek).join(','),
        next.dayOfMonth || null,
        next.time,
        next.helper || '',
        next.naturalText || '',
        next.active ? 1 : 0,
        new Date().toISOString(),
        id
      );
      return getRecurringRule(db, id);
    },

    deleteRecurringRule(id) {
      db.prepare('UPDATE recurring_rules SET active = 0, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), id);
      return getRecurringRule(db, id);
    },

    generateDueTasks(date) {
      const rules = this.listRecurringRules().filter((rule) => rule.active);
      const existing = db.prepare(`
        SELECT recurring_rule_id, scheduled_date
        FROM tasks
        WHERE scheduled_date = ? AND recurring_rule_id IS NOT NULL
      `).all(date).map((row) => ({
        recurringRuleId: row.recurring_rule_id,
        scheduledDate: row.scheduled_date
      }));
      const occurrences = buildOccurrencesForDate(rules, date, existing);
      return occurrences.map((occurrence) => this.createTask({
        ...occurrence,
        status: 'todo'
      }));
    },

    createTemplate(input) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO task_templates (
          title, notes, priority, category, scheduled_time, helper, reminder_offset_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.title,
        input.notes || '',
        normalizePriority(input.priority),
        input.category || 'Work',
        input.scheduledTime || null,
        input.helper || '',
        Number(input.reminderOffsetMinutes || 0),
        now,
        now
      );
      return getTemplate(db, result.lastInsertRowid);
    },

    listTemplates() {
      return db.prepare('SELECT * FROM task_templates ORDER BY created_at DESC').all().map(mapTemplate);
    },

    deleteTemplate(id) {
      db.prepare('DELETE FROM task_templates WHERE id = ?').run(id);
      return { id: Number(id) };
    },

    listSettings() {
      return db.prepare('SELECT key, value FROM app_settings').all().reduce((settings, row) => {
        settings[row.key] = row.value;
        return settings;
      }, { ...DEFAULT_SETTINGS });
    },

    updateSettings(input) {
      const next = { ...this.listSettings() };
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (input[key] !== undefined) next[key] = String(input[key]);
      }
      const now = new Date().toISOString();
      const statement = db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      for (const [key, value] of Object.entries(next)) {
        statement.run(key, value, now);
      }
      return this.listSettings();
    },

    daySummary(date) {
      const tasks = this.listTasks({ date }).scheduled;
      return {
        date,
        total: tasks.length,
        done: tasks.filter((task) => task.status === 'done').length,
        doing: tasks.filter((task) => task.status === 'doing').length,
        todo: tasks.filter((task) => ['todo', 'snoozed'].includes(task.status)).length,
        focus: tasks.filter((task) => task.focus).length,
        critical: tasks.filter((task) => task.priority === 'critical').length
      };
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
      priority TEXT NOT NULL DEFAULT 'normal',
      category TEXT NOT NULL DEFAULT 'Work',
      focus INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      category TEXT NOT NULL DEFAULT 'Work',
      scheduled_time TEXT,
      helper TEXT NOT NULL DEFAULT '',
      reminder_offset_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  addColumn(db, 'tasks', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
  addColumn(db, 'tasks', 'category', "TEXT NOT NULL DEFAULT 'Work'");
  addColumn(db, 'tasks', 'focus', 'INTEGER NOT NULL DEFAULT 0');
  seedTemplates(db);
  seedSettings(db);
}

function normalizeTaskInput(input) {
  return {
    title: input.title?.trim(),
    notes: input.notes || '',
    status: input.status || 'todo',
    priority: normalizePriority(input.priority),
    category: input.category || 'Work',
    focus: Boolean(input.focus),
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

function getTemplate(db, id) {
  return mapTemplate(db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id));
}

function mapTask(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority || 'normal',
    category: row.category || 'Work',
    focus: Boolean(row.focus),
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

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    category: row.category,
    scheduledTime: row.scheduled_time,
    helper: row.helper,
    reminderOffsetMinutes: Number(row.reminder_offset_minutes),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePriority(priority) {
  return ['low', 'normal', 'urgent', 'critical'].includes(priority) ? priority : 'normal';
}

function addColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedSettings(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM app_settings').get().count;
  if (existing) return;
  const now = new Date().toISOString();
  const statement = db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    statement.run(key, value, now);
  }
}

function seedTemplates(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM task_templates').get().count;
  if (existing) return;
  const now = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO task_templates (
      title, notes, priority, category, scheduled_time, helper, reminder_offset_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['Check LMS', 'Daily learning platform check.', 'urgent', 'Admin', '09:00', '', 0],
    ['Review leads', 'Check new enquiries and follow up fast.', 'critical', 'Sales', '10:00', '', 0],
    ['Send follow-up', 'Send any outstanding messages.', 'normal', 'Comms', '15:00', '', 0]
  ].forEach((template) => statement.run(...template, now, now));
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
