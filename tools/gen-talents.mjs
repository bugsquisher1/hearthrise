#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-talents.mjs — GENERATE THE SERVER'S ROADS CATALOGUE (lane/roads-sample, systems, 2026-11-23;
//   docs/design/redesign/17-talent-tree.md v3 section 11: "the server checks every node, link, pick, borrowed and vow count against its
//   catalogue"; 24-content-pipeline.md 3.8: "a generated catalogue plus drift guard is owed with L8").
//
// The map is src/data/talents.js and its rules src/core/talents.js; this writes the tables the server's Talents verbs read
// (1064-roads-sample.sql), so no node, link or price is typed twice:
//   hr_talent_rules        one row: live (THE SWITCH), point_from, vow_slots, max_borrowed, saved_builds_max
//   hr_talent_nodes        every node: kind, country or countries, move, after (the nodes it touches), needs (a hybrid's two countries)
//   hr_talent_options      every pickable option: its node, its id, and for a border town or the crossing the move it lends and the Level
//                          that move opens at (src/core/talents.js borrowBand; null when it is not offered there)
//   hr_talent_suggest      "Spend as suggested" per (discipline, plan): the order src/core/talents.js suggestedOrder walks, never a vow
//   hr_talent_open         per discipline: the open road the suggested rule spends into past the order
//   hr_talent_disciplines  a worn set's role key (hr_hunt_weapon_of) to its discipline (src/data/hunt-roles.js ROLE_KEYS)
//
// THE FORWARD-FILE RULE: an applied file is history and is never regenerated in place; new rows are a new sequence file (OUT_NAME).
//
//   node tools/gen-talents.mjs            write OUT_NAME
//   node tools/gen-talents.mjs --check    exit 1 if OUT_NAME is not what it would write
//   node tools/gen-talents.mjs --selftest every refusal bites
//
// mutant-anchors: none — --selftest plants defects in an in-memory copy of the data; no tracked file is patched
//
// REFUSES (throws, nothing written): a map src/data/talents.js validate() refuses; a suggested order the rules cannot walk from an empty
// build to its end (every step legal at a Level that has the points); an id outside [a-z_0-9.].
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '1064-roads-sample-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const PLANS = Object.freeze(['party', 'solo']);

async function load(root) {
  const q = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + q);
  const [td, tc, ab, hr] = await Promise.all([imp('src/data/talents.js'), imp('src/core/talents.js'), imp('src/data/abilities.js'), imp('src/data/hunt-roles.js')]);
  return { TD: td, T: tc, ABILITIES: ab.ABILITIES, DISCIPLINE_IDS: ab.DISCIPLINE_IDS, ROLE_KEYS: hr.ROLE_KEYS, nodes: td.TALENT_NODES };
}

