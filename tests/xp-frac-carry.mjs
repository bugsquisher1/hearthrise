#!/usr/bin/env node
// ============================================================================
// tests/xp-frac-carry.mjs — FRACTIONAL XP IS CARRIED, NEVER FLOORED AWAY.
//
//   node tests/xp-frac-carry.mjs            the guard (pure JS, ~10 s)
//   node tests/xp-frac-carry.mjs --mutate   every mutant must turn its arm red
//                                           (JS mutants in a COPY of src/ and the
//                                           function dir; SQL mutants on a
//                                           replayed chain, ~3 min)
//
// THE RULING (game-designer, 2026-10-07, final). grantXp floored every grant, and
// on dealt-damage XP (b565) an 8-HP kill pays ~10 XP a skill, so Trophy rung 2
// (+2%) paid NOTHING against any monster of 12 HP or less: floor(10.6 x 1.02) =
// 10. Now a per-skill remainder in [0,1) is server state (player_skills.xp_frac,
// supabase/migrations/2026-10-09-xp-frac-carry.sql), every multiplier is applied
// to the exact value once, the credit is floor(remainder + grant), and the rest
// is carried. No RNG.
//
// THE ARMS
//   X1  BATCHING CANNOT MOVE A UNIT. N grants credited one by one, and the same
//       N grants credited in chunks with the remainder round-tripped through the
//       projection between chunks (numeric(.,6) -> JSON -> Number), both credit
//       exactly floor((remainder0 + sum of grants) / 1e-6 units), computed
//       independently of grantXp.
//   X2  +2% PAYS ON THE WEAKEST MONSTER. 100 kills of the slime (8 HP), a maxed
//       hitter: Trophy rung 2 pays, per skill, at least floor(2% of the bare XP).
//   X3  AWAY-1 PARITY, XP AND REMAINDER. The same seeded fight priced by the
//       ATTENDED loop (simulateTick per swing, grantXp per grant, the remainder
//       carried in the state by identity, the client's live-tick loop driven
//       through the server's own grant), by AWAY
//       (computeAccrual, one span) and by the WORLD TICK (tick-shadow shadowTick
//       through the same engine, the delta folded as tick-contract folds it):
//       identical XP and identical remainders. Then a CHAINED world tick against
//       the accrue path chained through a simulated hr_apply + hr_state_of round
//       trip, window by window: identical XP and remainders throughout.
//   X4  DRAWS ARE UNCHANGED. The seeded hit/drop draw sequence of a fight is
//       byte-identical whatever the XP sink does (carry, per-grant floor, none),
//       AND equal to the digest measured on the pre-change engine (set/b565,
//       3ea45544) — the carry consumes no draw.
//   X7  THE NO-RESCALE RULING (c), 2026-10-08: constants 4 / 1.33 / 0.39 pinned;
//       1.33 per 1-damage hit; 100 x 1.33 -> 51 r 0.87; 100 x 10.6 at +2% -> 1081
//       (floor: 1000); 1 x N == N x 1; maxed goblin night 422,802 (old 361,187);
//       L1 Controlled slime 8 x 1 h 1,024 (old 1,362, ratio 0.75, accepted).
//   X5  CLAMPED AND SERVER-ONLY. A projected remainder outside [0,1) is clamped
//       (a 900 cannot mint); the envelope reads it ONLY off skills.<id>.frac; the
//       client residue does not carry it.
//
// THE MUTANTS (--mutate)
//   JS  floor-before-multiplier -> X1 · frac-not-carried -> X1 · frac-unclamped
//       -> X5 · frac-client-writable (residue) -> X5 · tick-chain-drops-frac -> X3
//   SQL frac-client-writable (grant update) · frac-unclamped (range refusal gone)
//       · check-gone — each must stop the migration's own §4 self-check.
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const OWN_SQL = '2026-10-09-xp-frac-carry.sql';

/* THE PRE-CHANGE DRAW DIGEST (X4), measured ONCE on set/b565 3ea45544 — the
   engine before this ruling — by running `drawDigest` below against that tree
   (git archive of src/ + supabase/functions/hr-accrue). Pinned, never banded,
   like SEEDED_ORE in tests/accrual-engine.mjs: a content change that moves the
   slime fight re-measures it deliberately. */
const PRE_CHANGE_DRAWS = { n: 3976, hash: '357d0542', kills: 588,
  items: '{"bones":184,"slime_gel":542,"sticky_core":17}' };
/* AND A LEVELLING HERO (every combat skill at 5, 30 minutes): the DRAW STREAM is
   pinned (count + hash), the outcomes deliberately are not. Measured on both
   trees: the same 2,360 draws, but 131 -> 130 kills — the carry pays the XP the
   floor used to eat, a level arrives at a different swing, and the same number
   rolled against a different accuracy is a different hit. That is XP moving a
   level, never XP moving a draw. */
const PRE_CHANGE_DRAWS_L5 = { n: 2360, hash: '5d791d1f' };

