// ============================================================
// src/core/hunt/tally.js — THE ANALYZER TALLY (spec §3.6, parity AN-01..05)
//
// The server-side session stats as a PURE ACCUMULATOR: `tallyEvents` folds
// one window's events into a delta per hero and for the party; `addTally`
// folds a delta into the running session total, which the S1 server lane
// persists in the `hunt_analyzer` envelope section. The client never
// computes a tally (spec §3.6 #6); it renders that section.
//
// THE PARTY IS THE SUM OF ITS HEROES (AN-02), by construction: every number
// is credited to exactly one hero and `party` is the fold of the heroes.
// Income split and waste pricing are the analyzer's (S-pg, AN-08); this only
// counts.
//
// WHAT EACH EVENT CREDITS (fields beyond events.js's required ones are read
// when present, with the stated default):
//   dmg   hero u → dealt.{total, byAbility[ability|'basic'], byElement[element|'physical']}
//         monster u → hero t taken.{total, byMonster[kind of u], byElement}
//   heal  healer u → healed.{total, bySource[ability|item|'heal']}; a monster's mend (it names its `spell`) credits nobody
//   kill  of a monster: hero u kills +1, gold += gold|0, loot[item] += qty (`loot` {item: qty})
//         of a hero: hero t deaths +1
//   xp    hero u: xp += amount, rawXp += raw|amount; skill 'magic' → magicXp
//   eat, drink, cast with `item`/`supply`: supplies.own[item] or
//         supplies.store[item] += n|1 by `source` ('own'|'store', REQUIRED:
//         a supply line of unknown origin would price waste wrong), and
//         supplies.storeGold += gold|0 for store lines (own costs nothing, AN-03)
// A `status_tick` credits nothing: the tick's damage is the `dmg` event its
// hurt() emits, so bleed is counted once, as physical (ST-05).
//   rule_wait, and every event above   the hero's `report` (below, ./report.js)
//
// SUSTAIN (Balance Lab phase 2, docs/design/redesign/07-balance-lab.md 3.4: the
// counters the Lab and the player's report read from one source). Counted only
// when the caller asks (`roster.sustain: true`); otherwise every hero and party
// tally is exactly what it was, `sustain` at zero. What kept a hero standing and
// what it cost, credited to the hero it happened to:
//   heal at hero t   sustain.healIn.{food (an `item`), self (u is t: its own
//                    spell or leech), ally (another hero's)} += amount
//   dmg at hero t    sustain.takenBy.{status (a `dot` tick), swing (a monster's
//                    'basic'), spell (any other ability: a monster's spell)}
//   cast by hero u   sustain.mana.spent += mana (the NET the cast kept: what
//                    Magic XP is paid on), sustain.mana.back += back
//   shot by hero u   sustain.mana.spent += mana (a staff's mana shot)
//   rule_wait why 'mana' by hero u   sustain.mana.waits += 1, waitsBy[label] += 1
//                    (conditions.js noteWait: once per change, never per step)
//   regeneration     no event (pull-cycle.js tickHeroes: natural regen and a
//                    worn own heal). With `roster.hp` { unit: [hp at the
//                    window's start, hp at its end or 0 at a death] } it is the
//                    one number that closes the window: end - start - healIn +
//                    takenBy (every other HP move on a hero is a `dmg` or a
//                    `heal` of the HP it moved: damage.js hurt, abilities.js
//                    healOne/leechBack, consumables.js raise). A window that
//                    does not close (a negative remainder) is refused. Without
//                    anchors it is not counted (the server's settle passes none).
// The settle's analyzer (hr-accrue accrue-hunt.js analyzerOf) asks for none: it
// keeps dealt, taken and healed, so the server's settle is byte for byte as it
// was. Storing `sustain` for the player's report is a fourth analyzer section in
// the settle's commit (hunt_session_tally): a database change, not made here.
//
// THE HUNT REPORT (GR-66, build plan FB-7; ./report.js): every hero's `report`,
// counted always, is the lowest health it reached with the monster and blow,
// its close calls under a quarter, and each bar rule's uses and waits. Unlike
// every other field it is not a sum: `low` keeps the lowest reading, so the
// fold (addTally, and the party over its heroes) is report.js addReport. The
// settle stores it as the fourth analyzer section (hunt_session_tally.report,
// supabase/migrations/1053-hunt-report.sql).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { isHero } from './sides.js';
import { emptyReport, reportEvent, addReport } from './report.js';

