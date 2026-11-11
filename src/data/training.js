// ════════════════════════════════════════════════════════════════════════
// src/data/training.js — THE TRAINING YARD: a hero who is not hunting trains one combat skill for gold by the hour (Tyler 2026-11-08:
// "training dummies and stuff to train skills (for gold)"; the designer's rules, docs/planning/PRIORITY_BOARD.md "2026-11-10 Combat
// training", lane/d-training-and-wards; the server half lane/c-training-yard).
//
// THE RULES, ONE PUBLIC FORMULA (Tyler 2026-11-08 "FORMULAS ARE PUBLIC": the wiki renders these rows):
//   skill XP an hour  = xpPerLevelPerHour x the hero's Level      (400 x Level: Level 20 trains 8,000 an hour, Level 50 20,000)
//   gold an hour      = feePerLevelPerHour x the hero's Level     (50 x Level: Level 20 pays 1,000 an hour, Level 50 2,500)
//   so 8 skill XP for 1 gold at every Level. No Level XP, no gold, no loot, no stamina used (stamina refills while training).
//   Who: a hero of Level `minLevel` or more, in town, not hunting. One skill at a time, from `skills` (Inner Flame is the Hearth's).
//   Stops: "Stop after" `stopAfterHours.min`..`max` hours or "until I stop it" (none); "Keep at least" N gold of the account purse
//   (0..keepGoldMax); a hunt starting; the player's stop. The server stops it at the first of these and says why.
//
// `server` is the backend's, not balance: how often the server settles a run (the money is the same however it is cut: XP and gold
// are carried in whole units of Level x milliseconds, so one long settle and sixty short ones pay the same to the unit).
//   ownerMinSeconds  a viewed hero's own settle pays only once this much has run since the last one (one ledger row a minute at most)
//   flushSeconds     the server's sweep (every minute, pg_cron) settles a running hero this long after its last settle, browser
//                    open or closed, and at once when its "Stop after" has passed
//   maxSettleHours   one settle pays at most this much; the rest is owed to the next (a fuse, never a loss)
//   dayFuseHours     no hero is paid more than this many hours of training in any 24 hours of the server clock (a fuse: the clock
//                    allows 24; the extra hour is the sweep's lag at the window's edge)
//   sweepBatch       heroes one sweep settles at most (the rest the next minute)
//
// NOT HERE YET (the next lane, from the same design): the house dummy (one unlock a skill, 1,000,000 gold, the Trophy Room at rung 4,
// one hero at a time, no fee) and "Go back to training after a hunt". Both need their own server pieces (the unlock catalogue's
// prerequisite and the hunt end's resume rows); nothing here pretends they exist.
//
// PURE ESM, Node + Deno. Data only.
// ════════════════════════════════════════════════════════════════════════

export const TRAINING = Object.freeze({
  xpPerLevelPerHour: 400,
  feePerLevelPerHour: 50,
  minLevel: 10,
  skills: Object.freeze(['melee', 'ranged', 'magic', 'defense']),
  stopAfterHours: Object.freeze({ min: 1, max: 24 }),
  keepGoldMax: 1000000000,
  server: Object.freeze({ ownerMinSeconds: 60, flushSeconds: 600, maxSettleHours: 24, dayFuseHours: 25, sweepBatch: 200 }),
});
