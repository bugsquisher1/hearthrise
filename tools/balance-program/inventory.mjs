#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/inventory.mjs — EVERY ANCHOR IN THE GAME BELONGS TO A NAMED SYSTEM, OR THIS IS RED.
//
// The first whole-game audit missed clans, clan castles, the House's rooms and the Tower as a progression because it
// was built from what one agent read. This is the cure's second half: collect.mjs reads every anchor a system can
// leave behind (files, tables, functions, client RPCs, cron jobs, switches, envelope sections, unlock rows, recipe
// families, staged migrations, unmerged lanes, rulings, board and plan headings, Tyler's memory); systems.mjs claims
// them; an anchor nobody claims is an ORPHAN.
//
//   node tools/balance-program/inventory.mjs             the count by kind, the orphans, the registry's own faults
//   node tools/balance-program/inventory.mjs --check     the same, exit 1 on any orphan or fault. A LOCAL run, on the PC that
//                                                        holds Tyler's memory folder and the lane refs: never a CI step
//   node tools/balance-program/inventory.mjs --write     also write docs/design/balance-program/00-inventory.md
//   node tools/balance-program/inventory.mjs --selftest  HERMETIC (runs in CI): it never reads ~/.claude or origin/lane/*. It plants
//                                                        its own memory folder (a temp dir) and lane list, built from
//                                                        EXTRA_CLAIMS so the clean control is clean anywhere, then twelve cases: an unclaimed table and an unclaimed
//                                                        ruling must go red, a planted system must claim its anchor and
//                                                        appear in the written table, a bad domain, a twin id, a stale
//                                                        exact claim and a removed exact claim must each go red
//
// HOW AN ANCHOR IS CLAIMED (judge below):
//   code kinds   a row's `code` pattern on `<kind>:<id>`, or an EXTRA_CLAIMS row naming its id
//   lanes        a row's `docs` pattern on the lane's words (never on the word "lane"); a lane whose tip is older than
//                LANE_SWEEP_FLOOR is counted apart (old work, merged or dead) and never an orphan
//   build lanes  a lane nothing above claims is PROCESS when the build plan knows it: its own commits cite a plan id that is a
//                row of docs/design/balance-program/30-plan.md section D (L01..), or the plan names the branch. Any other new
//                lane is still an orphan: a branch nobody planned may be a system nobody listed
//   other docs   a row's `docs` pattern on the anchor's id and text, or an EXTRA_CLAIMS row its text contains
// A fault is: a system with no domain or status of the lists, a twin id, an EXTRA_CLAIMS row that matches nothing or
// names no owner (a lane row may match nothing: lanes merge and go), a code anchor only an OUT_OF_SCOPE docs pattern would hold, a system id missing from 03-domains.md.
//
// Reads only (the replayed chain, the tree, git refs, Tyler's memory when it is on this machine). Deterministic for one
// tree, one set of refs and one memory: anchors and rows are sorted, nothing is dated.
// Exit 0 clean, 1 red, 2 bad argument.
//
// mutant-anchors: none — --selftest plants its cases in memory and in a temp folder; no tracked file is patched
// ci-step: db-replay-17 | The balance program's inventory still catches an unclaimed system
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/inventory.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll, CODE_KINDS, WORK_KINDS, DOOR_KINDS, MEMORY_LINE_FILES } from './collect.mjs';
import { SYSTEMS, DOMAINS, STATUSES, OUT_OF_SCOPE, EXTRA_CLAIMS, LANE_SWEEP_FLOOR } from './systems.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = join(ROOT, 'docs', 'design', 'balance-program', '00-inventory.md');
const DOMAINS_DOC = join(ROOT, 'docs', 'design', 'balance-program', '03-domains.md');
const AUDIT = join(ROOT, 'docs', 'design', 'whole-game-audit-2026-11-20.md');
const OLD_LANES = 'x-lane-old';
const PLAN_LANES = 'x-plan-lane';
const PLAN_DOC = join(ROOT, 'docs', 'design', 'balance-program', '30-plan.md');

