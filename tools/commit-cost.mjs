#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/commit-cost.mjs — WHAT ONE HUNT COMMIT WRITES, AND WHAT THE CLOCK COSTS WITH NOBODY THERE.
//
//   node tools/commit-cost.mjs [--door=fire|player] [--hunt=coppercap_warrens] [--level=40] [--windows=6] [--json=out.json]
//   node tools/commit-cost.mjs --audit ...        every row a commit writes, by table, with the line that wrote it (repeats named)
//   node tools/commit-cost.mjs --checkpoint ...   a CHECKPOINT before every window: WAL as the first commit after one writes it
//   node tools/commit-cost.mjs --ab=<file> ...    every commit run twice from one state, bodies before <file> then this tree's;
//                                                 every row written compared (A/B proof that <file> changes no value)
//   node tools/commit-cost.mjs --idle             the clock: hr_tick_cron_run, hr_tick_enrol, hr_ops.alert_run, nothing owed
//   node tools/commit-cost.mjs --state ...        after the windows: hr_state_of for the leader, inside it by blocks
//   --upto=<file>                                 the chain up to <file> (a BEFORE: --upto=<the last file before a change>)
//
// The instrument behind lane/r-commit-cost (2026-11-11), after .claude/coordination/hunt-path-baseline-2026-11-10.md
// found hr_hunt_apply_instance the heaviest statement on production (197.7 ms, 116 KB WAL, 36,330 buffers a call).
// tools/settle-cost.mjs times the edge's statements; this tool opens them up. THE FIXTURE is production's party shape:
// ONE account, four heroes (tank, healer, ranger, mage; tools/qa/party-soak.mjs's kit), one party started by the leader's
// own verb on a real ground, the window settled by the shipped edge (tick.js runTick = browser closed, `fire`; or the
// viewed hero's settleHunt = hunt watched, `player`). Every statement runs in its own transaction as hr_engine, and
// before it commits its own counters are read: Postgres's per-relation transaction counters (tuples inserted, updated,
// HOT-updated, deleted; blocks fetched) and the WAL insert position before and after. Those are exact, unlike PGlite's
// flushed statistics (hunt-path-baseline: function counters read 0.1 calls a settle). PGlite is PostgreSQL 18 in WASM,
// one long-lived backend: its milliseconds are not production's, its rows, blocks and WAL bytes are the same SQL's.
// Read-only toward the repo; never touches production. Not a CI step.
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { isMain } from '../tests/_is-main.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const idem = () => randomUUID();

const ROLES = ['tank', 'healer', 'ranger', 'mage'];
/* The set a hero of Level L wears (tools/qa/party-soak.mjs kitOf, the play-ground ladder). */
function kitOf(L, role) {
  const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
  const m = ['bronze', 'iron', 'steel', 'mithril'][t];
  const cloth = (a) => ({ helmet: a[t] + '_helmet', body: a[t] + '_body', pants: a[t] + '_pants', boots: a[t] + '_boots' });
  const casters = cloth(['apprentice', 'adept', 'scholar', 'warlock']);
  return {
    tank: { weapon: ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword'][t], shield: ['bronze_rimmed_shield', 'ironbound_shield', 'coppercap_shield', 'coppercap_shield'][t],
      helmet: m + '_helm', body: m + '_platebody', pants: m + '_platelegs', boots: m + '_boots' },
    healer: { weapon: ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff'][t], ...casters },
    ranger: { weapon: ['shortbow', 'willow_longbow', 'maple_bow', 'maple_bow'][t], ammo: 'bronze_arrows', ...cloth(['leather', 'studded', 'boarhide', 'snakeskin']) },
    mage: { weapon: ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand'][t], shield: ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook'][t], ...casters },
  }[role];
}

/* The edge's statements, by their first distinctive call (tools/settle-cost.mjs LABELS, the tick's own added). */
const LABELS = [
  [/hr_hunt_apply_instance/, 'apply (hr_hunt_apply_instance)'],
  [/hr_hunt_instance_read/, 'read (instance + members)'],
  [/hr_perks_of/, 'perks (hr_perks_of)'],
  [/hr_state_of/, 'caller envelope (hr_state_of)'],
  [/hr_hunt_tick_fence|hr_tick_fence|lease/i, 'tick: lease / fence'],
];
const labelOf = (sql) => { const s = String(sql); const hit = LABELS.find(([re]) => re.test(s)); return hit ? hit[1] : 'tick: ' + s.replace(/\s+/g, ' ').trim().slice(0, 48); };

/* EVERY RELATION'S OWN COUNTERS IN THIS TRANSACTION (pending, so exact). Catalog relations are kept apart: the query that
   reads them touches them itself, and production's figure is the statement's alone. */
