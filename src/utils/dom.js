// ============================================================
// src/utils/dom.js — the one HTML escaper every renderer shares, and the one
// rule for who owns a key press. Zero-dependency and side-effect-free.
// ============================================================

/* The inputs a player TYPES into (a checkbox, a range or a button is not one). */
const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'password', 'number', 'tel', 'url']);

/**
 * THE ONE KEY RULE (Tyler 10-18: "WASD stops working when a menu panel is
 * open... it must only stop while a text input has focus"). True when a key
 * press belongs to the focused element `t` and not to the game (the World's
 * walk keys, the windows' shortcut letters): a text field, a text area or an
 * editable box takes every key; a focused select takes only the arrows, which
 * change its value. An open window, a focused button, pocket or checkbox never
 * takes a key. Reads only tagName / type / isContentEditable, so a plain object
 * stands in for an element in a test.
 * @param {object|null} t   the event's target
 * @param {string} [key]    KeyboardEvent.key or .code
 */
export function keyBelongsToField(t, key) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = String(t.tagName || '').toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'select') return /^Arrow/.test(String(key || ''));
  if (tag !== 'input') return false;
  const type = String(t.type != null ? t.type : (typeof t.getAttribute === 'function' && t.getAttribute('type')) || '').toLowerCase();
  return TEXT_TYPES.has(type);
}

/**
 * Escape characters that have special meaning in HTML so that
 * untrusted text can be safely interpolated into innerHTML.
 *
 * @param {*} s — coerced to string. `null`/`undefined` → empty string.
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
