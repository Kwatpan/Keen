export function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function monday(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function formatDate(date, options) {
  return date.toLocaleDateString(undefined, options);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function formatHours(minutes) {
  if (!minutes) return '0h';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ''}${remainder ? `${remainder}m` : ''}`.trim() || '0h';
}
