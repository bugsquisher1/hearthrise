// ============================================================
// src/utils/dom.js
//
// Shared DOM helpers. Extracted from chat.js / settings-page.js /
// market.js / legacy.js to dedupe trivial functions that were
// independently re-implemented in 4+ files.
//
// All helpers are zero-dependency, side-effect-free, and safe to
// import from any module (ESM or wrapped in a classic-script IIFE
// that pulls them off `window.HearthriseDom`).
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

/**
 * Escape characters for use inside an HTML attribute value.
 * Newlines are collapsed to single spaces so the attribute stays
 * on one line — useful for `title="..."` and similar.
 *
 * @param {*} s
 * @returns {string}
 */
export function escapeAttr(s) {
  return escapeHtml(s).replace(/\s+/g, ' ');
}

/**
 * `document.querySelector` with a typed return.
 *
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {T | null}
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * `document.querySelectorAll` returning a real array (so callers
 * can `.map` / `.filter` without spreading).
 *
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {T[]}
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Test whether an element is visible to the user (has dimensions,
 * non-zero opacity, not display:none / visibility:hidden).
 *
 * Used by the UI overlap detector and the chat dock for safe-area
 * checks. Tolerates detached or null elements.
 *
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export function isVisible(el) {
  if (!el) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  let s;
  try { s = getComputedStyle(el); } catch (e) { return false; }
  if (!s) return false;
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  if (parseFloat(s.opacity) === 0) return false;
  return true;
}

// ── Classic-script bridge ─────────────────────────────────────
// Modules wrapped in IIFEs (chat.js, market.js, etc.) can't use
// `import`. They reach for these via `window.HearthriseDom.escapeHtml(...)`.
// ESM modules should always import directly.
if (typeof window !== 'undefined') {
  window.HearthriseDom = { escapeHtml, escapeAttr, qs, qsa, isVisible };
}
