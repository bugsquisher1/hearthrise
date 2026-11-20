// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/collect.mjs — EVERY ANCHOR A SYSTEM CAN LEAVE BEHIND, READ FROM THE GAME ITSELF.
//
// The first whole-game audit (docs/design/whole-game-audit-2026-11-20.md) was built from what one agent
// happened to read, and never mentioned clans, clan castles, the House's room rungs or the property ladder
// although their tables, functions and data rows are in the repo. This file is the cure's first half: it
// lists every ANCHOR (a file, a table, a function, a client RPC, a cron job, a switch, a section of the
// envelope, a catalogue row that names a system, a staged migration, an unmerged lane, a ruling, a heading)
// with no judgement. tools/balance-program/systems.mjs then has to claim every one of them (inventory.mjs).
//
//   src        src/data/** (module + its exports), src/core/**, src/session/**, src/shell/windows/**,
//              src/social/**, the recipe families (src/data/recipes.js recipeCategory)
//   database   the REPLAYED chain (tests/schema-replay.mjs, PGlite; raw: as the files leave it): tables,
//              functions, hr_client_rpc_baseline, cron.job, hr_feature_switches, hr_flags, hr_state_sections,
//              hr_unlocks, hr_unlock_offers' tables, hr_sink_rules, hr_activities' kinds, hr_skills,
//              hr_hunt_grounds, hr_session_modes, hr_live_event_types, hr_dungeons
//   edge       supabase/functions/** files and the intent registry's verbs
//   work       unmerged origin/lane/* branches; staged migrations (tools/migration-note.mjs staged)
//   docs       PRIORITY_BOARD (Decisions + Backlog headings), the two itemization docs, SYSTEMS_MAP
//   memory     Tyler's memory (read-only, outside the repo): each ruling of record, the named roadmap files
//              line by line, and every other memory file by its description
//
// An anchor is { kind, id, text }. `id` is what a code claim matches; `text` is what a docs claim matches.
// PURE READS. Nothing is written, production is never touched.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CODE_KINDS = Object.freeze(['data', 'core', 'session', 'window', 'social', 'recipe', 'edge', 'verb',
  'table', 'fn', 'rpc', 'cron', 'switch', 'flag', 'section', 'unlock', 'sink', 'activity', 'skill', 'ground', 'mode', 'event', 'dungeon']);
export const WORK_KINDS = Object.freeze(['lane', 'staged']);
export const DOC_KINDS = Object.freeze(['board', 'plan', 'map', 'ruling', 'memory', 'memfile']);
/** Kinds that are a DOOR a player (or the page) reaches a system through. */
export const DOOR_KINDS = Object.freeze(['window', 'rpc', 'verb', 'section']);

export const DEFAULT_MEMORY = join(homedir(), '.claude', 'projects', 'R--the-game-the-game', 'memory');
/** The memory files read line by line (the brief's list). Every other memory file is one `memfile` anchor. */
export const MEMORY_LINE_FILES = Object.freeze(['master-backlog-2026-11-18.md', 'systems-roadmap-2026-11-07.md', 'game-modes-roadmap.md',
  'steam-launch-decisions.md', 'competitor-ravendawn.md', 'balance-ruling-2026-10-25.md', 'balance-program-2026-11-20.md']);

