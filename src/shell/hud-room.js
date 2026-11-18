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
// NOTHING DOCKS WHERE THE HERO STANDS (audit 2026-11-15 F1, F13). The camera frames the hero in the middle of the World the docked panels
// leave (shell.js insetNow), so a card hung under the centred hunt bar lay on the hero, and an alert slid past the Party panel landed there:
//   the hunt's coach card stands in the LEFT COLUMN under the top-left panels (dockCoach), a column the camera already frames beside; with
//     no room there it keeps only its title under the hunt bar, and an alert that needs the column's room folds it to its title the same way;
//   an alert takes a place clear of the hero's spot whenever one clears, and is never hidden for it; where none clears (a laptop with Chat
//     open), the camera frames the World beside the alert, as it does beside a panel (shell.js insetNow).
// DOM reads and style writes only. Each writes only what changed, and reads no height of its own to set its room,
// so the size change a write causes settles in the next pass (shell.js's observer).
// ════════════════════════════════════════════════════════════════════════
import { DOCK_CAP_MIN_PX, liftOverBars, panelRoom, placeWidget, slideClear, stackRoom } from './hud.js?v=0.2.140';

/* A stack of alerts is never squeezed shorter than one alert with its button. */
const ALERTS_MIN_ROOM = 120;
/* The stack's width (windows.css .hw-alert-list), and the narrowest it still reads at. */
const ALERT_WIDE = 360;
const ALERT_NARROW = 260;
const BOTTOM_BAR = 'bc';
const HUNT_BAR = 'hunt-topbar';
/* On a phone the analyzer ends this far over the action bar (hunt.css's phone cap, 100vh - 219px under a 103 px hunt bar foot) */
const PHONE_BAR_GAP = 2;
/* The least room the hunt's coach card docks into (its title, three lines and its foot), and the card's width (shell.css .hs-pointer). */
const COACH_MIN_ROOM = 120;
const COACH_WIDE = 260;
/* The hero's spot around the point the camera frames: the sprite with its name plate and bars (docs/ART_DIRECTION.md §4: about 40 art px, drawn at up to x3). */
const HERO_HALF_W = 48, HERO_UP = 80, HERO_DOWN = 44;

/**
 * @param {object} o
 * @param {object} o.hud                createHud's API
 * @param {HTMLElement} o.worldHud      the World's widgets
 * @param {HTMLElement} o.screenHud     the screen's widgets (the alerts, the players online)
 * @param {HTMLElement} o.layer         the windows
 * @param {() => boolean} o.isPhone
 * @param {number} o.gap
 * @param {() => ({x: number, y: number}|null)} [o.heroAt]  where the camera frames the hero, in page px; null with no hunt on screen
 */
