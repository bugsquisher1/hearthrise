// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher-names.js — HOLD AN ICON, READ ITS NAME.
//
// A phone has no hover (playtest 2026-10-31: fifteen icons with no words, and a
// long press on one opened its window with nothing said). A finger held on an icon
// shows the icon's name in a bubble under it; letting go opens nothing, the bubble
// stays a moment to be read. A plain tap still opens the window at once. The sheet
// behind "Heroes" lists every icon by name for a player who has not thought of
// holding one (src/shell/windows/characters.js). Display only.
// ════════════════════════════════════════════════════════════════════════
const HOLD_MS = 400;
const READ_MS = 1500;
const STRAY_PX = 8;
const EDGE_PX = 4;

/** @param {Document} doc  @returns {{destroy(): void}} */
export function mountLauncherNames(doc) {
  const win = doc.defaultView;
  let timer = 0, leave = 0, start = null, swallow = false, bubble = null;

  function hide() { win.clearTimeout(leave); if (bubble) { bubble.remove(); bubble = null; } }
  function show(icon) {
    hide();
    bubble = doc.createElement('p');
    bubble.className = 'hs-launch-name';
    bubble.setAttribute('role', 'status');
    bubble.textContent = icon.getAttribute('data-tip');
    doc.body.appendChild(bubble);
    const r = icon.getBoundingClientRect();
    const w = bubble.offsetWidth;
    bubble.style.left = Math.round(Math.max(EDGE_PX, Math.min(win.innerWidth - w - EDGE_PX, r.left + r.width / 2 - w / 2))) + 'px';
    bubble.style.top = Math.round(r.bottom + EDGE_PX) + 'px';
  }
  function onDown(e) {
    const icon = e.pointerType === 'touch' && e.target.closest ? e.target.closest('.hs-launch') : null;
    win.clearTimeout(timer);
    if (!icon) return;
    start = { x: e.clientX, y: e.clientY };
    swallow = false;
    timer = win.setTimeout(() => { swallow = true; show(icon); }, HOLD_MS);
  }
  function onMove(e) { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > STRAY_PX) { win.clearTimeout(timer); start = null; } }
  function onUp() {
    win.clearTimeout(timer);
    start = null;
    if (bubble) { win.clearTimeout(leave); leave = win.setTimeout(hide, READ_MS); }
  }
  /* The click a hold leaves behind opens nothing; Android's own long-press menu has nothing to say about an icon. */
  function onClick(e) { if (swallow && e.target.closest && e.target.closest('.hs-launch')) { e.preventDefault(); e.stopPropagation(); } swallow = false; }
  function onContext(e) { if (e.target.closest && e.target.closest('.hs-launch')) e.preventDefault(); }

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointermove', onMove, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onUp, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('contextmenu', onContext, true);
  return {
    destroy() {
      win.clearTimeout(timer);
      hide();
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('contextmenu', onContext, true);
    },
  };
}
