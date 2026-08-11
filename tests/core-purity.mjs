// ============================================================
// tests/core-purity.mjs — the DOM-FREE GUARD for src/core/.
//
// Phase 0 of the server-authority program only pays off if the extracted
// simulation genuinely runs outside a browser. "It looks pure" is not a
// proof, and a single `window.` slipped into a helper six months from now
// would break the Edge Function silently — at 3am, in production, on the
// one path nobody tests locally.
//
// So this guard makes two claims, both cheap and both mechanical:
//
//   1. EVERY module under src/core/ imports and evaluates in plain Node,
//      with no globals stubbed. `globalThis.window` and `document` are
//      deleted first, so a module that touches either at load time throws.
//   2. No module's SOURCE mentions a browser/host identifier or a
//      nondeterminism source (Math.random, Date.now, setTimeout…).
//
// Claim 2 catches the lazy reference that claim 1 cannot — a `window.X`
// inside a function body never runs at import time.
//
// Run standalone:  node tests/core-purity.mjs
// It is also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================

import { readdir, readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const CORE_DIR = join(ROOT, 'src', 'core');

/* Banned in src/core. Each entry is [regex, why] — the "why" is what the
   failure prints, because a guard that only says "forbidden" teaches nobody. */
const BANNED = [
  [/\bwindow\b/, 'reads `window` — Deno has no window; pass the value in'],
  [/\bdocument\b/, 'reads `document` — core is DOM-free by contract'],
  [/\blocalStorage\b|\bsessionStorage\b/, 'reads web storage — persistence is the caller\'s job'],
  [/\bnavigator\b/, 'reads `navigator`'],
  [/\bfetch\s*\(/, 'performs I/O — core computes, callers do I/O'],
  [/\bMath\s*\.\s*random\s*\(/, 'calls Math.random — take an rng (src/core/rng.js) instead, or server accrual is not replayable'],
  [/\bDate\s*\.\s*now\s*\(/, 'calls Date.now — take `now` as a parameter, or the client owns the clock'],
  [/\bnew\s+Date\s*\(\s*\)/, 'reads the wall clock — take `now` as a parameter'],
  [/\bset(Timeout|Interval)\s*\(/, 'schedules work — the server has no loop; it computes ticks once'],
  [/\brequestAnimationFrame\b/, 'schedules a frame'],
  [/\bconsole\s*\./, 'logs — core must be silent so a caller can batch a million ticks'],
  [/\balert\s*\(|\bnotify\s*\(/, 'notifies the player — return an event instead (design §4.3)'],
];

/* Strip comments and string literals before scanning, so prose like "no
   window" in a header comment cannot fail the guard and, more importantly,
   so a real `window.G` cannot hide inside one. */
function stripNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === '/' && nx === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    out += ch; i++;
  }
  return out;
}

export async function corePurityGuard() {
  const problems = [];
  let names = [];
  try {
    names = (await readdir(CORE_DIR)).filter((n) => n.endsWith('.js')).sort();
  } catch {
    return ['could not read src/core — the shared simulation core is missing'];
  }
  if (!names.length) return ['src/core is empty — the guard is checking nothing'];

  // ── Claim 2: source scan ──────────────────────────────────────────────
  for (const name of names) {
    const raw = await readFile(join(CORE_DIR, name), 'utf8');
    const code = stripNonCode(raw);
    for (const [re, why] of BANNED) {
      const m = code.match(re);
      if (m) problems.push(`src/core/${name}: ${why} (found \`${m[0].trim()}\`)`);
    }
    /* Every import must stay inside src/core or src/data — reaching into
       src/features or src/legacy.js would drag the browser back in. */
    for (const spec of raw.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const s = spec[1];
      if (!/^\.\/[\w-]+\.js(\?v=\d+)?$/.test(s) && !/^\.\.\/data\/[\w-]+\.js(\?v=\d+)?$/.test(s)) {
        problems.push(`src/core/${name}: imports "${s}" — core may only import ./core siblings or ../data`);
      }
      /* CLAUDE.md cache-buster rule: every ESM import specifier carries ?v= */
      if (!/\?v=\d+/.test(s)) problems.push(`src/core/${name}: import "${s}" has no ?v= cache buster`);
    }
  }

  // ── Claim 1: it actually loads in Node with no browser globals ────────
  const hadWindow = 'window' in globalThis;
  const hadDocument = 'document' in globalThis;
  try {
    delete globalThis.window;
    delete globalThis.document;
    for (const name of names) {
      try {
        const mod = await import(pathToFileURL(join(CORE_DIR, name)).href);
        if (!mod || Object.keys(mod).length === 0) {
          problems.push(`src/core/${name}: imported but exports nothing`);
        }
      } catch (err) {
        problems.push(`src/core/${name}: does not import in plain Node — ${err.message}`);
      }
    }
  } finally {
    if (!hadWindow) delete globalThis.window;
    if (!hadDocument) delete globalThis.document;
  }

  return problems;
}

// ── Behavioural checks that only make sense outside the browser ─────────
// The seeded-PRNG contract is the one new seam Phase 0 introduces, and the
// property that matters (same seed → same stream) cannot be observed from
// inside the game. So it is proved here, where the core is imported directly.
export async function coreDeterminismGuard() {
  const problems = [];
  try {
    const { createRng, hashSeed } = await import(pathToFileURL(join(CORE_DIR, 'rng.js')).href);
    const drawsA = [];
    const drawsB = [];
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 500; i++) { drawsA.push(a.next()); drawsB.push(b.next()); }
    if (drawsA.join(',') !== drawsB.join(',')) problems.push('createRng(seed) is not reproducible — server accrual could not be replayed');

    const c = createRng(12346);
    const drawsC = [];
    for (let i = 0; i < 500; i++) drawsC.push(c.next());
    if (drawsA.join(',') === drawsC.join(',')) problems.push('different seeds produce the same stream');

    if (drawsA.some((n) => !(n >= 0 && n < 1))) problems.push('rng.next() left [0,1)');
    /* A crude uniformity check: 500 draws should not all sit in one half. */
    const lowHalf = drawsA.filter((n) => n < 0.5).length;
    if (lowHalf < 180 || lowHalf > 320) problems.push(`rng.next() looks non-uniform (${lowHalf}/500 below 0.5)`);

    const ints = [];
    const r = createRng(7);
    for (let i = 0; i < 2000; i++) ints.push(r.int(1, 6));
    if (ints.some((n) => n < 1 || n > 6 || n !== Math.floor(n))) problems.push('rng.int(1,6) left its inclusive range');
    if (new Set(ints).size !== 6) problems.push('rng.int(1,6) never produced all six faces');
    if (createRng(9).int(3, 3) !== 3) problems.push('rng.int(n,n) must return n');

    if (hashSeed('a', 'b') !== hashSeed('a', 'b')) problems.push('hashSeed is not stable');
    if (hashSeed('a', 'b') === hashSeed('a', 'c')) problems.push('hashSeed collides on trivially different input');

    /* chance() must honour its two absorbing cases without drawing, so a
       guaranteed drop cannot be missed and an impossible one cannot land. */
    const noDraw = { calls: 0 };
    const { rngFrom } = await import(pathToFileURL(join(CORE_DIR, 'rng.js')).href);
    const counted = rngFrom(() => { noDraw.calls++; return 0.5; });
    if (counted.chance(1) !== true) problems.push('rng.chance(1) must always be true');
    if (counted.chance(0) !== false) problems.push('rng.chance(0) must always be false');
    if (noDraw.calls !== 0) problems.push('rng.chance(0|1) consumed a draw — that desynchronises a replay');
  } catch (err) {
    problems.push('determinism guard failed to run — ' + err.message);
  }
  return problems;
}

// ── The equivalence checks the in-page suite cannot make ────────────────
// These assert that the extracted maths still produces the numbers the game
// was tuned around. They are anchors, not a re-derivation: if someone
// "simplifies" the XP curve or the pacing dial, this fails loudly.
export async function coreAnchorGuard() {
  const problems = [];
  const load = (n) => import(pathToFileURL(join(CORE_DIR, n)).href);
  try {
    const xp = await load('xp.js');
    if (xp.XP_TABLE.length !== 99) problems.push(`XP_TABLE has ${xp.XP_TABLE.length} entries, expected 99`);
    const anchors = [[0, 1], [82, 1], [83, 2], [13034430, 98], [13034431, 99], [99999999, 99]];
    for (const [x, lv] of anchors) {
      if (xp.levelFromXp(x) !== lv) problems.push(`levelFromXp(${x}) = ${xp.levelFromXp(x)}, expected ${lv}`);
    }
    if (xp.xpForLevel(1) !== 0) problems.push('xpForLevel(1) must be 0');
    if (xp.xpForLevel(99) !== 13034431) problems.push('xpForLevel(99) drifted');
    if (xp.xpForLevel(120) !== xp.xpForLevel(99)) problems.push('xpForLevel must clamp above 99');
    if (xp.xpToNext(13034431) !== 0) problems.push('xpToNext at cap must be 0');
    if (xp.combatLevel({ attack: 0, strength: 0, defense: 0, hitpoints: 1154, prayer: 0 }) !== 3) {
      problems.push('combatLevel of a fresh character is no longer 3');
    }

    const pacing = await load('pacing.js');
    if (pacing.PACE.xp !== 0.39 || pacing.PACE.actionMs !== 1.60) problems.push('PACE dials drifted');
    if (pacing.speedClamp(0.99) !== 1 - pacing.SPEED_FUSE) problems.push('the speed fuse does not bind');
    if (pacing.speedClamp(-0.2) !== 1.2) problems.push('the fuse must pass a debuff through untouched');
    if (pacing.pacedActionMs(10) !== 500) problems.push('pacedActionMs must floor at 500');
    if (pacing.pacedXp('farming', 100) !== 100) problems.push('farming must stay PACE-exempt');
    if (pacing.applyGoldFind(100, () => 0.5) !== 150) problems.push('gold find no longer multiplies');
    if (pacing.applyGoldFind(100, () => -5) !== 100) problems.push('gold find must clamp at >= 0');

    const drops = await load('drops.js');
    if (drops.dropBand(1) !== 'always' || drops.dropBand(0.05) !== 'rare'
      || drops.dropBand(0.15) !== 'uncommon' || drops.dropBand(0.5) !== 'common') {
      problems.push('drop bands drifted');
    }
    if (drops.effectiveDropChance({ ch: 1 }, { dropMult: 5, dropBuff: 5 }) !== 1) {
      problems.push('a guaranteed drop must not be scaled by luck');
    }
    if (drops.effectiveDropChance({ ch: 0.9 }, { dropMult: 5 }) !== 0.95) {
      problems.push('non-guaranteed drop chance must cap at 0.95');
    }

    const farm = await load('farm.js');
    const t0 = 1_700_000_000_000;
    const plot = { cropId: 'turnip', plantedAt: t0, waterings: [] };
    if (Math.abs(farm.growthHours(plot, t0 + 3600000) - 1) > 1e-9) problems.push('unwatered growth is not 1h/h');
    const wet = { cropId: 'turnip', plantedAt: t0, waterings: [t0] };
    if (Math.abs(farm.growthHours(wet, t0 + 3600000) - 2) > 1e-9) problems.push('watered growth is not 2h/h');
    /* The load-bearing invariant: no forged watering array can beat 2x. */
    const forged = { cropId: 'turnip', plantedAt: t0, waterings: Array(8).fill(t0) };
    if (farm.growthHours(forged, t0 + 3600000) > 2 + 1e-9) problems.push('forged waterings beat the 2x growth cap');
    const future = { cropId: 'turnip', plantedAt: t0 + 999999, waterings: [] };
    if (farm.growthHours(future, t0) !== 0) problems.push('a future plantedAt must grant no growth');
    if (farm.MAX_PLOT_LEVEL !== 5) problems.push('plot tiers drifted');
    if (!farm.canPlantCrop(5, 'moonbloom') || farm.canPlantCrop(1, 'moonbloom')) problems.push('plot crop gating drifted');

    const rested = await load('rested.js');
    const st = { restedXp: 0, restedAt: t0 };
    const banked = rested.accrueRestedXp(st, t0 + 61 * 60 * 1000);
    if (banked !== 10) problems.push(`61 minutes should bank 10 charges, banked ${banked}`);
    /* The watermark invariant: a second read of the same clock pays nothing. */
    if (rested.accrueRestedXp(st, t0 + 61 * 60 * 1000) !== 0) problems.push('rested accrual double-paid');
    const capped = { restedXp: 0, restedAt: t0 };
    rested.accrueRestedXp(capped, t0 + 1000 * 3600000);
    if (capped.restedXp !== rested.RESTED_CAP) problems.push('rested bank exceeded its cap');
    const spend = { restedXp: 5 };
    if (rested.spendRestedCharge(spend, 0) !== 0 || spend.restedXp !== 5) problems.push('a worthless charge must not be burned');
    if (rested.spendRestedCharge(spend, 160) !== 160 || spend.restedXp !== 4) problems.push('spending a charge misbehaved');

    const combat = await load('combat.js');
    const items = {
      t7_plate: { type: 'armor', tier: 7, armourClass: 'plate' },
      t7_leather: { type: 'armor', tier: 7, armourClass: 'leather' },
      blade: { type: 'weapon', weaponType: 'sword', atkB: 10, strB: 8 },
    };
    const fullSet = { helmet: 't7_plate', body: 't7_plate', pants: 't7_plate', gloves: 't7_plate', boots: 't7_plate' };
    const set = combat.armorSetBonus(fullSet, items);
    if (!set || set.tier !== 7 || Math.abs(set.critB - 0.07) > 1e-9) problems.push('the tier-7 armour set bonus drifted');
    const mixed = { helmet: 't7_plate', body: 't7_plate', pants: 't7_plate', gloves: 't7_leather', boots: 't7_leather' };
    if (combat.armorSetBonus(mixed, items)) problems.push('a mix-and-match loadout must not count as a set');
    const eq = combat.equipmentStats({ weapon: 'blade' }, items);
    if (eq.weaponType !== 'sword' || eq.atkB !== 10) problems.push('equipmentStats drifted');
    const rolls = combat.playerCombatRolls({ def: 1000, tier: 6 }, { equipment: {}, items, skills: {} });
    if (rolls.accuracy !== 0.15) problems.push('accuracy must floor at 0.15');
    if (rolls.maxHit < 1) problems.push('maxHit must floor at 1');
    const capRolls = combat.playerCombatRolls({ def: 0, tier: 1 }, { equipment: {}, items, skills: { attack: 13034431 } });
    if (capRolls.accuracy !== 0.95) problems.push('accuracy must cap at 0.95');
    if (capRolls.critChance > combat.COMBAT_BALANCE.critCap) problems.push('crit chance escaped its cap');

    const prog = await load('progression.js');
    const { createRng } = await load('rng.js');
    /* The floor: a positive grant never rounds to zero. */
    const tiny = { skills: {}, restedXp: 0 };
    if (prog.grantXp(tiny, 'attack', 1, {}).gain !== 1) problems.push('a 1-XP grant must still pay 1');
    /* authored grants bypass PACE; earned grants do not. */
    const earned = prog.grantXp({ skills: {}, restedXp: 0 }, 'mining', 100, {});
    if (earned.gain !== 39) problems.push(`earned 100 XP should pay 39 after PACE, paid ${earned.gain}`);
    const authored = prog.grantXp({ skills: {}, restedXp: 0 }, 'mining', 100, { authored: true });
    if (authored.gain !== 100) problems.push('an authored grant must bypass PACE');
    /* rested is added OUTSIDE the multiplier block. */
    const withRest = prog.grantXp({ skills: {}, restedXp: 1 }, 'mining', 100, { bonus: () => 1, restedQuantum: 1000 });
    if (withRest.gain !== 78 + 1000) problems.push(`rested must not be scaled by perks (got ${withRest.gain})`);
    const lvl = prog.grantXp({ skills: { attack: 82 }, restedXp: 0 }, 'attack', 1, { authored: true });
    if (!lvl.events.some((e) => e.type === 'levelup' && e.from === 1 && e.to === 2)) {
      problems.push('crossing the 83-XP threshold must emit a level-up event');
    }
    if (prog.grantXp({ skills: { attack: 200 }, restedXp: 0 }, 'attack', 1, { authored: true }).events.length) {
      problems.push('a grant that crosses no threshold must emit no event');
    }
    /* the deterministic tool carry: 10 actions of a 10% tool = exactly 1 bonus */
    const carry = {};
    let bonusUnits = 0;
    for (let i = 0; i < 10; i++) {
      const r = prog.resolveGatherAction({ req: 1, qty: [1, 1], prod: 'log', xp: 10 },
        { skillId: 'woodcutting', level: 1, toolCarry: carry, toolDouble: 0.1, rng: createRng(1) });
      bonusUnits += r.toolDoubles;
    }
    if (bonusUnits !== 1) problems.push(`a 10% tool over 10 actions must pay exactly 1 bonus, paid ${bonusUnits}`);
    const gated = prog.resolveGatherAction({ req: 50, qty: [1, 1], prod: 'log', xp: 10 },
      { skillId: 'woodcutting', level: 1, rng: createRng(1) });
    if (gated.ok !== false || gated.reason !== 'level') problems.push('the level gate no longer stops an action');

    /* ── Phase A: combat-style XP routing ─────────────────────────────
       The route used to be four copies of one `Object.entries` walk with
       two DIFFERENT fallbacks. These anchors pin both, including the
       asymmetry, so "tidying" one of them fails loudly instead of quietly
       re-paying Strength on every kill. */
    const stl = await load('styles.js');
    if (Object.keys(stl.COMBAT_STYLES).length !== 4) problems.push('a weapon family vanished from COMBAT_STYLES');
    for (const fam of Object.keys(stl.COMBAT_STYLES)) {
      for (const key of Object.keys(stl.COMBAT_STYLES[fam])) {
        const s = stl.COMBAT_STYLES[fam][key];
        if (!s.xp || !Object.keys(s.xp).length) problems.push(`style ${fam}.${key} trains nothing`);
        const total = Object.values(s.xp).reduce((a, b) => a + b, 0);
        if (Math.abs(total - 1) > 1e-9) problems.push(`style ${fam}.${key} splits ${total} XP, not 1.0 — that is a stealth rate change`);
      }
    }
    if (stl.resolveStyle('magic', { magic: 'focus' }).name !== 'Focus') problems.push('resolveStyle ignored the stored key');
    if (stl.resolveStyle('magic', { magic: 'nonsense' }) !== stl.FALLBACK_STYLE) problems.push('an unknown style key must fall back, not crash');
    if (stl.resolveStyle('slingshot', null).name !== 'Accurate') problems.push('an unknown weapon type must fall back to sword/accurate');
    const hit = stl.hitXpRoute(stl.COMBAT_STYLES.sword.aggressive, 5);
    if (JSON.stringify(hit) !== JSON.stringify([{ skill: 'strength', amount: 20 }, { skill: 'hitpoints', amount: 6 }])) {
      problems.push('hitXpRoute drifted: ' + JSON.stringify(hit));
    }
    if (stl.hitXpRoute(null, 0).length) problems.push('a miss must pay nothing');
    const hitFallback = stl.hitXpRoute(null, 5);
    if (hitFallback.length !== 3 || hitFallback[0].skill !== 'attack' || hitFallback[1].skill !== 'strength') {
      problems.push('the pre-styles hit fallback (attack AND strength) was removed');
    }
    const kill = stl.killXpRoute(stl.COMBAT_STYLES.ranged.longrange, 100, 1.25);
    if (JSON.stringify(kill) !== JSON.stringify([{ skill: 'ranged', amount: 62.5 }, { skill: 'defense', amount: 62.5 }])) {
      problems.push('killXpRoute drifted (Boss-of-the-Day multiplier?): ' + JSON.stringify(kill));
    }
    const killFallback = stl.killXpRoute(null, 100, 1);
    if (killFallback.length !== 1 || killFallback[0].skill !== 'attack') {
      problems.push('the kill fallback must pay Attack ONLY — it is deliberately not the hit fallback');
    }
    const keys = stl.normaliseStyleKeys({ sword: 'controlled' });
    if (keys.sword !== 'controlled' || keys.magic !== 'cast') problems.push('normaliseStyleKeys clobbered or under-filled a choice');

    /* ── Phase A: the artisan bench ───────────────────────────────────── */
    const art = await load('artisan.js');
    const shrimp = { id: 'cook_shrimp', req: 1, xp: 100, input: 'shrimp', output: 'cooked_shrimp' };
    if (art.burnChance(shrimp, 1, 0) !== 0.25) problems.push('the open-fire burn rate drifted from 25%');
    if (Math.abs(art.burnChance(shrimp, 1, 0.13) - 0.12) > 1e-9) problems.push('Kitchen L1 no longer buys 12%');
    if (art.burnChance(shrimp, 26, 0) !== 0) problems.push('25 levels of mastery must burn-proof the open fire');
    if (art.burnChance(shrimp, 1, 0.25) !== 0) problems.push('Kitchen L3 must be burn-proof');
    if (art.burnXp(shrimp) !== 25) problems.push('a burn must pay the 25% consolation share');
    if (art.burnXp({ xp: 1 }) !== 1) problems.push('a burn must never pay 0 XP');
    if (art.KITCHEN_NO_BURN.length !== 5) problems.push('the Kitchen ladder is no longer 5 rungs');

    /* Both recipe dialects read by ONE reader. */
    if (JSON.stringify(art.recipeInputs({ input: 'ore', inputQty: 3, secondary: { coal: 2 } })) !== '{"ore":3,"coal":2}') {
      problems.push('the legacy input+secondary dialect is no longer understood');
    }
    if (art.missingInput({ inputs: { ore: 3 } }, { ore: 2 }) !== 'ore') problems.push('missingInput must name the shortfall');
    if (art.missingInput({ inputs: { ore: 3 } }, { ore: 3 }) !== null) problems.push('an affordable recipe must report no shortfall');

    const catalogue = { cooked_shrimp: { n: 'Cooked Shrimp' }, plate: { n: 'Platebody', type: 'armor' }, bar: { n: 'Bar' } };
    if (!art.isMaterialOutput({ output: 'bar' }, catalogue)) problems.push('a bar is a material output');
    if (art.isMaterialOutput({ output: 'plate' }, catalogue)) problems.push('THE MATERIAL-ONLY YIELD LAW broke — equipment must never take a yield roll');

    /* Real rng objects, not hand-rolled stubs: the chance(0)/chance(1)
       absorbing cases are part of the contract and a stub that ignores them
       would test a generator the engine never sees. */
    const { rngFrom } = await load('rng.js');
    const always = rngFrom(() => 0);        // worst-case roll: everything fires
    const never = rngFrom(() => 0.999);     // best-case roll: nothing fires
    const burnt = art.resolveArtisanAction(shrimp, {
      skillId: 'cooking', inventory: { shrimp: 5 }, items: catalogue,
      cookingLevel: 1, noBurn: 0, bonus: () => 0, rng: always,
    });
    if (!burnt.ok || !burnt.burnt) problems.push('a forced roll on an open fire must burn');
    if (burnt.produced.id !== art.BURNT_ITEM || burnt.consumed.shrimp !== 1) problems.push('a burn must cost the ingredient and pay carbon');
    if (burnt.progress.length) problems.push('a burn must never tick a cook goal');
    if (burnt.xpAmount !== 25) problems.push('a burn must pay the consolation XP');

    const cooked = art.resolveArtisanAction(shrimp, {
      skillId: 'cooking', inventory: { shrimp: 5 }, items: catalogue,
      cookingLevel: 1, noBurn: 0, bonus: () => 0, rng: never,
    });
    if (cooked.burnt || cooked.produced.qty !== 1 || cooked.xpAmount !== 100) problems.push('a successful cook drifted');
    if (cooked.stats.cooked !== 1 || cooked.progress[0] !== 'cooked') problems.push('a successful cook must tick BOTH the stat and the daily/quest key');

    const short = art.resolveArtisanAction(shrimp, { skillId: 'cooking', inventory: {}, items: catalogue, bonus: () => 0, rng: never });
    if (short.ok !== false || short.reason !== 'inputs' || short.missing !== 'shrimp') problems.push('an empty bag must stop the bench and name the ingredient');
    const locked = art.resolveArtisanAction({ id: 'x', xp: 1, inputs: {}, output: 'bar', gated: 'pattern' },
      { skillId: 'crafting', inventory: {}, unlockedRecipes: {}, items: catalogue, bonus: () => 0, rng: never });
    if (locked.reason !== 'gate') problems.push('a gated recipe must report the gate');

    /* craftSave is scoped to the crafting bench AND to material outputs. */
    const saveCtx = (skill, output) => art.resolveArtisanAction(
      { id: 'r', xp: 10, inputs: { bar: 2 }, output },
      { skillId: skill, inventory: { bar: 9 }, items: catalogue, bonus: (k) => (k === 'craftSave' ? 1 : 0), rng: never });
    if (saveCtx('crafting', 'bar').saved !== true) problems.push('a 100% Lathe must save the inputs');
    if (Object.keys(saveCtx('crafting', 'bar').consumed).length) problems.push('a saved craft must consume nothing');
    if (saveCtx('smithing', 'bar').saved !== false) problems.push('craftSave must not leak onto the forge');
    if (saveCtx('crafting', 'plate').saved !== false) problems.push('craftSave must not fire on equipment (H6)');

    /* The artisan tool carry: 10 crafts of a 10% tool pay exactly 1 extra. */
    const aCarry = {};
    let aBonus = 0;
    for (let i = 0; i < 10; i++) {
      const r = art.resolveArtisanAction({ id: 'r', xp: 10, inputs: { bar: 1 }, output: 'bar' }, {
        skillId: 'smithing', inventory: { bar: 99 }, items: catalogue,
        bonus: () => 0, toolCarry: aCarry, toolDouble: 0.1, rng: never,
      });
      aBonus += r.toolDoubles;
    }
    if (aBonus !== 1) problems.push(`a 10% artisan tool over 10 crafts must pay exactly 1 extra, paid ${aBonus}`);

    /* ── Phase A: the bounty board ────────────────────────────────────── */
    const bty = await load('bounty.js');
    if (bty.unlockedTier(11) !== 1 || bty.unlockedTier(12) !== 2 || bty.unlockedTier(70) !== 6) problems.push('the bounty tier ladder drifted');
    if (bty.unlockedTypes(4).length !== 1 || bty.unlockedTypes(40).length !== 6) problems.push('the bounty type ladder drifted');
    const rw = bty.bountyRewards(3, 'proof', 'hard');
    if (rw.gold !== 2500 || rw.marks !== 32 || rw.xp !== 281) problems.push('bounty rewards drifted: ' + JSON.stringify(rw));
    if (bty.bountyRewards(1, 'cull', 'easy').marks < 1) problems.push('a bounty must always pay at least 1 Mark');

    const mons = {
      rat: { name: 'Rat', tier: 1, weaponWeak: 'sword', xp: 10, drops: [{ id: 'tail', ch: 0.4 }] },
      goblin: { name: 'Goblin', tier: 1, weaponWeak: 'neutral', xp: 12, drops: [{ id: 'ear', ch: 0.3 }] },
      ogre: { name: 'Ogre', tier: 2, weaponWeak: 'hammer', xp: 40, drops: [{ id: 'tusk', ch: 0.2 }] },
      king: { name: 'King', tier: 3, boss: true, weaponWeak: 'sword', xp: 900, drops: [] },
    };
    const bItems = { tail: { n: 'Tail' }, ear: { n: 'Ear' }, tusk: { n: 'Tusk' } };
    const boardCtx = (seed) => ({
      monsters: mons, items: bItems, combatLevel: 30, bountyLevel: 20,
      ownedTypes: new Set(['sword', 'hammer']), rng: createRng(seed), now: 1_700_000_000_000,
    });
    const b1 = JSON.stringify(bty.generateBountyBoard(boardCtx(4242)).board);
    const b2 = JSON.stringify(bty.generateBountyBoard(boardCtx(4242)).board);
    const b3 = JSON.stringify(bty.generateBountyBoard(boardCtx(4243)).board);
    /* THE point of the extraction: the board used to stamp Date.now() and
       Math.random() into every id, so no two runs could ever agree. */
    if (b1 !== b2) problems.push('the same seed produced a different bounty board — the board is not replayable');
    if (b1 === b3) problems.push('a different seed produced the same board — the seed is being ignored');
    const board = bty.generateBountyBoard(boardCtx(4242)).board;
    if (board.length !== 3) problems.push('the board must always offer three bounties');
    if (board.some((b) => mons[b.target].boss)) problems.push('a normal bounty must never target a boss');
    if (board.some((b) => !(b.required > 0))) problems.push('a bounty with no target count is instantly complete');
    if (new Set(board.map((b) => b.target)).size !== 3) problems.push('the three offers must name three different monsters');
    /* Never offer a weapon bounty the player cannot satisfy. */
    const poor = bty.generateBountyBoard(Object.assign(boardCtx(4242), { ownedTypes: new Set(['sword']) })).board;
    for (const b of poor) {
      if (b.type === 'weapon' && b.requiredWeaponType !== 'neutral' && b.requiredWeaponType !== 'sword') {
        problems.push('offered a weapon bounty for a weapon the player does not own');
      }
    }
    if (bty.pickProofItem('rat', mons, bItems) !== 'tail') problems.push('pickProofItem no longer picks the commonest non-equipment drop');
    if (bty.pickProofItem('king', mons, bItems) !== null) problems.push('a drop-less monster must yield no proof item');
    const owned = bty.ownedWeaponTypes({ bow: 1 }, {}, { bow: { type: 'weapon', weaponType: 'ranged' } });
    if (!owned.has('ranged') || !owned.has('sword')) problems.push('ownedWeaponTypes must include the bag AND the always-available sword');

    const toolsMod = await load('tools.js');
    const toolItems = {
      bronze_axe: { type: 'tool', toolSkill: 'woodcutting', toolTier: 1, toolSpeed: 0.05 },
      rune_axe: { type: 'tool', toolSkill: 'woodcutting', toolTier: 5, toolSpeed: 0.25 },
      rune_pick: { type: 'tool', toolSkill: 'mining', toolTier: 5, toolSpeed: 0.25 },
    };
    const best = toolsMod.bestTool('woodcutting', { bronze_axe: 1, rune_axe: 1, rune_pick: 1 }, {}, toolItems);
    if (!best || best.id !== 'rune_axe') problems.push('bestTool no longer picks the highest tier');
    if (toolsMod.bestTool('woodcutting', { rune_axe: 0 }, {}, toolItems)) problems.push('a zero-quantity tool must not count');
    if (Math.abs(toolsMod.toolXpB(best) - 0.10) > 1e-9) problems.push('tool XP bonus drifted from tier x 2%');
  } catch (err) {
    problems.push('anchor guard failed to run — ' + err.message);
  }
  return problems;
}

export async function runAll() {
  const groups = [
    ['purity', await corePurityGuard()],
    ['determinism', await coreDeterminismGuard()],
    ['anchors', await coreAnchorGuard()],
  ];
  return groups.flatMap(([g, ps]) => ps.map((p) => `[${g}] ${p}`));
}

/* Standalone entry point. */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const problems = await runAll();
  if (problems.length) {
    console.log('src/core guard — FAILED:');
    for (const p of problems) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('src/core guard — pure, deterministic, and the numbers still match.');
}
