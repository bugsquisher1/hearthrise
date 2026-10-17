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
// a milestone keyed on it can never be lost. `item` is the reward; it is null
// until the training-weapon row exists, because no item may ship without a
// source AND a use (CLAUDE.md §3.5, the catalogue-coherence guard) and the
// training activity that would use it (hunt-sessions.js RESUMABLE_KINDS
// `training`, reserved) is not built. With `item: null` a premium claim pays
// nothing and still counts its day. Filling `item` is this one edit plus a
// regenerated catalogue; the claim verify prices exactly what this row says.
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
  item: null,
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
