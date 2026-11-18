// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/tower-bar.js — THE CLIMB ON THE HUNT BAR: THE FLOOR STANDING, ITS TIME LEFT, A KEEPER'S LANDING.
//
// The board's "2026-11-14 The Burning Tower" §2 (three minutes a floor, ten on a landing; a Keeper on every tenth floor holds its key).
// Display only (CLAUDE.md §6): the floor and the room's end instant are the browser's live prediction (src/hunt-view/live-engine.js
// tower(): the one engine, started from the server's tower_floor and replaced by every server start point), moved to the instant the
// screen shows; with no prediction running the floor is the server's own (the `tower` section's run.floor) and no clock is drawn.
// Nothing reads it, nothing is spent by it. Quiet off the Tower.
// ════════════════════════════════════════════════════════════════════════
import { towerOf, isLanding, keyForLanding } from '../../session/tower-sections.js?v=0.2.139';
import { catacombOf, keyForDoor } from '../../session/catacomb-sections.js?v=0.2.139';
import { text, prop, attr, cls } from '../../render/paint.js?v=0.2.139';
import { t } from '../../render/player-text.js?v=0.2.139';

/** "2:41" from ms (whole seconds, rounded up: the floor is never shown as up before it is). Pure. */
function leftClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* The room's time left from the live prediction, never more than its own limit (QA gate 2026-11-17: "3:03 left" on a three-minute floor,
   the prediction's next room standing a stair ahead of the clock it is read against), or null with no prediction. */
function leftOf(cs, live, limit) {
  const shown = cs.timeline && typeof cs.timeline.serverNowAt === 'function' ? cs.timeline.serverNowAt(cs.now()) : null;
  return live && Number.isFinite(live.endsAtMs) && Number.isFinite(shown) ? Math.min(limit, Math.max(0, live.endsAtMs - shown)) : null;
}

/** The climb the bar shows for this hero now: { floor, leftMs | null, keeper, key, room } or null off a run (or with the hunt over). A
    Catacombs descent (2027-05-08-catacombs.sql, the `catacomb` section) reads the same, its rooms and vault doors (`room` true). Pure over
    its reads. */
export function climbOf(cs, h) {
  if (!h || h.ended) return null;
  const live = cs.live && typeof cs.live.tower === 'function' ? cs.live.tower() : null;
  const tw = towerOf(cs);
  if (tw && h.huntId === tw.hunt) {
    const floor = live ? live.floor : tw.run ? tw.run.floor : null;
    if (floor === null) return null;
    /* the server's rule for a floor, or a landing's */
    const limit = isLanding(tw, floor) ? tw.rules.landingLimitMs : tw.rules.floorLimitMs;
    return { floor, leftMs: leftOf(cs, live, limit), keeper: isLanding(tw, floor), key: isLanding(tw, floor) ? keyForLanding(tw, floor) : null, room: false };
  }
  const cat = catacombOf(cs);
  const w = cat ? cat.wings.find((x) => x.hunt === h.huntId) : null;
  if (!w) return null;
  const room = live ? live.floor : cat.run && cat.run.wing === w.wing ? cat.run.room : null;
  if (room === null) return null;
  /* a vault door every door_every rooms: Keeper Dunn holds the wing's key there */
  const door = room % cat.rules.doorEvery === 0;
  return { floor: room, leftMs: leftOf(cs, live, door ? cat.rules.doorLimitMs : cat.rules.roomLimitMs), keeper: door, key: door ? keyForDoor(cat, w, room) : null, room: true };
}

/** The bar's Tower part, patched in place. */
export function patchTowerBar(el, cs, h) {
  if (!el) return;
  const c = climbOf(cs, h);
  prop(el, 'hidden', !c);
  if (!c) return;
  text(el.querySelector('.ht-floor'), c.room ? t(c.keeper ? 'catacomb.bar_door' : 'catacomb.bar_room', { room: c.floor })
    : t(c.keeper ? 'tower.bar_keeper' : 'tower.bar_floor', { floor: c.floor }));
  text(el.querySelector('.ht-floor-left'), c.leftMs === null ? '' : t('tower.bar_left', { time: leftClock(c.leftMs) }));
  cls(el, 'is-keeper', c.keeper);
  attr(el, 'title', c.keeper && c.key ? t('tower.bar_keeper_tip', { key: c.key.name || '' }) : null);
}
