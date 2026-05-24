const state = {
  view: 'today',
  date: localDate(),
  tasks: { scheduled: [], unscheduled: [], all: [] },
  recurringRules: [],
  dueReminders: [],
  templates: [],
  settings: defaultSettings(),
  summary: {},
  soundEnabled: false,
  quickTime: '09:00',
  loading: true
};

const categories = ['Work', 'Admin', 'Sales', 'Calls', 'Personal', 'Errands', 'Focus'];
const priorities = ['low', 'normal', 'urgent', 'critical'];
const app = document.querySelector('#app');

init();

async function init() {
  render();
  await loadState();
  setInterval(checkReminders, 15000);
}

async function loadState() {
  state.loading = true;
  render();
  const data = await api(`/api/state?date=${state.date}`);
  Object.assign(state, {
    tasks: data.tasks,
    recurringRules: data.recurringRules,
    dueReminders: data.dueReminders,
    templates: data.templates || [],
    settings: { ...defaultSettings(), ...(data.settings || {}) },
    summary: data.summary || {},
    loading: false
  });
  applyTheme();
  render();
}

async function checkReminders() {
  const data = await api('/api/reminders/due');
  state.dueReminders = data.dueReminders;
  if (state.dueReminders.length) playAlert();
  render();
}

function render() {
  applyTheme();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">MJB</div>
          <div>
            <strong>Weekly Planner by MJB</strong>
            <span>Local command centre</span>
          </div>
        </div>
        <nav>
          ${navButton('today', 'Today')}
          ${navButton('week', 'Week')}
          ${navButton('month', 'Month')}
          ${navButton('tasks', 'Tasks')}
          ${navButton('recurring', 'Recurring')}
          ${navButton('settings', 'Settings')}
        </nav>
        <a class="export-link" href="/api/export.ics">Export calendar</a>
        <button class="sound-toggle ${state.soundEnabled ? 'active' : ''}" data-action="enable-sound">
          ${state.soundEnabled ? 'Sound ready' : 'Enable sound'}
        </button>
      </aside>

      <main class="main">
        ${header()}
        ${screen()}
      </main>

      ${reminderModal()}
    </div>
  `;
}

function navButton(view, label) {
  return `<button class="nav-item ${state.view === view ? 'selected' : ''}" data-view="${view}">${label}</button>`;
}

function header() {
  const date = new Date(`${state.date}T00:00:00`);
  const label = state.date === localDate() ? 'Today' : 'Selected Day';
  return `
    <header class="topbar">
      <div>
        <p class="label">${label}</p>
        <h1>${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
      </div>
      <div class="top-actions">
        <input class="date-picker" type="date" value="${state.date}" data-field="date" />
        <button class="primary" data-action="refresh">Refresh</button>
      </div>
    </header>
  `;
}

function screen() {
  if (state.loading) return `<div class="empty">Loading planner...</div>`;
  if (state.view === 'today') return todayScreen();
  if (state.view === 'week') return weekScreen();
  if (state.view === 'month') return monthScreen();
  if (state.view === 'tasks') return tasksScreen();
  if (state.view === 'recurring') return recurringScreen();
  return settingsScreen();
}

function todayScreen() {
  const tasks = tasksForDate(state.date);
  const focusTasks = tasks.filter((task) => task.focus).slice(0, 3);
  const overdue = overdueTasks();
  return `
    <section class="dashboard">
      ${dayOverview(state.date, tasks, 'Today Focus')}

      <aside class="quick-panel">
        <div class="panel-head">
          <div>
            <p class="label">Fast Capture</p>
            <h2>Quick Add</h2>
          </div>
        </div>
        ${quickAddForm()}
      </aside>

      <section class="sub-panel focus-panel">
        <div class="panel-head">
          <div><p class="label">Top 3</p><h2>Daily Focus</h2></div>
          <span>${focusTasks.length}/3 locked</span>
        </div>
        ${focusTasks.length ? focusTasks.map(compactTask).join('') : empty('Star up to three tasks to focus the day.')}
      </section>

      <section class="sub-panel overdue-panel">
        <div class="panel-head">
          <div><p class="label">Needs Attention</p><h2>Overdue</h2></div>
          <span>${overdue.length}</span>
        </div>
        ${overdue.length ? overdue.slice(0, 5).map(compactTask).join('') : empty('No overdue tasks. Clean slate.')}
      </section>

      <section class="sub-panel review-panel">
        <div class="panel-head">
          <div><p class="label">Review</p><h2>End Of Day</h2></div>
        </div>
        ${summaryCards()}
      </section>

      <section class="sub-panel">
        <div class="panel-head">
          <div><p class="label">Templates</p><h2>Quick Starts</h2></div>
        </div>
        ${templatePicker()}
      </section>
    </section>
  `;
}

function quickAddForm() {
  return `
    <form class="quick-form" data-form="quick-add">
      <label>Task
        <input name="title" required placeholder="Check LMS" />
      </label>
      <div class="form-grid">
        <label>Date
          <input name="scheduledDate" type="date" value="${state.date}" />
        </label>
        <label>Time
          <input name="scheduledTime" type="time" value="${state.quickTime}" />
        </label>
      </div>
      <div class="form-grid">
        <label>Priority
          ${prioritySelect('priority', 'normal')}
        </label>
        <label>Category
          ${categorySelect('category', 'Work')}
        </label>
      </div>
      <label>Helper
        <input name="helper" placeholder="Optional person or note" />
      </label>
      <label>Notes
        <input name="notes" placeholder="Optional context" />
      </label>
      <label class="check-row">
        <input name="focus" type="checkbox" />
        Add to daily focus
      </label>
      <label class="check-row">
        <input name="hasReminder" type="checkbox" checked />
        Reminder popup + sound
      </label>
      <label class="check-row">
        <input name="isRecurring" type="checkbox" />
        Recurring task
      </label>
      <label>Natural language
        <input name="naturalText" placeholder="every weekday at 9am" />
      </label>
      <div class="form-grid">
        <label>Repeat
          <select name="frequency">
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label>Days
          <input name="daysOfWeek" placeholder="1,2,3,4,5" />
        </label>
      </div>
      <button class="primary full" type="submit">Add Task</button>
    </form>
  `;
}

function weekScreen() {
  const days = weekDays(state.date);
  const selectedTasks = tasksForDate(state.date);
  return `
    <section class="wide-panel week-panel">
      <div class="panel-head">
        <div><p class="label">Week</p><h2>${weekTitle(days)}</h2></div>
        <span>Click a day. Drag tasks into the hours.</span>
      </div>
      <div class="week-selector">
        ${days.map((date) => weekDayButton(date, tasksForDate(date))).join('')}
      </div>
      ${dayOverview(state.date, selectedTasks, 'Day Overview')}
    </section>
  `;
}

function dayOverview(date, tasks, title = 'Day Overview') {
  const grouped = groupByHour(tasks);
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return `
    <div class="agenda-panel day-overview">
      <div class="panel-head">
        <div>
          <p class="label">${state.settings.workStart}-${state.settings.workEnd}</p>
          <h2>${title}</h2>
          <span>${dateLabel}</span>
        </div>
        <span>${tasks.length} scheduled</span>
      </div>
      <div class="timeline">
        ${workingHours().map((hour) => hourSlot(hour, grouped[hour] || [])).join('')}
      </div>
    </div>
  `;
}

function hourSlot(hour, tasks) {
  return `
    <div class="hour-slot ${isCurrentHour(hour) ? 'current-hour' : ''}" data-drop-hour="${hour}">
      <button class="hour-label" data-action="select-hour" data-hour="${hour}" type="button">
        <strong>${hour}</strong>
        <span>${isCurrentHour(hour) ? 'Now' : 'Add'}</span>
      </button>
      <div class="hour-tasks">
        ${tasks.length ? tasks.map(taskRow).join('') : '<div class="hour-empty">Drop task here</div>'}
      </div>
    </div>
  `;
}

function taskRow(task) {
  return `
    <article class="task-row ${task.status} priority-${task.priority || 'normal'}" data-task="${task.id}" draggable="${!task.isVirtual}">
      <div class="time">${task.scheduledTime || '--:--'}</div>
      <div class="task-body">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${task.category || 'Work'} · ${priorityLabel(task.priority)}${task.helper ? ` · Help: ${escapeHtml(task.helper)}` : ''}</span>
      </div>
      <div class="task-actions">
        <button class="icon-action ${task.focus ? 'active' : ''}" data-action="toggle-focus" data-id="${task.id}" title="Daily focus">★</button>
        ${task.isVirtual ? '<span class="virtual-tag">Rule</span>' : `<button class="ghost" data-action="doing" data-id="${task.id}">Doing</button><button class="done" data-action="done" data-id="${task.id}">Done</button>`}
      </div>
    </article>
  `;
}

function compactTask(task) {
  return `
    <article class="compact-task priority-${task.priority || 'normal'}" draggable="${!task.isVirtual}" data-task="${task.id}">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${task.scheduledDate || 'No date'} ${task.scheduledTime || ''} · ${task.category || 'Work'}</span>
      </div>
      ${task.isVirtual ? '<span class="virtual-tag">Rule</span>' : `<button class="done" data-action="done" data-id="${task.id}">Done</button>`}
    </article>
  `;
}

function monthScreen() {
  const monthDate = new Date(`${state.date}T00:00:00`);
  const days = monthCalendarDays(monthDate);
  const grouped = groupByDate(monthItems(days.map((day) => day.date)));
  const monthTitle = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return `
    <section class="wide-panel month-panel">
      <div class="panel-head">
        <div><p class="label">Month</p><h2>${monthTitle}</h2></div>
        <div class="month-controls">
          <button class="ghost" data-action="previous-month" type="button">Previous</button>
          <button class="ghost" data-action="current-month" type="button">This Month</button>
          <button class="ghost" data-action="next-month" type="button">Next</button>
          <span>${days.filter((day) => day.inMonth).length} calendar days</span>
        </div>
      </div>
      <div class="month-weekdays">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="month-grid">
        ${days.map((day) => `
          <button class="month-day ${day.inMonth ? '' : 'outside'} ${day.date === localDate() ? 'today-cell' : ''}" data-action="open-day" data-date="${day.date}" type="button">
            <div class="month-day-head">
              <strong>${day.dayNumber}</strong>
              ${day.date === state.date ? '<span>Selected</span>' : ''}
            </div>
            <div class="month-events">
              ${(grouped[day.date] || []).slice(0, 4).map(monthEvent).join('') || '<em>No tasks</em>'}
              ${(grouped[day.date] || []).length > 4 ? `<b>+${grouped[day.date].length - 4} more</b>` : ''}
            </div>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function tasksScreen() {
  const grouped = groupByCategory(state.tasks.all);
  return `
    <section class="wide-panel">
      <div class="panel-head">
        <div><p class="label">All Work</p><h2>Tasks</h2></div>
        <span>${state.tasks.all.length} active</span>
      </div>
      <div class="category-board">
        ${Object.entries(grouped).map(([category, tasks]) => `
          <section class="category-column">
            <h3>${escapeHtml(category)}</h3>
            ${tasks.length ? tasks.map(taskRow).join('') : empty('No tasks.')}
          </section>
        `).join('')}
      </div>
    </section>
  `;
}

function recurringScreen() {
  return `
    <section class="wide-panel">
      <div class="panel-head">
        <div><p class="label">Automation</p><h2>Recurring Rules</h2></div>
        <span>Pause, resume, or retire routines.</span>
      </div>
      <div class="rules">
        ${state.recurringRules.length ? state.recurringRules.map((rule) => `
          <article class="rule-card ${rule.active ? '' : 'paused'}">
            <div>
              <strong>${escapeHtml(rule.title)}</strong>
              <span>${rule.naturalText || `${rule.frequency} at ${rule.time}`}</span>
            </div>
            <div class="rule-actions">
              <button class="ghost" data-action="toggle-rule" data-id="${rule.id}" data-active="${rule.active ? '0' : '1'}">${rule.active ? 'Pause' : 'Resume'}</button>
              <button class="ghost danger" data-action="delete-rule" data-id="${rule.id}">Delete</button>
            </div>
          </article>
        `).join('') : empty('No recurring rules yet.')}
      </div>
    </section>
  `;
}

function settingsScreen() {
  return `
    <section class="wide-panel settings">
      <div class="panel-head">
        <div><p class="label">Personalise</p><h2>Settings</h2></div>
      </div>
      <form class="settings-grid" data-form="settings">
        <label>Accent colour
          <input name="accentColor" type="color" value="${state.settings.accentColor}" />
        </label>
        <label>Secondary colour
          <input name="secondaryColor" type="color" value="${state.settings.secondaryColor}" />
        </label>
        <label>Reminder sound
          <select name="soundTone">
            ${['signal', 'chime', 'pulse', 'soft'].map((tone) => `<option value="${tone}" ${state.settings.soundTone === tone ? 'selected' : ''}>${tone}</option>`).join('')}
          </select>
        </label>
        <label>Volume
          <input name="soundVolume" type="range" min="0.05" max="0.7" step="0.01" value="${state.settings.soundVolume}" />
        </label>
        <label>Work starts
          <input name="workStart" type="time" value="${state.settings.workStart}" />
        </label>
        <label>Work ends
          <input name="workEnd" type="time" value="${state.settings.workEnd}" />
        </label>
        <button class="primary" type="submit">Save Settings</button>
        <button class="ghost" type="button" data-action="test-sound">Test Sound</button>
      </form>

      <div class="template-admin">
        <div class="panel-head">
          <div><p class="label">Reusable Work</p><h2>Task Templates</h2></div>
        </div>
        <form class="quick-form" data-form="template">
          <div class="form-grid">
            <label>Template name
              <input name="title" required placeholder="Review leads" />
            </label>
            <label>Default time
              <input name="scheduledTime" type="time" value="09:00" />
            </label>
          </div>
          <div class="form-grid">
            <label>Priority ${prioritySelect('priority', 'normal')}</label>
            <label>Category ${categorySelect('category', 'Work')}</label>
          </div>
          <button class="primary" type="submit">Save Template</button>
        </form>
        <div class="template-list">${state.templates.map(templateCard).join('')}</div>
      </div>
    </section>
  `;
}

function reminderModal() {
  const reminder = state.dueReminders[0];
  if (!reminder) return '';
  return `
    <div class="modal-backdrop">
      <section class="reminder-modal priority-${reminder.priority || 'normal'}">
        <p class="label">Reminder</p>
        <h2>${escapeHtml(reminder.title)}</h2>
        <p>${reminder.scheduledTime ? `Scheduled for ${reminder.scheduledTime}` : 'This task needs your attention.'}</p>
        <div class="modal-actions">
          <button class="done" data-action="done" data-id="${reminder.id}">Done</button>
          <button class="ghost" data-action="snooze" data-minutes="5" data-id="${reminder.id}">Snooze 5</button>
          <button class="ghost" data-action="snooze" data-minutes="10" data-id="${reminder.id}">Snooze 10</button>
          <button class="ghost" data-action="snooze" data-minutes="30" data-id="${reminder.id}">Snooze 30</button>
        </div>
      </section>
    </div>
  `;
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.view) {
    state.view = button.dataset.view;
    render();
    return;
  }

  const action = button.dataset.action;
  if (action === 'refresh') await loadState();
  if (action === 'enable-sound') enableSound();
  if (action === 'test-sound') playAlert(true);
  if (action === 'select-hour') selectHour(button.dataset.hour);
  if (action === 'open-day') await openDay(button.dataset.date);
  if (action === 'previous-month') await moveMonth(-1);
  if (action === 'current-month') await goToCurrentMonth();
  if (action === 'next-month') await moveMonth(1);
  if (action === 'done') await updateStatus(button.dataset.id, 'done');
  if (action === 'doing') await updateStatus(button.dataset.id, 'doing');
  if (action === 'snooze') await snooze(button.dataset.id, button.dataset.minutes);
  if (action === 'toggle-focus') await toggleFocus(button.dataset.id);
  if (action === 'use-template') await useTemplate(button.dataset.id);
  if (action === 'delete-template') await deleteTemplate(button.dataset.id);
  if (action === 'toggle-rule') await toggleRule(button.dataset.id, button.dataset.active === '1');
  if (action === 'delete-rule') await deleteRule(button.dataset.id);
});

app.addEventListener('change', async (event) => {
  if (event.target.dataset.field === 'date') {
    state.date = event.target.value;
    await loadState();
  }
});

app.addEventListener('dragstart', (event) => {
  const task = event.target.closest('[data-task]');
  if (task) event.dataTransfer.setData('text/plain', task.dataset.task);
});

app.addEventListener('dragover', (event) => {
  if (event.target.closest('[data-drop-hour]')) event.preventDefault();
});

app.addEventListener('drop', async (event) => {
  const slot = event.target.closest('[data-drop-hour]');
  if (!slot) return;
  event.preventDefault();
  const id = event.dataTransfer.getData('text/plain');
  if (!id || id.startsWith('rule-')) return;
  await api(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: { scheduledDate: state.date, scheduledTime: slot.dataset.dropHour }
  });
  await loadState();
});

app.addEventListener('submit', async (event) => {
  const quickForm = event.target.closest('form[data-form="quick-add"]');
  const settingsForm = event.target.closest('form[data-form="settings"]');
  const templateForm = event.target.closest('form[data-form="template"]');
  if (quickForm) await submitQuickAdd(event, quickForm);
  if (settingsForm) await submitSettings(event, settingsForm);
  if (templateForm) await submitTemplate(event, templateForm);
});

async function submitQuickAdd(event, form) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const isRecurring = form.elements.isRecurring.checked || data.naturalText.trim();
  const hasReminder = form.elements.hasReminder.checked;
  const reminderAt = hasReminder && data.scheduledDate && data.scheduledTime ? `${data.scheduledDate}T${data.scheduledTime}:00` : null;

  if (isRecurring) {
    await api('/api/recurring', {
      method: 'POST',
      body: {
        title: data.title,
        notes: data.notes,
        scheduledDate: data.scheduledDate,
        time: data.scheduledTime || '09:00',
        helper: data.helper,
        naturalText: data.naturalText,
        frequency: data.frequency,
        daysOfWeek: parseDays(data.daysOfWeek)
      }
    });
  } else {
    await api('/api/tasks', {
      method: 'POST',
      body: {
        title: data.title,
        notes: data.notes,
        scheduledDate: data.scheduledDate || null,
        scheduledTime: data.scheduledTime || null,
        reminderAt,
        helper: data.helper,
        priority: data.priority,
        category: data.category,
        focus: form.elements.focus.checked
      }
    });
  }

  form.reset();
  await loadState();
}

async function submitSettings(event, form) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await api('/api/settings', { method: 'PATCH', body: data });
  state.settings = response.settings;
  applyTheme();
  render();
}

async function submitTemplate(event, form) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  await api('/api/templates', { method: 'POST', body: data });
  form.reset();
  await loadState();
}

async function updateStatus(id, status) {
  await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status } });
  await loadState();
}

async function snooze(id, minutes) {
  await api(`/api/tasks/${id}/snooze`, { method: 'POST', body: { minutes } });
  await loadState();
}

async function toggleFocus(id) {
  const task = state.tasks.all.find((item) => String(item.id) === String(id));
  if (!task) return;
  await api(`/api/tasks/${id}`, { method: 'PATCH', body: { focus: !task.focus } });
  await loadState();
}

async function useTemplate(id) {
  const template = state.templates.find((item) => String(item.id) === String(id));
  if (!template) return;
  const reminderAt = futureReminder(state.date, template.scheduledTime);
  await api('/api/tasks', {
    method: 'POST',
    body: {
      title: template.title,
      notes: template.notes,
      priority: template.priority,
      category: template.category,
      scheduledDate: state.date,
      scheduledTime: template.scheduledTime,
      helper: template.helper,
      reminderAt
    }
  });
  await loadState();
}

async function deleteTemplate(id) {
  await api(`/api/templates/${id}`, { method: 'DELETE' });
  await loadState();
}

async function toggleRule(id, active) {
  await api(`/api/recurring/${id}`, { method: 'PATCH', body: { active } });
  await loadState();
}

async function deleteRule(id) {
  await api(`/api/recurring/${id}`, { method: 'DELETE' });
  await loadState();
}

function selectHour(hour) {
  state.quickTime = hour;
  state.view = 'today';
  render();
  requestAnimationFrame(() => {
    document.querySelector('input[name="title"]')?.focus();
  });
}

async function openDay(date) {
  state.date = date;
  state.view = 'week';
  await loadState();
}

async function moveMonth(offset) {
  const current = new Date(`${state.date}T00:00:00`);
  const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
  state.date = localDate(next);
  await loadState();
}

async function goToCurrentMonth() {
  state.date = localDate(new Date());
  await loadState();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function enableSound() {
  state.soundEnabled = true;
  playAlert(true);
  render();
}

function playAlert(force = false) {
  if (!force && !state.soundEnabled) return;
  const ctx = new AudioContext();
  const sequence = soundSequence(state.settings.soundTone);
  const volume = Number(state.settings.soundVolume || 0.22);
  sequence.forEach(([frequency, delay, duration]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = state.settings.soundTone === 'soft' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.03);
  });
}

function soundSequence(tone) {
  if (tone === 'chime') return [[660, 0, 0.22], [880, 0.18, 0.3]];
  if (tone === 'pulse') return [[520, 0, 0.18], [520, 0.22, 0.18], [760, 0.44, 0.22]];
  if (tone === 'soft') return [[440, 0, 0.55]];
  return [[740, 0, 0.6]];
}

function templatePicker() {
  return state.templates.length
    ? `<div class="template-list">${state.templates.map(templateCard).join('')}</div>`
    : empty('No templates yet.');
}

function templateCard(template) {
  return `
    <article class="template-card priority-${template.priority}">
      <div>
        <strong>${escapeHtml(template.title)}</strong>
        <span>${template.category} · ${template.scheduledTime || 'No time'}</span>
      </div>
      <div class="template-actions">
        <button class="ghost" data-action="use-template" data-id="${template.id}">Use</button>
        <button class="ghost danger" data-action="delete-template" data-id="${template.id}">Delete</button>
      </div>
    </article>
  `;
}

function summaryCards() {
  const summary = state.summary || {};
  return `
    <div class="summary-grid">
      ${summaryCard('Done', summary.done || 0)}
      ${summaryCard('Open', summary.todo || 0)}
      ${summaryCard('Focus', summary.focus || 0)}
      ${summaryCard('Critical', summary.critical || 0)}
    </div>
  `;
}

function summaryCard(label, value) {
  return `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`;
}

function upcomingReminders() {
  return state.tasks.all
    .filter((task) => task.reminderAt && task.status !== 'done')
    .sort((a, b) => a.reminderAt.localeCompare(b.reminderAt))
    .slice(0, 4);
}

function overdueTasks() {
  const today = localDate();
  return state.tasks.all.filter((task) => (
    task.scheduledDate &&
    task.scheduledDate < today &&
    !['done', 'archived'].includes(task.status)
  ));
}

function parseDays(value) {
  return value ? value.split(',').map((day) => Number(day.trim())).filter(Boolean) : [];
}

function tasksForDate(date) {
  return monthItems([date])
    .filter((task) => task.scheduledDate === date)
    .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
}

function groupByDate(tasks) {
  return tasks.reduce((groups, task) => {
    if (!task.scheduledDate) return groups;
    groups[task.scheduledDate] ||= [];
    groups[task.scheduledDate].push(task);
    return groups;
  }, {});
}

function groupByHour(tasks) {
  return tasks.reduce((groups, task) => {
    const hour = task.scheduledTime ? `${task.scheduledTime.slice(0, 2)}:00` : '--:--';
    groups[hour] ||= [];
    groups[hour].push(task);
    return groups;
  }, {});
}

function groupByCategory(tasks) {
  return tasks.reduce((groups, task) => {
    const category = task.category || 'Work';
    groups[category] ||= [];
    groups[category].push(task);
    return groups;
  }, Object.fromEntries(categories.map((category) => [category, []])));
}

function workingHours() {
  const start = Number((state.settings.workStart || '08:00').slice(0, 2));
  const end = Number((state.settings.workEnd || '17:00').slice(0, 2));
  return Array.from({ length: Math.max(end - start + 1, 1) }, (_, index) => `${String(index + start).padStart(2, '0')}:00`);
}

function isCurrentHour(hour) {
  return state.date === localDate() && Number(hour.slice(0, 2)) === new Date().getHours();
}

function weekDays(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return localDate(day);
  });
}

function weekTitle(days) {
  const start = new Date(`${days[0]}T00:00:00`);
  const end = new Date(`${days[6]}T00:00:00`);
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function weekDayButton(date, tasks) {
  const parsed = new Date(`${date}T00:00:00`);
  return `
    <button class="week-day ${date === state.date ? 'selected' : ''} ${date === localDate() ? 'today-cell' : ''}" data-action="open-day" data-date="${date}" type="button">
      <span>${parsed.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
      <strong>${parsed.getDate()}</strong>
      <em>${tasks.length} task${tasks.length === 1 ? '' : 's'}</em>
    </button>
  `;
}

function monthCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const mondayIndex = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: localDate(day),
      dayNumber: day.getDate(),
      inMonth: day.getMonth() === month
    };
  });
}

function monthItems(dateStrings) {
  const existing = state.tasks.all.filter((task) => task.scheduledDate);
  const virtualRecurring = [];

  for (const rule of state.recurringRules.filter((item) => item.active)) {
    for (const date of dateStrings) {
      if (!recurringRuleOccurs(rule, date)) continue;
      const alreadyGenerated = existing.some((task) => task.recurringRuleId === rule.id && task.scheduledDate === date);
      if (alreadyGenerated) continue;
      virtualRecurring.push({
        id: `rule-${rule.id}-${date}`,
        title: rule.title,
        scheduledDate: date,
        scheduledTime: rule.time,
        status: 'recurring',
        priority: 'normal',
        category: 'Recurring',
        isVirtual: true
      });
    }
  }

  return [...existing, ...virtualRecurring];
}

function recurringRuleOccurs(rule, dateString) {
  const day = new Date(`${dateString}T00:00:00`).getDay();
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'weekdays') return day >= 1 && day <= 5;
  if (rule.frequency === 'weekly') return (rule.daysOfWeek || []).map(Number).includes(day);
  if (rule.frequency === 'monthly') return new Date(`${dateString}T00:00:00`).getDate() === Number(rule.dayOfMonth || 1);
  return false;
}

function monthEvent(task) {
  return `
    <span class="month-event ${task.isVirtual ? 'virtual' : ''} priority-${task.priority || 'normal'}">
      ${task.scheduledTime || ''} ${escapeHtml(task.title)}
    </span>
  `;
}

function prioritySelect(name, value) {
  return `
    <select name="${name}">
      ${priorities.map((priority) => `<option value="${priority}" ${value === priority ? 'selected' : ''}>${priorityLabel(priority)}</option>`).join('')}
    </select>
  `;
}

function categorySelect(name, value) {
  return `
    <select name="${name}">
      ${categories.map((category) => `<option value="${category}" ${value === category ? 'selected' : ''}>${category}</option>`).join('')}
    </select>
  `;
}

function priorityLabel(priority = 'normal') {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatTime(dateTime) {
  return dateTime.split('T')[1]?.slice(0, 5) || '';
}

function statusLabel(status) {
  return status === 'done' ? 'Done' : status === 'doing' ? 'Doing' : status === 'snoozed' ? 'Snoozed' : 'To do';
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function defaultSettings() {
  return {
    accentColor: '#d8b45f',
    secondaryColor: '#8b5cf6',
    soundTone: 'signal',
    soundVolume: '0.22',
    workStart: '08:00',
    workEnd: '17:00'
  };
}

function futureReminder(date, time) {
  if (!date || !time) return null;
  const value = `${date}T${time}:00`;
  return new Date(value) > new Date() ? value : null;
}

function applyTheme() {
  document.documentElement.style.setProperty('--gold', state.settings.accentColor || '#d8b45f');
  document.documentElement.style.setProperty('--purple', state.settings.secondaryColor || '#8b5cf6');
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
