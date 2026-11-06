import { state } from './state.js';
import { addDays, escapeHtml, formatDate, formatHours, monday, ymd } from './utils.js';

const viewTitles = {
  today: 'Today',
  week: 'Week',
  projects: 'Projects',
  dashboard: 'Dashboard',
  settings: 'Settings',
};

function dayTasks(dateKey) {
  return Object.values(state.tasks)
    .filter((task) => task.date === dateKey)
    .sort((a, b) => a.created - b.created);
}

function dateNavigation(period) {
  const isWeek = period === 'week';
  const date = isWeek ? monday(state.currentDate) : state.currentDate;
  const label = isWeek
    ? `Week of ${formatDate(date, { day: 'numeric', month: 'short' })}`
    : ymd(date) === ymd(new Date()) ? 'Today' : formatDate(date, { weekday: 'long' });
  const detail = isWeek
    ? `${formatDate(date, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(date, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="date-navigation">
    <button class="date-button" type="button" data-date-step="-1" aria-label="Previous ${isWeek ? 'week' : 'day'}">‹</button>
    <div class="date-label"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>
    <button class="date-button" type="button" data-date-step="1" aria-label="Next ${isWeek ? 'week' : 'day'}">›</button>
  </div>`;
}

function taskMarkup(task) {
  const id = escapeHtml(task.id);
  const status = ['todo', 'doing', 'done', 'blocked'].includes(task.status) ? task.status : 'todo';
  const project = task.tag ? `<span class="project-chip">${escapeHtml(task.tag)}</span>` : '';
  const time = task.mins ? `<span>${formatHours(task.mins)}</span>` : '';
  const statusLabel = status === 'todo' ? 'To do' : status === 'doing' ? 'In progress' : status === 'done' ? 'Done' : 'Blocked';
  const blockLabel = status === 'blocked' ? 'Unblock' : 'Block';
  return `<article class="task-card${status === 'done' ? ' task-card--done' : ''}" data-id="${id}">
    <button class="task-check" type="button" data-action="toggle" aria-label="${status === 'done' ? 'Reopen' : 'Complete'} ${escapeHtml(task.title)}">${status === 'done' ? '✓' : ''}</button>
    <div class="task-content">
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-meta">${project}<span class="status-chip status-chip--${status}"><span class="status-dot" aria-hidden="true"></span>${statusLabel}</span>${time}</div>
    </div>
    <div class="task-actions">
      <button class="task-action task-action--block" type="button" data-action="block" aria-label="${blockLabel} ${escapeHtml(task.title)}">${blockLabel}</button>
      <button class="task-action task-action--delete" type="button" data-action="delete" aria-label="Delete ${escapeHtml(task.title)}">×</button>
    </div>
  </article>`;
}

function renderToday() {
  const key = ymd(state.currentDate);
  const tasks = dayTasks(key);
  const done = tasks.filter((task) => task.status === 'done').length;
  const minutes = tasks.reduce((total, task) => total + (task.mins || 0), 0);
  return `${dateNavigation('day')}
    <section class="panel" aria-label="Add a task">
      <form class="entry-form" id="task-form">
        <input class="text-input task-title-input" name="title" placeholder="What are you working on?" autocomplete="off" maxlength="500" required aria-label="Task title">
        <input class="text-input" name="tag" placeholder="Project (optional)" autocomplete="off" maxlength="120" aria-label="Project">
        <input class="text-input" name="mins" type="number" min="0" step="5" inputmode="numeric" placeholder="Minutes" aria-label="Minutes">
        <button class="button" type="submit">Add task</button>
      </form>
    </section>
    ${tasks.length ? `<div class="task-list">${tasks.map(taskMarkup).join('')}</div>
      <p class="task-totals">${done} of ${tasks.length} done · ${formatHours(minutes)} logged</p>`
      : '<div class="empty-state">No tasks logged for this day yet.</div>'}`;
}

function weekData() {
  const start = monday(state.currentDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return { date, tasks: dayTasks(ymd(date)) };
  });
  const tasks = days.flatMap((day) => day.tasks);
  const done = tasks.filter((task) => task.status === 'done');
  const blocked = tasks.filter((task) => task.status === 'blocked');
  const open = tasks.filter((task) => task.status === 'todo' || task.status === 'doing');
  const minutes = tasks.reduce((total, task) => total + (task.mins || 0), 0);
  const projects = Object.create(null);
  tasks.forEach((task) => {
    const project = task.tag || 'Untagged';
    projects[project] ??= { count: 0, minutes: 0 };
    projects[project].count += 1;
    projects[project].minutes += task.mins || 0;
  });
  return { start, days, tasks, done, blocked, open, minutes, projects };
}

