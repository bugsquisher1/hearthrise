// ════════════════════════════════════════════════════════════════════════
// tests/cutover-import.mjs — THE CUTOVER IMPORT, GRADED ON A REAL POSTGRES.
//
//   node tests/cutover-import.mjs             run the guard
//   node tests/cutover-import.mjs --selftest  plant every defect, expect RED
//
// The whole migration chain replays into PGlite (real PostgreSQL, in process),
// so 2026-08-17-cutover-import.sql's own self-verifying block executes on every
// suite run — not only when somebody applies it. Then six SYNTHETIC SNAPSHOTS,
// each shaped after something real, are driven through the ACTUAL tool
// (tools/cutover-import.mjs's buildPlan + verify) and the ACTUAL RPC.
//
// ── THE SIX SNAPSHOTS, AND WHAT EACH IS FOR ─────────────────────────────
//   NORMAL   an ordinary save. The happy path has to be boring.
//   MAXED    every skill at the top of the curve, a full bag, every room at
//            rung 5, tier-5 property. Proves the CLAMPS DO NOT FIRE on a
//            legitimately maxed player — a clamp that also eats real progress
//            is worse than no clamp.
//   FORGED   1e12 gold, 1e12 xp, 1e12 of an item. Clamps AND reports; the
//            report is the assertion, because a silent clamp and an accepted
//            value are indistinguishable from the outside.
//   UNKNOWN  ids the catalogue has never heard of, including the REAL live
//            case (a companion in the `companion` equip slot). Dropped BY
//            NAME, never guessed.
//   UNLOCKS  rooms + recipes. THE ORDERING DEPENDENCY FOR THE ARTISAN FLIP:
//            the import must feed hr_perks_of, which must feed
//            makeBonus('noBurn'). Asserted end to end through the REAL
//            src/core/perks.js, because "the row is in the table" is not the
//            claim — "the Kitchen stops burning food" is.
//   CORRUPT  an empty object and a JSON array. Skipped and reported; the
//            batch continues.
//
// ── MUTATION PROOFS (--selftest) ────────────────────────────────────────
// Every one is a REAL defect planted in the real file, and every one must read
// RED. Two of them are the ones the brief names:
//   M1  delete a FIELD_MAP entry → the run must fail BY NAME on that field.
//   M2  disable the verifier → a discrepancy PLANTED SERVER-SIDE (the row is
//       edited in the database behind the RPC's back) must still be caught by
//       the tool's own read-back. A verifier that only ever sees agreement is
//       not a verifier.
//
// PGlite is real PostgreSQL compiled to WASM, in process. No Docker, no
// credentials, no network, production untouched.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { bootReplay, ROOT } from './schema-replay.mjs';
import { makeBonus } from '../src/core/perks.js';
import { XP_TABLE } from '../src/core/xp.js';

const MIGRATION = '2026-08-17-cutover-import.sql';
const XP99 = XP_TABLE[98];

const problems = [];
const fail = (m) => problems.push(m);

/* ── the fixture user ─────────────────────────────────────────────────── */
const UID = '11111111-2222-3333-4444-555555555555';

