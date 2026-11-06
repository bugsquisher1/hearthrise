// ════════════════════════════════════════════════════════════════════════
// src/session/jewelry-sections.js — CRAFTED JEWELRY AS THE SERVER STATES IT (src/data/jewelry.js).
//
// Two reads. The `hallmark` section (hr_hallmark_view, 2027-03-14-jewelry-hallmark.sql): the Hallmark step for each Fine piece this
// hero holds in its bag or the account's Storage, at the server's gold and Crafting level, and the account's count against the day's
// limit; every envelope replaces it and nothing here prices a Hallmark. And a rolled job's odds, shown BEFORE the roll (Tyler 2026-11-05,
// call 6): the catalogue's table at the hero's Crafting level as the server holds it, the same table the engine rolls with
// (src/core/artisan.js rollJewel). Display only: the bench rolls on the server, and this client never rolls.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.98';
import { rollOdds, perksFor, JEWEL_PERKS, ODDS_SCALE, JEWEL_SKILL } from '../data/jewelry.js?v=0.2.98';
import { skillsOf, bankOf } from './item-sections.js?v=0.2.98';

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

/**
 * A rolled job's odds for this hero, before the roll: { fine, hallmarked, plain } as words, the perks it can roll as names, and the level they
 * were read at; null for a job that doesn't roll or before the server sends the level.
 */
export function rollOddsOf(cs, recipe) {
  const lv = jewelLevelOf(cs);
  if (!recipe || !recipe.roll || lv === null) return null;
  const o = rollOdds(recipe.roll, lv);
  return { level: lv, fine: oddsPct(o.fine), hallmarked: oddsPct(o.hallmarked), plain: o.plain > 0 ? oddsPct(o.plain) : null,
    perks: perksFor(recipe.output).map((p) => JEWEL_PERKS[p].name) };
}

/** How many of `id` this hero can spend on a Hallmark, as the server counts them: { bag, storage, all } (hr_materials_take: the bag, then Storage). */
export function heldForHallmark(cs, id) {
  const inv = cs && typeof cs.read === 'function' ? cs.read('inventory') : null;
  const bag = isObj(inv) ? whole(inv[id]) : 0;
  const row = (bankOf(cs) || []).find((r) => r.id === id);
  const storage = row ? whole(row.qty) : 0;
  return { bag, storage, all: bag + storage };
}
