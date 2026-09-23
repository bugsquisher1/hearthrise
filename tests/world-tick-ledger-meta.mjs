#!/usr/bin/env node
// ============================================================================
// tests/world-tick-ledger-meta.mjs — THE PARITY READ MUST ADDRESS A LEVEL THAT
//                                    EXISTS (Security S-10, 2026-09-23).
//
//   node tests/world-tick-ledger-meta.mjs            the guard
//   node tests/world-tick-ledger-meta.mjs --mutate   plant the old spellings,
//                                                    require each to go red
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// `hr_apply` writes a ledger row's meta as
//
//     jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb)
//
// (2026-08-11-apply-engine.sql:1159 and every restatement since). The `||` is
// load-bearing: the JOURNAL's own keys — `att`, `kills`, `ate`, `capped`,
// `ms`, `ticks` — are merged at the **TOP** of `player_ledger.meta`, and only
// the engine's delta summary lives under `meta->'delta'`. There is no
// `meta->'meta'` level and there never was.
//
// WORLD_TICK_DESIGN.md §16.6 and the 2026-09-22 Security runbook both spelled
// the attended partition `(meta->'meta' ? 'att')`. That does not error — it
// evaluates to **NULL**. So:
//
//   · `group by … (meta->'meta' ? 'att')` collapses every row into ONE bucket,
//     and the partition the section calls "the thing that keeps the read
//     honest" silently does not partition;
//   · `where … and not (meta->'meta' ? 'att')` returns **NO ROWS AT ALL**,
//     because `not NULL` is NULL and never true.
//
// Either way the combat parity read comes back empty or unpartitioned, which
// is §16.3's own failure shape — a measurement that reads as a defect —
// planted in the instrument. A guard over the SQL is the only thing that
// catches it, because both spellings are syntactically valid and one of them
// silently answers nothing.
//
// ── WHY THIS READS THE DESIGN FILE RATHER THAN A COPY OF THE QUERY ──────────
// A test carrying its own transcription of the query would go green while the
// document an operator actually runs stayed wrong — which is exactly how this
// survived two reviews. So the §16.6 block is LIFTED OUT of
// docs/planning/WORLD_TICK_DESIGN.md and executed verbatim. Editing the doc
// back to the old spelling turns L-1 red; deleting the block turns L-0 red.
//
// Three further spellings in the same runbook were wrong the same way and are
// pinned here against the live catalogue rather than against memory:
// `hr_tick_config.flush_seconds` (not `flush_ms`), `hr_kill_credit_log
// .created_at` (not `at`), and deaths as their own `intent = 'death'` rows
// (not a `meta->'delta'->'deaths'` array, which is always absent).
//
// ── L-7, THE SAME CLASS ONE FIELD OVER (Security S-6b) ──────────────────────
// §16.10 used to name the edge payload hash to verify a deploy against, as a
// literal. Every merge into the lane moves that value, so it was stale all
// three times it was written down and Security filed it three times. A
// verification target that rots by construction is the same defect as a query
// addressing a level that does not exist: an instruction in the runbook that
// reads wrong when an operator executes it. L-7 requires the design to name NO
// full-length payload hash, so the only way to answer "what should
// payload_sha256 be" stays `pack-edge --hash` at the SHA being deployed.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.slice(2).includes('--mutate');
const problems = [];
function judge(id, pass, good, bad) {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
}
const group = (t) => console.log(`\n${t}`);

const DESIGN = join(ROOT, 'docs', 'planning', 'WORLD_TICK_DESIGN.md');
const U = '00000000-0000-4000-8000-0000000d0001';

/* THE §16.6 BLOCK, OUT OF THE DOCUMENT. Found by its own marker comment rather
   than by line number, so ordinary edits above it do not silently change what
   this guard executes. */
function designAttendedQuery() {
  const md = readFileSync(DESIGN, 'utf8');
  /* The fence is INDENTED — §16.6's block sits inside a numbered list — so the
     opening indent is captured and stripped off every line. A regex that
     assumed column 0 would silently find no block and this guard would report
     a missing section instead of grading the query. */
  const blocks = [...md.matchAll(/^([ \t]*)```sql\n([\s\S]*?)^\1```/gm)]
    .map((m) => m[2].split('\n').map((l) => (l.startsWith(m[1]) ? l.slice(m[1].length) : l)).join('\n'));
  const hit = blocks.filter((b) => /COMBAT parity, 48 h/.test(b));
  if (hit.length !== 1) {
    throw new Error(`expected exactly one "COMBAT parity, 48 h" sql block in `
      + `WORLD_TICK_DESIGN.md §16.6, found ${hit.length}`);
  }
  /* The block is a script: SQL comments and one statement. Strip whole-line
     comments so the statement can be recognised, but keep them out of what is
     executed rather than re-indenting them. */
  const stmts = hit[0].split(';')
    .map((x) => x.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim())
    .filter((x) => /^select/i.test(x));
  if (stmts.length !== 1) {
    throw new Error(`expected one select in the §16.6 block, found ${stmts.length}`);
  }
  return { sql: stmts[0], raw: hit[0] };
}

