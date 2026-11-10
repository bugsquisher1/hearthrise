#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/hunt-path-baseline.local.mjs — ONE HUNT, END TO END, WITH NUMBERS (lane/a-hunt-path-baseline, 2026-11-10).
//
//   node tools/qa/hunt-path-baseline.local.mjs --party 1 --minutes 10  [--json out.json]
//   node tools/qa/hunt-path-baseline.local.mjs --party 4 --minutes 720 [--json out.json]
//   options: --hunt meadowbrook_thicket  --level 10  --step 95 (seconds a closed-browser settle window)
//            --viewed 50 (real seconds the hunt is watched before the browser closes)  --seed <label>
//
// On tools/qa/local-world.mjs: the real play.html, the real hr-accrue handler, the replayed chain, no production, no
// secrets. One world per process, so one scenario per run; run them ONE AT A TIME (the PC caps app-spawned processes).
//
// WHAT ONE RUN DOES (the path Tyler asked to be traced):
//   start    a new account from the real sign-in screens, hero 0 from the real creation step; a party of four adds the
//            account's heroes 1-3 and starts through the party's own verbs (hr_hunt_party_invite_own, hr_hunt_party_start)
//   viewed   the hunt on screen for --viewed real seconds: the browser's own asks (hr-accrue every 16 s, hr_load)
//   closed   the page is CLOSED; the hunt runs --minutes on the world tick alone, one settle window of --step seconds
//            a fire (production: a 10 s tick flushes a session owed 90 s, so 90-100 s windows)
//   reopen   a new tab in the same browser: page load -> characters -> Play -> the hunt (or its summary) on screen
//   reload   the same tab reloaded: the hunt back on screen with no press
//   end      Leave (if the hunt still runs) -> the summary card
//
// WHAT IT MEASURES, AND HOW (nothing here is an estimate):
//   db calls     every transaction and statement the engine and the REST shim send, counted at PGlite's own door
//   row writes   pg_stat's tuple counters per table, read INSIDE each transaction before it commits (PGlite keeps them
//                across transactions, tests/rejections-journal.mjs P11; a control at start proves they count here)
//   engine time  the engine's OWN number: the tick answer's hunts.engine_ms (hunt-settle.js engineBudget). A player
//                door's answer carries none, so its engine time is the gap between its last read and its commit
//                (wall and process CPU), labelled `derived`
//   envelope     the bytes of every hr-accrue answer (the edge's own JSON) and every hr_load answer (the browser's
//                copy), and how many of them are `client_state` (the server residue)
//   reopen       marks taken in the page (performance.now) by an init script; requests and bytes until each mark
// WALL CLOCK IS THIS MACHINE'S (headless Chromium, PGlite in WASM, a throttled PC): compare counts, bytes and the
// ratios, not the milliseconds. Levels, gear, stamina and the purse are LOCAL fixtures written to this in-memory
// database (as tools/qa/party-soak.mjs does). The dice secret is pinned (--seed) but the instance id and the wall
// clock are not: a rerun reproduces the shape, never the same rolls.
//
// --ab  THE SAME COMMIT, TWO BODIES (lane/c-dead-writes, 2026-11-10). Two runs never roll the same dice, so "the deltas are
//   identical before and after" cannot be read off two runs. With --ab every hunt commit of the scenario (watched and tick)
//   is run TWICE inside its own transaction, from the same state, with the engine's own statement and parameters:
//     A  under a savepoint, with hr_apply as the chain held it BEFORE 2027-03-30-dead-writes.sql (read off a replay to the
//        file before it; its md5 must be production's, pinned below), then rolled back: rows, body and role
//     B  the body this branch installs, kept
//   and every public table A wrote is compared with B row for row (to_jsonb, ordered). The only differences let through
//   are the ones the migration is for, named in AB_EXEMPT: the renown ledger rows, the `ev:loot:` progress rows,
//   player_state.renown_high, and row ids (a sequence does not roll back). The commit's own answer is compared too.
//   A run with --ab counts A's rolled-back writes in its tuple counters: never feed its JSON to hunt-path-table.
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { charXpForLevel, skillXpForLevel } from '../../src/core/xp.js';
import { openWorld } from './local-world.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const PARTY = Number(opt('--party', 1));
const MINUTES = Number(opt('--minutes', 10));
const HUNT = String(opt('--hunt', 'meadowbrook_thicket'));
const LEVEL = Number(opt('--level', 10));
const STEP_S = Number(opt('--step', 95));
const VIEWED_S = Number(opt('--viewed', 70));
const ENTER = String(opt('--enter', 'screen'));   // 'rpc': skip the screen press (a ground past the hero's range asks a confirm the driver does not press)
const SEED = String(opt('--seed', 'hunt-path-baseline:1'));
const AB = args.includes('--ab');
const JSON_OUT = opt('--json', null);
const PASSWORD = 'local-world-password';   // local-world's own throwaway
const ACCOUNT = 'baseline';
const EMAIL = ACCOUNT + '@local-world.test';
const ROLES = ['tank', 'healer', 'ranger', 'mage'];
if (![1, 4].includes(PARTY) || !(MINUTES > 0) || !(STEP_S >= 30)) { console.error('usage: --party 1|4 --minutes N [--step >=30]'); process.exit(2); }

const say = (...a) => console.log('[' + new Date().toISOString().slice(11, 19) + ']', ...a);
const bytes = (v) => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v));
const cpuMs = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };

/* The set a hero at Level L wears, by role (tools/qa/party-soak.mjs kitOf, the same ladder). */
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

// ── THE TAPS ─────────────────────────────────────────────────────────────
const SNAP_SQL = `select n.nspname || '.' || c.relname as t,
    (pg_stat_get_xact_tuples_inserted(c.oid) + pg_stat_get_tuples_inserted(c.oid))::bigint as i,
    (pg_stat_get_xact_tuples_updated(c.oid) + pg_stat_get_tuples_updated(c.oid))::bigint as u,
    (pg_stat_get_xact_tuples_deleted(c.oid) + pg_stat_get_tuples_deleted(c.oid))::bigint as d
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'realtime', 'net')`;
const snapOf = (rows) => new Map(rows.map((r) => [r.t, [Number(r.i), Number(r.u), Number(r.d)]]));
function writesBetween(a, b) {
  const out = {};
  for (const [t, v] of b) {
    const p = a.get(t) || [0, 0, 0];
    const d = [v[0] - p[0], v[1] - p[1], v[2] - p[2]];
    if (d[0] || d[1] || d[2]) out[t] = d;
  }
  return out;
}
function addWrites(into, w) { for (const [t, d] of Object.entries(w)) { const p = into[t] || (into[t] = [0, 0, 0]); p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } return into; }
const rowsOf = (w) => Object.values(w).reduce((n, d) => n + d[0] + d[1] + d[2], 0);