const ID = /^[a-z_][a-z_0-9.]{0,63}$/;
const q = (s) => (s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");
const arr = (a) => (a && a.length ? 'array[' + a.map(q).join(', ') + ']::text[]' : 'null::text[]');

/** The catalogue's rows, refused on a defect. */
export function rowsOf(d) {
  const bad = d.TD.validate(d.nodes, { moves: Object.keys(d.ABILITIES) });
  if (bad.length) throw new Error('gen-talents: the map is refused: ' + bad.join('; '));
  const nodes = d.nodes.map((n, i) => {
    if (!ID.test(n.id)) throw new Error('gen-talents: node id ' + n.id);
    return { id: n.id, kind: n.kind, country: n.country ?? null, countries: n.countries || null, move: n.move ?? null, after: n.after,
      needs: (n.needs && n.needs.crossroadsIn) || null, seq: i + 1 };
  });
  const options = [];
  for (const n of d.nodes) for (const o of d.T.optionsOf(n)) {
    if (!ID.test(o.id)) throw new Error('gen-talents: option id ' + o.id);
    const b = o.effects.find((e) => e.kind === 'borrow');
    const band = b ? d.T.borrowBand(b.move, n.kind === 'crossing' ? 'havora' : 'border') : null;
    options.push({ node: n.id, id: o.id, borrow: b ? b.move : null, opensAt: band ? band.opensAt : null });
  }
  const suggest = [], open = [];
  for (const disc of d.DISCIPLINE_IDS) {
    for (const plan of PLANS) {
      const order = d.T.suggestedOrder(disc, plan);
      /* WALKABLE: from an empty build, each step legal at the Level that holds exactly the points it needs */
      let b = {};
      order.forEach(([id, pick], i) => {
        const p = pick === true ? null : pick;
        const why = d.T.spendProblem(b, id, p, i + d.TD.TALENT_RULES.pointFrom);
        if (why) throw new Error('gen-talents: the suggested order of ' + disc + '/' + plan + ' cannot buy ' + id + ' at step ' + (i + 1) + ': ' + why);
        if (d.TD.NODE_INDEX[id].kind === 'vow') throw new Error('gen-talents: the suggested order of ' + disc + '/' + plan + ' takes a vow (' + id + ')');
        b = d.T.spend(b, id, p);
        suggest.push({ disc, plan, seq: i + 1, node: id, pick: p });
      });
      /* the walk's end is a whole legal build at the Level that holds it (the saved-build rules, src/core/talents.js buildProblems) */
      const probs = d.T.buildProblems(b, order.length + d.TD.TALENT_RULES.pointFrom - 1);
      if (probs.length) throw new Error('gen-talents: the suggested walk of ' + disc + '/' + plan + ' ends on an illegal build: ' + JSON.stringify(probs));
    }
    open.push({ disc, node: d.T.suggestedOpen(disc) });
  }
  const disciplines = Object.entries(d.ROLE_KEYS).filter(([, r]) => r && r.discipline).map(([k, r]) => ({ key: k, disc: r.discipline }));
  const R = d.TD.TALENT_RULES;
  return { held: d.T.heldRules(d.nodes), rules: { live: R.live === true, pointFrom: R.pointFrom, vowSlots: [...R.vowSlots], maxBorrowed: R.maxBorrowed, savedMax: R.savedBuildsMax },
    nodes, options, suggest, open, disciplines };
}

export function buildSql(r) {
  const R = r.rules;
  const nodeValues = r.nodes.map((n) => `  (${q(n.id)}, ${q(n.kind)}, ${q(n.country)}, ${arr(n.countries)}, ${q(n.move)}, ${arr(n.after) === 'null::text[]' ? "'{}'::text[]" : arr(n.after)}, ${arr(n.needs)}, ${n.seq})`).join(',\n');
  const optValues = r.options.map((o) => `  (${q(o.node)}, ${q(o.id)}, ${q(o.borrow)}, ${o.opensAt === null ? 'null' : o.opensAt})`).join(',\n');
  const sugValues = r.suggest.map((s) => `  (${q(s.disc)}, ${q(s.plan)}, ${s.seq}, ${q(s.node)}, ${q(s.pick)})`).join(',\n');
  const openValues = r.open.map((o) => `  (${q(o.disc)}, ${q(o.node)})`).join(',\n');
  const discValues = r.disciplines.map((x) => `  (${q(x.key)}, ${q(x.disc)})`).join(',\n');
  /* the held rules, eight a comment line */
  const heldLines = [];
  for (let i = 0; i < r.held.length; i += 8) heldLines.push('--   ' + r.held.slice(i, i + 8).join(', '));
  const heldText = heldLines.join('\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ROADS' SERVER CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-talents.mjs from src/data/talents.js (the map), src/core/talents.js (the borrow bands, the suggested order),
--   src/data/abilities.js and src/data/hunt-roles.js. Any hand edit FAILS \`node tools/gen-talents.mjs --check\`.
--
-- WHAT (lane/roads-sample, systems, 2026-11-23; docs/design/redesign/17-talent-tree.md v3 sections 2, 3, 11): the rows the Talents verbs
-- check every spend, saved build and suggested walk against (1064-roads-sample.sql), so the server never trusts a client node, link or pick.
--   hr_talent_rules        1 row: live ${R.live} (THE SWITCH: false projects nothing and every verb refuses talents_closed), a point a Level
--                          from ${R.pointFrom}, vow slots at ${R.vowSlots.join(' / ')}, ${R.maxBorrowed} borrowed moves, ${R.savedMax} saved builds
--   hr_talent_nodes        ${r.nodes.length} nodes (the sample: the Great Hearth, Shield, Restoration, Shield · Restoration)
--   hr_talent_options      ${r.options.length} options, each lent move with the Level it opens at
--   hr_talent_suggest      ${r.suggest.length} steps of "Spend as suggested" (${r.open.length} disciplines x ${PLANS.join(', ')}), never a vow
--   hr_talent_open         ${r.open.length} open roads, hr_talent_disciplines ${r.disciplines.length} role keys
-- HELD: ${r.held.length} rules the engine plays as nothing yet (src/core/talents.js heldRules; 0 steps, listed so a live switch is a decision):
${heldText}
-- ORDER: 1064 in its name, before 1064-roads-sample.sql. Idempotent: tables made if missing and their rows rewritten whole, so a second
-- apply is byte-identical. No begin/commit (CLAUDE.md §2).
-- EXPLOIT SURFACE: none added here. Catalogue tables, RLS on, no policy, no grant to any client role.
-- REVERSIBLE: drop the six tables (after 1064-roads-sample.sql's readers).
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_talent_rules (
  id               boolean primary key default true check (id),
  live             boolean not null,
  point_from       int not null check (point_from >= 1),
  vow_slots        int[] not null,
  max_borrowed     int not null check (max_borrowed between 0 and 4),
  saved_builds_max int not null check (saved_builds_max between 1 and 256)
);
create table if not exists public.hr_talent_nodes (
  id        text primary key check (id ~ '^[a-z_][a-z_0-9.]{0,63}$'),
  kind      text not null check (kind in ('start', 'rank', 'crossroads', 'waystone', 'open', 'vow', 'border', 'hybrid', 'crossing', 'final', 'milepost')),
  country   text,
  countries text[],
  move      text,
  after_ids text[] not null,
  needs     text[],
  seq       int not null unique
);
create table if not exists public.hr_talent_options (
  node_id   text not null references public.hr_talent_nodes (id) on delete cascade,
  option_id text not null check (option_id ~ '^[a-z_]{1,48}$'),
  borrow    text,
  opens_at  int,
  primary key (node_id, option_id)
);
create table if not exists public.hr_talent_suggest (
  discipline text not null,
  plan       text not null check (plan in ('party', 'solo')),
  seq        int not null check (seq >= 1),
  node_id    text not null references public.hr_talent_nodes (id) on delete cascade,
  pick       text,
  primary key (discipline, plan, seq)
);
create table if not exists public.hr_talent_open (
  discipline text primary key,
  node_id    text not null references public.hr_talent_nodes (id) on delete cascade
);
create table if not exists public.hr_talent_disciplines (
  role_key   text primary key,
  discipline text not null
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_talent_rules', 'hr_talent_nodes', 'hr_talent_options', 'hr_talent_suggest', 'hr_talent_open', 'hr_talent_disciplines'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
    execute format('comment on table public.%I is %L', v_t, '${OUT_NAME}: the Roads catalogue (src/data/talents.js through tools/gen-talents.mjs).');
  end loop;
end $mig$;

-- ── §2 THE ROWS, REWRITTEN WHOLE ─────────────────────────────────────────────
delete from public.hr_talent_suggest;
delete from public.hr_talent_open;
delete from public.hr_talent_options;
delete from public.hr_talent_nodes;
delete from public.hr_talent_rules;
delete from public.hr_talent_disciplines;
insert into public.hr_talent_rules (id, live, point_from, vow_slots, max_borrowed, saved_builds_max)
  values (true, ${R.live}, ${R.pointFrom}, array[${R.vowSlots.join(', ')}]::int[], ${R.maxBorrowed}, ${R.savedMax});
insert into public.hr_talent_nodes (id, kind, country, countries, move, after_ids, needs, seq) values
${nodeValues};
insert into public.hr_talent_options (node_id, option_id, borrow, opens_at) values
${optValues};
insert into public.hr_talent_suggest (discipline, plan, seq, node_id, pick) values
${sugValues};
insert into public.hr_talent_open (discipline, node_id) values
${openValues};
insert into public.hr_talent_disciplines (role_key, discipline) values
${discValues};

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $mig$
declare v_n int;
begin
  if (select count(*) from public.hr_talent_nodes) <> ${r.nodes.length} or (select count(*) from public.hr_talent_options) <> ${r.options.length}
     or (select count(*) from public.hr_talent_suggest) <> ${r.suggest.length} or (select count(*) from public.hr_talent_rules) <> 1 then
    raise exception 'VERIFY(a): the catalogue''s counts are not the generator''s'; end if;
  -- every link names a node of an earlier seq (the map is a tree out of the one start)
  select count(*) into v_n from public.hr_talent_nodes n, unnest(n.after_ids) a
   where not exists (select 1 from public.hr_talent_nodes p where p.id = a and p.seq < n.seq);
  if v_n <> 0 or (select count(*) from public.hr_talent_nodes where kind = 'start') <> 1 then
    raise exception 'VERIFY(b): % links name no earlier node, or the map has no single start', v_n; end if;
  -- every pickable node has its options; every suggested pick is one of its node's
  if exists (select 1 from public.hr_talent_nodes n where n.kind in ('crossroads', 'hybrid', 'border', 'crossing')
              and not exists (select 1 from public.hr_talent_options o where o.node_id = n.id))
     or exists (select 1 from public.hr_talent_suggest s where s.pick is not null
                 and not exists (select 1 from public.hr_talent_options o where o.node_id = s.node_id and o.option_id = s.pick))
     or exists (select 1 from public.hr_talent_suggest s join public.hr_talent_nodes n on n.id = s.node_id where n.kind = 'vow') then
    raise exception 'VERIFY(c): a pickable node without options, a suggested pick its node does not offer, or a suggested vow'; end if;
  raise notice 'gen-talents: % nodes, % options, % suggested steps; all green', ${r.nodes.length}, ${r.options.length}, ${r.suggest.length};
end $mig$;
`;
}

export async function generate(root = ROOT) { return buildSql(rowsOf(await load(root))); }

async function selftest() {
  const base = await load(ROOT);
  const bites = [];
  const plant = (name, patch) => {
    const d = { ...base, nodes: base.nodes.slice(), T: { ...base.T } };
    patch(d);
    try { rowsOf(d); bites.push(name + ': NOT refused'); } catch { /* refused */ }
  };
  plant('a node that touches nothing', (d) => { d.nodes = d.nodes.map((n) => (n.id === 'shelter.x1' ? { ...n, after: [] } : n)); });
  plant('a node after a later one', (d) => { d.nodes = d.nodes.map((n) => (n.id === 'challenge.r1' ? { ...n, after: ['shelter.w2'] } : n)); });
  plant('a vow with no cost', (d) => { d.nodes = d.nodes.map((n) => (n.id === 'vow.hold_fast' ? { ...n, effects: [n.effects[0]] } : n)); });
  plant('a suggested order that skips a stone', (d) => { const f = base.T.suggestedOrder; d.T.suggestedOrder = (x, p) => f(x, p).filter(([id]) => id !== 'challenge.r2'); });
  plant('a suggested order that takes a vow', (d) => { const f = base.T.suggestedOrder; d.T.suggestedOrder = (x, p) => [...f(x, p).slice(0, 4), ['vow.last_stand', true], ...f(x, p).slice(4)]; });
  plant('a node id the catalogue cannot hold', (d) => { d.nodes = [...d.nodes, { ...d.nodes[1], id: 'Bad Id' }]; });
  const sql = buildSql(rowsOf(base));
  for (const k of ['VERIFY(a)', 'VERIFY(b)', 'VERIFY(c)', 'hr_talent_rules', 'hr_talent_suggest', 'hr_talent_disciplines']) if (!sql.includes(k)) bites.push('the file does not carry ' + k);
  if (bites.length) { console.error('gen-talents --selftest FAILED:\n  ' + bites.join('\n  ')); process.exit(1); }
  console.log('gen-talents --selftest: 6 refusals bite, the file carries its self-check');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) await selftest();
  else {
    const sql = await generate();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r/g, '') !== sql) { console.error('gen-talents --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-talents.mjs'); process.exit(1); }
      console.log('gen-talents --check: catalogue matches src/data/talents.js and src/core/talents.js');
    } else {
      await writeFile(OUT, sql);
      console.log('wrote ' + OUT);
    }
  }
}
