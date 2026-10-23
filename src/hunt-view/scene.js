// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/scene.js — THE LIVE HUNT, ONE FRAME AT A TIME (parity VW-*, FX-*).
//
// PURE (but liveSceneOf, which keeps each character's one scene: S5). The character's timeline (timeline.js: the server's track and events)
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
//   S5 ONE SCENE PER CHARACTER AND HUNT (liveSceneOf): the scene remembers what it
//      has played (deaths, bleed stacks, effects), and a World pane is remounted on
//      every switch of the viewed character, so the scene is the character's, never
//      the pane's (Andy 10-21: "tab away to another character while monsters are
//      dead ... they jump back").
//   S6 A UNIT DIES ONCE: a second kill of a unit drawn dead never restarts its fall,
//      and a corpse lies the way it fell (it never turns to face what it last swung
//      at: Andy 10-21 "saw a corpse twitch again once dead").
// ════════════════════════════════════════════════════════════════════════
import { EVENT_FX, LOOT_FX, HIT_FX, PROJECTILE, CAST_FX } from '../data/hunt-vfx.js?v=0.2.33';
import { outfitSprite } from '../data/hunt-outfits.js?v=0.2.33';
import { huntOf, partyOf } from '../session/hunt-sections.js?v=0.2.33';
import { partyPeopleOf } from '../session/party-sections.js?v=0.2.33';
import { floatShown } from './float-prefs.js?v=0.2.33';
import { heroSprite } from '../session/hero-look.js?v=0.2.33';
import { abilityName, itemName } from '../shell/widgets/bits.js?v=0.2.33';
import { STUB_SPRITE } from '../world/core/book.js?v=0.2.33';
import { HUNT_GROUNDS } from '../data/hunt-grounds.js?v=0.2.33';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.33';
import { levelOf } from '../session/character-sections.js?v=0.2.33';

/* The ground's first start tile, standing (the hero before its first window). */
function entranceOf(huntId) {
  const g = huntId ? Object.values(HUNT_GROUNDS).find((r) => r.hunt === huntId) : null;
  const t = g && g.start && g.start[0];
  return t ? { x: t[0], y: t[1], moving: false, d: 0, hx: 0, hy: 1 } : null;
}

export const SCENE_TIMING = Object.freeze({
  deathFadeMs: 400,     // VW-05: colour to a grey corpse
  corpseMs: 10000,      // how long a corpse lies
  corpseFadeMs: 2000,   // it fades out over its last 2 s
  flashMs: 120,         // a hit's white flash
  riseMs: 400,          // a unit a reconcile finds alive after its drawn death fades back in, never pops up
  staleMs: 1000,        // a scene not drawn for this long (another character viewed, a hidden tab) shows no one fall on its return
  floatMs: 1000,        // a floating number's life
  levelMs: 3000,        // "Level 6" over the hero when the server's Level rises (the earned moment)
});
const MAX_FX = 96, MAX_FLOATS = 64, MAX_KEYS = 4096, PRUNE_AT = 512;
/* FX-01: a target's numbers cycle through four offsets so a burst never stacks into one;
   an ability's name sits above them (FX-03) and the big numbers higher still (FX-02). */
const OFFSETS = Object.freeze([[0, 0], [7, -4], [-7, -4], [0, -9]]);
const NAME_DY = -14, BIG_DY = -18, LEVEL_DY = -30;

/** The facing of a heading: the cardinal (larger axis; east/west on a tie) and the diagonal, if any. */
function facingOf(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return { dir: 's', diag: null };
  const dir = ax >= ay ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  const diag = ax && ay && Math.min(ax, ay) / Math.max(ax, ay) >= Math.tan(Math.PI / 8) ? (dy > 0 ? 's' : 'n') + (dx > 0 ? 'e' : 'w') : null;
  return { dir, diag };
}

/**
 * YOUR OWN OTHER HEROES IN THE PARTY (seat -> sprite id): each wears what its own session holds from
 * the server (its `outfit` section: hero-look.js heroSprite, the look its own view draws it in), not the
 * role's default (Andy 10-21: "the other character in party/hunt shows the standard knight").
 * @param {object} cs  the viewed CharacterSession
 * @param {() => object[]} [peers]  the account's open CharacterSessions
 * @param {Map} people  partyPeopleOf(cs): seat -> { id, slot }
 */
