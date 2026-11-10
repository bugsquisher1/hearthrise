#!/usr/bin/env node
// tools/qa/hunt-path-table.local.mjs — THE BASELINE'S TABLE, from the JSON files tools/qa/hunt-path-baseline.local.mjs writes.
//
//   node tools/qa/hunt-path-table.local.mjs p1-m10.json p4-m10.json p1-m720.json p4-m720.json
//
// One column per run, one row per number, as markdown. It prints what the runs measured and nothing else: a number a run
// did not produce reads UNMEASURED. `med` is the median over the run's settles, `p95` the 95th percentile.
// mutant-anchors: none — a reader for a manual measuring tool, not a CI guard
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node tools/qa/hunt-path-table.local.mjs <run.json> [...]'); process.exit(2); }
const runs = files.map((f) => ({ name: basename(f, '.json'), j: JSON.parse(readFileSync(f, 'utf8')) }));
/* An --ab run counts every commit's rolled-back A half in its tuple counters: its proof is its own `ab` block, never this table. */
for (const r of runs) if (r.j.ab) { console.error(r.name + ' is an --ab run: its row counts are not a baseline. Read its `ab` block.'); process.exit(2); }
const U = 'UNMEASURED';
const n = (v, d = 0) => (Number.isFinite(v) ? (d ? v.toFixed(d) : String(Math.round(v))) : U);
const st = (s, k = 'median', d = 0) => (s && Number.isFinite(s[k]) ? n(s[k], d) : U);
const pair = (s, d = 0) => (s ? st(s, 'median', d) + ' / ' + st(s, 'p95', d) : U);
const kb = (v) => (Number.isFinite(v) ? (v / 1024).toFixed(1) + ' KB' : U);
const api = (j, phase, name, k) => { const a = j[phase] && j[phase].browserApi && j[phase].browserApi[name]; return a ? a[k] : null; };
const sumWrites = (w, col) => (w ? Object.values(w).reduce((a, d) => a + d[col], 0) : null);

