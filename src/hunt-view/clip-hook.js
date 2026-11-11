// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/clip-hook.js — THE ANIMATION HOOK: A BLOW SWINGS, A HIT FLINCHES, A KILL FALLS.
//
// PURE. The live hunt (scene.js) draws a unit standing, walking or dead; this module
// answers which ONE-SHOT clip a standing unit plays at a client instant, and in which
// facing a dead one falls. Every clip is the server's own event drawn (CLAUDE.md §1):
//   H1 NO CLIP WITHOUT ITS EVENT. A swing is a blow event of the unit (`dmg`, `miss`, or a
//      `cast` at a foe), a flinch a `dmg` that landed on it, a fall its `kill`. A swing winds
//      up from the blow's queued event (timeline.js T15 upcoming), so its `hit` frame shows at
//      the very instant the blow's spark and number do; a blow a rebase drops takes its
//      wind-up with it, and the strike frames only show once the event has played.
//   H2 ONLY ON A FACING THE CLIP HAS (core/facing.js clipFacing): the unit's own facing, else
//      the nearest one the clip has within RULES.reach 45° steps. Nothing else plays: no
//      south clip on a unit facing north, nothing mirrored, never a blank. Where no flinch is
//      that near, the struck unit gives RULES.recoilMs of §11's 1 art px recoil instead.
//      A fall lies in the nearest facing its clip has at any distance (a body always lies).
//   H3 ONE AT A TIME: death beats a walk beats a swing beats a flinch. A swing that starts
//      while another plays waits its turn (it shows from the frame its own clock is on), so
//      a full box's blows never restart a clip mid-frame.
//   H4 A FUNCTION OF THE CLOCK: each clip's frame is (now - its start) x fps, its start fixed
//      by its event's instant, so 30 fps and 144 fps draw the same frame at the same instant.
// ════════════════════════════════════════════════════════════════════════
import { clipFacing, asDirDiag } from '../world/core/facing.js?v=0.2.121';

export const CLIP_RULES = Object.freeze({
  reach: 1,           // a swing or flinch may turn its unit one 45° step at most (to the nearest facing it has)
  fallReach: 4,       // a fall lies in the nearest facing it has, however far round
  leadCapMs: 1000,    // the longest wind-up drawn before a blow
  recoilMs: 120,      // where no flinch can play: the struck sprite gives 1 art px for this long (ART_DIRECTION §11)
  hitFrame: 3,        // a swing's blow frame when its clip declares none (every attack is laid with its reach on index 3)
});

/** The unit whose OWN blow `ev` is (it swings at ev.t), or null: a status tick, a follow-through's second number and a cast on a friend are no swing. */
export function swingerOf(ev, foes) {
  if (!ev || !Number.isInteger(ev.u) || !Number.isInteger(ev.t) || ev.u === ev.t) return null;
  if (ev.type === 'dmg') return ev.dot || ev.follow ? null : ev.u;
  if (ev.type === 'miss') return ev.u;
  if (ev.type === 'cast') return foes(ev.u, ev.t) ? ev.u : null;
  return null;
}

/** The unit a blow `ev` struck hard enough to flinch (a landed blow, never a status tick), or null. */
export function struckBy(ev) {
  return ev && ev.type === 'dmg' && Number.isInteger(ev.t) && ev.amount > 0 && !ev.dot ? ev.t : null;
}

/* How long a one-shot clip runs (ms) on its longest facing, and where its blow lands. */
function spanOf(book, id, clip, name) {
  let n = 0;
  for (const d of Object.keys(clip.dirs || {})) n = Math.max(n, book.frames(id, name, d));
  return (n * 1000) / clip.fps;
}

/**
 * @param {{book: object, timeline: object, foes: (u: number, t: number) => boolean}} o
 *   book      the world's sprite book (core/book.js): clips, fps, frame counts
 *   timeline  the character's timeline (clientAt, upcoming, positionAt)
 *   foes      are units u and t on opposite sides (a cast at t is a blow)
 */