const JS_MUTANTS = [
  { name: 'floor before multiplier', arm: 'X1', file: 'src/core/progression.js',
    edits: [['  const raw = base * (1 + perk + combat);', '  const raw = Math.floor(base) * (1 + perk + combat);']] },
  { name: 'frac not carried', arm: 'X1', file: 'src/core/progression.js',
    edits: [['    state.xpFrac[skillId] = (total - whole * XP_FRAC_SCALE) / XP_FRAC_SCALE;', '    state.xpFrac[skillId] = 0;']] },
  { name: 'frac unclamped', arm: 'X5', file: 'src/core/progression.js',
    edits: [['  if (!Number.isFinite(n) || n <= 0) return 0;\n  return Math.min(XP_FRAC_SCALE - 1, Math.round(n * XP_FRAC_SCALE));',
      '  if (!Number.isFinite(n)) return 0;\n  return Math.round(n * XP_FRAC_SCALE);']] },
  { name: 'frac client-writable (residue)', arm: 'X5', file: 'src/net/client-state.js',
    edits: [["export const RESIDUE_FIELDS = Object.freeze([\n", "export const RESIDUE_FIELDS = Object.freeze([\n  '_xpFrac',\n"]] },
  { name: 'PACE.xp rescaled', arm: 'X7', file: 'src/core/pacing.js',
    edits: [['export const PACE = { xp: 0.39,', 'export const PACE = { xp: 0.34,']] },
  { name: 'HIT_HP_XP_PER_DAMAGE rescaled', arm: 'X7', file: 'src/core/styles.js',
    edits: [['export const HIT_HP_XP_PER_DAMAGE = 1.33;', 'export const HIT_HP_XP_PER_DAMAGE = 1.15;']] },
  { name: 'hitpoints route floored again', arm: 'X7', file: 'src/core/styles.js',
    edits: [["  out.push({ skill: 'hitpoints', amount: dmg * HIT_HP_XP_PER_DAMAGE });", "  out.push({ skill: 'hitpoints', amount: Math.floor(dmg * HIT_HP_XP_PER_DAMAGE) });"]] },
  /* Security 2026-10-08 #2: a grant the live credit already paid must not move the remainder. */
  { name: 'paid grant moves the remainder', arm: 'X8', file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [['      if (curAtMs < xpEligibleFromMs && state.xpFrac) {\n', '      if (false) {\n']] },
  { name: 'tick chain drops the remainder', arm: 'X3', file: 'supabase/functions/hr-accrue/tick-shadow.js',
    edits: [['    char.xpFrac = Object.assign({}, char.xpFrac, d.xp_frac);\n', '']] },
];

const SQL_MUTANTS = [
  { name: 'frac client-writable (grant update to authenticated)', expect: /self-check \(b\)/,
    from: "comment on column public.player_skills.xp_frac is",
    to: "grant update (xp_frac) on public.player_skills to authenticated;\ncomment on column public.player_skills.xp_frac is" },
  { name: 'frac unclamped (range refusal gone)', expect: /self-check \(f\)/,
    from: "           or (p_delta->'xp_frac'->>k)::numeric < 0 or (p_delta->'xp_frac'->>k)::numeric >= 1 then",
    to: "           or false then" },
  /* Security 2026-10-08 #1: the upsert must OVERWRITE; an additive one mints. */
  { name: 'additive upsert (xp_frac accumulates)', expect: /self-check \(h\)/,
    from: "          do update set xp_frac = excluded.xp_frac;",
    to: "          do update set xp_frac = least(0.999999, player_skills.xp_frac + excluded.xp_frac);" },
  { name: 'the [0,1) CHECK gone', expect: /self-check \(a\)/,
    from: "      add constraint player_skills_xp_frac_range_ck check (xp_frac >= 0 and xp_frac < 1);",
    to: "      add constraint player_skills_xp_frac_range_ck check (xp_frac >= 0 and xp_frac < 900) not valid;" },
];

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [prog, acc, cmb, sim, rng, env, shadow, contract, monsters, items, xp, styles] = await Promise.all([
    at('src/core/progression.js'), at('supabase/functions/hr-accrue/accrual.js'),
    at('src/core/combat.js'), at('src/core/combat-sim.js'), at('src/core/rng.js'),
    at('supabase/functions/hr-accrue/envelope.js'), at('supabase/functions/hr-accrue/tick-shadow.js'),
    at('supabase/functions/hr-accrue/tick-contract.js'), at('src/data/monsters.js'), at('src/data/items.js'),
    at('src/core/xp.js'), at('src/core/styles.js'),
  ]);
  const pacing = await at('src/core/pacing.js');
  const residueSrc = await readFile(join(base, 'src', 'net', 'client-state.js'), 'utf8');
  return { prog, acc, cmb, sim, rng, env, shadow, contract, MONSTERS: monsters.MONSTERS, ITEMS: items.ITEMS,
    xp, styles, pacing, residueSrc };
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-xpfrac-'));
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, m.file);
  let src = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of m.edits) {
    if (src.split(from).length !== 2) {
      console.error(`--mutate ${m.name}: marker not exactly once in ${m.file} — "${from.slice(0, 80)}"`);
      process.exit(2);
    }
    src = src.replace(from, () => to);
  }
  await writeFile(path, src, 'utf8');
  return base;
}

// ── FIXTURES ────────────────────────────────────────────────────────────────
const SCALE = 1000000;
const FROM = Date.UTC(2026, 2, 15, 0, 0, 0);
const SEED = 0x5eed1234;
const UID = '00000000-0000-4000-8000-0000000f7ac1';
const F0 = { attack: 0.7, strength: 0.3, defense: 0.123456, hitpoints: 0.999999 };
const RUNG2 = { ok: true, plots: {}, propertyTier: 0, rooms: { trophy: 2 } };

function maxed(L) {
  const x = L.xp.xpForLevel(99);
  return { attack: x, strength: x, defense: x, hitpoints: x };
}

/* The accrue-path input for a combat span — the shape engineInputsFromEnvelope
   produces, with the catalogues every call site names. */
