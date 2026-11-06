'use strict';

function parseMinutes(input) {
  if (input == null || input === '') return 0;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  }

  const value = String(input).trim().toLowerCase();
  if (!value) return 0;

  let match = value.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m?(?:in)?)?$/);
  if (match) return Math.round(Number(match[1]) * 60 + (match[2] ? Number(match[2]) : 0));
  match = value.match(/^(\d+)\s*m(?:in(?:s|utes)?)?$/);
  if (match) return Number(match[1]);
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.round(Number(value));
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = parseMinutes;
} else {
  globalThis.keen = globalThis.keen || {};
  globalThis.keen.parseMinutes = parseMinutes;
}
