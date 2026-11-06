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
    .sort((a, b) => (a.sortOrder ?? a.created) - (b.sortOrder ?? b.created) || a.created - b.created);
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

function taskMarkup(task, index, tasks, filtered) {
  const id = escapeHtml(task.id);
  const status = ['todo', 'doing', 'done', 'blocked'].includes(task.status) ? task.status : 'todo';
  const project = task.tag ? `<span class="project-chip">${escapeHtml(task.tag)}</span>` : '';
  const time = task.mins ? `<span>${formatHours(task.mins)}</span>` : '';
  const editing = state.editingTaskId === task.id;
  const moveDisabled = filtered ? ' disabled title="Clear filters to reorder tasks"' : '';
  const edit = editing ? `<form class="task-edit-form" data-edit-form="${id}">
      <label class="sr-only" for="edit-title-${id}">Task title</label>
      <input class="text-input" id="edit-title-${id}" name="title" data-focus-key="edit-title" value="${escapeHtml(task.title)}" maxlength="500" required>
      <label class="sr-only" for="edit-project-${id}">Project</label>
      <input class="text-input" id="edit-project-${id}" name="tag" list="project-suggestions" value="${escapeHtml(task.tag)}" maxlength="120" placeholder="Project">
      <label class="sr-only" for="edit-mins-${id}">Time</label>
      <input class="text-input" id="edit-mins-${id}" name="mins" value="${escapeHtml(task.mins ? formatHours(task.mins) : '')}" placeholder="Time, e.g. 1h30">
      <label class="repeat-label" for="edit-repeat-${id}">Repeat</label>
      <select class="select-input" id="edit-repeat-${id}" name="recurrence">
        <option value=""${!task.recurrence ? ' selected' : ''}>Does not repeat</option>
        <option value="daily"${task.recurrence === 'daily' ? ' selected' : ''}>Every day</option>
        <option value="weekdays"${task.recurrence === 'weekdays' ? ' selected' : ''}>Weekdays</option>
        <option value="weekly"${task.recurrence === 'weekly' ? ' selected' : ''}>Every week</option>
      </select>
      <div class="edit-actions"><button class="button" type="submit">Save changes</button><button class="button button-secondary" type="button" data-action="cancel-edit">Cancel</button></div>
    </form>`
    : `<div class="task-title-row"><span class="task-title">${escapeHtml(task.title)}</span><button class="task-action task-action--edit" type="button" data-action="edit" aria-label="Edit ${escapeHtml(task.title)}">Edit</button></div>
      <div class="task-meta">${project}${time}${task.recurrence ? '<span class="repeat-indicator" title="Repeats">Repeats</span>' : ''}</div>`;
  const entering = state.justAddedTaskId === task.id ? ' task-card--entering' : '';
  return `<article class="task-card${status === 'done' ? ' task-card--done' : ''}${entering}" data-id="${id}" data-title="${escapeHtml(task.title.toLocaleLowerCase())}" data-project="${escapeHtml(task.tag.toLocaleLowerCase())}" data-status="${status}">
    <button class="drag-handle" type="button" draggable="${!filtered}" aria-label="Drag to reorder ${escapeHtml(task.title)}" title="Drag to reorder">⠿</button>
    <button class="task-check" type="button" role="checkbox" data-action="toggle" aria-label="${status === 'done' ? 'Reopen' : 'Complete'} ${escapeHtml(task.title)}" aria-checked="${status === 'done'}">${status === 'done' ? '✓' : ''}</button>
    <div class="task-content">${edit}</div>
    <div class="task-actions">
      <label class="sr-only" for="status-${id}">Status for ${escapeHtml(task.title)}</label>
      <select class="task-status" id="status-${id}" data-action="status" aria-label="Status for ${escapeHtml(task.title)}">
        <option value="todo"${status === 'todo' ? ' selected' : ''}>To do</option>
        <option value="doing"${status === 'doing' ? ' selected' : ''}>Doing</option>
        <option value="done"${status === 'done' ? ' selected' : ''}>Done</option>
        <option value="blocked"${status === 'blocked' ? ' selected' : ''}>Blocked</option>
      </select>
      <button class="task-action task-action--move" type="button" data-action="move" data-direction="-1" aria-label="Move ${escapeHtml(task.title)} up" title="Move up"${index === 0 ? ' disabled' : ''}${moveDisabled}>↑</button>
      <button class="task-action task-action--move" type="button" data-action="move" data-direction="1" aria-label="Move ${escapeHtml(task.title)} down" title="Move down"${index === tasks.length - 1 ? ' disabled' : ''}${moveDisabled}>↓</button>
      <button class="task-action task-action--delete" type="button" data-action="delete" aria-label="Delete ${escapeHtml(task.title)}">×</button>
    </div>
  </article>`;
}

