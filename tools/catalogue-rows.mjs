// ════════════════════════════════════════════════════════════════════════
// tools/catalogue-rows.mjs — THE derivation of hr_items / hr_item_slots /
// hr_activities from src/data/*.js. Exactly one copy of it, imported by both
// consumers.
//
// WHY IT IS ITS OWN FILE (2026-09-13, Security finding F2)
//   tools/gen-catalogues.mjs held this derivation inline, and it is a script:
//   importing it WRITES the generated migrations. So the new drift guard
//   (tests/catalogue-literal-drift.mjs) could not reuse it, and the only other
//   option was to re-type the mapping a second time — a fourth copy of the game
//   data's shape, inside the very file whose job is to prove there are not
//   several copies. A guard that restates what it guards cannot be trusted: it
//   goes red when the two restatements disagree, not when the DATA drifts.
//   Moving the derivation here is a pure move — `node tools/gen-catalogues.mjs
//   --check` is byte-for-byte proof that the generated SQL is unchanged.
//
// Everything below the function header is the original text from
// gen-catalogues.mjs, unaltered apart from its imports being hoisted into the
// function. Do not "tidy" it here: its comments are the record of why each
// column exists, and gen-catalogues.mjs is no longer the place to read them.
// ════════════════════════════════════════════════════════════════════════

import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/** The three catalogue tables Security finding F2 covers, derived from
 *  src/data. Pure: it reads the data modules and returns rows; it writes
 *  nothing, so a guard may import it. */
export async function deriveCatalogueRows() {
const { ITEMS, isAutoEatable } = await imp('src/data/items.js');
const { TREES, ROCKS, FISH_SPOTS, expandItemSlot } = await imp('src/data/gathering.js');
const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
const { MONSTERS } = await imp('src/data/monsters.js');

const itemIds = Object.keys(ITEMS).sort();
const items = itemIds.map((id) => {
  const it = ITEMS[id] || {};
  return {
    item_id: id,
    name: String(it.n ?? id),
    // `bop` = bind-on-pickup = untradeable. Absence means tradeable.
    tradeable: !it.bop,
    kind: it.type ?? null,
    value: Number.isFinite(it.v) ? Math.trunc(it.v) : 0,
    req_skill: it.reqSkill ?? null,
    req_lv: Number.isFinite(it.reqLv) ? Math.trunc(it.reqLv) : null,
    heals: Number.isFinite(it.heals) ? Math.trunc(it.heals) : null,
    /* AUTO-EATABLE — `foodClassOf(it) === 'healing'`, straight out of
       src/data/items.js. It cannot be derived in SQL from `heals` alone: a
       Feast or a Draught (`foodClass: 'buff'`) heals too, and auto-eat must
       never burn one (b220 — "auto-eat burning a Void Banquet to soak one wolf
       hit is the failure this rule exists to prevent"). Without this column
       hr_set_auto_eat would accept a Void Banquet as a nominated food, store
       it, and then the engine would silently ignore it — a UI that says one
       thing while the engine does another, which is the b341 failure class. */
    auto_eatable: isAutoEatable(it),
  };
});

const itemSlots = [];
for (const id of itemIds) {
  const raw = ITEMS[id]?.slot;
  if (!raw) continue;
  for (const s of expandItemSlot(raw)) itemSlots.push({ item_id: id, equip_slot: s });
}
itemSlots.sort((a, b) => (a.item_id + a.equip_slot).localeCompare(b.item_id + b.equip_slot));

const activities = [];
//
// `max_hp` is the MONSTER'S HIT POINTS, and it is null for every non-combat
// row. It exists because Phase 0 of docs/design/live-settlement.md carries an
// in-flight fight across accrual windows as `player_state.fight`, and hr_apply
// has to RE-DERIVE the ceiling that fight's HP must lie under rather than trust
// the number the Edge Function proposed. Before this column the server held no
// monster HP anywhere — there is no hr_monsters table — so the re-clamp the
// spec asks for was not expressible in SQL at all.
// GENERATED from src/data/monsters.js, never retyped: a hand-copied HP table is
// exactly the data double-copy this repo has been burned by, and here the copy
// would be the CLAMP, so drift would silently widen or narrow it.
const pushNodes = (arr, skill) => {
  for (const n of arr) activities.push({
    kind: 'gather', activity_id: n.id, req_skill: skill, req_lv: Math.trunc(n.req ?? 1),
    max_hp: null, is_boss: false,
  });
};
pushNodes(TREES, 'woodcutting');
pushNodes(ROCKS, 'mining');
pushNodes(FISH_SPOTS, 'fishing');
for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
  for (const r of list) activities.push({
    kind: 'artisan', activity_id: r.id, req_skill: skill, req_lv: Math.trunc(r.req ?? 1),
    max_hp: null, is_boss: false,
  });
}
for (const id of Object.keys(MONSTERS).sort()) {
  const hp = Math.trunc(Number(MONSTERS[id].hp));
  /* FAIL THE GENERATOR, not the migration. A monster with no positive HP would
     emit a null ceiling, and a null ceiling makes hr_apply's fight clamp
     vacuous for that id — the clamp would still be there, still run, and still
     admit anything. An unauthored number that disables a control is worse than
     an absent control, so it is a build failure here. */
  if (!Number.isFinite(hp) || hp <= 0) {
    throw new Error(`monster '${id}' has hp ${JSON.stringify(MONSTERS[id].hp)} — every combat `
      + 'activity must carry a positive max_hp, because hr_apply clamps a carried fight against it');
  }
  /* is_boss — the ONLY server source of "which monster is a boss", generated
     from src/data/monsters.js so the renown `bossKill` term (5 renown per boss
     felled, src/features/renown.js W.bossKill) can be derived from the Slice 1
     `ev:kill_monster:<id>` population WITHOUT a hand-typed boss list in SQL.
     A hand-typed list would be exactly the data double-copy this generator
     exists to prevent, and it would be the CLAMP on a rankable surface, so
     drift would silently mis-score renown. `hr_renown_of` joins the bestiary
     rows against `hr_activities where is_boss`. */
  activities.push({ kind: 'combat', activity_id: id, req_skill: null, req_lv: null,
    max_hp: hp, is_boss: MONSTERS[id].boss === true });
}
activities.sort((a, b) => (a.kind + a.activity_id).localeCompare(b.kind + b.activity_id));

return { itemIds, items, itemSlots, activities };
}
