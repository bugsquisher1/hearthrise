#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/frame-origin-marker.mjs — A TICK WRITER MARKS ITS TRANSACTION, AND THE
//                                 EMITTER STILL ASKS WHO IS WATCHING.
//
//   node tests/frame-origin-marker.mjs           # the guard (no DB, no network)
//   node tests/frame-origin-marker.mjs --mutate  # plant each defect, require it caught
//
// Ships with: supabase/migrations/2026-10-07-frame-emit-online-only.sql
//
// ── WHY ─────────────────────────────────────────────────────────────────
// That migration sends a TICK-originated frame only to a character with a live
// window (REL_M5_FLIP_2026-10-06 F4c: 28,800 frames per offline character-month
// against a 2 M Free quota). A tick transaction is recognised by ONE line,
//     perform set_config('hr.frame_origin', 'tick', true);
// which the file splices into hr_tick_settle and hr_party_tick_settle. Its
// self-check (§9 v1) checks every tick writer in the catalog, but only AT
// APPLY. The way this breaks later is a restatement: the next file that does
// `create or replace function public.hr_tick_settle(` from an older text, or
// adds a new tick writer that reaches hr_apply. That file comes after the
// self-check, so nothing executed would notice. Every frame would go out
// ungated again. That costs quota and no value, which is exactly the kind of
// failure that stays quiet.
//
// So this reads every migration AT OR AFTER that file, in apply order, and
// requires:
//   M1  the file itself still splices the marker into BOTH tick settles
//   M2  every later LITERAL definition of a function named *tick* whose body
//       calls public.hr_apply( sets the marker BEFORE its first hr_apply call
//   M3  every LITERAL definition of public.hr_frame_send( at or after the file
//       consults public.hr_frame_wanted( BEFORE perform realtime.send(
//
// WHAT IT CANNOT SEE: a programmatic (pg_get_functiondef + replace) patch that
// removes the line. Those are anchored and self-checked at apply, and
// tests/patch-chain-guard.mjs counts them. Comments are stripped before
// reading, so a marker that only appears in a comment does not count.
//
// Exit: 0 green · 1 a finding · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OWN = '2026-10-07-frame-emit-online-only.sql';
const MARK = "set_config('hr.frame_origin', 'tick', true)";

/* -- line comments only, and only when the `--` is not inside a '…' literal on
   that line. Good enough for this repo's migrations, whose bodies never put
   `--` inside a string; a block comment is stripped too. */