export function createClipHook(o) {
  const { book } = o, tl = o.timeline;
  const swung = new Map();     // unit -> { t, at }: its last blow PLAYED (client ms of the blow)
  const faced = new Map();     // unit -> { t, at }: the last unit it acted on, a friend it healed too (what it faces)
  const struck = new Map();    // unit -> { at, dx, dy }: the last blow that landed on it
  let ahead = new Map();       // unit -> [{ t, at }]: its blows still queued within leadCapMs (this frame's look)

  const clipOf = (id, name) => { const s = book.sprite(id); const c = s && s.anims && s.anims[name]; return c && c.fps > 0 ? c : null; };
  /* sprite id -> its swing's { lead, span, fps } (or null): read once from the book, not per unit per frame */
  const swings = new Map();
  function swingOf(id) {
    if (swings.has(id)) return swings.get(id);
    const c = clipOf(id, 'attack');
    const hit = c && Number.isInteger(c.hit) ? c.hit : CLIP_RULES.hitFrame;
    const lead = c ? Math.min(CLIP_RULES.leadCapMs, (hit * 1000) / c.fps) : 0;
    const v = c ? { lead, span: spanOf(book, id, c, 'attack'), fps: c.fps } : null;
    swings.set(id, v);
    return v;
  }
  /* A swing's clip window [start, end) for sprite `id`: its wind-up ends on the blow. */
  function windowOf(id, at) {
    const s = swingOf(id);
    return s ? { start: at - s.lead, end: at - s.lead + s.span, fps: s.fps } : null;
  }

  return {
    /** Event `ev` played at client time `at` (scene.js onEvent, in event order): a blow is a swing, and any act on another unit is what it faces. */
    played(ev, at) {
      if (!ev || !Number.isInteger(ev.u) || !Number.isInteger(ev.t) || ev.u === ev.t) return;
      if (ev.type === 'dmg' || ev.type === 'miss' || ev.type === 'cast') faced.set(ev.u, { t: ev.t, at });
      const u = swingerOf(ev, o.foes);
      if (u !== null) swung.set(u, { t: ev.t, at });
    },
    /** A blow landed on `u` at client time `at`, coming from (dx, dy) (whole art px away from the blow). */
    hit(u, at, dx, dy) { struck.set(u, { at, dx, dy }); },
    /** Once per frame, before any unit: the blows still queued close enough to wind up (H1). */
    look(now) {
      ahead = new Map();
      if (typeof tl.upcoming !== 'function') return;
      for (const ev of tl.upcoming(now, CLIP_RULES.leadCapMs)) {
        const u = swingerOf(ev, o.foes);
        const at = u === null ? null : tl.clientAt(ev.atMs);
        if (at === null) continue;
        if (!ahead.has(u)) ahead.set(u, []);
        ahead.get(u).push({ t: ev.t, at });
      }
    },
    /**
     * The swing unit `u` (drawn as sprite `id`) is in at `now`: the one whose clip window holds now and started first
     * (H3), with its window; else null. `last` is the unit's last played blow (what a standing unit faces).
     */
    swingAt(u, id, now) {
      const list = [];
      const s = swung.get(u);
      if (s) list.push(s);
      for (const x of ahead.get(u) || []) list.push(x);
      let best = null;
      for (const x of list) {
        const w = windowOf(id, x.at);
        if (w && now >= w.start && now < w.end && (!best || w.start < best.w.start)) best = { t: x.t, at: x.at, w };
      }
      return best;
    },
    /** The last unit `u` acted on (it keeps facing it between swings), or undefined. */
    last: (u) => faced.get(u),
    /**
     * The one-shot clip a STANDING unit plays at `now` (H2, H3), or a recoil, or null (its idle):
     *   { anim, frame, dir, diag }  a swing ('attack') or a flinch ('hit') on a facing the clip has
     *   { recoil: [dx, dy] }          a landed blow with no flinch near enough
     * `act` is swingAt's answer for the unit; (dir, diag, hx, hy) the facing it stands in.
     * @returns {{anim?: string, frame?: number, dir?: string, diag?: string|null, recoil?: number[]}|null}
     */
    clipAt(u, id, now, act, f) {
      if (act) {
        const c = clipOf(id, 'attack');
        const face = c && clipFacing(c.dirs, f.dir, f.diag, CLIP_RULES.reach, f.hx, f.hy);
        if (face) {
          const i = Math.floor(((now - act.w.start) * act.w.fps) / 1000);
          if (i >= 0 && i < book.frames(id, 'attack', face)) return Object.assign({ anim: 'attack', frame: i }, asDirDiag(face));
        }
      }
      const h = struck.get(u);
      if (!h || now < h.at) return null;
      const c = clipOf(id, 'hit');
      const face = c && clipFacing(c.dirs, f.dir, f.diag, CLIP_RULES.reach, f.hx, f.hy);
      if (face) {
        const i = Math.floor(((now - h.at) * c.fps) / 1000);
        return i < book.frames(id, 'hit', face) ? Object.assign({ anim: 'hit', frame: i }, asDirDiag(face)) : null;
      }
      return now - h.at < CLIP_RULES.recoilMs ? { recoil: [h.dx, h.dy] } : null;
    },
    /**
     * A DEAD unit `age` ms into its fall, lying the way it fell (f: the facing it fell with): its death clip in the
     * nearest facing the clip has, then its corpse frame of that same facing (else the fall's last frame, held); null
     * when the sprite has no death clip at all (scene.js greys it, or a hero keeps standing as before).
     * @returns {{anim: string, frame: number, dir: string, diag: string|null}|null}
     */
    fallAt(id, age, f) {
      const c = clipOf(id, 'death');
      const face = c && clipFacing(c.dirs, f.dir, f.diag, CLIP_RULES.fallReach, f.hx, f.hy);
      if (!face) return null;
      const n = book.frames(id, 'death', face);
      const i = Math.floor((Math.max(0, age) * c.fps) / 1000);
      const s = book.sprite(id);
      const corpse = s.anims.corpse && s.anims.corpse.dirs && s.anims.corpse.dirs[face];
      if (i >= n && corpse) return Object.assign({ anim: 'corpse', frame: 0 }, asDirDiag(face));
      return Object.assign({ anim: 'death', frame: Math.min(i, n - 1) }, asDirDiag(face));
    },
    /** Drop a unit's state (its track is gone). */
    forget(u) { swung.delete(u); faced.delete(u); struck.delete(u); },
    /** A unit the server holds alive again (a restart): its flinch is not replayed. */
    stand(u) { struck.delete(u); },
    /** Per-unit entries held (scene.js S4 bounds them with its own maps). */
    keys: () => new Set([...swung.keys(), ...faced.keys(), ...struck.keys()]),
    size: () => swung.size + faced.size + struck.size,
  };
}