/* What a statement is, by its first distinctive call (the edge's own statements; tools/settle-cost.mjs LABELS is the same idea). */
const LABELS = [
  [/set local role/i, 'role'], [/set_config\('hr\.frame_self'/i, 'self-marker'], [/set_config\('request\.jwt/i, 'rest-claims'], [/hr_access_check/, 'rest-pre-request'],
  [/hr_hunt_apply_instance/, 'hunt commit (hr_hunt_apply_instance)'], [/hr_hunt_instance_read/, 'hunt read (gate + hr_hunt_instance_read)'],
  [/hr_accrue_read/, 'hello read (hr_accrue_read + cap)'], [/hr_bestiary_of/, 'hello: hr_bestiary_of'], [/hr_trophy_of/, 'hello: hr_trophy_of'],
  [/hr_collection_of/, 'hello: hr_collection_of'], [/hr_hunt_open_of/, 'hello: hr_hunt_open_of'], [/hr_rate_gate/, 'hello: hr_rate_gate'],
  [/hr_seed/, 'hello: hr_seed x2 + hr_perks_of'], [/hr_perks_of/, 'perks (hr_perks_of)'], [/hr_apply\(/, 'hr_apply (rested / crew / town)'],
  [/hr_state_of/, 'caller envelope (hr_state_of)'], [/savepoint/i, 'savepoint'],
];
const labelOf = (sql) => { const s = String(sql); const hit = LABELS.find(([re]) => re.test(s)); return hit ? hit[1] : 'other: ' + s.replace(/\s+/g, ' ').trim().slice(0, 60); };
const OVERHEAD = new Set(['role', 'self-marker', 'rest-claims', 'rest-pre-request', 'savepoint']);

// ── --ab: ONE COMMIT, TWO BODIES ─────────────────────────────────────────
const AB_FILE = '2027-03-30-dead-writes.sql';
const AB_SIG = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)';
/* md5(pg_get_functiondef(hr_apply)) on production, read SELECT-only on 2026-11-10 09:33 UTC. The A body must be this one. */
const AB_PRODUCTION_MD5 = 'a6b41ad4d99b9f2a4168dd48d5d6e05e';
/* WHAT MAY DIFFER, and nothing else: the two stopped writes, the mark they moved, and ids (a sequence does not roll back). */
const AB_EXEMPT = {
  'public.player_ledger': { cols: ['id'], where: "kind <> 'renown'", why: 'the renown journal row is not written; ids come off a sequence' },
  'public.player_progress': { cols: [], where: "key not like 'ev:loot:%'", why: 'the collection counter is not stored with its switch off' },
  'public.player_state': { cols: ['renown_high'], where: null, why: 'the renown mark is not raised' },
  'public.hunt_session_tally': { cols: ['ledger_hwm'], where: null, why: 'the fold\'s high-water mark is a ledger id' },
  'public.hunt_session_events': { cols: ['id'], where: null, why: 'ids come off a sequence' },
  'public.town_moves': { cols: ['id'], where: null, why: 'ids come off a sequence' },
  /* a rare drop's broadcast (2026-11-24-rare-broadcast.sql): the notice's own id, the event row's id and the chat line's uuid */
  'public.hr_world_notices': { cols: ['id', 'event_id', 'message_id'], where: null, why: 'its id, the event row\'s id (sequences) and the chat line\'s uuid' },
  'public.chat_messages': { cols: ['id'], where: null, why: 'gen_random_uuid()' },
};
const md5 = (s) => createHash('md5').update(s).digest('hex');
/* The commit's answer, in one canonical string, without the same two things: the mark (`renown_high`) and the sequence id of a
   projected hunt_session_events row (an object with type, at, session and a numeric id). */
const abSkip = (o, k) => k === 'renown_high' || (k === 'id' && typeof o.id === 'number' && 'type' in o && 'at' in o && 'session' in o);
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).filter((k) => !abSkip(v, k)).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v));
async function abBodies(db) {
  const { bootReplay, chainFiles } = await import('../../tests/schema-replay.mjs');
  const files = (await chainFiles()).map(([name]) => name);
  const at = files.indexOf(AB_FILE);
  if (at < 1) throw new Error('--ab: ' + AB_FILE + ' is not in the chain');
  const pre = await bootReplay({ upTo: files[at - 1] });
  const preDef = String((await pre.db.query(`select pg_get_functiondef('${AB_SIG}'::regprocedure) as d`)).rows[0].d);
  await pre.db.close().catch(() => {});
  const postDef = String((await db.query(`select pg_get_functiondef('${AB_SIG}'::regprocedure) as d`)).rows[0].d);
  const o = { before: files[at - 1], preMd5: md5(preDef), postMd5: md5(postDef), productionMd5: AB_PRODUCTION_MD5 };
  o.preIsProduction = o.preMd5 === AB_PRODUCTION_MD5;
  if (!o.preIsProduction) throw new Error('--ab: hr_apply before ' + AB_FILE + ' is md5 ' + o.preMd5 + ', not production\'s ' + AB_PRODUCTION_MD5);
  if (o.postMd5 === o.preMd5 || !postDef.includes('DEAD-WRITES')) throw new Error('--ab: this world does not run ' + AB_FILE + '\'s hr_apply');
  return { preDef, info: o };
}
/* Every row of the tables a commit wrote, as one digest a table (the rows themselves are kept only to name a difference). */
async function abDigest(tx, tables, ledgerFrom) {
  const out = {};
  for (const t of tables) {
    const ex = AB_EXEMPT[t] || { cols: [], where: null };
    const where = [ex.where, t === 'public.player_ledger' ? 'id > ' + ledgerFrom : null].filter(Boolean).join(' and ');
    const r = await tx.query(`select coalesce(array_agg(x order by x), '{}') as rows from (select (to_jsonb(t) - $1::text[])::text as x from ${t} t${where ? ' where ' + where : ''}) q`, [ex.cols]);
    const rows = r.rows[0].rows;
    out[t] = { n: rows.length, md5: md5(rows.join('\n')), rows };
  }
  return out;
}

