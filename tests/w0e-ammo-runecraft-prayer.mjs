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
//         full strength (measured 3.4x a dry stack). ATTENDED (simulateTick, the
//         live loop) and AWAY (computeAccrual, the hr-accrue engine) both. The
//         free tier-1 rung of every ladder is in the starter kit and on the shop
//         counter, so no new player is in the penalty state.
//   RUNE  Runecrafting's level-1 loop closes with nothing else trained: mine
//         Rune Essence -> cut Blank Runes -> bind EARTH runes -> spend them in a
//         magic fight. Every step runs through computeAccrual.
//   PRAY  The Prayer ward lands identically ATTENDED, AWAY and TICK (AWAY-1):
//         one function (`monsterCombatRolls`) prices every monster swing, and
//         all three paths hand it the same skills map.
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
  kit_drops_air_rune: {
    file: 'src/data/start-kit.js',
    why: 'a new character who picks up a staff starts in the penalty state',
    find: '  air_rune: 50,\n',
    repl: '',
  },
  shop_drops_bronze_arrows: {
    file: 'src/data/shops.js',
    why: 'a player who sells their starter arrows can never buy the free rung back',
    find: 'grant: [{ kind: "item", id: "bronze_arrows", amount: 50 }],',
    repl: 'grant: [{ kind: "item", id: "iron_arrows", amount: 50 }],',
  },
  earth_back_at_15: {
    file: 'src/data/stonecraft.js',
    why: 'Runecrafting\'s first rung that makes a SPENT rune is gated at 15 again, so the first '
       + 'hour makes nothing anybody burns',
    find: "output: 'earth_rune', outputQty: 45, xp: 12,  req: 1,",
    repl: "output: 'earth_rune', outputQty: 45, xp: 12,  req: 15,",
  },
  blanks_need_stonemason: {
    file: 'src/data/stonecraft.js',
    why: 'the level-1 blank cut eats Stonemason blocks again, so Runecrafting cannot start alone',
    find: "inputs: { rune_essence: 4 },",
    repl: "inputs: { dressed_block: 2 },",
  },
  ward_off: {
    file: 'src/core/combat.js',
    why: 'Prayer does nothing in a fight again — a combat-level padder',
    find: '  const ward = prayerWardPct(c.skills);',
    repl: '  const ward = 0;',
  },
  ward_attended_only: {
    file: 'supabase/functions/hr-accrue/accrual.js',
    why: 'the away engine prices monster swings without the Prayer level, so the ward pays while '
       + 'watching and not while away (AWAY-1 broken)',
    find: '      return monsterCombatRolls(m, { eq, skills: fightSkills, bonus });',
    repl: '      return monsterCombatRolls(m, { eq, skills: { ...fightSkills, prayer: 0 }, bonus });',
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
    const { PRAYER_WARDS, PRAYER_WARD_MAX_PCT } = await imp('src/data/skills.js');
    const { TREES, ROCKS, FISH_SPOTS } = await imp('src/data/gathering.js');
    const C = await imp('src/core/combat.js');
    const SIM = await imp('src/core/combat-sim.js');
    const AMMO = await imp('src/core/ammo.js');
    const { createRng } = await imp('src/core/rng.js');
    const { NO_BONUS } = await imp('src/core/botd.js');
    const { resolveStyle } = await imp('src/core/styles.js');
    const { xpForLevel } = await imp('src/core/xp.js');
    const { indexArtisanRecipes } = await imp('src/core/artisan-sim.js');
    const { computeAccrual } = await imp('supabase/functions/hr-accrue/accrual.js');
    const { hydrate, advance, shadowTick } = await imp('supabase/functions/hr-accrue/tick-shadow.js');

    const ARTISAN_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);
    const GATHER_INDEX = {};
    for (const [skill, t] of [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]]) {
      for (const n of t) GATHER_INDEX[n.id] = { skill, node: n };
    }
    const xpAt = (lv) => xpForLevel(lv);

    /* ── Fixtures, derived from the catalogue (TESTING.md fixture rule) ── */
    const ammoIds = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].slot === 'ammo');
    const FREE_ARROW = ammoIds.find((id) => ITEMS[id].ammoPerShot === 0 && ITEMS[id].rangeStrB);
    const PAID_ARROW = ammoIds.find((id) => ITEMS[id].ammoPerShot === 1 && ITEMS[id].rangeStrB);
    const FREE_RUNE = ammoIds.find((id) => ITEMS[id].ammoPerShot === 0 && ITEMS[id].magicStrB);
    const WHET = ammoIds.find((id) => ITEMS[id].ammoPerShot === 0 && ITEMS[id].strB);
    ok(!!FREE_ARROW && !!PAID_ARROW && !!FREE_RUNE && !!WHET,
      `A0: the catalogue lost a fixture rung (free arrow ${FREE_ARROW}, paid ${PAID_ARROW}, free rune ${FREE_RUNE}, free whetstone ${WHET})`);
    const bestOf = (type, field) => Object.keys(ITEMS)
      .filter((id) => ITEMS[id] && ITEMS[id].weaponType === type && ITEMS[id][field])
      .sort((a, b) => (ITEMS[b][field] || 0) - (ITEMS[a][field] || 0))[0];
    const BOW = bestOf('ranged', 'rangeStrB');
    const STAFF = Object.keys(ITEMS).find((id) => ITEMS[id] && ITEMS[id].weaponType === 'magic');
    const TARGET = MONSTERS.goblin ? 'goblin' : Object.keys(MONSTERS)[0];

    /* ── THE ATTENDED COLUMN: the live loop, one simulateTick per swing ── */
    function attended({ equipment, inventory, skills, ticks, monsterId, seed }) {
      const items = ITEMS; const bonus = () => 0;
      const eq = C.equipmentStats(equipment, items);
      const style = resolveStyle(eq.weaponType, null);
      const profile = eq.weaponType === 'ranged'
        ? { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged', accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' }
        : eq.weaponType === 'magic'
          ? { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic', accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' }
          : Object.assign({}, C.DEFAULT_PROFILE, { type: eq.weaponType || 'sword' });
      const setBonus = C.armorSetBonus(equipment, items);
      const G = {
        activeMonster: monsterId || TARGET, monsterHp: 0, monsterMaxHp: 0,
        playerHp: 1e9, playerMaxHp: 1e9, gold: 0, skills: { ...skills }, stats: {},
        inventory: { ...(inventory || {}) }, equipment: { ...equipment }, ammoCarry: {},
      };
      let kills = 0; let taken = 0; const spent = {};
      const ctx = {
        away: false, rng: createRng(seed || SEED), monsters: MONSTERS, items, bonus, style,
        playerRolls: (m) => C.playerCombatRolls(m, { eq, equipment, items, skills: G.skills, bonus, setBonus, profile, style }),
        monsterRolls: (m) => C.monsterCombatRolls(m, { eq, skills: G.skills, bonus }),
        weakness: (m) => C.weaknessInfo(m, eq),
        fx: {
          addXp() {}, addItem() {}, addGold() {},
          removeItem(id, q) { spent[id] = (spent[id] || 0) + q; G.inventory[id] = Math.max(0, (G.inventory[id] || 0) - q); },
        },
      };
      for (let i = 0; i < ticks; i++) {
        if (!G.monsterHp || G.monsterHp <= 0) {
          const m = MONSTERS[G.activeMonster]; G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        }
        const r = SIM.simulateTick(G, ctx);
        if (r.outcome === SIM.OUTCOME.KILL) kills++;
        if (typeof r.mDmg === 'number') taken += r.mDmg;
      }
      return { kills, taken, spent };
    }

    /* ── THE AWAY COLUMN: hr-accrue's engine ── */
    const away = (o) => computeAccrual({
      userId: UID, slot: 0, nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: o.kind || 'combat', activeId: o.id || TARGET, capMs: 12 * 3600000, seed: o.seed || SEED,
      hp: o.hp || 99, maxHp: o.hp || 99, gold: 0,
      skills: o.skills, equipment: o.equipment || {}, inventory: o.inventory || {},
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX, recipes: ARTISAN_INDEX,
      actionBudget: null,
    });

    const RANGED = { attack: 0, hitpoints: MAX_XP, defense: MAX_XP, ranged: MAX_XP, magic: 0, prayer: 0 };
    const MAGE = { hitpoints: MAX_XP, defense: MAX_XP, magic: MAX_XP, prayer: 0 };

    // ═════════════════════════ AMMO ═════════════════════════════════════
    {
      const bow = (ammo) => (ammo ? { weapon: BOW, ammo } : { weapon: BOW });
      const T = 3000;
      const aEmpty = attended({ equipment: bow(null), skills: RANGED, ticks: T });
      const aDry = attended({ equipment: bow(PAID_ARROW), inventory: {}, skills: RANGED, ticks: T });
      const aFree = attended({ equipment: bow(FREE_ARROW), inventory: { [FREE_ARROW]: 1 }, skills: RANGED, ticks: T });
      ok(aEmpty.kills <= aDry.kills,
        `A1 ATTENDED: an EMPTY quiver killed ${aEmpty.kills} against ${aDry.kills} for a quiver that `
        + 'ran dry — having no ammo must never beat running out (it was 3.4x before W0)');
      ok(aEmpty.kills * 2 < aFree.kills,
        `A1 ATTENDED: an empty quiver killed ${aEmpty.kills} and the FREE tier-1 rung ${aFree.kills} — `
        + 'the empty slot is not being charged as run dry (x0.25)');
      ok(!aFree.spent[FREE_ARROW],
        `A1 ATTENDED: the free rung ${FREE_ARROW} was spent (${aFree.spent[FREE_ARROW]}) — tier 1 never depletes`);

      const sEmpty = away({ equipment: bow(null), skills: RANGED, hp: 1e6 });
      const sDry = away({ equipment: bow(PAID_ARROW), inventory: {}, skills: RANGED, hp: 1e6 });
      const sFree = away({ equipment: bow(FREE_ARROW), inventory: { [FREE_ARROW]: 1 }, skills: RANGED, hp: 1e6 });
      ok(sEmpty.accrued && sDry.accrued && sFree.accrued,
        `A2 AWAY: a fixture accrued nothing (${sEmpty.reason}/${sDry.reason}/${sFree.reason})`);
      if (sEmpty.accrued && sDry.accrued && sFree.accrued) {
        ok(sEmpty.summary.kills <= sDry.summary.kills,
          `A2 AWAY: an EMPTY quiver killed ${sEmpty.summary.kills} against ${sDry.summary.kills} dry — `
          + 'the away engine still rewards not equipping ammo');
        ok(sEmpty.summary.kills * 2 < sFree.summary.kills,
          `A2 AWAY: empty ${sEmpty.summary.kills} vs free rung ${sFree.summary.kills} — empty slot not run dry`);
        ok(sEmpty.summary.weakMs === sEmpty.summary.ticks * sEmpty.tickMs && sEmpty.summary.dryMs === 0,
          `A2 AWAY: an empty quiver must be weak for the WHOLE span from 0 ms (weakMs ${sEmpty.summary.weakMs}, `
          + `dryMs ${sEmpty.summary.dryMs}) so the receipt can say why`);
        ok(sFree.summary.weakMs === 0, `A2 AWAY: the free rung reported ${sFree.summary.weakMs} ms unsupplied`);
      }

      /* The one reader the UI asks. */
      const rd = (equipment, inventory) => AMMO.readAmmo({ equipment, inventory: inventory || {} }, { items: ITEMS });
      ok(rd({ weapon: BOW }).dry === true, 'A3: readAmmo says an empty bow slot is supplied — the indicator would never show');
      ok(rd({ weapon: STAFF }).dry === true, 'A3: readAmmo says an empty staff slot is supplied');
      ok(rd({ weapon: BOW, ammo: FREE_ARROW }, { [FREE_ARROW]: 1 }).dry === false, 'A3: a loaded free rung reads dry');
      const sword = bestOf('sword', 'strB');
      ok(rd({ weapon: sword }).dry === false, 'A3: an empty MELEE slot reads dry — R5, melee\'s floor is free');
      ok(rd({}).dry === false, 'A3: an unarmed fighter reads dry');

      /* Every ammo-hungry style starts supplied, and can buy the free rung back. */
      for (const [label, id] of [['ranged', FREE_ARROW], ['magic', FREE_RUNE], ['melee', WHET]]) {
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
      /* Self-supply at level 1 with NO other skill: every input of a level-1
         rung is the output of a level-1 Runecrafting rung (or there is none). */
      const madeAt1 = new Set(lv1.map((r) => r.output));
      for (const r of lv1) {
        for (const inId of Object.keys(r.inputs || {})) {
          ok(madeAt1.has(inId), `R1: level-1 rung ${r.id} eats ${inId}, which no level-1 Runecrafting rung makes`);
        }
      }

      /* THE LOOP, through the engine. Runecrafting 1, Mining 1, Stonemason 0;
         Magic 15 so the Earth rune is wearable. */
      const skills = { runecrafting: 0, mining: 0, stonemason: 0, hitpoints: xpAt(30), defense: xpAt(30), magic: xpAt(15), prayer: 0 };
      const step = (id, inventory) => away({ kind: 'artisan', id, skills: { ...skills }, inventory, hp: 300 });
      const mine = step('mine_rune_essence', {});
      const ess = (mine.accrued && mine.delta.items && mine.delta.items.rune_essence) || 0;
      ok(ess > 0, `R2: Runecrafting 1 mined no Rune Essence (${mine.reason || JSON.stringify(mine.delta && mine.delta.items)})`);
      ok(mine.accrued && mine.delta.xp && mine.delta.xp.mining > 0 && !(mine.delta.xp.runecrafting > 0),
        'R2: mining essence must pay MINING (the quarry pattern), not Runecrafting');
      const cut = step('cut_rune_blanks', { rune_essence: ess });
      const blanks = (cut.accrued && cut.delta.items && cut.delta.items.rune_blank) || 0;
      ok(blanks > 0, `R2: ${ess} essence cut no blanks at Runecrafting 1 (${cut.reason})`);
      const bind = step('bind_earth_runes', { rune_blank: blanks });
      const earth = (bind.accrued && bind.delta.items && bind.delta.items.earth_rune) || 0;
      ok(earth > 0, `R2: ${blanks} blanks bound no Earth runes at Runecrafting 1 (${bind.reason})`);
      ok(bind.accrued && bind.delta.xp && bind.delta.xp.runecrafting > 0, 'R2: binding Earth runes paid no Runecrafting XP');
      if (earth > 0 && STAFF) {
        const mageSk = { ...skills, magic: xpAt(15) };
        const supplied = away({ equipment: { weapon: STAFF, ammo: 'earth_rune' }, inventory: { earth_rune: earth }, skills: mageSk, hp: 1e6 });
        const empty = away({ equipment: { weapon: STAFF }, skills: mageSk, hp: 1e6 });
        const used = supplied.accrued ? -((supplied.delta.items || {}).earth_rune || 0) : 0;
        ok(used > 0, `R2: a magic fight with ${earth} crafted Earth runes spent none — the rune is not consumed`);
        ok(supplied.accrued && empty.accrued && supplied.summary.kills > empty.summary.kills,
          `R2: crafted Earth runes did not out-kill an empty staff slot (${supplied.summary && supplied.summary.kills} vs ${empty.summary && empty.summary.kills})`);
      }
    }

    // ═════════════════════════ PRAYER ══════════════════════════════════
    {
      let prev = 0; let prevLv = 0;
      for (const row of PRAYER_WARDS) {
        ok(row.lv > prevLv && row.pct > prev && row.pct <= PRAYER_WARD_MAX_PCT,
          `P1: PRAYER_WARDS row ${JSON.stringify(row)} is not strictly above the last and within ${PRAYER_WARD_MAX_PCT}%`);
        prev = row.pct; prevLv = row.lv;
      }
      ok(C.prayerWardPct({ prayer: 0 }) === 0, 'P1: Prayer 1 has a ward');
      ok(C.prayerWardPct({ prayer: MAX_XP }) === PRAYER_WARDS[PRAYER_WARDS.length - 1].pct,
        'P1: Prayer 99 does not read the top ward');
      const m = MONSTERS[TARGET];
      const lo = C.monsterCombatRolls(m, { eq: {}, skills: { prayer: 0 }, bonus: () => 0 });
      const hi = C.monsterCombatRolls(m, { eq: {}, skills: { prayer: MAX_XP }, bonus: () => 0 });
      const want = lo.accuracy * (1 - C.prayerWardPct({ prayer: MAX_XP }) / 100);
      ok(Math.abs(hi.accuracy - want) < 1e-12 && hi.maxHit === lo.maxHit,
        `P2: Prayer 99 lands ${hi.accuracy} of ${lo.accuracy} (want ${want}) — the ward is not a clean share of blows`);

      /* ATTENDED vs AWAY vs TICK. The same character, prayer 1 and prayer 99,
         against a foe that hits. Each path's damage ratio must match the ward. */
      const melee = { weapon: bestOf('sword', 'strB') };
      const body = (p) => ({ attack: xpAt(20), strength: xpAt(20), defense: 0, hitpoints: MAX_XP, prayer: p });
      const FOE = Object.keys(MONSTERS).filter((id) => !MONSTERS[id].boss && (MONSTERS[id].atk || 0) >= 40)
        .sort((a, b) => MONSTERS[a].atk - MONSTERS[b].atk)[0] || TARGET;
      const ward = C.prayerWardPct({ prayer: MAX_XP }) / 100;
      const band = (r) => Math.abs(r - (1 - ward)) < 0.06;

      const at0 = attended({ equipment: melee, skills: body(0), ticks: 6000, monsterId: FOE });
      const at9 = attended({ equipment: melee, skills: body(MAX_XP), ticks: 6000, monsterId: FOE });
      ok(at0.taken > 500, `P3 fixture: ${FOE} dealt only ${at0.taken} damage attended — not a foe that hits`);
      ok(band(at9.taken / at0.taken),
        `P3 ATTENDED: Prayer 99 took ${(at9.taken / at0.taken).toFixed(3)} of Prayer 1's damage (want ~${(1 - ward).toFixed(2)})`);

      const HP = 5e6;
      const aw0 = away({ id: FOE, equipment: melee, skills: body(0), hp: HP });
      const aw9 = away({ id: FOE, equipment: melee, skills: body(MAX_XP), hp: HP });
      const lost = (r) => (r.accrued ? HP - r.delta.hp : NaN);
      ok(aw0.accrued && aw9.accrued, `P3 AWAY: a fixture accrued nothing (${aw0.reason}/${aw9.reason})`);
      ok(band(lost(aw9) / lost(aw0)),
        `P3 AWAY: Prayer 99 lost ${(lost(aw9) / lost(aw0)).toFixed(3)} of Prayer 1's HP (want ~${(1 - ward).toFixed(2)})`);

      /* AWAY-1, exact: one simulateSpan, ctx.away true vs false, same seed —
         the ward is not a scope question, so the fight is byte-identical. */
      const spanOf = (isAway) => {
        const eq = C.equipmentStats(melee, ITEMS);
        const style = resolveStyle(eq.weaponType, null);
        const G = { activeMonster: FOE, monsterHp: 0, monsterMaxHp: 0, playerHp: HP, playerMaxHp: HP,
          gold: 0, skills: body(MAX_XP), stats: {}, inventory: {}, equipment: { ...melee }, ammoCarry: {} };
        const bonus = () => 0;
        const s = SIM.simulateSpan(G, {
          away: isAway, fromMs: FROM_MS, toMs: FROM_MS + 3600000, tickMs: 2400, capped: false,
          rng: createRng(SEED), monsters: MONSTERS, items: ITEMS, bonus, style, activeBuffCount: 0,
          playerRolls: (mm) => C.playerCombatRolls(mm, { eq, equipment: melee, items: ITEMS, skills: G.skills, bonus,
            setBonus: C.armorSetBonus(melee, ITEMS), profile: Object.assign({}, C.DEFAULT_PROFILE, { type: eq.weaponType }), style }),
          monsterRolls: (mm) => C.monsterCombatRolls(mm, { eq, skills: G.skills, bonus }),
          weakness: (mm) => C.weaknessInfo(mm, eq),
          botdFor: () => ({ killBonuses: () => NO_BONUS }),
          fx: { addXp() {}, addItem() {}, addGold() {}, removeItem() {} },
        });
        return { hp: G.playerHp, kills: s.kills };
      };
      const sa = spanOf(false); const sb = spanOf(true);
      ok(sa.hp === sb.hp && sa.kills === sb.kills,
        `P4 AWAY-1: the warded fight differs attended (${sa.hp} hp, ${sa.kills} kills) vs away (${sb.hp}, ${sb.kills})`);

      /* TICK: the world tick chains 10 s windows through the same engine. */
      const tickLost = (p) => {
        let ch = hydrate({ userId: UID, slot: 0, activeSinceMs: FROM_MS, activeKind: 'combat', activeId: FOE,
          capMs: 12 * 3600000, hp: HP, maxHp: HP, gold: 0, skills: body(p), equipment: melee, inventory: {},
          autoEatEnabled: false, autoEatFood: null, autoEatPct: 0 });
        const cats = { items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX };
        for (let t = FROM_MS; t < FROM_MS + 2 * 3600000; t += 10000) {
          const r = shadowTick(ch, t, t + 10000, cats, {});
          ch = advance(ch, r);
        }
        return HP - ch.hp;
      };
      const tk0 = tickLost(0); const tk9 = tickLost(MAX_XP);
      ok(tk0 > 500, `P5 fixture: the tick chain took only ${tk0} damage from ${FOE}`);
      ok(band(tk9 / tk0),
        `P5 TICK: Prayer 99 lost ${(tk9 / tk0).toFixed(3)} of Prayer 1's HP across 10 s windows (want ~${(1 - ward).toFixed(2)})`);
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
  log('W0 — ammo run-dry, Runecrafting level-1 loop, Prayer ward on every path');
  const r = await runAll();
  log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
  return r.fails ? 1 : 0;
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e.harness ? e.message : e);
    process.exit(e.harness ? 2 : 1);
  });
}
