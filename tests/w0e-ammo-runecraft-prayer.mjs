#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/w0e-ammo-runecraft-prayer.mjs — W0 coherence audit, Top-10 #7 and #8
// plus the Runecrafting ruling (docs/planning/PRIORITY_BOARD.md, 2026-10-09).
//
//   node tests/w0e-ammo-runecraft-prayer.mjs              # the guard
//   node tests/w0e-ammo-runecraft-prayer.mjs --mutate=<id> # one mutant
//   node tests/w0e-ammo-runecraft-prayer.mjs --selftest   # every mutant CAUGHT
//
// THREE PROPERTIES, EACH DRIVEN THROUGH THE REAL ENGINES:
//
//   AMMO  An EMPTY ammo slot on a bow or a staff is "run dry" (x0.25), so it is
//         never better than running out. Before W0 the empty slot fought at
//         full strength (measured 3.4x a dry stack). The live swing
//         (simulateTick) and the HUNT engine (computeAccrual on a hunt session,
//         the one body the tick and the hunt verbs run — lane C2) both. The
//         tier-1 arrow is in the starter kit and on the shop counter, so no new
//         player is in the penalty state.
//   RUNE  Runecrafting's level-1 loop closes with nothing else trained: mine
//         Rune Essence -> cut Blank Runes -> bind CHALKED FIRE runes -> a Mage's
//         Fireball spends them in a fight (Tyler 2026-10-23: runes fuel spells,
//         never a staff's or a wand's blow). Every step runs through computeAccrual.
//   PRAY  RETIRED 2026-10-19 (core rebuild): Prayer wards are deleted (Tyler: Prayer
//         is regen RATES only). Its replacement guards: tests/core-curves.mjs (the
//         regen rate, JS = SQL) and tests/hunt-core/conditions.mjs (vitals by
//         armour and Prayer through the one engine).
//
// Node-only, credential-free, no database. Mutated runs import a STAGED COPY of
// src/ and supabase/functions/hr-accrue/ (Node cannot import a string, and the
// edge reaches src/ by relative path), so the mutant sits on disk at the same
// relative depth as the real file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { huntSpan, huntAccrual } from './hunt-fixture.mjs';
import { isMain as isEntryModule } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  empty_slot_not_dry: {
    file: 'src/core/ammo.js',
    why: 'the empty quiver is the dominant play again: no ammo fights at full strength, so '
       + 'Fletching and Runecrafting have no buyer',
    find: 'export const AMMO_EMPTY_SLOT_IS_DRY = true;',
    repl: 'export const AMMO_EMPTY_SLOT_IS_DRY = false;',
  },
  dry_flag_ignores_empty: {
    file: 'src/core/ammo.js',
    why: 'readAmmo reports an empty bow slot as supplied, so the combat rail would never show '
       + 'the empty-quiver indicator while the fight pays x0.25',
    find: '    dry: mult < 1,',
    repl: '    dry: styleNeedsAmmo(weaponType) && perShot > 0 && stock <= 0,',
  },
  free_rune_returns: {
    file: 'src/data/stonecraft.js',
    why: 'a rune that is never spent is back (the old free Air Rune rung): a spell would cast forever on one rune',
    find: 'ammoPerShot: 1, family, runeTier: t.tier });',
    repl: 'ammoPerShot: 0, family, runeTier: t.tier });',
  },
  shop_drops_bronze_arrows: {
    file: 'src/data/shops.js',
    why: 'a player who sells their starter arrows can never buy the first rung back',
    find: 'grant: [{ kind: "item", id: "bronze_arrows", amount: 50 }],',
    repl: 'grant: [{ kind: "item", id: "iron_arrows", amount: 50 }],',
  },
  chalked_back_at_15: {
    file: 'src/data/runes.js',
    why: 'Runecrafting\'s first rung that makes a SPENT rune is gated at 15 again, so the first '
       + 'hour makes nothing anybody burns',
    find: "Object.freeze({ tier: 1, name: 'Chalked', level: 1 }),",
    repl: "Object.freeze({ tier: 1, name: 'Chalked', level: 15 }),",
  },
  blanks_need_stonemason: {
    file: 'src/data/stonecraft.js',
    why: 'the level-1 blank cut eats Stonemason blocks again, so Runecrafting cannot start alone',
    find: "inputs: { rune_essence: 4 },",
    repl: "inputs: { dressed_block: 2 },",
  },
};

