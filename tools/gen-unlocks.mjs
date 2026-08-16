#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-unlocks.mjs — THE UNLOCK CATALOGUE, EXTRACTED, with a drift guard.
//
//   node tools/gen-unlocks.mjs            → (re)write the generated migration
//   node tools/gen-unlocks.mjs --check    → exit 1 if the committed file differs
//   node tools/gen-unlocks.mjs --report   → print the extraction, namespace by
//                                           namespace
//
// ── WHAT IT EMITS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
// It emits `public.hr_unlocks`: for every unlock id the game can grant, HOW
// TWO WRITES TO IT COMBINE, which `player_progress.kind` stores it, its
// ceiling, and (for a level) the rung ladder that is actually sold.
//
// It does NOT emit a single game NUMBER. There is no `noBurn` here, no rung
// payload, no price. `room:kitchen` appears as "a level, stored as kind
// 'unlock', rungs {1,2,3,4,5}" and nothing else; the magnitude 0.25 lives in
// src/data/perks.js and is read by src/core/perks.js on BOTH sides. That
// split is the 2026-08-15 architecture decision — if an operation needs the
// game's RULES it is JavaScript, if it is pure bookkeeping it is a database
// function — and it is what keeps 40 rung payloads out of SQL. A second copy
// of game data in the database is the failure src/main.js `unifyObject` was
// written about.
//
// ── THE MERGE RULE IS DECLARED PER NAMESPACE, NEVER INFERRED ────────────
// Every inference rule anyone proposes is wrong on real rows in this
// catalogue:
//   · `property:homestead` grants amount 1 and is a LEVEL (tier 1 of 5)
//   · `theme:forest`       grants amount 1 and is a FLAG
//   · `plot:scarecrow`     grants amount 1 and is a COUNT (max 2, and
//                          getBonus pays PER INSTANCE — two Scarecrows really
//                          are +2 farmYield)
// Three identical `amount: 1` rows, three different merge rules. So NAMESPACES
// is a declaration, and an unlock id in a namespace nobody declared FAILS
// GENERATION rather than defaulting to anything. (This reasoning is inherited
// from the parked economy-substrate branch `worktree-agent-a079e5c2e5260c6f8`,
// which reached it first and measured it on these same rows.)
//
// ── WHY `progress_kind` IS THE WRITE CAPABILITY, NOT A TAXONOMY ─────────
// `player_progress.kind` decides who may write the row, because `hr_apply`'s
// progress block accepts SIX kinds and merges them `value = value + add`:
//
//   kind='flag'    IN hr_apply's allowlist. Additive. Booleans, where additive
//                  is harmless — paying twice yields 2, which reads as 1 does.
//                  This is what `unlockedRecipes` needs: the accrual engine
//                  must be able to grant a recipe scroll it rolled itself.
//   kind='stat'    IN the allowlist. Additive. COUNTS — plot buildings,
//                  workers — where additive is CORRECT.
//   kind='unlock'  NOT in the allowlist, deliberately. MAX. LEVELS — room
//                  rungs, property tiers, farm plot tiers. Under an additive
//                  merge, buying the 500g Hearthstone twice would yield
//                  room:kitchen = 2, i.e. the 2,000g Iron Stove for 1,000g.
//                  `hr_apply` structurally cannot reach a rung.
//
// So the two artisan shapes want OPPOSITE write capabilities and `kind` is
// exactly the axis that expresses it: a recipe scroll is EARNED by playing
// (engine-writable, flag), a Kitchen rung is BOUGHT with gold (engine-proof,
// unlock, written only by a spend RPC).
//
// ── SOURCES ────────────────────────────────────────────────────────────
//   src/data/shops.js       every purchasable unlock grant (93 grants today)
//   src/data/recipes.js     ARTISAN_RECIPES `gated:` — the recipe SCROLL ids
//   src/data/items.js       items with `recipe: true` — anything that can
//                           enter a bag and auto-unlock, so a scroll that
//                           gates nothing still has a catalogued home rather
//                           than costing a night to `bad_delta`
//   src/data/perks.js       ROOM_PERKS ladder LENGTHS, cross-checked against
//                           the rungs the shop actually sells
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHOP_OFFERS } from '../src/data/shops.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ITEMS } from '../src/data/items.js';
import { ROOM_PERKS } from '../src/data/perks.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'supabase', 'migrations', '2026-08-16-unlocks.generated.sql');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');

