#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/pitr-drill.local.mjs — THE PITR RESTORE DRILL, SCRIPTED (docs/design/restore-runbook.md §9b).
//   (lane/c-ops-gates, reliability-engineer, 2026-11-19.) Ready to run the day Tyler turns PITR on; costs nothing until then.
//
//   node tools/pitr-drill.local.mjs --preflight             READ-ONLY on production: is PITR on, pick the target instant T,
//                                                            record production's markers around T -> ~/.hearthrise/pitr-drill-<T>.json
//   node tools/pitr-drill.local.mjs --disarm <clone-ref>    the CLONE ONLY: unschedule every cron job and switch the tick off, so
//                                                            the clone never posts to production's edge. Refuses production's ref
//                                                            and any project older than the plan.
//   node tools/pitr-drill.local.mjs --verify <clone-ref>    READ-ONLY on the clone: the recovery point against T (the RPO), the
//                                                            time to healthy (the RTO), the census beside production's, the gates
//   node tools/pitr-drill.local.mjs --selftest              the verdicts on planted rows, the read-only filter, both refusals
//
// mutant-anchors: none — --selftest drives the verdict, the filter and the refusals on in-memory fixtures; no file is patched
//
// WHAT IT PROVES THAT NOTHING ELSE DOES. A point-in-time restore hands back the database AS IT WAS at T: every row written at or
// before T, none after. Two append-only operator series give that a resolution: hr_tick_cron_log (one row a tick fire, every
// 10 s, indexed on at) and hr_ops.capacity_samples (one row a minute, 1002-ops-capacity-sample.sql). Preflight records, from
// production, the last row of each at or before T and the first after it; verify reads the clone. PASS = the clone holds the
// last-before and not the first-after, so the recovery point sits inside one fire of T. The measured RPO is T minus the newest
// marker the clone holds. A clone restored from a DAILY backup instead fails here on purpose: its newest marker is hours old.
//
// SAFETY. The token is ~/.supabase-token, read as bytes, never printed, never in argv. Every query sent to production or to the
// clone passes a SELECT-only filter, except --disarm's two statements, which go only to a ref that is NOT production and whose
// project was created after the plan was written. Nothing here calls a restore endpoint: the clone is made by Tyler in the
// dashboard (no API exists for a restore to a new project, runbook §9), and an in-place restore of production is never a drill.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

export const PROD_REF = 'nezapsylztqbbwuwembx';
const API = 'https://api.supabase.com/v1/projects';
const PLAN_DIR = join(homedir(), '.hearthrise');
const argv = process.argv.slice(2);
const MARKERS = [
  { table: 'public.hr_tick_cron_log', id: 'id', at: 'at', every: '10 s' },
  { table: 'hr_ops.capacity_samples', id: 'id', at: 'at', every: '1 min' },
];
const CENSUS = ['auth.users', 'public.player_state', 'public.player_skills', 'public.player_inventory', 'public.player_progress',
  'public.player_ledger', 'public.account_bank', 'public.character_names', 'public.hunt_sessions'];

/** A statement this tool may send to a database it does not mean to change. */
export function readOnly(sql) {
  const s = String(sql).replace(/'(?:[^']|'')*'/g, "''");
  return /^\s*(select|with)\b/i.test(s) && !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|copy|vacuum|unschedule|schedule)\b/i.test(s);
}

/** May --disarm write to this project? Only a clone: not production, and made after the plan. */
export function disarmRefusal(ref, project, plan) {
  if (!/^[a-z]{20}$/.test(String(ref || ''))) return 'not a project ref';
  if (ref === PROD_REF) return 'that is PRODUCTION: the drill never writes there';
  if (!plan) return 'no plan: run --preflight first';
  if (!project || !project.created_at) return 'the project could not be read';
  if (Date.parse(project.created_at) <= Date.parse(plan.recorded_at)) return `the project was created ${project.created_at}, before the plan (${plan.recorded_at}): not this drill's clone`;
  return null;
}

/**
 * The recovery point, from one marker series.
 * @param {{last_le:{id:number,at:string}|null, first_gt:{id:number,at:string}|null}} prod  production around T
 * @param {{ids:number[], newest_at:string|null}} clone  which of those two ids the clone holds, and its newest row
 */
export function recoveryVerdict(T, prod, clone) {
  if (!prod || !prod.last_le || !prod.first_gt || !clone) return { verdict: 'UNREAD', why: 'a marker is missing on either side' };
  const has = (id) => (clone.ids || []).map(Number).includes(Number(id));
  const rpo = clone.newest_at ? Math.round((Date.parse(T) - Date.parse(clone.newest_at)) / 1000) : null;
  if (!has(prod.last_le.id)) return { verdict: 'FAIL', why: `restored too EARLY: the clone lacks row ${prod.last_le.id} (${prod.last_le.at}) written before T`, rpo };
  if (has(prod.first_gt.id)) return { verdict: 'FAIL', why: `restored PAST T: the clone holds row ${prod.first_gt.id} (${prod.first_gt.at}) written after T`, rpo };
  return { verdict: 'PASS', why: `the recovery point lies between ${prod.last_le.at} and ${prod.first_gt.at}`, rpo };
}