function combatInput(L, { fromMs, toMs, skills, xpFrac, perks, seed, monster }) {
  return {
    userId: UID, slot: 0, nowMs: toMs, accruedToMs: fromMs, activeSinceMs: FROM,
    activeKind: 'combat', activeId: monster || 'slime', capMs: 12 * 3600000, seed: seed ?? SEED,
    hp: 990, maxHp: 990, gold: 0, skills: { ...skills }, xpFrac: xpFrac === null ? null : { ...xpFrac },
    equipment: {}, inventory: {}, perks: perks || null,
    items: L.ITEMS, monsters: L.MONSTERS, nodes: {},
  };
}

/* The ATTENDED context: the pieces computeAccrual derives for a bare character,
   built here from the same exported core functions, so the attended column is
   an independent second construction of the same fight. */
function attendedCtx(L, { skills, perks, rng, xpState, onGrant }) {
  const { cmb, acc, styles, MONSTERS, ITEMS } = L;
  const eq = cmb.equipmentStats({}, ITEMS, {});
  const setBonus = cmb.armorSetBonus({}, ITEMS);
  const profile = acc.deriveProfile(eq.weaponType);
  const style = styles.resolveStyle(eq.weaponType, styles.normaliseStyleKeys({}));
  const bonus = acc.bonusFor(perks || null, null);
  return {
    tickMs: acc.deriveTickMs({}, ITEMS, style),
    ctx: {
      away: true, monsters: MONSTERS, items: ITEMS, bonus, style, rng,
      playerRolls: (m) => cmb.playerCombatRolls(m, { eq, equipment: {}, items: ITEMS, skills: xpState.skills, bonus, setBonus, profile, style, charms: undefined, trophies: undefined, monsterId: 'slime' }),
      monsterRolls: (m) => cmb.monsterCombatRolls(m, { eq, skills: xpState.skills, bonus }),
      weakness: (m, id) => cmb.weaknessInfo(m, eq, undefined, undefined, id),
      botd: { killBonuses: () => ({ xpMult: 1, dropMult: 1, goldMult: 1 }) },
      fx: {
        addXp(skill, amt) {
          const r = L.prog.grantXp(xpState, skill, amt, { bonus, xpB: eq.xpB || 0, restedQuantum: 0, authored: false });
          if (onGrant) onGrant(skill, amt, r);
        },
        addItem() {}, mark() {},
      },
    },
  };
}

function units(v) { return Math.round(Number(v) * SCALE); }
/* THE COLUMN'S ROUND TRIP, done the way Postgres does it: the delta's JSON TEXT
   is parsed as an exact decimal, `trunc(.., 6)` cuts it, and hr_state_of emits
   that decimal back as a JSON number. Done on the STRING, never by multiplying
   the binary double (which is not what numeric does and loses units). */
function trunc6(v) {
  const s = JSON.stringify(v);
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`a remainder serialised as ${s} — not a plain decimal numeric would parse the same way`);
  return Number(`${m[1]}.${(m[2] || '0').slice(0, 6)}`);
}

