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
// kinds (src/session/hunt-sections.js). An unknown unit reads "Someone". What
// an event's source is called (a move, a status, an engine piece, a Roads
// reaction, the worn Traits a blow's or a heal's `tr` lists) is src/render/source-names.js's, never its id.
// A status is said once until it ends (logFor): a refresh lands `status_on`
// again on a unit that still carries it, and the end of a status the log
// never said, or of a unit it saw die, is no news.
// ════════════════════════════════════════════════════════════════════════
import { LOG_MAX_LINES } from '../data/combat-text.js';
import { STATUSES, harmful } from '../data/statuses.js';
import { sourceName, traitNames } from '../render/source-names.js';
import { BOSS_CALL_WORDS, isGuarded } from '../data/boss-calls.js';
import { BOSS_HALL_WORDS, roomOfHunt, namedWaveOf } from '../data/boss-halls.js';
import { MONSTERS, monsterRangeOf } from '../data/monsters.js';
import { ABILITIES, abilitySkill } from '../data/abilities.js';
import { huntOf, partyOf } from '../session/hunt-sections.js';
import { monsterName, itemName, abilityName, skillName } from '../shell/widgets/bits.js';
import { tallyOf, tallyLine } from '../session/tally-sections.js';
import { t, hasText } from '../render/player-text.js';

const LOGS = new WeakMap();
/* the most unit:status pairs the log remembers as said (a long hunt's live units carry a few each; past this it forgets them all) */
const HELD_MAX = 4096;

function namer(cs) {
  const h = huntOf(cs);
  const p = partyOf(cs);
  const heroes = new Map(p ? p.members.map((m) => [m.unit, m.name]) : []);
  if (h && h.hero.unit !== null && h.hero.name) heroes.set(h.hero.unit, h.hero.name);
  /* A unit newer than the last pose read "Someone" ("Someone misses Someone", the first seconds of every hunt and each new
     pack): the live view knows its heroes before the snapshot does (scene.js readHunt), the timeline every monster it has walked. */
  const live = cs.live && typeof cs.live.heroUnits === 'function' ? cs.live.heroUnits() : [];
  for (const x of live) {
    const m = p && x.unit !== null && !heroes.has(x.unit) ? p.members.find((y) => y.seat === x.seat) : null;
    if (m) heroes.set(x.unit, m.name);
  }
  const units = h ? h.units : new Map();
  const call = h ? roomOfHunt(h.huntId) : null;
  return {
    /* Does boss `u`'s wave shield him (boss-calls.js isGuarded, his own row: a room's boss or a ground's)? The add line says so. */
    guarded(u) {
      const kind = (units.get(u) || {}).kind || cs.timeline.kindOf(u);
      return !!kind && isGuarded(MONSTERS[kind]);
    },
    /* A hall's wave with a named add in it (boss-halls.js namedWaveOf): the add line names him. */
    wave: call && call.kind === 'hall' ? namedWaveOf(call.hunt) : null,
    name(u) {
      if (heroes.has(u)) return heroes.get(u);
      const x = units.get(u) || {};
      const kind = x.kind || cs.timeline.kindOf(u);
      return x.name || (kind && monsterName(kind)) || 'Someone';
    },
    isHero: (u) => heroes.has(u) || (units.get(u) || {}).side === 'hero',
    /* Does monster `u` shoot (monsters.js monsterRangeOf: Hask's Lookout)? Its blow reads as a shot (the hand play 2026-11-14: "hits for 30" from 5 tiles off). */
    shoots(u) {
      const kind = (units.get(u) || {}).kind || cs.timeline.kindOf(u);
      return !!kind && monsterRangeOf(MONSTERS[kind]) > 0;
    },
  };
}

/** The moves skill `skill` unlocks at `level`, as a sentence that starts with a space, or ''. */
function unlockedBy(skill, level) {
  const rows = skill === 'level' ? [] : Object.values(ABILITIES).filter((r) => r.unlock === level && abilitySkill(r) === skill);
  return rows.length ? ' ' + t('log.unlocked', { moves: rows.map((r) => r.n).join(', ') }) : '';
}

/* Is unit `u` a monster that shoots? A namer with no `shoots` (a test's) reads every blow as a hit. */
const shot = (n, u) => typeof n.shoots === 'function' && n.shoots(u);