function renderWeek() {
  const week = weekData();
  const completion = week.tasks.length ? Math.round((week.done.length / week.tasks.length) * 100) : 0;
  const maxTasks = Math.max(1, ...week.days.map((day) => day.tasks.length));
  const dayRows = week.days.map((day) => {
    const completed = day.tasks.filter((task) => task.status === 'done').length;
    const width = Math.round((day.tasks.length / maxTasks) * 100);
    const opacity = day.tasks.length ? (0.35 + (0.65 * completed / day.tasks.length)).toFixed(2) : '0';
    return `<div class="week-row"><span class="week-day">${formatDate(day.date, { weekday: 'short' })}</span>
      <svg class="week-track" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${day.tasks.length} tasks, ${completed} done">
        <rect class="week-track-bg" x="0" y="0" width="100" height="10" rx="5"></rect>
        <rect class="week-track-fill" x="0" y="0" width="${width}" height="10" rx="5" opacity="${opacity}"></rect>
      </svg><span class="week-count">${completed}/${day.tasks.length}</span></div>`;
  }).join('');
  const projectRows = Object.entries(week.projects)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([project, value]) => `<div class="week-project-row"><span>${escapeHtml(project)}</span><span class="week-project-value">${value.count} · ${formatHours(value.minutes)}</span></div>`)
    .join('');
  const attentionRows = [
    ...week.blocked.map((task) => `<div class="attention-row"><span class="status-chip status-chip--blocked"><span class="status-dot" aria-hidden="true"></span>Blocked</span>${escapeHtml(task.title)}</div>`),
    ...week.open.map((task) => `<div class="attention-row"><span class="status-chip status-chip--${task.status}"><span class="status-dot" aria-hidden="true"></span>${task.status === 'doing' ? 'In progress' : 'To do'}</span>${escapeHtml(task.title)}</div>`),
  ].join('');
  const summary = summaryText(week);
  return `${dateNavigation('week')}
    <div class="stats-grid">
      <div class="stat-card"><strong class="stat-value">${week.done.length}/${week.tasks.length}</strong><span class="stat-label">Done</span></div>
      <div class="stat-card"><strong class="stat-value">${completion}%</strong><span class="stat-label">Completion</span></div>
      <div class="stat-card"><strong class="stat-value">${formatHours(week.minutes)}</strong><span class="stat-label">Time logged</span></div>
    </div>
    <section class="panel"><h2 class="panel-title">By day</h2>${dayRows}</section>
    ${projectRows ? `<section class="panel"><h2 class="panel-title">By project</h2>${projectRows}</section>` : ''}
    ${attentionRows ? `<section class="panel"><h2 class="panel-title">Needs attention</h2>${attentionRows}</section>` : ''}
    <section class="panel"><h2 class="panel-title">Summary to share</h2><pre class="summary-text" id="summary-text">${escapeHtml(summary)}</pre><button class="button" type="button" data-action="copy-summary">Copy summary</button></section>`;
}

function summaryText(week) {
  const end = addDays(week.start, 6);
  const completion = week.tasks.length ? Math.round((week.done.length / week.tasks.length) * 100) : 0;
  let text = `Weekly summary: ${formatDate(week.start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}\n`;
  text += `Tasks: ${week.tasks.length} logged, ${week.done.length} done (${completion}%), ${week.open.length} open, ${week.blocked.length} blocked\nTime logged: ${formatHours(week.minutes)}\n\nBy day:\n`;
  week.days.forEach((day) => {
    if (day.tasks.length) {
      text += `• ${formatDate(day.date, { weekday: 'short' })}: ${day.tasks.filter((task) => task.status === 'done').length}/${day.tasks.length} done\n`;
    }
  });
  text += `\nCompleted:\n${week.done.length ? week.done.map((task) => `• ${task.title}${task.tag ? ` [${task.tag}]` : ''}`).join('\n') : '• None'}\n`;
  if (week.blocked.length) text += `\nBlocked:\n${week.blocked.map((task) => `• ${task.title}`).join('\n')}\n`;
  if (week.open.length) text += `\nCarry over:\n${week.open.map((task) => `• ${task.title}`).join('\n')}\n`;
  return text;
}

function renderSettings() {
  return `<section class="panel">
    <h2 class="panel-title">Appearance</h2>
    <div class="settings-row">
      <div><label class="settings-label" for="theme-mode">Theme</label><p class="settings-help">Follow your system setting or choose a theme for Keen.</p></div>
      <select class="select-input" id="theme-mode" name="theme">
        <option value="system"${state.theme === 'system' ? ' selected' : ''}>Use system setting</option>
        <option value="light"${state.theme === 'light' ? ' selected' : ''}>Light</option>
        <option value="dark"${state.theme === 'dark' ? ' selected' : ''}>Dark</option>
      </select>
    </div>
  </section>`;
}

function renderComingSoon(view) {
  const details = view === 'projects'
    ? ['Projects', 'Project folders and project management will be available in the Projects update.']
    : ['Your progress, at a glance', 'Activity, trends, and workload insights will appear here in the dashboard update.'];
  return `<section class="panel coming-soon">
    <span class="coming-soon-mark" aria-hidden="true">${view === 'projects' ? '▱' : '▦'}</span>
    <h2>${details[0]}</h2><p>${details[1]}</p>
  </section>`;
}

export function renderPage() {
  const view = viewTitles[state.activeView] ? state.activeView : 'today';
  const title = view === 'dashboard' ? 'Stats' : viewTitles[view];
  const subtitle = view === 'today' || view === 'week'
    ? 'A calm place to plan your work.'
    : view === 'settings' ? 'Make Keen feel right for you.' : '';
  let content = '';
  if (view === 'today') content = renderToday();
  else if (view === 'week') content = renderWeek();
  else if (view === 'settings') content = renderSettings();
  else content = renderComingSoon(view);

  return { title, subtitle, content, view };
}
