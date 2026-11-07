// ════════════════════════════════════════════════════════════════════════
// src/shell/slot-waits.js — WHY A SLOT WITH A CONDITION ISN'T FIRING, IN PLAIN WORDS.
//
// SAY WHY (Tyler 2026-10-25): a player who sets something up is told why it isn't working. A boss lane found the class:
// Fireball's suggested "2 or more monsters" never fires on a lone monster, Circle of Renewal's "2 or more hurt" never fires on a
// lone hero, and neither said so. A slot's conditions are the player's (Tyler 2026-10-21), so nothing here changes what one does
// and no engine decision reads this: it only says which condition holds the slot back.
//   canHold / neverWords  a condition that can't hold as things stand (too few heroes, more monsters than the action covers):
//                         known from the server's party and the catalogue, so it reads in town too
//   waitReason            that, or the one failing condition by the engine's own test (live-engine.js slotTesterOf)
//   setupNote             what the condition being set up will mean: Configure action's line, on a desktop and a phone
//   whyFacts / slotWhy    the ONE answer the bar, its tooltip and Configure action share
//
// A wait on how many monsters or heroes there are MARKS the slot (dim, a glyph, "2+" where an item shows its count): the screen
// shows nothing else that explains it. A wait on HP, mana or anything the player can already read is `rest`: words only, in the
// tooltip and on Configure action's first line, or every food slot on the bar would look broken at full health.
// Display only: an answer is worth one frame, and nothing spends it.
// ════════════════════════════════════════════════════════════════════════
import { METRICS } from '../data/condition-metrics.js?v=0.2.106';
import { areaTopOf } from '../core/hunt/conditions.js?v=0.2.106';
import { huntOf, settingsOf, partyOf } from '../session/hunt-sections.js?v=0.2.106';
import { carriedOf, equipmentOf, skillsOf } from '../session/item-sections.js?v=0.2.106';
import { conditionWords } from './bar-draft.js?v=0.2.106';
import { reasonOf, holdingReason } from './action-facts.js?v=0.2.106';
import { carryRows } from './carry-in.js?v=0.2.106';

const METRIC = new Map(METRICS.map((m) => [m.id, m]));
/* The tests that mark a slot, and the glyph each marks it with. */
const MARKS = Object.freeze({ enemies_in_aoe: 'uiTarget', allies_below: 'uiPeople' });

/* The least an "at least" count test wants ("at or above 2" and "above 1" both want 2); null for any other test. */
const atLeast = (c) => (c.op === 'gte' ? c.value : c.op === 'gt' ? c.value + 1 : null);
/* The most a count can read: the party's heroes, or the monsters the slot's action can hit (conditions.js areaTopOf: a Cleave's maxHits, else its footprint's tiles). */
function topOf(c, slot, party) {
  if (c.metric === 'allies_below') return party;
  if (c.metric === 'enemies_in_aoe') return areaTopOf(slot, null);
  return null;
}
/* Can `c` ever hold on `slot` in a party of `party`? */
function canHold(c, slot, party) {
  const m = METRIC.get(c.metric);
  if (m && m.value === 'pct') return !((c.op === 'lt' && c.value <= 0) || (c.op === 'gt' && c.value >= 100));
  const top = topOf(c, slot, party), need = c.op === 'eq' ? c.value : atLeast(c);
  return top === null || need === null || need <= top;
}

/* The registry's own words for "under 80% health" (allies_below's subjects). */
const HURT = /** @type {Record<string, string>} */ (/** @type {any} */ (METRIC.get('allies_below')).subject);
const heroesWord = (c, n) => (n === 1 ? 'a hero' : n + ' or more heroes') + ' under ' + HURT[c.subject || 'under_50'];
const monstersWord = (n) => (n === 1 ? 'a monster' : n + ' or more monsters') + ' in its area';

function neverWords(c, slot, party) {
  const need = atLeast(c), top = topOf(c, slot, party);
  if (need !== null && c.metric === 'allies_below') return 'Waiting: needs ' + heroesWord(c, need) + (party > 1 ? ', and your party has ' + party + '.' : ', and you’re not in a party.');
  if (need !== null && c.metric === 'enemies_in_aoe') return 'Waiting: this reaches ' + (top === 1 ? 'one monster' : top + ' monsters') + ' at most, so it never gets to ' + need + '. Change this condition to let it fire.';
  return 'This can’t fire: “' + conditionWords(c) + '” never happens. Change this condition to let it fire.';
}

