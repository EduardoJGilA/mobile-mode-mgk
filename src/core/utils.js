/**
 * Shared helpers for Mobile Mode MGK
 */
const MODULE_ID = "mobile-mode-mgk";

export { MODULE_ID };

/** Escape a value for safe interpolation into innerHTML. */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Localize a key under the module namespace, falling back to the given text. */
export function t(key, fallback) {
  const full = `MOBILE_MODE_MGK.${key}`;
  const out = game.i18n.localize(full);
  return out === full ? (fallback ?? key) : out;
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/** Format a modifier with an explicit sign. */
export function signed(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}
