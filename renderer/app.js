import { state, setTheme } from './state.js';
import { addDays, escapeHtml, formatDate, formatHours, ymd } from './utils.js';
import { renderPage } from './views.js';

const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const viewElement = document.getElementById('view');
const syncElement = document.getElementById('sync');
const toastElement = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const toastUndo = document.getElementById('toast-undo');
const commandDialog = document.getElementById('command-dialog');
const commandInput = document.getElementById('command-input');
const commandOptions = [...document.querySelectorAll('[data-command-view]')];
const detailPanel = document.getElementById('detail-panel');
const shellElement = document.getElementById('shell');
let toastTimer = 0;
let draggedTaskId = '';

function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = state.theme;
}

function setMessage(message, isError = false) {
  syncElement.textContent = message;
  syncElement.classList.toggle('is-error', isError);
}

function render() {
  const activeElement = document.activeElement;
  const focusKey = activeElement?.dataset.focusKey;
  const selectionStart = typeof activeElement?.selectionStart === 'number' ? activeElement.selectionStart : null;
  const page = renderPage();
  pageTitle.textContent = page.title;
  pageSubtitle.textContent = page.subtitle;
  viewElement.innerHTML = page.content;
  viewElement.querySelectorAll('[data-project-color]').forEach((element) => {
    const color = element.dataset.projectColor;
    if (/^#[\da-f]{6}$/i.test(color)) element.style.setProperty('--folder-color', color);
  });
  viewElement.querySelectorAll('[data-progress]').forEach((element) => {
    element.firstElementChild.style.width = `${element.dataset.progress}%`;
  });
  viewElement.querySelectorAll('[data-task-index]').forEach((element) => {
    element.style.setProperty('--task-index', element.dataset.taskIndex);
  });
  const projectStage = viewElement.querySelector('[data-project-stage]');
  if (projectStage) projectStage.style.setProperty('--task-count', projectStage.dataset.taskCount);
  const detailTask = state.projectTasks.find((task) => task.id === state.selectedProjectTaskId);
  shellElement.classList.toggle('has-detail', Boolean(detailTask));
  detailPanel.hidden = !detailTask;
  detailPanel.innerHTML = detailTask ? `<div class="detail-heading"><h2>Task details</h2><button class="icon-button" type="button" data-action="close-task-detail" aria-label="Close task details">×</button></div>
    <div class="detail-task">
      <span class="status-chip status-chip--${['todo', 'doing', 'done', 'blocked'].includes(detailTask.status) ? detailTask.status : 'todo'}"><span class="status-dot" aria-hidden="true"></span>${detailTask.status === 'doing' ? 'In progress' : detailTask.status === 'todo' ? 'To do' : detailTask.status === 'done' ? 'Done' : 'Blocked'}</span>
      <h3>${escapeHtml(detailTask.title)}</h3>
      <dl>
        <div><dt>Project</dt><dd>${escapeHtml(detailTask.tag || 'No project')}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formatDate(new Date(`${detailTask.date}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</dd></div>
        <div><dt>Time logged</dt><dd>${formatHours(detailTask.mins || 0)}</dd></div>
        ${detailTask.estimateMins ? `<div><dt>Estimate</dt><dd>${formatHours(detailTask.estimateMins)}</dd></div>` : ''}
      </dl>
      ${detailTask.notes ? `<section class="detail-notes"><h4>Notes</h4><p>${escapeHtml(detailTask.notes)}</p></section>` : ''}
    </div>` : '';
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === page.view
      || (button.classList.contains('bottom-nav-item') && page.view === 'week' && button.dataset.view === 'today');
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('.mobile-week').hidden = page.view !== 'today';
  document.querySelector('.mobile-settings').setAttribute('aria-pressed', String(page.view === 'settings'));
  if (focusKey) {
    const nextFocus = [...viewElement.querySelectorAll('[data-focus-key]')].find((element) => element.dataset.focusKey === focusKey);
    if (nextFocus) {
      nextFocus.focus({ preventScroll: true });
      if (selectionStart !== null && typeof nextFocus.setSelectionRange === 'function') {
        nextFocus.setSelectionRange(selectionStart, selectionStart);
      }
    }
  }
}

function activeFilters() {
  return Boolean(state.filters.query || state.filters.project || state.filters.status);
}

function applyTaskFilters() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;
  const query = state.filters.query.toLocaleLowerCase();
  const filtered = activeFilters();
  let visible = 0;
  const cards = [...taskList.querySelectorAll('.task-card')];
  cards.forEach((card, index) => {
    const matches = (!query || `${card.dataset.title} ${card.dataset.project}`.includes(query))
      && (!state.filters.project || card.dataset.project === state.filters.project.toLocaleLowerCase())
      && (!state.filters.status || card.dataset.status === state.filters.status);
    card.hidden = !matches;
    if (matches) visible += 1;
    const handle = card.querySelector('.drag-handle');
    handle.draggable = !filtered;
    card.querySelectorAll('[data-action="move"]').forEach((button) => {
      button.disabled = filtered || (button.dataset.direction === '-1' ? index === 0 : index === cards.length - 1);
    });
  });
  taskList.dataset.filtered = String(filtered);
  const empty = document.getElementById('filter-empty');
  if (empty) empty.hidden = visible > 0;
}

async function refreshTasks() {
  const [tasks, projects, folders] = await Promise.all([
    window.ttm.load(),
    window.ttm.listProjects(),
    window.ttm.listProjectFolders(),
  ]);
  state.tasks = Object.assign(Object.create(null), tasks || {});
  state.projects = [...new Set(projects || [])].sort((a, b) => a.localeCompare(b));
  state.projectFolders = folders || [];
}

async function openProject(id) {
  try {
    const project = state.projectFolders.find((item) => item.id === id);
    if (!project) throw new Error('Project not found');
    state.selectedProjectId = id;
    state.selectedProjectTaskId = null;
    state.editingProjectId = null;
    state.projectTasks = await window.ttm.listProjectTasks(String(id));
    render();
    viewElement.querySelector('[data-action="close-project"]')?.focus();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector('[data-project-stage]')?.classList.add('is-open');
    }));
  } catch (error) {
    state.selectedProjectId = null;
    console.error('Could not open project:', error);
    setMessage(error.message || 'Could not open this project.', true);
  }
}

async function closeProject() {
  const stage = document.querySelector('[data-project-stage]');
  const count = stage?.querySelectorAll('.project-task').length || 0;
  if (stage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stage.classList.add('is-closing');
    await new Promise((resolve) => window.setTimeout(resolve, 420 + Math.min(Math.max(count - 1, 0), 12) * 90));
  }
  const previousProjectId = state.selectedProjectId;
  state.selectedProjectId = null;
  state.selectedProjectTaskId = null;
  state.projectTasks = [];
  state.editingProjectId = null;
  render();
  document.querySelector(`[data-action="open-project"][data-project-id="${CSS.escape(String(previousProjectId))}"]`)?.focus();
}

function closeProjectTask() {
  const previousTaskId = state.selectedProjectTaskId;
  state.selectedProjectTaskId = null;
  render();
  document.querySelector(`[data-action="open-project-task"][data-task-id="${CSS.escape(String(previousTaskId))}"]`)?.focus();
}

async function saveProjectForm(form) {
  const values = new FormData(form);
  const project = {
    name: String(values.get('name') || '').trim(),
    color: String(values.get('color') || ''),
  };
  if (!project.name) {
    setMessage('Project name is required.', true);
    form.elements.name.focus();
    return;
  }
  try {
    if (form.id === 'project-create-form') {
      await window.ttm.createProject(project);
    } else {
      await window.ttm.updateProject(form.dataset.projectForm, project);
    }
    await refreshTasks();
    if (state.selectedProjectId !== null) {
      state.projectTasks = await window.ttm.listProjectTasks(String(state.selectedProjectId));
    }
    state.editingProjectId = null;
    render();
    setMessage(form.id === 'project-create-form' ? 'Project created.' : 'Project updated.');
  } catch (error) {
    console.error('Could not save project:', error);
    setMessage(error.message || 'Could not save the project.', true);
  }
}

async function setProjectArchived(id, archived) {
  try {
    await window.ttm.archiveProject(String(id), archived);
    await refreshTasks();
    state.editingProjectId = null;
    render();
    setMessage(archived ? 'Project archived. Its tasks are safe.' : 'Project restored.');
  } catch (error) {
    console.error('Could not update project archive state:', error);
    setMessage(error.message || 'Could not update the project.', true);
  }
}

async function saveTask(task) {
  try {
    const saved = await window.ttm.saveTask(task);
    await refreshTasks();
    state.justAddedTaskId = /^\d+$/.test(String(task.id)) ? '' : saved.id;
    state.editingTaskId = null;
    render();
    if (state.justAddedTaskId) {
      window.setTimeout(() => {
        state.justAddedTaskId = '';
        document.querySelector(`[data-id="${CSS.escape(saved.id)}"]`)?.classList.remove('task-card--entering');
      }, 240);
    }
    setMessage('Saved on this computer.');
    return true;
  } catch (error) {
    console.error('Could not save task:', error);
    setMessage(error.message || 'Could not save the task. Please try again.', true);
    return false;
  }
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toastElement.hidden = true;
  toastUndo.hidden = true;
  delete toastUndo.dataset.taskId;
}

function showToast(message, taskId = '') {
  window.clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toastUndo.hidden = !taskId;
  if (taskId) toastUndo.dataset.taskId = taskId;
  else delete toastUndo.dataset.taskId;
  toastElement.hidden = false;
  toastTimer = window.setTimeout(hideToast, 8000);
}

async function removeTask(id, card) {
  if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.classList.add('task-card--removing');
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  try {
    const deleted = await window.ttm.removeTask(id);
    await refreshTasks();
    render();
    showToast('Task deleted.', deleted.id);
  } catch (error) {
    card?.classList.remove('task-card--removing');
    console.error('Could not delete task:', error);
    setMessage(error.message || 'Could not delete the task. Please try again.', true);
  }
}

async function undoDelete() {
  const id = toastUndo.dataset.taskId;
  if (!id) return;
  toastUndo.disabled = true;
  try {
    await window.ttm.undoTask(id);
    await refreshTasks();
    render();
    hideToast();
    setMessage('Task restored.');
  } catch (error) {
    console.error('Could not restore task:', error);
    setMessage(error.message || 'Could not restore the task.', true);
  } finally {
    toastUndo.disabled = false;
  }
}

async function copySummary(button) {
  const summary = document.getElementById('summary-text');
  if (!summary) return;
  try {
    await navigator.clipboard.writeText(summary.textContent);
    button.textContent = 'Copied';
    setMessage('Weekly summary copied.');
  } catch (error) {
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(summary);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    console.warn('Clipboard access is unavailable:', error);
    setMessage('Could not copy automatically. The summary is selected; copy it manually.', true);
  }
}

async function saveSummary() {
  const summary = document.getElementById('summary-text');
  if (!summary) return;
  try {
    const result = await window.ttm.saveSummary(summary.textContent);
    setMessage(result.saved ? 'Weekly summary saved as a text file.' : 'Save cancelled.');
  } catch (error) {
    console.error('Could not save weekly summary:', error);
    setMessage(error.message || 'Could not save the summary.', true);
  }
}

async function copyYesterday() {
  try {
    const copied = await window.ttm.copyUnfinished(ymd(state.currentDate));
    await refreshTasks();
    render();
    setMessage(copied.length
      ? `Copied ${copied.length} unfinished task${copied.length === 1 ? '' : 's'} from yesterday.`
      : 'There were no unfinished tasks yesterday.');
  } catch (error) {
    console.error('Could not copy yesterday’s tasks:', error);
    setMessage(error.message || 'Could not copy yesterday’s tasks.', true);
  }
}

async function persistOrder(date, ids) {
  try {
    await window.ttm.reorderTasks(date, ids);
    await refreshTasks();
    render();
    setMessage('Task order saved.');
  } catch (error) {
    console.error('Could not save task order:', error);
    try {
      await refreshTasks();
      render();
    } catch (refreshError) {
      console.error('Could not reload tasks after reordering failed:', refreshError);
      setMessage('Could not save the order or reload tasks. Please restart the app.', true);
      return;
    }
    setMessage(error.message || 'Could not save task order.', true);
  }
}

function navigate(view) {
  if (!['today', 'week', 'projects', 'dashboard', 'settings'].includes(view)) return;
  if (view !== 'projects') {
    state.selectedProjectId = null;
    state.selectedProjectTaskId = null;
    state.projectTasks = [];
    state.editingProjectId = null;
  }
  state.activeView = view;
  state.editingTaskId = null;
  render();
}

function updateCommandOptions() {
  const query = commandInput.value.trim().toLocaleLowerCase();
  commandOptions.forEach((option) => {
    option.hidden = !option.textContent.toLocaleLowerCase().includes(query);
    option.classList.remove('is-selected');
  });
  const first = commandOptions.find((option) => !option.hidden);
  first?.classList.add('is-selected');
  document.getElementById('command-empty').hidden = Boolean(first);
}

function openCommandPalette() {
  commandInput.value = '';
  updateCommandOptions();
  if (!commandDialog.open) commandDialog.showModal();
  commandInput.focus();
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventDefault();
    navigate(viewButton.dataset.view);
    return;
  }

  const commandButton = event.target.closest('[data-command-view]');
  if (commandButton) {
    commandDialog.close();
    navigate(commandButton.dataset.commandView);
    return;
  }

  const dateButton = event.target.closest('[data-date-step]');
  if (dateButton) {
    const step = Number(dateButton.dataset.dateStep) * (state.activeView === 'week' ? 7 : 1);
    state.currentDate = addDays(state.currentDate, step);
    render();
    return;
  }

  if (event.target.closest('#toast-undo')) {
    void undoDelete();
    return;
  }
  if (event.target.closest('#toast-close')) {
    hideToast();
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'open-project') {
    void openProject(Number(actionButton.dataset.projectId));
    return;
  }
  if (action === 'close-project') {
    void closeProject();
    return;
  }
  if (action === 'open-project-task') {
    state.selectedProjectTaskId = actionButton.dataset.taskId;
    render();
    detailPanel.querySelector('[data-action="close-task-detail"]')?.focus();
    return;
  }
  if (action === 'close-task-detail') {
    closeProjectTask();
    return;
  }
  if (action === 'edit-project') {
    state.editingProjectId = Number(actionButton.dataset.projectId);
    render();
    viewElement.querySelector('[data-project-form] [name="name"]')?.focus();
    return;
  }
  if (action === 'cancel-project-edit') {
    state.editingProjectId = null;
    render();
    return;
  }
  if (action === 'archive-project' || action === 'unarchive-project') {
    void setProjectArchived(Number(actionButton.dataset.projectId), action === 'archive-project');
    return;
  }
  if (action === 'toggle-archived') {
    state.showArchivedProjects = !state.showArchivedProjects;
    render();
    return;
  }
  if (action === 'copy-summary') {
    void copySummary(actionButton);
    return;
  }
  if (action === 'save-summary') {
    void saveSummary();
    return;
  }
  if (action === 'copy-yesterday') {
    void copyYesterday();
    return;
  }
  if (action === 'edit' || action === 'cancel-edit') {
    const task = actionButton.closest('.task-card');
    state.editingTaskId = action === 'edit' ? task.dataset.id : null;
    render();
    if (action === 'edit') viewElement.querySelector('[data-focus-key="edit-title"]')?.focus();
    return;
  }
  if (action === 'move') {
    if (activeFilters()) return;
    const list = actionButton.closest('.task-list');
    const cards = [...list.querySelectorAll('.task-card')];
    const index = cards.indexOf(actionButton.closest('.task-card'));
    const target = cards[index + Number(actionButton.dataset.direction)];
    if (!target) return;
    if (actionButton.dataset.direction === '-1') list.insertBefore(cards[index], target);
    else list.insertBefore(target, cards[index]);
    void persistOrder(list.dataset.date, [...list.querySelectorAll('.task-card')].map((card) => card.dataset.id));
    return;
  }

  const taskElement = actionButton.closest('.task-card');
  if (!taskElement) return;
  const task = state.tasks[taskElement.dataset.id];
  if (!task) return;
  if (action === 'toggle') {
    void saveTask({ ...task, status: task.status === 'done' ? 'todo' : 'done' });
  } else if (action === 'delete') {
    void removeTask(task.id, taskElement);
  }
});

viewElement.addEventListener('input', (event) => {
  if (event.target.name === 'title' && event.target.form?.id === 'task-form') {
    document.getElementById('optional-chips').hidden = !event.target.value.trim();
    return;
  }
  if (event.target.id === 'task-search') {
    state.filters.query = event.target.value;
    applyTaskFilters();
  }
});

viewElement.addEventListener('change', (event) => {
  if (event.target.id === 'theme-mode') {
    try {
      setTheme(event.target.value);
      applyTheme();
      render();
      setMessage('Theme preference saved.');
    } catch (error) {
      console.error('Could not save theme preference:', error);
      render();
      setMessage('Could not save the theme preference.', true);
    }
    return;
  }
  if (event.target.id === 'project-filter') {
    state.filters.project = event.target.value;
    applyTaskFilters();
    return;
  }
  if (event.target.id === 'status-filter') {
    state.filters.status = event.target.value;
    applyTaskFilters();
    return;
  }
  if (event.target.dataset.action === 'status') {
    const task = state.tasks[event.target.closest('.task-card')?.dataset.id];
    if (task && event.target.value !== task.status) void saveTask({ ...task, status: event.target.value });
  }
});

viewElement.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.id === 'project-create-form' || form.matches('[data-project-form]')) {
    event.preventDefault();
    void saveProjectForm(form);
    return;
  }
  if (form.id === 'task-form') {
    event.preventDefault();
    const values = new FormData(form);
    const title = String(values.get('title') || '').trim();
    const mins = window.keen.parseMinutes(values.get('mins'));
    if (!title) return;
    if (mins == null || mins > 525600) {
      setMessage('Enter time as minutes, 45m, 1.5h, or 1h30.', true);
      form.elements.mins.focus();
      return;
    }
    const task = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      date: ymd(state.currentDate),
      title,
      tag: String(values.get('tag') || '').trim(),
      mins,
      recurrence: String(values.get('recurrence') || ''),
      status: 'todo',
    };
    void saveTask(task).then((saved) => {
      if (saved) form.reset();
    });
    return;
  }

  if (!form.matches('[data-edit-form]')) return;
  event.preventDefault();
  const task = state.tasks[form.dataset.editForm];
  if (!task) return;
  const values = new FormData(form);
  const title = String(values.get('title') || '').trim();
  const mins = window.keen.parseMinutes(values.get('mins'));
  if (!title) {
    setMessage('Task title is required.', true);
    form.elements.title.focus();
    return;
  }
  if (mins == null || mins > 525600) {
    setMessage('Enter time as minutes, 45m, 1.5h, or 1h30.', true);
    form.elements.mins.focus();
    return;
  }
  void saveTask({
    ...task,
    title,
    tag: String(values.get('tag') || '').trim(),
    mins,
    recurrence: String(values.get('recurrence') || ''),
  });
});

viewElement.addEventListener('dragstart', (event) => {
  const handle = event.target.closest('.drag-handle');
  const card = handle?.closest('.task-card');
  if (!card || activeFilters()) {
    event.preventDefault();
    return;
  }
  draggedTaskId = card.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
  card.classList.add('is-dragging');
});

viewElement.addEventListener('dragover', (event) => {
  const card = event.target.closest('.task-card');
  const list = card?.closest('.task-list');
  if (!card || !list || !draggedTaskId || activeFilters()) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const source = list.querySelector(`[data-id="${CSS.escape(draggedTaskId)}"]`);
  if (!source || source === card) return;
  const after = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2;
  list.insertBefore(source, after ? card.nextElementSibling : card);
});

viewElement.addEventListener('drop', (event) => {
  if (!draggedTaskId) return;
  const list = event.target.closest('.task-list');
  if (!list || activeFilters()) return;
  event.preventDefault();
  const ids = [...list.querySelectorAll('.task-card')].map((card) => card.dataset.id);
  draggedTaskId = '';
  void persistOrder(list.dataset.date, ids);
});

viewElement.addEventListener('dragend', () => {
  draggedTaskId = '';
  viewElement.querySelector('.is-dragging')?.classList.remove('is-dragging');
});

toastUndo.addEventListener('click', () => void undoDelete());
document.getElementById('toast-close').addEventListener('click', hideToast);
commandInput.addEventListener('input', updateCommandOptions);
commandDialog.addEventListener('click', (event) => {
  if (event.target === commandDialog) commandDialog.close();
});
commandDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
  const visible = commandOptions.filter((option) => !option.hidden);
  if (!visible.length) return;
  const current = visible.indexOf(document.activeElement);
  if (event.key === 'Enter') {
    const selected = visible.find((option) => option.classList.contains('is-selected')) || visible[0];
    event.preventDefault();
    selected.click();
    return;
  }
  event.preventDefault();
  const next = event.key === 'ArrowDown'
    ? (current + 1 + visible.length) % visible.length
    : (current <= 0 ? visible.length - 1 : current - 1);
  visible.forEach((option, index) => option.classList.toggle('is-selected', index === next));
  visible[next].focus();
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (commandDialog.open) return;
  if (event.key === 'Escape' && state.selectedProjectTaskId) {
    closeProjectTask();
    return;
  }
  if (event.key === 'Escape' && state.editingProjectId !== null) {
    state.editingProjectId = null;
    render();
    return;
  }
  if (event.key === 'Escape' && state.selectedProjectId !== null) {
    void closeProject();
    return;
  }
  if (event.key === 'Escape' && state.editingTaskId) {
    state.editingTaskId = null;
    render();
    return;
  }
  const target = event.target;
  const typing = target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
  if (typing) return;
  if (event.key === 't' || event.key === 'T') {
    state.currentDate = new Date();
    navigate('today');
  } else if (event.key === '/' && state.activeView !== 'today') {
    navigate('today');
    viewElement.querySelector('#task-search')?.focus();
  } else if (event.key === '/' && state.activeView === 'today') {
    event.preventDefault();
    viewElement.querySelector('#task-search')?.focus();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    state.currentDate = addDays(state.currentDate, (event.key === 'ArrowLeft' ? -1 : 1) * (state.activeView === 'week' ? 7 : 1));
    render();
  }
});

applyTheme();
if (state.themeError) {
  console.error('Could not read the theme preference:', state.themeError);
  setMessage('Could not read the saved theme preference. Using the system setting.', true);
}
render();

try {
  await refreshTasks();
  render();
  if (!state.themeError) setMessage('Saved on this computer.');
} catch (error) {
  console.error('Could not load tasks:', error);
  setMessage('Could not load tasks. Please restart the app or check its local storage.', true);
}