/** An empty tally: every field the analyzer reads, at zero. */
export function emptyTally() {
  return {
    kills: 0, deaths: 0, xp: 0, rawXp: 0, magicXp: 0, gold: 0, loot: {},
    supplies: { own: {}, store: {}, storeGold: 0 },
    dealt: { total: 0, byAbility: {}, byElement: {} },
    taken: { total: 0, byMonster: {}, byElement: {} },
    healed: { total: 0, bySource: {} },
    sustain: { healIn: { food: 0, self: 0, ally: 0, regen: 0 }, takenBy: { swing: 0, spell: 0, status: 0 }, mana: { spent: 0, back: 0, waits: 0 }, waitsBy: {} },
    report: emptyReport(),
  };
}

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, what) => {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error('tally: ' + what + ' must be an integer >= 0, got ' + v);
  return v;
};
const bump = (o, k, n) => { o[k] = (o[k] || 0) + n; };

/** Fold `delta` into `acc` (both tallies) and answer `acc`. Numbers add; maps add key by key; the `report` folds by its own rule
    (report.js addReport: the lowest health, counts added). */
export function addTally(acc, delta) {
  const fold = (a, d) => {
    for (const [k, v] of Object.entries(d)) {
      if (isMap(v)) { if (!isMap(a[k])) a[k] = {}; fold(a[k], v); } else a[k] = (a[k] || 0) + v;
    }
  };
  const { report, ...rest } = delta;
  fold(acc, rest);
  if (report !== undefined) acc.report = addReport(acc.report, report);
  return acc;
}

/** The roster a window's events are read against, from the instance world. */
export function rosterOf(world) {
  const heroes = []; const kinds = {};
  for (const u of world.units) { if (isHero(u)) heroes.push(u.id); kinds[u.id] = u.kind; }
  return { heroes, kinds };
}

/**
 * The tally delta of one window's events, per hero and party. `roster` =
 * { heroes: [unit ids], kinds: { unit id: monster kind }, sustain?: true, hp?: { unit id: [from, to] } }
 * (rosterOf(world); `sustain` counts the sustain block, `hp` its regeneration anchors: see the header);
 * a window with events and no roster is refused, never guessed.
 */
export function tallyEvents(events, roster = null) {
  if (!Array.isArray(events)) throw new Error('tally: events must be a list');
  const heroes = {};
  if (events.length && !(roster && Array.isArray(roster.heroes))) throw new Error('tally: events with no roster are refused');
  const ids = new Set(roster ? roster.heroes : []);
  const kinds = (roster && roster.kinds) || {};
  const sus = !!(roster && roster.sustain === true);
  const heroOf = (id, ev) => {
    if (!ids.has(id)) throw new Error('tally: ' + ev.type + ' at ' + ev.atMs + ' credits unit ' + id + ', who is not a hero of this hunt');
    if (!heroes[id]) heroes[id] = emptyTally();
    return heroes[id];
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'dmg': {
        const n = int(ev.amount, 'dmg amount');
        const el = ev.element || 'physical';
        if (ids.has(ev.u)) {
          const h = heroOf(ev.u, ev);
          h.dealt.total += n; bump(h.dealt.byAbility, ev.ability || 'basic', n); bump(h.dealt.byElement, el, n);
        } else if (ids.has(ev.t)) {
          const h = heroOf(ev.t, ev);
          h.taken.total += n; bump(h.taken.byMonster, kinds[ev.u] || 'unknown', n); bump(h.taken.byElement, el, n);
        }
        break;
      }
      case 'heal': {
        /* A MONSTER'S MEND (monster-spells.js: a heal that names its `spell`, from a monster to its packmate) is no hero's work */
        if (ev.spell !== undefined && !ids.has(ev.u)) break;
        const h = heroOf(ev.u, ev);
        const n = int(ev.amount, 'heal amount');
        h.healed.total += n; bump(h.healed.bySource, ev.ability || ev.item || 'heal', n);
        break;
      }
      case 'kill': {
        if (ids.has(ev.t)) { heroOf(ev.t, ev).deaths += 1; break; }
        /* NO DEALER (damage.js landHit): a bleed whose hero has left the world ticked it dead. No hero's kill; the party standing is paid it. */
        if (ev.u === null) break;
        const h = heroOf(ev.u, ev);
        h.kills += 1;
        if (ev.gold !== undefined) h.gold += int(ev.gold, 'kill gold');
        if (ev.loot !== undefined) {
          if (!isMap(ev.loot)) throw new Error('tally: kill loot must be { item: qty }');
          for (const [item, q] of Object.entries(ev.loot)) bump(h.loot, item, int(q, 'loot ' + item));
        }
        break;
      }
      case 'xp': {
        const h = heroOf(ev.u, ev);
        const n = int(ev.amount, 'xp amount');
        if (ev.skill === 'magic') h.magicXp += n;
        else { h.xp += n; h.rawXp += ev.raw !== undefined ? int(ev.raw, 'raw xp') : n; }
        break;
      }
      case 'eat': case 'drink': case 'cast': {
        const item = ev.type === 'cast' ? ev.supply : ev.item;
        if (!item) break;
        const h = heroOf(ev.u, ev);
        const n = ev.n !== undefined ? int(ev.n, 'supply n') : 1;
        if (ev.source === 'store') {
          bump(h.supplies.store, item, n);
          h.supplies.storeGold += ev.gold !== undefined ? int(ev.gold, 'store gold') : 0;
        } else if (ev.source === 'own') {
          bump(h.supplies.own, item, n);
        } else throw new Error('tally: supply source must be own or store, got ' + ev.source);
        break;
      }
      default: break;
    }
    if (sus) sustainOf(ev, ids, heroOf);
    reportEvent(ev, ids, kinds, (id, e) => heroOf(id, e).report);
  }
  if (sus && roster.hp) regenOf(roster.hp, ids, heroOf);
  const party = emptyTally();
  for (const id of Object.keys(heroes).sort((a, b) => a - b)) addTally(party, heroes[id]);
  return { heroes, party };
}