/**
 * WHY `sl`'S CONDITIONS HOLD IT BACK, or null: { code, text, glyph, strike: false, quiet?, rest?, need? }. `party` is the party's
 * size; `test` the engine's test of a slot (slotTesterOf), or null when no fight is on or no prediction runs. `need` is the "2+" a
 * marked slot shows where an item shows its count.
 * @returns {{ code: string, text: string, glyph: string, strike: boolean, quiet?: boolean, rest?: boolean, need?: string } | null}
 */
export function waitReason(sl, party, test) {
  if (!sl || sl.empty || !Array.isArray(sl.conditions)) return null;
  const conds = sl.conditions;
  const mark = (code, text, c) => ({ code, text, glyph: MARKS[c.metric] || 'uiWarn', strike: false, ...(atLeast(c) !== null && MARKS[c.metric] ? { need: atLeast(c) + '+' } : {}) });
  const never = conds.find((c) => !canHold(c, sl, party));
  if (never) return mark('never_' + never.metric, neverWords(never, sl, party), never);
  const t = test ? test(sl) : null;
  if (!t || t.pass) return null;
  if (t.ignored) return { code: 'ignored', text: 'Waiting: this slot ignores the monster you’re fighting.', glyph: 'uiTarget', strike: false };
  const failing = conds.filter((c, i) => !(t.mask & (1 << i)));
  const c = failing.find((x) => MARKS[x.metric] && atLeast(x) !== null) || failing[0];
  if (!c) return null;
  if (MARKS[c.metric] && atLeast(c) !== null) {
    const words = c.metric === 'allies_below' ? heroesWord(c, atLeast(c)) : monstersWord(atLeast(c));
    return mark('wait_' + c.metric, 'Waiting: needs ' + words + '. Until then your hero fights on without it.', c);
  }
  return { code: 'wait_until', text: 'Waiting until ' + conditionWords(c) + '.', glyph: 'uiHourglass', strike: false, quiet: true, rest: true };
}

/** Configure action's line: what the conditions being set up will mean, '' when they ask nothing surprising. `d` is the draft slot. */
export function setupNote(d, party) {
  if (!d || !d.action || !d.action.id) return '';
  for (const c of d.conditions) {
    if (!canHold(c, d, party)) return neverWords(c, d, party);
    const need = c.metric === 'enemies_in_aoe' ? atLeast(c) : null;
    if (need === 2) return 'On a lone monster this slot waits and your hero fights on without it. To use it on one, remove this condition.';
    if (need > 2) return 'With fewer than ' + need + ' monsters in its area this slot waits and your hero fights on without it.';
  }
  return '';
}

/** The server's facts every slot of this character is judged on: read once for a whole bar. */
export function whyFacts(cs) {
  const h = huntOf(cs), p = partyOf(cs), live = cs && cs.live;
  const hero = h && !h.ended ? h.hero : null;
  return {
    set: settingsOf(cs), bag: carriedOf(cs), hero, worn: /** @type {{ ammo?: string }} */ (equipmentOf(cs) || {}).ammo, skills: skillsOf(cs), pack: carryRows(cs),
    party: p ? p.members.length : 1,
    /* (Bug #61: the viewed tank holds every engaged monster, so its Challenge slot reads "Holding".) */
    holding: !!hero && !!live && typeof live.holdsPack === 'function' && live.holdsPack(hero.unit),
    test: hero && live && typeof live.slotTester === 'function' ? live.slotTester(hero.unit) : null,
  };
}

/**
 * WHY SLOT `sl` ISN'T FIRING NOW, or null. A strike first (the server would not fire it at all), then a marked wait, then mana,
 * then words alone: the engine tests a slot's conditions before its mana (conditions.js pickSlot), so a condition that fails is
 * the truer answer, unless it is one the player can already read.
 */
export function slotWhy(sl, f) {
  const r = reasonOf(sl, f.set, f.bag, f.hero, f.worn, f.skills, f.pack);
  if (r && r.strike) return r;
  const w = waitReason(sl, f.party, f.test);
  if (w && !w.rest) return w;
  return r || w || holdingReason(sl, f.holding);
}
