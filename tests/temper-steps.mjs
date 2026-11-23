#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/temper-steps.mjs — TEMPER ON STEPS AND CARRY-OVER, PROVEN IN NODE (lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 2; src/data/temper.js TEMPER_STEPS, src/core/temper-steps.js, src/core/carry-over.js, the engine's gear part src/core/hunt/danger.js).
//
//   node tests/temper-steps.mjs            the rules
//   node tests/temper-steps.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Temper on steps (ranks by Level, prices, the seat, the gear part both paths read) and carry-over's quote
// ci-run: node tests/temper-steps.mjs
// ci-run: node tools/mutant-gate.mjs node tests/temper-steps.mjs --mutate
//
// mutant-anchors: src/core/temper-steps.js src/core/carry-over.js src/core/hunt/danger.js src/core/member.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   TS-1  RANKS BY LEVEL: rank r opens at Level 40r, at most 5 (D-2)
//   TS-2  THE PRICES (21 section 2.2's table at item Level 60, wage 16,365): weapon rank 1 is 0.52 h (8,510 gold, half in kits); a whole
//         kit's rank 1 is 2.6 h; the re-seat is 0.35 of the ranks' price at the new item Level (D-3)
//   TS-3  THE SEAT: ranks count on the same or a lower tier, none above
//   TS-4  THE GEAR PART (both paths: the tick door and the player door build the hero with heroSnapshot): +1 item Level a seated rank on
//         whatever the slot wears, slot-weighted; a whole kit at 5 is +5,000 (5 steps); a two-handed weapon carries its rank on both
//         weights; an empty slot gains nothing; no ranks: byte for byte what it was
//   TS-5  CARRY-OVER: every Trait moves (one on a Rare, two on a Very Rare), 2 + rank parts from the Trait's home ground, 0.5 h of wage a
//         step at the new base; refused onto a lower tier, another slot, a piece with a Trait, from a Signature or out of escrow
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

