// ════════════════════════════════════════════════════════════════════════
// src/shell/hud-room.js — EVERY HUD PANEL STAYS REACHABLE AT EVERY DESKTOP SIZE.
//
// The friends' panel, 2026-11-01: below about 1550 px wide and 820 px tall the Hunt analyzer, and a party's Party
// panel at any height, landed 5 px above the window's foot. The bar spans the row there, so hud.js clearOfEdges had
// no left that cleared them and "stepped them down" below the bar: off a page that does not scroll, with friends' HP,
// XP per hour and Remove on it. THE RULE NOW (desktop; the phone keeps its own, hunt.css):
//   a top-corner panel ENDS ABOVE THE BAR and scrolls inside (--hs-room, read by its CSS), so the bar neither pushes it
//     nor slides for it (Tyler 10-22: the bar never travels for something else);
//   a panel the player moved is theirs, but never lies behind the bar at a smaller window: it rises clear of it;
//   the alerts and the players-online line draw over every window (.hs-screen), so THEY move: right past the panels and
//     windows in their row, and when none clears they wait hidden, as a widget does under the dock (the strip's badge
//     still counts them). An alert never takes a press from Chat or the party.
// DOM reads and style writes only. Each writes only what changed, and reads no height of its own to set its room,
// so the size change a write causes settles in the next pass (shell.js's observer).
// ════════════════════════════════════════════════════════════════════════
import { DOCK_CAP_MIN_PX, liftOverBars, panelRoom, placeWidget, slideClear, stackRoom } from './hud.js?v=0.2.129';

/* A stack of alerts is never squeezed shorter than one alert with its button. */
const ALERTS_MIN_ROOM = 120;
/* The stack's width (windows.css .hw-alert-list), and the narrowest it still reads at. */
const ALERT_WIDE = 360;
const ALERT_NARROW = 260;
const BOTTOM_BAR = 'bc';

/**
 * @param {object} o
 * @param {object} o.hud                createHud's API
 * @param {HTMLElement} o.worldHud      the World's widgets
 * @param {HTMLElement} o.screenHud     the screen's widgets (the alerts, the players online)
 * @param {HTMLElement} o.layer         the windows
 * @param {() => boolean} o.isPhone
 * @param {number} o.gap
 */
