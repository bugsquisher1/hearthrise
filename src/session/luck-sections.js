// ════════════════════════════════════════════════════════════════════════
// src/session/luck-sections.js — THE `luck` SECTION, READ (supabase/migrations/1007-luck.sql hr_luck_section; src/data/luck.js).
//
// The server's own numbers and nothing else (CLAUDE.md §6): the account's Luck bar, the hero's Magic Find, the rivets held, each bag stack's
// salvage line (its rivets and the account's allowance), the Lucky job's offers. Null while the `luck` switch is off for the account (the
// page then draws no bar, no Salvage or Use plan and no Lucky job) and before the envelope says. Every envelope replaces it whole.
//   luckOf(cs)            { luck, rank, at, next, magicFind, ringPct, rivets { bag, storage }, salvage Map(id -> { rivets, left }),
//                           lucky { offers [{ from, to, tier, rivets, gold, skill, level }], today, perDay } } | null
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);

/** The section, normalized, or null (dark, or not read yet). */
export function luckOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('luck') : null;
  if (!isObj(s) || !Number.isSafeInteger(s.luck) || !Number.isInteger(s.rank)) return null;
  const salvage = new Map();
  for (const [id, x] of Object.entries(isObj(s.salvage) ? s.salvage : {})) {
    if (ID.test(id) && isObj(x) && Number.isSafeInteger(x.rivets) && x.rivets > 0) salvage.set(id, { rivets: x.rivets, left: nat(x.left) });
  }
  const l = isObj(s.lucky) ? s.lucky : {};
  const offers = (Array.isArray(l.offers) ? l.offers : []).filter((o) => isObj(o) && ID.test(String(o.from)) && ID.test(String(o.to))
    && Number.isSafeInteger(o.rivets) && o.rivets > 0 && Number.isSafeInteger(o.gold) && o.gold > 0 && Number.isInteger(o.level) && typeof o.skill === 'string')
    .map((o) => ({ from: o.from, to: o.to, tier: nat(o.tier), rivets: o.rivets, gold: o.gold, skill: o.skill, level: o.level }));
  const r = isObj(s.rivets) ? s.rivets : {};
  return {
    luck: nat(s.luck), rank: nat(s.rank), at: nat(s.at), next: Number.isSafeInteger(s.next) ? s.next : null,
    magicFind: nat(s.magic_find), ringPct: nat(s.ring_pct),
    rivets: { bag: nat(r.bag), storage: nat(r.storage) },
    salvage,
    lucky: { offers, today: nat(l.today), perDay: nat(l.per_day) },
  };
}