const ROWS = [
  ['scenario', (j) => `${j.scenario.party === 1 ? 'lone hero' : 'party of ' + j.scenario.party}, ${j.scenario.minutes >= 60 ? j.scenario.minutes / 60 + ' h' : j.scenario.minutes + ' min'}, ${j.scenario.hunt} L${j.scenario.level}`],
  ['seed (dice secret pinned, instance id and clock are not)', (j) => j.scenario.seed],
  ['hunt ended (reason, minutes in)', (j) => (j.closed && j.closed.ends && j.closed.ends.length ? j.closed.ends.map((e) => e.end_reason + (e.forfeit ? ' FORFEIT' : '') + ' @' + e.minutes).join(', ') : 'still open at reopen')],
  ['**browser closed, world tick** settles', (j) => n(j.closed && j.closed.settles)],
  ['simulated seconds a settle (med / p95)', (j) => pair(j.closed && j.closed.perSettle && j.closed.perSettle.simSeconds)],
  ['kills a settle (med)', (j) => st(j.closed && j.closed.perSettle && j.closed.perSettle.kills)],
  ['ENGINE ms a settle, the engine\'s own (med / p95)', (j) => pair(j.closed && j.closed.perSettle && j.closed.perSettle.engineMs)],
  ['engine ms per simulated second (med / p95)', (j) => pair(j.closed && j.closed.perSettle && j.closed.perSettle.engineMsPerSimSecond, 1)],
  ['engine ms, whole hunt', (j) => n(j.closed && j.closed.engineMsTotal)],
  ['transactions a settle', (j) => st(j.closed && j.closed.perSettle && j.closed.perSettle.transactions)],
  ['statements a settle (+ role/marker overhead)', (j) => (j.closed && j.closed.perSettle ? st(j.closed.perSettle.statements) + ' (+' + st(j.closed.perSettle.overheadStatements) + ')' : U)],
  ['ROW WRITES a settle, the commit (med / p95)', (j) => pair(j.closed && j.closed.perSettle && j.closed.perSettle.rowsWritten)],
  ['  of them inserts / updates (mean)', (j) => (j.closed && j.closed.writesByTablePerSettle ? n(sumWrites(j.closed.writesByTablePerSettle, 0), 1) + ' / ' + n(sumWrites(j.closed.writesByTablePerSettle, 1), 1) : U)],
  ['  player_ledger rows a settle (mean)', (j) => { const w = j.closed && j.closed.writesByTablePerSettle && j.closed.writesByTablePerSettle['public.player_ledger']; return w ? n(w[0], 2) : U; }],
  /* a hero-hour: the party's seats times the hunt time the settles covered (simSecondsTotal is the instance's) */
  ['  player_ledger rows a hero-hour of hunt', (j) => { const c = j.closed, w = c && c.writesByTablePerSettle && c.writesByTablePerSettle['public.player_ledger']; return w && c.simSecondsTotal > 0 ? n(w[0] * c.settles / (j.scenario.party * c.simSecondsTotal / 3600), 1) : U; }],
  ['  of them renown rows, whole run', (j) => { const l = j.closed && j.closed.ledgerRows; return Array.isArray(l) ? n(l.filter((r) => r.kind === 'renown').reduce((a, r) => a + r.n, 0)) + ' of ' + n(l.reduce((a, r) => a + r.n, 0)) : U; }],
  ['  player_progress writes a settle (mean)', (j) => { const w = j.closed && j.closed.writesByTablePerSettle && j.closed.writesByTablePerSettle['public.player_progress']; return w ? n(w[0] + w[1], 2) : U; }],
  ['  player_state updates a settle (mean)', (j) => { const w = j.closed && j.closed.writesByTablePerSettle && j.closed.writesByTablePerSettle['public.player_state']; return w ? n(w[1], 2) : U; }],
  /* the ops the ENGINE sends; with the `collection_log` switch off hr_apply stores none of them (2027-03-30-dead-writes.sql) */
  ['  collection counter ops the engine sends a settle, ev:loot (mean)', (j) => { const p = j.closed && j.closed.progressOpsPerSettle; return p ? n(p['ev:loot'] || 0, 2) : U; }],
  ['row writes a fire by the cron body', (j) => st(j.closed && j.closed.perSettle && j.closed.perSettle.cronRowsWritten)],
  ['frames pushed a settle (browser closed)', (j) => st(j.closed && j.closed.perSettle && j.closed.perSettle.framesPushed)],
  ['commit payload the edge sends (med)', (j) => kb(j.closed && j.closed.perSettle && j.closed.perSettle.commitPayloadBytes && j.closed.perSettle.commitPayloadBytes.median)],
  ['commit ms, PGlite, first 3 settles -> last 3', (j) => (j.closed && j.closed.firstAndLast ? j.closed.firstAndLast.first3.map((x) => x.commitMs).join(',') + ' -> ' + j.closed.firstAndLast.last3.map((x) => x.commitMs).join(',') : U)],
  ['row writes, whole hunt (commits + cron)', (j) => n(j.closed && j.closed.rowsWrittenTotal)],
  ['**hunt watched** paid asks in the watch', (j) => n(j.viewed && j.viewed.helloPaid) + ' in ' + n(j.viewed && j.viewed.realSeconds) + ' s'],
  ['transactions / statements a paid ask', (j) => (j.viewed && j.viewed.perHelloPaid ? st(j.viewed.perHelloPaid.transactions) + ' / ' + st(j.viewed.perHelloPaid.statements) : U)],
  ['row writes a paid ask (med)', (j) => st(j.viewed && j.viewed.perHelloPaid && j.viewed.perHelloPaid.rowsWritten)],
  ['engine gap a paid ask, DERIVED: wall / process CPU ms (med)', (j) => (j.viewed && j.viewed.perHelloPaid ? st(j.viewed.perHelloPaid.engineGapMs_derived) + ' / ' + st(j.viewed.perHelloPaid.engineGapCpuMs_derived) : U)],
  ['frames pushed in the watch (count, med bytes)', (j) => (j.viewed ? (j.viewed.framesPushed ? n(j.viewed.framesPushed) + ', ' + kb(j.viewed.frameBytes && j.viewed.frameBytes.median) : '0') : U)],
  ['**envelope** hr-accrue paid answer (med)', (j) => kb(j.viewed && j.viewed.perHelloPaid && j.viewed.perHelloPaid.answerBytes && j.viewed.perHelloPaid.answerBytes.median)],
  ['hr_load answer at reopen (largest)', (j) => kb(api(j, 'reopen', 'hr_load', 'maxBytes'))],
  ['server residue in it (bytes, share)', (j) => { const b = api(j, 'reopen', 'hr_load', 'maxBytes'), c = api(j, 'reopen', 'hr_load', 'clientStateMax'); return Number.isFinite(b) && Number.isFinite(c) ? c + ' B, ' + (c / b * 100).toFixed(1) + '%' : U; }],
  ['residue stored at the end, hero 0', (j) => (j.residue && j.residue[0] ? j.residue[0].bytes + ' B' : U)],
  ['**reopen** page load -> characters screen (ms)', (j) => n(j.reopen && j.reopen.atCharacters && j.reopen.atCharacters.ms)],
  ['  requests / bytes by then (local: no cache, no compression)', (j) => (j.reopen && j.reopen.atCharacters ? j.reopen.atCharacters.requests + ' / ' + (j.reopen.atCharacters.bytes / 1048576).toFixed(1) + ' MB' : U)],
  ['Play press -> ' + 'hunt (or summary) on screen (ms)', (j) => n(j.reopen && j.reopen.fromPlayPressMs)],
  ['Play press -> the fight moving (ms)', (j) => (j.reopen && j.reopen.huntStillOpen === false ? 'no fight: the hunt had ended' : n(j.reopen && j.reopen.movingFromPlayPressMs))],
  ['page load -> on screen, whole (ms)', (j) => n(j.reopen && j.reopen.onScreen && j.reopen.onScreen.ms)],
  ['reload, same tab -> on screen (ms)', (j) => n(j.reload && j.reload.onScreenMs)],
  ['server calls in the first seconds back (hr_load / hr-accrue)', (j) => (j.reopen ? n(api(j, 'reopen', 'hr_load', 'n')) + ' / ' + n(api(j, 'reopen', 'hr-accrue', 'n')) + ', ' + kb((api(j, 'reopen', 'hr_load', 'bytes') || 0) + (api(j, 'reopen', 'hr-accrue', 'bytes') || 0)) : U)],
  ['run: real seconds', (j) => n(j.totalRealSeconds)],
];

console.log('| | ' + runs.map((r) => r.name).join(' | ') + ' |');
console.log('|---|' + runs.map(() => '---').join('|') + '|');
for (const [label, fn] of ROWS) console.log('| ' + label + ' | ' + runs.map((r) => { try { return fn(r.j); } catch { return U; } }).join(' | ') + ' |');
for (const r of runs) {
  if (r.j.error) console.log('\n' + r.name + ' ERROR: ' + String(r.j.error).split('\n')[0]);
  if (r.j.reopen && r.j.reopen.awayLine) console.log('\n' + r.name + ' on return: ' + r.j.reopen.awayLine);
}