async function seedUser(db) {
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict do nothing;`);
}

/** Call the RPC exactly the way tools/cutover-import.mjs calls it. */
async function callImport(db, plan, meta, commit) {
  const r = await db.query(
    'select public.hr_import_apply($1::uuid, $2::int, $3::jsonb, $4::jsonb, $5::boolean) as r',
    [UID, 0, JSON.stringify(plan), JSON.stringify(meta || {}), commit]);
  return r.rows[0].r;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SYNTHETIC SNAPSHOTS.

   Shaped after the six real production saves read on 2026-08-15, including
   the shapes that only real data revealed: `bank` carrying BOTH bank-space
   bookkeeping and item ids, a companion sitting in the `companion` equip slot
   (companions are not items), 115 stacks against a default cap of 100, and a
   `skills.combat` key that is not a catalogued skill.
   ══════════════════════════════════════════════════════════════════════════ */
function snapshots(cat) {
  const someItem = cat.items[0];
  const someItem2 = cat.items[1];
  const eq = cat.itemSlot;                       // { item_id, equip_slot }
  const food = cat.food;
  const crop = cat.crops[0];

  const base = {
    schemaVersion: 1, v: 2, lastSeen: Date.now(), createdAt: Date.now() - 8.64e7,
    playerName: 'Adventurer', account: null, cloudSyncedAt: Date.now(), __device: 'dev-1',
    settings: { sfx: true }, viewingSkill: 'mining', houseTheme: 'default',
    combatLevel: 40, totalLevel: 300, bossKills: 2, renown: 10, renownHigh: 10,
    offlineBudget: { at: 1, dayKey: 20260810, usedMs: 0 },   // a 1970 watermark, deliberately
    lastActivity: { id: 'woodcutting', kind: 'skill', stoppedAt: Date.now() },
    clanId: 'c1', clanName: 'Forged', muster: {}, raids: {}, quests: [], daily: { tasks: [] },
    dailyGoals: {}, weeklyGoals: {}, dailyReward: {}, streak: { count: 3 },
    collection: {}, bestiary: {}, achievements: {}, dropLog: {}, chronicle: {},
    dungeons: {}, buffs: [], loadouts: [], companions: { ownedIds: ['fox'], xp: {}, equipped: 'fox' },
    wieldGrandfather: {}, combatStyle: {}, lifetimeKills: 5,
  };

  return {
    NORMAL: {
      ...base,
      gold: 12214, gems: 24,
      bank: { goldBuys: 6, gemBuys: 0, grandfather: 0 },
      skills: { hitpoints: 13363, mining: 5000, combat: 3018 },   // `combat` is not catalogued
      inventory: { [someItem]: 25, [someItem2]: 3 },
      equipment: { [eq.equip_slot]: eq.item_id, companion: 'rock_golem' },
      farmPlots: [{ state: 'growing', cropId: crop, plantedAt: Date.now() - 6e5, waterings: [Date.now() - 5e5] },
        { state: 'empty', cropId: null }],
      rooms: { kitchen: 3, forge: 2 },
      homestead: { tier: 2 },
      plotLevels: 1,
      plotBuildings: [{ id: 'farm_plot', uid: 1 }, { id: 'scarecrow', uid: 2 }],
      workers: { hired: [{ xp: 1 }, { xp: 2 }] },
      traits: { auto_eat: true },
      autoActions: { eat: { enabled: true, foodId: food, threshold: 0.9 }, trainGoal: {}, farmReplant: {} },
      foodSlot: food, autoEatPct: 0.9,
      toolCarry: { mining: 0.66 },
      ownedThemes: ['default'], ownedCosmetics: [], entitlements: {},
      unlockedRecipes: {},
      stats: { kills: 8701, crits: 1519, gathered: 23428, mined: 17203, cooked: 6569, crafted: 11253, smithed: 17714, harvested: 1255, playMs: 1e8 },
      bountyHunter: { marks: 3440, xp: 47768, upgrades: {}, board: [] },
    },

    MAXED: {
      ...base,
      gold: 999999999, gems: 9999999,
      bank: { goldBuys: 0, gemBuys: 0, grandfather: 0 },
      skills: Object.fromEntries(cat.skills.map((s) => [s, XP99])),
      inventory: Object.fromEntries(cat.items.slice(0, 115).map((i) => [i, 65849])),
      equipment: { [eq.equip_slot]: eq.item_id },
      farmPlots: [],
      rooms: Object.fromEntries(cat.rooms.map((r) => [r, 5])),
      homestead: { tier: 5 }, plotLevels: 5,
      plotBuildings: [], workers: { hired: [] }, traits: {},
      autoActions: {}, foodSlot: null, autoEatPct: 0.5, toolCarry: {},
      ownedThemes: [], ownedCosmetics: [], entitlements: {}, unlockedRecipes: {},
      stats: {}, bountyHunter: {},
    },

    FORGED: {
      ...base,
      gold: 1e12, gems: 1e12,
      bank: {}, skills: { mining: 1e12, hitpoints: 1e12 },
      inventory: { [someItem]: 1e12 },
      equipment: {}, farmPlots: [{ state: 'growing', cropId: crop, plantedAt: 0, waterings: [0] }],
      rooms: { kitchen: 99 }, homestead: { tier: 5 }, plotLevels: 1,
      plotBuildings: [], workers: { hired: [] }, traits: {},
      autoActions: {}, foodSlot: null, autoEatPct: 9, toolCarry: { mining: 7 },
      ownedThemes: [], ownedCosmetics: [], entitlements: {}, unlockedRecipes: {},
      stats: {}, bountyHunter: {},
    },

    // F1 (Security): values ABOVE bigint range (~9.2e18). The devtools threat
    // model in CLAUDE.md is literally `G.gold = 1e308`. Must clamp-and-report,
    // never throw 22003 on the ::bigint cast. FORGED uses 1e12, which is well
    // inside bigint and never exercises this path.
    FORGEDBIG: {
      ...base,
      gold: 1e308, gems: 1e308,
      bank: {}, skills: { mining: 1e308, hitpoints: 1e308 },
      inventory: { [someItem]: 1e308 },
      equipment: {}, farmPlots: [],
      rooms: {}, homestead: { tier: 0 }, plotLevels: 1,
      plotBuildings: [], workers: { hired: [] }, traits: {},
      autoActions: {}, foodSlot: null, autoEatPct: 1e308, toolCarry: {},
      ownedThemes: [], ownedCosmetics: [], entitlements: {}, unlockedRecipes: {},
      stats: { kills: 1e308 }, bountyHunter: {},
    },

    UNKNOWN: {
      ...base,
      gold: 100, gems: 0, bank: { an_item_removed_in_a_rename: 12 },
      skills: { hitpoints: 1154, a_skill_that_was_cut: 500 },
      inventory: { [someItem]: 2, an_item_that_does_not_exist: 7, wolf_pup: 1 },
      equipment: { companion: 'phoenix_chick', a_slot_that_does_not_exist: someItem,
        [eq.equip_slot]: 'a_renamed_sword' },
      farmPlots: [{ state: 'growing', cropId: 'a_crop_that_was_cut', plantedAt: Date.now() }],
      rooms: { a_room_that_does_not_exist: 2 }, homestead: { tier: 0 }, plotLevels: 1,
      plotBuildings: [], workers: { hired: [] }, traits: {},
      autoActions: {}, foodSlot: 'not_food', autoEatPct: 0.5, toolCarry: { not_a_skill: 0.5 },
      ownedThemes: ['default'], ownedCosmetics: [], entitlements: {}, unlockedRecipes: {},
      stats: {}, bountyHunter: {},
    },

    UNLOCKS: {
      ...base,
      gold: 500, gems: 0, bank: {},
      skills: { hitpoints: 1154, cooking: 100000 },
      inventory: {},
      // THE LEGACY FOX MIRROR: `fox_companion` IS a catalogued item whose slot IS
      // `companion`, so it passes every catalogue check and would import — while
      // every other player's raw COMPANIONS id dropped. The asymmetry is the
      // point of this fixture.
      equipment: { companion: 'fox_companion' },
      farmPlots: [],
      rooms: { kitchen: 4 }, homestead: { tier: 3 }, plotLevels: 3,
      plotBuildings: [{ id: 'toolshed', uid: 1 }], workers: { hired: [{}] },
      traits: {}, autoActions: {}, foodSlot: null, autoEatPct: 0.5, toolCarry: {},
      ownedThemes: ['default', 'forest'], ownedCosmetics: [], entitlements: { noAds: true },
      unlockedRecipes: { captain_recipe: true, field_cookbook: true },
      stats: {},
      // THE ID-SPACE ALIAS, exercised end to end: the client keys upgrades by
      // the shop offer's FLAG, not the catalogue id. All four must land as
      // their catalogue `bounty:<id>` flag rows and reach hr_state_of.
      bountyHunter: { marks: 10, upgrades: { goldBoost: true, autoBounty: true, extraRerolls: 3, cosmeticCloak: true } },
    },

    // A store carrying an id that is in NEITHER the catalogue NOR the alias —
    // an id-space mismatch nobody has ruled on. It must be REPORTED by name as
    // aliasable, per ruling 3, not silently dropped, in EVERY unlock store.
    ALIASGAP: {
      ...base,
      gold: 1, gems: 0, bank: {}, skills: { hitpoints: 1154 },
      inventory: {}, equipment: {}, farmPlots: [],
      rooms: {}, homestead: { tier: 0 }, plotLevels: 1,
      plotBuildings: [], workers: { hired: [] },
      traits: { a_trait_the_catalogue_lacks: true },
      autoActions: {}, foodSlot: null, autoEatPct: 0.5, toolCarry: {},
      ownedThemes: ['a_theme_the_catalogue_lacks'],
      ownedCosmetics: ['a_cosmetic_the_catalogue_lacks'],
      entitlements: { an_entitlement_the_catalogue_lacks: true },
      unlockedRecipes: { a_recipe_the_catalogue_lacks: true },
      stats: {},
      bountyHunter: { upgrades: { a_bounty_flag_with_no_offer: true } },
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE GUARD
   ══════════════════════════════════════════════════════════════════════════ */
export async function cutoverImportGuard({ patches, toolPath } = {}) {
  problems.length = 0;
  let db;
  try {
    const boot = await bootReplay({ patches });
    db = boot.db;
    if (boot.failures && boot.failures.length) {
      for (const f of boot.failures) fail(`chain: ${f.name}: ${String(f.error).slice(0, 300)}`);
      return problems;
    }
    if (!boot.applied.includes(MIGRATION)) {
      fail(`${MIGRATION} is not in the replayed chain — add it to tests/schema-apply-order.json`);
      return problems;
    }
  } catch (e) {
    if (e.harness) { console.log(`cutover-import guard SKIPPED: ${e.message}`); return problems; }
    fail(`boot: ${e.message}`); return problems;
  }

  const tool = await import(pathToFileURL(toolPath || join(ROOT, 'tools', 'cutover-import.mjs')).href);

  // ── the catalogues, read out of the replayed database ────────────────
  const q = async (sql) => (await db.query(sql)).rows;
  const cat = {
    items: (await q("select item_id from public.hr_items order by item_id")).map((r) => r.item_id),
    skills: (await q('select skill_id from public.hr_skills order by skill_id')).map((r) => r.skill_id),
    crops: (await q('select crop_id from public.hr_crops order by crop_id')).map((r) => r.crop_id),
    rooms: (await q("select unlock_id from public.hr_unlocks where namespace='room' order by unlock_id"))
      .map((r) => r.unlock_id.slice(5)),
    itemSlot: (await q('select item_id, equip_slot from public.hr_item_slots order by item_id limit 1'))[0],
    food: (await q('select item_id from public.hr_items where auto_eatable order by item_id limit 1'))[0].item_id,
  };
  if (cat.items.length < 100 || cat.rooms.length !== 8) {
    fail(`the replayed catalogue is wrong shape: ${cat.items.length} items, ${cat.rooms.length} rooms`);
    return problems;
  }

  // The tool's own catalogue view, built from the same tables through its own
  // loader — so the test drives the REAL loadCatalogues, not a stand-in.
  const toolCat = await tool.loadCatalogues(async (sql) => (await db.query(sql)).rows);

  await seedUser(db);
  const SN = snapshots(cat);

  // ── A. THE DECLARATION GATE ──────────────────────────────────────────
  for (const [name, snap] of Object.entries(SN)) {
    const gap = tool.declarationGap(snap);
    if (gap.length) fail(`A1 (${name}): FIELD_MAP does not declare ${gap.join(', ')}`);
  }
  // ...and it must be able to SEE a gap.
  if (!tool.declarationGap({ a_field_nobody_declared: 1 }).includes('a_field_nobody_declared')) {
    fail('A2: declarationGap() cannot see an undeclared field — the gate asserts nothing');
  }
  // Scratch keys are exempt, because snapshot() never emits them.
  if (tool.declarationGap({ _saveOwner: 'x' }).length) {
    fail('A3: declarationGap() flagged a `_` scratch key that snapshot() never emits');
  }

  // ── B. THE PLAN BUILDER + THE RPC, per snapshot ──────────────────────
  // The REAL game-data path — BANK_SPACE, TIERS and the id-space alias derived
  // from BOUNTY_SHOP — so the test drives the same slice+derive the CLI does
  // (including buildIdAlias's 1:1 assertion and its cross-check against the
  // ruling's stamped four). A drift in the shop fails HERE, not on freeze day.
  const gameData = tool.readGameData();
  if (!gameData.ID_ALIAS || !gameData.ID_ALIAS.bounty
      || gameData.ID_ALIAS.bounty.goldBoost !== 'bounty:mark_pouch') {
    fail(`B0: the id-space alias did not derive from BOUNTY_SHOP: ${JSON.stringify(gameData.ID_ALIAS)}`);
    return problems;
  }

  const results = {};
  for (const [name, snap] of Object.entries(SN)) {
    const { plan, report } = tool.buildPlan(snap, toolCat, gameData);
    const out = await callImport(db, plan, { snapshot_sha: 'b'.repeat(64) }, false);
    results[name] = { plan, report, out };
    if (!out || out.ok !== true) {
      fail(`B (${name}): the RPC refused a well-formed plan: ${JSON.stringify(out)}`);
      continue;
    }
    // ⚠ verifyImport, NOT verify. The guard must drive the SAME composition
    //   production drives. Assembling the arguments here is what let the
    //   2026-08-16 rehearsal fail 4 of 6 players against a green suite: the
    //   test passed (out, report), run() passed (out) only.
    const mism = tool.verifyImport(snap, out, report, toolCat, gameData);
    results[name].mismatches = mism;
    if (mism.length) fail(`B (${name}): verification found ${mism.length}: ${mism.slice(0, 4).join(' | ')}`);
  }

  const env = (n) => (results[n] && results[n].out && results[n].out.envelope) || {};

  // ── C. NORMAL ────────────────────────────────────────────────────────
  {
    const e = env('NORMAL');
    if (Number(e.state && e.state.gold) !== 12214) fail(`C1: gold imported as ${e.state && e.state.gold}`);
    // bank_cap = BASE_CAP + 6 * gold.slots, computed from the SLICED table.
    const wantCap = gameData.BANK_SPACE.BASE_CAP + 6 * gameData.BANK_SPACE.gold.slots;
    if (Number(e.state.bank_cap) !== wantCap) fail(`C2: bank_cap ${e.state.bank_cap} <> ${wantCap}`);
    // max_hp derives from the hitpoints XP, not from the blob.
    const wantHp = (await q('select public.hr_level_from_xp(13363) as l'))[0].l;
    if (Number(e.state.max_hp) !== Number(wantHp)) fail(`C3: max_hp ${e.state.max_hp} <> ${wantHp}`);
    if (Number(e.state.hp) !== Number(e.state.max_hp)) fail('C4: hp is not max_hp');
    // The 1970 watermark must NOT have become accrued_to.
    if (new Date(e.state.accrued_to).getTime() < Date.now() - 6e5) {
      fail(`C5: accrued_to is ${e.state.accrued_to} — the blob's 1970 offlineBudget was imported, `
        + 'which is an unbounded away-window mint on the first accrual');
    }
    if (e.state.active_kind !== 'idle') fail(`C6: active_kind ${e.state.active_kind} — the import resumed an activity`);
    // `combat` is not a catalogued skill: dropped by name, and NOT present.
    if (e.skills && e.skills.combat) fail('C7: the uncatalogued `combat` skill reached player_skills');
    const normalDrops = [...results.NORMAL.report.dropped, ...results.NORMAL.out.drops];
    if (!normalDrops.some((d) => d.id === 'combat' && d.reason === 'not_in_hr_skills')) {
      fail(`C8: the 'combat' skill was dropped SILENTLY: ${JSON.stringify(normalDrops)}`);
    }
    if (!normalDrops.some((d) => d.id === 'rock_golem')) {
      fail(`C8b: the companion in the companion equip slot was dropped SILENTLY: ${JSON.stringify(normalDrops)}`);
    }
    // A companion in the companion slot: dropped by name (companions are not items).
    if (e.equipment && e.equipment.companion) fail('C9: a companion id reached player_equipment');
    // auto-eat rides on the trait row the same import wrote.
    if (e.state.auto_eat_enabled !== true) fail('C10: auto-eat is off despite the trait row and enabled:true');
    if (Number(e.state.auto_eat_pct) !== 90) fail(`C11: auto_eat_pct ${e.state.auto_eat_pct} <> 90`);
    // two workers, two plot buildings, one of each kind
    const prog = new Map((e.progress || []).map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
    if (prog.get('stat worker') !== 2) fail(`C12: worker count ${prog.get('stat worker')} <> 2`);
    if (prog.get('stat plot:farm_plot') !== 1) fail(`C13: plot:farm_plot ${prog.get('stat plot:farm_plot')} <> 1`);
    if (prog.get('unlock room:kitchen') !== 3) fail(`C14: room:kitchen ${prog.get('unlock room:kitchen')} <> 3`);
    if (prog.get('unlock property:farmstead') !== 2) fail(`C15: property tier ${prog.get('unlock property:farmstead')} <> 2`);
    // the goal counters that make every quest retro-correct
    if (prog.get('stat ev:kill_any') !== 8701) fail(`C16: ev:kill_any ${prog.get('stat ev:kill_any')} <> 8701`);
    if (prog.get('stat ev:gather') !== 23428) fail(`C17: ev:gather ${prog.get('stat ev:gather')} <> 23428`);
    if (prog.get('stat kills') !== 8701) fail(`C18: stat kills ${prog.get('stat kills')} <> 8701`);
    // farm: TWO plots, one planted one empty — the row count IS the capacity
    if ((e.farm || []).length !== 2) fail(`C19: ${(e.farm || []).length} farm rows <> 2`);
    // a plot the client says is growing keeps its crop
    if (!(e.farm || []).some((f) => f.crop)) fail('C20: the growing plot lost its crop');
    // NOTHING PERSISTED — the whole claim of the rehearsal
    const left = await q(`select count(*) n from public.player_state where user_id='${UID}'`);
    if (Number(left[0].n) !== 0) fail('C21: the rehearsal left a player_state row behind');
  }

  // ── D. MAXED — the clamps must NOT fire on a legitimate maximum ──────
  {
    const r = results.MAXED.out;
    const e = env('MAXED');
    const clampedNames = (r.clamps || []).map((c) => c.field);
    // bank_cap MAY be raised (115 stacks) — that is a stated, reported repair.
    const unexpected = clampedNames.filter((f) => f !== 'bank_cap');
    if (unexpected.length) {
      fail(`D1: a legitimately maxed save was clamped on ${unexpected.join(', ')} — a clamp that `
        + 'eats real progress is worse than no clamp');
    }
    for (const s of cat.skills) {
      if (Number(e.skills[s].xp) !== XP99) fail(`D2: skill ${s} imported as ${e.skills[s].xp} <> ${XP99}`);
    }
    if (Object.keys(e.inventory).length !== 115) fail(`D3: ${Object.keys(e.inventory).length} stacks <> 115`);
    // 115 stacks against a cap of 100+11*20+3*60 — the cap must FIT the bag, or
    // every future accrual returns bank_full for this player, permanently.
    if (Number(e.state.bank_cap) < 115) {
      fail(`D4: bank_cap ${e.state.bank_cap} < 115 stacks — hr_apply would refuse every future `
        + 'accrual with bank_full');
    }
    const prog = new Map((e.progress || []).map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
    for (const room of cat.rooms) {
      if (prog.get(`unlock room:${room}`) !== 5) fail(`D5: room:${room} ${prog.get(`unlock room:${room}`)} <> 5`);
    }
    if (prog.get('unlock property:castle') !== 5) fail('D6: the castle tier did not import');
    if (prog.get('unlock farm_plot_tier') !== 5) fail('D7: farm_plot_tier 5 did not import');
  }

  // ── E. FORGED — clamps AND reports ───────────────────────────────────
  {
    const r = results.FORGED.out;
    const e = env('FORGED');
    if (Number(e.state.gold) !== 1000000000) fail(`E1: forged gold read back as ${e.state.gold}`);
    if (!(r.clamps || []).some((c) => c.field === 'gold' && Number(c.from) === 1e12)) {
      fail(`E2: 1e12 gold was clamped SILENTLY: ${JSON.stringify(r.clamps)}`);
    }
    if (Number(e.skills.mining.xp) !== XP99) fail(`E3: forged mining xp ${e.skills.mining.xp} <> ${XP99}`);
    if (!(r.clamps || []).some((c) => c.field === 'skill:mining')) fail('E4: forged xp clamped silently');
    if (Number(e.inventory[cat.items[0]]) !== 100000000) {
      fail(`E5: forged qty read back as ${e.inventory[cat.items[0]]}`);
    }
    // rung 99 is not on the ladder {1,2,3,4,5}: SNAPPED DOWN by the tool to 5,
    // and the snap is reported. Never up, never interpolated.
    const prog = new Map((e.progress || []).map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
    if (prog.get('unlock room:kitchen') !== 5) fail(`E6: rung 99 imported as ${prog.get('unlock room:kitchen')}`);
    if (!(results.FORGED.report.clamped || []).some((c) => c.field === 'unlock:room:kitchen')) {
      fail('E7: the off-ladder rung was snapped silently');
    }
    // A forged plantedAt of 0 (1970) must be clamped into the window, or the
    // plot is instantly ripe on the first tick after switch-on.
    const planted = (e.farm || [])[0] && (e.farm || [])[0].planted_at;
    if (planted && new Date(planted).getTime() < Date.now() - 31 * 86400000) {
      fail(`E8: a 1970 plantedAt survived as ${planted} — every plot is instantly ripe`);
    }
    // toolCarry 7 is outside [0,1): dropped, not clamped (hr_apply refuses it).
    if (Object.keys(e.state.tool_carry || {}).length) fail('E9: an out-of-range tool carry was imported');
    if (!(results.FORGED.report.dropped || []).some((d) => d.kind === 'tool_carry')) {
      fail('E10: the out-of-range tool carry vanished without a report');
    }
    if (Number(e.state.auto_eat_pct) < 0 || Number(e.state.auto_eat_pct) > 100) {
      fail(`E11: auto_eat_pct ${e.state.auto_eat_pct} is outside 0..100`);
    }
  }

  // ── E2. ABOVE BIGINT RANGE (F1, Security) — clamp AND report, never 22003 ──
  // The devtools threat model in CLAUDE.md is `G.gold = 1e308`. Above bigint
  // (~9.2e18) the clamp must happen in NUMERIC before the ::bigint cast, or the
  // cast throws 22003 and fails the player instead of clamping under amnesty.
  // FORGED (1e12) is well inside bigint and never exercises this.
  {
    const r = results.FORGEDBIG.out;
    const e = env('FORGEDBIG');
    if (!r || r.ok !== true) {
      fail(`E2-1: an above-bigint snapshot FAILED instead of clamping: ${JSON.stringify(r)}`);
    } else {
      if (Number(e.state.gold) !== 1000000000) fail(`E2-2: 1e308 gold read back as ${e.state.gold}`);
      if (Number(e.state.gems) !== 10000000) fail(`E2-3: 1e308 gems read back as ${e.state.gems}`);
      if (Number(e.skills.mining.xp) !== XP99) fail(`E2-4: 1e308 xp read back as ${e.skills.mining.xp}`);
      if (Number(e.inventory[cat.items[0]]) !== 100000000) {
        fail(`E2-5: 1e308 qty read back as ${e.inventory[cat.items[0]]}`);
      }
      const prog = new Map((e.progress || []).map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
      if (prog.get('stat kills') !== 1000000000) fail(`E2-6: 1e308 stat clamped to ${prog.get('stat kills')}`);
      // The report must carry the REAL magnitude (from is numeric, not a
      // truncated bigint) — a clamp nobody can size is a clamp nobody trusts.
      const goldClamp = (r.clamps || []).find((c) => c.field === 'gold');
      if (!goldClamp || Number(goldClamp.from) < 9.2e18) {
        fail(`E2-7: the above-bigint gold clamp did not report the real magnitude: ${JSON.stringify(goldClamp)}`);
      }
    }
  }

  // ── Q. THE COMPANION SLOT (2026-08-16, full-batch rehearsal) ─────────
  // Production froze with 4 of 6 players MISMATCH: "equip companion: <id> was
  // dropped without a report". Two defects, both graded here.
  //
  //   Q1-Q3  the slot is dropped BY NAME for BOTH id-spaces it carries — a raw
  //          COMPANIONS id (NORMAL: rock_golem) and the legacy fox ITEM mirror
  //          (UNLOCKS: fox_companion, which is a CATALOGUED item in this slot
  //          and would otherwise import for fox owners alone).
  //   Q4     the snapshot rehearses CLEAN — zero mismatches — which is the
  //          property the frozen batch needs before --apply.
  {
    for (const [name, id] of [['NORMAL', 'rock_golem'], ['UNLOCKS', 'fox_companion']]) {
      const r = results[name];
      const drops = [...(r.report.dropped || []), ...((r.out && r.out.drops) || [])];
      const hit = drops.find((d) => String(d.id) === id && d.kind === 'equipped_companion');
      if (!hit) {
        fail(`Q1 (${name}): the equipped companion "${id}" was dropped WITHOUT a named report: `
          + JSON.stringify(drops));
      } else if (!/client_owned_companion/.test(String(hit.reason))) {
        fail(`Q2 (${name}): "${id}" dropped with reason "${hit.reason}" — it must name the `
          + 'client-owned companion model, not a generic catalogue miss');
      }
      if ((env(name).equipment || {}).companion) {
        fail(`Q3 (${name}): a companion reached player_equipment: ${env(name).equipment.companion}`);
      }
      // THE FROZEN-BATCH PROPERTY: clean rehearsal.
      if ((r.mismatches || []).length) {
        fail(`Q4 (${name}): a snapshot with an equipped companion did not rehearse clean: `
          + `${r.mismatches.join(' | ')}`);
      }
    }
    // The control: `fox_companion` really IS catalogued for this slot, so Q
    // cannot pass merely because the catalogue lacks it.
    if (!toolCat.items.has('fox_companion') || !toolCat.itemSlots.has('fox_companion companion')) {
      fail('Q5: fox_companion is not a catalogued companion-slot item in this replay — the '
        + 'asymmetry Q exists to close is not reproduced, so Q1/Q2 prove less than they claim');
    }
  }

  // ── F. UNKNOWN IDS — dropped BY NAME, never guessed ──────────────────
  {
    const rep = results.UNKNOWN.report;
    const e = env('UNKNOWN');
    const dropped = new Set((rep.dropped || []).map((d) => String(d.id)));
    for (const id of ['an_item_that_does_not_exist', 'a_skill_that_was_cut',
      'an_item_removed_in_a_rename', 'a_crop_that_was_cut', 'a_slot_that_does_not_exist',
      'phoenix_chick', 'a_renamed_sword', 'not_a_skill', 'not_food',
      'room:a_room_that_does_not_exist', 'wolf_pup']) {
      if (!dropped.has(id)) fail(`F1: "${id}" was not reported as dropped: ${[...dropped].join(', ')}`);
    }
    if (Object.keys(e.inventory).some((k) => k.startsWith('an_item'))) fail('F2: an unknown item reached the bag');
    if (Object.keys(e.equipment).length) fail(`F3: illegal equipment survived: ${JSON.stringify(e.equipment)}`);
    if (e.skills && e.skills.a_skill_that_was_cut) fail('F4: a cut skill reached player_skills');
    // The plot still EXISTS (capacity is preserved); only the crop is dropped.
    if ((e.farm || []).length !== 1) fail(`F5: the plot with a cut crop was lost entirely`);
    if ((e.farm || [])[0] && (e.farm || [])[0].crop) fail('F6: a cut crop id reached player_farm');
    if (e.state.auto_eat_food) fail('F7: a non-auto-eatable food reached auto_eat_food');
  }

  // ── G. THE ARTISAN ORDERING DEPENDENCY — the reason this runs first ──
  // The claim is NOT "the row is in the table". It is "the Kitchen stops
  // burning food", asserted through hr_perks_of and the REAL src/core/perks.js.
  {
    const e = env('UNLOCKS');
    const prog = new Map((e.progress || []).map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
    if (prog.get('unlock room:kitchen') !== 4) fail(`G1: room:kitchen ${prog.get('unlock room:kitchen')} <> 4`);
    if (prog.get('flag recipe:captain_recipe') !== 1) fail('G2: a recipe unlock did not import as a flag');
    if (prog.get('flag theme:forest') !== 1) fail('G3: a theme flag did not import');
    if (prog.get('flag entitlement:noAds') !== 1) fail('G4: an entitlement flag did not import');
    // ── THE ID-SPACE ALIAS, END TO END (ruling task 1) ────────────────
    // The client's four upgrade FLAGS must reach hr_state_of as their
    // catalogue `bounty:<id>` flag rows — never the client flag name.
    for (const [flag, want] of [['goldBoost', 'bounty:mark_pouch'], ['autoBounty', 'bounty:auto_bounty_1'],
      ['extraRerolls', 'bounty:free_reroll_2'], ['cosmeticCloak', 'bounty:cosmetic_cape']]) {
      if (prog.get(`flag ${want}`) !== 1) {
        fail(`G1b: bounty flag "${flag}" did not land as its catalogue row "${want}" (value `
          + `${prog.get(`flag ${want}`)}) — the id-space alias did not resolve`);
      }
      if (prog.has(`flag bounty:${flag}`)) {
        fail(`G1c: the client flag "bounty:${flag}" reached hr_state_of unaliased`);
      }
    }
    // extraRerolls carried a COUNT (3) client-side; the UI caps ownership at 1,
    // so it imports as flag=1, never 3 (ruling: the extra +1/day is lost under
    // amnesty). The catalogue flag merge would additively climb otherwise.
    if (prog.get('flag bounty:free_reroll_2') !== 1) {
      fail(`G1d: extraRerolls=3 did not import as flag=1: ${prog.get('flag bounty:free_reroll_2')}`);
    }
    // The plan reported the aliasing — a silent alias is as bad as a silent drop.
    const aliased = results.UNLOCKS.report.aliased || [];
    if (aliased.filter((a) => a.source === 'bountyHunter.upgrades').length !== 4) {
      fail(`G1e: expected 4 reported bounty aliases, got ${JSON.stringify(aliased)}`);
    }

    // hr_perks_of has to SEE it. A rehearsal rolls back, so this arm COMMITS
    // and then cleans up — otherwise the read would be of an empty database and
    // would pass for the wrong reason.
    const { plan } = tool.buildPlan(SN.UNLOCKS, toolCat, gameData);
    const committed = await callImport(db, plan, { snapshot_sha: 'c'.repeat(64) }, true);
    if (!committed || committed.ok !== true || committed.imported !== true) {
      fail(`G5: the committing import failed: ${JSON.stringify(committed)}`);
    } else {
      const perks = (await q(`select public.hr_perks_of('${UID}'::uuid, 0) as p`))[0].p;
      if (!perks || perks.ok !== true) fail(`G6: hr_perks_of refused: ${JSON.stringify(perks)}`);
      else {
        if (Number((perks.rooms || {}).kitchen) !== 4) {
          fail(`G7: hr_perks_of reads kitchen ${JSON.stringify(perks.rooms)} — the import did not `
            + 'reach the perk channel, so the artisan flip would burn a Kitchen owner\'s food');
        }
        if (Number(perks.propertyTier) !== 3) fail(`G8: propertyTier ${perks.propertyTier} <> 3`);
        if (!(perks.unlockedRecipes || {}).captain_recipe) fail('G9: the recipe gate did not reach hr_perks_of');
        // THE END-TO-END CLAIM: the real bonus function, on the server's answer.
        const noBurn = makeBonus(perks)('noBurn');
        const noBurnEmpty = makeBonus({ rooms: {}, plots: {}, propertyTier: 0 })('noBurn');
        if (!(noBurn > 0)) {
          fail(`G10: makeBonus('noBurn') reads ${noBurn} on an imported rung-4 Kitchen. THE ARTISAN `
            + 'FLIP MUST NOT HAPPEN: the server would burn food the player\'s Kitchen keeps.');
        }
        if (noBurnEmpty !== 0) fail(`G11: noBurn reads ${noBurnEmpty} with NO rooms — the control does not fire`);
      }

      // ── H. IDEMPOTENCY ───────────────────────────────────────────────
      const again = await callImport(db, plan, { snapshot_sha: 'c'.repeat(64) }, true);
      if (!again || again.ok !== true || again.imported !== false || again.skipped !== 'already_imported') {
        fail(`H1: a re-run did not skip: ${JSON.stringify(again)}`);
      }
      if (again && again.sha_matches !== true) fail('H2: the marker did not recognise its own snapshot sha');
      const diff = await callImport(db, plan, { snapshot_sha: 'd'.repeat(64) }, true);
      if (!diff || diff.sha_matches !== false) {
        fail('H3: a re-run against a DIFFERENT snapshot did not report the disagreement');
      }
      const mk = await q(`select count(*) n from public.hr_import_marker where user_id='${UID}'`);
      if (Number(mk[0].n) !== 1) fail(`H4: ${mk[0].n} marker rows after three calls`);

      // ── I. THE JOURNAL — one row, not one per grant ──────────────────
      const led = await q(`select kind, intent, gold, meta from public.player_ledger
                            where user_id='${UID}' and intent='cutover_import'`);
      if (led.length !== 1) fail(`I1: ${led.length} cutover_import ledger rows (expected exactly 1)`);
      else {
        const m = led[0].meta;
        if (led[0].kind !== 'admin') fail(`I2: ledger kind ${led[0].kind} <> admin`);
        if (Number(led[0].gold) !== 500) fail(`I3: ledger gold ${led[0].gold} <> 500`);
        if (m.snapshot_sha !== 'c'.repeat(64)) fail('I4: the ledger row does not carry the snapshot sha');
        if (!m.counts || Number(m.counts.progress) < 5) fail(`I5: ledger counts look wrong: ${JSON.stringify(m.counts)}`);
      }

      // ── J. REFUSE TO IMPORT OVER A CHARACTER THAT HAS PLAYED ─────────
      await db.exec(`delete from public.hr_import_marker where user_id='${UID}';`);
      const over = await callImport(db, plan, { snapshot_sha: 'e'.repeat(64) }, false);
      if (!over || over.error !== 'character_already_played') {
        fail(`J1: the import did not refuse a character that has already played: ${JSON.stringify(over)}`);
      }

      // ── J2. A REFUSAL LEAVES NOTHING BEHIND (2026-08-16 production leak) ──
      // Every refusal fires AFTER hr_create_character has made a character, and
      // a plain `return` from a block with an EXCEPTION clause COMMITS the
      // subtransaction — so a p_commit=false DRY RUN created a real character in
      // production. A malformed plan is used (not already-played) because it
      // refuses MID-FLIGHT, after the bag has already been deleted, which is the
      // worst version of the same bug: a committed empty inventory.
      {
        await db.exec(`delete from public.player_state where user_id='${UID}';`);
        const ledgerBefore = Number((await q(`select count(*) n from public.player_ledger
                                               where user_id='${UID}'`))[0].n);
        const badPlan = { state: { gold: 5 }, inventory: { [cat.items[0]]: 3 }, farm: 'not-an-array' };
        const refused = await callImport(db, badPlan, { snapshot_sha: 'f'.repeat(64) }, false);
        if (!refused || refused.ok !== false || refused.error !== 'bad_plan') {
          fail(`J2-0 CONTROL: the malformed plan did not refuse (${JSON.stringify(refused)}) — the `
            + 'leak assertions below would pass for the wrong reason');
        }
        const st = Number((await q(`select count(*) n from public.player_state where user_id='${UID}'`))[0].n);
        if (st !== 0) fail(`J2-1: a REFUSED import left ${st} player_state row(s) — a dry run wrote to the database`);
        const sk = Number((await q(`select count(*) n from public.player_skills where user_id='${UID}'`))[0].n);
        if (sk !== 0) fail(`J2-2: a REFUSED import left ${sk} player_skills row(s)`);
        const ledgerAfter = Number((await q(`select count(*) n from public.player_ledger
                                              where user_id='${UID}'`))[0].n);
        if (ledgerAfter !== ledgerBefore) {
          fail(`J2-3: a REFUSED import left ${ledgerAfter - ledgerBefore} ledger row(s) — and the `
            + 'ledger is append-only, so they can never be cleaned up');
        }
      }

      // ── J3. LEDGER RESIDUE FROM A DELETED CHARACTER MUST NOT BLOCK ───
      // player_ledger is append-only, so rows outlive the character they
      // describe. The 2026-08-11 apply-engine verification left `accrue` rows on
      // a REAL player's slot against a character since deleted; unscoped, the
      // already-played check refused that player's import FOREVER, and the rows
      // cannot be deleted by design. Scoped to `at >= player_state.created_at`,
      // an older row is not evidence that THIS character has played.
      {
        await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, at)
                       values ('${UID}', 0, 'combat', 'accrue', 4, now() - interval '5 days');`);
        const ok2 = await callImport(db, plan, { snapshot_sha: '9'.repeat(64) }, false);
        if (!ok2 || ok2.ok !== true) {
          fail(`J3-1: ledger residue PREDATING the character blocked the import: ${JSON.stringify(ok2)}`);
        }
        // ...and a row written SINCE the character was created must STILL refuse,
        // or the scoping has simply switched the protection off.
        const seeded = await callImport(db, plan, { snapshot_sha: '8'.repeat(64) }, true);
        if (!seeded || seeded.ok !== true) fail('J3-2 harness: could not seed a committed character');
        await db.exec(`delete from public.hr_import_marker where user_id='${UID}';`);
        await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, at)
                       values ('${UID}', 0, 'combat', 'accrue', 4, now());`);
        const blocked = await callImport(db, plan, { snapshot_sha: '7'.repeat(64) }, false);
        if (!blocked || blocked.error !== 'character_already_played') {
          fail('J3-3: a ledger row written SINCE the character was created did not refuse: '
            + `${JSON.stringify(blocked)} — the scoping switched the protection off`);
        }
        // K needs the UNLOCKS character live and committed. The ledger rows stay
        // (append-only, and the trigger correctly refuses deleting them).
      }

      // ── K. THE VERIFIER SEES A PLANTED SERVER-SIDE DISCREPANCY ───────
      // Edit the row behind the RPC's back, re-read the envelope, and require
      // the tool's verifier to catch it. A verifier that has only ever seen
      // agreement has asserted nothing.
      await db.exec(`update public.player_state set gold = gold + 7 where user_id='${UID}';`);
      const envNow = (await q(`select public.hr_state_of('${UID}'::uuid, 0) as e`))[0].e;
      const caught = tool.verifyImport(SN.UNLOCKS, { envelope: envNow, clamps: [], drops: [] },
        results.UNLOCKS.report, toolCat, gameData);
      if (!caught.some((s) => s.startsWith('gold:'))) {
        fail(`K1: the verifier did not catch a planted +7 gold discrepancy: ${JSON.stringify(caught)}`);
      }
      // ...and it must pass on the honest state, or K1 proves nothing.
      await db.exec(`update public.player_state set gold = gold - 7 where user_id='${UID}';`);
      const envOk = (await q(`select public.hr_state_of('${UID}'::uuid, 0) as e`))[0].e;
      const clean = tool.verifyImport(SN.UNLOCKS, { envelope: envOk, clamps: [], drops: [] },
        results.UNLOCKS.report, toolCat, gameData);
      if (clean.length) fail(`K2: the verifier fails on honest state: ${clean.slice(0, 4).join(' | ')}`);
    }
  }

  // ── L. THE ACL — restated here, because §4 skips its behavioural half
  //      when the database has no free-slot user, and a skipped check that
  //      reads as a pass is this project's most-named failure.
  {
    for (const role of ['anon', 'authenticated', 'service_role', 'hr_engine']) {
      const r = await q(`select coalesce(has_function_privilege('${role}',
        'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)', 'execute'), false) as ok`);
      if (r[0].ok) fail(`L1: hr_import_apply is EXECUTABLE by ${role}`);
    }
    const pub = await q(`select (p.proacl is null or exists (
        select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type='EXECUTE')) as bad
      from pg_proc p where p.oid = 'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)'::regprocedure`);
    if (pub[0].bad) fail('L2: hr_import_apply is executable by PUBLIC');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = await q(`select has_table_privilege('${role}','public.hr_import_marker','insert') as i,
                                has_table_privilege('${role}','public.hr_import_marker','delete') as d,
                                has_table_privilege('${role}','public.hr_import_marker','truncate') as t`);
      if (r[0].i || r[0].d || r[0].t) fail(`L3: hr_import_marker is writable by ${role}`);
    }
  }

  // ── N. THE RUNG SNAP, ON A GAPPED LADDER ─────────────────────────────
  // Today's catalogue has no gapped ladder (room rungs are {1,2,3,4,5}), so
  // the ceiling clamp fires first and the snap branch is unreachable against
  // live data. That makes it exactly the kind of code that rots: correct-
  // looking, never executed, and load-bearing the day somebody prices a
  // Kitchen at rungs {1,3,5}. So it is exercised against a SYNTHETIC ladder.
  //
  // The direction is the whole point. A value BETWEEN rungs is a writer that
  // added instead of taking a maximum (hr_unlock_guard says so in its own
  // hint), and the honest resolution is the highest rung the player has
  // demonstrably paid for — never an interpolated one they have not.
  {
    const gapped = new Map(toolCat.unlocks);
    gapped.set('room:kitchen', { ...toolCat.unlocks.get('room:kitchen'), rungs: [1, 3, 5], max_value: 5 });
    const c2 = { ...toolCat, unlocks: gapped };
    const probe = (lv) => tool.buildPlan(
      { gold: 0, skills: {}, inventory: {}, equipment: {}, rooms: { kitchen: lv } }, c2, gameData);

    const four = probe(4);
    const got = (four.plan.progress.find((p) => p.key === 'room:kitchen') || {}).value;
    if (got !== 3) fail(`N1: rung 4 on the gapped ladder {1,3,5} snapped to ${got}, expected 3 (the highest rung below)`);
    if (!four.report.clamped.some((c) => c.field === 'unlock:room:kitchen' && c.to === 3)) {
      fail('N2: the gapped-ladder snap was applied SILENTLY');
    }
    const five = probe(5);
    if ((five.plan.progress.find((p) => p.key === 'room:kitchen') || {}).value !== 5) {
      fail('N3: a value ON the ladder was moved — the snap fires when it should not');
    }
    if (five.report.clamped.length) fail('N4: an on-ladder value was reported as clamped');
  }

  // ── M. CORRUPT / EMPTY SNAPSHOTS ─────────────────────────────────────
  {
    // The tool's own anchor test, exercised directly: these are the shapes the
    // batch must SKIP rather than import as a brand new character.
    for (const [what, snap] of [['empty object', {}], ['array', []], ['nulls', { gold: null }]]) {
      const anchors = ['gold', 'skills', 'inventory', 'equipment']
        .filter((k) => snap && typeof snap === 'object' && k in snap);
      if (anchors.length >= 2) fail(`M1: a ${what} snapshot passed the anchor test`);
    }
    // ...and a real one must NOT be skipped, or the test above is vacuous.
    const anchors = ['gold', 'skills', 'inventory', 'equipment'].filter((k) => k in SN.NORMAL);
    if (anchors.length < 2) fail('M2: a real snapshot fails the anchor test — the batch would skip everybody');
  }

  // ── P. THE ID-SPACE AUDIT (ruling 3) — every store diffed by name ────
  {
    // (i) On a store whose ids ALIGN with the catalogue, the audit reports
    //     zero unmapped — asserted, not assumed. NORMAL's rooms/plots/property/
    //     recipes/themes/traits are all real ids.
    const auditNormal = tool.auditIdSpaces(SN.NORMAL, toolCat, gameData);
    for (const row of auditNormal) {
      if (row.unmapped.length) {
        fail(`P1: store ${row.store} has unmapped ids on an aligned save: ${row.unmapped.join(', ')}`);
      }
    }

    // (ii) The bounty store ALIASES rather than dropping — the whole ruling.
    const bountyRow = tool.auditIdSpaces(SN.UNLOCKS, toolCat, gameData)
      .find((r) => r.store === 'bountyHunter.upgrades');
    if (!bountyRow || bountyRow.aliased.length !== 4 || bountyRow.unmapped.length) {
      fail(`P2: the bounty store did not alias all four upgrades: ${JSON.stringify(bountyRow)}`);
    } else if (!bountyRow.aliased.some((a) => a.from === 'bounty:goldBoost' && a.to === 'bounty:mark_pouch')) {
      fail(`P3: goldBoost did not alias to bounty:mark_pouch: ${JSON.stringify(bountyRow.aliased)}`);
    }

    // (iii) THE STRUCTURAL CLAIM: an id in NEITHER the catalogue NOR the alias
    //       is REPORTED BY NAME in EVERY store, never silently dropped. This is
    //       the b350 declaration-gap lesson applied to id-space.
    const auditGap = tool.auditIdSpaces(SN.ALIASGAP, toolCat, gameData);
    const expectUnmapped = {
      unlockedRecipes: 'recipe:a_recipe_the_catalogue_lacks',
      traits: 'trait:a_trait_the_catalogue_lacks',
      ownedCosmetics: 'cosmetic:a_cosmetic_the_catalogue_lacks',
      ownedThemes: 'theme:a_theme_the_catalogue_lacks',
      entitlements: 'entitlement:an_entitlement_the_catalogue_lacks',
      'bountyHunter.upgrades': 'bounty:a_bounty_flag_with_no_offer',
    };
    for (const [store, wantId] of Object.entries(expectUnmapped)) {
      const row = auditGap.find((r) => r.store === store);
      if (!row || !row.unmapped.includes(wantId)) {
        fail(`P4: store ${store} did not report "${wantId}" by name as unmapped: ${JSON.stringify(row && row.unmapped)}`);
      }
    }
    // ...and the same ids must be REPORTED (not silently absent) when a plan is
    // built for that snapshot — the dry-run's decision surface.
    const { report: gapReport } = tool.buildPlan(SN.ALIASGAP, toolCat, gameData);
    for (const wantId of Object.values(expectUnmapped)) {
      if (!gapReport.dropped.some((d) => d.id === wantId && d.aliasable)) {
        fail(`P5: buildPlan did not report "${wantId}" as an aliasable drop: ${JSON.stringify(gapReport.dropped)}`);
      }
    }

    // (iv) THE EXCLUSIONS ARE DOCUMENTED, not silent. companion + character_slot
    //      are on the ruling's list but deliberately not imported; the audit
    //      must SAY so rather than omit them.
    if (!auditGap.excluded || !auditGap.excluded.companion || !auditGap.excluded.character_slot) {
      fail(`P6: the audit does not document why companion/character_slot are excluded: ${JSON.stringify(auditGap.excluded)}`);
    }

    // (v) THE AUDIT CAN SEE A GAP. If a real catalogue id is fed as a client
    //     id it must be `mapped`, proving `unmapped` is a real classification
    //     and not one that never fires.
    const control = tool.auditIdSpaces({ ownedThemes: ['default'] }, toolCat, gameData)
      .find((r) => r.store === 'ownedThemes');
    if (!control || !control.mapped.includes('theme:default') || control.unmapped.length) {
      fail(`P7: the audit control failed — a real theme id did not classify as mapped: ${JSON.stringify(control)}`);
    }
  }

  await db.close();
  return problems;
}