/** The build plan's lane ids (the `| Lnn |` rows of section D) and the branches it names. No file = an empty plan. */
export function readPlan(file = PLAN_DOC) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const at = text.search(/^## D\. /m), end = at < 0 ? -1 : text.slice(at + 1).search(/^## [A-Z]\. /m);
  const d = at < 0 ? '' : text.slice(at, end < 0 ? undefined : at + 1 + end);
  return { ids: new Set([...d.matchAll(/^\|\s*(L\d{2})\s*\|/gm)].map((m) => m[1])), lanes: new Set(text.match(/lane\/[a-z0-9][a-z0-9-]*/g) || []) };
}
const isCode = (a) => CODE_KINDS.includes(a.kind);
const laneDate = (a) => a.text.split(' ').pop();

/**
 * Who owns every anchor. Pure: the registry is passed in, so the selftest can plant rows.
 * @returns {{owners: Map<object, string[]>, orphans: object[], faults: string[], oldLanes: number}}
 */
export function judge({ anchors, systems = SYSTEMS, out = OUT_OF_SCOPE, extras = EXTRA_CLAIMS, domainsDoc = null, plan = { ids: new Set(), lanes: new Set() } }) {
  const faults = [];
  const ids = new Set();
  for (const s of systems) {
    if (ids.has(s.id)) faults.push(`the system id ${s.id} is used twice`);
    ids.add(s.id);
    if (!DOMAINS.some((d) => d.id === s.domain)) faults.push(`${s.id}: no such domain "${s.domain}"`);
    if (!STATUSES.includes(s.status)) faults.push(`${s.id}: no such status "${s.status}"`);
    if (domainsDoc !== null && !domainsDoc.includes('`' + s.id + '`')) faults.push(`${s.id}: not in 03-domains.md (run tools/balance-program/gen-domains.mjs and tell the domain's dive)`);
  }
  const outIds = new Set(out.map((o) => o.id));
  const extraHits = extras.map(() => 0);
  extras.forEach(([, needle, owner], i) => { if (!ids.has(owner) && !outIds.has(owner)) faults.push(`EXTRA_CLAIMS row ${i} ("${needle}") names no owner: ${owner}`); });
  const owners = new Map(), orphans = [];
  let oldLanes = 0;
  for (const a of anchors) {
    const key = `${a.kind}:${a.id}`.toLowerCase();
    const words = (a.kind === 'lane' ? a.text : `${a.id} ${a.text}`).toLowerCase();
    let mine;
    if (a.kind === 'lane' && laneDate(a) < LANE_SWEEP_FLOOR) { oldLanes += 1; mine = [OLD_LANES]; }
    else if (isCode(a)) {
      mine = systems.filter((s) => s.code.test(key)).map((s) => s.id);
      if (!mine.length) mine = out.filter((o) => o.code.test(key)).map((o) => o.id);
    } else {
      mine = systems.filter((s) => s.docs.test(words)).map((s) => s.id);
      if (!mine.length) mine = out.filter((o) => o.docs.test(words)).map((o) => o.id);
    }
    extras.forEach(([kind, needle, owner], i) => {
      if (kind !== a.kind) return;
      if (isCode(a) ? a.id === needle : a.id === needle || a.text.includes(needle)) { extraHits[i] += 1; if (!mine.includes(owner)) mine.push(owner); }
    });
    if (!mine.length && a.kind === 'lane' && (plan.lanes.has(a.id) || (a.cites || []).some((id) => plan.ids.has(id)))) mine.push(PLAN_LANES);
    owners.set(a, mine);
    if (!mine.length) orphans.push(a);
  }
  extras.forEach(([kind, needle], i) => { if (!extraHits[i] && kind !== 'lane') faults.push(`EXTRA_CLAIMS row ${i} (${kind} "${needle}") matches no anchor: a stale claim`); });
  return { owners, orphans, faults, oldLanes };
}

/** How many lines of the first audit name each system (its `docs` pattern, line by line). */
export function auditLines(systems = SYSTEMS, file = AUDIT) {
  const ls = existsSync(file) ? readFileSync(file, 'utf8').toLowerCase().split(/\r?\n/) : [];
  return new Map(systems.map((s) => [s.id, ls.filter((l) => s.docs.test(l)).length]));
}

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '-';
const some = (list, n) => (list.length <= n ? list.join(', ') : `${list.slice(0, n).join(', ')} +${list.length - n}`);

