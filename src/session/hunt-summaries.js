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
const REASON = /^[a-z_]{1,24}$/;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
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
    /* LEAVE TOGETHER: the member whose end sent the hero home (the server's end_by), a bounded name or null. */
    by: typeof v.by === 'string' && v.by.trim() ? v.by.trim().slice(0, 40) : null,
    ms: num(v.ms) !== null && v.ms >= 0 ? Math.floor(v.ms) : null,
    kills: int(v.kills), xp: num(v.xp), gold: num(v.gold), lootValue: num(v.lootValue), balance: num(v.balance), died: int(v.died),
    /* The server's per-hour figures at the end (the analyzer's): balance for everyone, raw XP premium only. */
    balanceH: num(v.balanceH), rawXpH: num(v.rawXpH),
    loot: pairs(v.loot, (p) => (Array.isArray(p) && id(p[0]) && int(p[1]) !== null ? [p[0], p[1]] : null), LOOT_SHOWN),
    supplies: pairs(v.supplies, (p) => (Array.isArray(p) && id(p[0]) && (p[1] === 'own' || p[1] === 'store') && num(p[2]) !== null ? [p[0], p[1], p[2]] : null), SUPPLIES_SHOWN),
    preset: int(v.preset), hoursLimit: int(v.hoursLimit),
    bag: pairs(v.bag, (p) => (Array.isArray(p) && id(p[0]) && int(p[1]) !== null && p[1] >= 1 && p[1] <= 100000 ? [p[0], p[1], p[2] === 1 ? 1 : 0] : null), BAG_LINES_MAX),
    deaths: Array.isArray(v.deaths) ? v.deaths.filter((d) => typeof d === 'string').slice(0, DEATH_LINES_MAX).map((d) => d.slice(0, 280)) : [],
  };
}

/** The residue field: newest first, one entry per session id, at most HISTORY_MAX. */
export function sanitizeSummaries(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const e of v) {
    const s = sanitizeSummary(e);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}