async function pure(base) {
  const t = '?t=' + Date.now();
  const imp = (p) => import(pathToFileURL(join(base, p)).href + t);
  const [T, C, danger, member, items, dd, traits] = await Promise.all([imp('src/core/temper-steps.js'), imp('src/core/carry-over.js'),
    imp('src/core/hunt/danger.js'), imp('src/core/member.js'), imp('src/data/items.js'), imp('src/data/danger.js'), imp('src/data/traits.js')]);
  const out = [], ITEMS = items.ITEMS, W = dd.GEAR_STEPS.slotPm;
  /* TS-1 */
  if ([0, 39, 40, 79, 80, 120, 160, 199, 200, 999].map(T.rankCapAt).join() !== '0,0,1,1,2,3,4,4,5,5') out.push('TS-1 ranks do not open at 40, 80, 120, 160, 200');
  /* TS-2 */
  if (T.rankMilliHours('weapon', 1) !== 520 || T.rankMilliHours('ring1', 1) !== 130) out.push('TS-2 rank 1 is not 0.52 h on a weapon and 0.13 h on a ring');
  const q = T.rankQuote('weapon', 1, 60);
  if (!q || q.fee !== 4255 || q.kits !== 3) out.push('TS-2 weapon rank 1 at item Level 60 quotes ' + JSON.stringify(q) + ', want half of 8,510 in gold');
  const kit1 = Object.keys(W).reduce((a, s) => a + T.rankMilliHours(s, 1), 0);
  if (kit1 !== 2600) out.push('TS-2 a whole kit\'s rank 1 is ' + kit1 + ' milli-hours, want 2,600');
  const full = Object.keys(W).reduce((a, s) => a + [1, 2, 3, 4, 5].reduce((b, r) => b + T.rankMilliHours(s, r), 0), 0);
  if (full !== 39000) out.push('TS-2 a whole kit at 5 is ' + full + ' milli-hours, want 39 hours');
  if (T.seatPrice('weapon', 2, 100) !== 10483) out.push('TS-2 re-seating weapon ranks 1-2 at item Level 100 costs ' + T.seatPrice('weapon', 2, 100) + ', want 0.35 x 1.56 h of 19,199');
  if (T.rankQuote('weapon', 6, 60) !== null || T.rankQuote('nose', 1, 60) !== null) out.push('TS-2 a rank off the table was quoted');
  /* TS-3 */
  if (T.seatedRanks(3, 3, 3) !== 3 || T.seatedRanks(3, 3, 2) !== 3 || T.seatedRanks(3, 3, 4) !== 0) out.push('TS-3 the seat does not count the same and lower tiers only');
  /* TS-4: through heroSnapshot, the one builder both paths call */
  const KIT = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody' };
  const { eq, setBonus, profile } = member.loadoutOf(KIT, ITEMS);
  const snap = (temperSteps) => member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 },
    { eq, equipment: KIT, items: ITEMS, bonus: () => 0, setBonus, profile, temperSteps });
  const bare = snap(null).gearPm;
  if (snap({}).gearPm !== bare) out.push('TS-4 empty ranks moved the gear part');
  if (snap({ weapon: 2, body: 1 }).gearPm !== bare + 2 * W.weapon + W.body) out.push('TS-4 seated ranks add ' + (snap({ weapon: 2, body: 1 }).gearPm - bare) + ', want ' + (2 * W.weapon + W.body));
  if (snap({ boots: 5 }).gearPm !== bare) out.push('TS-4 a rank on an empty slot added to the gear part');
  if (snap({ weapon: 9 }).gearPm !== bare + 5 * W.weapon) out.push('TS-4 a rank past 5 counted');
  const kit = Object.fromEntries(Object.keys(W).map((s) => [s, 'iron_helm']));
  const all5 = Object.fromEntries(Object.keys(W).map((s) => [s, 5]));
  if (danger.gearPartPm(kit, ITEMS, all5) - danger.gearPartPm(kit, ITEMS) !== 5000) out.push('TS-4 a whole kit at 5 is not +5,000 (5 steps)');
  const two = Object.keys(ITEMS).find((id) => ITEMS[id].twoHanded === true && ITEMS[id].slot === 'weapon' && ITEMS[id].reqLv > 1);
  if (two && danger.gearPartPm({ weapon: two }, ITEMS, { weapon: 1 }) - danger.gearPartPm({ weapon: two }, ITEMS) !== W.weapon + W.shield) out.push('TS-4 a two-handed weapon does not carry its rank on both weights');
  /* TS-5 */
  const ids = Object.keys(traits.TRAITS);
  const a = ids[0], b = ids.find((id) => traits.TRAITS[id].slot === traits.TRAITS[a].slot && traits.TRAITS[id].key !== traits.TRAITS[a].key) || ids[1];
  const from = { slot: 'weapon', tier: 3, traits: [{ id: a, rank: 1 }] };
  const q1 = C.carryQuote(from, { slot: 'weapon', tier: 4, traits: [], itemLevel: 80 });
  if (!q1.ok || q1.steps !== 4 || q1.parts[traits.TRAITS[a].source] !== 3 || q1.fee !== Math.ceil(2 * 17726)) out.push('TS-5 a rank 1 carry onto item Level 80 quotes ' + JSON.stringify(q1));
  const q2 = C.carryQuote({ slot: 'weapon', tier: 3, traits: [{ id: a, rank: 3 }, { id: b, rank: 3 }] }, { slot: 'weapon', tier: 3, traits: [], itemLevel: 80 });
  const parts2 = Object.values(q2.parts || {}).reduce((x, y) => x + y, 0);
  if (!q2.ok || q2.steps !== 20 || parts2 !== 10 || q2.fee !== 177260) out.push('TS-5 a Very Rare\'s two rank 3 Traits quote ' + JSON.stringify(q2) + ', want both, 10 parts, 10 h');
  const refuse = [[{ ...from, tier: 3 }, { slot: 'weapon', tier: 2, traits: [] }, 'lower_tier'], [from, { slot: 'body', tier: 3, traits: [] }, 'wrong_slot'],
    [from, { slot: 'weapon', tier: 3, traits: [{ id: b, rank: 1 }] }, 'not_plain'], [{ ...from, signature: true }, { slot: 'weapon', tier: 3, traits: [] }, 'signature'],
    [from, { slot: 'weapon', tier: 3, traits: [], escrow: true }, 'escrowed'], [{ ...from, traits: [] }, { slot: 'weapon', tier: 3, traits: [] }, 'no_trait']];
  for (const [f, to, why] of refuse) { const r = C.carryQuote(f, to); if (r.ok || r.why !== why) out.push('TS-5 want ' + why + ', got ' + JSON.stringify(r)); }
  return out;
}

