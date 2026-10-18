// ════════════════════════════════════════════════════════════════════════
// src/data/premium.js — WHAT PREMIUM IS (HUNT_SCREEN_SPEC §3.10 #5; Tyler 2026-10-17)
//
// Premium is PER CHARACTER and a SERVER column: player_state.premium_until
// (user_id, slot). Never client-held (CLAUDE.md §6): the client renders the
// `premium` envelope section (hr_premium_view) and nothing reads a client
// flag. The only writer is hr_premium_grant, owner-only (no client, service or
// engine grant); the shop that sells it is a later, reviewed lane.
//
// What premium grants, as data the server reads through the generated
// catalogue (tools/gen-hunt-sessions.mjs):
//   analyzer   the hunt analyzer is readable (hr_hunt_analyzer, the
//              `hunt_analyzer` section). The server RECORDS every session's
//              stats for every character; only the read is gated (spec §3.6 #5).
//   stamina    the 12 h cap. The caps themselves live in ONE place,
//              src/data/hunt-sessions.js STAMINA_MAX_MS { free, premium }.
//   outfits    premium outfits (the outfit lane reads this flag; nothing here
//              prices or lists them).
//   login      the daily login reward is PREMIUM-ONLY (Tyler 2026-10-17).
//
// THE DAILY LOGIN REWARD (Tyler 2026-10-17: "it starts as a single training
// weapon"). One claim a UTC day per premium character, refused for a free one
// (`premium_required`). The count of claimed days, `player_state.login_days`,
// ONLY GOES UP: a missed day pauses it, never resets it (Tyler 2026-10-17), and
// a milestone keyed on it can never be lost. `item` is the reward: the Oak
// Practice Blade (designer, 2026-10-17). No training weapon existed, so it was
// added with a source (this claim, catalogue-coherence.js PREMIUM_SOURCES) and a
// use available today (it is a sword: worn in the weapon slot, Melee). It is
// weaker than the free kit's Bronze Sword so a paid gift never out-hits free
// play, and bop + v:0 so a daily claim mints no gold and never reaches the
// market. The training activity (hunt-sessions.js RESUMABLE_KINDS `training`,
// reserved) is its second use when it is built. Retuning `item` is this edit
// plus `node tools/gen-hunt-sessions.mjs`; the claim verify prices this row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const PREMIUM_PERKS = Object.freeze({
  analyzer: true,
  stamina: true,
  outfits: true,
  login: true,
});

export const PREMIUM_LOGIN_REWARD = Object.freeze({
  /* An src/data/items.js id, or null (pays nothing; see the header). */
  item: 'oak_practice_blade',
  qty: 1,
});

const ID = /^[a-z0-9_]{1,64}$/;

/** Every problem with the table, as strings. Empty = valid. `items` = src/data/items.js ITEMS. */
export function validate(items) {
  const out = [];
  for (const [k, v] of Object.entries(PREMIUM_PERKS)) if (typeof v !== 'boolean') out.push('PREMIUM_PERKS.' + k + ' must be a boolean');
  const r = PREMIUM_LOGIN_REWARD;
  if (r.item !== null) {
    if (!ID.test(String(r.item))) out.push('PREMIUM_LOGIN_REWARD.item is not an item id');
    else if (items && !Object.prototype.hasOwnProperty.call(items, r.item)) out.push('PREMIUM_LOGIN_REWARD.item ' + r.item + ' is not in items.js');
  }
  if (!Number.isInteger(r.qty) || r.qty < 1 || r.qty > 10) out.push('PREMIUM_LOGIN_REWARD.qty must be a whole 1..10');
  return out;
}
