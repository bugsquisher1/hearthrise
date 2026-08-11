// ============================================================
// src/core/away.js — THE AWAY/ACTIVE CONTRACT, as data.
//
// docs/design/away-time-ruling.md, locked 2026-08-11:
//
//   "Away time pays 1.00x. The away/active difference is *which bonus
//    channels are in scope*, never a rate discount, and never a second
//    code path."
//
// Before this file the difference between playing and being away was
// expressed as a SECOND COMBAT LOOP (`processOfflineCombat`) that had
// drifted from the live one in eight separate ways — no crits, no kill
// XP, no drop log, no dailies, no quests, no deeds, no featured-boss
// lift, no weapon speed. Every one of those was a copy-paste omission,
// not a decision. A rule that lives in a duplicated loop is not a rule;
// it is a coincidence that has not broken yet.
//
// So the rule is a TABLE, in one place, read by:
//   • the client's getBonus chain (world-events + buff-queue each ask
//     `channelApplies` instead of inventing their own gate),
//   • src/core/combat-sim.js, the one simulation both paths run,
//   • the Supabase accrual Edge Function, which imports this file.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* THE DIAL. It exists so "away pays less" is a decision someone has to
   make explicitly, in a commit, against a recomputed day model — not an
   emergent property of a loop that forgot to roll crits.
   It is 1.00. Do not set another value without a fresh day-model
   recompute (docs/design/pacing-overhaul.md A.2). */
export const AWAY_RATE_MULT = 1.00;

/* The bonus channels. A source of power belongs to exactly one. */
export const CHANNEL = {
  /** gear, armour set, perks, renown, clan, property, castle */
  PERMANENT: 'permanent',
  /** crit chance. Gear-sourced by construction when away, because the
      `damage_crit` food buff arrives on the BUFF channel and is dropped. */
  CRIT: 'crit',
  /** Boss of the Day / Boss of the Week, resolved per UTC-day segment. */
  BOTD: 'botd',
  /** healing auto-eat — survival, not a bonus. Pays and consumes away. */
  HEAL: 'heal',
  /** rotating daily/weekly blessings and world events (b227). */
  BLESSING: 'blessing',
  /** timed consumable buffs (BUFFS_DEF). FROZEN away: no pay, no drain. */
  BUFF: 'buff',
};

/* The ruling's resolver contract, verbatim. `true` = in scope while away. */
export const AWAY_SCOPE = Object.freeze({
  permanent: true,
  crit: true,
  botd: true,
  heal: true,
  blessing: false,
  buff: false,
});

/**
 * Is this channel paying, given the context?
 * Unknown channels default to TRUE — a new source of power is a base
 * reward until someone deliberately gates it. The five omissions the
 * ruling fixes were all base rewards that a second loop silently dropped,
 * so the safe default is "it pays", never "it is quietly missing".
 *
 * @param channel one of CHANNEL
 * @param ctx     { away: bool }
 */
export function channelApplies(channel, ctx) {
  if (!ctx || !ctx.away) return true;
  const v = AWAY_SCOPE[channel];
  return v === undefined ? true : v;
}

/** The rate multiplier for this context. 1 live, AWAY_RATE_MULT away. */
export function rateMult(ctx) {
  return (ctx && ctx.away) ? AWAY_RATE_MULT : 1;
}

export const DAY_MS = 86400000;

/**
 * Split an absence into UTC-day segments.
 *
 * The Boss of the Day is a different boss on either side of UTC midnight,
 * and the ruling pays each segment its own day's boss. At the 12h base cap
 * an absence crosses at most one boundary (two segments); at the 22h
 * ceiling (16h Offline+ · +4h renown/property · +2h clan) still at most
 * one. This is written as a loop anyway, because a cap is a number someone
 * will raise and a hardcoded "max two" is a bug waiting for that commit.
 *
 * @returns [{ fromMs, toMs, ms }] in chronological order; [] for an empty
 *          or inverted span.
 */
export function utcDaySegments(fromMs, toMs) {
  const a = Number(fromMs);
  const b = Number(toMs);
  if (!isFinite(a) || !isFinite(b) || b <= a) return [];
  const out = [];
  let cursor = a;
  /* Guard the loop as well as the maths: a garbage span must produce a
     bounded answer, never a hang. 400 segments is >1 year of absence. */
  let guard = 0;
  while (cursor < b && guard++ < 400) {
    const nextMidnight = (Math.floor(cursor / DAY_MS) + 1) * DAY_MS;
    const end = Math.min(nextMidnight, b);
    out.push({ fromMs: cursor, toMs: end, ms: end - cursor });
    cursor = end;
  }
  return out;
}