/* ── HARNESS ────────────────────────────────────────────────────────────── */
let checks = 0; let fails = 0;
const log = (m) => console.log(m);
const ok = (cond, msg) => { checks++; if (!cond) { fails++; log('  FAIL  ' + msg); } };
const harness = (m) => { const e = new Error(m); e.harness = true; throw e; };

async function stage(mutate) {
  if (!mutate) return { root: ROOT, base: null };
  const m = MUTATIONS[mutate];
  if (!m) harness(`unknown mutation "${mutate}"`);
  const base = await mkdtemp(join(tmpdir(), 'hr-w0e-'));
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'),
    join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  const target = join(base, ...m.file.split('/'));
  const before = (await readFile(target, 'utf8')).replace(/\r\n/g, '\n');
  const n = before.split(m.find).length - 1;
  if (n !== 1) harness(`mutation "${mutate}" anchor matched ${n} time(s) (need exactly 1) in ${m.file}`);
  await writeFile(target, before.replace(m.find, m.repl), 'utf8');
  return { root: base, base };
}

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 6 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const SEED = 0x0e0e5eed;
const MAX_XP = 13034431;
const UID = '00000000-0000-4000-8000-0000000e0e01';

export async function runAll({ mutate } = {}) {
  checks = 0; fails = 0;
  const st = await stage(mutate);
  const tag = '?w0e=' + (mutate || 'pristine') + '-' + Date.now();
  const imp = (rel) => import(pathToFileURL(join(st.root, ...rel.split('/'))).href + tag);
  try {
    const { ITEMS } = await imp('src/data/items.js');
    const { MONSTERS } = await imp('src/data/monsters.js');
    const { START_INVENTORY } = await imp('src/data/start-kit.js');
    const { SHOP_OFFERS } = await imp('src/data/shops.js');
    const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
    const { TREES, ROCKS, FISH_SPOTS } = await imp('src/data/gathering.js');
    const C = await imp('src/core/combat.js');

    const AMMO = await imp('src/core/ammo.js');
    const { createRng } = await imp('src/core/rng.js');
    const { xpForLevel, charXpForLevel } = await imp('src/core/xp.js');
    const { indexArtisanRecipes } = await imp('src/core/artisan-sim.js');
    const ACC = await imp('supabase/functions/hr-accrue/accrual.js');
    const { computeAccrual } = ACC;

    const ARTISAN_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);
    const GATHER_INDEX = {};
    for (const [skill, t] of [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]]) {
      for (const n of t) GATHER_INDEX[n.id] = { skill, node: n };
    }
    const xpAt = (lv) => xpForLevel(lv);

    /* ── Fixtures, derived from the catalogue (TESTING.md fixture rule) ── */
    const ammoIds = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].slot === 'ammo');
    /* NO FREE RUNG (Tyler 10-15: "Arrows keep a per-shot cost"): the kit's tier-1 arrow is spent like any other. */
    const KIT_ARROW = ammoIds.find((id) => ITEMS[id].tier === 1 && ITEMS[id].ammoPerShot === 1 && ITEMS[id].rangeStrB);
    const PAID_ARROW = ammoIds.find((id) => ITEMS[id].tier >= 2 && ITEMS[id].ammoPerShot === 1 && ITEMS[id].rangeStrB);
    /* The whetstone's first rung WEARS since c-work-fixes (2026-10-22, src/data/stonecraft.js:
       a whetstone is melee's ceiling, R5, so no free stone): the fixture is the tier-1 stone. */
    const WHET = ammoIds.find((id) => ITEMS[id].tier === 1 && ITEMS[id].strB);
    ok(!!KIT_ARROW && !!PAID_ARROW && !!WHET,
      `A0: the catalogue lost a fixture rung (kit arrow ${KIT_ARROW}, paid ${PAID_ARROW}, first whetstone ${WHET})`);
    const bestOf = (type, field) => Object.keys(ITEMS)
      .filter((id) => ITEMS[id] && ITEMS[id].weaponType === type && ITEMS[id][field])
      .sort((a, b) => (ITEMS[b][field] || 0) - (ITEMS[a][field] || 0))[0];
    const BOW = bestOf('ranged', 'rangeStrB');
    /* The MAGE's weapon (Tyler 2026-10-19: Mage = wand + spellbook; a staff is the Healer's, who heals
       rather than spends runes on blows): the first destruction-discipline magic weapon, a wand. */
    const STAFF = Object.keys(ITEMS).find((id) => ITEMS[id] && ITEMS[id].weaponType === 'magic' && ITEMS[id].discipline === 'destruction');
    const TARGET = MONSTERS.goblin ? 'goblin' : Object.keys(MONSTERS)[0];

    /* ── THE ATTENDED COLUMN: the instance engine at the viewed character's
       cadence — the span cut into one window per swing, the world and the
       session carried across every cut (tests/hunt-fixture.mjs huntSpan).
       Supplies are the session BAG (the fixture's `inventory`, loaded). ── */
    function attended({ equipment, inventory, skills, ticks, monsterId, seed }) {
      const items = ITEMS; const bonus = () => 0;
      const eq = C.equipmentStats(equipment, items);
      const profile = eq.weaponType === 'ranged'
        ? { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged', accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' }
        : eq.weaponType === 'magic'
          ? { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic', accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' }
          : Object.assign({}, C.DEFAULT_PROFILE, { type: eq.weaponType || 'sword' });
      const setBonus = C.armorSetBonus(equipment, items);
      const G = { activeMonster: monsterId || TARGET, playerHp: 1e6, playerMaxHp: 1e6, gold: 0, skills: { ...skills }, levelXp: 0, stats: {} };
      const bag = {};
      for (const [id, q] of Object.entries(inventory || {})) bag[id] = { loaded: q };
      const ctx = {
        fromMs: FROM_MS, toMs: FROM_MS + ticks * 2000, monsters: MONSTERS, items, bonus, family: eq.weaponType || 'sword',
        playerRolls: (m) => C.playerCombatRolls(m, { eq, equipment, items, skills: G.skills, bonus, setBonus, profile }),
        weakness: (m) => C.weaknessInfo(m, eq),
        fx: { addXp() {}, addItem() {} },
      };
      const out = huntSpan(G, ctx, { seed: seed || SEED, bag, ammo: equipment.ammo || null,
        weaponType: eq.weaponType || 'sword', windowMs: 2000 });
      return { kills: out.kills, taken: out.taken, spent: { ...out.hs.tally.supplies } };
    }

    /* ── THE SERVER COLUMN: hr-accrue's engine. A fight rides a hunt session
       (tests/hunt-fixture.mjs): its supplies are the session BAG (the fixture's
       `inventory`, loaded), and the foe is back at once so a fight measures
       damage, not the respawn clock. Gathering and the benches are the away
       pointer they always were. ── */
    const away = (o) => {
      const inp = {
        userId: UID, slot: 0, nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
        activeKind: o.kind || 'combat', activeId: o.id || TARGET, capMs: 12 * 3600000, seed: o.seed || SEED,
        /* A Level-150 hero (max HP from Level): the fight measures damage dealt, not survival. */
        hp: o.hp || 99, levelXp: charXpForLevel(150), gold: 0,
        skills: o.skills, equipment: o.equipment || {}, inventory: o.inventory || {},
        toolCarry: {},
        items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX, recipes: ARTISAN_INDEX,
        actionBudget: null,
      };
      if ((o.kind || 'combat') !== 'combat') return computeAccrual(inp);
      const bag = {};
      for (const [id, q] of Object.entries(o.inventory || {})) bag[id] = { loaded: q };
      return huntAccrual({ ...inp, inventory: {} }, { seed: o.seed || SEED, bag, engine: ACC, bar: o.bar });
    };

    const RANGED = { melee: 0, defense: MAX_XP, ranged: MAX_XP, magic: 0, inner_flame: 0 };

    // ═════════════════════════ AMMO ═════════════════════════════════════
    {
      const bow = (ammo) => (ammo ? { weapon: BOW, ammo } : { weapon: BOW });
      const T = 3000;
      const aEmpty = attended({ equipment: bow(null), skills: RANGED, ticks: T });
      const aDry = attended({ equipment: bow(PAID_ARROW), inventory: {}, skills: RANGED, ticks: T });
      const aKit = attended({ equipment: bow(KIT_ARROW), inventory: { [KIT_ARROW]: 5000 }, skills: RANGED, ticks: T });
      ok(aEmpty.kills <= aDry.kills,
        `A1 ATTENDED: an EMPTY quiver killed ${aEmpty.kills} against ${aDry.kills} for a quiver that `
        + 'ran dry — having no ammo must never beat running out (it was 3.4x before W0)');
      ok(aEmpty.kills * 2 < aKit.kills,
        `A1 ATTENDED: an empty quiver killed ${aEmpty.kills} and the kit's tier-1 arrow ${aKit.kills} — `
        + 'the empty slot is not being charged as run dry (x0.25)');
      ok(aKit.spent[KIT_ARROW] > 0,
        `A1 ATTENDED: the kit's ${KIT_ARROW} was never spent — arrows keep a per-shot cost`);

      const sEmpty = away({ equipment: bow(null), skills: RANGED, hp: 1e6 });
      const sDry = away({ equipment: bow(PAID_ARROW), inventory: {}, skills: RANGED, hp: 1e6 });
      const sKit = away({ equipment: bow(KIT_ARROW), inventory: { [KIT_ARROW]: 50000 }, skills: RANGED, hp: 1e6 });
      ok(sEmpty.accrued && sDry.accrued && sKit.accrued,
        `A2 HUNT: a fixture accrued nothing (${sEmpty.reason}/${sDry.reason}/${sKit.reason})`);
      if (sEmpty.accrued && sDry.accrued && sKit.accrued) {
        ok(sEmpty.summary.kills <= sDry.summary.kills,
          `A2 HUNT: an EMPTY quiver killed ${sEmpty.summary.kills} against ${sDry.summary.kills} dry — `
          + 'the away engine still rewards not equipping ammo');
        ok(sEmpty.summary.kills * 2 < sKit.summary.kills,
          `A2 HUNT: empty ${sEmpty.summary.kills} vs the kit's arrow ${sKit.summary.kills} — empty slot not run dry`);
        ok(sKit.hunt && sKit.hunt.uses && sKit.hunt.uses[KIT_ARROW] > 0,
          `A2 HUNT: the kit's ${KIT_ARROW} never left the bag (${JSON.stringify(sKit.hunt && sKit.hunt.uses)}) — arrows keep a per-shot cost`);
      }

      /* The one reader the UI asks. */
      const rd = (equipment, inventory) => AMMO.readAmmo({ equipment, inventory: inventory || {} }, { items: ITEMS });
      ok(rd({ weapon: BOW }).dry === true, 'A3: readAmmo says an empty bow slot is supplied — the indicator would never show');
      ok(rd({ weapon: STAFF }).dry === true, 'A3: readAmmo says an empty staff slot is supplied');
      ok(rd({ weapon: BOW, ammo: KIT_ARROW }, { [KIT_ARROW]: 1 }).dry === false, 'A3: a loaded stack of the kit\'s arrow reads dry');
      const sword = bestOf('sword', 'strB');
      ok(rd({ weapon: sword }).dry === false, 'A3: an empty MELEE slot reads dry — R5, melee\'s floor is free');
      ok(rd({}).dry === false, 'A3: an unarmed fighter reads dry');

      /* Every ammo-hungry style starts supplied, and can buy the first rung back. (A caster needs none: its basic
         costs mana and a rune fuels a spell, Tyler 2026-10-23; the kit's Air Rune left with the old ladder.) */
      for (const [label, id] of [['ranged', KIT_ARROW], ['melee', WHET]]) {
        ok((START_INVENTORY[id] || 0) > 0, `A4: the starter kit has no ${id} — a new ${label} player starts unsupplied`);
        ok(SHOP_OFFERS.some((o) => (o.grant || []).some((g) => g.kind === 'item' && g.id === id)
          && (o.cost || []).every((c) => c.kind === 'currency' && c.id === 'gold')),
        `A4: no gold shop offer sells ${id}`);
        const offer = SHOP_OFFERS.find((o) => (o.grant || []).some((g) => g.id === id));
        if (offer) {
          const g = offer.grant.find((x) => x.id === id).amount;
          const gold = offer.cost.find((c) => c.id === 'gold').amount;
          ok(gold >= g * (ITEMS[id].v || 0), `A4: ${offer.id} sells below book value (${gold} g for ${g}) — vendor arbitrage`);
        }
      }
    }

    // ═════════════════════════ RUNECRAFTING ════════════════════════════
    {
      const rc = ARTISAN_RECIPES.runecrafting || [];
      const lv1 = rc.filter((r) => (r.req || 1) <= 1);
      const spentAt1 = lv1.filter((r) => ITEMS[r.output] && ITEMS[r.output].ammoPerShot > 0);
      ok(spentAt1.length > 0,
        `R1: no level-1 Runecrafting rung makes a rune that is SPENT (have ${lv1.map((r) => r.id)}) — the `
        + 'first hour makes a rune nothing burns');
      ok(!rc.some((r) => ITEMS[r.output] && ITEMS[r.output].slot === 'ammo' && !(ITEMS[r.output].ammoPerShot > 0)),
        'R1: Runecrafting still makes a FREE rung (air) — that rune comes from the kit and the shop now');
      /* Self-supply at level 1: every input of a level-1 rung is made by a
         level-1 Runecrafting rung or MINED at a level-1 rock (the Essence Rock,
         Game Designer b570: essence is gathered like copper, never conjured). */
      const madeAt1 = new Set([...lv1.map((r) => r.output), ...ROCKS.filter((n) => (n.req || 1) <= 1).map((n) => n.prod)]);
      ok(ROCKS.some((n) => n.id === 'essence_rock' && n.req === 1 && n.prod === 'rune_essence'),
        'R1: the Essence Rock is not a level-1 mining node yielding rune_essence');
      ok(!rc.some((r) => r.output === 'rune_essence'), 'R1: a Runecrafting rung makes essence — it is MINED (b570)');
      for (const r of lv1) {
        for (const inId of Object.keys(r.inputs || {})) {
          ok(madeAt1.has(inId), `R1: level-1 rung ${r.id} eats ${inId}, which no level-1 Runecrafting rung makes`);
        }
      }

      /* THE LOOP, through the engine. Runecrafting 1, Mining 1, Stonemason 0; a Magic-15 Mage. */
      const skills = { runecrafting: 0, mining: 0, stonemason: 0, defense: xpAt(30), magic: xpAt(15), inner_flame: 0 };
      const step = (id, inventory) => away({ kind: 'artisan', id, skills: { ...skills }, inventory, hp: 300 });
      const mine = away({ kind: 'gather', id: 'essence_rock', skills: { ...skills }, inventory: {}, hp: 300 });
      const ess = (mine.accrued && mine.delta.items && mine.delta.items.rune_essence) || 0;
      ok(ess > 0, `R2: Mining 1 mined no Rune Essence at the Essence Rock (${mine.reason || JSON.stringify(mine.delta && mine.delta.items)})`);
      ok(mine.accrued && mine.delta.xp && mine.delta.xp.mining > 0 && !(mine.delta.xp.runecrafting > 0),
        'R2: mining essence must pay MINING, not Runecrafting');
      const cut = step('cut_rune_blanks', { rune_essence: ess });
      const blanks = (cut.accrued && cut.delta.items && cut.delta.items.rune_blank) || 0;
      ok(blanks > 0, `R2: ${ess} essence cut no blanks at Runecrafting 1 (${cut.reason})`);
      const bind = step('bind_chalked_fire_runes', { rune_blank: blanks });
      const fire = (bind.accrued && bind.delta.items && bind.delta.items.chalked_fire_rune) || 0;
      ok(fire > 0, `R2: ${blanks} blanks bound no Chalked Fire runes at Runecrafting 1 (${bind.reason})`);
      ok(bind.accrued && bind.delta.xp && bind.delta.xp.runecrafting > 0, 'R2: binding Chalked Fire runes paid no Runecrafting XP');
      if (fire > 0 && STAFF) {
        const mageSk = { ...skills, magic: xpAt(15) };
        /* a Fireball slot on the one foe spends the Mage's own runes (the fixture has no gold for the store's) */
        const bar = [{ action: { type: 'ability', id: 'fireball' }, conditions: [], join: 'and' }];
        const supplied = away({ equipment: { weapon: STAFF }, inventory: { chalked_fire_rune: fire }, skills: mageSk, hp: 1e6, bar });
        const empty = away({ equipment: { weapon: STAFF }, skills: mageSk, hp: 1e6, bar });
        /* A hunt spends from its BAG; the window states what it used. */
        const used = supplied.accrued ? Math.floor(Number(((supplied.hunt || {}).uses || {}).chalked_fire_rune) || 0) : 0;
        ok(used > 0, `R2: a magic fight with ${fire} crafted Chalked Fire runes spent none — Fireball never cast on them`);
        ok(supplied.accrued && empty.accrued && supplied.summary.kills > empty.summary.kills,
          `R2: crafted Fire runes did not out-kill a Mage with none (${supplied.summary && supplied.summary.kills} vs ${empty.summary && empty.summary.kills})`);
      }
    }

  } finally {
    if (st.base) await rm(st.base, { recursive: true, force: true });
  }
  return { checks, fails };
}

