#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/buff-queue.mjs — THE SERVER OWNS THE BUFF CLOCK, PROVEN BY EXECUTION
//                        ON A REBUILT CHAIN.
//
//   node tests/buff-queue.mjs             the guard
//   node tests/buff-queue.mjs --list      the mutations
//   node tests/buff-queue.mjs --mutate=<id>   plant ONE defect, show the result
//   node tests/buff-queue.mjs --selftest  clean baseline green, every mutation RED
//
// ── WHAT IT IS FOR ─────────────────────────────────────────────────────────
// 2026-09-13-consumable-buffs.sql moves the buff clock onto the server:
// player_state.buffs = [{type, magnitude, until}] with an ABSOLUTE expiry, one
// new delta key `buff_apply = {item}` that resolves everything else from
// hr_item_buffs under the character lock, and a top-level `buffs` projection the
// accrual engine drains. 2026-09-13-client-state-buffs-denylist.sql takes the
// forgeable shadow copy away.
//
// The migrations carry strong §4 self-checks, but a §4 fires ONCE, at apply time.
// The regression that brings a buff forgery back is a LATER migration restating
// hr_apply from a stale template — at which point no §4 ever runs again and this
// guard is the only thing left standing. So every mutation below is ALSO run with
// the two §4 blocks SHORT-CIRCUITED, and the tick has to come from THIS FILE's
// assertions. A tick that only means "the apply threw" proves the migration can
// fail, not that anything is watching (the renown-faucet lesson).
//
// ── WHAT IT PROVES ─────────────────────────────────────────────────────────
//   [1] REACHABILITY — no client role holds EXECUTE on hr_apply / hr_state_of,
//       and a real call as `authenticated` is refused 42501. Without this, every
//       assertion below is decoration.
//   [2] THE CATALOGUE IS NOT A SECOND COPY — every hr_item_buffs row equals the
//       `buff` block in src/data/items.js, field for field, and every buff food
//       in that file has a row. This repo has been burned by a data double-copy
//       (src/main.js unifyObject) and hr_castle_items is still the hand-seeded
//       counter-example; a price list that drifts pays the wrong buff for ever.
//   [3] THE SERVER STAMPS THE CLOCK — a valid apply lands `until` at
//       now() + the CATALOGUE duration (±5 s) with the CATALOGUE type and
//       magnitude, none of which appeared in the delta.
//   [4] A FORGED FIELD IS REFUSED BY NAME — `until`, `magnitude`, `type`,
//       `duration_ms`, `remaining_ms` and `scale` each refuse the whole apply as
//       bad_buff_item/forbidden_key with the queue UNMOVED. Refused, not ignored:
//       "ignored today" is one careless edit from "read tomorrow".
//   [5] AN UNKNOWN OR NON-BUFF ITEM IS REFUSED — including a real item that
//       carries no buff, a numeric item, a string delta and an array delta.
//   [6] STACKING IS A MERGE — a second helping EXTENDS the tail (never restarts
//       it), a stronger dish raises the magnitude to max(old,new), a weaker one
//       cannot dilute it, the type stays ONE row, and a different type JOINS.
//   [7] THE CAP AND buff_at_max — repeated consumes land exactly on
//       now()+3,600,000 ms and the next one is REFUSED as buff_at_max with the
//       gold in the very same delta unmoved (the designer's rule: never eat the
//       item for nothing).
//   [8] IDEMPOTENCY — the same intent_id twice buffs ONCE.
//   [9] THE PROJECTION — top-level `buffs` with a server-derived remaining_ms,
//       an expired entry carried at 0 (the away engine needs it), and the three
//       neighbours the splice could have eaten still projected.
//  [10] AWAY-1 — with no live buff, the accrual engine's output is BYTE-IDENTICAL
//       across `buffs` absent / [] / an expired queue. This is the arm that says
//       the feature is inert until a buff is really running.
//  [11] …AND IT IS NOT INERT WHEN ONE IS — the same window with a live damage
//       buff pays MORE. A wiring that returned zero would satisfy [10] perfectly.
//  [12] NO CLIENT WRITE SURFACE — player_state has no non-read RLS policy and no
//       client role holds a write grant on hr_item_buffs.
//  [13] THE SHADOW COPY IS GONE — a client_state PUT carrying `buffs` is refused
//       forbidden_field, an HONEST residue PUT still saves, and `buffs` is not in
//       RESIDUE_FIELDS (which would refuse every residue patch for every player).
//  [14] A SECOND APPLY IS A NO-OP — both files re-apply with all three bodies
//       byte-identical and exactly one CHECK constraint. They patch bodies ten
//       patches deep; a double-patch is a silent corruption of the engine.
//  [15] ONE CEILING, ONE NUMBER — hr_apply's c_buff_max_ms and src/core/buffs.js
//       BUFF_MAX_UNTIL_MS agree. Two numbers for one bound is two that can drift.
//
// NO CREDENTIALS. NO NETWORK. Production is untouched — this is a rebuild.
// NO `?v=` on the imports (tests/**, not a browser module — b332).
// Exit: 0 green · 1 a violation · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { runMutationProof } from './mutation-proof.mjs';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { BUFF_MAX_UNTIL_MS, BUFFS_DEF } from '../src/core/buffs.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';