let token = null;
async function api(path, init = {}) {
  if (token === null) token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path.split('?')[0]}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function sql(ref, query, { write = false } = {}) {
  if (!write && !readOnly(query)) throw new Error('refused: not a read-only statement');
  return api(`/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}
const latestPlan = () => {
  try {
    const f = readdirSync(PLAN_DIR).filter((n) => /^pitr-drill-.*\.json$/.test(n)).sort().pop();
    return f ? { file: join(PLAN_DIR, f), plan: JSON.parse(readFileSync(join(PLAN_DIR, f), 'utf8')) } : null;
  } catch { return null; }
};

async function preflight() {
  const b = await api(`/${PROD_REF}/database/backups`);
  console.log(`backups: walg ${b.walg_enabled}, PITR ${b.pitr_enabled}, region ${b.region}; physical window `
    + `${JSON.stringify(b.physical_backup_data || {})}`);
  if (!b.pitr_enabled) {
    console.log('PITR IS OFF: the drill cannot run. It needs Tyler: Add-ons -> Point in Time Recovery (7 days), a spend he approves');
    console.log('(runbook §8: ~$100/month + Small compute). Nothing was recorded.');
    return 3;
  }
  // T: ten minutes ago, on the second, so both marker series have rows on each side of it.
  const T = new Date(Math.floor((Date.now() - 600000) / 1000) * 1000).toISOString();
  const plan = { target_at: T, recorded_at: new Date().toISOString(), prod: {}, census_now: {} };
  for (const m of MARKERS) {
    const [r] = await sql(PROD_REF, `select
        (select jsonb_build_object('id', ${m.id}, 'at', ${m.at}) from ${m.table} where ${m.at} <= '${T}'::timestamptz order by ${m.at} desc, ${m.id} desc limit 1) as last_le,
        (select jsonb_build_object('id', ${m.id}, 'at', ${m.at}) from ${m.table} where ${m.at} >  '${T}'::timestamptz order by ${m.at}, ${m.id} limit 1) as first_gt`);
    plan.prod[m.table] = r;
    console.log(`  ${m.table.padEnd(26)} last <= T ${JSON.stringify(r.last_le)}  first > T ${JSON.stringify(r.first_gt)}`);
  }
  for (const t of CENSUS) plan.census_now[t] = Number((await sql(PROD_REF, `select count(*)::bigint as n from ${t}`))[0].n);
  mkdirSync(PLAN_DIR, { recursive: true });
  const file = join(PLAN_DIR, `pitr-drill-${T.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(plan, null, 1));
  console.log(`\nplan written: ${file}\nNEXT (Tyler, dashboard): Database -> Backups -> Point in time -> Restore to a NEW project at ${T} UTC.`);
  console.log('Never the in-place restore: it overwrites production. Then: node tools/pitr-drill.local.mjs --disarm <clone-ref>');
  return 0;
}

async function disarm(ref) {
  const p = latestPlan();
  let project = null;
  try { project = await api(`/${ref}`); } catch (e) { project = null; }
  const no = disarmRefusal(ref, project, p && p.plan);
  if (no) { console.error(`--disarm refused: ${no}`); return 3; }
  await sql(ref, 'select cron.unschedule(jobid) from cron.job', { write: true });
  await sql(ref, 'update public.hr_tick_config set enabled = false where id', { write: true });
  const [left] = await sql(ref, 'select (select count(*) from cron.job)::int as jobs, (select enabled from public.hr_tick_config where id) as tick');
  console.log(`clone ${ref} disarmed: ${left.jobs} cron jobs left, tick enabled = ${left.tick}`);
  return left.jobs === 0 && left.tick === false ? 0 : 1;
}

async function verify(ref) {
  const p = latestPlan();
  if (!p) { console.error('no plan: run --preflight first'); return 2; }
  if (ref === PROD_REF) { console.error('--verify reads the CLONE, not production'); return 3; }
  const { plan, file } = p;
  const project = await api(`/${ref}`);
  const results = { at: new Date().toISOString(), clone: ref, status: project.status, created_at: project.created_at, markers: {}, census: {} };
  let red = 0;
  for (const m of MARKERS) {
    const prod = plan.prod[m.table];
    const ids = [prod && prod.last_le && prod.last_le.id, prod && prod.first_gt && prod.first_gt.id].filter((x) => x !== null && x !== undefined);
    const [r] = await sql(ref, `select (select coalesce(jsonb_agg(${m.id}), '[]'::jsonb) from ${m.table} where ${m.id} in (${ids.map(Number).join(',') || 'null'})) as ids,
        (select max(${m.at}) from ${m.table}) as newest_at`);
    const v = recoveryVerdict(plan.target_at, prod, r);
    results.markers[m.table] = { ...v, newest_at: r.newest_at };
    if (v.verdict !== 'PASS') red += 1;
    console.log(`  ${v.verdict.padEnd(6)} ${m.table} (a row every ${m.every}): ${v.why}; RPO ${v.rpo ?? '?'} s`);
  }
  for (const t of CENSUS) {
    const n = Number((await sql(ref, `select count(*)::bigint as n from ${t}`))[0].n);
    results.census[t] = { clone: n, prod_at_preflight: plan.census_now[t] };
    console.log(`  census ${t.padEnd(26)} clone ${n}  production at preflight ${plan.census_now[t]}`);
  }
  const rto = project.created_at ? Math.round((Date.now() - Date.parse(project.created_at)) / 60000) : null;
  results.rto_minutes_upper_bound = rto;
  console.log(`  status ${project.status}; created ${project.created_at}; RTO at most ${rto} min (clone created -> this verify)`);
  plan.results = results;
  writeFileSync(file, JSON.stringify(plan, null, 1));
  console.log(red ? `\nDRILL RED: ${red} marker series failed` : `\nDRILL GREEN. Record in tests/restore-census.baseline.json restore_drill: last_executed ${results.at.slice(0, 10)}, `
    + 'mechanism "PITR restore to a new project", the RPO and RTO above. Then Tyler deletes the clone (destructive, his explicit yes).');
  return red ? 1 : 0;
}

function selftest() {
  const fails = [];
  const t = (label, ok) => { console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${label}`); if (!ok) fails.push(label); };
  const T = '2026-11-19T20:00:00.000Z';
  const prod = { last_le: { id: 10, at: '2026-11-19T19:59:55Z' }, first_gt: { id: 11, at: '2026-11-19T20:00:05Z' } };
  t('PASS: the clone holds the row before T and not the row after', recoveryVerdict(T, prod, { ids: [10], newest_at: '2026-11-19T19:59:55Z' }).verdict === 'PASS');
  t('the RPO is T minus the clone\'s newest marker', recoveryVerdict(T, prod, { ids: [10], newest_at: '2026-11-19T19:59:55Z' }).rpo === 5);
  t('FAIL: restored too early (a daily backup)', recoveryVerdict(T, prod, { ids: [], newest_at: '2026-11-19T10:27:00Z' }).verdict === 'FAIL');
  t('FAIL: restored past T', recoveryVerdict(T, prod, { ids: [10, 11], newest_at: '2026-11-19T20:00:05Z' }).verdict === 'FAIL');
  t('UNREAD, never PASS, when production had no row after T', recoveryVerdict(T, { last_le: prod.last_le, first_gt: null }, { ids: [10] }).verdict === 'UNREAD');
  t('ids as strings (the endpoint\'s bigint) still match', recoveryVerdict(T, prod, { ids: ['10'], newest_at: '2026-11-19T19:59:55Z' }).verdict === 'PASS');
  t('read-only: a select passes', readOnly('select count(*) from public.player_state'));
  t('read-only: an update is refused', !readOnly('update public.hr_tick_config set enabled = false'));
  t('read-only: a write hidden after a select is refused', !readOnly('select 1; delete from public.player_ledger'));
  t('read-only: a keyword inside a string literal does not refuse a read', readOnly("select count(*) from public.hr_tick_cron_log where outcome = 'error' or 'delete' = ''"));
  t('read-only: unschedule is refused', !readOnly('select cron.unschedule(jobid) from cron.job'));
  const plan = { recorded_at: '2026-11-19T20:10:00Z' };
  t('disarm refuses PRODUCTION', /PRODUCTION/.test(disarmRefusal(PROD_REF, { created_at: '2026-11-19T21:00:00Z' }, plan) || ''));
  t('disarm refuses a project older than the plan', /before the plan/.test(disarmRefusal('abcdefghijklmnopqrst', { created_at: '2026-11-19T19:00:00Z' }, plan) || ''));
  t('disarm refuses without a plan', !!disarmRefusal('abcdefghijklmnopqrst', { created_at: '2026-11-19T21:00:00Z' }, null));
  t('disarm admits a clone made after the plan', disarmRefusal('abcdefghijklmnopqrst', { created_at: '2026-11-19T21:00:00Z' }, plan) === null);
  console.log(fails.length ? `pitr-drill --selftest: ${fails.length} FAILED` : 'pitr-drill --selftest: green');
  return fails.length ? 1 : 0;
}

async function main() {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--preflight')) return preflight();
  const at = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--disarm')) return disarm(at('--disarm'));
  if (argv.includes('--verify')) return verify(at('--verify'));
  console.log('usage: node tools/pitr-drill.local.mjs --preflight | --disarm <clone-ref> | --verify <clone-ref> | --selftest');
  return 2;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c)).catch((e) => { console.error(e.message); process.exit(2); });
