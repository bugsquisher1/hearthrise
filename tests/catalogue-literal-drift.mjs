#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catalogue-literal-drift.mjs — THE CHAIN END EQUALS THE REPO DATA.
//
// ── THE FINDING THIS EXISTS FOR (Security F2, 2026-09-13, Deep Seam review) ──
// src/data/*.js is the single source of game content. tools/gen-catalogues.mjs
// turns it into 2026-08-11-catalogue.generated.sql, and `--check` keeps THAT
// file honest. But a later migration that hand-restates catalogue rows —
// 2026-09-13-deep-seam.sql, -reed-and-tide.sql, -prayer-ladder-and-item-gates.sql
// — is a THIRD copy of the same rows, and `--check` cannot see it:
//
//     A designer rebalances ITEMS.verdite_bar.v from 320 to 260.
//     → items.js says 260. The generated catalogue says 260. --check: GREEN.
//     → deep-seam.sql still says 320, runs LAST in the apply order, and its
//       `on conflict (item_id) do update set … value = excluded.value` fires.
//     → after a chain replay or a re-apply, the database says 320 again.
//
// A tradeable item's price silently reverts, on a surface the market reads.
// Nothing in the repo was red at any point.
//
// The property this guard asserts is therefore NOT "file X matches items.js"
// (which is what tests/clan-feast-catalogue-drift.mjs asserts for the one table
// that had a guard, and which a fourth restating file would slip past). It is:
//
//     ┌──────────────────────────────────────────────────────────────────┐
//     │  Replay the whole chain. The rows the database ENDS UP WITH must │
//     │  equal the rows src/data produces — field by field.              │
//     └──────────────────────────────────────────────────────────────────┘
//
// That is indifferent to WHICH file holds the restatement, how many files fold
// over each other, or whether the conflict clause updates or does nothing. Any
// stale literal anywhere in the chain lands as a named (id, field, replay, repo)
// row here. Tables covered: hr_items, hr_item_slots, hr_activities.
//
// ── WHY IT CANNOT RE-TYPE THE DERIVATION ────────────────────────────────────
// The repo side comes from tools/catalogue-rows.mjs, which is also what
// gen-catalogues.mjs uses — one derivation, two consumers. If this guard
// restated `it.v → value` itself it would be a FOURTH copy of the data's shape
// inside the file whose whole job is to prove there are not several copies, and
// it would go red when the two restatements disagreed rather than when the data
// drifted. (The derivation lived inline in gen-catalogues.mjs, which is a script
// that WRITES on import; moving it out was the enabling change.)
//
// ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
//   · Production. This is the chain, not the live database. A row that exists
//     in production and in no file is tests/schema-drift.mjs --live's job.
//   · Tables other than the three above. hr_feast_foods keeps its own guard;
//     hr_crops / hr_skills / hr_equip_slots / hr_item_buffs are generated-only
//     today and have no hand-restating file — the day one appears, add it here.
//     hr_room_perks (2026-09-13, the rung → perk payload hr_apply prices a buff
//     duration from) is generated-only too, and its chain-end equality with
//     src/data/perks.js is asserted by execution in tests/buff-queue.mjs arm
//     [21](a) — move it here the day a migration hand-restates a rung.
//   · A drift that exists in BOTH src/data and the chain. This is an equality,
//     not a design review.
//
// Exit: 0 in sync · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { deriveCatalogueRows } from '../tools/catalogue-rows.mjs';

/* The fields compared per table. Adding a column to a catalogue table means
   adding it HERE too, or the new column is unguarded and silently driftable —
   which is the whole failure mode. */
const ITEM_FIELDS = ['name', 'tradeable', 'kind', 'value', 'req_skill', 'req_lv',
  'heals', 'auto_eatable'];
const ACTIVITY_FIELDS = ['req_skill', 'req_lv', 'max_hp', 'is_boss'];

/* PGlite hands back `bigint` as a string and `int` as a number; src/data yields
   numbers and nulls. Compare on a canonical form so a type artefact never reads
   as drift (and, just as importantly, so a REAL drift of 320 vs "320" is not
   swallowed — String(320) === String("320") only when the VALUES match). */
const norm = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return v;
};
const same = (a, b) => {
  const x = norm(a); const y = norm(b);
  return x === y || (x === null && y === null);
};
const show = (v) => (v === null || v === undefined ? 'null' : JSON.stringify(norm(v)));

/**
 * @param {object}   opts
 * @param {Map}      opts.patches     bootReplay patch map — the SQL-side arms.
 * @param {Function} opts.dataMutate  mutates the derived repo rows in memory —
 *                                    the src/data-side arms. (src/data cannot be
 *                                    patched through bootReplay, which only
 *                                    rewrites migration text.)
 */
