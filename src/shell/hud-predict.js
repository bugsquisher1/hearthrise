// ════════════════════════════════════════════════════════════════════════
// src/shell/hud-predict.js — THE HUNT HUD BETWEEN SAVES: DISPLAY ONLY, REPLACED BY EVERY SAVE.
//
// Under the flush (supabase/functions/hr-accrue/hunt-settle.js flushDue) a watched hunt is saved about every 90 s, so the numbers a
// save carries (Level XP, kills, coin, loot value) would step every 90 s while the fight plays smoothly. This module lets the hunt
// HUD's XP ring and the analyzer's totals rise between saves from the SAME combat prediction the screen already plays
// (src/hunt-view/live-engine.js gainsSince: the viewer's own Level XP and the kills it stood in the world for, after the envelope's
// saved point). Level XP and kills are the engine's own; coin and loot value are what those kills are worth on average (each kind's
// coin range and drop chances at the shop's own bids, split by the heroes there): the drop stream is the server's alone.
//
// NEVER MERGED UPWARD (CLAUDE.md §6). Every figure is the LATEST SAVED figure plus what the prediction played AFTER that save's
// point, recomputed from scratch on each read: a save that lands lower than the prediction ran (it ran ahead, or diverged) replaces
// it, and nothing keeps the larger. NOTHING MAY SPEND IT: only the two HUD widgets read this module (tests/hunt-view-core.mjs HUD-3
// confines it); no gate, intent or purchase does, and every one of those reads the saved envelope.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS } from '../data/monsters.js';
import { REVEAL_BANDS } from '../data/loot-bands.js';
import { analyzerOf, huntOf, bidOf } from '../session/hunt-sections.js';

/** What a kind's kill is worth on average to one hero there (`share` = 1 / the heroes there): { gold, loot } at the shop's bids. */
function worth(kind, share, bid) {
  const row = MONSTERS[kind];
  if (!row) return { gold: 0, loot: 0 };
  const gold = Array.isArray(row.gp) ? share * (Number(row.gp[0]) + Number(row.gp[1])) / 2 : 0;
  let loot = 0;
  for (const d of row.drops || []) {
    if (REVEAL_BANDS.includes(d.band)) continue;   // a rare piece is the server's reveal, saved at once
    const b = bid(d.id);
    if (b !== null) loot += share * Math.min(1, Math.max(0, Number(d.ch) || 0)) * b;
  }
  return { gold, loot };
}

/** The prediction's gains `g` (live-engine.js gainsSince) as HUD figures: { levelXp, kills, gold, lootValue }. Pure. */
export function gainsFigures(g, bid) {
  if (!g) return null;
  let kills = 0, gold = 0, loot = 0;
  for (const n of Object.values(g.kills || {})) kills += n;
  for (const [kind, x] of Object.entries(g.share || {})) { const w = worth(kind, x, bid); gold += w.gold; loot += w.loot; }
  return { levelXp: Math.max(0, Math.floor(g.lx || 0)), kills, gold: Math.floor(gold), lootValue: Math.floor(loot) };
}

/**
 * THE VIEWER'S GAINS SINCE ITS LAST SAVE: what its running prediction played after the saved point of the envelope it holds (the
 * analyzer's settled point, else the hunt's pose instant), as HUD figures; null when no prediction runs (unviewed, joining, failed,
 * the hunt over) or the envelope names no saved point.
 */
export function huntGains(cs) {
  const link = cs && cs.liveLink;
  const eng = link && link.engine;
  if (!eng || typeof eng.gainsSince !== 'function' || !eng.running() || link.failure) return null;
  const h = huntOf(cs);
  if (!h || h.ended) return null;
  const a = analyzerOf(cs);
  const at = a && Number.isFinite(a.settledMs) ? a.settledMs : h.poseAtMs;
  return Number.isFinite(at) ? gainsFigures(eng.gainsSince(at), bidOf(cs)) : null;
}

/** The analyzer's hero view with the gains added to the saved totals (a new object; balance moves with coin and loot). Pure. */
export function predictedHero(hero, f) {
  if (!hero || !f) return hero;
  const add = (v, d) => (v === null || v === undefined ? v : v + d);
  return Object.assign({}, hero, { kills: add(hero.kills, f.kills), levelXp: add(hero.levelXp, f.levelXp), gold: add(hero.gold, f.gold),
    lootValue: add(hero.lootValue, f.lootValue), balance: add(hero.balance, f.gold + f.lootValue), predicted: true });
}

/** The hub's vitals with the XP ring filled by the gains (heroVitalsOf's into / need); never a whole ring before the save says the Level. Pure. */
export function predictedVitals(v, f) {
  if (!v || !f || !(v.need > 0) || v.into === null) return v;
  return Object.assign({}, v, { xpPct: Math.max(0, Math.min(0.999, (v.into + f.levelXp) / v.need)), predicted: true });
}