function installTaps(world, ab) {
  const db = world.db;
  const rawQuery = db.query.bind(db);
  const rawTx = db.transaction.bind(db);
  const T = { phase: 'boot', fires: [], engine: [], rest: [], frames: [], fire: null, group: null, raw: rawQuery, lastEnd: null, ab: [] };
  const pub = (w) => Object.fromEntries(Object.entries(w).filter(([t]) => t.startsWith('public.')));
  /* THE COMMIT, TWICE. A runs inside a savepoint with production's hr_apply and is rolled back whole (rows, body, role); B is
     the engine's own statement, untouched. The reads between run as the owner, each inside a savepoint that puts the engine's
     role back. Tuple counters do not roll back, so A's and B's writes are each a difference of two reads. */
  async function abCommit(tx, text, params, opts, runB) {
    const rec = { phase: T.phase, identical: false, diff: [] };
    const counters = async () => snapOf((await tx.query(SNAP_SQL)).rows);
    await tx.query('savepoint hpb_a');
    await tx.query('reset role');
    const ledgerFrom = Number((await tx.query('select coalesce(max(id), 0)::bigint as i from public.player_ledger')).rows[0].i);
    await tx.exec(ab.preDef);
    await tx.query('set local role hr_engine');
    const c0 = await counters();
    let ra = null;
    try { ra = (await tx.query(text, params, opts)).rows; } catch (e) { rec.errorA = String(e.message).split('\n')[0]; }
    let snapA = null, wA = {};
    if (!rec.errorA) {
      wA = pub(writesBetween(c0, await counters()));
      await tx.query('reset role');
      snapA = await abDigest(tx, Object.keys(wA).sort(), ledgerFrom);
      rec.deadA = { renownRows: Number((await tx.query(`select count(*)::int as n from public.player_ledger where id > $1 and kind = 'renown'`, [ledgerFrom])).rows[0].n) };
    }
    await tx.query('rollback to savepoint hpb_a');
    await tx.query('release savepoint hpb_a');
    const c2 = await counters();
    const rb = await runB();
    const wB = pub(writesBetween(c2, await counters()));
    await tx.query('savepoint hpb_b');
    await tx.query('reset role');
    const snapB = await abDigest(tx, Object.keys(wA).sort(), ledgerFrom);
    rec.deadB = { renownRows: Number((await tx.query(`select count(*)::int as n from public.player_ledger where id > $1 and kind = 'renown'`, [ledgerFrom])).rows[0].n) };
    await tx.query('rollback to savepoint hpb_b');
    await tx.query('release savepoint hpb_b');
    rec.rowsA = rowsOf(wA); rec.rowsB = rowsOf(wB); rec.writesA = wA; rec.writesB = wB;
    if (rec.errorA) rec.diff.push('A raised: ' + rec.errorA);
    else {
      for (const t of Object.keys(wB)) if (!(t in wA)) rec.diff.push(t + ': written by B only');
      for (const t of Object.keys(snapA)) {
        if (snapA[t].md5 === snapB[t].md5) continue;
        const a = new Set(snapA[t].rows), b = new Set(snapB[t].rows);
        rec.diff.push(t + ': ' + snapA[t].n + ' rows under A, ' + snapB[t].n + ' under B; only in A: ' + String(snapA[t].rows.find((x) => !b.has(x))).slice(0, 400)
          + ' | only in B: ' + String(snapB[t].rows.find((x) => !a.has(x))).slice(0, 400));
      }
      const ca = canon(ra), cb = canon(rb.rows);
      if (ca !== cb) { let i = 0; while (i < ca.length && ca[i] === cb[i]) i++; rec.diff.push('the commit answered differently at char ' + i + ': A …' + ca.slice(Math.max(0, i - 160), i + 120) + ' | B …' + cb.slice(Math.max(0, i - 160), i + 120)); }
      rec.tables = Object.fromEntries(Object.entries(snapA).map(([t, v]) => [t, v.n]));
    }
    rec.identical = rec.diff.length === 0;
    T.ab.push(rec);
    return rb;
  }
  let lastSnap = null, dirty = true;   // the last counters read, and whether anything ran since

  db.transaction = (fn) => rawTx(async (tx) => {
    const rec = { phase: T.phase, kind: 'harness', rpc: null, stmts: [], at: performance.now(), cpu0: cpuMs(), gapMs: null, gapCpuMs: null };
    if (T.lastEnd) { rec.gapMs = rec.at - T.lastEnd.at; rec.gapCpuMs = rec.cpu0 - T.lastEnd.cpu; }
    const before = dirty || !lastSnap ? snapOf((await tx.query(SNAP_SQL)).rows) : lastSnap;
    const face = {
      exec: (...a) => tx.exec(...a),
      query: async (text, params, opts) => {
        const s = String(text);
        if (rec.stmts.length === 0) {
          if (/set local role hr_engine/i.test(s)) rec.kind = 'engine';
          else if (/request\.jwt\.claim\.sub/.test(s)) { rec.kind = 'rest'; rec.rpc = String((params && params[4]) || '').replace('/rpc/', ''); }
        }
        /* THE COMMIT'S PAYLOAD, as the engine sent it (hunt-settle.js HUNT_APPLY_SQL: $3 the instance half, $4 every member's): its bytes, and
           each member's progress ops by family (`ev:loot` is the collection counter, `ev:kill_monster` the bestiary's). */
        if (/hr_hunt_apply_instance/.test(s) && Array.isArray(params)) {
          const c = { settleBytes: bytes(params[2] || ''), membersBytes: bytes(params[3] || ''), members: 0, progressOps: {}, itemKinds: 0 };
          try {
            for (const m of JSON.parse(params[3])) {
              c.members++;
              c.itemKinds += Object.keys((m.delta && m.delta.items) || {}).length;
              for (const op of (m.delta && m.delta.progress) || []) { const k = String(op.key || '').split(':').slice(0, 2).join(':'); c.progressOps[k] = (c.progressOps[k] || 0) + 1; }
            }
          } catch { /* the bytes stand */ }
          rec.commit = c;
        }
        const t = performance.now(), c = cpuMs();
        try {
          if (ab && /hr_hunt_apply_instance/.test(s)) return await abCommit(tx, text, params, opts, () => tx.query(text, params, opts));
          return await tx.query(text, params, opts);
        } finally { rec.stmts.push({ label: labelOf(s), ms: performance.now() - t, cpuMs: cpuMs() - c }); }
      },
    };
    let ok = false;
    try { const out = await fn(face); ok = true; return out; }
    finally {
      rec.ms = performance.now() - rec.at;
      rec.cpuMs = cpuMs() - rec.cpu0;
      rec.ok = ok;
      if (ok) { lastSnap = snapOf((await tx.query(SNAP_SQL)).rows); dirty = false; rec.writes = writesBetween(before, lastSnap); }
      else { rec.writes = {}; dirty = true; }
      T.lastEnd = { at: performance.now(), cpu: cpuMs() };
      if (rec.kind === 'engine') { if (T.fire) T.fire.txs.push(rec); else (T.group || (T.group = { phase: T.phase, txs: [] })).txs.push(rec); }
      else if (rec.kind === 'rest') T.rest.push(rec);
    }
  });

  db.query = async (text, params, opts) => {
    const s = String(text);
    if (s.includes('hr_tick_cron_run()')) {
      const a = snapOf((await rawQuery(SNAP_SQL)).rows);
      const t0 = performance.now(), c0 = cpuMs();
      const r = await rawQuery(text, params, opts);
      lastSnap = snapOf((await rawQuery(SNAP_SQL)).rows); dirty = false;
      T.fire = { phase: T.phase, t0, c0, cron: { ms: performance.now() - t0, cpuMs: cpuMs() - c0, writes: writesBetween(a, lastSnap) }, requests: [], txs: [], answers: [], frames: [] };
      T.lastEnd = { at: performance.now(), cpu: cpuMs() };
      return r;
    }
    dirty = true;
    const r = await rawQuery(text, params, opts);
    if (/^\s*delete from net\.http_request_queue/.test(s) && T.fire) {
      T.fire.queueRead = true;
      for (const x of r.rows) { let b = null; try { b = JSON.parse(x.body); } catch { /* counted by bytes */ } T.fire.requests.push({ bytes: bytes(x.body), hunts: b && Array.isArray(b.hunts) ? b.hunts.length : null, roster: b && Array.isArray(b.roster) ? b.roster.length : null }); }
    } else if (/^\s*delete from realtime\.messages/.test(s)) {
      const fr = r.rows.map((x) => ({ event: x.event, bytes: bytes(x.payload), clientState: x.payload && x.payload.env ? bytes(x.payload.env.client_state || {}) : 0 }));
      /* the fire's own drain is the one after its last answer; a page's request draining mid-fire closes nothing */
      if (T.fire && T.fire.queueRead && T.fire.answers.length >= T.fire.requests.length) { T.fire.frames = fr; T.fire.ms = performance.now() - T.fire.t0; T.fire.cpuMs = cpuMs() - T.fire.c0; T.fires.push(T.fire); T.fire = null; }
      else for (const f of fr) T.frames.push({ phase: T.phase, ...f });
    }
    return r;
  };

  /* THE EDGE'S OWN ANSWERS: index.ts builds every one with `new Response(JSON.stringify(body))`; the string is read as it is made. */
  const RealResponse = globalThis.Response;
  globalThis.Response = class extends RealResponse {
    constructor(body, init) {
      super(body, init);
      if (typeof body !== 'string' || body[0] !== '{') return;
      let j;
      try { j = JSON.parse(body); } catch { return; }
      if (j && j.op === 'tick') { if (T.fire) T.fire.answers.push({ bytes: bytes(body), ms: j.ms, hunts: j.hunts || null, reasons: j.reasons || null, processed: j.processed }); return; }
      /* a player door's answer closes its transactions' group (the build fingerprint has none and is no answer here) */
      if (!j || typeof j !== 'object' || (!T.group && !('state' in j))) return;
      const g = T.group || { phase: T.phase, txs: [] };
      T.group = null;
      const keys = Object.keys(j).map((k) => [k, bytes(j[k])]).sort((a, b) => b[1] - a[1]);
      g.answer = { bytes: bytes(body), status: (init && init.status) || 200, accrued: j.accrued === true, settled: j.settled === true, reason: j.reason || null,
        clientState: 'client_state' in j ? bytes(j.client_state) : null, huntLive: 'hunt_live' in j ? bytes(j.hunt_live) : 0, huntCheck: 'hunt_check' in j ? bytes(j.hunt_check) : 0,
        timeline: bytes(j.hunt_track || []) + bytes(j.hunt_events || []) + bytes(j.hunt_units || {}), slices: j.hunt_slices || 1, behindMs: j.hunt_behind_ms ?? null, top: keys.slice(0, 8) };
      T.engine.push(g);
    }
  };
  return T;
}

