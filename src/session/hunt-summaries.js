// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-summaries.js — THE SHAPE OF A STORED HUNT SUMMARY (QoL 8).
//
// PURE and import-free: the residue allowlist (residue.js) bounds the
// `huntSummaries` field with this on the way in and the way out, so a forged
// or oversized entry can never reach a renderer or the server. One entry per
// session id, newest first, at most HISTORY_MAX kept; every list and string is
// capped. The summary itself is built in src/hunt-view/summary-model.js.
// ════════════════════════════════════════════════════════════════════════

const HISTORY_MAX = 8;
const LOOT_SHOWN = 6;
const SUPPLIES_SHOWN = 8;
const BAG_LINES_MAX = 16;
const DEATH_LINES_MAX = 6;
const UPS_SHOWN = 8;
const STANDING_SHOWN = 4;
const REASON = /^[a-z_]{1,24}$/;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const level = (v) => (Number.isSafeInteger(v) && v >= 1 ? v : null);
const ID = /^[a-z0-9_]{1,64}$/;
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const ms = (v) => { if (typeof v === 'number' && Number.isFinite(v)) return v; const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

const pairs = (v, shape, max) => (Array.isArray(v) ? v.slice(0, max).map(shape).filter(Boolean) : []);

/** One summary, bounded and typed (also the residue's per-entry sanitizer). Null when it has no id. */
export function sanitizeSummary(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || v.id.length > 64) return null;
  const reason = typeof v.reason === 'string' && REASON.test(v.reason) ? v.reason : null;
  return {
    id: v.id, hunt: id(v.hunt), at: ms(v.at), reason, forfeit: v.forfeit === true,
    /* The tier the hunt ran at (the server's session `tier`), a code or null: the renderer names only one it knows. */
    tier: typeof v.tier === 'string' && REASON.test(v.tier) ? v.tier : null,
    /* LEAVE TOGETHER: the member whose end sent the hero home (the server's end_by), a bounded name or null. */
    by: typeof v.by === 'string' && v.by.trim() ? v.by.trim().slice(0, 40) : null,
    /* What ended that member (the server's end_by_why), a reason code or null. */
    why: typeof v.why === 'string' && REASON.test(v.why) ? v.why : null,
    ms: num(v.ms) !== null && v.ms >= 0 ? Math.floor(v.ms) : null,
    kills: int(v.kills), xp: num(v.xp), gold: num(v.gold), lootValue: num(v.lootValue), balance: num(v.balance), died: int(v.died),
    /* The server's per-hour figures at the end (the analyzer's): balance and Level XP for everyone, raw XP premium only. */
    balanceH: num(v.balanceH), rawXpH: num(v.rawXpH), xpH: num(v.xpH),
    /* THE LEVEL LINE (summary-model.js levelLine): the server's Level at the hunt's start and end, and each skill it raised [id, from, to]. */
    lvFrom: level(v.lvFrom), lvTo: level(v.lvTo),
    ups: pairs(v.ups, (p) => (Array.isArray(p) && id(p[0]) && level(p[1]) !== null && level(p[2]) !== null ? [p[0], p[1], p[2]] : null), UPS_SHOWN),
    /* THE STANDING LINE (summary-model.js standingLine): each side the hunt raised [side, ms gained], from the server's standing at its start and end */
    standing: pairs(v.standing, (p) => (Array.isArray(p) && id(p[0]) && Number.isSafeInteger(p[1]) && p[1] > 0 ? [p[0], p[1]] : null), STANDING_SHOWN),
    loot: pairs(v.loot, (p) => (Array.isArray(p) && id(p[0]) && int(p[1]) !== null ? [p[0], p[1]] : null), LOOT_SHOWN),
    supplies: pairs(v.supplies, (p) => (Array.isArray(p) && id(p[0]) && (p[1] === 'own' || p[1] === 'store') && num(p[2]) !== null ? [p[0], p[1], p[2]] : null), SUPPLIES_SHOWN),
    preset: int(v.preset), hoursLimit: int(v.hoursLimit),
    bag: pairs(v.bag, (p) => (Array.isArray(p) && id(p[0]) && int(p[1]) !== null && p[1] >= 1 && p[1] <= 100000 ? [p[0], p[1], p[2] === 1 ? 1 : 0] : null), BAG_LINES_MAX),
    deaths: Array.isArray(v.deaths) ? v.deaths.filter((d) => typeof d === 'string').slice(0, DEATH_LINES_MAX).map((d) => d.slice(0, 280)) : [],
    /* A lost called fight's line (hunt-view/boss-loss.js): display only, from the server's record. */
    loss: typeof v.loss === 'string' ? v.loss.slice(0, 280) : null,
    /* A Call out series' line (hunt-view/boss-loss.js seriesLine): display only, the server's count of fights and wins and what it charged. */
    series: typeof v.series === 'string' ? v.series.slice(0, 200) : null,
    train: trainOf(v.train),
  };
}

/* A TRAINING SESSION'S CARD (summary-model.js trainingCard): the skill, its XP from the session's tally, and from the server's
   last stop the gold its fee rows took and the skill's level before and after. Each figure the server's, or null. */
function trainOf(v) {
  if (!isObj(v) || !id(v.skill)) return null;
  const nat = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
  return { skill: v.skill, xp: nat(v.xp), fee: nat(v.fee), from: nat(v.from), to: nat(v.to) };
}

/** The residue field: newest first, one entry per session id, at most HISTORY_MAX, and ONE training card, the newest (post-140 audit C4:
    "Training Yard ... Training stopped" took 5 of 7 rows and pushed the hunts out; the newest yard card is its own end card, an older one
    says nothing a player looks back for). */
export function sanitizeSummaries(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  let yard = false;
  for (const e of v) {
    const s = sanitizeSummary(e);
    if (!s || seen.has(s.id) || (s.train && yard)) continue;
    seen.add(s.id);
    yard = yard || !!s.train;
    out.push(s);
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}
