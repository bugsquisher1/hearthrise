// ════════════════════════════════════════════════════════════════════════
// src/shell/window-sizes.js — A RESIZABLE WINDOW'S SIZE: ITS GRIP, AND THE RESIDUE THAT KEEPS IT.
//
// A row with `resizable: true` (src/data/shell-windows.js: Chat, Tyler 2026-10-22)
// carries a grip at its top-right corner: dragging it right widens the window and
// dragging it up makes it taller (a window held to the bottom-left corner grows
// away from that corner). The size lives in the window manager while dragging
// (wm.setSize) and is written ONCE, on release, to this character's residue
// `winSize` (src/session/residue.js: a display preference that gates and spends
// nothing), so it comes back after a reload. Desktop only: the phone's sheet has
// its own size and no grip (the mobile query hides it).
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.51';

/** The residue adapter for ONE character: { read(id) -> {w, h}|null, write(id, {w, h}) }. */
export function sizeStore(character) {
  const all = () => { const r = character && character.record; const v = r && r.residue && r.residue.winSize; return v && typeof v === 'object' ? v : {}; };
  return {
    read(id) { const s = all()[id]; return Array.isArray(s) && s.length === 2 ? { w: s[0], h: s[1] } : null; },
    write(id, size) {
      if (!character || !size) return;
      character.setResidue('winSize', Object.assign({}, all(), { [id]: [Math.round(size.w), Math.round(size.h)] }));
    },
  };
}

/** The grip's markup for a resizable row (inside its frame). */
export function gripHtml(row) {
  return row.resizable ? '<span class="hs-grip" data-hs-grip="' + esc(row.id) + '" role="separator" aria-label="Resize ' + esc(row.label) + '" title="Drag to resize"></span>' : '';
}

/**
 * A press on a grip: follow the pointer, resize live, save once on release. Returns true when it was a grip.
 * @param {PointerEvent} e
 * @param {{wm: object, store: {write(id:string, s:object):void}, host: Window}} o
 */
export function pressGrip(e, o) {
  const grip = e.target && e.target.closest ? e.target.closest('[data-hs-grip]') : null;
  if (!grip || e.button !== 0) return false;
  const id = grip.getAttribute('data-hs-grip');
  const start = o.wm.sizeOf(id);
  if (!start || !start.h) return false;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const move = (m) => { o.wm.setSize(id, { w: start.w + (m.clientX - sx), h: start.h - (m.clientY - sy) }, true); };
  const up = () => {
    o.host.removeEventListener('pointermove', move);
    o.host.removeEventListener('pointerup', up);
    o.host.removeEventListener('pointercancel', up);
    const now = o.wm.sizeOf(id);
    if (now && (now.w !== start.w || now.h !== start.h)) o.store.write(id, now);
  };
  o.host.addEventListener('pointermove', move);
  o.host.addEventListener('pointerup', up);
  o.host.addEventListener('pointercancel', up);
  return true;
}