/* One engine request (a tick fire's or a hello's transactions), summed. */
function sumTxs(txs) {
  const o = { transactions: txs.length, statements: 0, overheadStatements: 0, dbMs: 0, dbCpuMs: 0, writes: {}, byLabel: {} };
  for (const tx of txs) {
    addWrites(o.writes, tx.writes || {});
    for (const st of tx.stmts) {
      if (OVERHEAD.has(st.label)) { o.overheadStatements++; continue; }
      o.statements++; o.dbMs += st.ms; o.dbCpuMs += st.cpuMs;
      const b = o.byLabel[st.label] || (o.byLabel[st.label] = { n: 0, ms: 0 });
      b.n++; b.ms += st.ms;
    }
  }
  o.rows = rowsOf(o.writes);
  /* the engine's run sits between the last read and the commit: the gap before the commit's transaction */
  const commit = txs.find((tx) => tx.stmts.some((st) => st.label.startsWith('hunt commit')));
  o.gapBeforeCommitMs = commit ? commit.gapMs : null;
  o.gapBeforeCommitCpuMs = commit ? commit.gapCpuMs : null;
  o.commit = commit ? commit.commit || null : null;
  o.commitMs = commit ? commit.stmts.filter((st) => st.label.startsWith('hunt commit')).reduce((n, st) => n + st.ms, 0) : null;
  return o;
}
const stats = (list) => {
  const v = list.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const r = (x) => Math.round(x * 10) / 10;
  return { n: v.length, min: r(v[0]), median: r(at(0.5)), p95: r(at(0.95)), max: r(v[v.length - 1]), mean: r(v.reduce((a, b) => a + b, 0) / v.length), total: r(v.reduce((a, b) => a + b, 0)) };
};

