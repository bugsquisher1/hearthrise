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
//   heal  healer u → healed.{total, bySource[ability|item|'heal']}
//   kill  of a monster: hero u kills +1, gold += gold|0, loot[item] += qty (`loot` {item: qty})
//         of a hero: hero t deaths +1
//   xp    hero u: xp += amount, rawXp += raw|amount; skill 'magic' → magicXp
//   eat, drink, cast with `item`/`supply`: supplies.own[item] or
//         supplies.store[item] += n|1 by `source` ('own'|'store', REQUIRED:
//         a supply line of unknown origin would price waste wrong), and
//         supplies.storeGold += gold|0 for store lines (own costs nothing, AN-03)
// A `status_tick` credits nothing: the tick's damage is the `dmg` event its
// hurt() emits, so bleed is counted once, as physical (ST-05).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

/** An empty tally: every field the analyzer reads, at zero. */
export function emptyTally() {
  return {
    kills: 0, deaths: 0, xp: 0, rawXp: 0, magicXp: 0, gold: 0, loot: {},
    supplies: { own: {}, store: {}, storeGold: 0 },
    dealt: { total: 0, byAbility: {}, byElement: {} },
    taken: { total: 0, byMonster: {}, byElement: {} },
    healed: { total: 0, bySource: {} },
  };
}

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, what) => {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error('tally: ' + what + ' must be an integer >= 0, got ' + v);
  return v;
};
const bump = (o, k, n) => { o[k] = (o[k] || 0) + n; };

/** Fold `delta` into `acc` (both tallies) and answer `acc`. Numbers add; maps add key by key. */
export function addTally(acc, delta) {
  const fold = (a, d) => {
    for (const [k, v] of Object.entries(d)) {
      if (isMap(v)) { if (!isMap(a[k])) a[k] = {}; fold(a[k], v); } else a[k] = (a[k] || 0) + v;
    }
  };
  fold(acc, delta);
  return acc;
}

/** The roster a window's events are read against, from the instance world. */
export function rosterOf(world) {
  const heroes = []; const kinds = {};
  for (const u of world.units) { if (u.side === 'hero') heroes.push(u.id); kinds[u.id] = u.kind; }
  return { heroes, kinds };
}

/**
 * The tally delta of one window's events, per hero and party. `roster` =
 * { heroes: [unit ids], kinds: { unit id: monster kind } } (rosterOf(world));
 * a window with events and no roster is refused, never guessed.
 */
export function tallyEvents(events, roster = null) {
  if (!Array.isArray(events)) throw new Error('tally: events must be a list');
  const heroes = {};
  if (events.length && !(roster && Array.isArray(roster.heroes))) throw new Error('tally: events with no roster are refused');
  const ids = new Set(roster ? roster.heroes : []);
  const kinds = (roster && roster.kinds) || {};
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
        const h = heroOf(ev.u, ev);
        const n = int(ev.amount, 'heal amount');
        h.healed.total += n; bump(h.healed.bySource, ev.ability || ev.item || 'heal', n);
        break;
      }
      case 'kill': {
        if (ids.has(ev.t)) { heroOf(ev.t, ev).deaths += 1; break; }
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
  }
  const party = emptyTally();
  for (const id of Object.keys(heroes).sort((a, b) => a - b)) addTally(party, heroes[id]);
  return { heroes, party };
}
