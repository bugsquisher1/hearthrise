// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/scene.js — THE LIVE HUNT, ONE FRAME AT A TIME (parity VW-*, FX-*).
//
// PURE. The character's timeline (timeline.js: the server's track and events)
// plus the snapshot sections (hunt, party: REPLACED by every envelope) go in;
// out comes the state src/world/core/compose.js draws: the viewed hero, every
// other unit, the floating numbers, the effects and the bleed badges.
//
// THE RULES (Tyler 10-18: rendering timing is independent of simulation and
// persistence)
//   S1 every position, walk frame and facing is a function of the frame time
//      and the timeline alone: a unit walks its 8-way cycle with its frame
//      chosen by the distance it has walked (VW-11), never by frames drawn, so
//      30 fps and 144 fps show the same pose at the same instant.
//   S2 an event plays ONCE: its key is remembered, and a batch that restates it
//      adds nothing. Its effects start at the client instant the event's server
//      time plays at (timeline.clientAt), fixed when it is delivered, so a new
//      envelope or settle never restarts or re-times a running animation.
//   S3 numbers are the server's: HP and mana bars read the snapshot sections,
//      never a tally of the events; a float is only ever the event's own number.
//   S4 bounded: at most MAX_FX effects and MAX_FLOATS floats live at once.
// ════════════════════════════════════════════════════════════════════════
import { EVENT_FX, LOOT_FX, HIT_FX, PROJECTILE, CAST_FX } from '../data/hunt-vfx.js?v=0.2.3';
import { outfitSprite } from '../data/hunt-outfits.js?v=0.2.3';
import { huntOf, partyOf } from '../session/hunt-sections.js?v=0.2.3';
import { partyPeopleOf } from '../session/party-sections.js?v=0.2.3';
import { floatShown } from './float-prefs.js?v=0.2.3';
import { abilityName, itemName } from '../shell/widgets/bits.js?v=0.2.3';

export const SCENE_TIMING = Object.freeze({
  deathFadeMs: 400,     // VW-05: colour to a grey corpse
  corpseMs: 10000,      // how long a corpse lies
  corpseFadeMs: 2000,   // it fades out over its last 2 s
  flashMs: 120,         // a hit's white flash
  floatMs: 1000,        // a floating number's life
  faceMs: 700,          // a standing attacker faces its target this long after a swing
});
const MAX_FX = 96, MAX_FLOATS = 64, MAX_KEYS = 4096, PRUNE_AT = 512;
/* FX-01: a target's numbers cycle through four offsets so a burst never stacks into one;
   an ability's name sits above them (FX-03) and the big numbers higher still (FX-02). */
const OFFSETS = Object.freeze([[0, 0], [7, -4], [-7, -4], [0, -9]]);
const NAME_DY = -14, BIG_DY = -18;

/** The facing of a heading: the cardinal (larger axis; east/west on a tie) and the diagonal, if any. */
function facingOf(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return { dir: 's', diag: null };
  const dir = ax >= ay ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  const diag = ax && ay && Math.min(ax, ay) / Math.max(ax, ay) >= Math.tan(Math.PI / 8) ? (dy > 0 ? 's' : 'n') + (dx > 0 ? 'e' : 'w') : null;
  return { dir, diag };
}

/**
 * What the scene reads from ONE character, every frame (the snapshot, never cached).
 * @param {object} cs  a CharacterSession
 */
export function readHunt(cs) {
  const h = huntOf(cs);
  const p = partyOf(cs);
  const heroes = new Map();
  for (const m of p ? p.members : []) heroes.set(m.unit, m);
  return {
    units: h ? h.units : new Map(),
    heroes,
    people: partyPeopleOf(cs),
    viewed: h && h.hero.unit !== null ? h.hero.unit : p ? p.self : null,
    viewedShield: h ? h.hero.shield : null,
    shown: (type, boss) => floatShown(cs, type, boss ? 'boss' : 'regular'),
  };
}

/**
 * @param {{timeline: object, book: object, read: () => object}} o
 *   timeline  the character's timeline (positionAt, clientAt, tileMs)
 *   book      the world's sprite book (core/book.js): clip fps and lengths
 *   read      readHunt(cs) for the character: re-read for every event and every
 *             frame, so an event delivered by any caller of advance() (the shell's
 *             display tick too) is staged against the snapshot as it is now
 */