const main = async () => {
  const argv = process.argv.slice(2);
  const one = argv.find((a) => a.startsWith('--mutate'));
  if (one) {
    const id = one.includes('=') ? one.split('=')[1] : argv[argv.indexOf(one) + 1];
    log(`w0e — MUTATED: ${id}\n  ${MUTATIONS[id] ? MUTATIONS[id].why : '(unknown)'}\n`);
    const r = await runAll({ mutate: id });
    log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
    return r.fails ? 1 : 0;
  }
  if (argv.includes('--selftest')) {
    const slipped = [];
    for (const id of Object.keys(MUTATIONS)) {
      let caught = false;
      try {
        const r = await runAll({ mutate: id });
        caught = r.fails > 0;
      } catch (e) {
        if (e.harness) { log(`HARNESS on ${id}: ${e.message}`); return 2; }
        caught = true;
      }
      log(`${caught ? 'CAUGHT ' : 'SLIPPED'}  ${id}`);
      if (!caught) slipped.push(id);
    }
    if (slipped.length) {
      log(`\n${slipped.length} mutation(s) SLIPPED: ${slipped.join(', ')}`);
      return 1;
    }
    const r = await runAll();
    log(`\nall ${Object.keys(MUTATIONS).length} mutations caught; pristine run ${r.checks - r.fails}/${r.checks}`);
    return r.fails ? 1 : 0;
  }
  log('W0 — ammo run-dry, Runecrafting level-1 loop');
  const r = await runAll();
  log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
  return r.fails ? 1 : 0;
};

const isMain = isEntryModule(import.meta.url);
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e.harness ? e.message : e);
    process.exit(e.harness ? 2 : 1);
  });
}
