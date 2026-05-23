const state = {
  view: 'today',
  date: localDate(),
  tasks: { scheduled: [], unscheduled: [], all: [] },
  recurringRules: [],
  dueReminders: [],
  soundEnabled: false,
  quickTime: '09:00',
  loading: true
};

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
    loading: false
  });
  render();
}

async function checkReminders() {
  const data = await api('/api/reminders/due');
  state.dueReminders = data.dueReminders;
  if (state.dueReminders.length) playAlert();
  render();
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">W</div>
          <div>
            <strong>Weekly Planner</strong>
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

      <section class="sub-panel">
        <div class="panel-head">
          <div>
            <p class="label">Later</p>
            <h2>Unscheduled</h2>
          </div>
        </div>
        ${state.tasks.unscheduled.length ? state.tasks.unscheduled.map(compactTask).join('') : empty('Nothing parked for later.')}
      </section>

      <section class="sub-panel reminders-panel">
        <div class="panel-head">
          <div>
            <p class="label">Reminders</p>
            <h2>Upcoming</h2>
          </div>
        </div>
        ${upcomingReminders().length ? upcomingReminders().map(compactTask).join('') : empty('No reminders waiting.')}
      </section>
    </section>
  `;
}

function weekScreen() {
  const days = weekDays(state.date);
  const selectedTasks = tasksForDate(state.date);
  return `
    <section class="wide-panel week-panel">
      <div class="panel-head">
        <div><p class="label">Week</p><h2>${weekTitle(days)}</h2></div>
        <span>Click a day to inspect 08:00-17:00</span>
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
          <p class="label">08:00-17:00</p>
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
      <label>Helper
        <input name="helper" placeholder="Optional person or note" />
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

function taskRow(task) {
  return `
    <article class="task-row ${task.status}" data-task="${task.id}">
      <div class="time">${task.scheduledTime || '--:--'}</div>
      <div class="task-body">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${task.helper ? `Needs help: ${escapeHtml(task.helper)}` : task.reminderAt ? `Reminder ${formatTime(task.reminderAt)}` : 'No reminder'}</span>
      </div>
      <div class="status">${statusLabel(task.status)}</div>
      ${task.isVirtual ? '<span class="virtual-tag">Rule</span>' : `<button class="ghost" data-action="doing" data-id="${task.id}">Doing</button><button class="done" data-action="done" data-id="${task.id}">Done</button>`}
    </article>
  `;
}

function hourSlot(hour, tasks) {
  return `
    <div class="hour-slot ${isCurrentHour(hour) ? 'current-hour' : ''}" data-action="select-hour" data-hour="${hour}">
      <button class="hour-label" data-action="select-hour" data-hour="${hour}" type="button">
        <strong>${hour}</strong>
        <span>${isCurrentHour(hour) ? 'Now' : 'Add'}</span>
      </button>
      <div class="hour-tasks">
        ${tasks.length ? tasks.map(taskRow).join('') : '<div class="hour-empty">Empty slot</div>'}
      </div>
    </div>
  `;
}

function compactTask(task) {
  return `
    <article class="compact-task">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <span>${task.scheduledDate || 'No date'} ${task.scheduledTime || ''}</span>
      </div>
      <button class="done" data-action="done" data-id="${task.id}">Done</button>
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
  return `
    <section class="wide-panel">
      <div class="panel-head">
        <div><p class="label">All Work</p><h2>Tasks</h2></div>
      </div>
      <div class="task-list">
        ${state.tasks.all.length ? state.tasks.all.map(taskRow).join('') : empty('No tasks yet.')}
      </div>
    </section>
  `;
}

function recurringScreen() {
  return `
    <section class="wide-panel">
      <div class="panel-head">
        <div><p class="label">Automation</p><h2>Recurring Rules</h2></div>
      </div>
      <div class="rules">
        ${state.recurringRules.length ? state.recurringRules.map((rule) => `
          <article class="rule-card">
            <strong>${escapeHtml(rule.title)}</strong>
            <span>${rule.naturalText || `${rule.frequency} at ${rule.time}`}</span>
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
        <div><p class="label">Local App</p><h2>Settings</h2></div>
      </div>
      <p>Keep this browser tab open while Docker is running. Reminder popups and sound work while the app is open.</p>
      <button class="primary" data-action="enable-sound">${state.soundEnabled ? 'Sound is enabled' : 'Enable reminder sound'}</button>
    </section>
  `;
}

function reminderModal() {
  const reminder = state.dueReminders[0];
  if (!reminder) return '';
  return `
    <div class="modal-backdrop">
      <section class="reminder-modal">
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
  if (action === 'select-hour') selectHour(button.dataset.hour);
  if (action === 'open-day') await openDay(button.dataset.date);
  if (action === 'previous-month') await moveMonth(-1);
  if (action === 'current-month') await goToCurrentMonth();
  if (action === 'next-month') await moveMonth(1);
  if (action === 'done') await updateStatus(button.dataset.id, 'done');
  if (action === 'doing') await updateStatus(button.dataset.id, 'doing');
  if (action === 'snooze') await snooze(button.dataset.id, button.dataset.minutes);
});

app.addEventListener('change', async (event) => {
  if (event.target.dataset.field === 'date') {
    state.date = event.target.value;
    await loadState();
  }
});

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form="quick-add"]');
  if (!form) return;
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
        scheduledDate: data.scheduledDate || null,
        scheduledTime: data.scheduledTime || null,
        reminderAt,
        helper: data.helper
      }
    });
  }

  form.reset();
  await loadState();
});

async function updateStatus(id, status) {
  await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status } });
  await loadState();
}

async function snooze(id, minutes) {
  await api(`/api/tasks/${id}/snooze`, { method: 'POST', body: { minutes } });
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
  playAlert();
  render();
}

function playAlert() {
  if (!state.soundEnabled) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(740, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
}

function upcomingReminders() {
  return state.tasks.all
    .filter((task) => task.reminderAt && task.status !== 'done')
    .sort((a, b) => a.reminderAt.localeCompare(b.reminderAt))
    .slice(0, 4);
}

function parseDays(value) {
  return value ? value.split(',').map((day) => Number(day.trim())).filter(Boolean) : [];
}

function groupByDate(tasks) {
  return tasks.reduce((groups, task) => {
    if (!task.scheduledDate) return groups;
    groups[task.scheduledDate] ||= [];
    groups[task.scheduledDate].push(task);
    return groups;
  }, {});
}

function tasksForDate(date) {
  return monthItems([date])
    .filter((task) => task.scheduledDate === date)
    .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
}

function groupByHour(tasks) {
  return tasks.reduce((groups, task) => {
    const hour = task.scheduledTime ? `${task.scheduledTime.slice(0, 2)}:00` : '--:--';
    groups[hour] ||= [];
    groups[hour].push(task);
    return groups;
  }, {});
}

function workingHours() {
  return Array.from({ length: 10 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
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

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDay(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
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

  for (const rule of state.recurringRules) {
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
    <span class="month-event ${task.isVirtual ? 'virtual' : ''}">
      ${task.scheduledTime || ''} ${escapeHtml(task.title)}
    </span>
  `;
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

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
