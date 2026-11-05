import { state, setTheme } from './state.js';
import { addDays, ymd } from './utils.js';
import { renderPage } from './views.js';

const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const viewElement = document.getElementById('view');
const syncElement = document.getElementById('sync');

function applyTheme() {
  if (state.theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = state.theme;
  }
}

function setMessage(message, isError = false) {
  syncElement.textContent = message;
  syncElement.classList.toggle('is-error', isError);
}

function render() {
  const page = renderPage();
  pageTitle.textContent = page.title;
  pageSubtitle.textContent = page.subtitle;
  viewElement.innerHTML = page.content;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === page.view
      || (button.classList.contains('bottom-nav-item') && page.view === 'week' && button.dataset.view === 'today');
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('.mobile-week').hidden = page.view !== 'today';
  document.querySelector('.mobile-settings').setAttribute('aria-pressed', String(page.view === 'settings'));
}

function taskDate() {
  return ymd(state.currentDate);
}

async function saveTask(task) {
  try {
    const row = await window.ttm.saveTask(task);
    if (String(task.id) !== row.id) delete state.tasks[task.id];
    state.tasks[row.id] = row;
    render();
    setMessage('Saved on this computer.');
  } catch (error) {
    console.error('Could not save task:', error);
    setMessage('Could not save the task. Please try again.', true);
  }
}

async function removeTask(id) {
  try {
    await window.ttm.removeTask(id);
    delete state.tasks[id];
    render();
    setMessage('Task deleted.');
  } catch (error) {
    console.error('Could not delete task:', error);
    setMessage('Could not delete the task. Please try again.', true);
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

function navigate(view) {
  if (!['today', 'week', 'projects', 'dashboard', 'settings'].includes(view)) return;
  state.activeView = view;
  render();
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventDefault();
    navigate(viewButton.dataset.view);
    return;
  }

  const dateButton = event.target.closest('[data-date-step]');
  if (dateButton) {
    const step = Number(dateButton.dataset.dateStep) * (state.activeView === 'week' ? 7 : 1);
    state.currentDate = addDays(state.currentDate, step);
    render();
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'copy-summary') {
    void copySummary(actionButton);
    return;
  }
  const taskElement = actionButton.closest('.task-card');
  if (!taskElement) return;
  const task = state.tasks[taskElement.dataset.id];
  if (!task) return;
  if (actionButton.dataset.action === 'toggle') {
    void saveTask({ ...task, status: task.status === 'done' ? 'todo' : 'done' });
  } else if (actionButton.dataset.action === 'block') {
    void saveTask({ ...task, status: task.status === 'blocked' ? 'todo' : 'blocked' });
  } else if (actionButton.dataset.action === 'delete') {
    void removeTask(task.id);
  }
});

viewElement.addEventListener('submit', (event) => {
  if (event.target.id !== 'task-form') return;
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const title = String(values.get('title') || '').trim();
  if (!title) return;
  const task = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: taskDate(),
    title,
    tag: String(values.get('tag') || '').trim(),
    mins: Number(values.get('mins')) || 0,
    status: 'todo',
    created: Date.now(),
  };
  form.reset();
  void saveTask(task);
});

viewElement.addEventListener('change', (event) => {
  if (event.target.id !== 'theme-mode') return;
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
});

applyTheme();
if (state.themeError) {
  console.error('Could not read the theme preference:', state.themeError);
  setMessage('Could not read the saved theme preference. Using the system setting.', true);
}
render();

try {
  state.tasks = (await window.ttm.load()) || Object.create(null);
  render();
  if (!state.themeError) setMessage('Saved on this computer.');
} catch (error) {
  console.error('Could not load tasks:', error);
  setMessage('Could not load tasks. Please restart the app or check its local storage.', true);
}