/* A sustain number off an event: a whole number at or above zero, else nothing (a field the event does not carry). */
const nat0 = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);

/* THE SUSTAIN BLOCK of one event (the header's table). Only heroes of the roster are credited; an event about anyone else counts nothing. */
function sustainOf(ev, ids, heroOf) {
  switch (ev.type) {
    case 'dmg':
      if (ids.has(ev.t) && !ids.has(ev.u)) bump(heroOf(ev.t, ev).sustain.takenBy, ev.dot ? 'status' : (ev.ability || 'basic') === 'basic' ? 'swing' : 'spell', int(ev.amount, 'dmg amount'));
      break;
    case 'heal':
      if (ids.has(ev.t)) bump(heroOf(ev.t, ev).sustain.healIn, ev.item ? 'food' : ev.u === ev.t ? 'self' : 'ally', int(ev.amount, 'heal amount'));
      break;
    case 'cast':
      if (ids.has(ev.u)) { const m = heroOf(ev.u, ev).sustain.mana; m.spent += nat0(ev.mana); m.back += nat0(ev.back); }
      break;
    case 'shot':
      if (ids.has(ev.u)) heroOf(ev.u, ev).sustain.mana.spent += nat0(ev.mana);
      break;
    case 'rule_wait':
      if (ev.why === 'mana' && ids.has(ev.u)) { const s = heroOf(ev.u, ev).sustain; s.mana.waits += 1; bump(s.waitsBy, String(ev.rule_label || ev.rule), 1); }
      break;
    default: break;
  }
}

/* REGENERATION, the HP no event moved: for each anchored hero, its window's end HP less its start, less every heal it took, plus every
   blow it lost. A window that does not close is an HP move with no event: refused, so the counter is never a guess. */
function regenOf(hp, ids, heroOf) {
  for (const [id, pair] of Object.entries(hp)) {
    const unit = Number(id);
    if (!ids.has(unit) || !Array.isArray(pair) || !pair.every((x) => Number.isSafeInteger(x) && x >= 0)) continue;
    const s = heroOf(unit, { type: 'regen', atMs: null }).sustain;
    const healIn = s.healIn.food + s.healIn.self + s.healIn.ally, lost = s.takenBy.swing + s.takenBy.spell + s.takenBy.status;
    const regen = pair[1] - pair[0] - healIn + lost;
    if (regen < 0) throw new Error('tally: hero ' + unit + ' went ' + pair[0] + ' -> ' + pair[1] + ' HP with ' + healIn + ' healed and ' + lost + ' lost: ' + (-regen) + ' HP moved with no event');
    s.healIn.regen += regen;
  }
}