function stripComments(sql) {
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.split('\n').map((line) => {
    let inStr = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "'") inStr = !inStr;
      else if (!inStr && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

/* Every literal `create or replace function public.<name>(` and the text up to
   the next one (or the end of the file). */
function definitions(sql) {
  const re = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi;
  const hits = [...sql.matchAll(re)];
  return hits.map((m, i) => ({
    name: m[1].toLowerCase(),
    body: sql.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : sql.length),
  }));
}

export function check(files) {
  const problems = [];
  const at = files.findIndex((f) => f.name === OWN);
  if (at < 0) return [`M0 ${OWN} is not in the apply order — the gate this guard protects is not in the chain`];

  const own = stripComments(files[at].text);
  for (const fn of ['hr_tick_settle', 'hr_party_tick_settle']) {
    const anchor = `raise exception '${fn}: not callable by %'`;
    const i = own.indexOf(anchor);
    if (i < 0) { problems.push(`M1 ${OWN} no longer anchors on ${fn}'s identity check`); continue; }
    const j = own.indexOf(`perform ${MARK};`, i);
    const k = own.indexOf('execute replace(v_def, c_anchor, c_anchor || c_add)', i);
    if (j < 0 || k < 0 || j > k) problems.push(`M1 ${OWN} no longer splices the tick marker into ${fn}`);
  }

  for (const f of files.slice(at)) {
    const text = stripComments(f.text);
    for (const d of definitions(text)) {
      if (d.name.includes('tick')) {
        const ap = d.body.indexOf('public.hr_apply(');
        if (ap >= 0) {
          const mk = d.body.indexOf(MARK);
          if (mk < 0 || mk > ap) {
            problems.push(`M2 ${f.name}: ${d.name} reaches public.hr_apply( without first setting the tick `
              + 'marker, so every frame it causes goes to offline characters too');
          }
        }
      }
      if (d.name === 'hr_frame_send') {
        const g = d.body.indexOf('public.hr_frame_wanted(');
        const s = d.body.indexOf('perform realtime.send(');
        if (s >= 0 && (g < 0 || g > s)) {
          problems.push(`M3 ${f.name}: hr_frame_send sends without asking hr_frame_wanted first`);
        }
      }
    }
  }
  return problems;
}

async function loadChain() {
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'));
  const names = order.order || order.files || order.migrations;
  if (!Array.isArray(names)) throw Object.assign(new Error('schema-apply-order.json has no order array'), { harness: true });
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.sql')) continue;
    let text;
    try { text = await readFile(join(ROOT, 'supabase', 'migrations', name), 'utf8'); } catch { continue; }
    out.push({ name, text: text.replace(/\r\n/g, '\n') });
  }
  return out;
}

const LATER = '2099-01-01-later.sql';
const TICK_BODY = (inner) => `create or replace function public.hr_tick_settle(p_holder text)
returns jsonb language plpgsql as $$
begin
${inner}
  return public.hr_apply(null, 0, 0, null, '{}'::jsonb);
end $$;`;

const MUTATIONS = [
  { id: 'later_restatement_drops_marker', want: 'M2',
    plant: (fs) => [...fs, { name: LATER, text: TICK_BODY('  perform 1;') }] },
  { id: 'later_restatement_marker_only_in_comment', want: 'M2',
    plant: (fs) => [...fs, { name: LATER, text: TICK_BODY(`  -- perform ${MARK};`) }] },
  { id: 'later_marker_after_hr_apply', want: 'M2',
    plant: (fs) => [...fs, { name: LATER, text: `create or replace function public.hr_party_tick_settle(p text)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  v := public.hr_apply(null, 0, 0, null, '{}'::jsonb);
  perform ${MARK};
  return v;
end $$;` }] },
  { id: 'new_tick_writer_unmarked', want: 'M2',
    plant: (fs) => [...fs, { name: LATER, text: `create or replace function public.hr_tick_settle_batch(p jsonb)
returns void language plpgsql as $$
begin
  perform public.hr_apply(null, 0, 0, null, p);
end $$;` }] },
  { id: 'later_emitter_drops_gate', want: 'M3',
    plant: (fs) => [...fs, { name: LATER, text: `create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
returns void language plpgsql as $$
begin
  perform realtime.send(p_env, 'frame', 't', true);
end $$;` }] },
  { id: 'own_file_loses_tick_marker', want: 'M1',
    plant: (fs) => fs.map((f) => (f.name !== OWN ? f : { ...f,
      text: f.text.replace(`  perform ${MARK};\n$a$;\n  v_def  text;\n  v_hits int;\nbegin\n  v_def := replace(pg_get_functiondef(\n    'public.hr_tick_settle(`,
        `  perform 1;\n$a$;\n  v_def  text;\n  v_hits int;\nbegin\n  v_def := replace(pg_get_functiondef(\n    'public.hr_tick_settle(`) })) },
  { id: 'own_file_out_of_order', want: 'M0',
    plant: (fs) => fs.filter((f) => f.name !== OWN) },
];

// The negative control: a later file that does it RIGHT must stay green.
const CONTROL = (fs) => [...fs, { name: LATER, text: TICK_BODY(`  perform ${MARK};`) }];

async function main() {
  let files;
  try { files = await loadChain(); } catch (e) { console.error(`frame-origin-marker: HARNESS ${e.message}`); return 2; }

  if (!process.argv.includes('--mutate')) {
    const p = check(files);
    for (const x of p) console.error(`  ✗ ${x}`);
    if (p.length) { console.error(`frame-origin-marker: RED — ${p.length} finding(s)`); return 1; }
    console.log(`frame-origin-marker: green — both tick settles marked, ${files.length - files.findIndex((f) => f.name === OWN)} file(s) at/after ${OWN} read`);
    return 0;
  }

  let bad = 0;
  const clean = check(files);
  if (clean.length) { console.error(`  ✗ the CLEAN tree is red (${clean[0]}), so no mutation result means anything`); return 1; }
  const ctl = check(CONTROL(files));
  if (ctl.length) { console.error(`  ✗ negative control: a correctly-marked later restatement went red (${ctl[0]})`); bad += 1; }
  else console.log('  ✓ negative control: a correctly-marked later restatement stays green');
  for (const m of MUTATIONS) {
    const planted = m.plant(files);
    if (m.id.startsWith('own_file_loses') && planted.find((f) => f.name === OWN).text === files.find((f) => f.name === OWN).text) {
      console.error(`  ✗ ${m.id}: anchor gone, the mutation planted nothing`); return 2;
    }
    const got = check(planted);
    if (got.some((x) => x.startsWith(m.want))) console.log(`  ✓ CAUGHT ${m.id} by ${m.want}`);
    else { bad += 1; console.error(`  ✗ MISSED ${m.id}: ${got.join(' | ') || 'green'}`); }
  }
  if (bad) { console.error(`frame-origin-marker --mutate: RED — ${bad} problem(s)`); return 1; }
  console.log(`frame-origin-marker --mutate: green — all ${MUTATIONS.length} planted defects caught, control green`);
  return 0;
}

process.exitCode = await main();