// ── THE ARMS ────────────────────────────────────────────────────────────────
async function runArms(L) {
  const fails = [];
  const ok = (arm, c, msg) => { if (!c) fails.push(`${arm}: ${msg}`); };

  // X1 ─ batching cannot move a unit.
  {
    const r = L.rng.createRng(0xf7ac);
    const perkB = (k) => (k === 'combatXP' ? 0.02 : k === 'allXP' ? 0.05 : 0);
    const grants = [];
    for (let i = 0; i < 4000; i++) {
      const skill = ['attack', 'hitpoints', 'mining'][r.int(0, 2)];
      grants.push({ skill, amt: r.int(1, 40) * (0.25 + r.next()) });
    }
    /* THE INDEPENDENT EXPECTATION: integer units, summed with BigInt, one floor.
       pacedXp and the additive perk block are the only inputs; nothing of
       grantXp's carry is reused. */
    const sumU = {};
    for (const g of grants) {
      const mult = 1 + perkB('allXP') + (L.prog.COMBAT_XP_SKILLS.includes(g.skill) ? perkB('combatXP') : 0);
      const raw = L.pacing.pacedXp(g.skill, g.amt) * mult;
      sumU[g.skill] = (sumU[g.skill] || 0n) + BigInt(Math.round(raw * SCALE));
    }
    const f0 = { attack: 0.5, hitpoints: 0.999999 };
    const expect = {};
    for (const k of Object.keys(sumU)) {
      const tot = BigInt(units(f0[k] || 0)) + sumU[k];
      expect[k] = Number(tot / BigInt(SCALE));
      expect[`${k}.frac`] = Number(tot % BigInt(SCALE));
    }
    const ctx = { bonus: perkB, restedQuantum: 0 };
    // per grant
    const a = { skills: {}, xpFrac: { ...f0 } };
    for (const g of grants) L.prog.grantXp(a, g.skill, g.amt, ctx);
    // batched, the remainder round-tripped through the projection between chunks
    let b = { skills: {}, xpFrac: L.prog.normaliseXpFrac(JSON.parse(JSON.stringify(f0))) };
    let i = 0; let chunk = 1;
    const credited = {};
    while (i < grants.length) {
      for (const g of grants.slice(i, i + chunk)) L.prog.grantXp(b, g.skill, g.amt, ctx);
      i += chunk; chunk = (chunk * 7) % 97 + 1;
      for (const k of Object.keys(b.skills)) credited[k] = (credited[k] || 0) + b.skills[k];
      const wire = JSON.parse(JSON.stringify(Object.fromEntries(
        Object.entries(b.xpFrac).map(([k, v]) => {
          /* THE COLUMN'S trunc MUST BE A NO-OP on what the engine emits, or the
             row would silently lose units the engine carried. */
          ok('X1', trunc6(v) === v, `${k}: the engine emitted a remainder ${JSON.stringify(v)} with more than 6 places`);
          return [k, trunc6(v)];
        }))));
      b = { skills: {}, xpFrac: L.prog.normaliseXpFrac(wire) };
    }
    for (const k of Object.keys(sumU)) {
      ok('X1', a.skills[k] === expect[k],
        `${k}: per-grant credit ${a.skills[k]} != floor(remainder0 + sum) ${expect[k]} — a unit was lost or minted`);
      ok('X1', credited[k] === expect[k],
        `${k}: batched credit ${credited[k]} != ${expect[k]} — the projection round trip moved a unit`);
      ok('X1', units(a.xpFrac[k]) === expect[`${k}.frac`],
        `${k}: carried remainder ${units(a.xpFrac[k])} units != ${expect[`${k}.frac`]}`);
      ok('X1', units(b.xpFrac[k] || 0) === expect[`${k}.frac`],
        `${k}: batched remainder ${units(b.xpFrac[k] || 0)} units != ${expect[`${k}.frac`]}`);
    }
  }

  // X2 ─ +2% pays on the weakest monster, over 100 kills.
  {
    const m = L.MONSTERS.slime;
    ok('X2', m && m.hp === 8, `the slime is not the 8-HP monster this arm is about (${m && m.hp})`);
    const run = (perks) => {
      const skills = maxed(L);
      const xs = { skills: { ...skills }, xpFrac: {} };
      const { ctx } = attendedCtx(L, { skills, perks, rng: L.rng.createRng(SEED), xpState: xs });
      const st = { activeMonster: 'slime', monsterHp: 8, monsterMaxHp: 8, playerHp: 990, playerMaxHp: 990,
        stats: {}, inventory: {}, skills, deathsTodayBefore: 0, deathsLifetimeBefore: 0, consecFalls: 0, recoveringUntilMs: 0 };
      let kills = 0;
      for (let i = 0; i < 100000 && kills < 100; i++) {
        const r = L.sim.simulateTick(st, ctx);
        if (r.outcome === 'kill') kills++;
        if (r.outcome === 'death' || r.outcome === 'stop') break;
      }
      const gained = {};
      for (const k of Object.keys(xs.skills)) gained[k] = xs.skills[k] - (skills[k] || 0);
      return { kills, gained };
    };
    const bare = run(null);
    const rung2 = run(RUNG2);
    ok('X2', bare.kills === 100 && rung2.kills === 100, `the fixtures ran ${bare.kills}/${rung2.kills} kills, not 100`);
    let tested = 0;
    for (const k of Object.keys(bare.gained)) {
      const need = Math.floor(0.02 * bare.gained[k]);
      if (need > 0) tested++;
      ok('X2', rung2.gained[k] - bare.gained[k] >= need,
        `${k}: +2% paid ${rung2.gained[k] - bare.gained[k]} extra over 100 slime kills (bare ${bare.gained[k]}), `
        + `under floor(2%) = ${need} — the multiplier is being floored away per grant`);
    }
    ok('X2', tested >= 2, `only ${tested} skill(s) earned 50+ XP over 100 kills — the bound tests nothing`);
  }

  // X3 ─ AWAY-1 parity, XP and remainder: attended == away == world tick.
  {
    const SPAN = 3600000;
    const skills = maxed(L);
    const away = L.acc.computeAccrual(combatInput(L, { fromMs: FROM, toMs: FROM + SPAN, skills, xpFrac: F0, perks: RUNG2 }));
    ok('X3', away.accrued === true && !away.summary.died, `the away span did not run clean (${away.reason})`);
    const awayXp = (away.delta && away.delta.xp) || {};
    const awayFrac = Object.assign({}, F0, (away.delta && away.delta.xp_frac) || {});

    // ATTENDED: the live loop, grant by grant, remainder carried by identity.
    const xs = { skills: { ...skills }, xpFrac: { ...F0 } };
    const { ctx, tickMs } = attendedCtx(L, { skills, perks: RUNG2, rng: L.rng.createRng(SEED), xpState: xs });
    const st = { activeMonster: 'slime', monsterHp: 0, monsterMaxHp: 0, playerHp: 990, playerMaxHp: 990,
      stats: {}, inventory: {}, skills, deathsTodayBefore: 0, deathsLifetimeBefore: 0, consecFalls: 0, recoveringUntilMs: 0 };
    st.monsterMaxHp = L.MONSTERS.slime.hp; st.monsterHp = st.monsterMaxHp;
    let kills = 0;
    for (let i = 0; i < Math.floor(SPAN / tickMs); i++) {
      const r = L.sim.simulateTick(st, ctx);
      if (r.outcome === 'kill') kills++;
    }
    const attXp = {};
    for (const k of Object.keys(xs.skills)) { const g = xs.skills[k] - (skills[k] || 0); if (g > 0) attXp[k] = g; }
    ok('X3', kills === away.summary.kills, `ATTENDED ran ${kills} kills, AWAY ${away.summary.kills} — not the same fight`);
    ok('X3', JSON.stringify(sortKeys(attXp)) === JSON.stringify(sortKeys(awayXp)),
      `ATTENDED XP ${JSON.stringify(sortKeys(attXp))} != AWAY ${JSON.stringify(sortKeys(awayXp))}`);
    for (const k of Object.keys(F0)) {
      ok('X3', units(xs.xpFrac[k]) === units(awayFrac[k]),
        `${k}: ATTENDED remainder ${xs.xpFrac[k]} != AWAY ${awayFrac[k]}`);
    }

    // WORLD TICK, the same fight: one window through shadowTick, seed pinned to the span's.
    const char = L.shadow.hydrate({ ...combatInput(L, { fromMs: FROM, toMs: FROM + SPAN, skills, xpFrac: F0, perks: RUNG2 }),
      items: undefined, monsters: undefined, nodes: undefined });
    char.xpFrac = { ...F0 };
    const cats = { items: L.ITEMS, monsters: L.MONSTERS, nodes: {} };
    const tick1 = L.shadow.shadowTick(char, FROM, FROM + SPAN, cats, { seedOf: () => SEED });
    ok('X3', tick1.accrued === true, `the world-tick window did not accrue (${tick1.reason})`);
    const folded = L.contract.foldDeltas([tick1.delta]);
    ok('X3', JSON.stringify(sortKeys(folded.xp || {})) === JSON.stringify(sortKeys(awayXp)),
      `WORLD TICK XP ${JSON.stringify(sortKeys(folded.xp || {}))} != AWAY ${JSON.stringify(sortKeys(awayXp))}`);
    ok('X3', JSON.stringify(sortKeys(folded.xp_frac || {})) === JSON.stringify(sortKeys((away.delta && away.delta.xp_frac) || {})),
      `WORLD TICK xp_frac ${JSON.stringify(folded.xp_frac)} != AWAY ${JSON.stringify(away.delta && away.delta.xp_frac)}`);

    // THE CHAIN: ten windows. The world tick carries the remainder in memory
    // (advance); the accrue path carries it through hr_apply + hr_state_of,
    // simulated with the column's own arithmetic (trunc to 6 places, numeric ->
    // JSON number). Same windows, same per-window seeds: identical throughout.
    const W = 10; const step = SPAN / W;
    const tc = L.shadow.hydrate({ ...combatInput(L, { fromMs: FROM, toMs: FROM + step, skills, xpFrac: F0, perks: RUNG2 }),
      items: undefined, monsters: undefined, nodes: undefined });
    tc.xpFrac = { ...F0 };
    const db = { skills: { ...skills }, frac: { ...F0 }, fight: null, hp: 990 };
    const tickDeltas = [];
    let mark = FROM;
    for (let w = 0; w < W; w++) {
      const to = FROM + (w + 1) * step;
      const seed = L.shadow.seedFor(UID, 0, mark);
      const t = L.shadow.shadowTick(tc, mark, to, cats, { seedOf: () => seed });
      // the accrue path, re-hydrated from the "row" every window
      const env = { state: { accrued_to: new Date(mark).toISOString(), active_since: new Date(FROM).toISOString(),
        active_kind: 'combat', active_id: 'slime', hp: db.hp, max_hp: 990, gold: 0, fight: db.fight },
        skills: Object.fromEntries(Object.keys(db.skills).map((k) => [k, { xp: db.skills[k], level: 99, frac: db.frac[k] || 0 }])) };
      const a = L.acc.computeAccrual({ userId: UID, slot: 0, nowMs: to, capMs: 12 * 3600000, seed, perks: RUNG2,
        items: L.ITEMS, monsters: L.MONSTERS, nodes: {}, ...L.env.engineInputsFromEnvelope(env, to),
        accruedToMs: mark, activeSinceMs: FROM });
      ok('X3', t.accrued === true && a.accrued === true, `window ${w}: tick ${t.reason} / accrue ${a.reason}`);
      if (!t.accrued || !a.accrued) break;
      ok('X3', JSON.stringify(sortKeys(t.delta.xp || {})) === JSON.stringify(sortKeys(a.delta.xp || {})),
        `window ${w}: WORLD TICK xp ${JSON.stringify(t.delta.xp)} != ACCRUE ${JSON.stringify(a.delta.xp)}`);
      ok('X3', JSON.stringify(sortKeys(t.delta.xp_frac || {})) === JSON.stringify(sortKeys(a.delta.xp_frac || {})),
        `window ${w}: WORLD TICK xp_frac ${JSON.stringify(t.delta.xp_frac)} != ACCRUE ${JSON.stringify(a.delta.xp_frac)} `
        + '— the remainder diverged across the seam');
      tickDeltas.push(t.delta);
      L.shadow.advance(tc, t);
      // hr_apply, for the keys this arm reads
      for (const k of Object.keys(a.delta.xp || {})) db.skills[k] = (db.skills[k] || 0) + a.delta.xp[k];
      for (const k of Object.keys(a.delta.xp_frac || {})) db.frac[k] = Number(JSON.parse(JSON.stringify(trunc6(a.delta.xp_frac[k]))));
      if (typeof a.delta.hp === 'number') db.hp = a.delta.hp;
      if ('fight' in a.delta) db.fight = a.delta.fight;
      mark = Date.parse(t.delta.accrued_to);
    }
    const fold = L.contract.foldDeltas(tickDeltas);
    for (const k of Object.keys(F0)) {
      const last = (fold.xp_frac && k in fold.xp_frac) ? fold.xp_frac[k] : F0[k];
      ok('X3', units(last) === units(db.frac[k]) && units(tc.xpFrac[k]) === units(db.frac[k]),
        `${k}: the folded tick remainder ${last} / carried ${tc.xpFrac[k]} != the accrue row's ${db.frac[k]}`);
    }
  }

  // X4 ─ draws are unchanged.
  {
    const d1 = drawDigest(L, 'carry');
    const d2 = drawDigest(L, 'floor');
    const d3 = drawDigest(L, 'none');
    ok('X4', d1.hash === d2.hash && d1.hash === d3.hash && d1.n === d2.n && d1.n === d3.n,
      `the draw sequence depends on the XP sink: carry ${d1.n}/${d1.hash}, floor ${d2.n}/${d2.hash}, none ${d3.n}/${d3.hash}`);
    ok('X4', d1.n === PRE_CHANGE_DRAWS.n && d1.hash === PRE_CHANGE_DRAWS.hash
      && d1.kills === PRE_CHANGE_DRAWS.kills && d1.items === PRE_CHANGE_DRAWS.items,
      `the seeded fight drew ${d1.n} numbers (${d1.hash}), ${d1.kills} kills, items ${d1.items}; the pre-change engine `
      + `drew ${PRE_CHANGE_DRAWS.n} (${PRE_CHANGE_DRAWS.hash}), ${PRE_CHANGE_DRAWS.kills} kills, items ${PRE_CHANGE_DRAWS.items}`);
    const d5 = drawDigest(L, 'carry', 5);
    ok('X4', d5.n === PRE_CHANGE_DRAWS_L5.n && d5.hash === PRE_CHANGE_DRAWS_L5.hash,
      `a levelling hero's fight drew ${d5.n} numbers (${d5.hash}); the pre-change engine drew `
      + `${PRE_CHANGE_DRAWS_L5.n} (${PRE_CHANGE_DRAWS_L5.hash}) — the carry consumed or skipped a draw`);
  }

  // X5 ─ clamped and server-only.
  {
    const n = L.prog.normaliseXpFrac({ attack: 900, strength: 1, defense: -3, magic: 'x', ranged: 0.25 });
    for (const k of Object.keys(n)) ok('X5', n[k] >= 0 && n[k] < 1, `normaliseXpFrac let ${k} = ${n[k]} through`);
    const s = { skills: {}, xpFrac: { attack: 900 } };
    const g = L.prog.grantXp(s, 'attack', 1, {});
    ok('X5', g.gain <= 1 && s.xpFrac.attack >= 0 && s.xpFrac.attack < 1,
      `a projected remainder of 900 paid ${g.gain} on a 0.39 XP grant (carry ${s.xpFrac.attack}) — an unclamped remainder mints`);
    const e1 = L.env.engineInputsFromEnvelope({ state: { xp_frac: { attack: 0.5 } }, xpFrac: { attack: 0.5 },
      skills: { attack: { xp: 5, level: 1 } } }, FROM);
    ok('X5', e1.xpFrac === null, `the engine took a remainder from somewhere other than skills.<id>.frac: ${JSON.stringify(e1.xpFrac)}`);
    const e2 = L.env.engineInputsFromEnvelope({ state: {}, skills: { attack: { xp: 5, level: 1, frac: 0.25 } } }, FROM);
    ok('X5', e2.xpFrac && e2.xpFrac.attack === 0.25, `the projected frac did not reach the engine: ${JSON.stringify(e2.xpFrac)}`);
    const block = L.residueSrc.split('export const RESIDUE_FIELDS = Object.freeze([')[1] || '';
    const fields = (block.split(']);')[0].match(/^\s*'([^']+)'/gm) || []).map((x) => x.trim().slice(1, -1));
    ok('X5', fields.length > 0, 'could not read RESIDUE_FIELDS — the residue arm asserts nothing');
    ok('X5', !fields.some((f) => /frac/i.test(f) || f === 'skills'),
      `the client residue carries ${fields.filter((f) => /frac/i.test(f) || f === 'skills')} — the remainder must be server-only`);
  }
  // X7 ─ THE DESIGNER'S RULING (c), 2026-10-08: ship the carry, NO rescale.
  {
    const C = L.styles; const P = L.pacing.PACE;
    // (1) the three constants are unchanged
    ok('X7', C.HIT_XP_PER_DAMAGE === 4 && C.HIT_HP_XP_PER_DAMAGE === 1.33 && P.xp === 0.39,
      `(1) the ruling forbids a rescale: HIT_XP_PER_DAMAGE ${C.HIT_XP_PER_DAMAGE}, HIT_HP_XP_PER_DAMAGE `
      + `${C.HIT_HP_XP_PER_DAMAGE}, PACE.xp ${P.xp} (want 4 / 1.33 / 0.39)`);
    // (2) a 1-damage hit pays exactly 1.33 hitpoints XP into the grant, any style
    for (const st of [null, C.COMBAT_STYLES.sword.controlled, C.COMBAT_STYLES.sword.aggressive]) {
      const hp = C.hitXpRoute(st, 1).find((g) => g.skill === 'hitpoints');
      ok('X7', hp && hp.amount === 1.33, `(2) hitXpRoute(${st ? st.name : 'null'}, 1) hitpoints = ${hp && hp.amount}, want 1.33 exactly`);
    }
    // (3) 100 x 1.33 hitpoints XP, carried: 100 x 0.5187 = 51.87
    const s3 = { skills: {}, xpFrac: {} };
    for (let i = 0; i < 100; i++) L.prog.grantXp(s3, 'hitpoints', 1.33, {});
    ok('X7', s3.skills.hitpoints === 51 && units(s3.xpFrac.hitpoints) === 870000,
      `(3) 100 x grantXp('hitpoints', 1.33) credited ${s3.skills.hitpoints} carry ${s3.xpFrac.hitpoints} (want 51 / 0.87)`);
    // (4) 100 grants of 10.6 at +2%: 1081 carried; the per-grant floor paid 1000
    const plus2 = (k) => (k === 'combatXP' ? 0.02 : 0);
    const s4 = { skills: {}, xpFrac: {} };
    const s4old = { skills: {} };
    for (let i = 0; i < 100; i++) {
      L.prog.grantXp(s4, 'attack', 10.6, { bonus: plus2, authored: true });
      L.prog.grantXp(s4old, 'attack', 10.6, { bonus: plus2, authored: true });
    }
    ok('X7', s4.skills.attack === 1081 && s4old.skills.attack === 1000,
      `(4) 100 x 10.6 at +2% credited ${s4.skills.attack} carried (want 1081) and ${s4old.skills.attack} floored (want 1000)`);
    // (5) 1 x N == N x 1 to the unit (the authored path, so the sum is exact)
    const one = { skills: {}, xpFrac: {} };
    L.prog.grantXp(one, 'attack', 10.6 * 100, { bonus: plus2, authored: true });
    ok('X7', one.skills.attack === s4.skills.attack && units(one.xpFrac.attack) === units(s4.xpFrac.attack),
      `(5) one grant of 1060 credited ${one.skills.attack} (${one.xpFrac.attack}), 100 of 10.6 credited `
      + `${s4.skills.attack} (${s4.xpFrac.attack}) — batching moved a unit`);
    // (6) the seeded maxed goblin night (the P9 fixture), and new/old
    const x99 = L.xp.xpForLevel(99);
    const sumXp = (r) => Object.values((r.delta && r.delta.xp) || {}).reduce((a, b) => a + b, 0);
    const night = sumXp(L.acc.computeAccrual({
      userId: '00000000-0000-4000-8000-00000000b349', slot: 0,
      nowMs: Date.UTC(2026, 2, 15, 12), accruedToMs: Date.UTC(2026, 2, 15), activeSinceMs: Date.UTC(2026, 2, 15),
      activeKind: 'combat', activeId: 'goblin', capMs: 12 * 3600000, seed: 0x5eed1234,
      hp: 990, maxHp: 990, gold: 0, skills: { attack: x99, strength: x99, defense: x99, hitpoints: x99 },
      equipment: {}, inventory: {}, items: L.ITEMS, monsters: L.MONSTERS, nodes: {}, xpFrac: {}, perks: null }));
    const r6 = night / OLD_GOBLIN_NIGHT;
    ok('X7', night === 422802 && r6 >= 1.15 && r6 <= 1.19,
      `(6) the maxed goblin night paid ${night} XP (want 422,802), new/old ${r6.toFixed(4)} (want [1.15, 1.19])`);
    // (7) a level-1 Controlled hero (bare hands -> sword default) vs the slime,
    //     8 seeded 1 h spans: the carry pays LESS than max(1, ...) did, accepted.
    let l1 = 0;
    for (let s = 1; s <= 8; s++) {
      l1 += sumXp(L.acc.computeAccrual({
        userId: '00000000-0000-4000-8000-0000000f7ac2', slot: 0,
        nowMs: Date.UTC(2026, 2, 15, 1), accruedToMs: Date.UTC(2026, 2, 15), activeSinceMs: Date.UTC(2026, 2, 15),
        activeKind: 'combat', activeId: 'slime', capMs: 12 * 3600000, seed: 0x5eed1234 + s,
        hp: 10, maxHp: 10, gold: 0, skills: {}, equipment: {}, inventory: {},
        items: L.ITEMS, monsters: L.MONSTERS, nodes: {}, xpFrac: {}, perks: null,
        deathsTodayBefore: 0, deathsLifetimeBefore: 5 }));
    }
    const r7 = l1 / OLD_L1_SLIME;
    ok('X7', l1 === 1024 && r7 >= 0.70 && r7 <= 0.82,
      `(7) the level-1 Controlled slime hour paid ${l1} XP over 8 seeds (pinned 1,024), new/old ${r7.toFixed(4)} `
      + '(want [0.70, 0.82], accepted: the old max(1, ...) overpaid 1-2 damage hits split three ways)');
  }
  // X8 ─ A WINDOW THE LIVE CREDIT ALREADY PAID WRITES NO REMAINDER (Security
  //      2026-10-08 #2). hr_credit_combat_xp advanced combat_xp_accrued_to to the
  //      window's end, so every grant in it is another channel's; the settle must
  //      propose neither XP nor an xp_frac out of those fights.
  {
    const SPAN = 3600000;
    const skills = maxed(L);
    const paid = L.acc.computeAccrual({ ...combatInput(L, { fromMs: FROM, toMs: FROM + SPAN, skills, xpFrac: F0, perks: RUNG2 }),
      combatXpAccruedToMs: FROM + SPAN });
    ok('X8', paid.accrued === true && paid.summary.kills > 0, `the paid window did not run a fight (${paid.reason})`);
    ok('X8', !('xp_frac' in (paid.delta || {})) && !('xp' in (paid.delta || {})),
      `a window fully paid by hr_credit_combat_xp proposed xp ${JSON.stringify(paid.delta && paid.delta.xp)} and `
      + `xp_frac ${JSON.stringify(paid.delta && paid.delta.xp_frac)} — a remainder from fights another channel paid`);
    const unpaid = L.acc.computeAccrual(combatInput(L, { fromMs: FROM, toMs: FROM + SPAN, skills, xpFrac: F0, perks: RUNG2 }));
    ok('X8', unpaid.delta && unpaid.delta.xp_frac && Object.keys(unpaid.delta.xp_frac).length > 0,
      'CONTROL: the same window unpaid proposes no xp_frac, so the arm above proves nothing');
  }
  return fails;
}

