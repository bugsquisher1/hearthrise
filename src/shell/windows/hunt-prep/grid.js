// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep/grid.js — THE BUILDER'S SLOT GRID: 2 x 10 TILES, DRAG TO MOVE, DROP TO SWAP, PRESS TO CONFIGURE.
//
// The HUD's own tiles (.hb-slot, hunt.css) at the HUD's size, numbered 1 to 20, drawn from the
// picked setup's COPY (builder.js sc.draft) with the server's counts beside them. A pointer drag
// lifts a filled tile (a ghost follows the pointer); dropped on an empty slot it moves there, on a
// filled one the two swap (prep-draft.js dropPlan). A press on any tile (or Enter on a focused
// one) opens Configure action on that slot of the COPY, hosted (bar-draft.js openSlotIn): its
// picker and every condition the engine has, and its Save writes back to the copy. Nothing is sent
// from here: the builder's Save sends the whole setup as ONE intent. Pointer events, so a phone's
// finger drags too (a filled tile takes no scroll: windows.css touch-action).
// ════════════════════════════════════════════════════════════════════════
import { text, cls, attr, keyedChild, element } from '../../../render/paint.js?v=0.2.122';
import { actionIconHtml } from '../../widgets/bits.js?v=0.2.122';
import { actionName } from '../../action-facts.js?v=0.2.122';
import { conditionWords, openSlotIn } from '../../bar-draft.js?v=0.2.122';
import { resetConfigureView } from '../configure-action.js?v=0.2.122';
import { dropPlan, SLOTS } from '../../prep-draft.js?v=0.2.122';
import { whole } from '../../../render/format.js?v=0.2.122';
import { t } from '../../../render/player-text.js?v=0.2.122';

/* A pointer that moved this far from its press is a drag, not a press. */
const DRAG_START_PX = 6;
/* The click the browser fires after a drag's pointerup is swallowed for this long. */
const SWALLOW_MS = 400;

function slotHtml(i) {
  return '<li class="hb-slot is-empty" data-slot="' + i + '" data-hs-act="b-slot" role="button" tabindex="0">'
    + '<span class="hb-slot-ico"></span><small class="hb-n">' + (i + 1) + '</small><small class="hb-count"></small><span class="hb-plus" aria-hidden="true"></span></li>';
}

/** The grid's skeleton: the well, twenty tiles, the ghost's home. */
export function gridHtml() {
  let h = '';
  for (let i = 0; i < SLOTS; i++) h += slotHtml(i);
  return '<div class="hpb-gridwrap"><ol class="hpb-grid" aria-label="' + t('prep.bar') + '">' + h + '</ol></div>';
}

const keyOf = (w) => (w && w.action ? w.action.type + ':' + w.action.id : '');

/* The slot's one line for its title: switched off, its rule in words (the same words Configure action reads), or that it fires when ready. */
function whenWords(w) {
  if (w.enabled === false) return t('prep.slot_off');
  const c = Array.isArray(w.conditions) ? w.conditions : [];
  return c.length ? t('bar.setup_when', { conditions: c.map(conditionWords).join(' and ') }) : t('prep.slot_always');
}

/** Patch the tiles from the copy; the counts are the server's (the view's slots, by action). */
export function patchGrid(root, ctx, sc, view, off) {
  const bar = sc.draft ? sc.draft.slots : null;
  const counts = new Map();
  for (const s of view ? view.slots : []) if (s && !s.empty && Number.isInteger(s.count)) counts.set(keyOf(s), s.count);
  const g = sc.drag && sc.drag.on ? sc.drag : null;
  let filled = 0;
  for (const li of root.querySelectorAll('.hpb-grid .hb-slot')) {
    const i = Number(li.getAttribute('data-slot'));
    const w = bar ? bar[i] : null;
    const key = keyOf(w);
    if (w) filled++;
    if (li.getAttribute('data-item') !== key) {
      attr(li, 'data-item', key);
      keyedChild(li.querySelector('.hb-slot-ico'), key, () => element(ctx.doc, actionIconHtml(ctx.glyphs, w.action)));
    }
    cls(li, 'is-empty', !w);
    cls(li, 'is-off', !!w && w.enabled === false);
    cls(li, 'is-busy', off || !bar);
    cls(li, 'is-lifted', !!g && g.from === i);
    cls(li, 'is-drop', !!g && g.over === i && g.from !== i);
    const n = w && counts.has(key) ? counts.get(key) : null;
    text(li.querySelector('.hb-count'), n ? whole(n) : '');
    attr(li, 'aria-label', w ? t('prep.slot_filled', { n: i + 1, name: actionName(w.action) }) + ' ' + whenWords(w) : t('prep.slot_empty', { n: i + 1 }));
    attr(li, 'title', w ? actionName(w.action) + '. ' + whenWords(w) : null);
  }
  text(root.querySelector('.hpb-barcount'), bar ? t('prep.bar_count', { n: filled, max: SLOTS }) : '');
}

