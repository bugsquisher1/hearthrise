// ============================================================================
// tests/accrual-engine.mjs — the SERVER ACCRUAL guard.
//
// Three claims, all mechanical, none of them provable from a browser:
//
//   1. PARITY (the contract). A span computed by the SERVER engine
//      (supabase/functions/hr-accrue/accrual.js) is identical — kills, crits,
//      ticks, gold, every XP grant, every item — to the same span computed the
//      way the CLIENT computes it (legacy.js simulateAwayCombat), for the same
//      state and the same seed. If these two ever diverge, the server and the
//      client disagree about what a night was worth, and the player is right
//      whichever way it went.
//
//      The client side of the comparison is built here from src/core the way
//      legacy.js builds it — NOT by calling the server engine — so the test is
//      an independent second construction, which is the only kind of parity
//      test worth having.
//
//   2. HOSTILE INPUT. Nothing a client could send inflates a grant: not
//      `tickMs`, not `minTickMs`, not `atMs`, not `capMs`, not `elapsed`, not
//      `nowMs`, not `grantMs`. The engine reads named server fields only, so
//      the proof is "these keys are inert", asserted by running with and
//      without them and comparing.
//
//   3. SHAPE. The delta only ever contains keys hr_apply implements; every
//      numeric value is an integer (hr_apply casts with ::bigint, and a
//      fractional string is a `bad_delta` that costs a player their whole
//      night); and the source of the engine never spreads a caller object into
//      the simulation ctx — the rule that keeps `minTickMs` from riding in
//      through the same door as `tickMs`.
//
// Run standalone:  node tests/accrual-engine.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  COMBAT_BALANCE, WEAPON_SPEED_MOD, DEFAULT_PROFILE,
  equipmentStats, armorSetBonus, playerCombatRolls, monsterCombatRolls, weaknessInfo,
} from '../src/core/combat.js?v=326';
import { simulateSpan } from '../src/core/combat-sim.js?v=326';
import { killBonusesFor } from '../src/core/botd.js?v=326';
import { createRng } from '../src/core/rng.js?v=326';
import { grantXp } from '../src/core/progression.js?v=326';
import { resolveStyle } from '../src/core/styles.js?v=326';
import { ITEMS } from '../src/data/items.js?v=326';
import { MONSTERS } from '../src/data/monsters.js?v=326';