export function createHuntScene(o) {
  const tl = o.timeline, book = o.book;
  const keys = new Set();
  let fx = [], floats = [];
  const flash = new Map(), dead = new Map(), swing = new Map(), bleed = new Map(), cycle = new Map(), target = new Map();
  const fresh = () => o.read();
  let read = fresh();

  const isHero = (u) => read.heroes.has(u) || (read.units.get(u) || {}).side === 'hero';
  const isBoss = (u) => !!(read.units.get(u) || {}).boss;
  const roleOf = (u) => (read.heroes.get(u) ? read.heroes.get(u).role : isHero(u) ? null : 'monster');
  const spriteOf = (u) => {
    if (isHero(u)) { const m = read.heroes.get(u); return outfitSprite(m && m.outfit, m && m.role); }
    return (read.units.get(u) || {}).kind || 'stub';
  };
  /* How long a one-shot effect plays (its frames at its fps); a loop shows for its row's lifeMs. */
  function lifeOf(id, lifeMs) {
    const s = book.sprite(id);
    const clip = s.anims && s.anims.play;
    if (!clip || !clip.fps) return lifeMs || 500;
    if (clip.loop) return lifeMs || 1000;
    return Math.round((book.frames(id, 'play', 's') * 1000) / clip.fps);
  }
  /* `on` is the unit whose art height the effect's lift is a fraction of. */
  function addFx(id, start, place, lift, lifeMs, on) {
    if (!id) return;
    const u = on !== undefined ? on : place.follow;
    fx.push({ id, start, life: lifeOf(id, lifeMs), lift: lift || 0, on: u !== undefined ? spriteOf(u) : null, ...place });
    if (fx.length > MAX_FX) fx.splice(0, fx.length - MAX_FX);
  }
  function addFloat(u, type, text, kind, start, big) {
    if (!read.shown(type, isBoss(u))) return;
    const p = tl.positionAt(u, start);
    if (!p) return;
    let dx = 0, dy = big ? BIG_DY : NAME_DY;
    if (!big && type !== 'ability') {
      const n = ((cycle.get(u) || 0) + 1) % OFFSETS.length;
      cycle.set(u, n);
      [dx, dy] = OFFSETS[n];
    }
    floats.push({ text, kind, x: p.x, y: p.y, dx, dy, start, life: SCENE_TIMING.floatMs, big: !!big });
    if (floats.length > MAX_FLOATS) floats.splice(0, floats.length - MAX_FLOATS);
  }
  const at = (u) => ({ follow: u });
  const fixed = (u, t) => { const p = tl.positionAt(u, t); return p ? { x: p.x, y: p.y } : null; };

  function hit(ev, start) {
    const role = roleOf(ev.u);
    const flies = PROJECTILE.roles.includes(role) && ev.ability !== 'cleave';
    const land = flies ? start + PROJECTILE.flightMs : start;
    if (flies) {
      const a = fixed(ev.u, start), b = fixed(ev.t, start);
      if (a && b) addFx(PROJECTILE.fx, start, { x: a.x, y: a.y, tx: b.x, ty: b.y }, PROJECTILE.lift, PROJECTILE.flightMs, ev.u);
    }
    const id = HIT_FX.ability[ev.ability] || HIT_FX.element[ev.element] || HIT_FX.role[role] || null;
    addFx(id, land, at(ev.t), HIT_FX.lift);
    flash.set(ev.t, land);
    swing.set(ev.u, { t: ev.t, at: start });
    return land;
  }

  /** One timeline event (each key once). `now` is the caller's clock, used only before the first batch. */
  function onEvent(ev, now) {
    if (!ev || keys.has(ev.key)) return false;
    keys.add(ev.key);
    read = fresh();
    if (keys.size > MAX_KEYS) keys.delete(keys.values().next().value);
    const start = tl.clientAt(ev.atMs) ?? now;
    const num = (u, n, land) => addFloat(u, isHero(u) ? 'taken' : 'dealt', String(n), isHero(u) ? 'hurt' : 'hit', land);
    switch (ev.type) {
      case 'dmg': num(ev.t, ev.amount, hit(ev, start)); break;
      case 'status_tick': if (Number.isFinite(ev.amount)) { num(ev.t, ev.amount, start); flash.set(ev.t, start); } break;
      case 'miss': case 'immune': addFloat(ev.t, 'miss', ev.type === 'miss' ? 'miss' : 'immune', 'miss', start); swing.set(ev.u, { t: ev.t, at: start }); break;
      case 'heal': addFloat(ev.t, 'heal', '+' + ev.amount, 'heal', start); break;
      case 'cast': {
        const r = CAST_FX.ability[ev.ability] || CAST_FX.role[roleOf(ev.u)];
        if (r) addFx(r.fx, start, at(ev.u), r.lift, Math.min(CAST_FX.maxMs, r.lifeMs || CAST_FX.maxMs));
        addFloat(ev.u, 'ability', abilityName(ev.ability), 'ability', start);
        if (Number.isInteger(ev.t) && ev.t !== ev.u) swing.set(ev.u, { t: ev.t, at: start });
        break;
      }
      case 'kill':
        if (!isHero(ev.t)) {
          dead.set(ev.t, start);
          const loot = ev.loot && typeof ev.loot === 'object' ? Object.entries(ev.loot) : [];
          if (loot.length) {
            addFx(LOOT_FX.fx, start, fixed(ev.t, start) || at(ev.t), LOOT_FX.lift, undefined, ev.t);
            addFloat(ev.t, 'loot', loot.map(([id, q]) => itemName(id) + (q > 1 ? ' ×' + q : '')).join(', '), 'loot', start);
          }
        }
        break;
      case 'xp_group': {
        const v = read.viewed;
        const mine = ev.by && v !== null && Number.isFinite(ev.by[v]) ? ev.by[v] : ev.amount;
        if (v !== null && Number.isFinite(mine) && read.shown('xp', false)) {
          const p = Number.isFinite(ev.x) && Number.isFinite(ev.y) ? { x: ev.x, y: ev.y } : fixed(v, start);
          if (p) floats.push({ text: '+' + Math.round(mine) + ' XP', kind: 'xp', x: p.x, y: p.y, dx: 0, dy: BIG_DY, start, life: SCENE_TIMING.floatMs * 1.5, big: true });
        }
        break;
      }
      case 'eat': case 'drink': addFloat(ev.u, 'supply', itemName(ev.item), 'supply', start); break;
      case 'rare_drop': if (read.viewed !== null) addFloat(read.viewed, 'loot', itemName(ev.item), 'loot', start, true); break;
      case 'status_on': if (ev.status === 'bleed') bleed.set(ev.t, Number.isInteger(ev.stacks) ? ev.stacks : (bleed.get(ev.t) || 0) + 1); break;
      case 'status_off': if (ev.status === 'bleed') bleed.delete(ev.t); break;
      case 'target': if (Number.isInteger(ev.u)) target.set(ev.u, ev.t); break;
      default: break;
    }
    const r = EVENT_FX[ev.type];
    if (r && !(r.monsterOnly && isHero(ev.t))) {
      const who = r.at === 'viewed' ? read.viewed : ev[r.at];
      if (Number.isInteger(who)) addFx(r.fx, start, ev.type === 'kill' ? fixed(who, start) || at(who) : at(who), r.lift, r.lifeMs, who);
    }
    return true;
  }

  /** One unit's draw record at `now`, or null when it is gone. */
  function unitAt(u, now) {
    const p = tl.positionAt(u, now);
    if (!p) return null;
    const id = spriteOf(u);
    const hero = isHero(u);
    const m = read.heroes.get(u);
    let alpha = 1, grey = 0, under = false;
    const died = dead.get(u);
    if (died !== undefined) {
      if (p.moving) dead.delete(u);   // a unit the server walks again is not dead
      else {
        const age = now - died;
        if (age >= SCENE_TIMING.corpseMs) return null;
        if (age >= 0) {
          grey = Math.min(1, age / SCENE_TIMING.deathFadeMs);
          alpha = (1 - 0.45 * grey) * Math.min(1, (SCENE_TIMING.corpseMs - age) / SCENE_TIMING.corpseFadeMs);
          under = true;
        }
      }
    }
    if (hero && m && m.down) { grey = 1; alpha = 0.55; under = true; }
    /* Facing: the way it walks; standing, toward what it last swung at; else its last heading. */
    let hx = p.hx, hy = p.hy;
    const s = swing.get(u);
    if (!p.moving && s && now - s.at >= 0 && now - s.at < SCENE_TIMING.faceMs) {
      const q = tl.positionAt(s.t, now);
      if (q && (q.x !== p.x || q.y !== p.y)) { hx = q.x - p.x; hy = q.y - p.y; }
    }
    const { dir, diag } = facingOf(hx, hy);
    const sp = book.sprite(id);
    const walk = sp.anims && sp.anims.walk;
    const moving = p.moving && !under && !!walk;
    /* VW-11: the walk frame advances with distance walked, at the clip's fps when moving at the playback speed. */
    const frame = moving ? Math.floor((p.d * walk.fps * tl.tileMs) / 1000) : 0;
    const anim = moving ? 'walk' : sp.anims && sp.anims.idle ? 'idle' : walk ? 'walk' : 'idle';
    const f = flash.get(u);
    const out = { id, unit: u, x: p.x, y: p.y, anim, dir, diag, frame, alpha, grey, under,
      flash: !under && f !== undefined && now >= f && now - f < SCENE_TIMING.flashMs };
    if (!under) {
      const hp = hero ? m && m.hp : (read.units.get(u) || {}).hp;
      const hpMax = hero ? m && m.hpMax : (read.units.get(u) || {}).hpMax;
      const mana = hero && m ? m.mana : null, manaMax = hero && m ? m.manaMax : null;
      const hpPct = Number.isFinite(hp) && hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : null;
      const mpPct = Number.isFinite(mana) && manaMax > 0 ? Math.max(0, Math.min(1, mana / manaMax)) : null;
      /* VW-07: shown only when not full. */
      if (hpPct !== null && (hpPct < 1 || (mpPct !== null && mpPct < 1))) { out.bar = hpPct; out.barKind = 'pct'; if (mpPct !== null) out.mana = mpPct; }
      if (hero) out.plate = { text: (m && m.name) || 'Hero', kind: u === read.viewed ? 'self' : 'peer' };
      /* WHO THIS IS, for the player menu (a right-click on the sprite): the server's party_people by seat. */
      if (hero && m && u !== read.viewed) {
        const who = Number.isInteger(m.seat) ? read.people.get(m.seat) : null;
        out.ref = { player: { id: who ? who.id : null, name: (who && who.name) || m.name, slot: who ? who.slot : null } };
      } else if (!hero && (read.units.get(u) || {}).kind) out.ref = { monster: read.units.get(u).kind };
      else if (isBoss(u)) out.plate = { text: (read.units.get(u) || {}).name || null, kind: 'foe' };
      if (out.plate && !out.plate.text) delete out.plate;
      const stacks = bleed.get(u) || 0;
      if (stacks > 0 && (hero || read.shown('bleed_badge', isBoss(u)))) out.badge = stacks;
    }
    return out;
  }

  /**
   * The draw state at `now` (the timeline's clock).
   * @param {number} now
   */
  function frame(now) {
    read = fresh();
    let hero = null;
    const units = [];
    const ids = tl.units();
    /* S4: per-unit state never outlives the unit's track (a long hunt respawns thousands). */
    if (flash.size + dead.size + swing.size + bleed.size + cycle.size + target.size > PRUNE_AT) {
      const live = new Set(ids);
      for (const m of [flash, dead, swing, bleed, cycle, target]) for (const k of m.keys()) if (!live.has(k)) m.delete(k);
    }
    for (const u of ids) {
      const d = unitAt(u, now);
      if (!d) continue;
      if (u === read.viewed) hero = d;
      else units.push(d);
    }
    const tgt = read.viewed !== null ? target.get(read.viewed) : undefined;
    for (const d of units) if (d.unit === tgt && !d.under) d.target = true;
    /* VW-06: the viewed hero's shield bubble while the server says it holds one. */
    const shields = read.viewedShield > 0 && hero ? [{ id: 'fx_arcane_barrier', x: hero.x, y: hero.y, age: now, lift: EVENT_FX.shield.lift, on: hero.id }] : [];
    fx = fx.filter((e) => now - e.start < e.life);
    floats = floats.filter((e) => now - e.start < e.life);
    const where = (e) => {
      if (e.follow === undefined) return { x: e.x, y: e.y };
      const p = tl.positionAt(e.follow, now);
      return p ? { x: p.x, y: p.y } : null;
    };
    const effects = shields;
    for (const e of fx) {
      if (now < e.start) continue;
      const age = now - e.start;
      if (e.tx !== undefined) {
        const k = Math.min(1, age / e.life);
        effects.push({ id: e.id, x: e.x + (e.tx - e.x) * k, y: e.y + (e.ty - e.y) * k, age, lift: e.lift, on: e.on, angle: Math.atan2(e.ty - e.y, e.tx - e.x) });
        continue;
      }
      const p = where(e);
      if (p) effects.push({ id: e.id, x: p.x, y: p.y, age, lift: e.lift, on: e.on });
    }
    const shown = floats.filter((e) => now >= e.start).map((e) => ({ text: e.text, kind: e.kind, x: e.x, y: e.y, dx: e.dx, dy: e.dy, age: now - e.start, life: e.life, big: e.big }));
    return { hero, units, floats: shown, fx: effects };
  }

  return {
    onEvent, frame,
    /** For tests: how many effects and floats are live, and the keys played. */
    stats: () => ({ fx: fx.length, floats: floats.length, played: keys.size }),
  };
}
