// ============================================================
// src/utils/dom.js — the one HTML escaper every renderer shares.
// Zero-dependency and side-effect-free.
// ============================================================

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