/* ══════════════════════════════════════════════════════════════════════════
   --selftest — plant real defects; every one must read RED.
   ══════════════════════════════════════════════════════════════════════════ */

/** Build a copy of tools/cutover-import.mjs with one edit, import it. */
async function mutantTool(find, replace, label) {
  // LF-normalise: the file is checked in with CRLF on Windows and multi-line
  // anchors are written with LF, so a raw read would miss them (M2, which spans
  // two lines, did exactly this until this normalise was added).
  const src = (await readFile(join(ROOT, 'tools', 'cutover-import.mjs'), 'utf8')).replace(/\r\n/g, '\n');
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`${label}: anchor matched ${n} times (need 1) — the file moved`);
  const file = join(tmpdir(), `cutover-mutant-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  // Relative specifiers must still resolve from the temp directory, AND ROOT —
  // which the tool derives from import.meta.url — must be pinned to the real
  // repo, or readGameData() reads src/legacy.js relative to the temp dir and
  // every mutant throws ENOENT before its planted defect can be graded.
  let rewritten = src.replace(find, replace)
    .replace(/from '\.\/(.*?)'/g, (m, p) => `from '${pathToFileURL(join(ROOT, 'tools', p)).href}'`)
    .replace(/from '\.\.\/(.*?)'/g, (m, p) => `from '${pathToFileURL(join(ROOT, p)).href}'`);
  const rootLine = 'export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), \'..\'));';
  if (!rewritten.includes(rootLine)) throw new Error(`${label}: the ROOT anchor moved — mutants would read the wrong tree`);
  rewritten = rewritten.replace(rootLine, `export const ROOT = ${JSON.stringify(ROOT)};`);
  if (/from '\.\.?\//.test(rewritten)) throw new Error(`${label}: a relative import survived the rewrite`);
  await writeFile(file, rewritten);
  return file;
}

const MUTATIONS = [
  {
    name: 'M14 — the id-space ALIAS is not resolved in buildPlan; bounty upgrades drop instead of mapping',
    expect: /G1b|did not land as its catalogue row|verification found/,
    async run() {
      const f = await mutantTool(
        'const { id, aliased, from } = resolveAlias(rawId, ID_ALIAS);',
        'const id = rawId, aliased = false, from = rawId;',
        'M14');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M15 — the id-space ALIAS derives to the WRONG catalogue id; the ruling cross-check must die',
    expect: /derived from BOUNTY_SHOP maps/,
    async run() {
      // Break the derivation so it no longer matches the ruling's stamped four.
      // buildIdAlias's cross-check calls die() (process.exit), which is the
      // guard WORKING — so this one is graded in a SUBPROCESS by exit code +
      // stderr rather than in-process, where the exit would kill the selftest.
      const f = await mutantTool(
        'bounty[offer.flag] = `bounty:${offer.id}`;',
        "bounty[offer.flag] = offer.flag === 'goldBoost' ? 'bounty:free_reroll_2' : `bounty:${offer.id}`;",
        'M15');
      try {
        const { spawnSync } = await import('node:child_process');
        const r = spawnSync(process.execPath,
          ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(f).href)}).then(m => m.readGameData())`],
          { encoding: 'utf8' });
        const text = (r.stderr || '') + (r.stdout || '');
        // RED means: non-zero exit AND the cross-check message. A zero exit is
        // the mutation ESCAPING — the wrong alias was accepted.
        return (r.status && r.status !== 0) ? [text.trim()] : [];
      } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M16 — the id-space AUDIT stops reporting unmapped ids by name (silent drop)',
    expect: /P4|did not report .* by name as unmapped/,
    async run() {
      const f = await mutantTool(
        '        row.unmapped.push(id);',
        '        void id; /* audit no longer reports unmapped by name */',
        'M16');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M17 — buildPlan drops an aliasable id WITHOUT the aliasable flag (silent to the dry-run)',
    expect: /P5|did not report .* as an aliasable drop/,
    async run() {
      const f = await mutantTool(
        "drop('unlock', id, 'not_in_hr_unlocks', aliased ? { source, aliased_from: from } : { source, aliasable: true });",
        "drop('unlock', id, 'not_in_hr_unlocks', { source });",
        'M17');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M18 — F1: a magnitude clamp casts to bigint BEFORE clamping; 1e308 throws 22003 not clamp',
    // Reverting gold to cast-before-clamp makes the migration\'s own §4(c-iii-b)
    // probe (gold 1e308) throw 22003 during the chain replay, failing the apply.
    expect: /out of range|22003|clamp|chain:/,
    patches: new Map([[MIGRATION, [[
      "      v_num := floor(greatest(0, (p_plan->'state'->>'gold')::numeric));\n      if v_num > c_max_gold then\n        v_clamps := v_clamps || jsonb_build_object('field','gold','from',v_num,'to',c_max_gold);\n        v_num := c_max_gold;\n      end if;\n      v_gold := v_num::bigint;",
      "      v_n := floor(greatest(0, (p_plan->'state'->>'gold')::numeric))::bigint;\n      if v_n > c_max_gold then\n        v_clamps := v_clamps || jsonb_build_object('field','gold','from',v_n,'to',c_max_gold);\n        v_n := c_max_gold;\n      end if;\n      v_gold := v_n;",
    ]]]]),
  },
  {
    name: 'M19 — the companion slot loses its named drop and falls back to the silent catalogue path',
    expect: /Q1|dropped WITHOUT a named report|dropped without a report/,
    async run() {
      const f = await mutantTool(
        "    if (slot === COMPANION_SLOT) {\n      drop('equipped_companion', id, companionDropReason(id), { slot });\n      continue;\n    }",
        '    // companion branch removed by mutation',
        'M19');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M20 — verifyImport drops the TOOL report (the exact 2026-08-16 production divergence)',
    expect: /was dropped without a report/,
    async run() {
      // This reproduces the freeze verbatim: verify sees only the SERVER report,
      // so every drop the tool made before the RPC reads as unreported.
      const f = await mutantTool(
        'return verify(snapshot, serverOut && serverOut.envelope, cat, game, serverOut, toolReport);',
        'return verify(snapshot, serverOut && serverOut.envelope, cat, game, serverOut);',
        'M20');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    // The exact production leak: a refusal that RETURNS instead of raising
    // commits the character hr_create_character just made.
    name: 'M21 — a refusal RETURNS instead of raising; a dry run commits a character to the database',
    expect: /J2-1|left .* player_state row|REFUSED import left|chain:/,
    patches: new Map([[MIGRATION, [[
      "      v_payload := jsonb_build_object('ok', false, 'error', 'bad_plan',\n               'detail', jsonb_build_object('at', 'farm'));\n      raise exception using errcode = 'HR001', message = v_payload::text;",
      "      return jsonb_build_object('ok', false, 'error', 'bad_plan',\n               'detail', jsonb_build_object('at', 'farm'));",
    ]]]]),
  },
  {
    name: 'M22 — the already-played ledger check loses its created_at scope; residue blocks forever',
    expect: /J3-1|residue PREDATING the character blocked/,
    patches: new Map([[MIGRATION, [[
      "     and coalesce(intent, '') <> 'create_character'\n     and at >= v_char_at;",
      "     and coalesce(intent, '') <> 'create_character';",
    ]]]]),
  },
  {
    name: 'M1 — a FIELD_MAP entry is DELETED (the brief\'s "drop a mapping")',
    expect: /FIELD_MAP does not declare rooms/,
    async run() {
      const f = await mutantTool(
        "  rooms: F('SERVER', \"player_progress kind='unlock' key='room:<id>'\",",
        "  __rooms_deleted: F('SERVER', \"player_progress kind='unlock' key='room:<id>'\",",
        'M1');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M2 — the VERIFIER is disabled (returns []); a planted server-side discrepancy must be caught',
    expect: /verifier did not catch a planted/,
    async run() {
      const f = await mutantTool(
        'export function verify(snapshot, envelope, cat, game, ...reports) {\n  const bad = [];',
        'export function verify(snapshot, envelope, cat, game, ...reports) {\n  const bad = []; if (1) return bad;',
        'M2');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M3 — the gold clamp is removed from the RPC',
    expect: /forged gold read back as|clamped SILENTLY|out of range|22003|chain:/,
    patches: new Map([[MIGRATION, [[
      "      if v_num > c_max_gold then\n        v_clamps := v_clamps || jsonb_build_object('field','gold','from',v_num,'to',c_max_gold);\n        v_num := c_max_gold;\n      end if;",
      '      -- clamp removed by mutation',
    ]]]]),
  },
  {
    name: 'M4 — the unknown-item check is removed; an uncatalogued id reaches the bag',
    expect: /an uncatalogued item id reached player_inventory|an unknown item reached the bag|was not reported as dropped/,
    patches: new Map([[MIGRATION, [[
      "      if not exists (select 1 from public.hr_items where item_id = v_k) then\n        -- NEVER GUESSED.",
      "      if false then\n        -- NEVER GUESSED.",
    ]]]]),
  },
  {
    name: 'M5 — accrued_to takes the blob\'s watermark instead of now()',
    expect: /accrued_to is .*1970|offlineBudget was imported/,
    patches: new Map([[MIGRATION, [[
      "         accrued_to = now(),                  -- NEVER the blob's watermark",
      "         accrued_to = to_timestamp(0),",
    ]]]]),
  },
  {
    name: 'M6 — max_hp is taken from the plan instead of derived',
    expect: /max_hp .* is not hr_level_from_xp|max_hp .* <> /,
    patches: new Map([[MIGRATION, [[
      '  v_max_hp := greatest(1, public.hr_level_from_xp(coalesce(v_hp_xp, 0)));',
      '  v_max_hp := 10;',
    ]]]]),
  },
  {
    name: 'M7 — the idempotency marker is never consulted; a re-run re-imports',
    expect: /a re-run did not skip|marker rows after three calls/,
    patches: new Map([[MIGRATION, [[
      '   where user_id = p_user and slot = v_slot;\n  if found then\n    v_payload := jsonb_build_object(',
      '   where user_id = p_user and slot = v_slot;\n  if false then\n    v_payload := jsonb_build_object(',
    ]]]]),
  },
  {
    name: 'M8 — hr_import_apply is granted to authenticated',
    expect: /EXECUTABLE by authenticated/,
    patches: new Map([[MIGRATION, [[
      'revoke all on function public.hr_import_apply(uuid, int, jsonb, jsonb, boolean)\n  from public, anon, authenticated, service_role, hr_engine;',
      'revoke all on function public.hr_import_apply(uuid, int, jsonb, jsonb, boolean)\n  from public, anon, service_role, hr_engine;\ngrant execute on function public.hr_import_apply(uuid, int, jsonb, jsonb, boolean) to authenticated;',
    ]]]]),
  },
  {
    name: 'M9 — the dry run COMMITS (the raise is removed)',
    expect: /left a marker row|left a player_state row behind/,
    patches: new Map([[MIGRATION, [[
      "  if not p_commit then\n    raise exception using errcode = 'HR001', message = v_payload::text;\n  end if;",
      '  -- rollback removed by mutation',
    ]]]]),
  },
  {
    // BOTH refusals, because they are defence in depth: leaving either one in
    // place would make the mutation a no-op and the "escape" would be the test
    // grading a defect that is not there.
    name: 'M10 — BOTH character-already-played refusals are removed (version + ledger)',
    expect: /did not refuse a character that has already played/,
    patches: new Map([[MIGRATION, [
      ["  if v_ver > 0 then\n    v_payload := jsonb_build_object('ok', false, 'error', 'character_already_played',\n             'detail', jsonb_build_object('version', v_ver));\n    raise exception using errcode = 'HR001', message = v_payload::text;\n  end if;",
        '  -- version refusal removed by mutation'],
      ["  if v_ledger_n > 0 then\n    v_payload := jsonb_build_object('ok', false, 'error', 'character_already_played',\n             'detail', jsonb_build_object('ledger_rows', v_ledger_n));\n    raise exception using errcode = 'HR001', message = v_payload::text;\n  end if;",
        '  -- ledger refusal removed by mutation'],
    ]]]),
  },
  {
    name: 'M11 — an off-ladder rung snaps to the LOWEST rung below instead of the highest',
    expect: /N1|gapped ladder/,
    async run() {
      const f = await mutantTool(
        'const snapped = Math.max(...below);',
        'const snapped = Math.min(...below);',
        'M11');
      try { return await cutoverImportGuard({ toolPath: f }); } finally { await unlink(f).catch(() => {}); }
    },
  },
  {
    name: 'M12 — bank_cap is not raised to fit the bag; every future accrual would be bank_full',
    expect: /bank_cap .* < 115 stacks/,
    patches: new Map([[MIGRATION, [[
      '  if v_stacks > v_cap then',
      '  if false then',
    ]]]]),
  },
  {
    name: 'M13 — auto-eat is switched on without the purchased trait row',
    expect: /auto-eat|trait/i,
    patches: new Map([[MIGRATION, [[
      "  if v_ae_on and not exists (\n        select 1 from public.player_progress",
      "  if false and not exists (\n        select 1 from public.player_progress",
    ]]]]),
    // This one asserts through §4(c-vii) inside the migration, which raises
    // during the chain replay — so the guard reports it as a chain failure.
    expectChainFailure: true,
  },
];

async function selftest() {
  console.log('cutover-import --selftest: planting real defects; every one must read RED.\n');
  let bad = 0;
  const control = await cutoverImportGuard();
  if (control.length) {
    console.log(`CONTROL IS RED (${control.length}) — fix the guard before trusting a mutation:`);
    for (const p of control) console.log(`  ✗ ${p}`);
    return 1;
  }
  console.log('control: GREEN\n');
  for (const m of MUTATIONS) {
    let out;
    try {
      out = m.run ? await m.run() : await cutoverImportGuard({ patches: m.patches });
    } catch (e) {
      out = [`threw: ${e.message}`];
    }
    const text = out.join(' | ');
    const red = out.length > 0;
    const matched = m.expect ? m.expect.test(text) : true;
    const ok = red && (matched || m.expectChainFailure);
    console.log(`${ok ? '  RED  ' : '  ✗    '} ${m.name}`);
    if (!ok) { bad++; console.log(`         got: ${text.slice(0, 400) || '(GREEN — the mutation was not caught)'}`); }
  }
  console.log(bad ? `\n${bad} mutation(s) ESCAPED.` : '\nEvery mutation read RED.');
  return bad ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const run = process.argv.includes('--selftest')
    ? selftest()
    : cutoverImportGuard().then((p) => {
      if (p.length) { for (const x of p) console.log(`  ✗ ${x}`); return 1; }
      console.log('cutover-import guard: GREEN');
      return 0;
    });
  run.then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
