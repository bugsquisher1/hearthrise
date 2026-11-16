// ════════════════════════════════════════════════════════════════════════
// src/session/jewelry-sections.js — CRAFTED JEWELRY AS THE SERVER STATES IT (src/data/jewelry.js).
//
// Two reads. The `hallmark` section (hr_hallmark_view, 2027-03-14-jewelry-hallmark.sql): the Hallmark step for each Fine piece this
// hero holds in its bag or the account's Storage, at the server's gold and Crafting level, and the account's count against the day's
// limit; every envelope replaces it and nothing here prices a Hallmark. And the `jewel_jobs` section (hr_jewel_jobs_view,
// 2027-04-24-jewel-guarantees.sql): each rolled job's odds, shown BEFORE the roll (Tyler 2026-11-05, call 6), its guarantee, and which
// switched jobs this account may see, all as the server states them (the server's copy of the table the engine rolls with,
// src/core/artisan.js rollJewel). Display only: the bench rolls on the server, and this client never rolls or computes odds.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.132';
import { JEWEL_PERKS, ODDS_SCALE, JEWEL_SKILL } from '../data/jewelry.js?v=0.2.132';
import { skillsOf, bankOf } from './item-sections.js?v=0.2.132';

const whole = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,48}$/;

/** The section ({ offers: [{ from, to, perk, gem, gold, level }], today, perDay }), or null on a database before the step. */
export function hallmarkOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('hallmark') : null;
  if (!isObj(s) || !Array.isArray(s.offers)) return null;
  const offers = s.offers.filter((o) => isObj(o) && ID.test(String(o.from)) && ID.test(String(o.to)) && ITEMS[o.from] && ITEMS[o.to]
    && Number.isSafeInteger(o.gold) && o.gold > 0 && Number.isInteger(o.level))
    .map((o) => ({ from: o.from, to: o.to, perk: String(o.perk), gem: String(o.gem), gold: o.gold, level: o.level }));
  return { offers, today: whole(s.today), perDay: whole(s.per_day) };
}

/** The hero's Crafting level as the server holds it, or null before the envelope says. */
export function jewelLevelOf(cs) {
  const sk = skillsOf(cs);
  return sk && sk[JEWEL_SKILL] && Number.isInteger(sk[JEWEL_SKILL].level) ? sk[JEWEL_SKILL].level : null;
}

/** "5%", "0.04%": a per-ODDS_SCALE chance in the fewest digits that keep it. */
export function oddsPct(n) {
  const pct = (100 * n) / ODDS_SCALE;
  return (pct >= 1 || pct === 0 ? String(Math.round(pct * 10) / 10) : String(Math.round(pct * 100) / 100)) + '%';
}

const chance = (n) => Number.isInteger(n) && n >= 0 && n <= ODDS_SCALE;
const perkOk = (p) => typeof p === 'string' && Object.prototype.hasOwnProperty.call(JEWEL_PERKS, p);

/**
 * The `jewel_jobs` section (hr_jewel_jobs_view, 2027-04-24-jewel-guarantees.sql): every rolled job open to this account, its guarantee
 * and its odds per ODDS_SCALE at the hero's Crafting level as the server holds it: { level, jobs: Map(recipe -> { kind, perk, rolls,
 * fine, hallmarked, plain }) }, or null before the server sends it. A malformed row is dropped, never guessed.
 */
export function jewelJobsOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('jewel_jobs') : null;
  if (!isObj(s) || !Number.isInteger(s.level) || !Array.isArray(s.jobs)) return null;
  const jobs = new Map();
  for (const j of s.jobs) {
    if (!isObj(j) || !ID.test(String(j.recipe)) || !chance(j.fine) || !chance(j.hallmarked) || !chance(j.plain)
      || j.fine + j.hallmarked + j.plain !== ODDS_SCALE || (j.perk !== null && !perkOk(j.perk)) || !Array.isArray(j.rolls) || !j.rolls.every(perkOk)) continue;
    jobs.set(j.recipe, { kind: String(j.kind), perk: j.perk, rolls: j.rolls.slice(), fine: j.fine, hallmarked: j.hallmarked, plain: j.plain });
  }
  return { level: s.level, jobs };
}

/** Does the bench offer this job to this hero? A job behind a switch only when the server's section lists it; every other job, yes. */
export function jobShown(cs, recipe) {
  if (!recipe || !recipe.switch) return true;
  const s = jewelJobsOf(cs);
  return !!s && s.jobs.has(recipe.id);
}

/**
 * A rolled job's odds for this hero, before the roll, AS THE SERVER STATES THEM: { fine, hallmarked, plain } as words, the guaranteed
 * perk's name (null: none), the perks it may still roll as names, and the level they were read at; null for a job that doesn't roll
 * or one the server's section doesn't list (the bench says no odds rather than guess them).
 */
export function rollOddsOf(cs, recipe) {
  if (!recipe || !recipe.roll) return null;
  const s = jewelJobsOf(cs), j = s && s.jobs.get(recipe.id);
  if (!j) return null;
  return { level: s.level, fine: oddsPct(j.fine), hallmarked: oddsPct(j.hallmarked), plain: j.plain > 0 ? oddsPct(j.plain) : null,
    perk: j.perk ? JEWEL_PERKS[j.perk].name : null, perks: j.rolls.map((p) => JEWEL_PERKS[p].name) };
}

/** How many of `id` this hero can spend on a Hallmark, as the server counts them: { bag, storage, all } (hr_materials_take: the bag, then Storage). */
export function heldForHallmark(cs, id) {
  const inv = cs && typeof cs.read === 'function' ? cs.read('inventory') : null;
  const bag = isObj(inv) ? whole(inv[id]) : 0;
  const row = (bankOf(cs) || []).find((r) => r.id === id);
  const storage = row ? whole(row.qty) : 0;
  return { bag, storage, all: bag + storage };
}