function ownLooks(cs, peers, people) {
  const out = new Map();
  if (typeof peers !== 'function' || !cs || typeof cs.uid !== 'string' || !people.size) return out;
  const me = cs.uid.toLowerCase();
  const open = peers() || [];
  for (const [seat, who] of people) {
    if (String(who.id).toLowerCase() !== me || who.slot === cs.slot) continue;
    const peer = open.find((x) => x && x !== cs && x.slot === who.slot);
    if (peer) out.set(seat, heroSprite(peer));
  }
  return out;
}

/**
 * What the scene reads from ONE character, every frame (the snapshot, never cached).
 * @param {object} cs  a CharacterSession
 * @param {() => object[]} [peers]  the account's open CharacterSessions (own heroes' looks)
 */
export function readHunt(cs, peers) {
  const h = huntOf(cs);
  const p = partyOf(cs);
  const people = partyPeopleOf(cs);
  const looks = ownLooks(cs, peers, people);
  const heroes = new Map();
  for (const m of p ? p.members : []) if (m.unit !== null) heroes.set(m.unit, looks.has(m.seat) ? Object.assign({}, m, { look: looks.get(m.seat) }) : m);
  /* THE LIVE VIEW knows every hero of the instance before the snapshot does (its own units): each
     is the party member of its seat, so every member is drawn as a hero from the first swing. */
  /* (a prediction out of seeds still names its heroes: heroUnits() is [] only with no prediction at all) */
  const live = cs && cs.live && typeof cs.live.heroUnits === 'function' ? cs.live.heroUnits() : [];
  for (const x of live) {
    if (x.unit === null || heroes.has(x.unit)) continue;
    const m = p ? p.members.find((y) => y.seat === x.seat) : null;
    heroes.set(x.unit, Object.assign({}, m || { name: 'Hero', seat: x.seat, role: x.role }, { unit: x.unit, role: (m && m.role) || x.role },
      looks.has(x.seat) ? { look: looks.get(x.seat) } : null));
  }
  const selfLive = live.find((x) => x.self);
  return {
    units: h ? h.units : new Map(),
    heroes,
    people,
    viewed: h && h.hero.unit !== null ? h.hero.unit : selfLive && selfLive.unit !== null ? selfLive.unit : p ? p.self : null,
    viewedShield: h ? h.hero.shield : null,
    entrance: h ? entranceOf(h.huntId) : null,
    huntName: h && HUNT_INDEX[h.huntId] ? HUNT_INDEX[h.huntId].name : null,
    huntFromMs: h ? h.huntFromMs : null,
    self: p ? p.members.find((m) => m.seat === p.selfSeat) || null : null,
    /* the viewed hero's look: the ONE source the town draws it with too (chosen outfit, else role) */
    look: heroSprite(cs),
    /* the viewed hero's Level as the server's envelope says it (the level-up moment watches it rise) */
    level: (levelOf(cs) || {}).level ?? null,
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
  const flash = new Map(), dead = new Map(), swing = new Map(), bleed = new Map(), cycle = new Map(), target = new Map(), risen = new Map();
  const lie = new Map();   // S6: unit -> { dir, diag }, the facing a unit fell with
  /* S7: the client instant of the last frame drawn and the units it drew standing */
  let drawnAt = null;
  const standing = new Set();
  const fresh = () => o.read();
  let read = fresh();

  const isHero = (u) => read.heroes.has(u) || (read.units.get(u) || {}).side === 'hero';
  const isBoss = (u) => !!(read.units.get(u) || {}).boss;
  const roleOf = (u) => (read.heroes.get(u) ? read.heroes.get(u).role : isHero(u) ? null : 'monster');
  /* A monster's kind: the snapshot's, else the timeline's unit book (a corpse played after the
     snapshot dropped it). Unknown is null and the unit is not drawn (never a stub box). */
  const spriteOf = (u) => {
    if (u === read.viewed && read.look) return read.look;
    if (isHero(u)) { const m = read.heroes.get(u); return (m && m.look) || outfitSprite(m && m.outfit, m && m.role); }
    return (read.units.get(u) || {}).kind || (typeof tl.kindOf === 'function' ? tl.kindOf(u) : null) || null;
  };
  const unnamed = new Set();
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
    /* What flies before the hit lands: the ability's own row (null: it strikes where it stands), else the role's bolt. */
    const bolt = Object.hasOwn(PROJECTILE.ability, ev.ability) ? PROJECTILE.ability[ev.ability] : PROJECTILE.role[role] || null;
    const flies = !!bolt;
    const land = flies ? start + PROJECTILE.flightMs : start;
    if (flies) {
      const a = fixed(ev.u, start), b = fixed(ev.t, start);
      if (a && b) addFx(bolt, start, { x: a.x, y: a.y, tx: b.x, ty: b.y }, PROJECTILE.lift, PROJECTILE.flightMs, ev.u);
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
      case 'miss': case 'immune': addFloat(ev.t, 'miss', ev.type === 'immune' ? 'immune' : ev.dodge === true ? 'dodge' : 'miss', 'miss', start); swing.set(ev.u, { t: ev.t, at: start }); break;
      case 'heal': addFloat(ev.t, 'heal', '+' + ev.amount, 'heal', start); break;
      case 'cast': {
        const r = CAST_FX.ability[ev.ability] || CAST_FX.role[roleOf(ev.u)];
        if (r) addFx(r.fx, start, at(ev.u), r.lift, Math.min(CAST_FX.maxMs, r.lifeMs || CAST_FX.maxMs));
        addFloat(ev.u, 'ability', abilityName(ev.ability), 'ability', start);
        if (Number.isInteger(ev.t) && ev.t !== ev.u) swing.set(ev.u, { t: ev.t, at: start });
        break;
      }
      case 'kill':
        /* S6: a unit dies once. A restart re-runs a death the screen already played under another id. */
        if (!isHero(ev.t) && dead.has(ev.t)) return true;
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
      case 'rare_drop': { const who = Number.isInteger(ev.u) ? ev.u : read.viewed; if (who !== null) addFloat(who, 'loot', itemName(ev.item), 'loot', start, true); break; }
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

  /* The viewed hero before its unit exists: its outfit at the entrance, walking out the travel. */
  function standIn(now) {
    const e = read.entrance;
    const m = read.self;
    const id = read.look || outfitSprite(m && m.outfit, m && m.role);
    if (!e || !id) return null;
    const server = typeof tl.serverNowAt === 'function' ? tl.serverNowAt(now) : null;
    const left = Number.isFinite(read.huntFromMs) && server !== null ? Math.max(0, read.huntFromMs - server) : 0;
    const sp = book.sprite(id);
    const walk = sp.anims && sp.anims.walk;
    const walking = left > 0 && !!walk;
    const { dir, diag } = facingOf(0, 1);
    const name = read.huntName || 'the hunt';
    return { id, unit: read.viewed !== null ? read.viewed : -1, x: e.x, y: e.y, dir, diag, alpha: 1, grey: 0, under: false, flash: false,
      anim: walking ? 'walk' : sp.anims && sp.anims.idle ? 'idle' : 'walk',
      frame: walking ? Math.floor((now / 1000) * walk.fps) : 0,
      plate: { text: left > 0 ? 'Walking to ' + name + ' · ' + Math.ceil(left / 1000) + ' s' : (m && m.name) || 'Hero', kind: 'self' } };
  }

  /** One unit's draw record at `now`, or null when it is gone (`at`: a stand-in position). */
  function unitAt(u, now, at) {
    const p = at || tl.positionAt(u, now);
    if (!p) return null;
    const id = spriteOf(u);
    if (!id || !book.sprite(id) || book.sprite(id) === STUB_SPRITE) {
      if (!unnamed.has(u)) { unnamed.add(u); console.warn('[hunt-scene] no sprite for unit ' + u + ' (' + id + '): not drawn'); }
      return null;
    }
    const hero = isHero(u);
    const m = read.heroes.get(u);
    const sp = book.sprite(id);
    const clips = sp.anims || {};
    /* Facing: the way it walks; standing, toward what it last swung at; else its last heading. */
    let hx = p.hx, hy = p.hy;
    const s = swing.get(u);
    if (!p.moving && s && now - s.at >= 0) {   // standing, it keeps facing what it last swung at (no turning back between swings)
      const q = tl.positionAt(s.t, now);
      if (q && (q.x !== p.x || q.y !== p.y)) { hx = q.x - p.x; hy = q.y - p.y; }
    }
    let { dir, diag } = facingOf(hx, hy);
    let alpha = 1, grey = 0, under = false, corpse = null;
    const rose = risen.get(u);
    if (rose !== undefined) { if (now - rose >= SCENE_TIMING.riseMs) risen.delete(u); else alpha = Math.max(0, now - rose) / SCENE_TIMING.riseMs; }
    const died = dead.get(u);
    if (died !== undefined) {
      /* a unit the server walks again is not dead; one killed mid-step (HP 0 at this instant, read as its bar
         reads it) finishes its step dead */
      const hpNow = typeof tl.hpAt === 'function' ? tl.hpAt(u, now) : null;
      const gone = hpNow ? hpNow.hp <= 0 : (read.units.get(u) || {}).hp === 0;
      if (p.moving && !gone) { dead.delete(u); lie.delete(u); } else {
        const age = now - died;
        if (age >= SCENE_TIMING.corpseMs) return null;
        if (age >= 0) {
          under = true;
          /* S6: it lies the way it fell */
          if (!lie.has(u)) lie.set(u, { dir, diag });
          ({ dir, diag } = lie.get(u));
          /* VW-05: the sprite's own death clip, then its corpse frame; only art without them greys. */
          corpse = corpseFrame(id, clips, dir, age);
          if (!corpse) grey = Math.min(1, age / SCENE_TIMING.deathFadeMs);
          alpha = (1 - 0.45 * grey) * Math.min(1, (SCENE_TIMING.corpseMs - age) / SCENE_TIMING.corpseFadeMs);
        }
      }
    }
    const walk = clips.walk;
    const moving = p.moving && !under && !!walk;
    /* VW-11: the walk frame advances with distance walked, at the clip's fps when moving at the playback speed. */
    const frame = corpse ? corpse.frame : moving ? Math.floor((p.d * walk.fps * tl.tileMs) / 1000) : 0;
    const anim = corpse ? corpse.anim : moving ? 'walk' : clips.idle ? 'idle' : walk ? 'walk' : 'idle';
    const f = flash.get(u);
    const out = { id, unit: u, x: p.x, y: p.y, anim, dir, diag, frame, alpha, grey, under,
      flash: !under && f !== undefined && now >= f && now - f < SCENE_TIMING.flashMs };
    if (!under) {
      /* Every bar is the HP AT THE INSTANT SHOWN (timeline.js T6: heroes too, so it moves live), the snapshot's only as a fallback. */
      const played = typeof tl.hpAt !== 'function' ? null : tl.hpAt(u, now);
      const hp = played ? played.hp : hero ? m && m.hp : (read.units.get(u) || {}).hp;
      const hpMax = played ? played.maxHp : hero ? m && m.hpMax : (read.units.get(u) || {}).hpMax;
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
      } else if (!hero) {
        const kind = spriteOf(u);
        if (kind) out.ref = { monster: kind };
        if (isBoss(u)) out.plate = { text: (read.units.get(u) || {}).name || null, kind: 'foe' };
      }
      if (out.plate && !out.plate.text) delete out.plate;
      const stacks = bleed.get(u) || 0;
      if (stacks > 0 && (hero || read.shown('bleed_badge', isBoss(u)))) out.badge = stacks;
    }
    return out;
  }

  /* VW-05: a corpse `age` ms old plays its sprite's death clip once, then lies as its corpse frame;
     null when the art has neither (it greys instead). */
  function corpseFrame(id, clips, dir, age) {
    const d = clips.death;
    if (d && d.fps) {
      const n = book.frames(id, 'death', dir);
      const i = Math.floor((age * d.fps) / 1000);
      if (i < n || !clips.corpse) return { anim: 'death', frame: Math.min(i, n - 1) };
    }
    return clips.corpse ? { anim: 'corpse', frame: 0 } : null;
  }

  /* THE LEVEL-UP MOMENT (designer 2026-10-22: Levels 2 to 5 changed one number in the medallion and
     nothing else). When the SERVER's Level for the viewed hero rises, "Level N" rises over the hero, in
     the Level XP gold, bigger and slower than a "+XP". The first Level seen is the baseline, so a mount,
     a reload or a switch of character never plays one; it is the server's number, never predicted. */
  let lastLevel = null;
  function levelMoment(now) {
    const lv = read.level;
    if (!Number.isInteger(lv)) return;
    const up = lastLevel !== null && lv > lastLevel;
    lastLevel = lv;
    if (!up || read.viewed === null || !read.shown('level', false)) return;
    const p = tl.positionAt(read.viewed, now);
    if (p) floats.push({ text: 'Level ' + lv, kind: 'xp', x: p.x, y: p.y, dx: 0, dy: LEVEL_DY, start: now, life: SCENE_TIMING.levelMs, big: true });
  }

  /**
   * The draw state at `now` (the timeline's clock).
   * @param {number} now
   */
  function frame(now) {
    read = fresh();
    levelMoment(now);
    let hero = null;
    const units = [];
    const ids = tl.units();
    /* S4: per-unit state never outlives the unit's track (a long hunt respawns thousands). */
    if (flash.size + dead.size + swing.size + bleed.size + cycle.size + target.size + risen.size + lie.size > PRUNE_AT) {
      const live = new Set(ids);
      for (const m of [flash, dead, swing, bleed, cycle, target, risen, lie]) for (const k of m.keys()) if (!live.has(k)) m.delete(k);
    }
    drawnAt = now;
    standing.clear();
    for (const u of ids) {
      const d = unitAt(u, now);
      if (!d) continue;
      if (!d.under) standing.add(u);
      if (u === read.viewed) hero = d;
      else units.push(d);
    }
    /* BEFORE THE FIRST SWING (just entered, travelling, or reloaded): the viewed hero is at the
       ground's entrance instead of leaving the screen empty, walking while the server's travel
       time runs ("Walking to Mill Cellar · 18 s"; travel_s is the server's one data value). */
    if (!hero && read.entrance) hero = (read.viewed !== null && unitAt(read.viewed, now, read.entrance)) || standIn(now);
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
    /**
     * A restart of the live view (live-link.js _restart) found these units standing at `now`. The
     * drawing follows it both ways: a monster drawn dead that the server's world holds alive fades
     * back in (never pops up off its corpse), and a monster drawn STANDING that is no longer in that
     * world falls where it stands (left drawn, it stood at its last tile with an empty bar).
     * S7 ONLY WHAT WAS ON SCREEN FALLS: "drawn standing" is the last frame's, and only while that frame
     * is current (staleMs). A scene coming back (another character was viewed, a hidden tab) shows a
     * monster that died meanwhile as gone, never falling anew at its last tile (Andy a17, v0.2.33:
     * "switching characters brings dead monsters back on screen").
     */
    revive(alive, now) {
      if (!alive) return;
      read = fresh();
      const t = Number.isFinite(now) ? now : null;
      for (const u of alive) {
        if (!dead.has(u)) continue;
        dead.delete(u); flash.delete(u); lie.delete(u);
        if (t !== null) risen.set(u, t);
      }
      if (t === null) return;
      const onScreen = drawnAt !== null && t - drawnAt <= SCENE_TIMING.staleMs;
      for (const u of tl.units()) {
        if (alive.has(u) || dead.has(u) || isHero(u)) continue;
        dead.set(u, onScreen && standing.has(u) ? t : t - SCENE_TIMING.corpseMs);
      }
    },
    /** For tests: how many effects and floats are live, and the keys played. */
    stats: () => ({ fx: fx.length, floats: floats.length, played: keys.size }),
  };
}

/* S5: CharacterSession -> { key, scene, off }. Weak: a closed character takes its scene with it. */
const SCENES = new WeakMap();

/**
 * THE CHARACTER'S ONE LIVE SCENE for the hunt `key` names (its map and session): made on the first
 * view, subscribed to the character's timeline from then on, and handed to every World pane that shows
 * the character, so a switch away and back keeps every death, bleed stack and effect it played (S5).
 * A new key (another hunt) replaces it.
 * @param {object} cs  a CharacterSession
 * @param {{key: string, book: object, peers?: () => object[]}} o
 */
export function liveSceneOf(cs, o) {
  const had = SCENES.get(cs);
  if (had && had.key === o.key) return had.scene;
  endLiveScene(cs);
  const scene = createHuntScene({ timeline: cs.timeline, book: o.book, read: () => readHunt(cs, o.peers) });
  SCENES.set(cs, { key: o.key, scene, off: cs.timeline.subscribe((ev) => scene.onEvent(ev, cs.now())) });
  return scene;
}

/** The character's hunt is over (or shows no live scene): its scene stops listening and is forgotten. */
export function endLiveScene(cs) {
  const had = cs && SCENES.get(cs);
  if (!had) return;
  had.off();
  SCENES.delete(cs);
}