const MIG = '2026-09-13-consumable-buffs.sql';
const MIG_DENY = '2026-09-13-client-state-buffs-denylist.sql';
const MIG_CAT = '2026-09-13-item-buffs-catalogue.generated.sql';
const U = '00000000-0000-4000-8000-0000000000b5';
const J = { kind: 'admin', intent: 'buff-queue:probe' };
const CAP_MS = 3600000;

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

/* ── THE §4 BLINDS ─────────────────────────────────────────────────────────
   Each migration's self-check is short-circuited with a `return;` at the head of
   its block, so a mutation's tick must come from THIS guard. A §4 fires once at
   apply time; the regression that matters is a later restatement, when it never
   fires again. */
const BLIND = {
  [MIG]: ["  -- (a) THE COLUMN: present, jsonb, NOT NULL, defaulted to '[]'.",
    "  return;  -- §4 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n"
    + "  -- (a) THE COLUMN: present, jsonb, NOT NULL, defaulted to '[]'."],
  [MIG_DENY]: ["  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);",
    '  return;  -- §2 SHORT-CIRCUITED FOR THE MUTATION PROOF (tests/buff-queue.mjs)\n'
    + "  v_def := pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure);"],
};

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   Every `find` must match EXACTLY ONCE in its file (bootReplay raises a harness
   error otherwise, so a drifted anchor is repaired rather than scored green).
   `pairs` exists because one DEFECT is sometimes two lines: "the client authors
   the magnitude" needs the forgery gate disarmed AND the value read, and
   splitting it would produce an unreachable mutation that stays green for the
   right reason and the wrong proof. */
const MUTATIONS = {
  forgery_gate_off: {
    file: MIG,
    why: "the forbidden-key refusal is disarmed, so a buff_apply carrying `until` or `magnitude` is "
       + 'ACCEPTED (silently ignored today) — one edit away from being read, and unreviewable',
    pairs: [["      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)\n                  where t.bk <> 'item') then",
      "      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)\n                  where false) then"]],
  },
  client_authors_magnitude: {
    file: MIG,
    why: 'THE ONE CLAUDE.md §1 FORBIDS BY NAME: the client\'s own `magnitude` reaches the stored buff '
       + '(forgery gate off + the delta read), so a browser sets its own damage bonus',
    pairs: [["                  where t.bk <> 'item') then", '                  where false) then'],
      ['      v_buff_newmag := greatest(v_buff_mag, coalesce((v_buff_old->>\'magnitude\')::numeric, 0));',
        "      v_buff_newmag := greatest(coalesce((p_delta->'buff_apply'->>'magnitude')::numeric, v_buff_mag),\n"
        + "                                coalesce((v_buff_old->>'magnitude')::numeric, 0));"]],
  },
  client_authors_until: {
    file: MIG,
    why: 'the client\'s own `until` reaches the stored buff — a browser grants itself a buff that never '
       + 'expires, which is the whole reason the expiry is an absolute server stamp',
    pairs: [["                  where t.bk <> 'item') then", '                  where false) then'],
      ['      v_buff_until := least(v_buff_base',
        "      v_buff_until := coalesce((p_delta->'buff_apply'->>'until')::timestamptz, v_buff_base);\n"
        + '      v_buff_until := least(v_buff_until']],
  },
  cap_refusal_off: {
    file: MIG,
    why: 'buff_at_max never fires, so a queue already at the ceiling silently eats the food for nothing '
       + '(the designer ruling this file exists to honour)',
    pairs: [['      if v_buff_gain < v_buff_need then', '      if false then']],
  },
  min_gain_fuse_off: {
    file: MIG,
    why: 'the minimum-gain fuse degenerates back to `base >= cap`, which is UNREACHABLE across two '
       + 'transactions because the cap moves with now() — the defect the migration shipped in its first '
       + 'draft, which its own §4 could not see (a migration applies inside ONE transaction, where '
       + 'now() is frozen and the equality really does hold)',
    pairs: [['      if v_buff_gain < v_buff_need then', '      if v_buff_base >= v_buff_cap then']],
  },
  clamp_off: {
    file: MIG,
    why: 'the 60-minute expiry clamp is gone, so 400 pies before bed bank eight hours of buffed away '
       + 'output — the stock ceiling that replaces a per-day clamp',
    pairs: [['                            v_buff_cap);', '                            v_buff_base + interval \'400 hours\');']],
  },
  merge_replaces_other_types: {
    file: MIG,
    why: 'the merge keeps only the type being applied, so eating a second dish DELETES the first buff — '
       + 'a player pays for a Feast and loses the one they were running',
    pairs: [["       where e.v->>'type' <> v_buff_type\n         and (e.v->>'until')::timestamptz > v_buff_now;",
      "       where false\n         and (e.v->>'until')::timestamptz > v_buff_now;"]],
  },
  magnitude_replaces_instead_of_max: {
    file: MIG,
    why: 'magnitude becomes the NEW value instead of max(old,new), so a Roasted Carrot dilutes a Void '
       + 'Banquet — the stacking ruling inverted',
    pairs: [["      v_buff_newmag := greatest(v_buff_mag, coalesce((v_buff_old->>'magnitude')::numeric, 0));",
      '      v_buff_newmag := v_buff_mag;']],
  },
  second_helping_restarts: {
    file: MIG,
    why: 'the tail is computed from now() instead of max(now, old.until), so a second helping RESTARTS '
       + 'the buff and the minutes already paid for are thrown away',
    pairs: [["      v_buff_base := greatest(v_buff_now,\n                              coalesce((v_buff_old->>'until')::timestamptz, v_buff_now));",
      '      v_buff_base := v_buff_now;']],
  },
  catalogue_bypassed: {
    file: MIG,
    why: 'the item id stops selecting the row, so ANY item id resolves to some buff — a Trout becomes a '
       + 'Feast and the allowlist hr_item_buffs exists to be is gone',
    pairs: [['        from public.hr_item_buffs b where b.item_id = v_buff_item;',
      '        from public.hr_item_buffs b order by b.item_id limit 1;']],
  },
  projection_renamed: {
    file: MIG,
    why: 'hr_state_of projects the queue under a name the engine does not read, so every buff is paid to '
       + 'nobody while the column fills up — the b341 class and the plotLevels false-green',
    pairs: [["    'buffs', coalesce((", "    'buffQueue', coalesce(("]],
  },
  remaining_ms_dead: {
    file: MIG,
    why: 'remaining_ms is projected as 0 for every entry, so the client renders no countdown and the '
       + 'step-2 reconcile would drop every live buff as expired',
    pairs: [["               'remaining_ms', greatest(0, floor(\n                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)",
      "               'remaining_ms', 0::bigint)"]],
  },
  denylist_key_typo: {
    file: MIG_DENY,
    why: "the deny-list gains 'buffsX' instead of 'buffs', so the forgeable client_state shadow copy "
       + 'survives — Security\'s condition silently unmet while the migration reports success',
    pairs: [["    'buffs'$new$);", "    'buffsX'$new$);"]],
  },
  catalogue_drift: {
    file: MIG_CAT,
    why: 'ONE generated row disagrees with src/data/items.js, which is the data double-copy this repo '
       + 'has already been burned by — the price list would pay a buff nobody authored',
    pairs: [null],   // filled in at load time from the real file (see below)
  },
};