console.log('world-tick-ledger-meta: the parity read against a real hr_apply ledger row'
  + (MUTATE ? '  [--mutate: the OLD spellings, each required to go red]' : ''));

const { db, failures } = await bootReplay({});
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}

try {
  // ── SEED: two REAL hr_apply combat rows, one attended and one not ────────
  // Not a hand-inserted player_ledger row: the whole question is what hr_apply
  // DOES to a journal meta, so the row has to come out of hr_apply itself.
  await db.exec(`insert into auth.users (id) values ('${U}') on conflict do nothing;`);
  await db.exec(`
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since)
    values ('${U}', 0, 0, 0, 99, 99, 1, now() - interval '1 hour', 'combat', 'goblin',
            now() - interval '2 hours')
    on conflict (user_id, slot) do update set version = 1, gold = 0;`);

  const apply = async (ver, key, metaSql, extraSql = '') => {
    await db.exec('begin'); await db.exec('set local role hr_engine');
    let out;
    try {
      out = (await db.query(
        `select public.hr_apply('${U}'::uuid, 0, ${ver}::bigint, '${key}'::uuid,
           jsonb_build_object('gold', 500, 'xp', jsonb_build_object('strength', 1200),
             'items', jsonb_build_object('bones', 3),
             'accrued_to', to_jsonb(now()::timestamptz)
             ${extraSql},
             'journal', jsonb_build_object('kind','combat','intent','accrue',
               'meta', ${metaSql}))) as r`)).rows[0].r;
    } catch (e) { out = { ok: false, error: 'RAISED: ' + e.message }; }
    await db.exec('commit');
    return out;
  };

  const UNATT = "jsonb_build_object('ms',10800000,'ate',8,'kills',31,'ticks',300,'capped',false)";
  const ATT = "jsonb_build_object('ms',600000,'ate',1,'kills',4,'ticks',60,'capped',true,'att',9)";

  const r1 = await apply(1, '00000000-0000-0000-0000-00000000a001', UNATT);
  const ver2 = (await db.query(
    `select version from public.player_state where user_id = '${U}' and slot = 0`)).rows[0].version;
  const r2 = await apply(ver2, '00000000-0000-0000-0000-00000000a002', ATT);

  group('L-0  the seed is two REAL hr_apply rows, not hand-written jsonb');
  const led = (await db.query(
    `select meta from public.player_ledger
      where user_id = '${U}' and kind = 'combat' and intent = 'accrue' order by at`)).rows;
  judge('L-0', r1.ok === true && r2.ok === true && led.length === 2,
    `hr_apply wrote both rows (${led.length}) — the meta under test is the one the engine `
    + 'actually produces, not a transcription',
    `hr_apply refused: ${JSON.stringify(r1)} / ${JSON.stringify(r2)} (${led.length} rows)`);
  if (led.length !== 2) throw new Error('cannot grade the spellings without both ledger rows');

  // ── L-1 ── THE DOCUMENT'S OWN QUERY, EXECUTED ────────────────────────────
  group('L-1  docs/planning/WORLD_TICK_DESIGN.md §16.6, lifted out and run');
  {
    const { sql } = designAttendedQuery();
    /* --mutate puts the defect back into the query this guard executes — the
       same edit, in the same place, as the one the document carried. */
    const used = MUTATE ? sql.replace(/\(\s*meta \? 'att'\s*\)/g, "(meta->'meta' ? 'att')") : sql;
    if (MUTATE && used === sql) {
      judge('L-1 (mutate)', false, '', 'the mutation did not apply — §16.6 no longer spells '
        + "`(meta ? 'att')`, so this run proves nothing");
    } else {
      let rows = []; let raised = '';
      try { rows = (await db.query(used)).rows; } catch (e) { raised = String(e.message).slice(0, 120); }
      const buckets = new Set(rows.map((r) => String(r.attended)));
      const partitions = !raised && rows.length === 2 && buckets.has('true') && buckets.has('false');
      const pass = MUTATE ? !partitions : partitions;
      judge(MUTATE ? 'L-1 (mutate)' : 'L-1', pass,
        MUTATE
          ? "the OLD spelling `(meta->'meta' ? 'att')` does NOT partition — it answers "
            + `${JSON.stringify(rows.map((r) => ({ attended: r.attended, rows: r.rows })))}, `
            + 'which is one bucket keyed NULL, exactly as S-10 says'
          : "§16.6's query partitions the two rows into attended=true and attended=false: "
            + JSON.stringify(rows.map((r) => ({ attended: r.attended, rows: r.rows, gold: r.gold,
              kills: r.kills, ate: r.ate }))),
        MUTATE
          ? 'the old spelling PARTITIONED, so this guard can no longer tell the defect from the '
            + `fix: ${JSON.stringify(rows)}`
          : raised
            ? `§16.6's query RAISED: ${raised}`
            : 'the query in the design does not partition the attended split — it answered '
              + `${JSON.stringify(rows)}. If the attended column is null the doc has gone back `
              + 'to `meta->\'meta\'`, which is S-10.');
    }
  }

  // ── L-2 ── THE OLD SPELLING, PINNED AS STILL ANSWERING NOTHING ───────────
  group('L-2  the control: `meta->\'meta\'` is NULL, and `not NULL` returns no rows');
  {
    const [lvl] = (await db.query(
      `select (meta ? 'att') as top, (meta->'meta' ? 'att') as nested,
              meta->>'kills' as k_top, meta->'meta'->>'kills' as k_nested
         from public.player_ledger
        where user_id = '${U}' and intent = 'accrue' and meta ? 'att'`)).rows;
    const [{ n }] = (await db.query(
      `select count(*)::int as n from public.player_ledger
        where user_id = '${U}' and intent = 'accrue' and not (meta->'meta' ? 'att')`)).rows;
    const [{ n: nTop }] = (await db.query(
      `select count(*)::int as n from public.player_ledger
        where user_id = '${U}' and intent = 'accrue' and not (meta ? 'att')`)).rows;
    judge('L-2', lvl.top === true && lvl.nested === null
        && String(lvl.k_top) === '4' && lvl.k_nested === null
        && Number(n) === 0 && Number(nTop) === 1,
      "the journal's keys are at the TOP: `meta ? 'att'` is true and `meta->>'kills'` is "
      + `${lvl.k_top}, while \`meta->'meta' ? 'att'\` is NULL and \`meta->'meta'->>'kills'\` is `
      + `NULL. The unattended filter returns ${nTop} row spelled correctly and ${n} rows spelled `
      + "the old way — `not NULL` is never true",
      'the two levels are no longer distinguishable, so L-1 cannot tell the fix from the defect: '
      + `${JSON.stringify({ ...lvl, oldFilterRows: n, newFilterRows: nTop })}`);
  }

  // ── L-3 ── EVERY CORRECTED KEY READS ITS VALUE ───────────────────────────
  group('L-3  each spelling Security listed, executed against the row');
  {
    const [r] = (await db.query(
      `select (meta ? 'att') att, meta->>'kills' kills, meta->>'ate' ate,
              (meta->>'capped')::boolean capped, (meta->>'ms')::bigint ms,
              (meta->'delta'->>'g')::bigint g, meta->'delta'->'x' x, meta->'delta'->'i' i
         from public.player_ledger
        where user_id = '${U}' and intent = 'accrue' and not (meta ? 'att')`)).rows;
    const ok = r && r.att === false && String(r.kills) === '31' && String(r.ate) === '8'
      && r.capped === false && String(r.ms) === '10800000' && String(r.g) === '500'
      && r.x && Number(r.x.strength) === 1200 && r.i && Number(r.i.bones) === 3;
    judge('L-3', ok,
      'all eight read their value off the unattended row: '
      + JSON.stringify(r && { att: r.att, kills: r.kills, ate: r.ate, capped: r.capped,
        ms: String(r.ms), g: String(r.g), x: r.x, i: r.i }),
      `a corrected spelling still reads NULL: ${JSON.stringify(r)}`);
  }

  // ── L-4 ── DEATHS ARE ROWS, NOT AN ARRAY IN THE DELTA SUMMARY ────────────
  group('L-4  deaths are `intent = \'death\'` rows, never meta->\'delta\'->\'deaths\'');
  {
    const vNow = (await db.query(
      `select version from public.player_state where user_id = '${U}' and slot = 0`)).rows[0].version;
    const withDeath = await apply(vNow, '00000000-0000-0000-0000-00000000a003', UNATT,
      ", 'deaths', jsonb_build_array(jsonb_build_object('at', now(), 'by', 'goblin'))");
    const [{ n: deathRows }] = (await db.query(
      `select count(*)::int as n from public.player_ledger
        where user_id = '${U}' and intent = 'death'`)).rows;
    const [{ n: arrayHits }] = (await db.query(
      `select count(*)::int as n from public.player_ledger
        where user_id = '${U}' and intent = 'accrue'
          and jsonb_typeof(meta->'delta'->'deaths') = 'array'`)).rows;
    judge('L-4', withDeath.ok === true && Number(deathRows) >= 1 && Number(arrayHits) === 0,
      `a delta carrying one death produced ${deathRows} separate \`intent = 'death'\` ledger `
      + `row(s), and ZERO accrue rows carry a \`meta->'delta'->'deaths'\` array — so `
      + '`jsonb_array_length(meta->\'delta\'->\'deaths\')` would have counted 0 for every death '
      + 'in the parity read',
      `hr_apply: ${JSON.stringify(withDeath)}; death rows=${deathRows}, `
      + `accrue rows carrying a deaths array=${arrayHits} (expected >=1 and 0)`);
  }

  // ── L-5 ── THE TWO COLUMN NAMES, AGAINST THE CATALOGUE ───────────────────
  group('L-5  flush_seconds / created_at, read off the catalogue not off memory');
  {
    const col = async (t, c) => Number((await db.query(
      `select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2`, [t, c])).rows[0].n);
    const flushSeconds = await col('hr_tick_config', 'flush_seconds');
    const flushMs = await col('hr_tick_config', 'flush_ms');
    const createdAt = await col('hr_kill_credit_log', 'created_at');
    const bareAt = await col('hr_kill_credit_log', 'at');
    judge('L-5', flushSeconds === 1 && flushMs === 0 && createdAt === 1 && bareAt === 0,
      'hr_tick_config has `flush_seconds` and no `flush_ms`; hr_kill_credit_log has `created_at` '
      + 'and no `at` — the runbook\'s arm-fence query as written would have failed with '
      + '`column k.at does not exist`',
      `catalogue says flush_seconds=${flushSeconds} flush_ms=${flushMs} `
      + `created_at=${createdAt} at=${bareAt}`);
  }

  // ── L-6 ── NO SQL BLOCK IN THE DESIGN MAY ADDRESS meta->'meta' ───────────
  group('L-6  the whole design file, not just §16.6');
  {
    const md = readFileSync(DESIGN, 'utf8');
    /* EXECUTABLE sql only. §16.6 deliberately NAMES the wrong spelling in a
       `--` comment so the next reader sees which level is the trap; a guard
       that counted that as a defect would push the warning out of the file. */
    const bad = [...md.matchAll(/^([ \t]*)```sql\n([\s\S]*?)^\1```/gm)]
      .map((m) => m[2].split('\n').filter((l) => !/^\s*--/.test(l)).join('\n'))
      .filter((b) => /meta\s*->\s*'meta'/.test(b));
    judge('L-6', bad.length === 0,
      'no executable sql block in WORLD_TICK_DESIGN.md addresses a `meta->\'meta\'` level '
      + '(the prose naming the defect is not a query and is left alone)',
      `${bad.length} sql block(s) still address meta->'meta' — an operator running them reads `
      + `an empty result as a defect:\n${bad.join('\n---\n').slice(0, 600)}`);
  }

  // ── L-7 ── NO LITERAL PAYLOAD HASH MAY LIVE IN THE DESIGN (S-6b) ─────────
  group('L-7  §16.10 names no payload hash — it names how to measure one');
  {
    const md = readFileSync(DESIGN, 'utf8');
    /* A pack hash is 64 hex characters. Truncated forms (`9f9ec411…`) are
       HISTORY and are allowed on purpose: §16.10 lists the stale ones by their
       short form precisely so a reader who finds one in an old review knows why
       it must not be trusted. It is the full-length value — the only form an
       operator can paste into a comparison — that must not be here. */
    const literals = [...new Set((md.match(/\b[0-9a-f]{64}\b/g) || []))];
    const measures = /pack-edge\.mjs hr-accrue --hash/.test(md);
    judge('L-7', literals.length === 0 && measures,
      'the design names no full-length payload hash and does tell the operator to run '
      + '`pack-edge --hash` at the SHA being deployed — so there is no value here to go stale',
      literals.length
        ? `${literals.length} full-length hash literal(s) are back in WORLD_TICK_DESIGN.md: `
          + `${literals.map((h) => h.slice(0, 8) + '…').join(', ')}. Every merge moves the payload, `
          + 'so a written-down hash is stale by construction and an operator verifying against it '
          + 'chases a deploy that succeeded (Security S-6, filed three times).'
        : 'the design no longer tells the operator HOW to measure the hash — removing the literal '
          + 'without leaving the instruction is worse than the literal was');
  }
} finally {
  await db.close();
}

console.log('');
if (MUTATE) {
  if (problems.length) {
    console.log(`world-tick-ledger-meta --mutate: ${problems.length} arm(s) did NOT bite — `
      + `${problems.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('world-tick-ledger-meta --mutate: green — the old spelling was planted back into '
      + '§16.6\'s own query and L-1 went red, as required.');
  }
} else if (problems.length) {
  console.log(`world-tick-ledger-meta: ${problems.length} failure(s) — ${problems.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('world-tick-ledger-meta: green — the design\'s parity queries execute against a real '
    + 'hr_apply row and address the level hr_apply actually writes.');
}