function renderToday() {
  const key = ymd(state.currentDate);
  const tasks = dayTasks(key);
  const done = tasks.filter((task) => task.status === 'done').length;
  const minutes = tasks.reduce((total, task) => total + (task.mins || 0), 0);
  const filtered = Boolean(state.filters.query || state.filters.project || state.filters.status);
  const projectOptions = state.projects.map((project) => `<option value="${escapeHtml(project)}"></option>`).join('');
  const projectFilters = [...new Set(state.projects)].sort((a, b) => a.localeCompare(b));
  const visibleTasks = tasks.filter((task) => {
    const query = state.filters.query.toLocaleLowerCase();
    return (!query || `${task.title} ${task.tag}`.toLocaleLowerCase().includes(query))
      && (!state.filters.project || task.tag === state.filters.project)
      && (!state.filters.status || task.status === state.filters.status);
  });
  return `${dateNavigation('day')}
    <section class="panel" aria-label="Add a task">
      <form class="entry-form" id="task-form">
        <input class="text-input task-title-input" name="title" data-focus-key="task-title" placeholder="What are you working on?" autocomplete="off" maxlength="500" required aria-label="Task title">
        <div class="optional-chips" id="optional-chips" hidden>
          <input class="text-input" name="tag" list="project-suggestions" placeholder="Project (optional)" autocomplete="off" maxlength="120" aria-label="Project">
          <input class="text-input" name="mins" placeholder="Time, e.g. 1h30" autocomplete="off" aria-label="Time">
          <label class="sr-only" for="new-repeat">Recurring task</label>
          <select class="select-input" id="new-repeat" name="recurrence" aria-label="Recurring task">
            <option value="">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Every week</option>
          </select>
        </div>
        <datalist id="project-suggestions">${projectOptions}</datalist>
        <button class="button" type="submit">Add task</button>
      </form>
      <div class="add-secondary"><button class="text-button" type="button" data-action="copy-yesterday">Copy yesterday’s unfinished tasks</button></div>
    </section>
    <section class="task-filters" aria-label="Filter tasks">
        <label class="filter-search"><span class="sr-only">Search tasks</span><input class="text-input" id="task-search" data-focus-key="task-search" type="search" value="${escapeHtml(state.filters.query)}" placeholder="Search tasks (/)" autocomplete="off"></label>
        <label><span class="sr-only">Filter by project</span><select class="select-input" id="project-filter" data-focus-key="project-filter"><option value="">All projects</option>${projectFilters.map((project) => `<option value="${escapeHtml(project)}"${state.filters.project === project ? ' selected' : ''}>${escapeHtml(project)}</option>`).join('')}</select></label>
        <label><span class="sr-only">Filter by status</span><select class="select-input" id="status-filter" data-focus-key="status-filter">
          <option value="">All statuses</option><option value="todo"${state.filters.status === 'todo' ? ' selected' : ''}>To do</option><option value="doing"${state.filters.status === 'doing' ? ' selected' : ''}>Doing</option><option value="done"${state.filters.status === 'done' ? ' selected' : ''}>Done</option><option value="blocked"${state.filters.status === 'blocked' ? ' selected' : ''}>Blocked</option>
        </select></label>
    </section>
    <div class="task-list" id="task-list" data-date="${key}">${tasks.map((task, index) => taskMarkup(task, index, tasks, filtered)).join('')}
      <div class="empty-state" id="filter-empty"${visibleTasks.length ? ' hidden' : ''}>${tasks.length || filtered ? 'No tasks match these filters.' : 'No tasks logged for this day yet. Add one above, or copy yesterday’s unfinished tasks.'}</div>
    </div>
    ${tasks.length ? `<p class="task-totals">${done} of ${tasks.length} done · ${formatHours(minutes)} logged</p>` : ''}`;
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
    <section class="panel"><h2 class="panel-title">Summary to share</h2><pre class="summary-text" id="summary-text">${escapeHtml(summary)}</pre><div class="summary-actions"><button class="button" type="button" data-action="copy-summary">Copy summary</button><button class="button button-secondary" type="button" data-action="save-summary">Save as text file</button></div></section>`;
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

function projectColor(project) {
  return /^#[\da-f]{6}$/i.test(project.color || '') ? project.color : '#3B6EA8';
}

function projectEditor(project) {
  const isNew = !project;
  const id = isNew ? '' : escapeHtml(project.id);
  return `<form class="project-edit-form${isNew ? ' project-create-form' : ''}" ${isNew ? 'id="project-create-form"' : `data-project-form="${id}"`}>
    <label class="sr-only" for="project-name-${isNew ? 'new' : id}">Project name</label>
    <input class="text-input" id="project-name-${isNew ? 'new' : id}" name="name" value="${isNew ? '' : escapeHtml(project.name)}" maxlength="120" placeholder="Project name" required>
    <label class="sr-only" for="project-color-${isNew ? 'new' : id}">Project color</label>
    <input class="project-color-input" id="project-color-${isNew ? 'new' : id}" name="color" type="color" value="${isNew ? '#3B6EA8' : projectColor(project)}">
    <button class="button" type="submit">${isNew ? 'Create project' : 'Save'}</button>
    ${isNew ? '' : '<button class="button button-secondary" type="button" data-action="cancel-project-edit">Cancel</button>'}
  </form>`;
}

function projectCard(project) {
  const id = escapeHtml(project.id);
  const color = projectColor(project);
  const archived = Boolean(project.archived);
  const editing = state.editingProjectId === project.id;
  return `<article class="project-card${archived ? ' project-card--archived' : ''}" data-project-color="${color}">
    <button class="project-folder" type="button" data-action="open-project" data-project-id="${id}" aria-label="Open ${escapeHtml(project.name)} project, ${project.tasks} tasks">
      <span class="folder-art" aria-hidden="true"><span class="folder-tab"></span><span class="folder-face"><span class="folder-monogram">${escapeHtml(project.name.trim().slice(0, 1).toLocaleUpperCase())}</span></span></span>
      <span class="project-card-heading"><strong>${escapeHtml(project.name)}</strong>${archived ? '<span class="project-archived-label">Archived</span>' : ''}</span>
      <span class="project-card-stats"><span>${project.tasks} task${project.tasks === 1 ? '' : 's'}</span><span>${formatHours(project.minutes || 0)}</span></span>
      <span class="project-progress" role="img" aria-label="${project.progress}% progress" data-progress="${Math.min(100, Math.max(0, project.progress))}"><span></span></span>
      <span class="project-progress-label">${project.progress}% progress · ${project.done} done</span>
    </button>
    ${editing ? projectEditor(project) : `<div class="project-card-actions">
      <button class="text-button" type="button" data-action="edit-project" data-project-id="${id}">Edit</button>
      <button class="text-button" type="button" data-action="${archived ? 'unarchive-project' : 'archive-project'}" data-project-id="${id}">${archived ? 'Restore' : 'Archive'}</button>
    </div>`}
  </article>`;
}

function projectTaskCard(task, index) {
  const id = escapeHtml(task.id);
  const status = ['todo', 'doing', 'done', 'blocked'].includes(task.status) ? task.status : 'todo';
  const date = formatDate(new Date(`${task.date}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short' });
  return `<button class="project-task" type="button" data-task-index="${Math.min(index, 12)}" data-action="open-project-task" data-task-id="${id}" aria-label="Open task details: ${escapeHtml(task.title)}">
    <span class="project-task-heading"><strong>${escapeHtml(task.title)}</strong><span class="status-chip status-chip--${status}"><span class="status-dot" aria-hidden="true"></span>${status === 'doing' ? 'In progress' : status === 'todo' ? 'To do' : status === 'done' ? 'Done' : 'Blocked'}</span></span>
    <span class="project-task-meta"><span>${escapeHtml(date)}</span>${task.mins ? `<span>${formatHours(task.mins)}</span>` : ''}</span>
  </button>`;
}