/* A STATUS landing or ending on `who` (statuses.js: its row's name): its own line when it has one (log.status_on_bleed), else by what it
   does: a patch its holder left on the ground, a helpful one (a heal over time, a guard, a boon), a harmful one. */
function statusWords(ev, who) {
  const row = Object.hasOwn(STATUSES, ev.status) ? STATUSES[ev.status] : null;
  const on = ev.type === 'status_on' ? 'on' : 'off';
  const kind = hasText('log.status_' + on + '_' + ev.status) ? '_' + ev.status : !row ? '' : row.ground ? '_ground' : harmful(row) ? '' : '_good';
  return t('log.status_' + on + kind, { who, status: sourceName(ev.status) });
}

/* THE WORN TRAITS THAT HELD on a blow or a heal (its `tr`, src/core/hunt/trait-rules.js), their names after its sentence: "... for 40 (<names>)." */
function traitsSaid(ev, text) {
  const names = traitNames(ev);
  if (!names.length) return text;
  const said = ' (' + names.join(', ') + ')';
  return text.endsWith('.') ? text.slice(0, -1) + said + '.' : text + said;
}

/**
 * One event as a line, or null when it is not a log line.
 * @returns {{key: string, type: string, units: number[], text: string, quiet?: boolean}|null}  `quiet`: nothing happened to anyone (a miss), so it wears no cost color
 */