/* THE PRE-CHANGE ENGINE'S ANSWERS for X7 (6) and (7), measured on set/b565
   3ea45544 with the identical fixtures (that engine ignores `xpFrac`). */
const OLD_GOBLIN_NIGHT = 361187;
const OLD_L1_SLIME = 1362;

function sortKeys(m) { const o = {}; for (const k of Object.keys(m).sort()) o[k] = m[k]; return o; }

/* The seeded draw log of a maxed hitter's 30-minute slime fight, under a chosen
   XP sink. FNV-1a over every drawn double's bits, plus the kill count and the
   items rolled — the hit and drop sequences. */
function drawDigest(L, sink, level) {
  const skills = level ? Object.fromEntries(Object.keys(maxed(L)).map((k) => [k, L.xp.xpForLevel(level)])) : maxed(L);
  const base = L.rng.createRng(SEED);
  let h = 0x811c9dc5; let n = 0;
  const buf = new DataView(new ArrayBuffer(8));
  const src = () => {
    const v = base.next(); n++;
    buf.setFloat64(0, v);
    for (let i = 0; i < 8; i++) { h ^= buf.getUint8(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return v;
  };
  const rng = L.rng.rngFrom(src);
  const xs = { skills: { ...skills }, xpFrac: {} };
  const { ctx, tickMs } = attendedCtx(L, { skills, perks: RUNG2, rng, xpState: xs });
  if (sink !== 'carry') {
    ctx.fx.addXp = sink === 'none' ? () => {} : (sk, amt) => {
      xs.skills[sk] = (xs.skills[sk] || 0) + Math.floor(Number(amt) || 0);
    };
  }
  const items = {};
  ctx.fx.addItem = (id, q) => { items[id] = (items[id] || 0) + q; };
  const st = { activeMonster: 'slime', monsterHp: 8, monsterMaxHp: 8, playerHp: 990, playerMaxHp: 990,
    stats: {}, inventory: {}, skills, deathsTodayBefore: 0, deathsLifetimeBefore: 0, consecFalls: 0, recoveringUntilMs: 0 };
  let kills = 0;
  for (let i = 0; i < Math.floor(1800000 / tickMs); i++) if (L.sim.simulateTick(st, ctx).outcome === 'kill') kills++;
  return { n, hash: h.toString(16), kills, items: JSON.stringify(sortKeys(items)) };
}

/* X6 — A SECOND APPLY IS A NO-OP. The chain is replayed (the file's own §4
   self-check runs inside it), then the file is executed AGAIN: both patched
   bodies must be byte-identical, the column and its single CHECK unchanged. A
   double-patch would install the xp_frac block twice — a silent corruption of
   the one function every settle passes through. */
async function secondApply() {
  const fails = [];
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db, failures } = await bootReplay({});
  if (failures && failures.length) {
    return [`X6: the chain does not replay: ${failures.map((f) => `${f.file}: ${String(f.error).split('\n')[0]}`).join('; ')}`];
  }
  const snap = async () => (await db.query(`select
      md5(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure)) a,
      md5(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure)) s,
      (select count(*) from pg_constraint where conrelid = 'public.player_skills'::regclass
         and contype = 'c' and pg_get_constraintdef(oid) like '%xp_frac%')::int c,
      (select string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',')
         from information_schema.columns where table_schema = 'public' and table_name = 'player_skills'
          and column_name = 'xp_frac') col`)).rows[0];
  const before = await snap();
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', OWN_SQL), 'utf8')).replace(/\r\n/g, '\n');
  try { await db.exec(sql); } catch (e) { fails.push(`X6: a second apply RAISED: ${String(e.message).split('\n')[0]}`); }
  const after = await snap();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fails.push(`X6: a second apply changed the schema: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
  if (before.c !== 1 || !before.col) fails.push(`X6: expected one xp_frac CHECK and the column, saw ${JSON.stringify(before)}`);
  try { await db.close(); } catch { /* the replay owns its lifetime */ }
  return fails;
}

async function sqlMutants() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let escaped = 0;
  for (const m of SQL_MUTANTS) {
    let verdict = 'APPLIED';
    try {
      const { failures } = await bootReplay({ patches: new Map([[OWN_SQL, [[m.from, m.to]]]]), upTo: LAST_PATCHED, tolerant: true });
      const f = (failures || []).find((x) => x.file === OWN_SQL);
      if (f) verdict = f.error;
    } catch (e) {
      if (e && e.harness) { console.error(`  harness — ${m.name}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
      verdict = String((e && e.message) || e);
    }
    const caught = verdict !== 'APPLIED' && m.expect.test(verdict);
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  SQL ${m.name}${caught ? '' : ` (${verdict.split('\n')[0].slice(0, 160)})`}`);
    if (!caught) escaped++;
  }
  return escaped;
}

async function main() {
  if (process.argv.includes('--measure-draws')) {
    /* The one-off measurement that pinned PRE_CHANGE_DRAWS: point it at a tree. */
    const at = process.argv[process.argv.indexOf('--measure-draws') + 1];
    const lv = Number(process.argv[process.argv.indexOf('--measure-draws') + 2]) || 0;
    console.log(JSON.stringify(drawDigest(await load(at), 'carry', lv)));
    process.exit(0);
  }
  if (!MUTATE) {
    const fails = await runArms(await load(ROOT));
    fails.push(...await secondApply());
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `xp-frac-carry: RED (${fails.length})`
      : 'xp-frac-carry: green — batching moves no unit, +2% pays on the slime, attended == away == world tick '
        + 'in XP and remainder, the draws are unchanged, the remainder is clamped and server-only');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('xp-frac-carry --mutate');
  let escaped = 0;
  const clean = await runArms(await load(ROOT));
  if (clean.length) { console.error(`  the unmutated tree is RED (${clean[0]}) — a mutant run proves nothing`); process.exit(1); }
  for (const m of JS_MUTANTS) {
    const fails = await runArms(await load(await mutantBase(m)));
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  JS  ${m.name} -> ${m.arm}${caught ? `   ${fails.find((f) => f.startsWith(m.arm)).slice(0, 160)}` : ' stayed green'}`);
    if (!caught) escaped++;
  }
  escaped += await sqlMutants();
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