/* OPEN CONFIGURE ACTION ON SLOT i OF THE COPY: hosted, so its Save, Empty slot, Earlier and Later write to the copy and send nothing. */
function openOn(ctx, sc, i) {
  const cs = ctx.character;
  const host = {
    bar: () => sc.draft.slots.slice(),
    set: () => sc.view,
    write: (k, slot) => { sc.draft.slots[k] = slot; sc.sorted = false; sc.cleared = false; },
    move: (a, b) => { const s = sc.draft.slots; [s[a], s[b]] = [s[b], s[a]]; sc.sorted = false; },
    after: () => ctx.refresh('hunt-prep'),
  };
  openSlotIn(cs, i, host);
  resetConfigureView(cs);
  ctx.show('configure-action');
  ctx.refresh('configure-action');
}

/* The ghost that follows the pointer: the lifted tile's icon, inside the grid's wrap. */
function ghostOf(wrap, doc, html) {
  let g = wrap.querySelector('.hpb-ghost');
  if (!g) { g = doc.createElement('div'); g.className = 'hpb-ghost'; g.setAttribute('aria-hidden', 'true'); wrap.appendChild(g); }
  g.innerHTML = html;
  return g;
}
function moveGhost(wrap, g, ev) {
  const r = wrap.getBoundingClientRect();
  g.style.transform = 'translate(' + Math.round(ev.clientX - r.left - g.offsetWidth / 2) + 'px, ' + Math.round(ev.clientY - r.top - g.offsetHeight / 2) + 'px)';
}
function endGhost(wrap) { const g = wrap && wrap.querySelector('.hpb-ghost'); if (g) g.remove(); }

/* The tile under the pointer, in this grid, or null. */
function tileAt(doc, grid, ev) {
  const at = doc.elementFromPoint(ev.clientX, ev.clientY);
  const li = at && at.closest ? at.closest('.hb-slot') : null;
  return li && grid.contains(li) ? Number(li.getAttribute('data-slot')) : null;
}

/** A tile's events: the drag (pointer), the press (click, Enter, Space). Returns true when handled. */
export function actGrid(ctx, body, sc, repaint, ev, el) {
  const i = Number(el.getAttribute('data-slot'));
  const grid = el.closest('.hpb-grid'), wrap = el.closest('.hpb-gridwrap');
  const d = sc.draft;
  const now = () => ctx.now();
  switch (ev.type) {
    case 'pointerdown': {
      if ((ev.pointerType === 'mouse' && ev.button !== 0) || !d || sc.pending || !d.slots[i]) return false;
      sc.drag = { from: i, x: ev.clientX, y: ev.clientY, id: ev.pointerId, on: false, over: null };
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer already gone */ }
      return false;
    }
    case 'pointermove': {
      const g = sc.drag;
      if (!g || g.id !== ev.pointerId || !d) return false;
      if (!g.on) {
        if (Math.hypot(ev.clientX - g.x, ev.clientY - g.y) < DRAG_START_PX) return false;
        g.on = true;
        const ghost = ghostOf(wrap, ctx.doc, actionIconHtml(ctx.glyphs, d.slots[g.from].action));
        moveGhost(wrap, ghost, ev);
      } else moveGhost(wrap, wrap.querySelector('.hpb-ghost'), ev);
      const over = tileAt(ctx.doc, grid, ev);
      if (over !== g.over) { g.over = over; repaint(); }
      return true;
    }
    case 'pointerup': case 'pointercancel': {
      const g = sc.drag;
      if (!g || g.id !== ev.pointerId) return false;
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* never captured */ }
      sc.drag = null;
      if (!g.on) return false;
      endGhost(wrap);
      const to = ev.type === 'pointerup' ? tileAt(ctx.doc, grid, ev) : null;
      const plan = d && to !== null ? dropPlan(d.slots, g.from, to) : null;
      if (plan) { d.slots = plan; sc.sorted = false; sc.cleared = false; }
      sc.swallowUntil = now() + SWALLOW_MS;
      repaint();
      return true;
    }
    case 'keydown':
      if (!(ev.key === 'Enter' || ev.key === ' ')) return false;
      if (d && !sc.pending) openOn(ctx, sc, i);
      return true;
    case 'click':
      if (sc.swallowUntil && now() < sc.swallowUntil) { sc.swallowUntil = 0; return true; }
      if (d && !sc.pending) openOn(ctx, sc, i);
      return true;
    default: return false;
  }
}
