// ════════════════════════════════════════════════════════════════════════
// src/shell/away-work.js — "WHILE YOU WERE AWAY", FOR A HERO FUELING THE GREAT HEARTH.
//
// The crafter's panel, 2026-11-01: hours of town work came back to a card that named an old hunt, or no line at all. The line says what
// the town work did, the same way the hunt's does (away-recap.js): every number is a difference of two server answers, the stamp's and
// the record's. Since the bench cut (09-crafting 4.17) the one town work a pointer runs is a fuel run into the Great Hearth (the bridge
// until the company flame lights, 4.13 row 3; src/session/hearth-sections.js): what it burned and the Inner Flame it trained. Nothing here
// is spendable.
//
// THE STAMP IS AS OLD AS ITS NUMBERS. A run is paid only when something settles it, so the record's skill and bag are true as of the
// server's watermark (`state.accrued_to`), and that is the stamp's `at`: the line's time and its numbers are one stamp's. The viewed
// hero's run is settled at least every STAMP_EVERY_MS (town-poll.js settleStaleTown), so a stamp overstates an absence by less than the
// shortest one the line speaks of, as a hunt's does.
//
// THE RETURN IS JUDGED AFTER THE SETTLE. The first envelope back may be from before the sign-in's settle: until the watermark has moved
// past the stamp the line waits (awayWorkSettled), and so does the stamp. "It stopped about 25 min in" is the fuels the server burned
// times one fuel's time: display only, and worded as an estimate.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../data/skills.js';
import { whole } from '../render/format.js';
import { t } from '../render/player-text.js';
import { itemName } from './widgets/bits.js';
import { heldOf, nameOf, skillsOf } from '../session/item-sections.js';
import { serverNowOf } from '../session/hunt-sections.js';
import { fuelRowOf, fuelRunOf, fuelEachMs } from '../session/hearth-sections.js';

const TOWN_STAMP = /^town:artisan:(fuel_[a-z0-9_]+)$/;
const FLAME = 'inner_flame';
/* A record settled this recently is the return's answer; an older one waits for the sign-in's settle. */
const SETTLED_WITHIN_MS = 2 * 60 * 1000;

const stateOf = (cs) => (typeof cs.read === 'function' ? cs.read('state') : null);
const heldIn = (cs, id) => { const n = (heldOf(cs) || {})[id]; return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const keyOf = (row) => 'town:artisan:' + row.id;

/** Is this stamp a town run's? */
export const isWorkStamp = (was) => !!was && TOWN_STAMP.test(was.s);

/** The numbers to stamp for the run going now (true as of the server's watermark), or null when none runs. */
export function workStampOf(cs) {
  const row = fuelRunOf(cs);
  const st = stateOf(cs);
  const at = row && st ? Date.parse(st.accrued_to) : NaN;
  if (!row || !Number.isFinite(at)) return null;
  const sk = (skillsOf(cs) || {})[FLAME];
  /* `sl`: the skill level the server said with that XP (the return compares two server levels, never a curve of this build's); `n` the fuel
     the server's bag and Storage held */
  return { s: keyOf(row), at: Math.floor(at), ...(sk ? { sx: sk.xp, sl: sk.level } : {}), n: heldIn(cs, row.item) };
}

/** Has the run in this stamp been paid since it was stamped? False only while the line must wait for the settle. Pure. */
export function awayWorkSettled(cs, was, minMs) {
  const now = serverNowOf(cs);
  if (!Number.isFinite(now) || now - was.at < minMs) return true;
  const row = fuelRunOf(cs);
  if (!row || keyOf(row) !== was.s) return true;   // the engine pays before it stops or switches a run
  const paid = Date.parse(stateOf(cs).accrued_to);
  return paid > was.at && now - paid < SETTLED_WITHIN_MS;
}

/**
 * The away line for a stamped fuel run, or null when nothing came of it. Pure.
 * @param {(ms: number) => string} awayWords  away-recap.js's "1 h 58 min"
 */
export function awayWorkLineOf(cs, was, awayWords) {
  const m = TOWN_STAMP.exec(was.s);
  const row = m && fuelRowOf(m[1]);
  const now = serverNowOf(cs);
  if (!row || !Number.isFinite(now)) return null;
  const parts = [];
  const burned = Number.isSafeInteger(was.n) ? was.n - heldIn(cs, row.item) : 0;
  if (burned > 0) parts.push(whole(burned) + ' burned');
  const sk = (skillsOf(cs) || {})[FLAME];
  const skill = (SKILLS_DEF[FLAME] && SKILLS_DEF[FLAME].name) || FLAME;
  const xp = sk && Number.isSafeInteger(was.sx) ? sk.xp - was.sx : 0;
  if (xp > 0) { const from = Number.isSafeInteger(was.sl) && was.sl >= 1 ? was.sl : null; parts.push(from !== null && sk.level > from ? skill + ' ' + from + ' to ' + sk.level : '+' + whole(xp) + ' ' + skill + ' XP'); }
  if (!parts.length) return null;
  const goes = fuelRunOf(cs);
  const still = !!goes && keyOf(goes) === was.s;
  const ran = burned > 0 ? Math.ceil(burned / row.need) * fuelEachMs(row) : 0;
  const when = ran >= 60000 && ran < now - was.at ? ' about ' + awayWords(ran) + ' in' : '';
  /* why it stopped, from the record: its fuel ran out, else a Stop or a hunt's start it cannot tell apart */
  const out = heldIn(cs, row.item) < row.need ? ', out of ' + itemName(row.item) : '';
  const tail = still ? ' · ' + t('away.work_how_bench') : ' · Stopped' + when + out;
  const name = nameOf(cs) || 'Hero';
  const who = name + ' fed the Great Hearth with ' + itemName(row.item), facts = t('away.card_facts', { facts: parts.join(', ') }) + tail;
  return {
    id: 'away:' + was.s.slice(0, 64) + ':' + was.at, kind: 'away', session: null, work: was.s, still,
    /* a run still burning: its press is the window that stops it (windows/away.js OPENS.work) */
    action: still ? 'work' : 'show', button: still ? t('away.work_change') : 'See your hero',
    /* the away card's (windows/away.js): the hero, the absence, and the line after its head ("Tess fed the Great Hearth with Bones · 4,303 burned") */
    facts: { name, gone: now - was.at, body: t('away.card_work', { who, facts }) },
    text: t('away.card_head', { time: awayWords(now - was.at), who }) + ' · ' + facts,
  };
}