const COUNTERS_SQL = `/* commit-cost */
select n.nspname as nsp, c.relname as rel, c.relkind as kind,
       coalesce(t.relname, c.relname) as owner,
       pg_stat_get_xact_tuples_inserted(c.oid)::int as ins, pg_stat_get_xact_tuples_updated(c.oid)::int as upd,
       pg_stat_get_xact_tuples_hot_updated(c.oid)::int as hot, pg_stat_get_xact_tuples_deleted(c.oid)::int as del,
       pg_stat_get_xact_blocks_fetched(c.oid)::int as blk
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  left join pg_index ix on ix.indexrelid = c.oid left join pg_class t on t.oid = ix.indrelid
 where c.relkind in ('r', 'i', 't', 'S', 'm', 'p', 'I')
   and (pg_stat_get_xact_blocks_fetched(c.oid) > 0 or pg_stat_get_xact_tuples_inserted(c.oid) > 0
        or pg_stat_get_xact_tuples_updated(c.oid) > 0 or pg_stat_get_xact_tuples_deleted(c.oid) > 0)`;
/* The counters are PENDING statistics: PGlite never flushes them, so they run on across transactions. A statement's own
   share is the difference of two readings around it; the reading's own catalog touches are measured once (calibrate) and
   taken back off. */
const snapOf = async (q) => new Map((await q(COUNTERS_SQL)).map((r) => [r.nsp + '.' + r.rel, r]));
const minus = (b, a, cal) => [...b.values()].map((r) => {
  const o = a.get(r.nsp + '.' + r.rel) || { ins: 0, upd: 0, hot: 0, del: 0, blk: 0 };
  const c = (cal && cal.get(r.nsp + '.' + r.rel)) || 0;
  return { ...r, ins: r.ins - o.ins, upd: r.upd - o.upd, hot: r.hot - o.hot, del: r.del - o.del, blk: Math.max(0, r.blk - o.blk - c) };
});
async function calibrate(q) { const s0 = await snapOf(q), s1 = await snapOf(q); return new Map(minus(s1, s0).map((r) => [r.nsp + '.' + r.rel, r.blk])); }
const LSN_SQL = `/* commit-cost */ select pg_current_wal_insert_lsn()::text as l`;
const lsnBytes = (l) => { const [hi, lo] = String(l).split('/'); return parseInt(hi, 16) * 4294967296 + parseInt(lo, 16); };

/* THE ROW AUDIT (--audit): one AFTER row trigger on every public table, logging the table, the row's primary key, the
   columns an update changed and the function line that wrote it (PG_CONTEXT). Lives in schema zz_bench, which no count
   includes. */
const AUDIT_SQL = `
create schema if not exists zz_bench;
create table if not exists zz_bench.rowlog (n bigserial primary key, xid xid8 default pg_current_xact_id(), tbl text, op text, pk text, cols text[], site text);
create or replace function zz_bench.rowlog_fn() returns trigger language plpgsql security definer set search_path = pg_catalog as $f$
declare ctx text; site text[]; o jsonb; nw jsonb; ks text[]; pk text := ''; k text;
begin
  get diagnostics ctx = pg_context;
  -- the first PL/pgSQL frame below this trigger's own (line one): the function and line that issued the write
  site := regexp_match(ctx, chr(10) || 'PL/pgSQL function (?:public[.]|hr_ops[.])?([a-z_0-9]+)[(][^)]*[)] line ([0-9]+)');
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then nw := to_jsonb(new); end if;
  foreach k in array tg_argv loop pk := pk || coalesce(coalesce(nw, o)->>k, '') || '/'; end loop;
  if tg_op = 'UPDATE' then
    select array_agg(e.key order by e.key) into ks from jsonb_each(nw) e where o->e.key is distinct from e.value;
  end if;
  insert into zz_bench.rowlog (tbl, op, pk, cols, site) values (tg_table_name, tg_op, pk, ks, coalesce(site[1] || ':' || site[2], 'sql'));
  return null;
end $f$;
do $d$
declare r record;
begin
  for r in select c.oid, c.relname,
                  (select string_agg(quote_literal(a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
                     from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                    where i.indrelid = c.oid and i.indisprimary) as pk
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('drop trigger if exists zz_bench_rowlog on public.%I', r.relname);
    execute format('create trigger zz_bench_rowlog after insert or update or delete on public.%I for each row execute function zz_bench.rowlog_fn(%s)',
                   r.relname, coalesce(r.pk, ''));
  end loop;
end $d$;`;

/* THE INSTRUMENTED WORLD: the replayed chain (tests/schema-replay.mjs, its cache), reopened from its own data directory
   with two of PGlite's contrib modules: pg_stat_statements (track = all: every statement INSIDE the functions, with its
   buffers and WAL) and pg_walinspect (every WAL record a commit wrote, by relation, full-page images apart). */