// ── THE PAGE'S OWN MARKS AND TRAFFIC ─────────────────────────────────────
const MARKS = () => {
  const m = (window.__hpb = { marks: {}, live: '' });
  const seen = (k) => { if (!(k in m.marks)) m.marks[k] = Math.round(performance.now()); };
  /* `moving`: the hunt picture changed three samples running (every 3rd frame; tools/qa/pane-probe.js's hash): the fight is playing, not a still pose */
  let off = null, ox = null, lastH = null, run = 0, n = 0;
  const hash = (cv) => {
    if (!off) { off = document.createElement('canvas'); off.width = 120; off.height = 72; ox = off.getContext('2d', { willReadFrequently: true }); }
    ox.drawImage(cv, 0, 0, 120, 72);
    const d = ox.getImageData(0, 0, 120, 72).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0;
    return h;
  };
  const look = () => {
    const d = document;
    if (d.querySelector('.char-row')) seen('characters');
    if (d.querySelector('.hs-launchers')) seen('shell');
    if (d.querySelector('#panel-world[data-scene="hunt"]')) seen('hunt_scene');
    if (d.querySelector('[data-hs-act="leave"]')) seen('hunt_bar');
    const st = d.querySelector('.world-stage');
    const live = (st && st.dataset && st.dataset.live) || '';
    if (live) { seen('live_loop'); m.live = live; if (/match=[1-9]/.test(live)) seen('live_confirmed'); }
    if (d.querySelector('.hsum-card')) seen('summary');
    if (m.marks.hunt_scene && !m.marks.moving && ++n % 3 === 0) {
      const cv = d.querySelector('canvas.world-canvas');
      if (cv && cv.width) { try { const h = hash(cv); run = lastH !== null && h !== lastH ? run + 1 : 0; lastH = h; if (run >= 3) seen('moving'); } catch (e) { /* not readable: no mark */ } }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};
function watchPage(page, T) {
  const net = { requests: 0, bytes: 0, api: [], byType: {} };
  page.on('requestfinished', (req) => {
    const type = req.resourceType();
    req.sizes().then((s) => { net.requests++; net.bytes += s.responseBodySize; const b = net.byType[type] || (net.byType[type] = [0, 0]); b[0]++; b[1] += s.responseBodySize; }).catch(() => {});
  });
  page.on('response', (resp) => {
    const u = resp.url();
    const name = u.includes('/functions/v1/hr-accrue') ? 'hr-accrue' : (u.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/) || [])[1];
    if (!name) return;
    const phase = T.phase;
    resp.body().then((buf) => {
      const row = { phase, name, status: resp.status(), bytes: buf.length, clientState: null, version: null };
      if (name === 'hr_load' || name === 'hr-accrue') { try { const j = JSON.parse(buf.toString('utf8')); if (j && typeof j === 'object') { row.clientState = 'client_state' in j ? bytes(j.client_state) : null; row.version = j.version ?? null; row.huntLive = 'hunt_live' in j; } } catch { /* not JSON */ } }
      net.api.push(row);
    }).catch(() => {});
  });
  return net;
}
const marksOf = (page) => page.evaluate(() => (window.__hpb ? { ...window.__hpb.marks, live: window.__hpb.live } : null)).catch(() => null);
const apiSummary = (api) => {
  const by = {};
  for (const r of api) { const b = by[r.name] || (by[r.name] = { n: 0, bytes: 0, maxBytes: 0, clientStateMax: null }); b.n++; b.bytes += r.bytes; b.maxBytes = Math.max(b.maxBytes, r.bytes); if (r.clientState !== null) b.clientStateMax = Math.max(b.clientStateMax || 0, r.clientState); }
  return by;
};

// ── THE RUN ──────────────────────────────────────────────────────────────
const out = { tool: 'hunt-path-baseline', at: new Date().toISOString(), node: process.version,
  scenario: { party: PARTY, minutes: MINUTES, hunt: HUNT, level: LEVEL, stepSeconds: STEP_S, viewedSeconds: VIEWED_S, seed: SEED } };
const t00 = Date.now();
say(`scenario: party ${PARTY}, ${MINUTES} min, ${HUNT} L${LEVEL}, ${STEP_S} s windows`);
const world = await openWorld({ tickMs: false });
out.bootSeconds = Math.round((Date.now() - t00) / 1000);
say('world up in ' + out.bootSeconds + ' s');
let ab = null;
if (AB) {
  try { ab = await abBodies(world.db); } catch (e) { console.error(String(e.message)); await world.close().catch(() => {}); process.exit(2); }
  out.ab = { ...ab.info, exempt: Object.fromEntries(Object.entries(AB_EXEMPT).map(([t, x]) => [t, x.why])), note: 'tuple counters in this file include A\'s rolled-back writes: not a baseline run' };
  say('--ab: A is hr_apply before ' + AB_FILE + ' (md5 ' + ab.info.preMd5 + ', production\'s), B is this branch\'s (md5 ' + ab.info.postMd5 + ')');
}
const T = installTaps(world, ab);
const q = async (sql, p) => (await T.raw(sql, p)).rows;
/* NOT MEASURED HERE: time per SQL function. PGlite's per-function counters do not survive a transaction the way its tuple counters do (tried
   2026-11-10: they read 0.1 hr_hunt_apply_instance calls a settle, where there is exactly one), so a split read off them would be wrong.
   tools/settle-cost.mjs is the instrument for that split. */
let code = 0;
try {
  /* THE CONTROL: the tuple counters count here, and keep counting across transactions. */
  await world.db.exec('create table public.__hpb_ctl (id int primary key, v int)');
  const ctl0 = snapOf(await q(SNAP_SQL));
  await T.raw('insert into public.__hpb_ctl select g, 0 from generate_series(1, 7) g');
  await T.raw('update public.__hpb_ctl set v = 1 where id <= 3');
  await T.raw('delete from public.__hpb_ctl where id > 5');
  const ctl = writesBetween(ctl0, snapOf(await q(SNAP_SQL)))['public.__hpb_ctl'] || [0, 0, 0];
  out.rowCounterControl = { want: [7, 3, 2], got: ctl, ok: ctl.join() === '7,3,2' };
  say('row counter control: ' + JSON.stringify(out.rowCounterControl));
  await world.db.exec('drop table public.__hpb_ctl');

  await T.raw(`update public.hr_server_secrets set secret = sha256(convert_to($1, 'utf8')) where name = 'prng'`, [SEED]);

  // ── start: the real screens ──
  T.phase = 'start';
  const p = await world.play({ account: ACCOUNT });
  const ctx = p.page.context();
  await ctx.addInitScript(MARKS);
  let net = watchPage(p.page, T);
  await p.createHero('Basel');
  const post = async (path, body, token) => {
    const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const login = async () => (await post('/auth/v1/token?grant_type=password', { email: EMAIL, password: PASSWORD })).body;
  const first = await login();
  const uid = first.user.id;
  let token = first.access_token;
  const rpc = async (fn, a) => (await post('/rest/v1/rpc/' + fn, a, token)).body;
  const idem = () => randomUUID();
  const freshRates = () => T.raw('delete from public.hr_rate_counters where user_id = $1', [uid]);

  // ── LOCAL FIXTURES (this in-memory database only): the purse, heroes 1-3, levels, gear, a full stamina bar ──
  await T.raw(`insert into public.account_wallet (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = $2`, [uid, 50000000]);
  for (let s = 1; s < PARTY; s++) {
    const hero = () => rpc('hr_create_hero', { p_slot: s, p_name: 'Basel_' + 'ABCD'[s], p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: idem() });
    let r = await hero();
    if (!r || r.ok !== true) { await rpc('hr_buy_hero_slot', { p_slot_id: s, p_slot: 0, p_idem: idem() }); r = await hero(); }
    if (!r || r.ok !== true) throw new Error('hero ' + s + ': ' + JSON.stringify(r));
    await freshRates();
  }
  for (let s = 0; s < PARTY; s++) {
    await T.raw('update public.player_state set level_xp = $3, hp = 1000000, stamina_ms = 43200000, stamina_at = now() where user_id = $1 and slot = $2', [uid, s, charXpForLevel(LEVEL)]);
    for (const k of ['melee', 'ranged', 'magic', 'defense']) {
      await T.raw(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, $3, $4) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, s, k, skillXpForLevel(k, LEVEL)]);
    }
    await T.raw('delete from public.player_equipment where user_id = $1 and slot = $2', [uid, s]);
    for (const [eq, id] of Object.entries(kitOf(LEVEL, ROLES[s]))) await T.raw('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, $2, $3, $4)', [uid, s, eq, id]);
  }
  out.fixtures = { level: LEVEL, roles: ROLES.slice(0, PARTY), gold: 50000000, staminaMs: 43200000, note: 'LOCAL: written to the in-memory database, as tools/qa/party-soak.mjs does' };

  /* the page reads the fixtures: a reload, then Play hero 0 (the account's other heroes open with it) */
  const playHero = async (page) => {
    await page.waitForSelector('.char-row, .hs-launchers');
    if (await page.$('.char-pick[data-app="play"][data-slot="0"]')) await page.click('.char-pick[data-app="play"][data-slot="0"]');
    await page.waitForSelector('.hs-launchers');
  };
  await p.page.reload({ waitUntil: 'load' });
  await playHero(p.page);
  await freshRates();

  // ── the start-hunt intent ──
  const ledger0 = Number((await q('select coalesce(max(id), 0)::bigint as i from public.player_ledger'))[0].i);
  if (PARTY === 1) {
    const byRpc = async (why) => {
      const r = await rpc('hr_hunt_enter', { p_slot: 0, p_hunt: HUNT, p_bag: [], p_preset: 0, p_hours: null, p_idem: idem() });
      if (!r || r.ok !== true) throw new Error('hr_hunt_enter: ' + JSON.stringify(r) + ' (' + why + ')');
      out.startedBy = 'hr_hunt_enter by RPC, as the signed-in account (' + why + '), then a reload so the page reads it';
      /* a hunt started outside the page is news to it only at its next read: a hero idle in town asks nothing */
      await p.page.reload({ waitUntil: 'load' });
      await playHero(p.page);
    };
    if (ENTER === 'rpc') await byRpc('--enter rpc');
    else {
      try { await p.enterHunt(HUNT); out.startedBy = 'the real screens (Hunts window -> ground -> Enter): hr_hunt_enter'; }
      catch (e) { await byRpc('the screen press did not land: ' + String(e.message).split('\n')[0].slice(0, 120)); }
    }
  } else {
    /* the party forms by the account's own verb (its own heroes need no accept); the page then reads it, and the LEADER's press starts the hunt:
       the same Hunts window button, which reads "Start with party" and sends hr_hunt_party_start (src/shell/windows/hunts.js, party-intents.js startPartyHunt) */
    for (let s = 1; s < PARTY; s++) { const r = await rpc('hr_hunt_party_invite_own', { p_slot: 0, p_other_slot: s, p_idem: idem() }); if (!r || r.ok !== true) throw new Error('invite ' + s + ': ' + JSON.stringify(r)); await freshRates(); }
    await p.page.reload({ waitUntil: 'load' });
    await playHero(p.page);
    await freshRates();
    const formed = 'hr_hunt_party_invite_own x' + (PARTY - 1) + ' by RPC, as the signed-in account; ';
    try {
      if (ENTER === 'rpc') throw new Error('--enter rpc');
      await p.enterHunt(HUNT);
      out.startedBy = formed + 'the leader\'s press on the real screen (Hunts window -> ground -> Start with party): hr_hunt_party_start';
    } catch (e) {
      const st = await rpc('hr_hunt_party_start', { p_slot: 0, p_hunt: HUNT, p_idem: idem() });
      if (!st || st.ok !== true) throw new Error('hr_hunt_party_start: ' + JSON.stringify(st) + ' (screen: ' + String(e.message).split('\n')[0] + ')');
      out.startedBy = formed + 'hr_hunt_party_start by RPC (' + String(e.message).split('\n')[0].slice(0, 120) + '), then a reload so the page reads it';
      await p.page.reload({ waitUntil: 'load' });
      await playHero(p.page);
    }
  }
  await p.page.waitForSelector('[data-hs-act="leave"]', { timeout: 120000 });
  const open0 = await q(`select s.slot, s.hunt_id, i.kind, i.id as instance from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id where s.ended_at is null order by s.slot`);
  out.open = { heroes: open0.length, hunt: open0[0] && open0[0].hunt_id, kind: open0[0] && open0[0].kind, instance: open0[0] && open0[0].instance };
  say('hunt open: ' + JSON.stringify(out.open) + ' (' + out.startedBy + ')');
  if (open0.length !== PARTY) throw new Error('expected ' + PARTY + ' open sessions, the server holds ' + open0.length);

  // ── viewed: the browser's own asks, in real time ──
  T.phase = 'viewed';
  T.engine.length = 0; T.rest.length = 0; net.api.length = 0;
  const viewedFrom = Date.now();
  await new Promise((r) => setTimeout(r, VIEWED_S * 1000));
  const viewedS = (Date.now() - viewedFrom) / 1000;
  const viewedMarks = await marksOf(p.page);
  const hellos = T.engine.filter((g) => g.phase === 'viewed').map((g) => ({ ...sumTxs(g.txs), answer: g.answer }));
  const paid = hellos.filter((h) => h.answer && h.answer.settled);
  out.viewed = {
    realSeconds: Math.round(viewedS), live: viewedMarks && viewedMarks.live,
    helloAnswers: hellos.length, helloPaid: paid.length,
    perHelloPaid: paid.length ? { statements: stats(paid.map((h) => h.statements)), transactions: stats(paid.map((h) => h.transactions)), rowsWritten: stats(paid.map((h) => h.rows)),
      dbMs: stats(paid.map((h) => h.dbMs)), engineGapMs_derived: stats(paid.map((h) => h.gapBeforeCommitMs)), engineGapCpuMs_derived: stats(paid.map((h) => h.gapBeforeCommitCpuMs)),
      answerBytes: stats(paid.map((h) => h.answer.bytes)), clientStateBytes: stats(paid.map((h) => h.answer.clientState)), timelineBytes: stats(paid.map((h) => h.answer.timeline)),
      huntCheckBytes: stats(paid.map((h) => h.answer.huntCheck)), commitMs: stats(paid.map((h) => h.commitMs)), commitPayloadBytes: stats(paid.map((h) => (h.commit ? h.commit.settleBytes + h.commit.membersBytes : null))) } : null,
    progressOpsPerPaidHello: paid.length ? Object.fromEntries(Object.entries(paid.reduce((m, h) => { for (const [k, v] of Object.entries((h.commit && h.commit.progressOps) || {})) m[k] = (m[k] || 0) + v; return m; }, {})).map(([k, v]) => [k, Math.round(v / paid.length * 100) / 100])) : null,
    perHelloUnpaid: hellos.filter((h) => !(h.answer && h.answer.settled)).map((h) => ({ reason: h.answer && h.answer.reason, statements: h.statements, rows: h.rows, bytes: h.answer && h.answer.bytes, huntLive: h.answer && h.answer.huntLive, clientState: h.answer && h.answer.clientState })),
    writesByTablePerPaidHello: paid.length ? Object.fromEntries(Object.entries(paid.reduce((w, h) => addWrites(w, h.writes), {})).map(([t, d]) => [t, d.map((x) => Math.round(x / paid.length * 100) / 100)])) : null,
    statementsOfOnePaidHello: paid.length ? paid[paid.length - 1].byLabel : null,
    topKeysOfOnePaidAnswer: paid.length ? paid[paid.length - 1].answer.top : null,
    restCalls: Object.fromEntries(Object.entries(T.rest.filter((r) => r.phase === 'viewed').reduce((m, r) => { (m[r.rpc] || (m[r.rpc] = [])).push(r); return m; }, {}))
      .map(([k, v]) => [k, { n: v.length, rowsWritten: v.reduce((n, r) => n + rowsOf(r.writes), 0) }])),
    browserApi: apiSummary(net.api.filter((r) => r.phase === 'viewed')),
    /* frames: the whole character pushed to each OTHER open hero of the party when the viewed one's ask settles the instance (2026-12-25-frame-push-revive.sql) */
    framesPushed: T.frames.filter((f) => f.phase === 'viewed').length, frameBytes: stats(T.frames.filter((f) => f.phase === 'viewed').map((f) => f.bytes)),
  };
  say('viewed ' + Math.round(viewedS) + ' s: ' + hellos.length + ' engine answers, ' + paid.length + ' paid');

  // ── closed: the page goes away; the world tick alone ──
  await p.page.close();
  await new Promise((r) => setTimeout(r, 1500));   // the goodbye's keepalive put lands
  /* A CLOSED BROWSER'S PRESENCE LAPSES 75 s LATER (hr_frame_wanted). A skip compresses the hunt's time, not the wall clock, so the stamp the
     page just wrote would still read "open" and every settle would build and push a frame nobody hears. Aged here, as real time would. */
  out.presenceAged = (await T.raw(`update public.character_presence set seen_at = seen_at - interval '1 day' returning 1`)).rows.length;
  T.phase = 'closed';
  T.fires.length = 0;
  const fires = [];
  const steps = Math.ceil(MINUTES * 60 / STEP_S);
  let ledgerAt = Number((await q('select coalesce(max(id), 0)::bigint as i from public.player_ledger'))[0].i);
  const closedFrom = Date.now();
  let endedAtStep = null;
  for (let i = 0; i < steps; i++) {
    const secs = Math.min(STEP_S, MINUTES * 60 - i * STEP_S);
    const n0 = T.fires.length;
    /* a fire leases its sessions for 30 real seconds; a step here takes less, and in production the next flush is 90 s on: the lease is long gone */
    await T.raw('delete from public.hunt_tick_lease');
    const res = await world.wait(secs / 60, { away: true });
    const led = await q(`select id, slot, (meta->>'ms')::bigint as ms, (meta->>'ticks')::int as ticks, (meta->>'kills')::int as kills from public.player_ledger where id > $1 and kind = 'combat' order by id`, [ledgerAt]);
    if (led.length) ledgerAt = Number(led[led.length - 1].id);
    for (const f of T.fires.slice(n0)) {
      const a = f.answers[0] || {};
      const h = a.hunts || {};
      const s = sumTxs(f.txs);
      fires.push({ step: i, simMs: led.length ? Math.max(...led.map((r) => Number(r.ms))) : 0, swings: led.length ? Math.max(...led.map((r) => r.ticks)) : 0, kills: led.reduce((n, r) => n + (r.kills || 0), 0), members: led.length,
        settled: h.settled || 0, ended: h.ended || 0, reasons: h.reasons || {}, engineMs: h.engine_ms ?? null, engineMaxMs: h.engine_max_ms ?? null, tickMs: a.ms ?? null,
        gapBeforeCommitMs: s.gapBeforeCommitMs, gapBeforeCommitCpuMs: s.gapBeforeCommitCpuMs, transactions: s.transactions, statements: s.statements, overheadStatements: s.overheadStatements,
        dbMs: s.dbMs, rows: s.rows, writes: s.writes, byLabel: s.byLabel, commit: s.commit, commitMs: s.commitMs, cronMs: f.cron.ms, cronRows: rowsOf(f.cron.writes), cronWrites: f.cron.writes,
        requestBytes: f.requests.reduce((n, r) => n + r.bytes, 0), answerBytes: a.bytes ?? null, frames: f.frames.length, frameBytes: f.frames.reduce((n, x) => n + x.bytes, 0), fireMs: f.ms, fireCpuMs: f.cpuMs });
    }
    const still = Number((await q('select count(*)::int as n from public.hunt_sessions where ended_at is null'))[0].n);
    if (i === 0 || (i + 1) % 20 === 0 || !still) say(`closed step ${i + 1}/${steps}: fires ${res.fires}, lag ${res.lagMs} ms, open sessions ${still}, real ${Math.round((Date.now() - closedFrom) / 1000)} s`);
    if (!still) { endedAtStep = i; const left = MINUTES * 60 - (i + 1) * STEP_S; if (left > 0) await world.wait(left / 60, { away: true }); break; }
    await freshRates();
  }
  const settledFires = fires.filter((f) => f.settled > 0);
  const tableTotals = settledFires.reduce((w, f) => addWrites(w, f.writes), {});
  const ends = await q(`select slot, end_reason, forfeit, round(extract(epoch from (ended_at - entered_at)) / 60)::int as minutes from public.hunt_sessions where ended_at is not null order by slot`);
  out.closed = {
    realSeconds: Math.round((Date.now() - closedFrom) / 1000), steps, endedAtStep, fires: fires.length, settles: settledFires.length,
    ends, reasons: fires.reduce((m, f) => { for (const [k, v] of Object.entries(f.reasons)) m[k] = (m[k] || 0) + v; return m; }, {}),
    perSettle: settledFires.length ? {
      simSeconds: stats(settledFires.map((f) => f.simMs / 1000)), kills: stats(settledFires.map((f) => f.kills)),
      engineMs: stats(settledFires.map((f) => f.engineMs)), engineMsPerSimSecond: stats(settledFires.filter((f) => f.simMs > 0).map((f) => f.engineMs / (f.simMs / 1000))),
      gapBeforeCommitMs_derived: stats(settledFires.map((f) => f.gapBeforeCommitMs)), gapBeforeCommitCpuMs_derived: stats(settledFires.map((f) => f.gapBeforeCommitCpuMs)),
      tickMs: stats(settledFires.map((f) => f.tickMs)), transactions: stats(settledFires.map((f) => f.transactions)), statements: stats(settledFires.map((f) => f.statements)),
      overheadStatements: stats(settledFires.map((f) => f.overheadStatements)), dbMs: stats(settledFires.map((f) => f.dbMs)), rowsWritten: stats(settledFires.map((f) => f.rows)),
      cronRowsWritten: stats(settledFires.map((f) => f.cronRows)), cronMs: stats(settledFires.map((f) => f.cronMs)), framesPushed: stats(settledFires.map((f) => f.frames)), tickAnswerBytes: stats(settledFires.map((f) => f.answerBytes)),
      tickRequestBytes: stats(settledFires.map((f) => f.requestBytes)), commitMs: stats(settledFires.map((f) => f.commitMs)),
      commitPayloadBytes: stats(settledFires.map((f) => (f.commit ? f.commit.settleBytes + f.commit.membersBytes : null))),
    } : null,
    progressOpsPerSettle: Object.fromEntries(Object.entries(settledFires.reduce((m, f) => { for (const [k, v] of Object.entries((f.commit && f.commit.progressOps) || {})) m[k] = (m[k] || 0) + v; return m; }, {}))
      .map(([k, v]) => [k, Math.round(v / Math.max(1, settledFires.length) * 100) / 100])),
    /* the first settles against the last: a cold function body, a growing bag */
    firstAndLast: settledFires.length > 6 ? { first3: settledFires.slice(0, 3).map((f) => ({ engineMs: f.engineMs, commitMs: Math.round(f.commitMs), rows: f.rows, simS: Math.round(f.simMs / 1000) })),
      last3: settledFires.slice(-3).map((f) => ({ engineMs: f.engineMs, commitMs: Math.round(f.commitMs), rows: f.rows, simS: Math.round(f.simMs / 1000) })) } : null,
    writesByTablePerSettle: Object.fromEntries(Object.entries(tableTotals).map(([t, d]) => [t, d.map((x) => Math.round(x / Math.max(1, settledFires.length) * 100) / 100)])),
    cronWritesOfOneFire: fires.length ? fires[fires.length - 1].cronWrites : null,
    statementsOfOneSettle: settledFires.length ? settledFires[Math.floor(settledFires.length / 2)].byLabel : null,
    engineMsTotal: settledFires.reduce((n, f) => n + (f.engineMs || 0), 0), simSecondsTotal: Math.round(settledFires.reduce((n, f) => n + f.simMs, 0) / 1000),
    rowsWrittenTotal: settledFires.reduce((n, f) => n + f.rows + f.cronRows, 0), statementsTotal: settledFires.reduce((n, f) => n + f.statements, 0),
  };
  /* what the hunt left behind, by kind of row */
  out.closed.ledgerRows = await q(`select kind, intent, count(*)::int as n from public.player_ledger where id > $1 group by 1, 2 order by 3 desc`, [ledger0]);
  out.closed.progressRows = await q(`select split_part(key, ':', 1) || ':' || split_part(key, ':', 2) as family, count(*)::int as n from public.player_progress group by 1 order by 2 desc limit 12`).catch((e) => ({ error: String(e.message) }));
  out.closed.worldBytes = await q(`select octet_length(world::text) as bytes from public.hunt_instances order by 1 desc limit 1`).catch(() => null);
  say(`closed done: ${fires.length} fires, ${settledFires.length} settles, ends ${JSON.stringify(ends)}`);

  // ── reopen: a new tab in the same browser ──
  T.phase = 'reopen';
  T.engine.length = 0; T.rest.length = 0;
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  net = watchPage(page, T);
  const huntOpen = Number((await q('select count(*)::int as n from public.hunt_sessions where ended_at is null and slot = 0'))[0].n) > 0;
  await page.goto(world.url, { waitUntil: 'commit' });
  await page.waitForSelector('.char-row, .hs-launchers');
  const atCharacters = { ...(await marksOf(page)), requests: net.requests, bytes: net.bytes, byType: JSON.parse(JSON.stringify(net.byType)) };
  const clickAt = await page.evaluate(() => Math.round(performance.now()));
  if (await page.$('.char-pick[data-app="play"][data-slot="0"]')) await page.click('.char-pick[data-app="play"][data-slot="0"]');
  await page.waitForSelector('.hs-launchers');
  if (huntOpen) await page.waitForFunction(() => !!(window.__hpb && window.__hpb.marks.hunt_scene && window.__hpb.marks.hunt_bar && window.__hpb.marks.live_loop));
  else await page.waitForFunction(() => !!(window.__hpb && window.__hpb.marks.summary), null, { timeout: 60000 }).catch(() => {});
  const onScreen = { ...(await marksOf(page)), requests: net.requests, bytes: net.bytes };
  if (huntOpen) await page.waitForFunction(() => !!(window.__hpb && window.__hpb.marks.moving), null, { timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 12000));   // the live start point and the first asks settle in
  const later = await marksOf(page);
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  const reHellos = T.engine.filter((g) => g.phase === 'reopen').map((g) => ({ ...sumTxs(g.txs), answer: g.answer }));
  out.reopen = {
    huntStillOpen: huntOpen, playPressedAtMs: clickAt,
    marksMs: later, atCharacters: { ms: atCharacters.characters ?? null, requests: atCharacters.requests, bytes: atCharacters.bytes, byType_countAndBytes: atCharacters.byType },
    onScreen: { what: huntOpen ? 'hunt scene + hunt bar + live loop' : 'summary card', ms: huntOpen ? Math.max(onScreen.hunt_scene || 0, onScreen.hunt_bar || 0, onScreen.live_loop || 0) : (onScreen.summary ?? null), requests: onScreen.requests, bytes: onScreen.bytes },
    fromPlayPressMs: huntOpen ? Math.max(onScreen.hunt_scene || 0, onScreen.hunt_bar || 0, onScreen.live_loop || 0) - clickAt : (onScreen.summary ? onScreen.summary - clickAt : null),
    movingFromPlayPressMs: later && later.moving ? later.moving - clickAt : null,
    browserApi: apiSummary(net.api), engineAnswers: reHellos.map((h) => ({ settled: h.answer && h.answer.settled, reason: h.answer && h.answer.reason, slices: h.answer && h.answer.slices, statements: h.statements, transactions: h.transactions, rows: h.rows, bytes: h.answer && h.answer.bytes, clientState: h.answer && h.answer.clientState, huntLive: h.answer && h.answer.huntLive,
      ...(h.statements <= 2 ? { what: Object.keys(h.byLabel).join(' | ') } : {}) })),
    returnLines: text.split('\n').map((l) => l.trim()).filter((l) => /while you were away|came home|hunt ended|out of stamina|died|fell|still hunting/i.test(l)).slice(0, 8),
    restCalls: Object.fromEntries(Object.entries(T.rest.filter((r) => r.phase === 'reopen').reduce((m, r) => { (m[r.rpc] || (m[r.rpc] = [])).push(r); return m; }, {})).map(([k, v]) => [k, { n: v.length, rowsWritten: v.reduce((n, r) => n + rowsOf(r.writes), 0) }])),
    awayLine: (text.split('\n').find((l) => /while you were away/i.test(l)) || null), summaryText: await page.evaluate(() => (document.querySelector('.hsum-card') || {}).innerText || null).catch(() => null),
    consoleErrors: errors.slice(0, 5),
  };
  say('reopen: ' + JSON.stringify({ atCharacters: out.reopen.atCharacters, onScreen: out.reopen.onScreen, fromPlayPressMs: out.reopen.fromPlayPressMs }));

  // ── reload: the same tab ──
  T.phase = 'reload';
  net.api.length = 0; net.requests = 0; net.bytes = 0;
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('.char-row, .hs-launchers');
  if (huntOpen) await page.waitForFunction(() => !!(window.__hpb && window.__hpb.marks.hunt_scene && window.__hpb.marks.hunt_bar && window.__hpb.marks.live_loop)).catch(() => {});
  else await page.waitForSelector('.hs-launchers').catch(() => {});
  const reload = { ...(await marksOf(page)), requests: net.requests, bytes: net.bytes };
  out.reload = { marksMs: reload, onScreenMs: huntOpen ? Math.max(reload.hunt_scene || 0, reload.hunt_bar || 0, reload.live_loop || 0) : (reload.shell ?? null), requests: reload.requests, bytes: reload.bytes, browserApi: apiSummary(net.api) };
  say('reload: ' + JSON.stringify({ onScreenMs: out.reload.onScreenMs, requests: reload.requests, bytes: reload.bytes }));

  // ── end: Leave -> the summary ──
  T.phase = 'end';
  if (huntOpen) {
    await page.click('[data-hs-act="leave"]');
    const got = await page.waitForFunction(() => !!document.querySelector('.hsum-card .hsum-title'), null, { timeout: 120000 }).then(() => true, () => false);
    out.end = { left: true, summaryOpened: got, summaryText: got ? await page.evaluate(() => document.querySelector('.hsum-card').innerText) : null,
      ends: await q(`select slot, end_reason, forfeit from public.hunt_sessions where ended_at is not null order by slot`) };
  } else out.end = { left: false, note: 'the hunt had ended while the browser was closed' };
  await new Promise((r) => setTimeout(r, 2500));   // the summary's residue put
  /* THE SERVER'S OWN TALLY of hero 0's last session, to read beside the card (the card is the browser's copy, residue `huntSummaries`) */
  out.end.serverTally = (await q(`select s.end_reason, s.forfeit, round(extract(epoch from (s.ended_at - s.entered_at)))::int as seconds, to_jsonb(t) - 'session_id' as tally
    from public.hunt_sessions s left join public.hunt_session_tally t on t.session_id = s.id where s.user_id = $1 and s.slot = 0 order by s.entered_at desc limit 1`, [uid]).catch((e) => [{ error: String(e.message) }]))[0] || null;
  out.end.cardInResidue = (await q(`select client_state->'huntSummaries'->0 as card from public.player_state where user_id = $1 and slot = 0`, [uid]))[0];
  out.residue = await q(`select slot, octet_length(client_state::text) as bytes, (select jsonb_object_agg(k, octet_length(v::text)) from jsonb_each(client_state) e(k, v)) as by_key from public.player_state where user_id = $1 order by slot`, [uid]);
  out.rejections = await q(`select slot, code, intent, n from public.hr_rejections where user_id = $1 and code <> 'slot_not_owned' order by n desc limit 10`, [uid]).catch(() => []);
  out.offsite = [...world.offsite];
} catch (e) {
  code = 1;
  out.error = String((e && e.stack) || e);
  console.error('hunt-path-baseline: ' + out.error);
} finally {
  if (ab) {
    const recs = T.ab;
    const col = (which, t, cols) => recs.reduce((n, r) => n + cols.reduce((m, c) => m + ((r[which] && r[which][t] && r[which][t][c]) || 0), 0), 0);
    const both = (f) => ({ A: f('writesA', 'deadA', 'rowsA'), B: f('writesB', 'deadB', 'rowsB') });
    const per = (v) => (recs.length ? Math.round(v / recs.length * 100) / 100 : null);
    Object.assign(out.ab, {
      commits: recs.length, byPhase: recs.reduce((m, r) => { m[r.phase] = (m[r.phase] || 0) + 1; return m; }, {}),
      identical: recs.filter((r) => r.identical).length,
      differing: recs.filter((r) => !r.identical).slice(0, 5).map((r) => ({ phase: r.phase, diff: r.diff })),
      tablesCompared: [...new Set(recs.flatMap((r) => Object.keys(r.tables || {})))].sort(),
      rowWrites: both((w, d, k) => recs.reduce((n, r) => n + (r[k] || 0), 0)),
      rowWritesACommit: both((w, d, k) => per(recs.reduce((n, r) => n + (r[k] || 0), 0))),
      ledgerInserts: both((w) => col(w, 'public.player_ledger', [0])),
      renownRows: both((w, d) => recs.reduce((n, r) => n + ((r[d] && r[d].renownRows) || 0), 0)),
      progressWrites: both((w) => col(w, 'public.player_progress', [0, 1])),
      playerStateUpdates: both((w) => col(w, 'public.player_state', [1])),
    });
    if (!recs.length || out.ab.identical !== recs.length) code = 1;
    say('--ab: ' + out.ab.identical + ' of ' + recs.length + ' commits identical; row writes A ' + out.ab.rowWrites.A + ', B ' + out.ab.rowWrites.B);
  }
  out.totalRealSeconds = Math.round((Date.now() - t00) / 1000);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await world.close().catch(() => {});
}
process.exit(code);