const MUTANTS = [
  ['ranks open every 20 Levels', 'src/core/temper-steps.js', 'return Math.min(T.ranks, Math.floor(whole(level) / T.rankEvery));', 'return Math.min(T.ranks, Math.floor(whole(level) / 20));'],
  ['the fee is the whole price', 'src/core/temper-steps.js', 'fee: Math.ceil((mh * (1000 - T.kitSharePm) * w) / 1000000),', 'fee: Math.ceil((mh * 1000 * w) / 1000000),'],
  ['slot weights ignored in the price', 'src/core/temper-steps.js', 'return Math.ceil((T.hoursPm * SLOTS.length * GEAR_STEPS.slotPm[slot] * r) / (1000 * RANK_SUM));', 'return Math.ceil((T.hoursPm * r) / RANK_SUM);'],
  ['the re-seat costs the whole ranks', 'src/core/temper-steps.js', 'Math.ceil((mh * T.carryPm * wage(whole(itemLevel) || 1)) / 1000000)', 'Math.ceil((mh * 1000 * wage(whole(itemLevel) || 1)) / 1000000)'],
  ['a higher tier keeps the ranks seated', 'src/core/temper-steps.js', 'wornTier <= seatedTier ?', 'wornTier <= seatedTier + 1 ?'],
  ['the gear part reads no Temper', 'src/core/hunt/danger.js', 'return il > 0 ? il + temperLevelsOn(temperSteps, slot) : 0;', 'return il;'],
  ['an empty slot takes its rank', 'src/core/hunt/danger.js', 'return il > 0 ? il + temperLevelsOn(temperSteps, slot) : 0;', 'return il + temperLevelsOn(temperSteps, slot);'],
  ['the snapshot drops the ranks', 'src/core/member.js', 'const gearPm = gearPartPm(c.equipment, c.items, c.temperSteps);', 'const gearPm = gearPartPm(c.equipment, c.items);'],
  ['a rank past 5 counts', 'src/core/temper-steps.js', 'return temperSteps && own(temperSteps, slot) ? Math.min(T.ranks, whole(temperSteps[slot])) * T.ilPerRank : 0;', 'return temperSteps && own(temperSteps, slot) ? whole(temperSteps[slot]) * T.ilPerRank : 0;'],
  ['carry onto a lower tier', 'src/core/carry-over.js', "t.tier - f.tier < GEAR_STEPS.carryOver.tierMin) return { ok: false, why: 'lower_tier' };", "t.tier - f.tier < -9) return { ok: false, why: 'lower_tier' };"],
  ['carry onto a piece with a Trait', 'src/core/carry-over.js', "if (Array.isArray(t.traits) && t.traits.length > 0) return { ok: false, why: 'not_plain' };", ''],
  ['a Very Rare carries one Trait', 'src/core/carry-over.js', '  for (const tr of traits) {', '  for (const tr of traits.slice(0, 1)) {'],
  ['the parts ignore rank', 'src/core/carry-over.js', 'CARRY.partsBase + rank;', 'CARRY.partsBase + 1;'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/temper-steps.mjs', pure, mutants: MUTANTS,
  green: 'ranks by Level, prices, the seat, the gear part both paths read, and carry-over all hold' });
