const validThemes = new Set(['system', 'light', 'dark']);

function readThemePreference() {
  try {
    const preference = localStorage.getItem('keen-theme');
    return { theme: validThemes.has(preference) ? preference : 'system', error: null };
  } catch (error) {
    return { theme: 'system', error };
  }
}

const storedTheme = readThemePreference();

export const state = {
  tasks: Object.create(null),
  activeView: 'today',
  currentDate: new Date(),
  projects: [],
  filters: { query: '', project: '', status: '' },
  editingTaskId: null,
  justAddedTaskId: '',
  theme: storedTheme.theme,
  themeError: storedTheme.error,
};

export function setTheme(theme) {
  if (!validThemes.has(theme)) throw new TypeError('Invalid theme preference');
  const previous = state.theme;
  state.theme = theme;
  try {
    localStorage.setItem('keen-theme', theme);
    state.themeError = null;
  } catch (error) {
    state.theme = previous;
    state.themeError = error;
    throw error;
  }
}
