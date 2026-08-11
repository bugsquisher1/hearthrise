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

import { readFile, readdir } from 'node:fs/promises';
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
import { resolveStyle, COMBAT_STYLES } from '../src/core/styles.js?v=326';
import { ITEMS } from '../src/data/items.js?v=326';
import { MONSTERS } from '../src/data/monsters.js?v=326';

import {
  computeAccrual, deriveTickMs, deriveProfile, zeroBonus,
  ACCRUE_MIN_MS, ACCRUE_MAX_SPAN_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { parseIntent, readSlot, MAX_SLOT } from '../supabase/functions/hr-accrue/request.js';

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

function clientCombatTickMs(eqStats, style) {
  const spd = Math.max(0, Math.min(0.20, (eqStats.spdB) || 0));
  const wmod = WEAPON_SPEED_MOD[eqStats.weaponType] || 1;
  /* b329: the third term. Written out here, deliberately, rather than calling
     core's swingIntervalMs — this reference exists to be an INDEPENDENT second
     construction, so it has to spend the style cost independently too. Today
     every family's DEFAULT style is 1.00, so omitting it would have kept parity
     green while the term rotted; that is exactly the silent drift this file is
     supposed to catch. */
  const smod = Math.max(1, Math.min(2, Number(style && style.speedMod) || 1));
  return Math.max(COMBAT_BALANCE.minTickMs,
    Math.floor(COMBAT_BALANCE.tickMs * (1 - spd) * wmod * smod));
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
    tickMs: clientCombatTickMs(eqStats, style),
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
    const pEq = equipmentStats(EQUIPMENT, ITEMS);
    eq(s.tickMs, clientCombatTickMs(pEq, resolveStyle(pEq.weaponType, null)),
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
  /* b329 (Xarn): the chosen STYLE now carries a speed cost, and the server has
     to spend it too — otherwise a Longrange player earns Rapid's tick budget
     overnight, which is the away/live divergence class this whole program
     exists to end. Also pins the direction: a style may only ever be SLOWER,
     because tickMs is a divisor of elapsed time on this path. */
  const bow = Object.keys(ITEMS).find((id) => ITEMS[id]?.weaponType === 'ranged');
  if (bow) {
    const R = COMBAT_STYLES.ranged;
    const fast = deriveTickMs({ weapon: bow }, ITEMS, R.rapid);
    const slow = deriveTickMs({ weapon: bow }, ITEMS, R.longrange);
    ok(deriveTickMs({ weapon: bow }, ITEMS) === fast,
      'TICK: no style must derive the same interval as the baseline style');
    ok(slow > fast,
      `TICK: Longrange must swing slower than Rapid on the SERVER too — got ${slow}ms vs ${fast}ms`);
    ok(deriveTickMs({ weapon: bow }, ITEMS, { speedMod: 0.01 }) === fast,
      'TICK: a sub-1 speedMod must clamp to the baseline — a style can never shrink the away tick divisor');
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
  /* b329: the floor moved INTO `swingIntervalMs` (src/core/combat.js) when the
     hand-copied interval expression here was replaced by a call to the one the
     client uses. The grep follows it: the requirement is still "the derived tick
     is floored", it is just no longer floored by a second copy of the clamp.
     Either shape satisfies this — what must never happen is deriveTickMs
     open-coding an interval with no floor at all. The NUMERIC proof that the
     floor holds is the bogus-equipment loop above; this is the shape guard. */
  ok(/COMBAT_BALANCE\.minTickMs/.test(engineCode) || /swingIntervalMs\s*\(/.test(engineCode),
    'SOURCE: accrual.js must floor the derived tick — via core swingIntervalMs() or COMBAT_BALANCE.minTickMs');
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

// ── 4. THE SHELL — THE SURFACE AN ATTACKER ACTUALLY TOUCHES ────────────────
// Section 2 proves hostile keys are inert ON THE ENGINE'S INPUT OBJECT. Nobody
// hands the engine an object: an attacker hands an HTTP BODY to index.ts. That
// surface had no executable test, because index.ts is Deno TypeScript and
// cannot be imported into Node — so the body reader now lives in request.js,
// which is pure ESM, and this section runs the exact function the shell calls.
function requestGuard() {
  /* Every shape a body can take. The assertion is the same for all of them: the
     result has exactly one key, `slot`, and it is an integer in range. */
  const bodies = [
    null, undefined, 0, 1, '', 'slot', '{"slot":3}', true, [], [3], [{ slot: 3 }],
    {}, { slot: 3 }, { slot: '3' }, { slot: 3.5 }, { slot: -1 }, { slot: 6 },
    { slot: 1e9 }, { slot: NaN }, { slot: Infinity }, { slot: null }, { slot: {} },
    { slot: [3] }, { slot: '3abc' }, { slot: ' 3 ' }, { slot: '0x3' }, { slot: 1n },
    { slot: 2, capMs: 999999999, tickMs: 1, gold: 1e12, userId: 'someone-else' },
    { slot: 2, __proto__: { slot: 5 } },
    JSON.parse('{"__proto__":{"slot":5},"slot":1}'),
    JSON.parse('{"constructor":{"prototype":{"slot":5}}}'),
    { get slot() { throw new Error('a getter that fires is a getter that ran'); } },
    { toJSON: () => ({ slot: 5 }) },
    Object.create({ slot: 5 }),                       // slot on the PROTOTYPE only
  ];
  for (const b of bodies) {
    let r;
    try { r = parseIntent(b); }
    catch (e) {
      /* A getter is allowed to throw — what matters is that the shell never
         reaches a state where a thrown getter has already influenced a number.
         parseIntent reading `body.slot` once is the whole exposure. */
      ok(String(e?.message || '').includes('getter'),
        `REQUEST: parseIntent threw on ${JSON.stringify(String(b))}: ${e?.message}`);
      continue;
    }
    const keys = Object.keys(r);
    ok(keys.length === 1 && keys[0] === 'slot',
      `REQUEST: parseIntent returned keys [${keys}] for a hostile body — it must return exactly {slot}`);
    ok(Number.isInteger(r.slot) && r.slot >= 0 && r.slot <= MAX_SLOT,
      `REQUEST: parseIntent produced slot=${String(r.slot)} — outside [0, ${MAX_SLOT}]`);
    ok(Object.getPrototypeOf(r) === null,
      'REQUEST: parseIntent returned an object with a prototype — it must be null-prototype');
  }
  /* The prototype was never polluted along the way. */
  ok(({}).slot === undefined, 'REQUEST: Object.prototype.slot was polluted by a hostile body');
  /* The legal values survive, so the guard is not just "always 0". */
  for (let s = 0; s <= MAX_SLOT; s++) {
    ok(readSlot({ slot: s }) === s, `REQUEST: a legitimate slot ${s} was coerced to ${readSlot({ slot: s })}`);
  }
  ok(readSlot({ slot: MAX_SLOT + 1 }) === 0, 'REQUEST: a slot past the bound was not clamped');
}

/* Source-level rules about the SHELL. `shapeGuard` used to assert things about
   accrual.js and call that a proof about the request path; these are the ones
   that are actually about the request path. */
async function shellGuard() {
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // (a) NOTHING request-shaped is ever spread. This is the rule that keeps
  //     `minTickMs` from riding in through the same door as `tickMs`.
  ok(!/\.\.\.\s*(body|payload|req|request|json|intent|input|params|query)\b/.test(code),
    'SHELL: index.ts spreads a request-derived object — the ctx must be built field by field');

  // (b) The body is read ONCE, and the value goes straight into the one function
  //     that is allowed to interpret it. No intermediate binding means there is
  //     no identifier for a later edit to reach for.
  const jsonCalls = (code.match(/req\s*\.\s*json\s*\(/g) || []).length;
  ok(jsonCalls === 1, `SHELL: req.json() is called ${jsonCalls} times — the body must be read exactly once`);
  ok(/parseIntent\(\s*await\s+req\.json\(\)[\s\S]{0,40}?\)/.test(code),
    'SHELL: the req.json() result is not piped directly into parseIntent — that binding is the attack surface');
  const parseCalls = (code.match(/parseIntent\s*\(/g) || []).length;
  ok(parseCalls === 1, `SHELL: parseIntent is called ${parseCalls} times — one body, one reader`);

  // (c) The engine call site names only server values. Extract the literal by
  //     brace matching and check every identifier in it.
  const at = code.indexOf('computeAccrual({');
  ok(at >= 0, 'SHELL: index.ts does not call computeAccrual({ … }) with an object literal');
  if (at >= 0) {
    let depth = 0; let end = at;
    for (let i = code.indexOf('{', at); i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const lit = code.slice(at, end + 1);
    for (const bad of ['body', 'req.', 'request', 'payload', 'intent.', 'params', 'headers']) {
      ok(!lit.includes(bad),
        `SHELL: the computeAccrual literal references '${bad}' — the only request-derived value permitted is slot`);
    }
    ok(/\bslot\b/.test(lit), 'SHELL: the computeAccrual literal does not pass slot at all');
    ok(!/\.\.\./.test(lit), 'SHELL: the computeAccrual literal contains a spread');
  }

  // (d) IDENTITY IS VERIFIED, NOT DECODED (review D2).
  ok(/verifyJwt\(/.test(code),
    'SHELL: index.ts does not call verifyJwt — a decoded JWT is not a verified one');
  ok(!/JSON\.parse\(\s*atob\(/.test(code),
    'SHELL: index.ts decodes a JWT by hand — that is the D2 defect, use jwt.js');

  // (e) THE RATE GATE PRECEDES THE EXPENSIVE READ (review D3).
  const gateAt = code.indexOf('hr_rate_gate(');
  const stateAt = code.indexOf('hr_state_of(');
  ok(gateAt >= 0, 'SHELL: index.ts does not call hr_rate_gate — the non-accruing path would be free to loop');
  ok(gateAt >= 0 && stateAt >= 0 && gateAt < stateAt,
    'SHELL: hr_rate_gate is called AFTER hr_state_of — a rejected call must consume budget BEFORE it costs a read');
  ok(!/hr_rate_ok\(/.test(code),
    'SHELL: index.ts calls hr_rate_ok directly — its signature takes the LIMIT as an argument, so the engine would name its own rate limit');

  // (f) The replay path must not fabricate a receipt (review S7).
  ok(/replayed\s*===\s*true/.test(code),
    'SHELL: index.ts does not branch on res.replayed — a replay would return an `away` block for a delta that was not applied');
  const replayAt = code.indexOf('replayed === true');
  const awayAt = code.indexOf('away: {');
  ok(replayAt >= 0 && awayAt >= 0 && replayAt < awayAt,
    'SHELL: the replay branch does not precede the away block');

  // (g) The slot bound must agree with the DATABASE, not with a comment. The
  //     previous shell documented "0…4" while the code and the CHECK both said
  //     0..5; a comment that disagrees with a constraint is a trap.
  const ps = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-player-state.sql'), 'utf8');
  const m = ps.match(/slot\s+int\s+not null default 0 check \(slot between (\d+) and (\d+)\)/);
  ok(!!m, 'SHELL: could not find the player_state slot CHECK to compare MAX_SLOT against');
  if (m) {
    ok(Number(m[2]) === MAX_SLOT,
      `SHELL: request.js MAX_SLOT is ${MAX_SLOT} but player_state allows 0..${m[2]}`);
  }
  ok(!/0…4|0\.\.4\b/.test(shell), 'SHELL: index.ts still documents the slot bound as 0…4');
}

// ── 5. CLAMP HEADROOM ───────────────────────────────────────────────────────
// hr_apply's clamps are a BLAST RADIUS, not balance — but a clamp rejection
// rolls back, watermark included, so before the degrade ladder in index.ts a
// single trip bricked a character's accrual permanently. The ladder makes that
// recoverable; this guard makes it unlikely, by failing the BUILD when honest
// play gets within 60% of any clamp.
//
// The clamps are read out of the migration, never restated here: a second copy
// of a number is a drift generator, which is the failure this whole program is
// organised around.
const HEADROOM = 0.60;

function clampsFromMigration(sql) {
  const out = {};
  for (const m of sql.matchAll(/c_(max_[a-z_]+)\s+constant\s+(?:bigint|int)\s*:=\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

async function clampGuard() {
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8');
  const C = clampsFromMigration(sql);
  for (const need of ['max_gold_delta', 'max_item_delta', 'max_xp_delta', 'max_item_kinds',
                      'max_progress_ops', 'max_progress_add']) {
    ok(C[need] > 0, `CLAMP: could not read c_${need} out of apply-engine.sql — the guard would be vacuous`);
  }
  if (!C.max_xp_delta) return;

  /* X4 — THE SURVIVING PROPERTY, ASSERTED RATHER THAN DESCRIBED.
     c_max_xp_delta was raised 5,000,000 -> 12,000,000 on 2026-08-11. The
     property that has to hold at ANY value is: one compromised call still
     cannot carry a skill from 0 to the level cap. xpForLevel(99) = 13,034,431
     (checked against public.hr_xp_for_level(99) on the live database, and
     against XP_TABLE in legacy.js, which agree). 12,000,000 lands at level 98.
     A future "just bump the clamp" therefore fails HERE, in a test, instead of
     passing a review as a sentence in a comment.
     Note what this is NOT: it is not a claim that the clamp stops a determined
     attacker. hr_rate_gate allows 30 calls/min, so 12M/call is 360M XP/min to
     anyone holding the engine. See the block above c_max_xp_delta in
     apply-engine.sql for what the clamp genuinely earns. */
  ok(C.max_xp_delta < 13034431,
    `CLAMP: c_max_xp_delta is ${C.max_xp_delta}, at or above xpForLevel(99) = 13034431. `
    + 'One apply could then take a skill from 0 to the cap, which is the only property '
    + 'the per-call XP clamp still buys. Lower it, or stop calling it a clamp.');

  /* The whole reachable envelope, not one fixture: EVERY monster in the
     catalogue, at the two spans that matter (15h, and 24h — the
     hr_offline_cap_ms ceiling and accrual.js's own ACCRUE_MAX_SPAN_MS), maxed
     skills and best-in-slot gear. "A new high-XP monster tightens it" is only
     true as a guard if the guard actually looks at the new monster. */
  const worst = { max_xp_delta: [0, ''], max_gold_delta: [0, ''], max_item_delta: [0, ''],
                  max_item_kinds: [0, ''], max_progress_add: [0, ''], max_progress_ops: [0, ''] };
  const bump = (k, v, where) => { if (v > worst[k][0]) worst[k] = [v, where]; };

  for (const spanH of [15, 24]) {
    for (const id of Object.keys(MONSTERS)) {
      const r = computeAccrual({
        userId: '00000000-0000-4000-8000-000000000001', slot: 0,
        nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000,
        activeSinceMs: NOW_MS - spanH * 3600000,
        activeKind: 'combat', activeId: id, capMs: spanH * 3600000, seed: SEED,
        hp: 9999, maxHp: 9999, gold: 0, skills: MAXED, equipment: EQUIPMENT,
        items: ITEMS, monsters: MONSTERS,
      });
      if (!r.accrued) continue;
      const d = r.delta; const where = `${spanH}h ${id}`;
      bump('max_xp_delta', Math.max(0, ...Object.values(d.xp || {})), where);
      bump('max_gold_delta', d.gold || 0, where);
      bump('max_item_delta', Math.max(0, ...Object.values(d.items || {})), where);
      bump('max_item_kinds', Object.keys(d.items || {}).length, where);
      bump('max_progress_add', Math.max(0, ...(d.progress || []).map((p) => p.add)), where);
      bump('max_progress_ops', (d.progress || []).length, where);
    }
  }

  clampGuard.report = [];
  for (const [k, [v, where]] of Object.entries(worst)) {
    if (!C[k]) continue;
    const pct = v / C[k];
    clampGuard.report.push(`${k} ${v}/${C[k]} = ${(pct * 100).toFixed(1)}% (${where})`);
    ok(pct < HEADROOM,
      `CLAMP HEADROOM: honest play reaches ${v} against c_${k} = ${C[k]} — ${(pct * 100).toFixed(1)}%, `
      + `over the ${HEADROOM * 100}% line, at ${where}. A clamp that honest play can approach is a clamp that WILL `
      + `fire, and a fired clamp costs the player part of an absence (index.ts's degrade ladder) instead of `
      + `bricking it — but it is still an incident. Raise c_${k} in supabase/migrations/2026-08-11-apply-engine.sql `
      + `(and get it re-reviewed), or reduce the yield.`);
  }
}

// ── 6. THE DEPLOY CONTRACT ──────────────────────────────────────────────────
// D2's second lock. In-function verification is the primary control, but
// `verify_jwt = true` must also exist as a committed artefact, and nothing in
// the repo may tell anyone to turn it off.
async function deployGuard() {
  const cfgPath = join(ROOT, 'supabase', 'config.toml');
  let cfg = null;
  try { cfg = await readFile(cfgPath, 'utf8'); }
  catch { problems.push('DEPLOY: supabase/config.toml is missing — verify_jwt would live only in a deploy command'); return; }

  const fnDir = join(ROOT, 'supabase', 'functions');
  const names = (await readdir(fnDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  for (const n of names) {
    const head = `[functions.${n}]`;
    const at = cfg.indexOf(head);
    if (at < 0) { problems.push(`DEPLOY: supabase/config.toml has no ${head} section`); continue; }
    const rest = cfg.slice(at + head.length);
    const next = rest.indexOf('\n[');
    const block = next >= 0 ? rest.slice(0, next) : rest;
    ok(/verify_jwt\s*=\s*true/.test(block),
      `DEPLOY: supabase/config.toml does not pin verify_jwt = true for ${head}`);
  }
  ok(!/verify_jwt\s*=\s*false/.test(cfg), 'DEPLOY: config.toml sets verify_jwt = false somewhere');

  /* No file in the repo may hand someone the flag. Documentation that explains
     WHY NOT to use it is legitimate and worth keeping — the header of jwt.js is
     the clearest statement of the D2 defect anywhere — so an occurrence is
     allowed ONLY on a line that also carries the marker below. That makes the
     exception explicit and countable instead of making the guard blind, and a
     future deploy script cannot acquire one by accident.

     The pattern is assembled from fragments so that THIS FILE does not match
     its own search — the self-match is how the first run of this guard failed. */
  const FLAG = `--no-${'verify'}-jwt`;
  const MARKER = 'never use this';
  for (const rel of await repoScripts()) {
    const body = await readFile(join(ROOT, rel), 'utf8');
    for (const line of body.split('\n')) {
      if (!line.includes(FLAG)) continue;
      ok(line.toLowerCase().includes(MARKER),
        `DEPLOY: ${rel} contains ${FLAG} on a line with no "${MARKER}" marker — `
        + 'if this is documentation, say so on the line; if it is a command, delete it');
    }
  }
}

/* Every place a deploy command could plausibly be written down. Kept explicit
   rather than walking the whole tree: node_modules and assets are large, and a
   guard that takes four seconds is a guard someone will move out of the
   preflight. */
async function repoScripts() {
  const out = [];
  const roots = ['', '.github/workflows', 'docs', 'docs/design', 'tools', 'tests', 'supabase'];
  for (const r of roots) {
    let entries = [];
    try { entries = await readdir(join(ROOT, r), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(sh|mjs|js|ya?ml|md|toml|json)$/.test(e.name)) continue;
      out.push(r ? `${r}/${e.name}` : e.name);
    }
  }
  return out;
}

// ── 7. THE PACKER ───────────────────────────────────────────────────────────
// The Deno/core sharing mechanism has a packability guard; run it here so a
// change to src/core that never got repacked fails a test rather than a deploy.
//
// ⚠ WHAT THIS DOES NOT PROVE (review S10). `check()` cannot answer
//   "does production match this repo?" — it derives both sides from the same
//   bytes. The earlier revision claimed otherwise and its central comparison was
//   unfalsifiable. The deployed-vs-repo question is answered by the payload
//   hash: pack() stamps it, the function returns it on a GET, and
//   tests/run-smoke.mjs compares the two when HR_ACCRUE_URL is configured.
async function packerGuard() {
  const pe = await import('../tools/pack-edge.mjs');
  for (const p of await pe.runAll()) problems.push(`PACK: ${p}`);

  const { files, hash } = await pe.pack('hr-accrue');
  ok(/^[0-9a-f]{64}$/.test(hash || ''), `PACK: the payload hash is '${hash}' — not a sha256`);
  const stamped = files.find((f) => f.name === pe.HASH_FILE);
  ok(!!stamped && stamped.content.includes(`'${hash}'`),
    'PACK: the packed payload-hash.js does not carry the digest the packer computed');

  /* THE GUARD'S OWN GUARD. `check()`'s comparisons are only worth having if a
     corrupted transform would be caught. Prove the round-trip property is
     falsifiable rather than assuming it: a transform that drops a character
     must not round-trip. */
  const src = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  ok(pe.unrewriteFunctionSource(pe.rewriteFunctionSource(src)) === src,
    'PACK: an honest pack does not round-trip — the check would fail on correct input');
  const corrupted = pe.rewriteFunctionSource(src).replace('./vendor/data/', './vendor/dat/');
  ok(pe.unrewriteFunctionSource(corrupted) !== src,
    'PACK: a CORRUPTED pack still round-trips — the drift check is unfalsifiable');

  /* And the payload hash must actually depend on the payload. */
  const other = files.map((f) => ({ ...f }));
  other[0] = { ...other[0], content: `${other[0].content}\n` };
  ok(pe.payloadHash(files) !== pe.payloadHash(other),
    'PACK: payloadHash ignored a one-byte change — it cannot detect drift');
}

export async function runAll() {
  problems.length = 0;
  parityGuard();
  hostileGuard();
  await shapeGuard();
  requestGuard();
  await shellGuard();
  await clampGuard();
  await deployGuard();
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
  /* Printed on every run, deliberately. A headroom number nobody sees is a
     number nobody notices tightening. */
  for (const line of clampGuard.report || []) console.log(`  clamp headroom: ${line}`);
  console.log(`  fixture: ${MONSTER} · ${SPAN_MS / 3600000}h · tick ${s.tickMs}ms · ` +
    `${s.summary.ticks} ticks · ${s.summary.kills} kills · ${s.summary.crits} crits · ` +
    `${s.summary.gold}g · ${Object.keys(s.summary.xp).length} skills · ` +
    `${s.summary.segments.length} UTC segments`);
}