export async function bootInstrumented(upTo) {
  const { bootReplay } = await import('../tests/schema-replay.mjs');
  const base = (await bootReplay(upTo ? { upTo } : undefined)).db;
  const dir = await base.dumpDataDir('none');
  await base.close();
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_walinspect } = await import('@electric-sql/pglite/contrib/pg_walinspect');
  const { pg_stat_statements } = await import('@electric-sql/pglite/contrib/pg_stat_statements');
  const db = await PGlite.create({ loadDataDir: dir, extensions: { pg_walinspect, pg_stat_statements } });
  await db.exec(`create extension if not exists pg_walinspect; create extension if not exists pg_stat_statements;
    set pg_stat_statements.track = 'all'; set pg_stat_statements.track_utility = off`);
  /* PostgreSQL 18 initialises with data checksums, so the first hint bit set on a page after a checkpoint logs the whole
     page: a reopened data directory pays that once a catalogue page, inside whichever commit reads it first. One VACUUM
     sets them all before anything is measured, and the checkpoint after it starts every window from the same place. */
  await db.exec('vacuum');
  await db.exec('checkpoint');
  return db;
}
/* The nested statements of a measured stretch (pg_stat_statements since its reset); the tool's own readings (tagged
   commit-cost) and transaction control left out. */
const PSS_SQL = `/* commit-cost */ select left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 120) as statement, toplevel as top, calls,
  round(total_exec_time::numeric, 1) as ms, shared_blks_hit + shared_blks_read as blocks, wal_records, wal_fpi, wal_bytes::bigint as wal_bytes, rows
  from pg_stat_statements where query not like '%commit-cost%' and query not ilike 'savepoint%' and query not ilike 'release%'
   and query not ilike 'rollback%' and query not ilike 'set %' and query not ilike 'reset %' and query not ilike 'begin%' and query not ilike 'commit%'`;
/* WAL by relation over [a, b): each block's own data and full-page image to its relation, a record's header to its first
   block's. `record_bytes` is the whole share (images included); `fpi_bytes` the part of it that is page images. */
const WAL_BY_REL_SQL = `/* commit-cost */ select coalesce(c.relname, 'relfilenode ' || b.relfilenode) as rel,
  (count(*) filter (where b.block_id = 0))::int as records, sum(b.share)::bigint as record_bytes,
  (count(*) filter (where b.block_fpi_length > 0))::int as fpi, coalesce(sum(b.block_fpi_length), 0)::bigint as fpi_bytes
  from (select w.*, w.block_data_length + w.block_fpi_length
                    + case when w.block_id = 0 then w.record_length - sum(w.block_data_length + w.block_fpi_length) over (partition by w.start_lsn)
                           else 0 end as share
          from pg_get_wal_block_info($1::pg_lsn, $2::pg_lsn) w) b
  left join pg_class c on pg_relation_filenode(c.oid) = b.relfilenode
 group by 1`;