const slash = (p) => p.split('\\').join('/');
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const clip = (s, n = 400) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// ── src ─────────────────────────────────────────────────────────────────────
function exportsOf(text) {
  const names = [];
  for (const m of text.matchAll(/^export\s+(?:const|let|function\*?|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  return names;
}
export function collectSrc(root) {
  const out = [];
  const dirs = [['data', 'src/data'], ['core', 'src/core'], ['session', 'src/session'], ['window', 'src/shell/windows'], ['social', 'src/social']];
  for (const [kind, dir] of dirs) {
    for (const f of walk(join(root, dir))) {
      if (!f.endsWith('.js')) continue;
      const id = slash(relative(root, f));
      const text = kind === 'data' ? exportsOf(readFileSync(f, 'utf8')).join(' ') : '';
      out.push({ kind, id, text });
    }
  }
  return out;
}
export async function collectRecipes(root) {
  const f = join(root, 'src/data/recipes.js');
  if (!existsSync(f)) return [];
  const m = await import(pathToFileURL(f).href);
  const fams = new Map();
  for (const [skill, list] of Object.entries(m.ARTISAN_RECIPES_EVERY || m.ARTISAN_RECIPES || {})) {
    for (const r of Array.isArray(list) ? list : Object.values(list)) {
      const cat = (m.recipeCategory ? m.recipeCategory(skill, r) : null) || 'plain';
      const id = `${skill}/${cat}`;
      fams.set(id, (fams.get(id) || 0) + 1);
    }
  }
  return [...fams].sort().map(([id, n]) => ({ kind: 'recipe', id, text: `${n} recipes` }));
}

// ── edge ────────────────────────────────────────────────────────────────────
export async function collectEdge(root) {
  const out = [];
  for (const f of walk(join(root, 'supabase/functions'))) out.push({ kind: 'edge', id: slash(relative(root, f)), text: '' });
  const reg = join(root, 'supabase/functions/hr-accrue/intents.js');
  if (existsSync(reg)) {
    const m = await import(pathToFileURL(reg).href);
    for (const v of Object.keys(m.INTENT_REGISTRY || {}).sort()) out.push({ kind: 'verb', id: v, text: '' });
  }
  return out;
}

// ── database: the replayed chain ────────────────────────────────────────────
export async function collectDb(root) {
  const { bootReplay, closeReplays } = await import(pathToFileURL(join(root, 'tests/schema-replay.mjs')).href);
  const { db } = await bootReplay({ raw: true });
  const q = async (sql) => (await db.query(sql)).rows;
  const out = [];
  const push = (kind, id, text = '') => out.push({ kind, id: String(id), text: clip(text, 300) });
  try {
    for (const r of await q(`select c.relname::text nm from pg_class c join pg_namespace n on n.oid=c.relnamespace
                              where n.nspname='public' and c.relkind in ('r','v','m') order by 1`)) push('table', r.nm);
    for (const r of await q(`select distinct p.proname::text nm from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' order by 1`)) if (!r.nm.endsWith('__ungated')) push('fn', r.nm);
    for (const r of await q(`select distinct proname::text nm from public.hr_client_rpc_baseline order by 1`)) push('rpc', r.nm);
    for (const r of await q(`select jobname::text nm, schedule::text s from cron.job order by 1`)) push('cron', r.nm, r.s);
    for (const r of await q(`select switch_id::text nm, scope::text s from public.hr_feature_switches order by 1`)) push('switch', r.nm, `scope=${r.s}`);
    for (const r of await q(`select key::text nm, enabled from public.hr_flags order by 1`)) push('flag', r.nm, `enabled=${r.enabled}`);
    for (const r of await q(`select key::text nm, fn::text f from public.hr_state_sections order by 1`)) push('section', r.nm, r.f);
    for (const r of await q(`select unlock_id::text nm, max_value::text mv from public.hr_unlocks order by 1`)) push('unlock', r.nm, r.mv ? `max=${r.mv}` : '');
    for (const r of await q(`select table_name::text nm, count(*)::int n from public.hr_unlock_offers group by 1 order by 1`)) push('unlock', `offers:${r.nm}`, `${r.n} offers`);
    for (const r of await q(`select sink_id::text nm, scope::text s from public.hr_sink_rules order by 1`)) push('sink', r.nm, r.s);
    for (const r of await q(`select kind::text nm, count(*)::int n from public.hr_activities group by 1 order by 1`)) push('activity', r.nm, `${r.n} rows`);
    for (const r of await q(`select skill_id::text nm, cat::text c from public.hr_skills order by 1`)) push('skill', r.nm, r.c);
    for (const r of await q(`select hunt_id::text nm from public.hr_hunt_grounds order by 1`)) push('ground', r.nm);
    for (const r of await q(`select mode_id::text nm from public.hr_session_modes order by 1`)) push('mode', r.nm);
    for (const r of await q(`select type_id::text nm from public.hr_live_event_types order by 1`)) push('event', r.nm);
    for (const r of await q(`select dungeon_id::text nm, kind::text k from public.hr_dungeons order by 1`)) push('dungeon', r.nm, r.k);
  } finally { await closeReplays(); }
  return out;
}

// ── work: lanes and staged migrations ───────────────────────────────────────
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/* `cites`: the build-plan ids (L01..) a lane's OWN commits name (those not on HEAD), read only for lanes at or after `citeFrom`
   (one git log a lane); a planted lane carries its own. inventory.mjs holds them against docs/design/balance-program/30-plan.md. */
const PLAN_ID = /\bL\d{2}\b/g;
export function collectLanes(root, planted = null, citeFrom = null) {
  let raw = '';
  if (planted) raw = planted.map((l) => `${l.date} origin/${l.name}`).join('\n');
  else try { raw = git(root, ['for-each-ref', '--no-merged', 'HEAD', '--format=%(committerdate:short) %(refname:short)', 'refs/remotes/origin/lane/*']); }
  catch { return []; }
  const plantedCites = new Map((planted || []).map((l) => [l.name, l.cites || []]));
  return raw.split('\n').filter(Boolean).map((l) => {
    const [date, ref] = l.split(' ');
    const name = ref.replace(/^origin\//, '');
    let cites = plantedCites.get(name) || [];
    if (!planted && citeFrom && date >= citeFrom) {
      try { cites = [...new Set(git(root, ['log', '--format=%s%n%b', `HEAD..${ref}`]).match(PLAN_ID) || [])].sort(); } catch { cites = []; }
    }
    return { kind: 'lane', id: name, text: `${name.replace(/^lane\//, '').replace(/[-_/]+/g, ' ')} ${date}`, cites };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export async function collectStaged(root) {
  const lib = join(root, 'tools/lib/apply-order.mjs');
  if (!existsSync(lib)) return [];
  const { loadApplyOrder } = await import(pathToFileURL(lib).href);
  const o = loadApplyOrder(root);
  const out = [];
  const add = (file, note, where) => { if (/^STAGED/.test(String(note || ''))) out.push({ kind: 'staged', id: file, text: `${where} ${file.replace(/[-_.]+/g, ' ')} ${clip(note, 200)}` }); };
  for (const f of o.order || []) add(f, (o._order_notes || {})[f], 'chain');
  for (const [f, why] of Object.entries(o.excluded || {})) add(f, why, 'excluded');
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── docs in the repo ────────────────────────────────────────────────────────
const lines = (f) => readFileSync(f, 'utf8').split(/\r?\n/);
export function collectDocs(root) {
  const out = [];
  const head = (kind, rel, pred = () => true) => {
    const f = join(root, rel);
    if (!existsSync(f)) return;
    const name = rel.split('/').pop();
    lines(f).forEach((l, i) => {
      const m = /^(#{2,4})\s+(\S.*)$/.exec(l);
      if (m && /[A-Za-z]{3}/.test(m[2]) && pred(m, i)) out.push({ kind, id: `${name}:L${i + 1}`, text: clip(m[2]) });
    });
  };
  /* The board: every dated Decisions section and the Backlog's items. The map-drawing rows inside a design
     (lines of # and .) are not headings: a heading has three letters in a row. */
  head('board', 'docs/planning/PRIORITY_BOARD.md', (m) => m[1].length <= 3);
  const board = join(root, 'docs/planning/PRIORITY_BOARD.md');
  if (existsSync(board)) {
    const ls = lines(board);
    const at = ls.findIndex((l) => /^## Backlog/.test(l));
    if (at >= 0) ls.slice(at + 1).forEach((l, i) => { if (/^\s*(?:[-*]|\d+\.)\s+\S/.test(l)) out.push({ kind: 'board', id: `PRIORITY_BOARD.md:L${at + 2 + i}`, text: clip(l) }); });
  }
  head('plan', 'docs/design/itemization-plan.md');
  head('plan', 'docs/design/itemization-system.md');
  head('map', 'docs/SYSTEMS_MAP.md');
  return out;
}

// ── Tyler's memory (outside the repo, read-only) ────────────────────────────
export function collectMemory(dir = DEFAULT_MEMORY) {
  if (!dir || !existsSync(dir)) return { anchors: [], read: false };
  const out = [];
  const rul = join(dir, 'rulings-of-record.md');
  if (existsSync(rul)) {
    let section = '';
    lines(rul).forEach((l, i) => {
      const h = /^##\s+(.*)$/.exec(l);
      if (h) { section = h[1]; return; }
      if (/^- \S/.test(l)) out.push({ kind: 'ruling', id: `rulings-of-record.md:L${i + 1}`, text: clip(l.slice(2), 500), section });
    });
  }
  for (const name of MEMORY_LINE_FILES) {
    const f = join(dir, name);
    if (!existsSync(f)) continue;
    let fm = 0;
    lines(f).forEach((l, i) => {
      if (l.trim() === '---') { fm += 1; return; }
      if (fm < 2) return;
      if (/^\|\s*:?-{2,}/.test(l)) return;
      if (/^(?:\s*(?:[-*]|\d+\.)\s+\S|\|\s*\S|#{2,4}\s+\S)/.test(l) && /[A-Za-z]{3}/.test(l)) out.push({ kind: 'memory', id: `${name}:L${i + 1}`, text: clip(l, 500) });
    });
  }
  const skip = new Set(['rulings-of-record.md', 'MEMORY.md', ...MEMORY_LINE_FILES]);
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md') && !skip.has(n)).sort()) {
    const t = readFileSync(join(dir, name), 'utf8');
    const d = /^description:\s*(.*)$/m.exec(t);
    out.push({ kind: 'memfile', id: name, text: clip(`${name.replace(/[-_.]+/g, ' ')} ${d ? d[1] : ''}`, 500) });
  }
  return { anchors: out, read: true };
}

/**
 * Every anchor. `lanes` [{ name: 'lane/x', date: 'YYYY-MM-DD' }] replaces the git refs and `memory` names another folder
 * (inventory.mjs --selftest plants both, so it reads the same anchors on any machine). `db: false` skips the replay (the selftest's planted tree has no chain); `extra` is appended
 * (the selftest's planted database rows).
 * @returns {Promise<{anchors: {kind:string,id:string,text:string}[], memoryRead: boolean}>}
 */
export async function collectAll({ root, memory = DEFAULT_MEMORY, db = true, lanes = null, citeFrom = null, extra = [] } = {}) {
  const mem = collectMemory(memory);
  const anchors = [
    ...collectSrc(root),
    ...await collectRecipes(root),
    ...await collectEdge(root),
    ...(db ? await collectDb(root) : []),
    ...collectLanes(root, lanes, citeFrom),
    ...await collectStaged(root),
    ...collectDocs(root),
    ...mem.anchors,
    ...extra,
  ];
  const seen = new Set();
  for (const a of anchors) {
    const k = `${a.kind}:${a.id}`;
    if (seen.has(k)) throw new Error(`collect: the anchor ${k} was read twice`);
    seen.add(k);
  }
  return { anchors, memoryRead: mem.read };
}