export function createHudRoom({ hud, worldHud, screenHud, layer, isPhone, gap }) {
  const relTo = (box) => { const b = box.getBoundingClientRect(); return (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; }; };
  const worldEls = () => Array.from(worldHud.querySelectorAll('[data-hs-widget]'));
  const idOf = (e) => e.getAttribute('data-hs-widget');
  const isBar = (e) => hud.layoutOf(idOf(e)).anchor === BOTTOM_BAR;
  const setRoom = (el, r) => {
    const v = r === null || r === undefined ? '' : r + 'px';
    if (el.style.getPropertyValue('--hs-room') === v) return;
    if (v) el.style.setProperty('--hs-room', v); else el.style.removeProperty('--hs-room');
  };

  /* A panel's height with its list unsqueezed. Its own cap is what the room above it left, so reading the box alone kept a capped Tally at its 32 px
     head for good, its line out of sight (newcomer panel 2026-11-01: "Gray Wolves 1/200" never showed at 1366x768). */
  const wholeHeight = (el) => { const l = el.querySelector('.hs-tally-list'); return el.offsetHeight + (l ? Math.max(0, l.scrollHeight - l.clientHeight) : 0); };

  /* The bars where they sit with nothing in their way: a bar that slid for a docked window must not change whose column it crosses. */
  function barsAtHome() {
    const rel = relTo(worldHud), box = { width: worldHud.clientWidth, height: worldHud.clientHeight };
    return worldEls().filter(isBar).map((e) => {
      const q = rel(e);
      return Object.assign(q, { left: placeWidget(hud.layoutOf(idOf(e)), box, { width: q.width, height: q.height }).left });
    });
  }

  /* --hs-room per panel. The stack first (hud.js stackRoom: the analyzer leaves room for the Tally under it); on a desktop every
     top-corner panel then ends above the floor, and an analyzer that cannot leave the Tally its room keeps a readable height,
     the Tally taking what is left. A moved panel may sit anywhere: its room is its column's, from the top. */
  function roomForStack() {
    const phone = isPhone();
    const rel = relTo(worldHud), height = worldHud.getBoundingClientRect().height;
    const els = worldEls();
    const bars = phone ? els.filter(isBar).map(rel) : barsAtHome();
    const room = new Map();
    const take = (el, r) => room.set(el, r === null ? (room.get(el) ?? null) : Math.min(r, room.get(el) ?? r));
    for (const row of hud.rows()) {
      const el = row.below && worldHud.querySelector('[data-hs-widget="' + row.id + '"]');
      for (const id of row.below || []) {
        const a = worldHud.querySelector('[data-hs-widget="' + id + '"]');
        if (!a) continue;
        const stacked = el && el.offsetWidth && !hud.isMoved(row.id) && !hud.isMoved(id);
        const r = stacked ? stackRoom(rel(a), phone ? rel(el) : Object.assign(rel(el), { height: wholeHeight(el) }), bars, height, gap) : null;
        const crosses = stacked && !phone && rel(el).left < rel(a).left + rel(a).width && rel(el).left + rel(el).width > rel(a).left;
        take(a, r === null && crosses ? DOCK_CAP_MIN_PX : r);
      }
    }
    for (const e of els) {
      if (phone) { if (!room.has(e)) room.set(e, null); continue; }
      const L = hud.layoutOf(idOf(e)), moved = hud.isMoved(idOf(e));
      if (L.anchor === BOTTOM_BAR || (!moved && (L.anchor[0] !== 't' || L.anchor[1] === 'c'))) continue;
      const q = rel(e);
      take(e, panelRoom(moved ? Object.assign(q, { top: 0 }) : q, bars, height, gap));
    }
    for (const [el, r] of room) setRoom(el, r);
  }

  /* A panel the player moved, clamped on screen by placeWidget, rises clear of a bar it would lie behind: a window made smaller
     spans the bar under the corner it was left in. */
  function liftMoved() {
    if (isPhone()) return;
    const rel = relTo(worldHud), bars = barsAtHome();
    for (const e of worldEls()) {
      if (!hud.isMoved(idOf(e)) || !e.offsetWidth) continue;
      const q = rel(e), top = liftOverBars(q, bars, gap);
      if (top !== Math.round(q.top)) e.style.top = top + 'px';
    }
  }

  /* What a plate over the World must not lie on, in the screen's px: the panels, and every window that is staying. A panel
     waiting under the dock is not there. The bar is the alerts' floor and the hunt bar their ceiling, not something to slide past. */
  function inTheWay() {
    const rel = relTo(screenHud);
    const panels = worldEls().filter((e) => e.offsetWidth && !isBar(e) && hud.layoutOf(idOf(e)).anchor !== 'tc' && !e.classList.contains('is-under-dock'));
    return panels.concat(Array.from(layer.querySelectorAll('.hs-win:not(.is-leaving)'))).map(rel);
  }

  /* The band the alerts may stand in: under the hunt bar and its coach card, above the action bar. */
  function alertBand() {
    const rel = relTo(screenHud), hudBox = rel(worldHud);
    const bars = worldEls().filter(isBar).map(rel);
    const floor = (bars.length ? Math.min(...bars.map((q) => q.top)) : hudBox.top + hudBox.height) - gap;
    const over = Array.from(worldHud.querySelectorAll('[data-hs-widget="hunt-topbar"], [data-hs-widget="hunt-topbar"] > .hs-pointer:not(.is-min)')).map(rel);
    const ceil = Math.max(hudBox.top, ...over.map((q) => q.top + q.height)) + gap;
    return { floor, ceil: Math.min(ceil, floor - ALERTS_MIN_ROOM) };
  }

  /* The screen's plates, after the World's panels have settled. */
  function clearPlates() {
    const alerts = screenHud.querySelector('[data-hs-widget="alerts"]');
    const online = screenHud.querySelector('[data-hs-widget="online"]');
    if (isPhone()) { if (alerts) setRoom(alerts, null); return; }
    const rel = relTo(screenHud), width = screenHud.clientWidth;
    const way = inTheWay();
    const shown = alerts && !alerts.querySelector('.hw-alerts.is-empty');
    if (alerts) {
      const { floor, ceil } = alertBand();
      setRoom(alerts, shown ? Math.floor(floor - ceil) : null);
      if (shown) {
        const q = rel(alerts);
        const top = Math.round(Math.max(ceil, Math.min(q.top, floor - q.height)));
        /* Its own width first; between a Party panel, Chat and the analyzer at a laptop's width, the narrow card still fits. */
        let left = slideClear(Object.assign(q, { top, width: ALERT_WIDE }), way, width, gap);
        const narrow = left === null;
        if (narrow) left = slideClear(Object.assign(q, { width: ALERT_NARROW }), way, width, gap);
        const w = narrow && left !== null ? ALERT_NARROW + 'px' : '';
        if (alerts.style.getPropertyValue('--hs-alert-w') !== w) { if (w) alerts.style.setProperty('--hs-alert-w', w); else alerts.style.removeProperty('--hs-alert-w'); }
        alerts.classList.toggle('is-under-dock', left === null);
        alerts.style.top = top + 'px';
        if (left !== null) { alerts.style.left = left + 'px'; way.push(Object.assign(q, { left })); }
      } else alerts.classList.remove('is-under-dock');
    }
    if (online) {
      const left = slideClear(rel(online), way, width, gap);
      online.classList.toggle('is-under-dock', left === null);
      if (left !== null) online.style.left = left + 'px';
    }
  }

  return { roomForStack, liftMoved, clearPlates };
}
