// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/combat-log.js — THE COMBAT LOG'S LINES, FROM SERVER EVENTS ONLY.
//
// One log per CharacterSession (logFor), fed by that character's timeline
// (src/hunt-view/timeline.js) as each event's time comes, so the log reads in
// step with the hunt on screen and matches the analyzer: both come from the
// same server events (parity CL-04). Each event becomes at most one line with
// a LOG_TYPES id (src/data/combat-text.js), the units it names, and plain
// words. The newest LOG_MAX_LINES are kept; an event id is never logged twice
// (the timeline de-duplicates).
//
// Names: heroes from the `party` section, monsters from the hunt pose's unit
// kinds (src/session/hunt-sections.js). An unknown unit reads "Someone".
// ════════════════════════════════════════════════════════════════════════
import { LOG_MAX_LINES } from '../data/combat-text.js?v=0.2.10';
import { huntOf, partyOf } from '../session/hunt-sections.js?v=0.2.10';
import { monsterName, itemName, abilityName } from '../shell/widgets/bits.js?v=0.2.10';

const LOGS = new WeakMap();

function namer(cs) {
  const h = huntOf(cs);
  const p = partyOf(cs);
  const heroes = new Map(p ? p.members.map((m) => [m.unit, m.name]) : []);
  if (h && h.hero.unit !== null && h.hero.name) heroes.set(h.hero.unit, h.hero.name);
  const units = h ? h.units : new Map();
  return {
    name(u) {
      if (heroes.has(u)) return heroes.get(u);
      const x = units.get(u);
      return x && (x.name || (x.kind && monsterName(x.kind))) || 'Someone';
    },
    isHero: (u) => heroes.has(u) || (units.get(u) || {}).side === 'hero',
  };
}

/**
 * One event as a line, or null when it is not a log line.
 * @returns {{key: string, type: string, units: number[], text: string}|null}
 */
export function lineOf(ev, n) {
  const a = n.name(ev.u), b = n.name(ev.t);
  const line = (type, text) => ({ key: ev.key, type, units: [ev.u, ev.t].filter(Number.isInteger), text });
  switch (ev.type) {
    case 'dmg': {
      const how = ev.ability && ev.ability !== 'basic' ? ' with ' + abilityName(ev.ability) : '';
      return line(n.isHero(ev.u) ? 'dealt' : 'taken', a + ' hits ' + b + ' for ' + ev.amount + how + '.');
    }
    case 'heal': return line('heal', ev.u === ev.t ? a + ' heals for ' + ev.amount + '.' : a + ' heals ' + b + ' for ' + ev.amount + '.');
    case 'xp': return line('xp', a + ' gains ' + ev.amount + ' XP.');
    case 'level': return line('xp', a + ' reaches ' + String(ev.skill).replace(/_/g, ' ') + ' level ' + ev.level + '.');
    case 'eat': case 'drink':
      return line('supply', a + (ev.type === 'eat' ? ' eats ' : ' drinks ') + itemName(ev.item) + (ev.source === 'store' ? ', bought from the store.' : ' from the bag.'));
    case 'status_on': return line('status', b + ' is ' + (ev.status === 'bleed' ? 'bleeding' : 'affected by ' + ev.status) + '.');
    case 'status_off': return line('status', b + (ev.status === 'bleed' ? ' stops bleeding.' : ' is free of ' + ev.status + '.'));
    case 'death': return line('death', (n.isHero(ev.u) ? a : 'Your hero') + ' was killed by ' + monsterName(ev.monster) + '.');
    case 'rare_drop': return line('loot', 'Rare drop: ' + itemName(ev.item) + '!');
    case 'kill': {
      if (n.isHero(ev.t)) return line('death', b + ' dies.');
      const loot = ev.loot && typeof ev.loot === 'object' ? Object.entries(ev.loot) : [];
      if (!loot.length) return line('dealt', a + ' defeats ' + b + '.');
      return line('loot', b + ' dropped ' + loot.map(([id, q]) => itemName(id) + ' ×' + q).join(', ') + '.');
    }
    default: return null;
  }
}

/** The character's log: { lines(), version() }. Created on first ask, fed by its timeline from then on. */
export function logFor(cs) {
  let log = LOGS.get(cs);
  if (log) return log;
  const lines = [];
  let version = 0;
  cs.timeline.subscribe((ev) => {
    const l = lineOf(ev, namer(cs));
    if (!l) return;
    lines.push(Object.freeze(l));
    if (lines.length > LOG_MAX_LINES) lines.splice(0, lines.length - LOG_MAX_LINES);
    version++;
  });
  log = { lines: () => lines, version: () => version };
  LOGS.set(cs, log);
  return log;
}