export function createHudRoom({ hud, worldHud, screenHud, layer, isPhone, gap, heroAt }) {
  const relTo = (box) => { const b = box.getBoundingClientRect(); return (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; }; };
  const worldEls = () => Array.from(worldHud.querySelectorAll('[data-hs-widget]'));
  const idOf = (e) => e.getAttribute('data-hs-widget');
  const isBar = (e) => hud.layoutOf(idOf(e)).anchor === BOTTOM_BAR;
  /* stacked under the hunt bar where it stands (a row's `below` names it) and not moved by the player: on screen only */
  const stackedUnderHuntBar = (e) => {
    const row = hud.row(idOf(e));
    return !!row && !!row.below && row.below.includes(HUNT_BAR) && !hud.isMoved(row.id) && e.offsetWidth > 0;
  };
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
      /* THE PHONE'S OWN RULE: a panel stacked under the hunt bar (the analyzer, the Tally) ends PHONE_BAR_GAP over the action bar,
         from the top it was stacked to, where its CSS cap (hunt.css) always ended it. Over the town the hunt bar's foot is 48 px lower:
         at 667x375 the room left was under the analyzer's 120 px floor, so the floor stepped it down below the bar, off the screen
         (lane/a-training-leftovers). Its floor yields to this room on a phone (shell.js paintWidgets). The Party panel and the rest
         keep no room here (HR-8). */
      if (phone && stackedUnderHuntBar(e)) { take(e, panelRoom(rel(e), bars, height, PHONE_BAR_GAP)); continue; }
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

  /* THE TOWN'S COACH CARD IN ITS OWN SLOT (UI audit 2026-11-18 UI-6: hung under the icon row it lay over the Tally and reached the Town and
     Home tabs). On a desktop it stands in the World's right column, in the widget stack: under the Tally and whatever else stands there (where
     the Tally would stand when there is none), its right edge on theirs. It takes a free place and moves nothing, so the Tally stays where the
     player left it, moved or not. --coach-r / --coach-y place it from the icon row's box (it is drawn there, launcher.js), --coach-h is its room
     down to the bar; with less room than a card needs it hangs under the row as before. A group's menu open steps it left (shell.css). */
  function dockTownCoach() {
    const host = screenHud.querySelector('[data-hs-widget="launchers"] .hs-launchers');
    if (!host) return;
    const card = host.querySelector(':scope > .hs-pointer');
    let at = null;
    if (card && !isPhone() && host.offsetWidth) {
      const hb = host.getBoundingClientRect(), wb = worldHud.getBoundingClientRect();
      const right = wb.right - gap, w = card.offsetWidth || COACH_WIDE, h = card.offsetHeight;
      const way = worldEls().filter((e) => e.offsetWidth && !isBar(e) && !e.classList.contains('is-under-dock')).map((e) => e.getBoundingClientRect())
        .filter((q) => q.left < right && q.right > right - w);
      let top = wb.top + gap;
      for (let moved = true, n = 0; moved && n <= way.length; n++) {
        moved = false;
        for (const q of way) if (q.top < top + h + gap && q.bottom + gap > top) { top = q.bottom + gap; moved = true; }
      }
      const bars = worldEls().filter(isBar).map((e) => e.getBoundingClientRect()).filter((q) => q.left < right && q.right > right - w);
      const floor = (bars.length ? Math.min(...bars.map((q) => q.top)) : wb.bottom) - gap;
      if (floor - top >= Math.min(COACH_MIN_ROOM, h)) at = { r: Math.round(hb.right - right), y: Math.round(top - hb.top), h: Math.floor(floor - top) };
    }
    const now = at ? [at.r + 'px', at.y + 'px', at.h + 'px'].join() : ',,';
    if ([host.style.getPropertyValue('--coach-r'), host.style.getPropertyValue('--coach-y'), host.style.getPropertyValue('--coach-h')].join() !== now) {
      for (const k of ['--coach-r', '--coach-y', '--coach-h']) host.style.removeProperty(k);
      if (at) { host.style.setProperty('--coach-r', at.r + 'px'); host.style.setProperty('--coach-y', at.y + 'px'); host.style.setProperty('--coach-h', at.h + 'px'); }
    }
    host.classList.toggle('is-coach-docked', !!at);
  }

  /* THE HUNT'S COACH CARD, DOCKED (see the header). --coach-x / --coach-y: the card's place from its host's corner (it is drawn inside the hunt
     bar's widget, hunt-topbar.js); --coach-h its room down to the bar. Reads no height of the card. */
  const coachHost = () => worldHud.querySelector('[data-hs-widget="hunt-topbar"]');
  function dockCoach() {
    dockTownCoach();
    const host = coachHost();
    if (!host) return;
    const card = host.querySelector(':scope > .hs-pointer');
    let at = null, tight = false;
    if (card && !isPhone() && host.offsetWidth) {
      const rel = relTo(worldHud), hb = rel(host);
      const inCol = (e) => !hud.isMoved(idOf(e)) && hud.layoutOf(idOf(e)).anchor === 'tl';
      const shown = worldEls().filter((e) => e !== host && e.offsetWidth && !isBar(e) && !e.classList.contains('is-under-dock'));
      const col = shown.filter(inCol).map(rel);
      const left = col.length ? Math.min(...col.map((q) => q.left)) : gap;
      const top = col.length ? Math.max(...col.map((q) => q.top + q.height)) + gap : hb.top;
      const bars = barsAtHome().filter((q) => q.left < left + COACH_WIDE && q.left + q.width > left);
      /* whatever else stands in the column is the card's floor: a window (Chat opens there), a panel the player moved there, the players-online line. The card never lies on or behind one. */
      const online = screenHud.querySelector('[data-hs-widget="online"]:not(.is-under-dock)');
      const wins = shown.filter((e) => !inCol(e)).concat(Array.from(layer.querySelectorAll('.hs-win:not(.is-leaving)')), online && online.offsetWidth ? [online] : []).map(rel)
        .filter((q) => q.left < left + COACH_WIDE && q.left + q.width > left && q.top + q.height > top);
      const floor = Math.min(bars.length ? Math.min(...bars.map((q) => q.top)) : worldHud.clientHeight, ...wins.map((q) => q.top)) - gap;
      if (floor - top >= COACH_MIN_ROOM) at = { x: Math.round(left - hb.left), y: Math.round(top - hb.top), h: Math.floor(floor - top) };
      else tight = true;
    }
    const was = [host.style.getPropertyValue('--coach-x'), host.style.getPropertyValue('--coach-y'), host.style.getPropertyValue('--coach-h')].join();
    if (!at) { if (was !== ',,') for (const k of ['--coach-x', '--coach-y', '--coach-h']) host.style.removeProperty(k); }
    else if (was !== [at.x + 'px', at.y + 'px', at.h + 'px'].join()) { host.style.setProperty('--coach-x', at.x + 'px'); host.style.setProperty('--coach-y', at.y + 'px'); host.style.setProperty('--coach-h', at.h + 'px'); }
    host.classList.toggle('is-coach-docked', !!at);
    host.classList.toggle('is-coach-tight', tight);
  }

  /* An alert in the docked card's column needs the room the card stands in: the card folds to its title while the alert is up (what happened
     to the hero outranks a tip) and opens again when it goes. Judged after dockCoach in the same pass, which left the card open to be measured. */
  function coachYields(alerts) {
    const host = coachHost();
    const card = host && host.classList.contains('is-coach-docked') ? host.querySelector(':scope > .hs-pointer:not(.is-min)') : null;
    if (!card) return;
    const list = alerts && alerts.querySelector('.hw-alerts:not(.is-empty) .hw-alert-list');
    if (!list) return;
    const a = alerts.getBoundingClientRect(), c = card.getBoundingClientRect();
    const bars = worldEls().filter(isBar).map((e) => e.getBoundingClientRect().top);
    const room = (bars.length ? Math.min(...bars) : worldHud.getBoundingClientRect().bottom) - gap - (c.top + card.offsetHeight + gap);
    host.classList.toggle('is-coach-tight', a.left < c.right && a.left + ALERT_WIDE > c.left && room < Math.max(ALERTS_MIN_ROOM, list.scrollHeight));
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
    if (alerts) coachYields(alerts);
    /* The hero's spot is in the way too, for as long as a place clears it: an alert is never hidden for the hero. */
    const at = typeof heroAt === 'function' ? heroAt() : null;
    const sb = screenHud.getBoundingClientRect();
    const hero = at ? { left: at.x - sb.left - HERO_HALF_W, top: at.y - sb.top - HERO_UP, width: 2 * HERO_HALF_W, height: HERO_UP + HERO_DOWN } : null;
    if (alerts) {
      const { floor, ceil } = alertBand();
      setRoom(alerts, shown ? Math.floor(floor - ceil) : null);
      if (shown) {
        const q = rel(alerts);
        const top = Math.round(Math.max(ceil, Math.min(q.top, floor - q.height)));
        /* Its own width first; between a Party panel, Chat and the analyzer at a laptop's width, the narrow card still fits. */
        let left = null, narrow = false;
        for (const obst of hero ? [way.concat(hero), way] : [way]) {
          left = slideClear(Object.assign(q, { top, width: ALERT_WIDE }), obst, width, gap);
          narrow = left === null;
          if (narrow) left = slideClear(Object.assign(q, { width: ALERT_NARROW }), obst, width, gap);
          if (left !== null) break;
        }
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

  return { roomForStack, liftMoved, clearPlates, dockCoach };
}