function die(msg) {
  console.error(`gen-unlocks: ${msg}`);
  process.exit(1);
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · THE DECLARATION. One row per namespace, and nothing may be absent.

   `merge`         how two writes combine — the thing a generic writer can get
                   catastrophically wrong.
   `progress_kind` which player_progress.kind stores it — i.e. WHO MAY WRITE IT
                   (see the header). null iff merge is 'none'.
   `why`           kept in the emitted SQL, because the next person to add a
                   namespace has to make this decision and the reasoning is the
                   only thing that makes it makeable.
   ══════════════════════════════════════════════════════════════════════════ */
const NAMESPACES = {
  room: {
    merge: 'max', progress_kind: 'unlock',
    why: 'A rung ladder. hr_apply must not be able to climb it additively.',
  },
  property: {
    merge: 'max', progress_kind: 'unlock',
    why: 'The homestead tier ladder; the capstone fires at tier 5.',
  },
  farm_plot_tier: {
    merge: 'max', progress_kind: 'unlock',
    why: 'A tier ladder with no colon in its id — the id IS the namespace.',
  },
  plot: {
    merge: 'count', progress_kind: 'stat',
    why: 'REPEATABLE. getBonus pays per INSTANCE owned, so the row holds a '
       + 'count and additive merge is correct. Two Scarecrows are +2 farmYield.',
  },
  worker: {
    merge: 'count', progress_kind: 'stat',
    why: 'Repeatable hire, one id, no colon. Additive is correct.',
  },
  recipe: {
    merge: 'flag', progress_kind: 'flag',
    why: 'THE ARTISAN GATE. Boolean, and it must be writable by the accrual '
       + 'engine through hr_apply when the engine\'s own drop roll yields the '
       + 'scroll — which is exactly what kind=flag buys. Additive is harmless: '
       + 'two scrolls read the same as one.',
  },
  trait: {
    merge: 'flag', progress_kind: 'flag',
    why: 'trait:auto_eat, and hr_set_auto_eat (applied, live) already reads '
       + "kind='flag' and value > 0. Untouched by this catalogue.",
  },
  bounty: { merge: 'flag', progress_kind: 'flag', why: 'Boolean bounty-board upgrades.' },
  // ── CUTOVER IMPORT RULING (game-designer, 2026-08-15, binding) ──────────
  // The client stores bounty upgrades in G.bountyHunter.upgrades under FLAG
  // names (src/legacy.js BOUNTY_SHOP `flag:`), NOT the catalogue id. The import
  // tool MUST alias flag -> catalogue id. Mapping is 1:1 and unambiguous (one
  // shop offer per flag; the `_1`/`_2` suffixes are id text, NOT tiers, and the
  // bounty namespace has NO rungs). ALIAS ALL FOUR, DROP NONE:
  //   goldBoost     -> bounty:mark_pouch
  //   autoBounty    -> bounty:auto_bounty_1
  //   extraRerolls  -> bounty:free_reroll_2   (client stores a count via incr,
  //                    but the UI caps ownership at 1, so import as flag=1;
  //                    a legacy save with >1 loses only the extra +1/day, under
  //                    the pre-cutover amnesty — acceptable)
  //   cosmeticCloak -> bounty:cosmetic_cape
  // `reroll_token` is a repeatable consumable that leaves NO upgrades key —
  // nothing to import. This is the FIRST INSTANCE of a class: client id-space
  // != server catalogue id-space at import. Audit unlockedRecipes/traits/
  // cosmetics/room-perks the same way in the dry-run.
  character_slot: { merge: 'flag', progress_kind: 'flag', why: 'Boolean per slot id.' },
  companion: { merge: 'flag', progress_kind: 'flag', why: 'Owned or not.' },
  cosmetic: { merge: 'flag', progress_kind: 'flag', why: 'Owned or not.' },
  entitlement: { merge: 'flag', progress_kind: 'flag', why: 'Owned or not.' },
  theme: { merge: 'flag', progress_kind: 'flag', why: 'Owned or not.' },
  dungeon_run: {
    merge: 'none', progress_kind: null,
    why: 'A ONE-SHOT ACTION bought with a key item, with no persistent home. '
       + 'Filed as a stored unlock, a player banks dungeon_run:voidbringer = 50 '
       + 'and nothing ever spends it. The intent that consumes it owns it.',
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   2 · EXTRACT
   ══════════════════════════════════════════════════════════════════════════ */
const nsOf = (id) => (id.includes(':') ? id.slice(0, id.indexOf(':')) : id);

/** unlock_id -> { namespace, amounts:Set<number>, offerMax:number|null } */
const found = new Map();

function note(id, amount, offerMax) {
  const ns = nsOf(id);
  if (!Object.prototype.hasOwnProperty.call(NAMESPACES, ns)) {
    die(`unlock id "${id}" is in namespace "${ns}", which NAMESPACES does not declare.\n`
      + '  Every inference rule is wrong on some row of this catalogue (see the header),\n'
      + '  so a new namespace is a DECISION about how two writes combine, not a default.\n'
      + '  Add it to NAMESPACES in this file with its merge rule and its reason.');
  }
  let rec = found.get(id);
  if (!rec) { rec = { namespace: ns, amounts: new Set(), offerMax: null }; found.set(id, rec); }
  const n = Number(amount);
  if (Number.isFinite(n) && n > 0) rec.amounts.add(Math.floor(n));
  if (offerMax != null && Number.isFinite(Number(offerMax))) {
    rec.offerMax = Math.max(rec.offerMax ?? 0, Number(offerMax));
  }
}

for (const offer of SHOP_OFFERS) {
  for (const g of (offer.grant || [])) {
    if (g && g.kind === 'unlock' && typeof g.id === 'string') note(g.id, g.amount, offer.max);
  }
}

/* The recipe gates. Two sources on purpose, unioned:
     (a) every `gated:` value in ARTISAN_RECIPES — the ids that actually GATE
         something, i.e. the ones `gateOk` reads;
     (b) every ITEMS entry with `recipe: true` — anything that can enter a bag
         and be auto-unlocked by the client's addItem wrapper.
   (a) alone would leave a droppable-but-gates-nothing scroll uncatalogued, and
   a server that rolled one would propose an unlock the guard refuses, turning a
   lucky drop into `bad_delta` and costing the whole night. (b) alone would miss
   a gate whose scroll is granted some other way. The union is the safe shape and
   the drift guard below asserts (a) is a subset of what we emit. */
const gateIds = new Set();
for (const skill of Object.keys(ARTISAN_RECIPES)) {
  for (const r of (ARTISAN_RECIPES[skill] || [])) if (r && r.gated) gateIds.add(String(r.gated));
}
const scrollIds = new Set(Object.keys(ITEMS).filter((k) => ITEMS[k] && ITEMS[k].recipe));
for (const id of [...gateIds, ...scrollIds].sort()) note(`recipe:${id}`, 1, 1);

for (const id of gateIds) {
  if (!found.has(`recipe:${id}`)) die(`the recipe gate "${id}" did not reach the catalogue`);
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · RESOLVE each id to its catalogue row
   ══════════════════════════════════════════════════════════════════════════ */
const rows = [];
for (const id of [...found.keys()].sort()) {
  const rec = found.get(id);
  const decl = NAMESPACES[rec.namespace];
  const amounts = [...rec.amounts].sort((a, b) => a - b);
  let rungs = null;
  let maxValue = null;

  if (decl.merge === 'max') {
    if (!amounts.length) die(`${id} is a level with no rungs sold`);
    rungs = amounts;
    maxValue = amounts[amounts.length - 1];
  } else if (decl.merge === 'count') {
    /* The ceiling is the offer's own `max` where the shop states one, and the
       number of distinct offers otherwise (a `worker` hire has no per-offer max
       but there are only six of them to buy). */
    maxValue = rec.offerMax ?? amounts.length ?? null;
    if (!Number.isFinite(maxValue) || maxValue <= 0) maxValue = null;
  } else if (decl.merge === 'flag') {
    maxValue = null;   // additive and harmless; a ceiling here is a PURCHASE
                       // decision (already_owned), not a storage one.
  }

  rows.push({
    unlock_id: id,
    namespace: rec.namespace,
    merge: decl.merge,
    progress_kind: decl.progress_kind,
    max_value: decl.merge === 'none' ? null : maxValue,
    rungs,
  });
}

/* ── CROSS-CHECK: the room ladder the SHOP sells must be the ladder the PERK
      table pays. These are two independently generated files (gen-shops from
      the shop tables, gen-perks from ROOMS), and a room that sells six rungs
      while the perk table pays five is a player who spends gold for nothing —
      or, worse, a rung the guard accepts and `normalisePerkState` silently
      clamps away. Neither generator could see this alone. */
for (const id of Object.keys(ROOM_PERKS)) {
  const row = rows.find((r) => r.unlock_id === `room:${id}`);
  if (!row) die(`ROOM_PERKS declares "${id}" but the shop sells no room:${id} rung`);
  const top = ROOM_PERKS[id].length;
  if (row.max_value !== top) {
    die(`room:${id} — the shop sells up to rung ${row.max_value} but src/data/perks.js pays `
      + `${top} rungs. One of the two generators is stale; regenerate both and read the diff.`);
  }
}
for (const r of rows) {
  if (r.namespace !== 'room') continue;
  const id = r.unlock_id.slice('room:'.length);
  if (!Object.prototype.hasOwnProperty.call(ROOM_PERKS, id)) {
    die(`the shop sells room:${id} but src/data/perks.js has no such room — a purchase that pays nothing`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · EMIT
   ══════════════════════════════════════════════════════════════════════════ */
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => (a === null ? 'null' : `array[${a.join(',')}]::int[]`);
const num = (n) => (n === null || n === undefined ? 'null' : String(n));

const DIGEST = createHash('sha256').update(JSON.stringify(rows)).digest('hex');

const byNs = {};
for (const r of rows) (byNs[r.namespace] = byNs[r.namespace] || []).push(r);
const nsSummary = Object.keys(byNs).sort()
  .map((n) => `${n}=${byNs[n].length}`).join(' · ');

const valueLines = rows.map((r) =>
  `  (${q(r.unlock_id)}, ${q(r.namespace)}, ${q(r.merge)}, ${q(r.progress_kind)}, `
  + `${num(r.max_value)}, ${arr(r.rungs)})`).join(',\n');

const declLines = Object.keys(NAMESPACES).sort().map((n) => {
  const d = NAMESPACES[n];
  const wrapped = d.why.match(/.{1,66}(\s|$)/g).map((s) => s.trim());
  return `--   ${n.padEnd(15)} merge=${d.merge.padEnd(5)} kind=${String(d.progress_kind).padEnd(6)}\n`
       + wrapped.map((w) => `--                   ${w}`).join('\n');
}).join('\n');

const file = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE UNLOCK CATALOGUE  (GENERATED — DO NOT EDIT BY HAND)
--
--   Generated by tools/gen-unlocks.mjs from src/data/{shops,recipes,items,
--   perks}.js. Any hand edit here is reverted by the next generation and FAILS
--   \`node tools/gen-unlocks.mjs --check\`, a preflight in tests/run-smoke.mjs.
--
--   unlock digest: ${DIGEST}
--   ${rows.length} unlock ids · ${nsSummary}
--
-- ── WHAT THIS TABLE IS ──────────────────────────────────────────────────
-- BOOKKEEPING ONLY. For every unlock the game can grant: how two writes to it
-- COMBINE, which player_progress.kind stores it (i.e. WHO MAY WRITE IT), its
-- ceiling, and the rung ladder the shop actually sells. There is not one game
-- NUMBER in this file — no bonus magnitude, no price. \`room:kitchen\` is "a
-- level, rungs {1,2,3,4,5}"; the 0.25 noBurn lives in src/data/perks.js and is
-- read by src/core/perks.js on BOTH sides. Copying game data into SQL is the
-- failure src/main.js \`unifyObject\` was written about.
--
-- ── THE MERGE RULES, AS DECLARED ────────────────────────────────────────
${declLines}
--
-- CONSUMED BY: 2026-08-16-artisan-progress-model.sql — hr_unlock_guard (the
-- storage guard) and hr_unlock_levels (the perk seam) both read it, and both
-- FAIL CLOSED if it is absent or empty.
--
-- SAFE TO RE-RUN. The table is created if absent and refilled wholesale.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_unlocks (
  unlock_id     text primary key,
  namespace     text not null,
  merge         text not null check (merge in ('max','count','flag','none')),
  -- NULL iff merge='none'. A grant with no persistent home has no kind.
  progress_kind text check (progress_kind in ('flag','stat','unlock')),
  max_value     bigint,
  rungs         int[],
  check ((merge = 'none') = (progress_kind is null))
);

-- World-readable, like every other hr_* catalogue: it holds no player data and
-- the guard trigger reads it as an ordinary (non-DEFINER) function.
alter table public.hr_unlocks enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='hr_unlocks'
                    and policyname='hr_unlocks readable') then
    create policy "hr_unlocks readable" on public.hr_unlocks for select using (true);
  end if;
end $$;
-- IMPORTANT: "revoke all", NOT "revoke insert, update, delete" (Security C1,
-- 2026-08-16). Supabase's default ACL on public also grants TRUNCATE,
-- REFERENCES and TRIGGER, and a three-verb revoke leaves all three behind — on
-- a CATALOGUE, where TRUNCATE would empty the table every unlock decision is
-- read from, and TRUNCATE bypasses row-level security entirely so the
-- read-only policy above is not a backstop for it. PUBLIC is included because
-- a grant to PUBLIC is held by every role that exists.
revoke all on public.hr_unlocks from public, anon, authenticated, service_role;

-- Refilled wholesale, inside the migration's transaction.
delete from public.hr_unlocks;
insert into public.hr_unlocks
  (unlock_id, namespace, merge, progress_kind, max_value, rungs)
values
${valueLines};

-- ── SELF-CHECK ───────────────────────────────────────────────────────────
do $$
declare v_n int; v_bad text;
begin
  select count(*) into v_n from public.hr_unlocks;
  if v_n <> ${rows.length} then
    raise exception 'hr_unlocks holds % rows, expected ${rows.length} — the insert was partial', v_n;
  end if;

  -- Every level has a ladder, every ladder is inside its ceiling, and no ladder
  -- contains 0. That last one is load-bearing: the storage guard proves "a value
  -- off the ladder is refused" with an INSERT at 0, and if 0 were ON some ladder
  -- that probe would assert nothing.
  select string_agg(unlock_id, ', ') into v_bad from public.hr_unlocks
   where merge = 'max'
     and (rungs is null or array_length(rungs,1) is null
          or max_value is null or max_value <> rungs[array_length(rungs,1)]
          or 0 = any (rungs));
  if v_bad is not null then
    raise exception 'level unlocks with a broken ladder: %', v_bad;
  end if;

  -- merge='none' really has no home, and nothing else is missing one.
  select string_agg(unlock_id, ', ') into v_bad from public.hr_unlocks
   where (merge = 'none') <> (progress_kind is null);
  if v_bad is not null then raise exception 'merge/kind disagree on: %', v_bad; end if;

  -- THE ARTISAN GATE IS PRESENT AND WRITABLE BY THE ENGINE. If recipe unlocks
  -- were not kind='flag', hr_apply could not grant a scroll the engine rolled
  -- and every gated recipe would be permanently unreachable server-side.
  select count(*) into v_n from public.hr_unlocks
   where namespace = 'recipe' and progress_kind = 'flag' and merge = 'flag';
  if v_n < ${rows.filter((r) => r.namespace === 'recipe').length} then
    raise exception 'the recipe namespace lost its flag storage — % of ${rows.filter((r) => r.namespace === 'recipe').length} rows', v_n;
  end if;

  raise notice 'hr_unlocks OK — % ids, ${nsSummary}', ${rows.length};
end $$;
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-unlocks: ${rows.length} ids, digest ${DIGEST.slice(0, 12)}…`);
  for (const n of Object.keys(byNs).sort()) {
    console.log(`  ${n.padEnd(15)} ${byNs[n].length.toString().padStart(2)}  merge=${NAMESPACES[n].merge}`
      + ` kind=${NAMESPACES[n].progress_kind}`);
    for (const r of byNs[n]) {
      console.log(`      ${r.unlock_id.padEnd(28)} max=${String(r.max_value).padEnd(5)}`
        + `${r.rungs ? `rungs ${r.rungs.join(',')}` : ''}`);
    }
  }
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) {
    console.error(`unlock drift: ${OUT} is missing. Run: node tools/gen-unlocks.mjs`);
    process.exit(1);
  }
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    const was = /unlock digest: ([0-9a-f]{64})/.exec(existing);
    const committed = was ? was[1] : '(none)';
    if (committed === DIGEST) {
      console.error('unlock drift: the generated migration was EDITED BY HAND.');
      console.error('  The extraction is unchanged (same digest) but the committed file is not.');
    } else {
      console.error('unlock drift: a shop grant or a recipe gate no longer matches the catalogue.');
      console.error(`  committed digest ${committed}`);
      console.error(`  extracted digest ${DIGEST}`);
      console.error('  ⚠ THE STORAGE GUARD REFUSES ANY UNLOCK ID NOT IN THIS TABLE. Until it is');
      console.error('    regenerated, a newly added unlock is unwritable and costs whoever earns');
      console.error('    it a bad_delta.');
    }
    console.error('  Run: node tools/gen-unlocks.mjs   (then read the diff)');
    process.exit(1);
  }
  console.log(`unlocks in sync (${rows.length} ids, ${Object.keys(byNs).length} namespaces, `
    + `digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${rows.length} ids · ${nsSummary}`);
  console.log(`  digest ${DIGEST}`);
}