function renderProjects() {
  const selected = state.projectFolders.find((project) => project.id === state.selectedProjectId);
  const projects = state.projectFolders.filter((project) => state.showArchivedProjects || !project.archived);
  if (!selected) {
    const activeCount = state.projectFolders.filter((project) => !project.archived).length;
    const archivedCount = state.projectFolders.length - activeCount;
    return `<section class="project-tools panel" aria-label="Create a project">
      <div><h2 class="panel-title">New project</h2><p class="muted">Group related tasks in a folder.</p></div>
      ${projectEditor(null)}
    </section>
    <div class="project-grid-heading"><div><h2>Project folders</h2><p class="muted">${activeCount} active project${activeCount === 1 ? '' : 's'}</p></div>
      ${archivedCount ? `<button class="text-button" type="button" data-action="toggle-archived">${state.showArchivedProjects ? 'Hide' : 'Show'} archived (${archivedCount})</button>` : ''}
    </div>
    ${projects.length ? `<section class="project-grid" aria-label="Projects">${projects.map(projectCard).join('')}</section>` : `<section class="panel project-empty"><h2>No projects yet</h2><p>Create a project above, or assign a project while adding a task.</p></section>`}`;
  }
  const archived = Boolean(selected.archived);
  const edit = state.editingProjectId === selected.id;
  const taskCount = state.projectTasks.length;
  return `<section class="project-stage" data-project-stage data-task-count="${Math.min(taskCount, 13)}">
    <div class="project-stage-folder">
      <div class="project-stage-heading">
        <button class="text-button" type="button" data-action="close-project">← All projects</button>
        <div class="project-stage-actions">
          ${edit ? '' : `<button class="text-button" type="button" data-action="edit-project" data-project-id="${escapeHtml(selected.id)}">Edit</button>
            <button class="text-button" type="button" data-action="${archived ? 'unarchive-project' : 'archive-project'}" data-project-id="${escapeHtml(selected.id)}">${archived ? 'Restore' : 'Archive'}</button>`}
          <button class="icon-button" type="button" data-action="close-project" aria-label="Close project">×</button>
        </div>
      </div>
      ${edit ? projectEditor(selected) : `<div class="project-folder-hero" data-project-color="${projectColor(selected)}">
        <span class="folder-art folder-art--large" aria-hidden="true"><span class="folder-tab"></span><span class="folder-face"><span class="folder-monogram">${escapeHtml(selected.name.trim().slice(0, 1).toLocaleUpperCase())}</span></span></span>
        <div><h2>${escapeHtml(selected.name)}${archived ? ' <span class="project-archived-label">Archived</span>' : ''}</h2><p>${taskCount} task${taskCount === 1 ? '' : 's'} · ${formatHours(selected.minutes || 0)} logged · ${selected.progress}% progress</p></div>
      </div>`}
    </div>
    <section class="project-task-list" aria-label="Tasks in ${escapeHtml(selected.name)}">
      <h3>${taskCount ? 'Tasks' : 'No tasks in this project yet'}</h3>
      ${taskCount ? state.projectTasks.map(projectTaskCard).join('') : '<p class="muted">Tasks assigned to this project will appear here.</p>'}
    </section>
  </section>`;
}

function renderComingSoon(view) {
  const details = ['Your progress, at a glance', 'Activity, trends, and workload insights will appear here in the dashboard update.'];
  return `<section class="panel coming-soon">
    <span class="coming-soon-mark" aria-hidden="true">▦</span>
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
  else if (view === 'projects') content = renderProjects();
  else if (view === 'settings') content = renderSettings();
  else content = renderComingSoon(view);

  return { title, subtitle, content, view };
}
