// ════════════════════════════════════════════════════════════════════════
// src/shell/context-menu.js — THE ONE RIGHT-CLICK MENU FOR PLAYERS AND MONSTERS.
//
// A target is { kind: 'player', id?, name, slot? } or { kind: 'monster', id }.
// The menu lists the rows of src/data/social-menu.js, in order, that the
// target's kind allows and whose provider says `when(target)`; it knows no
// system itself. Providers are handed in by the shell (src/shell/menu-providers.js
// assembles them: the social side's own, the party's, Look). A press runs the
// entry's `run(target, ui)`; an answer { say } stays in the menu as words (Look),
// anything else closes it, and a refusal ({ ok:false, error }) is said in place.
//
// Where it opens: a right-click (contextmenu) or a long press (touch, 500 ms)
// on any element carrying data-hs-player (chat names, the friends list, party
// rows), and on whatever `attach(el, resolve)` hands it (the World's picked
// units). It draws through the page's one floating menu (./windows/float-menu.js:
// Esc and a press outside close it, arrows move between entries), which lives
// at page level — a press on it never reaches the World; the click a long
// press leaves behind is swallowed too.
// ════════════════════════════════════════════════════════════════════════
import { MENU_ENTRIES } from '../data/social-menu.js?v=0.2.8';
import { refusalWords } from './intent-words.js?v=0.2.8';
import { openFloatMenu, closeFloatMenu } from './windows/float-menu.js?v=0.2.8';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.8';
import { attr } from '../render/paint.js?v=0.2.8';

const LONG_PRESS_MS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The player an element names (data-hs-player-id / -name / -slot), or null. */
export function playerTargetOf(el) {
  const at = el && el.closest ? el.closest('[data-hs-player]') : null;
  if (!at) return null;
  const id = at.getAttribute('data-hs-player-id');
  const name = (at.getAttribute('data-hs-player-name') || '').trim().slice(0, 24);
  const slot = Number(at.getAttribute('data-hs-player-slot'));
  if (!(id && UUID.test(id)) && !name) return null;
  return { kind: 'player', id: id && UUID.test(id) ? id : null, name: name || 'Adventurer', slot: Number.isInteger(slot) && at.hasAttribute('data-hs-player-slot') ? slot : null };
}

/** Mark (or, for null, unmark) an element as naming a player, so the menu opens on it: { id?, name, slot? }. */
export function markPlayer(el, p) {
  attr(el, 'data-hs-player', !!p);
  attr(el, 'data-hs-player-id', p && p.id ? p.id : null);
  attr(el, 'data-hs-player-name', p ? p.name : null);
  attr(el, 'data-hs-player-slot', p && Number.isInteger(p.slot) ? p.slot : null);
}

/** The entries a target gets, in row order: [{ id, label, run }]. Pure over the providers. */
export function entriesFor(target, providers) {
  if (!target) return [];
  const out = [];
  for (const row of MENU_ENTRIES) {
    if (row.hidden || !row.targets.includes(target.kind)) continue;
    const e = providers && providers[row.provider] && providers[row.provider][row.id];
    if (!e || typeof e.run !== 'function') continue;
    let on = false;
    try { on = typeof e.when !== 'function' || e.when(target) === true; } catch (err) { on = false; }
    if (on) out.push({ id: row.id, label: typeof row.label === 'function' ? row.label(target) : row.label, run: e.run });
  }
  return out;
}

/**
 * @param {object} ctx            the shell context (ctx.doc, ctx.show)
 * @param {Element[]} roots       where data-hs-player targets live (the shell layers)
 * @param {() => object} providers  the current providers (read at each open)
 */
export function mountContextMenu(ctx, roots, providers) {
  const doc = ctx.doc;
  const view = doc.defaultView;
  let press = 0;
  let start = null;
  let swallowUntil = 0;
  const offs = [];
  const ui = { open: (id) => ctx.show(id) };
  let alive = true;

  function open(target, at) {
    const list = entriesFor(target, providers());
    if (!list.length) return false;
    const title = target.kind === 'player' ? target.name : (target.title || target.id);
    const html = '<b class="hw-menu-title">' + esc(title) + '</b>'
      + list.map((e) => '<button type="button" role="menuitem" class="hw-mi" data-hs-act="' + esc(e.id) + '">' + esc(e.label) + '</button>').join('')
      + '<p class="hw-menu-say" role="status" hidden></p>';
    const say = (text) => {
      const el = doc.querySelector('.hw-menu .hw-menu-say');
      if (!el) return;
      el.textContent = text;
      el.hidden = false;
    };
    openFloatMenu(doc, html, at, {
      label: 'Actions for ' + title,
      onAct: (action, ev, btn) => {
        const e = list.find((x) => x.id === action);
        if (!e) return;
        ev.stopPropagation();
        btn.disabled = true;
        Promise.resolve(e.run(target, ui)).then((r) => {
          if (r && typeof r.say === 'string') { say(r.say); btn.disabled = false; return; }
          if (r && r.ok === false) { say(refusalWords(r.error)); btn.disabled = false; return; }
          closeFloatMenu(doc);
        }, () => { say('That did not work. Try again.'); btn.disabled = false; });
      },
      onClose: () => {},
      alive: () => alive,
    });
    return true;
  }

  function onContext(e, resolve) {
    const t = resolve(e);
    if (!t) return;
    if (open(t, { x: e.clientX, y: e.clientY })) { e.preventDefault(); e.stopPropagation(); }
  }
  function onDown(e, resolve) {
    if (!e.pointerType || e.pointerType === 'mouse') return;
    const t = resolve(e);
    if (!t) return;
    const x = e.clientX, y = e.clientY;
    start = { x, y };
    view.clearTimeout(press);
    press = view.setTimeout(() => { if (open(t, { x, y })) swallowUntil = Date.now() + 800; }, LONG_PRESS_MS);
  }
  function onUp() { view.clearTimeout(press); }
  /* A finger that moves is scrolling or dragging, not pressing. */
  function onMove(e) { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) onUp(); }
  /* The click a long press leaves behind must not walk the hero or press a button under the finger. */
  function onClickCapture(e) {
    if (Date.now() < swallowUntil && !(e.target.closest && e.target.closest('.hw-menu'))) { e.preventDefault(); e.stopPropagation(); swallowUntil = 0; }
  }

  function attach(el, resolve) {
    const c = (e) => onContext(e, resolve);
    const d = (e) => onDown(e, resolve);
    el.addEventListener('contextmenu', c);
    el.addEventListener('pointerdown', d);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointermove', onMove);
    offs.push(() => {
      el.removeEventListener('contextmenu', c);
      el.removeEventListener('pointerdown', d);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointermove', onMove);
    });
  }

  const fromDom = (e) => playerTargetOf(e.target);
  for (const r of roots) attach(r, fromDom);
  doc.addEventListener('click', onClickCapture, true);

  return {
    open,
    attach,
    destroy() {
      alive = false;
      view.clearTimeout(press);
      for (const off of offs) off();
      doc.removeEventListener('click', onClickCapture, true);
      closeFloatMenu(doc);
    },
  };
}