export async function catalogueLiteralDrift(opts = {}) {
  const repo = await deriveCatalogueRows();
  if (opts.dataMutate) opts.dataMutate(repo);

  const { db } = await bootReplay(opts.patches
    ? { patches: opts.patches, fullChain: 'the drift is the CHAIN-END catalogue against src/data; every file judges it' }
    : {});

  const problems = [];
  const counts = {};

  // ── hr_items ────────────────────────────────────────────────────────────
  {
    const live = new Map();
    const q = await db.query(
      `select item_id, name, tradeable, kind, value, req_skill, req_lv, heals, auto_eatable
         from public.hr_items`);
    for (const r of q.rows) live.set(r.item_id, r);
    counts.hr_items = `${live.size} replayed / ${repo.items.length} in src/data`;

    for (const want of repo.items) {
      const got = live.get(want.item_id);
      if (!got) {
        problems.push(`hr_items "${want.item_id}" — in src/data, MISSING from the replayed chain`);
        continue;
      }
      for (const f of ITEM_FIELDS) {
        if (!same(got[f], want[f])) {
          problems.push(`hr_items ("${want.item_id}", ${f}) replay=${show(got[f])} repo=${show(want[f])}`);
        }
      }
    }
    const known = new Set(repo.items.map((i) => i.item_id));
    for (const id of live.keys()) {
      if (!known.has(id)) problems.push(`hr_items "${id}" — seeded by the chain, NOT in src/data/items.js`);
    }
  }

  // ── hr_item_slots ───────────────────────────────────────────────────────
  {
    const q = await db.query('select item_id, equip_slot from public.hr_item_slots');
    const live = new Set(q.rows.map((r) => `${r.item_id} ${r.equip_slot}`));
    counts.hr_item_slots = `${live.size} replayed / ${repo.itemSlots.length} in src/data`;

    const want = new Set(repo.itemSlots.map((s) => `${s.item_id} ${s.equip_slot}`));
    for (const k of want) {
      if (!live.has(k)) {
        const [id, slot] = k.split(' ');
        problems.push(`hr_item_slots ("${id}", equip_slot) repo=${JSON.stringify(slot)} replay=ABSENT`);
      }
    }
    for (const k of live) {
      if (!want.has(k)) {
        const [id, slot] = k.split(' ');
        problems.push(`hr_item_slots ("${id}", equip_slot) replay=${JSON.stringify(slot)} repo=ABSENT`);
      }
    }
  }

  // ── hr_activities ───────────────────────────────────────────────────────
  {
    const q = await db.query(
      'select kind, activity_id, req_skill, req_lv, max_hp, is_boss from public.hr_activities');
    const live = new Map();
    for (const r of q.rows) live.set(`${r.kind} ${r.activity_id}`, r);
    counts.hr_activities = `${live.size} replayed / ${repo.activities.length} in src/data`;

    for (const want of repo.activities) {
      const key = `${want.kind} ${want.activity_id}`;
      const got = live.get(key);
      if (!got) {
        problems.push(`hr_activities ("${want.kind}:${want.activity_id}") — in src/data, `
          + 'MISSING from the replayed chain (a data row with no seeding migration)');
        continue;
      }
      for (const f of ACTIVITY_FIELDS) {
        if (!same(got[f], want[f])) {
          problems.push(`hr_activities ("${want.kind}:${want.activity_id}", ${f}) `
            + `replay=${show(got[f])} repo=${show(want[f])}`);
        }
      }
    }
    const known = new Set(repo.activities.map((a) => `${a.kind} ${a.activity_id}`));
    for (const k of live.keys()) {
      if (!known.has(k)) {
        problems.push(`hr_activities ("${k.replace(' ', ':')}") — seeded by the chain, NOT in src/data`);
      }
    }
  }

  await db.close?.().catch?.(() => {});
  return { problems, counts };
}

/* ── MUTATION PROOF (CLAUDE.md §4). Four arms, one per direction the third copy
      can rot, plus an unmutated control. Nothing is written to the repo: SQL
      arms patch migration TEXT through bootReplay, data arms mutate the derived
      rows in memory. Each must be CAUGHT — and arm (a) is F2 itself, the exact
      scenario in the finding. */
const DEEP = '2026-09-13-deep-seam.sql';
const GEN = '2026-08-11-catalogue.generated.sql';

/* Patches moving every delta's `hr_item_slots holds % rows` assertion by `by`. */
async function slotCountRestatements(by) {
  const dir = join(ROOT, 'supabase', 'migrations');
  const re = /if v_n <> (\d+) then raise exception 'delta: hr_item_slots holds % rows, the catalogue has \1'/g;
  const out = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    const pairs = [...text.matchAll(re)].map(([s, n]) => [s, s.replaceAll(n, String(Number(n) + by))]);
    if (pairs.length) out.push([f, pairs]);
  }
  return out;
}