export function lineOf(ev, n) {
  const a = n.name(ev.u), b = n.name(ev.t);
  const line = (type, text) => ({ key: ev.key, type, units: [ev.u, ev.t].filter(Number.isInteger), text: ev.tr ? traitsSaid(ev, text) : text });
  switch (ev.type) {
    case 'dmg': {
      /* a Bodyguard's share (damage.js landOn): the guard takes part of a blow at a back-row ally */
      if (ev.ability === 'bodyguard') return line('taken', t('log.guard', { target: b, n: ev.amount }));
      const how = ev.ability && ev.ability !== 'basic' ? ' with ' + abilityName(ev.ability) : '';
      /* a shooter's plain blow is a shot from range, not a hit at arm's length */
      if (!how && !n.isHero(ev.u) && shot(n, ev.u)) return line('taken', t('log.shot', { who: a, target: b, n: ev.amount }));
      return line(n.isHero(ev.u) ? 'dealt' : 'taken', a + ' hits ' + b + ' for ' + ev.amount + how + '.');
    }
    /* The screen shows a miss as a spark and no word (hunt-vfx.js GLANCE_FX, Tyler 2026-11-04: "the combat log can still say blah blah missed you"). */
    case 'miss': if (!n.isHero(ev.u) && shot(n, ev.u)) return Object.assign(line('taken', t(ev.dodge === true ? 'log.shot_dodge' : 'log.shot_miss', { who: a, target: b })), { quiet: true });
      return Object.assign(ev.dodge === true ? line('taken', b + ' dodges ' + a + '’s blow.') : line(n.isHero(ev.u) ? 'dealt' : 'taken', a + ' misses ' + b + '.'), { quiet: true });
    case 'heal': {
      /* a heal that names its source (a Mending tick, a reaction, a leech, a monster's mend: its `spell`) says it */
      const id = typeof ev.ability === 'string' && ev.ability ? ev.ability : typeof ev.spell === 'string' && ev.spell ? ev.spell : null;
      const src = id ? sourceName(id) : null;
      if (src && ev.u === ev.t) return line('heal', t('log.heal_self_with', { who: a, n: ev.amount, source: src }));
      if (src) return line('heal', t('log.heal_with', { who: a, target: b, n: ev.amount, source: src }));
      return line('heal', ev.u === ev.t ? a + ' heals for ' + ev.amount + '.' : a + ' heals ' + b + ' for ' + ev.amount + '.');
    }
    /* A kill's XP is LEVEL XP (xp-share.js); a skill's own level-up names the skill (Tyler 2026-10-22: say which XP). */
    case 'xp': return line('xp', a + ' gains ' + ev.amount + ' Level XP.');
    /* A skill level that unlocks a move (abilities.js unlock) says so: nothing else told a player Turning Cut was ready (lane/d-area-playtest). */
    case 'level': return line('xp', a + ' reaches ' + (ev.skill === 'level' ? 'Level ' : skillName(ev.skill) + ' level ') + ev.level + '.' + unlockedBy(ev.skill, ev.level));
    case 'eat': case 'drink':
      return line('supply', a + (ev.type === 'eat' ? ' eats ' : ' drinks ') + itemName(ev.item) + (ev.source === 'store' ? ', bought from the store.' : ' from the bag.'));
    /* A boss crossed a line (boss-phases.js; a room's boss or a ground's): the bar and the world say so too. */
    case 'boss_phase': {
      const guarded = ev.phase === 'adds' && n.guarded(ev.u);
      if (ev.phase === 'adds' && n.wave) {
        const L = BOSS_HALL_WORDS.log;
        return line('status', a + ' ' + (n.wave.others ? (guarded ? L.namedGuarded : L.named) : (guarded ? L.namedOnlyGuarded : L.namedOnly)).replace('{names}', n.wave.names));
      }
      return line('status', a + ' ' + BOSS_CALL_WORDS.log[guarded ? 'guarded' : ev.phase]);
    }
    /* A monster's spell winding up (monster-spells.js): the screen marks it, the log names it (a group spell reaches everyone). */
    case 'spell': return line('status', t(ev.shape === 'group' ? 'log.spell_group' : 'log.spell', { who: a, spell: abilityName(ev.spell) }));
    case 'status_on': case 'status_off': return line('status', statusWords(ev, b));
    case 'death': return line('death', (n.isHero(ev.u) ? a : 'Hero') + ' was killed by ' + monsterName(ev.monster) + '.');
    case 'rare_drop': return line('loot', (Number.isInteger(ev.u) ? 'Rare drop for ' + a + ': ' : 'Rare drop: ') + itemName(ev.item) + '!');
    case 'rare_roll': {
      /* the party's rare roll (party-split.js rareRoll): every eligible hero's roll, a tie's re-roll, the winner */
      const said = (r) => Object.entries(r && typeof r === 'object' ? r : {}).map(([u, roll]) => n.name(Number(u)) + ' ' + roll).join(', ');
      const first = said(ev.rolls);
      if (!first) return line('loot', a + ' takes the ' + itemName(ev.item) + ': everyone else in the party has won a rare since ' + a + ' last did.');
      const tie = ev.reroll ? ' Tie, so they roll again: ' + said(ev.reroll) + '.' : '';
      return line('loot', 'Rare roll for the ' + itemName(ev.item) + ': ' + first + '.' + tie + ' ' + a + ' wins it.');
    }
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
  const push = (l) => {
    lines.push(Object.freeze(l));
    if (lines.length > LOG_MAX_LINES) lines.splice(0, lines.length - LOG_MAX_LINES);
    version++;
  };
  /* A STATUS IS SAID ONCE UNTIL IT ENDS (the header): unit -> the statuses said on it. Cold Iron's Chill lands on every melee blow and a
     Frozen Ground patch's every second, so each refresh as a line filled the 200 with one word; a kill forgets the unit's. */
  const held = new Map();
  const news = (ev) => {
    if (ev.type === 'kill') { held.delete(ev.t); return true; }
    if (ev.type !== 'status_on' && ev.type !== 'status_off') return true;
    const said = held.get(ev.t);
    if (ev.type === 'status_off') return !!said && said.delete(ev.status);
    if (said && said.has(ev.status)) return false;
    if (!said && held.size >= HELD_MAX) held.clear();
    if (said) said.add(ev.status); else held.set(ev.t, new Set([ev.status]));
    return true;
  };
  cs.timeline.subscribe((ev) => { if (!news(ev)) return; const l = lineOf(ev, namer(cs)); if (l) push(l); });
  /* TAMSIN'S TALLY DONE: the server's count reached its target in a settle (the `tally` section). Logged
     once, as the change arrives; a task already done when this page first read it is not news. */
  let done = null;
  if (typeof cs.subscribe === 'function') {
    cs.subscribe(() => {
      const tally = tallyOf(cs);
      if (!tally) return;
      const now = tally.held.filter((x) => x.done).map((x) => [x.task + '@' + x.doneAt, x]);
      const h = huntOf(cs);
      const me = h && Number.isInteger(h.hero.unit) ? [h.hero.unit] : [];
      if (done) for (const [k, x] of now) if (!done.has(k)) push({ key: 'tally:' + k, type: 'tally', units: me, text: 'Task done: ' + tallyLine(x) + '. Collect from Tamsin in town' });
      done = new Set([...(done || []), ...now.map(([k]) => k)]);
    });
  }
  log = { lines: () => lines, version: () => version };
  LOGS.set(cs, log);
  return log;
}
