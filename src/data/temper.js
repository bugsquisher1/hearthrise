// ============================================================================
// src/data/temper.js — TEMPER ON STEPS, AS DATA: WHAT THE TOWN'S SMITH SELLS (systems, lane/flame-temper-build, 2026-11-22; the old rungs
// retired and the kit named by the game designer, lane/tp-im-steps, 2026-11-26; docs/design/redesign/21-flame-temper-imbue-loot.md section 2,
// 19-power-ledger.md L11, 20-v030-the-roads.md lane TP).
//
// THE RULE. The smith tempers a hero's GEAR SLOT, never a piece: five ranks a slot, each +1 item Level (ilPerRank) on whatever the slot
// wears, slot-weighted inside the gear part (src/core/hunt/danger.js gearPartPm, src/core/hunt/amount.js defenseGearPm; GEAR_STEPS.slotPm),
// so a whole kit at rank 5 is +5 steps and never more (src/data/power-ledger.js temperStepsMax: a rank past 5 counts 5,
// src/core/temper-steps.js temperLevelsOn). Rank r opens at hero Level rankEvery x r (40, 80, 120, 160, 200: 21 D-2), never x ramp. It
// never counts for the wear check. A rank never leaves the hero: not on a death, a sale, a swap or a listing.
// SEATED ON A TIER. A slot's ranks sit on the tier they were bought or re-seated on. A piece of a HIGHER tier in that slot leaves them
// unseated (they count 0) until re-seated for carryPm x the ranks' full price at the new item step (D-3); the same or a lower tier keeps
// them seated. The plan's `Re-seat Temper` rule re-seats at the next town stop under its price cap, so nobody presses it (first principle).
// THE PRICE, in hours of wage at the worn piece's item Level (src/data/wage.js wage): a full slot is hoursPm x 13 slots x slotPm / 1000
// (a whole kit 39 hours, weapon 7.8, a ring 1.95); rank r takes r / 15 of it (1 + 2 + 3 + 4 + 5). kitSharePm of it is Temper Kits, the
// rest a fee in gold, burned (12-targets section 9 counts it as a sink in wage hours).
// THE KIT is a K1 kit trade: Smithing's `temper_kit` kind (src/data/trades.js KINDS, three bars of its band), one face a band (KIT_FACES
// temper_kit: the Tempering Salts, Iron to Dawnsteel). A kit is kitHoursPm of wage (0.1 h: its 0.4 work-hours x townWageShare), and a rank
// on a piece of item Level iL takes the kits of that piece's band (src/core/temper-steps.js temperKitAt), so a cheap band's kit can never
// pay for a dear band's rank. kitItem stays null: the server's one kit column cannot name a kit a band, so hr_temper_rank answers
// `kits_owed` until the backend's kit-by-band row lands (HANDOFFS 2026-11-26 TP and IM). No rank is ever sold for gold alone.
// STARTING VALUES (21 section 2.2 levers; the Lab moves them in band): rankEvery 40 (30 to 50), hoursPm 3000 (2 to 4 hours a piece),
// kitSharePm 500 (300 to 700), carryPm 350 (250 to 500).
// The server's catalogue (hr_temper_rules, hr_temper_slots) is written from this by tools/gen-flame-temper.mjs. Behind the hr_flags
// switch `temper_steps` (off at apply).
//
// PURE ESM, no imports, no I/O. Node, Deno and the browser read it verbatim.
// ============================================================================

export const TEMPER_STEPS = Object.freeze({
  ranks: 5,
  ilPerRank: 1,
  rankEvery: 40,
  hoursPm: 3000,
  kitSharePm: 500,
  carryPm: 350,
  kitHoursPm: 100,
  kitItem: null,
});