async function selftest() {
  const arms = [
    ['control (unmutated chain)', {}, false],

    // (a) F2 VERBATIM: a price literal rots in the seeding migration only.
    //     src/data and the generated catalogue still say 320; deep-seam runs
    //     LAST and its `do update set value` overwrites the row with 260.
    //
    //     BOTH of deep-seam's literals move, because the file states the price
    //     TWICE — once in `v_items` and once in its own GATE(a) `values` list.
    //     Moving only the seed makes the file's self-check abort the apply, and
    //     an arm that "passes" on a replay cascade proves nothing about THIS
    //     guard (measured: the first draft of this arm did exactly that). A
    //     migration whose two internal copies agree with each other and
    //     disagree with src/data is the honest shape of the finding, and it is
    //     invisible to `gen-catalogues --check`.
    ['(a) a price literal drifts in the deep-seam migration only', {
      patches: new Map([[DEEP, [
        ['["verdite_bar",       "Verdite Bar",        null,     320,  null,      null],',
         '["verdite_bar",       "Verdite Bar",        null,     260,  null,      null],'],
        ["('verdite_bar',      'Verdite Bar',       null,       320,          null,       null),",
         "('verdite_bar',      'Verdite Bar',       null,       260,          null,       null),"],
      ]]]),
    }, true],

    // (b) the mirror image: src/data moves and no migration follows it.
    ['(b) ITEMS is re-valued in src/data with no matching migration', {
      dataMutate: (repo) => {
        const it = repo.items.find((i) => i.item_id === 'verdite_bar');
        if (!it) throw Object.assign(new Error('verdite_bar is gone from src/data — re-anchor arm (b)'),
          { harness: true });
        it.value = 260;
      },
    }, true],

    // (c) a slot pair vanishes from a seeding migration — the item becomes
    //     unwearable server-side while items.js still says it has a slot.
    //
    //     Dropped from the GENERATED file, not from deep-seam, and the reason
    //     is worth writing down: hr_item_slots conflicts `do nothing`, and
    //     every pair deep-seam restates is ALSO seeded earlier by the generated
    //     catalogue, so deleting one there changes nothing at chain end (also
    //     measured — the first draft of this arm was a no-op that read as a
    //     miss). A pair only ONE file in the chain seeds is what a drop can
    //     actually remove, and `trollhide_cape/cape` is such a pair.
    //     Every frozen delta's chain-end count is restated one lower too (as
    //     arm (a) moves both copies): left at 291 it aborts the replay, and an
    //     arm that "passes" on a cascade proves nothing about THIS guard.
    ['(c) a slot pair is dropped from a seeding migration', {
      patches: new Map([[GEN, [[
        "  ('trollhide_cape','cape'),\n", '',
      ]]], ...await slotCountRestatements(-1)]),
    }, true],

    // (d) a new activity is authored in src/data and no migration seeds it —
    //     the row the server would refuse as a fake activity.
    ['(d) an activity row is added to src/data with no migration', {
      dataMutate: (repo) => {
        repo.activities.push({ kind: 'gather', activity_id: 'phantom_seam',
          req_skill: 'mining', req_lv: 1, max_hp: null, is_boss: false });
      },
    }, true],
  ];

  let bad = 0;
  for (const [name, opts, mustFail] of arms) {
    let red; let first = '';
    try {
      const { problems } = await catalogueLiteralDrift(opts);
      red = problems.length > 0;
      first = problems[0] || '';
    } catch (e) {
      // A harness/replay error is NOT a catch. An arm that "passes" because the
      // migration stopped applying proves nothing about this guard.
      process.stdout.write(`  FAIL  ${name} → harness error, not a detection: ${e.message.split('\n')[0]}\n`);
      bad++; continue;
    }
    const ok = red === mustFail;
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'}  ${mustFail ? 'caught' : 'clean '}: ${name}`
      + `${red ? `\n          → ${first}` : ''}\n`);
  }
  return bad;
}

if (process.argv[1]?.endsWith('catalogue-literal-drift.mjs')) {
  const argv = process.argv.slice(2);
  const fail = (e) => {
    process.stderr.write(`ERROR: ${e && e.message || e}\n`);
    process.exit(2);
  };
  if (argv.includes('--selftest')) {
    selftest().then((bad) => {
      process.stdout.write(bad === 0
        ? '\nself-test green: every injected stale literal is caught, in both directions.\n'
        : `\n${bad} arm(s) wrong — this guard does not bite as advertised.\n`);
      process.exit(bad === 0 ? 0 : 1);
    }).catch(fail);
  } else {
    catalogueLiteralDrift().then(({ problems, counts }) => {
      for (const [t, c] of Object.entries(counts)) process.stdout.write(`  note  ${t}: ${c}\n`);
      if (problems.length) {
        for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
        process.stdout.write(`\n${problems.length} catalogue drift(s) between the replayed chain and `
          + 'src/data.\n  The chain END is what the database holds. Re-sync by adding a NEW migration '
          + 'that\n  restates the correct rows — never by editing an applied one — and regenerate\n'
          + '  with  node tools/gen-catalogues.mjs.\n');
        process.exit(1);
      }
      process.stdout.write('  ok    the replayed chain matches src/data field for field.\n\nin sync.\n');
      process.exit(0);
    }).catch(fail);
  }
}