/** docs/design/balance-program/00-inventory.md, as text. */
export function render({ anchors, verdict, systems = SYSTEMS, audit = auditLines(systems), memoryRead = true }) {
  const mineOf = new Map(systems.map((s) => [s.id, []]));
  const outCount = new Map([...OUT_OF_SCOPE.map((o) => [o.id, 0]), [OLD_LANES, 0], [PLAN_LANES, 0]]);
  for (const [a, ids] of verdict.owners) for (const id of ids) { if (mineOf.has(id)) mineOf.get(id).push(a); else outCount.set(id, (outCount.get(id) || 0) + 1); }
  const by = (id, kinds) => mineOf.get(id).filter((a) => kinds.includes(a.kind)).map((a) => a.id).sort();
  const kinds = {};
  for (const a of anchors) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  const never = systems.filter((s) => !audit.get(s.id));
  const once = systems.filter((s) => audit.get(s.id) === 1);
  let o = '# Balance program 00: the inventory\n\n';
  o += 'Every system in Hearthrise, read from the game itself and not from memory: the source tree, the replayed database chain, the edge function, staged migrations, unmerged lanes, the board, the itemization plans and Tyler\'s rulings. Written by `node tools/balance-program/inventory.mjs --write`; do not edit by hand. The registry is `tools/balance-program/systems.mjs`.\n\n';
  o += `**${systems.length} systems, ${anchors.length} anchors, ${verdict.orphans.length} orphans.**${memoryRead ? '' : ' Tyler\'s memory was NOT readable on this machine: rulings and memory anchors are missing from this run.'}\n\n`;
  o += '| Anchors read | ' + Object.keys(kinds).sort().map((k) => k).join(' | ') + ' |\n|---|' + Object.keys(kinds).map(() => '---').join('|') + '|\n| count | ' + Object.keys(kinds).sort().map((k) => kinds[k]).join(' | ') + ' |\n\n';
  o += `Not game systems, counted and never hidden: ${OUT_OF_SCOPE.map((x) => `${x.name} ${outCount.get(x.id)}`).join('; ')}; lanes older than ${LANE_SWEEP_FLOOR} ${outCount.get(OLD_LANES)}; build lanes the plan knows (30-plan.md section D) ${outCount.get(PLAN_LANES)}.\n\n`;
  o += '| Domain | Systems | ' + STATUSES.join(' | ') + ' |\n|---|---|' + STATUSES.map(() => '---').join('|') + '|\n';
  for (const d of DOMAINS) { const r = systems.filter((s) => s.domain === d.id); o += `| ${d.name} | ${r.length} | ${STATUSES.map((st) => r.filter((s) => s.status === st).length).join(' | ')} |\n`; }
  o += `| All | ${systems.length} | ${STATUSES.map((st) => systems.filter((s) => s.status === st).length).join(' | ')} |\n\n`;
  o += 'Status: **live** a player can reach it today; **dark** built and switched off, hidden or with no caller; **staged** written and not applied or merged; **designed** a spec, no build; **ruled** Tyler said yes or hold, no spec; **idea** backlog.\n\n';

  o += '## What the first audit never covered\n\n';
  o += `\`docs/design/whole-game-audit-2026-11-20.md\`, read line by line against each system's own words. **${never.length} systems are named on no line** and ${once.length} more on exactly one. A system named in passing is not a system judged: the dives give every row the full card.\n\n`;
  o += '| System | Domain | Status | What is in the game |\n|---|---|---|---|\n';
  for (const s of never) {
    const t = by(s.id, ['table']).length, f = by(s.id, ['fn']).length, r = by(s.id, ['rpc']).length, files = by(s.id, ['data', 'core', 'session', 'window', 'social', 'edge']).length, u = by(s.id, ['unlock']).length;
    o += `| \`${s.id}\` ${cell(s.name)} | ${s.domain} | ${s.status} | ${[files && `${files} files`, t && `${t} tables`, f && `${f} functions`, r && `${r} client RPCs`, u && `${u} unlock rows`].filter(Boolean).join(', ') || 'no code'} |\n`;
  }
  o += `\nNamed on one line only: ${once.map((s) => '`' + s.id + '`').join(', ') || 'none'}.\n\n`;
  const darkBuilt = systems.filter((s) => s.status === 'dark');
  o += `**Built and dark (${darkBuilt.length}):** the game carries these in its tree or its database and no player can reach them. Each is either a feature waiting for a ruling or dead weight on every replay and every envelope.\n\n| System | Domain | Tables | Functions | Client RPCs | Files |\n|---|---|---|---|---|---|\n`;
  for (const s of darkBuilt) o += `| \`${s.id}\` ${cell(s.name)} | ${s.domain} | ${by(s.id, ['table']).length} | ${by(s.id, ['fn']).length} | ${by(s.id, ['rpc']).length} | ${by(s.id, ['data', 'core', 'session', 'window', 'social', 'edge']).length} |\n`;
  o += '\n';

  for (const d of DOMAINS) {
    const rows = systems.filter((s) => s.domain === d.id);
    o += `## ${d.name} (${rows.length})\n\n`;
    o += '| System | Status | Doors (windows, client RPCs, verbs, sections) | Code (files) | Tables and functions | Rulings, board, plans, lanes | Consumes | Produces | First audit, lines |\n|---|---|---|---|---|---|---|---|---|\n';
    for (const s of rows) {
      const doors = by(s.id, DOOR_KINDS).map((x) => x.replace(/^src\/shell\/windows\//, ''));
      const files = by(s.id, ['data', 'core', 'session', 'social', 'edge']).map((x) => x.replace(/^src\//, '').replace(/^supabase\/functions\//, 'edge:'));
      const tables = by(s.id, ['table']), fns = by(s.id, ['fn']);
      const other = ['cron', 'switch', 'flag', 'unlock', 'sink', 'activity', 'skill', 'ground', 'mode', 'event', 'recipe'].map((k) => [k, by(s.id, [k]).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`);
      const rul = by(s.id, ['ruling']), docsN = mineOf.get(s.id).filter((a) => !isCode(a) && !WORK_KINDS.includes(a.kind) && a.kind !== 'ruling').length, work = by(s.id, WORK_KINDS);
      o += `| \`${s.id}\` ${cell(s.name)} | ${s.status} | ${doors.length ? some(doors, 5) : 'none'} | ${files.length ? some(files, 4) : 'none'} | ${[tables.length && `${tables.length} tables (${some(tables, 3)})`, fns.length && `${fns.length} functions`, ...other].filter(Boolean).join('; ') || 'none'} | ${[rul.length && `${rul.length} rulings (${some(rul.map((x) => x.replace('rulings-of-record.md:', '')), 4)})`, docsN && `${docsN} doc lines`, work.length && `${work.length} lanes or staged (${some(work, 2)})`].filter(Boolean).join('; ') || 'none'} | ${cell(s.uses)} | ${cell(s.gives)} | ${audit.get(s.id) || '**0**'} |\n`;
    }
    o += '\n';
  }
  o += '## Orphans\n\n';
  o += verdict.orphans.length ? verdict.orphans.map((a) => `- ${a.kind} \`${a.id}\` ${cell(a.text).slice(0, 120)}`).join('\n') + '\n' : 'None. Every anchor read belongs to a system above or to a named out-of-scope row.\n';
  return o;
}

function report(anchors, verdict) {
  const kinds = {};
  for (const a of anchors) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  console.log(`inventory: ${SYSTEMS.length} systems, ${anchors.length} anchors (${Object.keys(kinds).sort().map((k) => `${k} ${kinds[k]}`).join(', ')}), lanes older than ${LANE_SWEEP_FLOOR}: ${verdict.oldLanes}`);
  for (const a of verdict.orphans) console.log(`  ORPHAN ${a.kind} ${a.id}${isCode(a) ? '' : ' :: ' + a.text.slice(0, 110)}`);
  for (const f of verdict.faults) console.log(`  FAULT ${f}`);
  console.log(`${verdict.orphans.length || verdict.faults.length ? 'RED' : 'PASS'} inventory: ${verdict.orphans.length} orphan(s), ${verdict.faults.length} fault(s)`);
}

/** A memory folder and a lane list that hold exactly what EXTRA_CLAIMS names, plus one ruling a system claims and one old lane. */
function plantWorld() {
  const dir = mkdtempSync(join(tmpdir(), 'hr-inventory-selftest-'));
  const of = (kind) => EXTRA_CLAIMS.filter(([k]) => k === kind).map(([, needle]) => needle);
  const page = (head, body) => ['---', head, '---', '', ...body, ''].join('\n');
  writeFileSync(join(dir, 'rulings-of-record.md'), page('name: rulings-of-record', ['- HUNTS KEEP RUNNING on the server after the browser closes (planted).']));
  writeFileSync(join(dir, MEMORY_LINE_FILES[0]), page('name: planted', of('memory').map((n) => (n.startsWith('|') ? n : '- ' + n))));
  for (const name of of('memfile')) writeFileSync(join(dir, name), page('description: planted', []));
  const lanes = [...of('lane').map((name) => ({ name, date: '2026-11-10' })), { name: 'lane/zz-older-than-the-floor', date: '2026-01-01' }, { name: 'lane/d-burning-tower', date: '2026-11-14' }];
  return { dir, lanes };
}

async function selftest() {
  const world = plantWorld();
  let anchors;
  try { ({ anchors } = await collectAll({ root: ROOT, memory: world.dir, lanes: world.lanes })); } finally { rmSync(world.dir, { recursive: true, force: true }); }
  const domainsDoc = existsSync(DOMAINS_DOC) ? readFileSync(DOMAINS_DOC, 'utf8') : null;
  const S = (id, domain = 'social', status = 'idea') => ({ id, name: 'A planted guild bank', domain, status, code: /^table:zz_selftest_guild_bank$/, docs: /zz selftest moonwell/, uses: 'gold', gives: 'nothing', note: '' });
  const table = { kind: 'table', id: 'zz_selftest_guild_bank', text: '' };
  const ruling = { kind: 'ruling', id: 'zz:L99999', text: 'zz selftest moonwell' };
  const cases = [];
  const say = (name, ok, detail) => { cases.push(ok); console.log(`  ${ok ? 'ok ' : 'BAD'} ${name}: ${detail}`); };
  const clean = judge({ anchors, domainsDoc });
  /* THE CONTROL IS THE PLANTED WORLD'S, never the tree's. A lane that adds a table nobody has claimed yet must not turn CI
     red here (claiming it is `--check`'s job, run locally with the memory folder): so the control holds the registry's own
     faults and every planted anchor, and only REPORTS the tree's orphans and the exact claims on code the tree has dropped. */
  const isPlant = (a) => ['lane', 'ruling', 'memory', 'memfile'].includes(a.kind);
  const badPlants = clean.orphans.filter(isPlant), treeOrphans = clean.orphans.filter((a) => !isPlant(a));
  const treeStale = (x) => /^EXTRA_CLAIMS row \d+ \((section|board|plan|map) /.test(x);
  const faults = clean.faults.filter((x) => !treeStale(x));
  for (const a of badPlants) console.log(`    planted and unclaimed: ${a.kind} ${a.id} :: ${a.text.slice(0, 90)}`);
  for (const x of faults) console.log(`    fault ${x}`);
  if (treeOrphans.length || clean.faults.length > faults.length) console.log(`    note: the tree has ${treeOrphans.length} unclaimed anchor(s) and ${clean.faults.length - faults.length} dropped exact claim(s); run --check locally`);
  say('control', !badPlants.length && !faults.length && clean.oldLanes === 1, `${badPlants.length} planted anchors unclaimed, ${faults.length} faults, ${clean.oldLanes} old lane counted apart`);
  let v = judge({ anchors: [...anchors, table] });
  say('an unclaimed table', v.orphans.length === clean.orphans.length + 1 && v.orphans.includes(table), 'is an orphan');
  v = judge({ anchors: [...anchors, ruling] });
  say('an unclaimed ruling', v.orphans.includes(ruling), 'is an orphan');
  const planted = [...SYSTEMS, S('zz-guild-bank')];
  v = judge({ anchors: [...anchors, table, ruling], systems: planted });
  const doc = render({ anchors: [...anchors, table, ruling], verdict: v, systems: planted });
  say('a planted system', !v.orphans.includes(table) && !v.orphans.includes(ruling) && doc.includes('`zz-guild-bank` A planted guild bank') && /zz-guild-bank[^\n]*zz_selftest_guild_bank/.test(doc),
    'claims its table and its ruling and is a row of the written table with its anchor');
  v = judge({ anchors, systems: planted, domainsDoc });
  say('a system missing from 03-domains.md', domainsDoc === null || v.faults.some((f) => f.startsWith('zz-guild-bank: not in 03-domains.md')), 'is a fault');
  v = judge({ anchors, systems: [...SYSTEMS, S('zz-guild-bank', 'guilds')] });
  say('a system in no domain', v.faults.some((f) => f.includes('no such domain "guilds"')), 'is a fault');
  v = judge({ anchors, systems: [...SYSTEMS, { ...S(SYSTEMS[0].id) }] });
  say('a twin id', v.faults.some((f) => f.includes('used twice')), 'is a fault');
  v = judge({ anchors, extras: [...EXTRA_CLAIMS, ['section', 'zz_no_such_section', 'hunts']] });
  say('a stale exact claim', v.faults.some((f) => f.includes('zz_no_such_section') && f.includes('stale')), 'is a fault');
  const plan = { ids: new Set(['L03']), lanes: new Set(['lane/zz-named-in-the-plan']) };
  const lane = (id, cites = []) => ({ kind: 'lane', id, text: `${id.replace(/^lane\//, '').replace(/-/g, ' ')} 2026-11-21`, cites });
  const unknown = lane('lane/zz-qqq'), cited = lane('lane/zz-www', ['L03']), wrongId = lane('lane/zz-vvv', ['L99']), named = lane('lane/zz-named-in-the-plan');
  v = judge({ anchors: [...anchors, unknown, cited, wrongId, named], plan });
  say('a new lane the plan does not know', v.orphans.includes(unknown) && v.orphans.includes(wrongId), 'is an orphan, and so is one citing an id the plan has no row for');
  say('a lane citing a plan id, and a lane the plan names', v.owners.get(cited).includes(PLAN_LANES) && v.owners.get(named).includes(PLAN_LANES) && !v.orphans.includes(cited) && !v.orphans.includes(named), 'are claimed as process');
  v = judge({ anchors: [...anchors, cited, named] });
  say('the same two lanes with no plan', v.orphans.includes(cited) && v.orphans.includes(named), 'are orphans');
  v = judge({ anchors, extras: EXTRA_CLAIMS.slice(1) });
  say('a removed exact claim', v.orphans.some((a) => a.kind === EXTRA_CLAIMS[0][0] && a.id === EXTRA_CLAIMS[0][1]), `${EXTRA_CLAIMS[0][1]} is an orphan again`);
  const ok = cases.every(Boolean);
  console.log(`${ok ? 'PASS' : 'RED'} inventory --selftest: ${cases.filter(Boolean).length} of ${cases.length}`);
  return ok ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  const known = ['--check', '--write', '--selftest'];
  if (args.some((a) => !known.includes(a))) { console.error('usage: inventory.mjs [--check] [--write] | --selftest'); return 2; }
  if (args.includes('--selftest')) return selftest();
  const { anchors, memoryRead } = await collectAll({ root: ROOT, citeFrom: LANE_SWEEP_FLOOR });
  const domainsDoc = existsSync(DOMAINS_DOC) ? readFileSync(DOMAINS_DOC, 'utf8') : null;
  const verdict = judge({ anchors, domainsDoc, plan: readPlan() });
  report(anchors, verdict);
  if (!memoryRead) console.log('  NOTE Tyler\'s memory is not on this machine: rulings and memory lines were not read.');
  if (args.includes('--write')) { writeFileSync(DOC, render({ anchors, verdict, memoryRead })); console.log('wrote ' + DOC); }
  return args.includes('--check') && (verdict.orphans.length || verdict.faults.length) ? 1 : 0;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