export async function prepare({ door = 'fire', hunt = 'coppercap_warrens', level = 40, windows = 6, windowMs = 90000, audit = false,
  checkpoint = false, ab = null, upTo = null, db: given } = {}) {
  if (!['fire', 'player'].includes(door)) throw new Error('door is fire | player');
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  const { bootReplay } = await import('../tests/schema-replay.mjs');
  const db = given || await bootInstrumented(upTo);
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => { const r = await q(sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };
  const uid = H.UIDS[0];
  const asMe = () => q(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  const fresh = () => q('delete from public.hr_rate_counters where user_id = $1', [uid]);
  const rpc = async (sql, p) => { await fresh(); await asMe(); const r = await one(sql, p); if (!r || r.ok !== true) throw new Error(sql + ' refused: ' + JSON.stringify(r)); return r; };

  await q('update public.hr_hunt_config set enabled = true where id');
  await q('update public.hr_tick_config set enabled = true where id');
  /* THE ACCOUNT: one login, four heroes, one purse (production's party: the QA account's four, 2026-11-10 baseline). */
  await db.exec('begin');
  await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await q(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'commit-cost') on conflict (user_id) do nothing`, [uid]);
  await q(`insert into public.account_wallet (user_id, gold) values ($1, 100000000) on conflict (user_id) do update set gold = 100000000`, [uid]);
  for (let s = 0; s < 4; s++) {
    const hero = async () => { await fresh(); await asMe(); return one('select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid)', [s, 'Costhero ' + 'ABCD'[s], '{"head":0,"body":0,"legs":0,"feet":0}', idem()]); };
    let r = await hero();
    if (!r || r.ok !== true) { await rpc('select public.hr_buy_hero_slot($1, 0, $2::uuid)', [s, idem()]); r = await hero(); }
    if (!r || r.ok !== true) throw new Error('hero ' + s + ': ' + JSON.stringify(r));
  }
  for (const s of [1, 2, 3]) await rpc('select public.hr_hunt_party_invite_own(0, $1, $2::uuid)', [s, idem()]);
  for (let s = 0; s < 4; s++) {
    await q(`update public.player_state set level_xp = $3, hp = 1000000, stamina_ms = 43200000, stamina_at = now(), active_kind = 'idle', active_id = null
              where user_id = $1 and slot = $2`, [uid, s, M.XP.charXpForLevel(level)]);
    for (const k of ['melee', 'ranged', 'magic', 'defense']) {
      await q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, $3, $4)
               on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, s, k, M.XP.skillXpForLevel(k, level)]);
    }
    await q('delete from public.player_equipment where user_id = $1 and slot = $2', [uid, s]);
    for (const [eq, id] of Object.entries(kitOf(level, ROLES[s]))) {
      await q('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, $2, $3, $4)', [uid, s, eq, id]);
    }
  }
  await rpc('select public.hr_hunt_party_start(0, $1, $2::uuid)', [hunt, idem()]);
  const sess = await q('select id, slot, instance_id from public.hunt_sessions where user_id = $1 and ended_at is null order by slot', [uid]);
  if (sess.length !== 4) throw new Error('the party start opened ' + sess.length + ' sessions, not 4');
  const inst = sess[0].instance_id;
  if (sess.some((s) => s.instance_id !== inst)) throw new Error('the four heroes are not one instance');
  const back = (windows + 2) * windowMs;
  const t = `date_trunc('second', now() - make_interval(secs => ${Math.ceil(back / 1000)}))`;
  await q(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where user_id = $1 and ended_at is null`, [uid]);
  await q(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  /* the pool is read at the window's start: a stamp after it is `stamina_ahead` */
  await q(`update public.player_state set stamina_at = ${t} where user_id = $1`, [uid]);
  const from = Number(await one(`select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  await q(`select set_config('request.jwt.claim.sub', '', true)`);
  await db.exec('commit');
  if (audit) await db.exec(AUDIT_SQL);

  /* A/B (--ab=<file>): the bodies as the chain held them before <file>, read off a replay that stops there. */
  let abDefs = null;
  if (ab) {
    const { chainFiles } = await import('../tests/schema-replay.mjs');
    const files = (await chainFiles()).map(([n]) => n);
    const at = files.indexOf(ab);
    if (at < 1) throw new Error('--ab: ' + ab + ' is not in the chain');
    const pre = (await bootReplay({ upTo: files[at - 1] })).db;
    const defs = async (d) => new Map((await d.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'hr_ops') and p.prokind = 'f'`)).rows.map((r) => [r.sig, r.def]));
    const [a, b] = [await defs(pre), await defs(db)];
    await pre.close().catch(() => {});
    abDefs = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)).map((k) => ({ sig: k, before: a.get(k), after: b.get(k) }));
    if (!abDefs.length) throw new Error('--ab: ' + ab + ' changes no function body');
  }

  /* THE EXEC SEAM. One transaction a statement, as hr_engine; its counters read before it commits. */
  const stmts = new Map();
  const tables = new Map();
  const abResults = [];
  let recording = false;
  const cal = await calibrate(q);
  const snap = () => snapOf(q);
  const exec = async (text, params) => {
    const label = labelOf(text);
    const isApply = label.startsWith('apply');
    if (ab && isApply) return abRun(text, params);
    const l0 = recording ? await one(LSN_SQL) : null;
    const w0 = recording ? lsnBytes(l0) : 0;
    await db.exec('begin');
    const before = recording ? await snap() : null;
    await db.exec('set local role hr_engine');
    const t0 = performance.now();
    let rows;
    try { rows = (await db.query(text, params)).rows; } catch (e) { await db.exec('rollback'); throw e; }
    const ms = performance.now() - t0;
    await db.exec('reset role');
    let c = null;
    if (recording) c = minus(await snap(), before, cal);
    let rowlog = null;
    if (recording && audit) rowlog = await q(`select tbl, op, pk, cols, site from zz_bench.rowlog where xid = pg_current_xact_id() order by n`);
    await db.exec('commit');
    if (recording) {
      const l1 = await one(LSN_SQL);
      const wal = lsnBytes(l1) - w0;
      if (isApply) applyRanges.push([l0, l1]);
      const s = stmts.get(label) || { calls: 0, ms: 0, wal: 0, blk_public: 0, blk_catalog: 0, ins: 0, upd: 0, hot: 0, del: 0, rowlogs: [] };
      s.calls++; s.ms += ms; s.wal += wal;
      for (const r of c) {
        if (r.nsp === 'zz_bench') continue;
        if (r.nsp === 'public' || (r.nsp === 'pg_toast')) s.blk_public += r.blk; else s.blk_catalog += r.blk;
        if (r.nsp === 'public' && (r.kind === 'r' || r.kind === 'p')) {
          s.ins += r.ins; s.upd += r.upd; s.hot += r.hot; s.del += r.del;
          if (isApply) {
            const tb = tables.get(r.rel) || { ins: 0, upd: 0, hot: 0, del: 0, blk: 0, idx_blk: 0 };
            tb.ins += r.ins; tb.upd += r.upd; tb.hot += r.hot; tb.del += r.del; tb.blk += r.blk; tables.set(r.rel, tb);
          }
        } else if (isApply && r.nsp === 'public' && r.kind === 'i' && r.owner) {
          const tb = tables.get(r.owner) || { ins: 0, upd: 0, hot: 0, del: 0, blk: 0, idx_blk: 0 };
          tb.idx_blk += r.blk; tables.set(r.owner, tb);
        }
      }
      if (rowlog) s.rowlogs.push(rowlog);
      stmts.set(label, s);
    }
    return rows;
  };

  /* --ab: the commit twice from one state. A: the old bodies installed under a savepoint, run, every public row it wrote
     read, rolled back (bodies and rows). B: this tree's bodies, run, read, kept. Compared row for row, sequence ids aside. */
  async function abRun(text, params) {
    await db.exec('begin');
    const seqCols = await q(`select c.relname as rel, a.attname as col from pg_attribute a join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
         and (a.attidentity <> '' or pg_get_expr(d.adbin, d.adrelid) like 'nextval(%' or pg_get_expr(d.adbin, d.adrelid) like 'gen_random_uuid()%')`);
    const skip = new Map();
    for (const r of seqCols) skip.set(r.rel, [...(skip.get(r.rel) || []), r.col]);
    /* columns that COPY another row's sequence id (a rare drop's broadcast names its event row and its chat line): A burnt
       those ids, so they cannot match (lane/c-dead-writes's AB_EXEMPT names the same three) */
    for (const [rel, cols] of Object.entries({ hr_world_notices: ['event_id', 'message_id'] })) skip.set(rel, [...(skip.get(rel) || []), ...cols]);
    /* the tables with a write pending (they run on since boot, so A's set holds every table A wrote, B's every table
       A or B wrote) */
    const written = async () => new Set((await q(COUNTERS_SQL)).filter((r) => r.nsp === 'public' && r.kind === 'r' && (r.ins + r.upd + r.del) > 0).map((r) => r.rel));
    const dump = async (set) => {
      const out = {};
      for (const rel of set) {
        const drop = (skip.get(rel) || []).map((c) => ` - '${c}'`).join('');
        /* the fold's high-water mark is a ledger id (a sequence: A's ids are burnt), so it is compared as a rank */
        const hwm = rel === 'hunt_session_tally' ? " - 'ledger_hwm' || jsonb_build_object('ledger_hwm_rank', (select count(*) from public.player_ledger l where l.session_id = t.session_id and l.id <= t.ledger_hwm))" : '';
        out[rel] = (await q(`select (to_jsonb(t)${drop}${hwm})::text as j from public.${rel} t`)).map((r) => r.j).sort();
      }
      return out;
    };
    await db.exec('savepoint ab_a');
    for (const f of abDefs) await db.exec(f.before);
    await db.exec('set local role hr_engine');
    let ra; try { ra = (await db.query(text, params)).rows; } catch (e) { ra = [{ error: String(e.message) }]; }
    await db.exec('reset role');
    const setA = await written();
    const A = await dump(setA);
    await db.exec('rollback to savepoint ab_a');
    await db.exec('set local role hr_engine');
    let rb;
    try { rb = (await db.query(text, params)).rows; } catch (e) { await db.exec('rollback'); throw e; }
    await db.exec('reset role');
    const setB = await written();
    const B = await dump(setB);
    await db.exec('commit');
    const diffs = [];
    for (const rel of setB) {
      if (!setA.has(rel)) { diffs.push(`${rel}: written by B and not by A`); continue; }
      const a = A[rel], b = B[rel];
      if (a.length !== b.length) { diffs.push(`${rel}: ${a.length} rows before, ${b.length} after`); continue; }
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        const x = JSON.parse(a[i]), y = JSON.parse(b[i]);
        const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
        diffs.push(`${rel}: ${keys.map((k) => k + ' ' + JSON.stringify(x[k]).slice(0, 120) + ' -> ' + JSON.stringify(y[k]).slice(0, 120)).join('; ')}`);
        break;
      }
    }
    const res = (r) => JSON.stringify(r).replace(/"id":\d+/g, '"id":#');
    if (res(ra) !== res(rb)) diffs.push('the answer differs: ' + res(ra).slice(0, 300) + ' vs ' + res(rb).slice(0, 300));
    abResults.push({ ok: (rb[0] && rb[0].res && rb[0].res.ok) === true, tables: setB.size, ledger: (B.player_ledger || []).length, diffs });
    return rb;
  }

  const sids = sess.map((s) => s.id);
  const kills = [];
  const settle = async (toMs) => {
    if (checkpoint && recording) await db.exec('checkpoint');
    if (door === 'fire') {
      const r = (await M.TK.runTick({ exec, atMs: toMs,
        body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: windowMs, hunts: sess.map((s) => ({ user_id: uid, slot: s.slot, session_id: s.id })) } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error('the fire settled nothing: ' + JSON.stringify(r.hunts || r));
      return r.hunts;
    }
    await db.query('insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id, slot) do update set seen_at = excluded.seen_at', [uid]);
    const v = await M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: toMs });
    if (v.outcome !== 'paid') throw new Error('the player door settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
    return v.outcome;
  };
  const ledgerRows = async () => Number(await one('select count(*) from public.player_ledger where session_id = any($1::uuid[])', [sids]));
  let settled = 0, led0 = 0;
  const applyRanges = [];
  return {
    db, uid, sids, abDefs,
    /* THE ENVELOPE (--state): hr_state_of for the leader, n times in a row (every ask and every commit's projection
       builds it), with what is inside it by blocks and time (pg_stat_statements, track = all), and the top statement's
       own plan with its buffers. */
    async stateRead(n = 20) {
      await q('/* commit-cost */ select pg_stat_statements_reset()');
      const t0 = performance.now();
      for (let i = 0; i < n; i++) await q('select public.hr_state_of($1::uuid, 0) as s', [uid]);
      const ms = (performance.now() - t0) / n;
      const bytes = Number(await one('/* commit-cost */ select octet_length(public.hr_state_of($1::uuid, 0)::text)', [uid]));
      const plan = (await q('/* commit-cost */ explain (analyze, buffers, format json) select public.hr_state_of($1::uuid, 0)', [uid]))[0]['QUERY PLAN'][0];
      const nested = (await q(PSS_SQL)).filter((r) => !r.top).map((r) => ({ statement: r.statement, calls: +(Number(r.calls) / n).toFixed(2),
        ms: +(Number(r.ms) / n).toFixed(3), blocks: +(Number(r.blocks) / n).toFixed(1) })).sort((a, b) => b.blocks - a.blocks);
      return { calls: n, ms_wall: +ms.toFixed(2), envelope_bytes: bytes, plan_blocks: plan.Plan['Shared Hit Blocks'] + plan.Plan['Shared Read Blocks'],
        plan_ms: plan['Execution Time'], planning_blocks: plan.Planning ? plan.Planning['Shared Hit Blocks'] : null, nested };
    },
    async warm() { await settle(from + windowMs); led0 = await ledgerRows(); await q('/* commit-cost */ select pg_stat_statements_reset()'); },
    async step(w) { recording = true; try { await settle(from + w * windowMs); settled++; } finally { recording = false; } },
    async report() {
      const out = { door, hunt, level, windows: settled, ledger_rows_per_window: +(((await ledgerRows()) - led0) / settled).toFixed(2),
        open_after: Number(await one('select count(*) from public.hunt_sessions where id = any($1::uuid[]) and ended_at is null', [sids])),
        statements: [], tables: [], repeats: [], ab: abResults };
      for (const [k, s] of stmts) {
        out.statements.push({ statement: k, calls_per_window: +(s.calls / settled).toFixed(2), ms: +(s.ms / s.calls).toFixed(1),
          wal_bytes: Math.round(s.wal / s.calls), blocks_public: Math.round(s.blk_public / s.calls), blocks_catalog: Math.round(s.blk_catalog / s.calls),
          ins: +(s.ins / s.calls).toFixed(1), upd: +(s.upd / s.calls).toFixed(1), hot: +(s.hot / s.calls).toFixed(1), del: +(s.del / s.calls).toFixed(1) });
      }
      out.statements.sort((a, b) => b.wal_bytes * b.calls_per_window - a.wal_bytes * a.calls_per_window);
      /* INSIDE THE STATEMENTS (pg_stat_statements, track = all), per window: the nested statements by WAL and by blocks */
      out.nested = (await q(PSS_SQL)).map((r) => ({ statement: r.statement, top: r.top, calls: +(Number(r.calls) / settled).toFixed(2),
        ms: +(Number(r.ms) / settled).toFixed(2), blocks: Math.round(Number(r.blocks) / settled), wal_records: +(Number(r.wal_records) / settled).toFixed(1),
        wal_fpi: +(Number(r.wal_fpi) / settled).toFixed(1), wal_bytes: Math.round(Number(r.wal_bytes) / settled) }));
      /* THE COMMIT'S WAL BY RELATION (pg_walinspect over each apply's own LSN range), per call */
      const rel = new Map();
      let total = 0;
      for (const [a, b] of applyRanges) {
        total += lsnBytes(b) - lsnBytes(a);
        for (const r of await q(WAL_BY_REL_SQL, [a, b])) {
          const x = rel.get(r.rel) || { records: 0, record_bytes: 0, fpi: 0, fpi_bytes: 0 };
          x.records += r.records; x.record_bytes += Number(r.record_bytes); x.fpi += r.fpi; x.fpi_bytes += Number(r.fpi_bytes); rel.set(r.rel, x);
        }
      }
      const nA = Math.max(1, applyRanges.length);
      out.apply_wal = { bytes: Math.round(total / nA), by_relation: [...rel].map(([k, x]) => ({ rel: k, records: +(x.records / nA).toFixed(1),
        record_bytes: Math.round(x.record_bytes / nA), fpi: +(x.fpi / nA).toFixed(1), fpi_bytes: Math.round(x.fpi_bytes / nA) }))
        .sort((a, b) => b.record_bytes - a.record_bytes) };
      const applies = (stmts.get('apply (hr_hunt_apply_instance)') || { calls: 1 }).calls;
      for (const [rel, t] of tables) {
        out.tables.push({ table: rel, ins: +(t.ins / applies).toFixed(1), upd: +(t.upd / applies).toFixed(1), hot: +(t.hot / applies).toFixed(1),
          del: +(t.del / applies).toFixed(1), heap_blocks: Math.round(t.blk / applies), index_blocks: Math.round(t.idx_blk / applies) });
      }
      out.tables.sort((a, b) => (b.heap_blocks + b.index_blocks) - (a.heap_blocks + a.index_blocks));
      /* THE REPEATS (--audit): rows of the commit written more than once, by table, with each write's line and columns. */
      const apply = stmts.get('apply (hr_hunt_apply_instance)');
      if (apply && apply.rowlogs.length) {
        const per = new Map();
        for (const log of apply.rowlogs) {
          const rowsOf = new Map();
          for (const r of log) { const k = r.tbl + ' ' + r.pk; rowsOf.set(k, [...(rowsOf.get(k) || []), r]); }
          for (const [k, list] of rowsOf) {
            const tbl = k.split(' ')[0];
            const p = per.get(tbl) || { rows: 0, writes: 0, max: 0, sites: new Map() };
            p.rows++; p.writes += list.length; p.max = Math.max(p.max, list.length);
            for (const r of list) { const s = r.op[0] + ' ' + r.site + (r.cols ? ' [' + r.cols.join(',') + ']' : ''); p.sites.set(s, (p.sites.get(s) || 0) + 1); }
            per.set(tbl, p);
          }
        }
        const n = apply.rowlogs.length;
        for (const [tbl, p] of per) {
          out.repeats.push({ table: tbl, rows: +(p.rows / n).toFixed(1), writes: +(p.writes / n).toFixed(1), max_writes_one_row: p.max,
            sites: [...p.sites].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${(c / n).toFixed(1)}x ${s}`) });
        }
        out.repeats.sort((a, b) => (b.writes - b.rows) - (a.writes - a.rows));
      }
      return out;
    },
  };
}

/* ── THE CLOCK (--idle) ──────────────────────────────────────────────────
   What the three every-few-seconds cron bodies cost when nobody is owed anything: a world of `heroes` idle heroes (one
   account each, home in town, a closed hunt behind each), `ended` hunts, and a quarter hour of the tick's own log. Each
   body runs `n` times as postgres (pg_cron's role), each call its own transaction, counters read before commit. */
export async function idle({ heroes = 24, n = 20, upTo = null, db: given } = {}) {
  const db = given || await bootInstrumented(upTo);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => { const r = await q(sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };
  await q(`update public.hr_tick_config set enabled = true, edge_url = coalesce(nullif(edge_url, ''), 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue') where id`);
  await q('update public.hr_hunt_config set enabled = true where id');
  await db.exec('begin');
  for (let i = 0; i < heroes; i++) {
    const uid = `00000000-0000-4000-a000-${String(900000000000 + i)}`;
    await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await q(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'commit-cost idle') on conflict (user_id) do nothing`, [uid]);
    await q(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const c = await one('select public.hr_create_character(0)');
    if (!c || c.created !== true) throw new Error('idle hero refused: ' + JSON.stringify(c));
    await q(`update public.player_state set active_kind = 'idle', active_id = null, accrued_to = now() - interval '2 hours' where user_id = $1`, [uid]);
    /* an ownership row outlives its hero's time on the channel (2027-02-20-tick-fuse-load.sql): every hero has worked both */
    await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, updated_at) select $1, 0, c, true, now() from unnest(array['gather', 'artisan']) c on conflict do nothing`, [uid]);
  }
  await q(`select set_config('request.jwt.claim.sub', '', true)`);
  await q(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered) select now() - make_interval(secs => g * 10), 'empty', 3, 0 from generate_series(1, 90) g`);
  await db.exec('commit');
  const BODIES = [['hr_tick_cron_run()', 'select public.hr_tick_cron_run() as r'], ['hr_tick_enrol(200)', 'select public.hr_tick_enrol(200) as r'],
    ['hr_ops.alert_run()', 'select hr_ops.alert_run() as r']];
  const cal = await calibrate(q);
  const out = [];
  for (const [name, sql] of BODIES) {
    const s = { body: name, calls: 0, ms: 0, wal: 0, blk_public: 0, blk_catalog: 0, ins: 0, upd: 0, del: 0, outcomes: {} };
    for (let i = 0; i < n + 1; i++) {
      if (i === 1) await q('/* commit-cost */ select pg_stat_statements_reset()');
      const w0 = lsnBytes(await one(LSN_SQL));
      await db.exec('begin');
      const before = await snapOf(q);
      const t0 = performance.now();
      const r = await one(sql);
      const ms = performance.now() - t0;
      const c = minus(await snapOf(q), before, cal);
      await db.exec('commit');
      const wal = lsnBytes(await one(LSN_SQL)) - w0;
      if (i === 0) continue;   // the first call compiles and plans: production pays it on every run (a fresh pg_cron backend)
      s.calls++; s.ms += ms; s.wal += wal;
      for (const x of c) {
        if (x.nsp === 'public' || x.nsp === 'hr_ops' || x.nsp === 'pg_toast') s.blk_public += x.blk; else s.blk_catalog += x.blk;
        if ((x.nsp === 'public' || x.nsp === 'hr_ops' || x.nsp === 'net') && x.kind === 'r') { s.ins += x.ins; s.upd += x.upd; s.del += x.del; }
      }
      const o = typeof r === 'object' && r ? (r.outcome || JSON.stringify(r).slice(0, 40)) : String(r);
      s.outcomes[o] = (s.outcomes[o] || 0) + 1;
      if (name.startsWith('hr_tick_cron_run')) await q(`delete from public.hunt_tick_lease`);
    }
    out.push({ body: s.body, ms: +(s.ms / s.calls).toFixed(2), wal_bytes: Math.round(s.wal / s.calls), blocks_public: Math.round(s.blk_public / s.calls),
      blocks_catalog: Math.round(s.blk_catalog / s.calls), ins: +(s.ins / s.calls).toFixed(1), upd: +(s.upd / s.calls).toFixed(1), del: +(s.del / s.calls).toFixed(1),
      outcomes: s.outcomes,
      nested: (await q(PSS_SQL)).map((r) => ({ statement: r.statement, calls: +(Number(r.calls) / s.calls).toFixed(2), ms: +(Number(r.ms) / s.calls).toFixed(3),
        blocks: +(Number(r.blocks) / s.calls).toFixed(1), wal_bytes: Math.round(Number(r.wal_bytes) / s.calls) })).sort((a, b) => b.ms - a.ms) });
  }
  return { heroes, calls: n, bodies: out };
}

async function main() {
  const j = arg('json', null);
  let res;
  if (flag('idle')) {
    res = await idle({ heroes: Number(arg('heroes', 24)), n: Number(arg('n', 20)), upTo: arg('upto', null) });
    console.log(`\n── the clock, nothing owed: ${res.heroes} idle heroes, ${res.calls} calls a body (the first, compiling, not counted)`);
    console.table(res.bodies.map((b) => ({ ...b, outcomes: JSON.stringify(b.outcomes), nested: undefined })));
    for (const b of res.bodies) { console.log('── inside ' + b.body + ', per call'); console.table(b.nested.slice(0, Number(arg('top', 12)))); }
  } else {
    const o = { door: arg('door', 'fire'), hunt: arg('hunt', 'coppercap_warrens'), level: Number(arg('level', 40)), windows: Number(arg('windows', 6)),
      audit: flag('audit'), checkpoint: flag('checkpoint'), ab: arg('ab', null), upTo: arg('upto', null) };
    const m = await prepare(o);
    await m.warm();
    for (let w = 2; w <= o.windows + 1; w++) await m.step(w);
    res = await m.report();
    if (flag('state')) res.state = await m.stateRead(Number(arg('n', 20)));
    console.log(`\n── one hunt commit: door ${res.door}, a party of four of one account on ${res.hunt} at Level ${res.level}, ${res.windows} windows of 90 s;`
      + ` ledger rows/window ${res.ledger_rows_per_window}; sessions open after ${res.open_after}${o.checkpoint ? '; CHECKPOINT before each window' : ''}`);
    console.table(res.statements);
    console.log('── the commit (hr_hunt_apply_instance), per call, by table');
    console.table(res.tables);
    console.log(`── the commit's WAL by relation (pg_walinspect), per call: ${res.apply_wal.bytes} bytes in all`);
    console.table(res.apply_wal.by_relation.slice(0, 16));
    const top = Number(arg('top', 25));
    console.log('── inside the statements (pg_stat_statements, track = all), per window, by WAL');
    console.table([...res.nested].sort((a, b) => b.wal_bytes - a.wal_bytes).slice(0, top));
    console.log('── the same, by blocks');
    console.table([...res.nested].sort((a, b) => b.blocks - a.blocks).slice(0, top));
    if (res.repeats.length) {
      console.log('── rows written more than once in one commit (--audit)');
      for (const r of res.repeats) console.log(`${r.table}: ${r.rows} rows, ${r.writes} writes, at most ${r.max_writes_one_row} on one row\n    ${r.sites.join('\n    ')}`);
    }
    if (res.state) {
      console.log(`── hr_state_of for the leader: ${res.state.ms_wall} ms wall a call, ${res.state.envelope_bytes} bytes, ${res.state.plan_blocks} blocks (explain), inside it by blocks:`);
      console.table(res.state.nested.slice(0, Number(arg('top', 25))));
    }
    if (o.ab) {
      const bad = res.ab.filter((x) => x.diffs.length);
      console.log(`── A/B against the bodies before ${o.ab} (${m.abDefs.map((f) => f.sig).join(', ')}): ${res.ab.length} commits,`
        + ` ${res.ab.filter((x) => x.ok).length} landed, ${bad.length} with a difference`);
      for (const b of bad.slice(0, 5)) console.log('  ' + b.diffs.join('\n  '));
      if (bad.length || !res.ab.length) process.exitCode = 1;
    }
  }
  if (j) writeFileSync(j, JSON.stringify(res, null, 1));
  process.exit(process.exitCode || 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('commit-cost: ' + (e && e.stack || e)); process.exit(1); });