import {
  computeAccrual, deriveTickMs, deriveProfile, zeroBonus,
  ACCRUE_MIN_MS, ACCRUE_MAX_SPAN_MS,
} from '../supabase/functions/hr-accrue/accrual.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FN_DIR = join(ROOT, 'supabase', 'functions', 'hr-accrue');

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      server: ${A}\n      client: ${B}`);
};

// ── The fixture ─────────────────────────────────────────────────────────────
// A real monster, real items, a real absence. Picked to exercise the parts that
// have historically drifted: a weapon with a family speed identity, an armour
// set worth a crit bonus, an absence long enough to level up, and a start
// instant that crosses UTC midnight so the Boss-of-the-Day segmentation runs.

const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];

/* Fixtures, chosen so the SET exercises every branch that has historically
   drifted. One fixture proves one path; the coverage assertions at the bottom
   of parityGuard() are what stop this table quietly degrading into one easy
   case that always passes.
     • slime       — 8,000+ kills across BOTH UTC segments, thousands of crits
     • warband_captain — the DAY-1 featured boss (and not day 2's), so
                     featuredMs and featuredDropMult are real values, not 0 and 1
     • goblin at low level — the ordinary early-game character
   Every one of them ends in a death, and that is not a broken fixture: auto-eat
   is OFF by default in the shipped client (src/features/auto-actions.js:49
   `eat: { enabled: false }`), so an unattended fight ends the same way on both
   sides. See "Known limitations". */
const MAXED = Object.freeze({
  attack: 13034431, strength: 13034431, defense: 13034431, hitpoints: 13034431,
  ranged: 13034431, magic: 13034431, prayer: 13034431,
});

/* 2026-03-14 20:00 UTC → 2026-03-15 08:00 UTC. Twelve hours, one UTC boundary,
   so `utcDaySegments` yields two segments and each is resolved against its own
   day's featured boss. A single-segment fixture would let a segmentation bug
   pass. */
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 12 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const SEED = 0x5eed1234;

function baseSkills() {
  return {
    attack: 30000, strength: 28000, defense: 22000, hitpoints: 26000,
    ranged: 1000, magic: 1000, prayer: 500,
    woodcutting: 4000, mining: 4000, fishing: 4000,
  };
}

/* Equipment chosen FROM THE LIVE CATALOGUE, never invented — an invented item
   would test the engine against data the game does not contain, and the whole
   point is that both sides read src/data. Best-in-slot so spdB, the
   weapon-family speed identity, critB and the armour-set bonus all have real
   non-zero values to carry. */
function pickEquipment() {
  const eqp = {};
  const weapon = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType && ITEMS[id]?.atkB)
    .sort((a, b) => (ITEMS[b].atkB || 0) - (ITEMS[a].atkB || 0))[0];
  if (weapon) eqp.weapon = weapon;
  const best = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'armor' || !it.slot) continue;
    const cur = best[it.slot];
    if (!cur || (it.tier || 0) > (ITEMS[cur].tier || 0)) best[it.slot] = id;
  }
  for (const [slot, id] of Object.entries(best)) eqp[slot === 'head' ? 'helmet' : slot] = id;
  return eqp;
}
const EQUIPMENT = pickEquipment();

// ── The CLIENT reference implementation ─────────────────────────────────────
// Mirrors legacy.js: `combatTickMs()` (:2543), `getCombatStatProfile()` (:7906),
// `combatSimCtx()` (:2705) and `simulateAwayCombat()` (:2765), with the client's
// window.* helpers replaced by the same core calls they delegate to and the
// presentation handlers dropped (they only ever push toasts).
//
// Written out rather than imported so it is a genuinely independent second
// construction. If it were `computeAccrual` in a hat, it would prove nothing.

function clientCombatTickMs(eqStats) {
  const spd = Math.max(0, Math.min(0.20, (eqStats.spdB) || 0));
  const wmod = WEAPON_SPEED_MOD[eqStats.weaponType] || 1;
  return Math.max(COMBAT_BALANCE.minTickMs,
    Math.floor(COMBAT_BALANCE.tickMs * (1 - spd) * wmod));
}

function clientProfile(weaponType) {
  if (weaponType === 'magic') {
    return { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic',
             accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' };
  }
  if (weaponType === 'ranged') {
    return { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged',
             accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
  }
  return Object.assign({}, DEFAULT_PROFILE, { type: weaponType || 'sword' });
}

function clientAwaySpan(opts) {
  const items = ITEMS; const monsters = MONSTERS;
  const equipment = opts.equipment;
  const bonus = () => 0;                       // no blessings, no buffs, no perks
  let eqStats = equipmentStats(equipment, items);
  const setBonus = armorSetBonus(equipment, items);
  const profile = clientProfile(eqStats.weaponType);
  const style = resolveStyle(eqStats.weaponType, null);

  const G = {
    activeMonster: opts.monsterId,
    monsterHp: 0, monsterMaxHp: 0,
    playerHp: opts.hp, playerMaxHp: opts.maxHp,
    gold: 0,
    skills: { ...opts.skills },
    stats: {},
    combatKillsThisFoe: 0,
  };
  const bag = {};
  const fx = {
    addXp(sk, amt) {
      const r = grantXp(G, sk, amt, { bonus, xpB: eqStats.xpB || 0, restedQuantum: 0, authored: false });
      for (const ev of r.events) if (ev.type === 'levelup' && ev.skill === 'hitpoints') G.playerMaxHp = ev.to;
    },
    addItem(id, qty) { bag[id] = (bag[id] || 0) + qty; },
  };
  const ctx = {
    away: (opts.away !== undefined) ? opts.away : true,
    fromMs: opts.fromMs, toMs: opts.toMs,
    tickMs: clientCombatTickMs(eqStats),
    capped: !!opts.capped,
    rng: createRng(opts.seed),
    monsters, items, bonus, style,
    activeBuffCount: 0,
    playerRolls(m) {
      eqStats = equipmentStats(equipment, items);   // the client re-reads per swing
      return playerCombatRolls(m, { eq: eqStats, equipment, items, skills: G.skills, bonus, setBonus, profile, style });
    },
    monsterRolls(m) { return monsterCombatRolls(m, { eq: eqStats, skills: G.skills, bonus }); },
    weakness(m) { return weaknessInfo(m, eqStats); },
    botdFor(atMs) { return { killBonuses(id) { return killBonusesFor(id, atMs, monsters); } }; },
    fx,
  };
  const summary = simulateSpan(G, ctx);
  const xp = {};
  for (const k in G.skills) {
    const d = Math.floor((G.skills[k] || 0) - (opts.skills[k] || 0));
    if (d > 0) xp[k] = d;
  }
  return { summary, gold: Math.floor(G.gold), xp, items: bag, hp: G.playerHp, maxHp: G.playerMaxHp, stats: G.stats };
}

// ── Server call helper ──────────────────────────────────────────────────────
function serverAccrual(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 0,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'combat',
    activeId: MONSTER,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 60, maxHp: 60, gold: 1234,
    skills: baseSkills(),
    equipment: EQUIPMENT,
    items: ITEMS,
    monsters: MONSTERS,
    ...over,
  });
}

// ── 1. PARITY ───────────────────────────────────────────────────────────────
const FIXTURES = [
  { name: 'early-game goblin', monster: MONSTER, skills: baseSkills(), hp: 60, maxHp: 60 },
  { name: 'maxed vs slime (both UTC segments)', monster: 'slime', skills: MAXED, hp: 99, maxHp: 99 },
  { name: 'maxed vs the day-1 featured boss', monster: 'warband_captain', skills: MAXED, hp: 99, maxHp: 99 },
].filter((f) => MONSTERS[f.monster]);

function parityGuard() {
  const seen = { segments: 0, featuredMs: 0, featuredDropMult: 1, crits: 0, kills: 0, ticks: 0, deaths: 0 };

  for (const f of FIXTURES) {
    const s = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp });
    ok(s.accrued === true, `[${f.name}] accrued nothing (reason: ${s.reason})`);
    if (!s.accrued) continue;

    const c = clientAwaySpan({
      monsterId: f.monster, equipment: EQUIPMENT, skills: f.skills,
      hp: f.hp, maxHp: f.maxHp, seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, capped: false,
    });

    const P = (m) => `PARITY [${f.name}]: ${m}`;
    eq(s.tickMs, clientCombatTickMs(equipmentStats(EQUIPMENT, ITEMS)),
      P('derived tickMs differs from the client combatTickMs()'));
    eq(s.summary.ticks, c.summary.ticks, P('tick count differs'));
    eq(s.summary.kills, c.summary.kills, P('kill count differs'));
    eq(s.summary.crits, c.summary.crits, P('crit count differs'));
    eq(s.summary.died, c.summary.died, P('death outcome differs'));
    eq(s.summary.featuredMs, c.summary.featuredMs, P('featured (Boss-of-the-Day) ms differs'));
    eq(s.summary.featuredDropMult, c.summary.featuredDropMult, P('featuredDropMult differs (b326)'));
    eq(s.summary.segments, c.summary.segments, P('UTC-day segmentation differs'));
    eq(s.summary.gold, c.gold, P('gold differs'));
    eq(s.summary.xp, c.xp, P('XP grants differ'));
    eq(s.summary.items, c.items, P('item drops differ'));
    eq(s.delta.hp, Math.max(0, Math.min(c.maxHp, Math.floor(c.hp))), P('resulting HP differs'));

    /* The `stat` progress rows must agree with what the simulation counted —
       otherwise the Hero screen and the ledger tell two different stories. */
    const stats = Object.fromEntries((s.delta.progress || []).map((p) => [p.key, p.add]));
    eq(stats.kills, c.stats.kills, P('the journalled kill count differs from the simulated one'));
    eq(stats.crits || undefined, c.stats.crits, P('the journalled crit count differs from the simulated one'));

    /* Determinism: the same seed twice is the same answer. That is what makes a
       server grant auditable — a dispute is replayable from the ledger. */
    const again = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp });
    eq(again.summary.xp, s.summary.xp, `DETERMINISM [${f.name}]: same seed produced different XP`);
    /* …and a DIFFERENT seed does not. An engine that ignored its seed would
       pass every assertion above. */
    const other = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp, seed: SEED + 1 });
    ok(JSON.stringify(other.summary.xp) !== JSON.stringify(s.summary.xp),
      `DETERMINISM [${f.name}]: a different seed produced an identical fight — the seed is not being used`);

    /* The ruling's own contract: away and active are ONE formula, and with
       blessings and consumables off they must produce identical results. */
    const active = clientAwaySpan({
      monsterId: f.monster, equipment: EQUIPMENT, skills: f.skills,
      hp: f.hp, maxHp: f.maxHp, seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, away: false,
    });
    eq(s.summary.kills, active.summary.kills,
      `RULING [${f.name}]: away and active differ with all bonuses off — away must pay 1.00x`);
    eq(s.summary.xp, active.xp, `RULING [${f.name}]: away and active XP differ with all bonuses off`);

    seen.segments = Math.max(seen.segments, s.summary.segments.length);
    seen.featuredMs = Math.max(seen.featuredMs, s.summary.featuredMs);
    seen.featuredDropMult = Math.max(seen.featuredDropMult, s.summary.featuredDropMult);
    seen.crits = Math.max(seen.crits, s.summary.crits);
    seen.kills = Math.max(seen.kills, s.summary.kills);
    seen.ticks = Math.max(seen.ticks, s.summary.ticks);
    seen.deaths += s.summary.died ? 1 : 0;
  }

  /* COVERAGE. A parity suite whose fixtures all take the same trivial path
     proves parity of nothing. These assertions fail if the table degrades —
     which is how a passing test quietly stops testing. */
  ok(seen.ticks > 1000, `COVERAGE: the longest fixture ran only ${seen.ticks} ticks`);
  ok(seen.kills > 100, `COVERAGE: the busiest fixture made only ${seen.kills} kills`);
  ok(seen.crits > 0, 'COVERAGE: no fixture rolled a crit — crits away are the ruling\'s headline reversal');
  ok(seen.segments >= 2, 'COVERAGE: no fixture crossed UTC midnight — Boss-of-the-Day segmentation is untested');
  ok(seen.featuredMs > 0 && seen.featuredDropMult > 1,
    'COVERAGE: no fixture fought a featured boss — featuredMs/featuredDropMult are untested');
  ok(seen.deaths > 0, 'COVERAGE: no fixture died — the death path ends the activity and is untested');
}

// ── 2. HOSTILE INPUT ────────────────────────────────────────────────────────
function hostileGuard() {
  const honest = serverAccrual();
  if (!honest.accrued) { problems.push('hostile: baseline did not accrue'); return; }
  const fingerprint = (r) => JSON.stringify({
    ticks: r.summary?.ticks, kills: r.summary?.kills, xp: r.summary?.xp,
    gold: r.summary?.gold, items: r.summary?.items, grantMs: r.grantMs, tickMs: r.tickMs,
  });
  const base = fingerprint(honest);

  /* Every field a compromised or careless caller might try to smuggle in. The
     engine takes a NAMED object, so the proof is that adding these keys changes
     nothing at all. This is the mechanical form of "construct the ctx field by
     field — never spread a request body". */
  const attacks = {
    tickMs: 1,
    minTickMs: 1,
    interval_ms: 1,
    ticks: 43_200_000,
    atMs: 0,
    fromMs: 0,
    toMs: NOW_MS + 365 * 86400000,
    elapsedMs: 365 * 86400000,
    elapsed: 365 * 86400000,
    grantMs: 365 * 86400000,
    spanMs: 365 * 86400000,
    away: false,
    rateMult: 1000,
    capped: false,
    bonus: () => 10,
    rng: createRng(1),
    ctx: { tickMs: 1, minTickMs: 1 },
    delta: { gold: 1e12 },
    hearth_tokens: 1e9,
  };
  for (const [k, v] of Object.entries(attacks)) {
    const r = serverAccrual({ [k]: v });
    if (fingerprint(r) !== base) {
      problems.push(`HOSTILE: request field '${k}' changed the grant — it must be inert`);
    }
  }
  /* …and all of them at once, in case one is only inert in isolation. */
  const all = serverAccrual(attacks);
  if (fingerprint(all) !== base) problems.push('HOSTILE: the combined hostile payload changed the grant');

  // capMs: a caller-inflated cap can never buy more than the real elapsed time,
  // and can never exceed the engine's own absolute fuse.
  const bigCap = computeAccrual({
    nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(bigCap.accrued && bigCap.grantMs === SPAN_MS,
    `HOSTILE: an unbounded capMs granted ${bigCap.grantMs}ms, expected the real elapsed ${SPAN_MS}ms`);

  const longAbsence = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 400 * 86400000, activeSinceMs: NOW_MS - 400 * 86400000,
    activeKind: 'combat', activeId: MONSTER, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(longAbsence.grantMs <= ACCRUE_MAX_SPAN_MS,
    `HOSTILE: a 400-day absence with a broken cap granted ${longAbsence.grantMs}ms — the absolute fuse did not hold`);

  // The cap is real: an 18h absence at a 12h cap pays exactly 12h and reports it.
  const capped = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 18 * 3600000, activeSinceMs: NOW_MS - 18 * 3600000,
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(capped.grantMs === 12 * 3600000, `CAP: 18h absence at a 12h cap granted ${capped.grantMs}ms`);
  ok(capped.capped === true, 'CAP: a capped grant did not report capped:true');
  ok(capped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'CAP: a capped grant must still advance the watermark to now — otherwise the cap is drainable in instalments');

  // active_since clamps too, so a stale watermark after a forgotten
  // `accrued_to` on start_activity cannot mint a night.
  const staleWatermark = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 11 * 3600000,
    activeSinceMs: NOW_MS - 30 * 60000,          // the fight started 30 minutes ago
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(staleWatermark.grantMs === 30 * 60000,
    `WATERMARK: a stale accrued_to paid ${staleWatermark.grantMs}ms for a fight that is 30 minutes old`);

  // A clock that has not moved, or has moved backwards, grants nothing.
  for (const [name, over] of [
    ['no elapsed time', { accruedToMs: NOW_MS }],
    ['a future watermark', { accruedToMs: NOW_MS + 86400000 }],
    ['a sub-threshold absence', { accruedToMs: NOW_MS - (ACCRUE_MIN_MS - 1) }],
    ['a zero cap', { capMs: 0 }],
    ['a negative cap', { capMs: -1 }],
    ['a NaN cap', { capMs: NaN }],
    ['an idle character', { activeKind: 'idle', activeId: null }],
    ['a gathering character', { activeKind: 'gather', activeId: 'oak' }],
    ['an unknown monster', { activeId: 'not_a_monster' }],
  ]) {
    const r = serverAccrual(over);
    ok(r.accrued === false, `SKIP: ${name} produced a grant (${JSON.stringify(r.grantMs)})`);
    ok(!r.delta, `SKIP: ${name} produced a delta`);
  }

  // tickMs is derived from equipment and floored. Prove BOTH: that gear moves
  // it (so it is not a constant) and that it can never go under the floor.
  const noGear = deriveTickMs({}, ITEMS);
  ok(noGear === COMBAT_BALANCE.tickMs, `TICK: an unarmed player should swing at ${COMBAT_BALANCE.tickMs}ms, got ${noGear}`);
  const hammer = Object.keys(ITEMS).find((id) => ITEMS[id]?.weaponType === 'hammer');
  if (hammer) {
    ok(deriveTickMs({ weapon: hammer }, ITEMS) > noGear,
      'TICK: a hammer must swing SLOWER than bare hands — the weapon-family speed identity is not applied');
  }
  for (const bogus of [{ weapon: '__nope__' }, null, undefined, { weapon: null }]) {
    const t = deriveTickMs(bogus, ITEMS);
    ok(t >= COMBAT_BALANCE.minTickMs, `TICK: bogus equipment ${JSON.stringify(bogus)} produced ${t}ms, below the ${COMBAT_BALANCE.minTickMs}ms floor`);
  }
  ok(zeroBonus('goldFind') === 0 && zeroBonus('dropRate') === 0 && zeroBonus('allXP') === 0,
    'BONUS: the server perk stack is not inert');
}

// ── 3. SHAPE + SOURCE ───────────────────────────────────────────────────────
// hr_apply's delta contract, asserted against the same list the SQL enforces.
const DELTA_KEYS = ['gold', 'gems', 'hp', 'items', 'xp', 'equip', 'activity',
                    'accrued_to', 'farm', 'progress', 'progress_claim', 'journal'];

async function shapeGuard() {
  const s = serverAccrual();
  if (!s.accrued) { problems.push('shape: baseline did not accrue'); return; }

  for (const k of Object.keys(s.delta)) {
    ok(DELTA_KEYS.includes(k),
      `SHAPE: delta key '${k}' is not in hr_apply's contract — unknown keys are REJECTED, not ignored`);
  }
  ok(!('hearth_tokens' in s.delta), 'SHAPE: the bond must never appear in a delta');
  ok(!('gems' in s.delta), 'SHAPE: accrual must not touch gems');
  ok(!('equip' in s.delta), 'SHAPE: accrual must not move equipment');

  const ints = [];
  if (s.delta.gold !== undefined) ints.push(['gold', s.delta.gold]);
  if (s.delta.hp !== undefined) ints.push(['hp', s.delta.hp]);
  for (const [k, v] of Object.entries(s.delta.xp || {})) ints.push([`xp.${k}`, v]);
  for (const [k, v] of Object.entries(s.delta.items || {})) ints.push([`items.${k}`, v]);
  for (const p of s.delta.progress || []) ints.push([`progress.${p.key}`, p.add]);
  for (const [k, v] of ints) {
    ok(Number.isInteger(v) && Number.isFinite(v),
      `SHAPE: ${k} = ${v} is not an integer — hr_apply casts with ::bigint and would return bad_delta`);
    ok(v >= 0, `SHAPE: ${k} = ${v} is negative`);
  }
  ok(s.delta.xp === undefined || Object.values(s.delta.xp).every((v) => v > 0),
    'SHAPE: XP is monotonic — a zero or negative grant must be omitted');

  for (const it of Object.keys(s.delta.items || {})) {
    ok(!!ITEMS[it], `SHAPE: item '${it}' is not in the authored catalogue — hr_apply would reject the WHOLE delta`);
  }
  for (const p of s.delta.progress || []) {
    ok(['quest', 'daily', 'bounty', 'stat', 'collection', 'flag'].includes(p.kind),
      `SHAPE: progress kind '${p.kind}' is not one hr_apply accepts`);
    ok(['active', 'done'].includes(p.state),
      `SHAPE: progress state '${p.state}' is not settable by a delta ('claimed' has its own path)`);
  }
  ok(s.delta.journal?.kind === 'combat' && s.delta.journal?.intent === 'accrue',
    'SHAPE: the journal row must name kind=combat / intent=accrue');
  ok(typeof s.delta.journal?.meta === 'object'
     && Object.keys(s.delta.journal.meta).length <= 8,
    'SHAPE: the journal meta must be an aggregate, not a per-kill log (game_events: 1.6M rows from six players)');
  ok(typeof s.delta.accrued_to === 'string' && !Number.isNaN(Date.parse(s.delta.accrued_to)),
    'SHAPE: accrued_to must be an ISO timestamp');

  // ── Source-level rules that no runtime test can see ──────────────────────
  const engine = await readFile(join(FN_DIR, 'accrual.js'), 'utf8');
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const engineCode = code(engine);
  const shellCode = code(shell);

  ok(!/\.\.\.\s*(inp|input|req|body|opts|ctx)\b/.test(engineCode),
    'SOURCE: accrual.js spreads a caller object — minTickMs would ride in through the same door as tickMs');
  /* Reading COMBAT_BALANCE.minTickMs is correct (it IS the floor); ASSIGNING
     `minTickMs:` into a ctx is the opt-in that would defeat the clamp. Match
     the assignment, not the identifier. */
  ok(!/\bminTickMs\s*:/.test(engineCode),
    'SOURCE: accrual.js sets minTickMs in a ctx — the accrual path must use the real 600ms floor');
  ok(/COMBAT_BALANCE\.minTickMs/.test(engineCode),
    'SOURCE: accrual.js must floor the derived tick at COMBAT_BALANCE.minTickMs');
  ok(!/\bMath\s*\.\s*random\s*\(/.test(engineCode) && !/\bMath\s*\.\s*random\s*\(/.test(shellCode),
    'SOURCE: Math.random() is banned server-side — accrual must be replayable');
  ok(!/\bDate\s*\.\s*now\s*\(\)/.test(engineCode),
    'SOURCE: accrual.js reads a wall clock — atMs must come from now() in Postgres');
  ok(/service_role/.test(shellCode) === false,
    'SOURCE: index.ts references the service role — it bypasses RLS and holds every table privilege (defect S1)');
  ok(!/:5432\b/.test(shellCode),
    'SOURCE: index.ts names port 5432 — all engine traffic uses the transaction pooler on 6543 (design §2a-ii, HARD RULE)');
  ok(/set local role hr_engine/.test(shellCode),
    'SOURCE: index.ts must `set local role hr_engine` inside every transaction — transaction mode keeps no session state');
  ok(/prepare:\s*false/.test(shellCode),
    'SOURCE: index.ts must set prepare:false — named prepared statements do not survive transaction-mode pooling');
  for (const table of ['player_state', 'player_inventory', 'player_skills', 'player_ledger', 'player_progress']) {
    ok(!new RegExp(`(insert|update|delete)[\\s\\S]{0,40}${table}`, 'i').test(shellCode),
      `SOURCE: index.ts appears to write ${table} directly — Edge Functions never write tables`);
  }
  ok(/hr_apply\(/.test(shellCode), 'SOURCE: index.ts must go through hr_apply');
  ok(/hr_offline_cap_ms\(/.test(shellCode), 'SOURCE: the cap must be read from Postgres, not computed in the engine');
  ok(/hr_seed\(/.test(shellCode), 'SOURCE: the PRNG seed must come from hr_seed (server secret), never from visible values');
}

// ── 4. THE PACKER ───────────────────────────────────────────────────────────
// The Deno/core sharing mechanism has a drift guard; run it here so a change to
// src/core that never got repacked fails a test rather than a deploy.
async function packerGuard() {
  const { runAll: packCheck } = await import('../tools/pack-edge.mjs');
  for (const p of await packCheck()) problems.push(`PACK: ${p}`);
}

export async function runAll() {
  problems.length = 0;
  parityGuard();
  hostileGuard();
  await shapeGuard();
  await packerGuard();
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const found = await runAll();
  if (found.length) {
    console.log('Accrual engine guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  const s = serverAccrual();
  console.log('Accrual engine guard — server parity with the client, hostile inputs inert.');
  console.log(`  fixture: ${MONSTER} · ${SPAN_MS / 3600000}h · tick ${s.tickMs}ms · ` +
    `${s.summary.ticks} ticks · ${s.summary.kills} kills · ${s.summary.crits} crits · ` +
    `${s.summary.gold}g · ${Object.keys(s.summary.xp).length} skills · ` +
    `${s.summary.segments.length} UTC segments`);
}