/* The catalogue-drift mutation is derived rather than typed: the generated file
   is regenerated whenever a designer touches a buff, so a hand-typed anchor
   would rot into a harness error on the next balance change. */
{
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG_CAT), 'utf8')).replace(/\r\n/g, '\n');
  const m = /\n  \('([a-z0-9_]+)','([a-z_]+)',(\d+(?:\.\d+)?),(\d+)\)/.exec(sql);
  if (!m) throw harness(`could not find a row to mutate in ${MIG_CAT} — the generator's emit shape changed`);
  MUTATIONS.catalogue_drift.pairs = [[m[0], `\n  ('${m[1]}','${m[2]}',${Number(m[3]) + 7},${m[4]})`]];
  MUTATIONS.catalogue_drift.row = m[1];
}

const patchesFor = (mutate, blind) => {
  const map = new Map();
  const add = (file, pairs) => {
    if (!map.has(file)) map.set(file, []);
    for (const p of pairs) map.get(file).push(p);
  };
  if (blind) for (const [file, pair] of Object.entries(BLIND)) add(file, [pair]);
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) throw harness(`unknown mutation '${mutate}' (see --list)`);
    add(m.file, m.pairs);
  }
  return map.size ? map : undefined;
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed += 1; console.error(`  FAIL  ${msg}`); } };

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run(mutate, blind) {
  const { db } = await bootReplay({ patches: patchesFor(mutate, blind) });

  // ── [14] IDEMPOTENCY, taken FIRST, before any row exists ─────────────────
  const defs = async () => (await db.query(
    `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) as a,
            pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) as s,
            pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure) as p`
  )).rows[0];
  const before = await defs();
  for (const file of [MIG, MIG_DENY]) {
    let sql = (await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8')).replace(/\r\n/g, '\n');
    /* The SAME patched text the chain was built from, so under a mutation this
       measures the MUTATED file's idempotency rather than a mismatch. */
    for (const [f, r] of (patchesFor(mutate, blind) || new Map()).get(file) || []) {
      if (sql.split(f).length - 1 !== 1) throw harness(`[14] anchor matched != 1 time in ${file}`);
      sql = sql.replace(f, () => r);
    }
    let err = null;
    try { await db.exec(`begin;\n${sql}\ncommit;`); } catch (e) { err = e; await db.exec('rollback').catch(() => {}); }
    ok(!err, `[14] a second apply of ${file} did not run clean — ${err && String(err.message).split('\n')[0]}`);
  }
  const after = await defs();
  ok(before.a === after.a, '[14] the hr_apply body CHANGED on a second apply — the anchored patch is not '
    + 'idempotent, and it patches a body ten patches deep');
  ok(before.s === after.s, '[14] the hr_state_of body CHANGED on a second apply');
  ok(before.p === after.p, '[14] the hr_put_client_state body CHANGED on a second apply');
  const cons = (await db.query(
    `select count(*)::int n from pg_constraint
      where conrelid = 'public.player_state'::regclass and conname = 'player_state_buffs_sane'`)).rows[0].n;
  ok(cons === 1, `[14] ${cons} copies of player_state_buffs_sane after two applies (want exactly 1)`);

  // ── [1] REACHABILITY ─────────────────────────────────────────────────────
  for (const role of ['authenticated', 'anon']) {
    const p = (await db.query(
      `select has_function_privilege($1, 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') as a,
              has_function_privilege($1, 'public.hr_state_of(uuid,int)', 'execute') as s`, [role])).rows[0];
    ok(p.a === false, `[1] ${role} holds EXECUTE on hr_apply — the buff clock is client-writable and so is `
      + 'everything else hr_apply owns');
    ok(p.s === false, `[1] ${role} holds EXECUTE on hr_state_of`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
  await db.exec('set role authenticated');
  let denied = null;
  try {
    await db.query('select public.hr_apply($1::uuid,0,1::bigint,gen_random_uuid(),$2::jsonb)',
      [U, JSON.stringify({ buff_apply: { item: 'x' }, journal: J })]);
  } catch (e) { denied = e; }
  await db.exec('reset role');
  ok(!!denied && /permission denied|42501/i.test(denied.message),
    `[1] a call to hr_apply AS authenticated was not refused (${denied ? denied.message.slice(0, 70) : 'it succeeded'})`);

  // ── [2] THE CATALOGUE IS NOT A SECOND COPY ───────────────────────────────
  const rows = (await db.query('select item_id, type, magnitude::float8 as magnitude, duration_ms::bigint as duration_ms from public.hr_item_buffs')).rows;
  const byId = new Map(rows.map((r) => [r.item_id, r]));
  const authored = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].buff);
  ok(authored.length > 0, '[2] src/data/items.js authors no buff food at all — the fixture is degenerate');
  ok(rows.length === authored.length,
    `[2] hr_item_buffs holds ${rows.length} rows but src/data/items.js authors ${authored.length} buff foods`);
  for (const id of authored) {
    const b = ITEMS[id].buff;
    const r = byId.get(id);
    if (!r) { ok(false, `[2] '${id}' carries a buff in src/data/items.js and has NO hr_item_buffs row`); continue; }
    ok(r.type === b.type, `[2] '${id}' type: catalogue ${r.type} vs items.js ${b.type}`);
    ok(Number(r.magnitude) === Number(b.magnitude),
      `[2] '${id}' magnitude: catalogue ${r.magnitude} vs items.js ${b.magnitude}`);
    ok(Number(r.duration_ms) === Number(b.durationMs),
      `[2] '${id}' duration: catalogue ${r.duration_ms} vs items.js ${b.durationMs}`);
    ok(Object.prototype.hasOwnProperty.call(BUFFS_DEF, r.type),
      `[2] '${id}' has type ${r.type}, which src/core/buffs.js cannot pay — the engine would grant nothing`);
  }

  // ── the character ────────────────────────────────────────────────────────
  await db.exec(`insert into auth.users (id) values ('${U}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values ('${U}', 0, 100000, 0, 10, 10, 1, now())
    on conflict (user_id, slot) do update set gold = 100000, version = 1, buffs = '[]'::jsonb,
      client_state = '{}'::jsonb;`);

  const queue = async () => (await db.query(
    'select buffs from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].buffs;
  const gold = async () => Number((await db.query(
    'select gold from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].gold);
  const apply = async (delta, key) => {
    const v = Number((await db.query(
      'select version from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].version);
    await db.exec('set role hr_engine');
    try {
      const r = await db.query(
        'select public.hr_apply($1::uuid,0,$2::bigint,$3::uuid,$4::jsonb) as res',
        [U, v, key || null, JSON.stringify(delta)]);
      return r.rows[0].res;
    } catch (e) {
      return { ok: false, error: '__threw__', message: String((e && e.message) || e) };
    } finally { await db.exec('reset role'); }
  };
  const newKey = async () => (await db.query('select gen_random_uuid() as k')).rows[0].k;
  const envelope = async () => {
    await db.exec('set role hr_engine');
    try { return (await db.query('select public.hr_state_of($1::uuid, 0) as e', [U])).rows[0].e; }
    finally { await db.exec('reset role'); }
  };

  /* THE FIXTURE FOOD, read from the CATALOGUE rather than named: a designer
     retuning items.js must never be able to make this guard vacuous. */
  const pick = (await db.query(
    `select item_id, type, magnitude::float8 as magnitude, duration_ms::bigint as duration_ms
       from public.hr_item_buffs order by duration_ms desc, item_id limit 1`)).rows[0];
  const other = (await db.query(
    `select item_id, type from public.hr_item_buffs where type <> $1 order by item_id limit 1`,
    [pick && pick.type])).rows[0];
  const stronger = (await db.query(
    `select item_id, magnitude::float8 as magnitude from public.hr_item_buffs
      where type = $1 and magnitude > $2 order by magnitude desc, item_id limit 1`,
    [pick && pick.type, pick && pick.magnitude])).rows[0];
  if (!pick || !other) throw harness('the catalogue does not carry two distinct buff types — every '
    + 'stacking assertion below would be vacuous');

  // ── [3] THE SERVER STAMPS THE CLOCK ──────────────────────────────────────
  const r3 = await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(r3 && r3.ok === true, `[3] an honest buff_apply was refused: ${JSON.stringify(r3).slice(0, 160)}`);
  let q = await queue();
  ok(Array.isArray(q) && q.length === 1, `[3] the queue holds ${q && q.length} entries after one apply (want 1)`);
  const e3 = (q || [])[0] || {};
  ok(e3.type === pick.type, `[3] the stored type is ${e3.type}, catalogue says ${pick.type}`);
  ok(Number(e3.magnitude) === Number(pick.magnitude),
    `[3] the stored magnitude is ${e3.magnitude}, catalogue says ${pick.magnitude}`);
  const skew = (await db.query('select extract(epoch from (($1::timestamptz) - now())) * 1000 as ms',
    [e3.until])).rows[0].ms;
  ok(Math.abs(Number(skew) - Number(pick.duration_ms)) < 5000,
    `[3] until is ${Math.round(Number(skew))} ms away but the catalogue duration is ${pick.duration_ms} ms — `
    + 'the expiry is not being stamped from the server clock plus the catalogue');

  // ── [4] A FORGED FIELD IS REFUSED BY NAME ────────────────────────────────
  const forgeries = [
    ['until', { item: pick.item_id, until: '2099-01-01T00:00:00Z' }],
    ['magnitude', { item: pick.item_id, magnitude: 9999 }],
    ['type', { item: pick.item_id, type: 'damage' }],
    ['duration_ms', { item: pick.item_id, duration_ms: 86400000 }],
    ['remaining_ms', { item: pick.item_id, remaining_ms: 9e9 }],
    ['scale', { item: pick.item_id, scale: 1000 }],
  ];
  const q4 = JSON.stringify(await queue());
  for (const [name, body] of forgeries) {
    const r = await apply({ buff_apply: body, journal: J }, await newKey());
    ok(!!r && r.ok === false && r.error === 'bad_buff_item' && r.why === 'forbidden_key',
      `[4] a buff_apply carrying a forged '${name}' was not refused as bad_buff_item/forbidden_key — `
      + `got ${JSON.stringify(r).slice(0, 140)}`);
  }
  ok(JSON.stringify(await queue()) === q4,
    '[4] a REFUSED forged apply moved the queue — a rejection has to roll the block back, not report');

  // ── [5] UNKNOWN / NON-BUFF / MALFORMED ───────────────────────────────────
  const plain = (await db.query(
    `select i.item_id from public.hr_items i
      where not exists (select 1 from public.hr_item_buffs b where b.item_id = i.item_id)
      order by i.item_id limit 1`)).rows[0];
  ok(!!plain, '[5] every item in the game carries a buff — the non-buff arm would be vacuous');
  for (const [label, body] of [
    ['an unknown id', { item: 'no_such_item_at_all' }],
    ['a real item with no buff', { item: plain && plain.item_id }],
    ['a numeric item', { item: 42 }],
    ['a bare string', 'fishers_pie'],
    ['an array', []],
  ]) {
    const r = await apply({ buff_apply: body, journal: J }, await newKey());
    ok(!!r && r.ok === false && r.error === 'bad_buff_item',
      `[5] ${label} was not refused as bad_buff_item — got ${JSON.stringify(r).slice(0, 140)}`);
  }

  // ── [6] STACKING IS A MERGE ──────────────────────────────────────────────
  /* Every read below is DEFENSIVE on purpose. A mutated tree can leave the queue
     empty or short, and a guard that throws is scored as a HARNESS error rather
     than as the tick it should be (tests/mutation-proof.mjs). `entry` returns {}
     instead of undefined so an assertion fails loudly with a readable value. */
  const entry = async (type) => ((await queue()) || []).find((x) => x && x.type === type) || {};
  const until1 = ((await queue()) || [])[0] && ((await queue()) || [])[0].until;
  ok(!!until1, '[6] the queue is empty before the stacking arms — the fixture cannot measure a merge');
  const r6a = await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(r6a && r6a.ok === true, `[6] a second helping was refused: ${JSON.stringify(r6a).slice(0, 120)}`);
  q = await queue();
  ok(q.length === 1, `[6] a second helping of the SAME type made ${q.length} rows — the merge is an append`);
  const laterMs = (q[0] && until1) ? (await db.query(
    'select extract(epoch from (($1::timestamptz) - ($2::timestamptz))) * 1000 as ms',
    [q[0].until, until1])).rows[0].ms : 0;
  ok(Number(laterMs) > 1000,
    `[6] a second helping did not EXTEND the tail (moved ${Math.round(Number(laterMs))} ms) — the minutes `
    + 'already paid for were thrown away');
  const r6b = await apply({ buff_apply: { item: other.item_id }, journal: J }, await newKey());
  ok(r6b && r6b.ok === true, `[6] a DIFFERENT type was refused: ${JSON.stringify(r6b).slice(0, 120)}`);
  q = await queue();
  ok(q.length === 2 && q.some((x) => x.type === pick.type) && q.some((x) => x.type === other.type),
    `[6] a different buff type did not JOIN the queue (now ${JSON.stringify(q).slice(0, 160)}) — eating a `
    + 'second dish must never delete the one you were running');
  if (stronger) {
    await apply({ buff_apply: { item: stronger.item_id }, journal: J }, await newKey());
    const cur = await entry(pick.type);
    ok(Number(cur.magnitude) === Number(stronger.magnitude),
      `[6] a stronger dish left the magnitude at ${cur.magnitude} (want ${stronger.magnitude}) — max(old,new)`);
    await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
    const cur2 = await entry(pick.type);
    ok(Number(cur2.magnitude) === Number(stronger.magnitude),
      `[6] a WEAKER dish diluted the magnitude to ${cur2.magnitude} (want ${stronger.magnitude}) — a Roasted `
      + 'Carrot must not wash out a Void Banquet');
  }

  // ── [8] IDEMPOTENCY (before the cap loop consumes the room) ──────────────
  const key8 = await newKey();
  await apply({ buff_apply: { item: other.item_id }, journal: J }, key8);
  const until8 = (await entry(other.type)).until;
  const r8 = await apply({ buff_apply: { item: other.item_id }, journal: J }, key8);
  ok(!!r8 && r8.replayed === true,
    `[8] a repeated intent_id was not answered as a REPLAY: ${JSON.stringify(r8).slice(0, 140)}`);
  ok((await entry(other.type)).until === until8,
    '[8] a REPLAYED intent extended the buff — the same eaten pie was paid twice');

  // ── [7] THE CAP AND buff_at_max ──────────────────────────────────────────
  let refusal = null;
  let lastUntil = null;
  let goldBefore = null;
  for (let i = 0; i < 200; i += 1) {
    goldBefore = await gold();
    const r = await apply({ buff_apply: { item: pick.item_id }, gold: -1, journal: J }, await newKey());
    if (r && r.ok === true) {
      lastUntil = (await entry(pick.type)).until;
      if (!lastUntil) { ok(false, '[7] a successful consume left no entry of its own type in the queue'); break; }
      const over = (await db.query(
        'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
        [lastUntil, CAP_MS / 1000])).rows[0].s;
      if (Number(over) > 5) {
        ok(false, `[7] until ran ${Math.round(Number(over))} s PAST the 60-minute cap — the stock ceiling is gone`);
        break;
      }
    } else { refusal = r; break; }
  }
  ok(!!refusal && refusal.error === 'buff_at_max',
    `[7] repeated consumes never refused as buff_at_max (got ${JSON.stringify(refusal).slice(0, 140)}) — a `
    + 'player at the ceiling would eat the food for nothing');
  ok(refusal && (await gold()) === goldBefore,
    '[7] a buff_at_max refusal still moved the gold in the same delta — the whole block must roll back or '
    + 'the player pays for nothing (the eat path debits an item in exactly this shape)');
  if (lastUntil) {
    const gap = (await db.query(
      'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
      [lastUntil, CAP_MS / 1000])).rows[0].s;
    ok(Math.abs(Number(gap)) < 10,
      `[7] the PARTIAL clamp did not land on the cap (${Math.round(Number(gap))} s away) — a consume that `
      + 'fits partly must still buy the minutes that fit');
  }

  /* ── [7b] THE CLAMP, ON A QUEUE THAT IS *NOT* CAP-ALIGNED ────────────
     The loop above cannot see a missing clamp, and that is a property of the
     NUMBERS rather than of the code: the longest food in the catalogue divides
     3,600,000 ms exactly, so `base + duration` lands ON the cap and never past
     it. MEASURED — `--mutate=clamp_off` stayed green until this arm existed.
     So the queue is SEEDED off-grid: one entry of the fixture type expiring a
     little before the ceiling, chosen so that base + duration MUST overshoot.
     A direct UPDATE is fair here (this is a rebuilt database and a fabricated
     character) and it is the only way to reach a state the catalogue cannot
     produce on a round number. */
  const seed = async (mag, untilSql) => {
    await db.exec(`update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', '${pick.type}', 'magnitude', ${Number(mag)}, 'until', to_jsonb(${untilSql})))
      where user_id = '${U}' and slot = 0`);
  };
  await seed(1, `now() + make_interval(secs => ${(CAP_MS - Math.floor(pick.duration_ms / 2)) / 1000})`);
  const r7b = await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(r7b && r7b.ok === true,
    `[7b] a consume with ${Math.round(pick.duration_ms / 2000)} s of headroom was refused `
    + `(${JSON.stringify(r7b).slice(0, 140)}) — a PARTIAL clamp must still buy the minutes that fit`);
  const over7b = (await db.query(
    'select extract(epoch from (($1::timestamptz) - (now() + make_interval(secs => $2)))) as s',
    [(await entry(pick.type)).until || '1970-01-01', CAP_MS / 1000])).rows[0].s;
  ok(Math.abs(Number(over7b)) < 10,
    `[7b] the clamp did not land the tail ON the 60-minute ceiling (${Math.round(Number(over7b))} s out). `
    + 'Positive means the cap is GONE — 400 pies before bed would bank hours of buffed away output, which '
    + 'is the stock ceiling that replaces a per-day clamp.');

  /* ── [6b] max(old,new), BOTH DIRECTIONS, WITHOUT DEPENDING ON THE CATALOGUE ─
     The catalogue arm above only runs when a STRONGER food of the same type
     exists, and for the fixture type none does — so `--mutate=
     magnitude_replaces_instead_of_max` stayed green (MEASURED). The magnitudes
     are seeded instead: a weaker running buff must be RAISED to the new one, and
     a stronger running buff must NOT be diluted by a weaker dish. */
  await seed(Math.max(1, pick.magnitude / 2), "now() + interval '60 seconds'");
  await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(Number((await entry(pick.type)).magnitude) === Number(pick.magnitude),
    `[6b] a WEAKER running buff was not raised to the new magnitude `
    + `(${(await entry(pick.type)).magnitude} vs ${pick.magnitude})`);
  await seed(pick.magnitude + 5, "now() + interval '60 seconds'");
  await apply({ buff_apply: { item: pick.item_id }, journal: J }, await newKey());
  ok(Number((await entry(pick.type)).magnitude) === Number(pick.magnitude) + 5,
    `[6b] a STRONGER running buff was DILUTED to ${(await entry(pick.type)).magnitude} by a weaker dish `
    + `(want ${pick.magnitude + 5}) — magnitude is max(old,new), never a replace`);

  // ── [9] THE PROJECTION ───────────────────────────────────────────────────
  const env = await envelope();
  ok(!!env && Object.prototype.hasOwnProperty.call(env, 'buffs'),
    '[9] hr_state_of does not project a top-level `buffs` key — the engine can never learn the column '
    + 'exists and every buff is paid to nobody');
  const proj = (env && env.buffs) || [];
  ok(Array.isArray(proj) && proj.length >= 1, `[9] the projection is ${JSON.stringify(proj).slice(0, 120)}`);
  for (const p of proj) {
    ok(typeof p.type === 'string' && p.magnitude != null && p.until != null && p.remaining_ms != null,
      `[9] a projected entry is malformed: ${JSON.stringify(p)}`);
  }
  ok(proj.some((p) => Number(p.remaining_ms) > 0),
    '[9] every projected remaining_ms is 0 while a buff is running — the client would render no countdown '
    + 'and the step-2 reconcile would drop a live buff as expired');
  for (const k of ['renown_high', 'dungeon_cooldowns', 'place', 'now', 'state']) {
    ok(Object.prototype.hasOwnProperty.call(env || {}, k),
      `[9] the splice ATE the '${k}' projection — the patch was not additive`);
  }
  /* AN EXPIRED ENTRY IS STILL CARRIED, at 0. The away engine measures at the
     START of the window it prices, so a buff that died mid-absence must still be
     visible; filtering here would silently under-pay every long absence. */
  await db.exec(`update public.player_state
    set buffs = '[{"type":"damage","magnitude":3,"until":"2020-01-01T00:00:00Z"}]'::jsonb
    where user_id = '${U}' and slot = 0`);
  const envExp = await envelope();
  const pe = ((envExp && envExp.buffs) || [])[0];
  ok(!!pe && Number(pe.remaining_ms) === 0,
    `[9] an EXPIRED entry is not projected at remaining_ms 0 (${JSON.stringify(pe)}) — the away engine `
    + 'needs the entry that was alive when the window opened');

  // ── [12] NO CLIENT WRITE SURFACE ─────────────────────────────────────────
  const pol = (await db.query(
    `select count(*)::int n from pg_policy where polrelid = 'public.player_state'::regclass and polcmd <> 'r'`)).rows[0].n;
  ok(pol === 0, `[12] player_state has ${pol} non-read RLS policies — the buff clock would be client-authored`);
  const wr = (await db.query(
    `select count(*)::int n from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'hr_item_buffs'
        and grantee in ('anon','authenticated','service_role','PUBLIC') and privilege_type <> 'SELECT'`)).rows[0].n;
  ok(wr === 0, `[12] ${wr} client write grants on hr_item_buffs — the price list would be editable`);

  // ── [13] THE SHADOW COPY IS GONE ─────────────────────────────────────────
  const resSrc = await readFile(join(ROOT, 'src', 'net', 'client-state.js'), 'utf8');
  const resArr = /RESIDUE_FIELDS\s*=\s*(?:Object\.freeze\()?\[([\s\S]*?)\n\]/.exec(resSrc);
  ok(!!resArr, '[13] could not read RESIDUE_FIELDS out of src/net/client-state.js — the collision check '
    + 'did NOT run');
  if (resArr) {
    const names = new Set([...resArr[1].matchAll(/^\s*'([A-Za-z_][A-Za-z0-9_]*)',/gm)].map((m) => m[1]));
    ok(names.size > 20, `[13] RESIDUE_FIELDS scan found only ${names.size} names — the scan has drifted`);
    ok(!names.has('buffs'),
      '[13] `buffs` is STILL in RESIDUE_FIELDS while the server denies it — the server refuses the WHOLE '
      + 'patch on a forbidden key, so every residue field would stop saving for every player');
  }
  await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
  await db.exec('set role authenticated');
  let put = null; let putOk = null;
  try {
    put = (await db.query(
      `select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r`,
      [JSON.stringify({ buffs: [{ type: 'damage', magnitude: 9999, remainingMs: 9e9 }] })])).rows[0].r;
    putOk = (await db.query(
      `select public.hr_put_client_state(0, $1::jsonb, gen_random_uuid()) as r`,
      [JSON.stringify({ lootFilter: ['junk'] })])).rows[0].r;
  } catch (e) { put = { ok: false, error: '__threw__', message: String(e && e.message) }; }
  await db.exec('reset role');
  ok(!!put && put.ok === false && put.error === 'forbidden_field' && put.field === 'buffs',
    `[13] a client_state PUT carrying a forged buff queue was not refused forbidden_field/buffs — got `
    + `${JSON.stringify(put).slice(0, 140)}`);
  ok(!!putOk && putOk.ok === true,
    `[13] an HONEST residue PUT was refused (${JSON.stringify(putOk).slice(0, 140)}) — a deny-list that `
    + 'eats legitimate patches is worse than none');
  const stored = (await db.query(
    'select client_state from public.player_state where user_id = $1 and slot = 0', [U])).rows[0].client_state;
  ok(!stored || !Object.prototype.hasOwnProperty.call(stored, 'buffs'),
    `[13] client_state stored a buffs key anyway: ${JSON.stringify(stored).slice(0, 120)}`);

  // ── [15] ONE CEILING, ONE NUMBER ─────────────────────────────────────────
  const capSql = (await db.query(
    `select position('c_buff_max_ms constant bigint  := ' || $1::text || ';' in
       pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure)) as p`,
    [String(BUFF_MAX_UNTIL_MS)])).rows[0].p;
  ok(Number(capSql) > 0,
    `[15] hr_apply does not carry c_buff_max_ms = ${BUFF_MAX_UNTIL_MS} — src/core/buffs.js `
    + 'BUFF_MAX_UNTIL_MS and the SQL ceiling disagree, which is two numbers for one bound');

  // ── [10]/[11] THE ENGINE: INERT WITHOUT A BUFF, PAYING WITH ONE ──────────
  const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);
  const FROM = NOW - 3600000;
  const night = (buffs) => computeAccrual({
    userId: U, slot: 0,
    nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'slime',
    capMs: 12 * 3600000, seed: 987654321,
    hp: 200, maxHp: 200, gold: 0,
    skills: { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 },
    equipment: {}, items: ITEMS, monsters: MONSTERS,
    buffs,
  });
  const bare = JSON.stringify(night(undefined));
  ok(bare === JSON.stringify(night(null)),
    '[10] AWAY-1: an ABSENT buffs input and an explicit null produce different accruals');
  ok(bare === JSON.stringify(night([])),
    '[10] AWAY-1: an EMPTY queue is not byte-identical to no queue — the feature is not inert when '
    + 'nobody has a buff, and every existing fixture would shift');
  ok(bare === JSON.stringify(night([{ type: 'damage', magnitude: 50, until: new Date(FROM - 1000).toISOString() }])),
    '[10] AWAY-1: an EXPIRED buff changed the accrual — a buff that ended before the window opened must '
    + 'pay nothing');
  const buffed = JSON.stringify(night(
    [{ type: 'damage', magnitude: 200, until: new Date(NOW + 600000).toISOString() }]));
  ok(buffed !== bare,
    '[11] a LIVE +200% damage buff changed NOTHING about the night — the projection is threaded but the '
    + 'engine does not pay it, which is exactly the false green [10] would report as perfect');

  return failed;
}

/** Registered surface for run-ci-local / run-smoke. */
export async function buffQueueGuard() { failed = 0; await run(); return failed; }

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/buff-queue.mjs');

if (RUN_DIRECTLY) {
  try {
    if (argv.includes('--list')) {
      for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(34)} ${m.why}`);
      process.exit(0);
    }

    if (argv.includes('--selftest')) {
      /* Scored by tests/mutation-proof.mjs: the CLEAN baseline runs FIRST and must
         be green, and an undeclared throw is a HARNESS error rather than a free
         "caught". Every arm is run GATE-BLIND (both §4 self-checks short-
         circuited) so the tick comes from THIS guard's assertions and not from
         the migration refusing to install — the renown-faucet lesson. */
      const code = await runMutationProof({
        label: 'buff-queue',
        cases: Object.entries(MUTATIONS).map(([id, m]) => ({ id, why: m.why })),
        baseline: async () => { await run(); },
        arm: async (id) => { await run(id, true); },
        failures: () => failed,
        reset: () => { failed = 0; },
      });
      process.exit(code);
    }

    const mArg = argv.find((a) => a.startsWith('--mutate='));
    const n = await run(mArg ? mArg.split('=')[1] : undefined, !!mArg);
    if (n) {
      console.error(`buff-queue: ${n} violation(s)`);
      process.exit(mArg ? 0 : 1);
    }
    if (mArg) { console.error(`\nx --mutate=${mArg.split('=')[1]}: STAYED GREEN.`); process.exit(1); }
    console.log('buff-queue: the server owns the buff clock ON A REBUILT CHAIN, by execution — no client '
      + 'role can reach hr_apply and a call as `authenticated` is refused; hr_item_buffs equals '
      + 'src/data/items.js row for row and every type is one the engine can pay; a valid buff_apply '
      + 'stamps until from now() + the catalogue duration with the catalogue type and magnitude; a '
      + 'forged until/magnitude/type/duration_ms/remaining_ms/scale is refused BY NAME with the queue '
      + 'unmoved; an unknown, non-buff or malformed item is refused; a second helping EXTENDS the tail, '
      + 'a stronger dish raises the magnitude to max and a weaker one cannot dilute it, a different type '
      + 'JOINS, and the type stays one row; repeated consumes land on the 60-minute cap and the next is '
      + 'refused buff_at_max with the gold in the same delta unmoved; a replayed intent buffs once; the '
      + 'envelope projects the queue top-level with a server-derived remaining_ms (expired entries at 0) '
      + 'and ate no neighbour; client_state refuses a forged buff patch while an honest one still saves; '
      + 'the accrual engine is BYTE-IDENTICAL with no live buff and demonstrably richer with one; and a '
      + 'second apply of both migrations leaves all three bodies byte-identical.');
    process.exit(0);
  } catch (e) {
    if (e && e.harness) { console.error(`buff-queue: HARNESS — ${e.message}`); process.exit(2); }
    throw e;
  }
}
