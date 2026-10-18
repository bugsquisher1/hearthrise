// ════════════════════════════════════════════════════════════════════════
// src/render/paint.js — BUILD ONCE, PATCH IN PLACE.
//
// Every hunt panel (src/shell/widgets/*, src/shell/windows/*) builds its DOM
// once and, on every envelope and every display tick, writes only what changed
// through these helpers. Nothing here rebuilds a host with innerHTML on a
// timer: a text node is rewritten only when its text differs, an attribute only
// when its value differs, and a list is KEYED, so a row that stayed keeps its
// node (an open <select>, a hover, a scroll position all survive the repaint).
//
//   text(el, v)          textContent, skipped when equal
//   attr(el, name, v)    setAttribute / removeAttribute (v null|false), skipped when equal
//   cls(el, name, on)    classList.toggle, skipped when already so
//   prop(el, name, v)    a DOM property (disabled, value, checked), skipped when equal
//   style(el, name, v)   one inline style property, skipped when equal
//   rows(host, items, o) keyed rows: o.key(item) → string, o.build(item) → Element
//                        (called once per new key), o.patch(el, item) (every time);
//                        a key that left is removed; order follows `items`
//
// writes() counts every DOM write this module made (tests read it to prove an
// unchanged repaint writes nothing). PURE apart from the elements it is handed.
// ════════════════════════════════════════════════════════════════════════

let WRITES = 0;
const KEYED = new WeakMap();

/** How many DOM writes this module has made since load (a test probe). */
export function writes() { return WRITES; }

export function text(el, v) {
  if (!el) return false;
  const s = v == null ? '' : String(v);
  if (el.textContent === s) return false;
  el.textContent = s;
  WRITES++;
  return true;
}

export function attr(el, name, v) {
  if (!el) return false;
  if (v === null || v === undefined || v === false) {
    if (!el.hasAttribute(name)) return false;
    el.removeAttribute(name);
  } else {
    const s = v === true ? '' : String(v);
    if (el.getAttribute(name) === s) return false;
    el.setAttribute(name, s);
  }
  WRITES++;
  return true;
}

export function cls(el, name, on) {
  if (!el || el.classList.contains(name) === !!on) return false;
  el.classList.toggle(name, !!on);
  WRITES++;
  return true;
}

export function prop(el, name, v) {
  if (!el || el[name] === v) return false;
  el[name] = v;
  WRITES++;
  return true;
}

export function style(el, name, v) {
  if (!el) return false;
  const s = v == null ? '' : String(v);
  if (el.style.getPropertyValue(name) === s) return false;
  if (s) el.style.setProperty(name, s); else el.style.removeProperty(name);
  WRITES++;
  return true;
}

/**
 * Keyed rows under `host`. Each row element is built once for its key and
 * patched in place afterwards; rows whose key left are removed.
 * @param {Element} host
 * @param {any[]} items
 * @param {{key:(i:any)=>string, build:(i:any)=>Element, patch:(el:Element,i:any)=>void}} o
 */
export function rows(host, items, o) {
  if (!host) return;
  let held = KEYED.get(host);
  if (!held) { held = new Map(); KEYED.set(host, held); }
  const next = new Map();
  for (const it of items) {
    const k = String(o.key(it));
    if (next.has(k)) continue;
    let el = held.get(k);
    if (!el) { el = o.build(it); el.setAttribute('data-key', k); WRITES++; }
    o.patch(el, it);
    next.set(k, el);
  }
  for (const [k, el] of held) if (!next.has(k)) { el.remove(); WRITES++; }
  let ref = host.firstElementChild;
  for (const el of next.values()) {
    if (el === ref) { ref = ref.nextElementSibling; continue; }
    host.insertBefore(el, ref);
    WRITES++;
  }
  KEYED.set(host, next);
}

/** One element from a markup string (a row's skeleton). */
export function element(doc, markup) {
  const t = doc.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}
