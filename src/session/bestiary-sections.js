// ════════════════════════════════════════════════════════════════════════
// src/session/bestiary-sections.js — THE ACCOUNT BESTIARY, READ SAFELY.
//
// PURE. Reads the `account_bestiary` section a CharacterSession holds
// (2026-10-28-bestiary-account.sql hr_bestiary_view; the same on every
// character of the account) and answers it in the shape the Bestiary window
// draws, or null when the server did not send it. Null keeps every control
// off; a row the server did not send is not invented (CLAUDE.md §6).
//
//   account_bestiary { stages: [{ stage, kills, relic_mult }],
//                      relic_mult: { monster: mult },
//                      monsters: [{ monster, level, grounds: [{ hunt, rarity }], kills, stage,
//                                   activated_stage, relic_mult, next_stage, next_stage_kills,
//                                   next_fee, can_activate, has_relic }] }
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'boss']);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const mult = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10 ? v : null);

/** One monster row, or null when any number the window would show is missing. */
function monsterRow(r) {
  if (!isObj(r) || !ID.test(String(r.monster)) || nat(r.kills) === null || nat(r.stage) === null
    || nat(r.activated_stage) === null || mult(r.relic_mult) === null || typeof r.has_relic !== 'boolean') return null;
  const top = r.next_stage === null;
  if (!top && (nat(r.next_stage) === null || nat(r.next_stage_kills) === null || nat(r.next_fee) === null)) return null;
  const grounds = (Array.isArray(r.grounds) ? r.grounds : [])
    .filter((g) => isObj(g) && ID.test(String(g.hunt)) && RARITIES.includes(g.rarity))
    .map((g) => ({ hunt: g.hunt, rarity: g.rarity }));
  return {
    monster: r.monster, level: nat(r.level), grounds, kills: r.kills, stage: r.stage,
    activatedStage: r.activated_stage, relicMult: r.relic_mult, hasRelic: r.has_relic,
    next: top ? null : { stage: r.next_stage, kills: r.next_stage_kills, fee: r.next_fee },
    canActivate: !top && r.can_activate === true,
  };
}

/** The account bestiary { monsters, stages }, or null when the server sent none. */
export function bestiaryOf(cs) {
  const b = cs && typeof cs.read === 'function' ? cs.read('account_bestiary') : undefined;
  if (!isObj(b) || !Array.isArray(b.monsters) || !Array.isArray(b.stages)) return null;
  const stages = b.stages.filter((s) => isObj(s) && nat(s.stage) && nat(s.kills) !== null && mult(s.relic_mult) !== null)
    .map((s) => ({ stage: s.stage, kills: s.kills, relicMult: s.relic_mult }));
  const monsters = b.monsters.slice(0, 500).map(monsterRow).filter(Boolean);
  return { stages, monsters };
}
