#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/account-gold.mjs — ONE GOLD PURSE PER ACCOUNT (Tyler 2026-10-23: "it
// should just be account gold").
//
//   node tests/account-gold.mjs             the guard
//   node tests/account-gold.mjs --list      the mutation catalogue
//   node tests/account-gold.mjs --selftest  every mutation must be CAUGHT
//   node tests/account-gold.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-12-15-account-gold.sql, src/core/member.js
// sharePurses (+ supabase/functions/hr-accrue/accrual.js), hunt-settle.js
// retryableSettle.
//
// Real RPCs and the real hunt settle (read → engine → hr_hunt_apply_instance)
// on a fully replayed PGlite chain, the REAL Mill Cellar ground:
//   G1  THE FOLD. Replayed to the file before this one, heroes of two accounts
//       hold per-hero gold (and a wallet already holds gems); the migration folds
//       each account's sum into ONE purse, gems untouched, one fold row per
//       account (gold 0, purse = the sum, carry = the per-slot gold), and
//       player_state.gold is gone. The numbers are printed (the replay's fold).
//   G2  ONE PURSE. Two heroes of one account read the same state.gold at the
//       same state.gold_v; it is the wallet's.
//   G3  TWO HEROES SPEND IT, BOTH ORDERS. Slot 0 spends most, slot 1's spend the
//       purse cannot pay is refused insufficient_gold and moves nothing; the
//       other order on another account lands the same one spend. Never < 0.
//   G4  TWO HUNTS RACE ON ONE PURSE (two solo instances of one account). Both are
//       read at purse P; slot 1's window lands a store bill; slot 0's bill, read
//       at P, is refused gold_short and NOTHING of its window lands; settleHunt,
//       racing the same way on its first attempt, re-reads and lands — both doors
//       (browser closed: the tick; watched: the player's settle).
//   G5  ONE PARTY, TWO HEROES OF ONE ACCOUNT (one instance). The engine shares the
//       purse; the server pays the store bills after EVERY member's coins, so a
//       bill the first member could pay only with the second member's coins lands
//       (the purse never dips), and an untampered settle lands on both doors.
//   G6  THE FLOOR IS ON THE ACCOUNT PURSE: a bill that would leave the purse under
//       the hero's "Keep at least" is refused (why floor); one that keeps it lands.
//   G7  THE LEDGER BALANCES. Per account, every gold row states the purse after it
//       and a gold_kind, the chain from the account's first row ends at the purse;
//       every hunt gold row carries its session; a row lying about the purse, or
//       stating none, is refused.
//   G8  NO BODY READS A PER-HERO PURSE: no function in the replayed schema reads or
//       writes player_state gold, through any alias.
//   G9  RE-APPLY IS A NO-OP: the schema fingerprint and every purse are unchanged.
//   G10 THE ACL: the helpers are owner-only; no client writes the purse or the ledger.
//   G11 THE PINS MEET PRODUCTION. Replayed to the file before this one with
//       clan_contribute__ungated reshaped to production's image (the repo body with its
//       whole-line comments stripped, md5 27e05ce9, measured read-only 2026-10-23), the
//       file applies and installs its post-image; a body moved any other way is refused
//       at §0 and nothing lands.
//   E1  THE ENGINE (no database): two sides of one account share ONE purse (a buy by
//       one is gone for the other; coins either loots pay either); two accounts do not.
//   E2  THE RETRY: retryableSettle re-reads on gold_short and on a gold_out not proven.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend. The race that matters here is across
// the NETWORK HOP (a window read at purse P, committed after another hero spent),
// which G4 reproduces exactly; two transactions overlapping inside Postgres are
// serialised by the purse's row lock (hr_purse_move: select ... for update), whose
// ORDER (characters, then purses in user order, before any other shared row) is
// pinned by reading the installed bodies (G10).
// ════════════════════════════════════════════════════════════════════════
import { readFile, mkdtemp, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT, inventory, manifest } from './schema-replay.mjs';
import { HARNESS } from './hunt-sessions-settle.mjs';

const MIG = '2026-12-15-account-gold.sql';
const PREV = await (async () => { const o = (await manifest()).order; return o[o.indexOf(MIG) - 1]; })();

/* §0's pins (G9 re-applies the MUTATED file, whose own bodies are not its pinned post-images) and §7's
   self-check are blinded so the arms below, not the migration, judge each mutant. */
const SELFCHECK_BLIND = [
  ["declare v_md5 text; r record;\nbegin\n", "declare v_md5 text; r record;\nbegin\n  if true then return; end if;   -- selftest: §0 pins short-circuited\n"],
  ["  v_prev bigint; v_bad int;\nbegin\n", "  v_prev bigint; v_bad int;\nbegin\n  if true then return; end if;   -- selftest: §7 short-circuited\n"],
];
const SQL_MUTANTS = {
  per_hero_read: {
    why: 'the per-hero column stays and hr_state_of reads it: a hero shows its own gold, not the account purse',
    pairs: [["      'slot', v_st.slot, 'gold', coalesce(v_w.gold, 0), 'gold_v'", "      'slot', v_st.slot, 'gold', v_st.gold, 'gold_v'"],
      ['alter table public.player_state drop column if exists gold;', 'select 1;']],
  },
  unguarded_debit: {
    why: 'hr_purse_move lands a debit the purse cannot pay (and the CHECK is gone): two heroes overspend one purse',
    pairs: [['  if p_gold < 0 and v + p_gold < greatest(0, coalesce(p_floor, 0)) then return null; end if;\n', ''],
      ['    alter table public.account_wallet add constraint account_wallet_gold_check check (gold >= 0);', '    null;']],
  },
  bills_before_credits: {
    why: 'each member\'s store bill is paid before the next member\'s coins: one account\'s party is refused for gold its own heroes earned',
    pairs: [["      if v_h ? '_purse' then\n", "      if v_h ? '_purse' then\n        perform public.hr_purse_lock((v_m->>'user')::uuid);\n        if public.hr_purse_of((v_m->>'user')::uuid) < (v_h->'_purse'->>'cost')::bigint + (v_h->'_purse'->>'floor')::bigint then\n          perform public.hr_reject('gold_short', jsonb_build_object('why', 'member'));\n        end if;\n"]],
  },
  floor_ignored: {
    why: 'the window\'s end purse is not held to the floor: a hero spends below its "Keep at least"',
    pairs: [["      if public.hr_purse_of(v_u) < v_f then\n        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));",
      "      if false then\n        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));"]],
  },
  ledger_lies: {
    why: 'the ledger trigger stops comparing the stated purse with the wallet: a row can misstate the balance',
    pairs: [['  if v is null or (new.purse is not null and new.purse <> v) then\n', '  if v is null then\n'],
      ['  new.purse := v;\n', '  new.purse := coalesce(new.purse, v);\n']],
  },
  fold_takes_max: {
    why: 'the fold keeps the richest hero\'s gold instead of the sum: every other hero\'s gold is lost',
    pairs: [['  select ps.user_id, sum(ps.gold)::bigint, 1, now()\n', '  select ps.user_id, max(ps.gold)::bigint, 1, now()\n'],
      /* §3a's probe and §3c's conservation check would refuse it at apply: blinded, so G1 judges it */
      ["    insert into public.player_state (user_id, slot, gold) values (v_u, 0, 300), (v_u, 1, 700);\n",
        "    raise exception using errcode = 'HR901';   -- selftest: §3a probe short-circuited\n"],
      ["    where w.gold is distinct from s.g) then\n", "    where false) then\n"],
      ["  if (select coalesce(sum(w.gold), 0) from public.account_wallet w) - v_wallet0 <> v_before then\n", "  if false then\n"]],
    fold: true,
  },
  live_image_refused: {
    why: '§0 knows only the replay image: the apply is refused on production, whose clan_contribute__ungated is the same code without its comments',
    pairs: [['v_md5 is distinct from r.post and v_md5 is distinct from r.live then', 'v_md5 is distinct from r.post then']],
    pins: true,
  },
  pins_accept_anything: {
    why: '§0 stops refusing: a body another lane moved is clobbered by this file\'s restatement',
    pairs: [['    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post and v_md5 is distinct from r.live then\n', '    if false then\n']],
    pins: true,
  },
  loot_sale_unstamped: {
    why: 'the loot filter\'s sale is journalled outside its hunt: the gold history cannot group it',
    pairs: [["    perform set_config('hr.hunt_session', p_session::text, true);\n    v_a := public.hr_apply(p_user, p_slot,", "    v_a := public.hr_apply(p_user, p_slot,"]],
  },
  helper_client_grant: {
    why: 'authenticated may call hr_purse_move: a client moves its own purse',
    pairs: [['revoke all on function public.hr_purse_move(uuid, bigint, bigint) from public, anon, authenticated, service_role;',
      'revoke all on function public.hr_purse_move(uuid, bigint, bigint) from public, anon, service_role;\ngrant execute on function public.hr_purse_move(uuid, bigint, bigint) to authenticated;']],
  },
};
/* JS mutants: a copy of src/ + the edge, one anchor replaced (the hunt arms and E1/E2 run on the copy). */
const JS_MUTANTS = {
  purses_not_shared: {
    why: 'the engine gives each hero of one account its own copy of the purse: a party of one account spends it twice',
    file: 'src/core/member.js', find: '    if (group.length < 2) continue;\n', repl: '    if (group.length > 0) continue;\n',
  },
  no_retry_on_purse_race: {
    why: 'the edge does not re-read when another hero moved the purse: a raced window is refused instead of re-run',
    file: 'supabase/functions/hr-accrue/hunt-settle.js', find: "const RETRYABLE = Object.freeze(['session_moved', 'version_conflict', 'gold_short']);",
    repl: "const RETRYABLE = Object.freeze(['session_moved', 'version_conflict']);",
  },
};
const MUTATIONS = { ...Object.fromEntries(Object.entries(SQL_MUTANTS).map(([k, v]) => [k, { ...v, kind: 'sql' }])),
  ...Object.fromEntries(Object.entries(JS_MUTANTS).map(([k, v]) => [k, { ...v, kind: 'js' }])) };

const problems = [];
/* --verbose: print what each hunt arm measured (coins, bills, purses), so a green run shows it measured something. */
const VERBOSE = process.argv.includes('--verbose');
const say = (...a) => { if (VERBOSE) console.log('   ', ...a); };
const ok = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

function sqlPairs(mutate) {
  const m = mutate && MUTATIONS[mutate];
  if (!m || m.kind !== 'sql') return [];
  /* A pins mutant plants INTO §0, so §0 stays live (G11 judges it); every other one blinds §0 and §7. */
  return [...m.pairs, ...SELFCHECK_BLIND.filter((_, i) => !(m.pins && i === 0))];
}
async function migrationText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  for (const [find, repl] of sqlPairs(mutate)) {
    if (sql.split(find).length - 1 !== 1) throw harness(`patch anchor matched != 1 time in ${MIG}: ${find.slice(0, 70)}`);
    sql = sql.replace(find, () => repl);
  }
  return sql;
}

/* The tree the JS half loads: the real one, or a copy with one JS mutant planted. */
async function treeFor(mutate) {
  const m = mutate && MUTATIONS[mutate];
  if (!m || m.kind !== 'js') return { root: ROOT, done: async () => {} };
  const tmp = await mkdtemp(join(tmpdir(), 'hr-account-gold-'));
  await cp(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
  await cp(join(ROOT, 'supabase', 'functions'), join(tmp, 'supabase', 'functions'), { recursive: true });
  const path = join(tmp, m.file);
  const text = await readFile(path, 'utf8');
  if (text.split(m.find).length - 1 !== 1) throw harness(`JS anchor matched != 1 time in ${m.file}: ${m.find.slice(0, 70)}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, text.replace(m.find, () => m.repl));
  return { root: tmp, done: () => rm(tmp, { recursive: true, force: true }) };
}

// ── DRIVERS ────────────────────────────────────────────────────────────────
function drivers(db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => { const r = await q(sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };
  const as = (uid) => q("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');
  const exec = async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
  const purse = async (uid) => Number(await one('select public.hr_purse_of($1)::text', [uid]));
  const newAccount = async (slots = [0, 1]) => {
    const uid = await one('select gen_random_uuid()');
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'account-gold test') on conflict (user_id) do nothing", [uid]);
    await as(uid);
    for (const slot of slots) {
      await gate();
      const r = await one('select public.hr_create_character($1)', [slot]);
      if (!r || r.ok !== true) throw harness(`hr_create_character(${slot}) refused: ${JSON.stringify(r)}`);
      await q("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = $2", [uid, slot]);
    }
    return uid;
  };
  /* A journalled fixture move: the wallet set to `gold`, one ledger row stating it (the trigger checks it). */
  const seedPurse = async (uid, gold) => {
    const cur = await purse(uid);
    await q('update public.account_wallet set gold = $2, version = version + 1 where user_id = $1', [uid, gold]);
    await q("insert into public.player_ledger (user_id, slot, kind, intent, gold, purse) values ($1, 0, 'admin', 'account_gold_test_seed', $2, $3)", [uid, gold - cur, gold]);
  };
  const apply = async (uid, slot, gold, intent) => {
    const v = await one('select version from public.player_state where user_id = $1 and slot = $2', [uid, slot]);
    const [r] = await exec('select public.hr_apply($1::uuid, $2::int, $3::bigint, gen_random_uuid(), $4::text::jsonb) as r',
      [uid, slot, v, JSON.stringify({ gold, journal: { kind: 'shop', intent } })]);
    return r.r;
  };
  const state = (uid, slot) => one('select public.hr_state_of($1, $2)', [uid, slot]);
  const options = async (uid, slot, opts) => {
    await as(uid); await gate();
    const r = await one('select public.hr_action_set_options($1, 0, $2::jsonb, gen_random_uuid())', [slot, JSON.stringify(opts)]);
    if (!r || r.ok !== true) throw harness('options refused: ' + JSON.stringify(r));
  };
  /* The drops of Mill Cellar's monsters a vendor buys (the catalogue's kill bounds and vendor values). */
  const sellable = async () => (await q(`select distinct d.key as item from public.hr_hunt_kill_bounds b, jsonb_each(b.drops) d
      join public.hr_hunt_vendor_value v on v.item_id = d.key
     where b.monster_id in (select monster_id from public.hr_hunt_ground_spawns where hunt_id = 'mill_cellar') order by 1`)).map((r) => r.item);
  return { q, one, as, gate, exec, purse, newAccount, seedPurse, apply, state, options, sellable };
}

/* Heroes `slots` of account `uid` on Mill Cellar `mins` minutes ago: solo each, or one party of them. */
async function hunting(d, uid, slots, o = {}) {
  await d.q('update public.hr_hunt_config set enabled = true where id');
  if (o.party) {
    await d.as(uid);
    for (const s of slots.slice(1)) {
      await d.gate();
      const r = await d.one('select public.hr_hunt_party_invite_own($1, $2, gen_random_uuid())', [slots[0], s]);
      if (!r || r.ok !== true) throw harness('invite_own refused: ' + JSON.stringify(r));
    }
    const party = await d.one('select public.hr_hunt_party_of($1::uuid, $2)', [uid, slots[0]]);
    await d.q("update public.hunt_parties set hunt_id = 'mill_cellar' where id = $1", [party]);
  }
  const sids = {};
  for (const s of slots) {
    await d.as(uid); await d.gate();
    const e = await d.one(`select public.hr_hunt_enter($1, 'mill_cellar', '[]'::jsonb, 0, null, gen_random_uuid())`, [s]);
    if (!e || e.ok !== true) throw harness(`enter (slot ${s}) refused: ${JSON.stringify(e)}`);
    sids[s] = e.session.id;
  }
  await d.as('');
  /* ONE instant for every session and instance (each statement here is its own transaction, so now() moves). */
  const t = await d.one(`select date_trunc('second', now() - make_interval(mins => $1))::text`, [Number(o.mins || 12)]);
  for (const sid of Object.values(sids)) {
    await d.q(`update public.hunt_sessions set entered_at = $2::timestamptz - interval '1 minute', hunt_from = $2::timestamptz,
                 settled_to = $2::timestamptz, next_swing_at = $2::timestamptz where id = $1`, [sid, t]);
    const inst = await d.one('select instance_id from public.hunt_sessions where id = $1', [sid]);
    await d.q('update public.hunt_instances set settled_to = $2::timestamptz, next_swing_at = $2::timestamptz where id = $1', [inst, t]);
  }
  return sids;
}

/* One read + proposal for (uid, slot), the real ground (grounds {}), the tick's door. */
async function propose(M, d, uid, slot, atMs) {
  const plan = await M.HS.readHuntSettle({ exec: d.exec, user: uid, slot, grounds: {}, ...(atMs ? { atMs } : {}) }, 'tick');
  if (plan.answer) throw harness(`read (slot ${slot}) answered ${JSON.stringify(plan.answer).slice(0, 300)}`);
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.out.accrued) throw harness(`proposal (slot ${slot}) accrued nothing: ${p.out.reason}`);
  return p;
}
const commit = (M, d, p) => M.HS.commitHuntSettle(d.exec, { ...p.commit, project: null });
const memberOf = (p, uid, slot) => p.commit.members.find((m) => String(m.user) === String(uid) && Number(m.slot) === slot);
/* A bill the purse cannot pay however much a window sells on pickup (well under the food lane's 361 uses a window). */
const OVER = 2000;
/* WHAT A MEMBER'S WINDOW ALREADY MOVES besides the planted bill: its coins, the loot it sold to cover a use (+) and
   the store uses the ENGINE bought itself (-), priced from the server's own catalogue. A sized bill is planted ON
   TOP of these, so it is sized against this net. */
let PRICES = null, UNITS = null;
async function netOf(d, m) {
  if (!PRICES) {
    PRICES = Object.fromEntries((await d.q('select basic_id, price::int p from public.hr_hunt_basic_supplies')).map((r) => [r.basic_id, r.p]));
    UNITS = Object.fromEntries((await d.q('select item_id, unit::int u from public.hr_hunt_cover_items')).map((r) => [r.item_id, r.u]));
  }
  let net = Number((m && m.delta && m.delta.gold) || 0);
  for (const [id, n] of Object.entries((m && m.hunt && m.hunt.buys) || {})) net -= Number(n) * (PRICES[id] || 0);
  for (const [id, n] of Object.entries((m && m.hunt && m.hunt.cover) || {})) net += Number(n) * (UNITS[id] || 0);
  return net;
}
const addBuys = (m, n) => { m.hunt.buys = Object.assign({}, m.hunt.buys || {}, { salted_shrimp: ((m.hunt.buys || {}).salted_shrimp || 0) + n }); };

/* THE LEDGER CHAIN of one account: every gold row states purse = previous + gold, carries a gold_kind;
   the chain from the account's first gold row (a fresh account: from 0) ends at the purse. */
async function chain(d, uid) {
  const rows = await d.q(`select id::text, slot, kind, intent, gold::text g, purse::text p, gold_kind k, session_id::text s
                            from public.player_ledger where user_id = $1 and coalesce(gold, 0) <> 0 order by id`, [uid]);
  let prev = 0; const bad = [];
  for (const r of rows) {
    const g = Number(r.g), p = r.p === null ? null : Number(r.p);
    if (p === null || p !== prev + g || !r.k) bad.push(`${r.intent} ${g} -> ${r.p} (${r.k}) after ${prev}`);
    if (p !== null && p < 0) bad.push(`${r.intent} left the purse at ${p}`);
    prev = p === null ? prev + g : p;
  }
  return { rows, bad, end: prev, purse: await d.purse(uid) };
}

// ── G1 THE FOLD (replayed to the file before this one) ─────────────────────
async function foldArm(mutate) {
  const { db } = await bootReplay({ upTo: PREV });
  const d = drivers(db);
  const [u1, u2] = [await d.one('select gen_random_uuid()'), await d.one('select gen_random_uuid()')];
  await d.q('insert into auth.users (id) values ($1), ($2)', [u1, u2]);
  await d.q('insert into public.player_state (user_id, slot, gold) values ($1,0,300),($1,1,1200),($1,2,0),($2,0,5000000000)', [u1, u2]);
  await d.q('insert into public.account_wallet (user_id, gems) values ($1, 7)', [u1]);
  const before = Number(await d.one('select coalesce(sum(gold), 0)::text from public.player_state'));
  await db.exec('begin;\n' + await migrationText(mutate) + '\ncommit;');
  const p1 = await d.purse(u1), p2 = await d.purse(u2);
  ok(p1 === 1500 && p2 === 5000000000, `G1: 300 + 1200 + 0 folded to ${p1}; 5e9 to ${p2}`);
  ok(Number(await d.one('select gems from public.account_wallet where user_id = $1', [u1])) === 7, 'G1: the fold moved the gems');
  const rows = await d.q("select user_id::text u, slot, gold::text g, purse::text p, gold_kind k, meta from public.player_ledger where intent = 'gold_fold:2026-12-15' order by purse", []);
  const r1 = rows.find((r) => r.u === u1);
  ok(rows.length === 2 && r1 && r1.g === '0' && Number(r1.p) === 1500 && r1.k === 'fold' && r1.slot === 0
    && JSON.stringify(r1.meta.carry) === JSON.stringify({ 0: 300, 1: 1200, 2: 0 }), `G1: the fold rows are ${JSON.stringify(rows)}`);
  const after = Number(await d.one('select coalesce(sum(gold), 0)::text from public.account_wallet'));
  ok(after === before, `G1: ${before} per-hero gold became ${after} in purses`);
  ok(!(await d.one("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'gold')")),
    'G1: player_state.gold survived the fold');
  if (!mutate) console.log(`  fold (replay to ${PREV} + 3 heroes / 2 accounts): ${before} per-hero gold -> ${after} in ${rows.length} purses (1,500 + 5,000,000,000), fold rows ${rows.length}`);
  await db.close?.();
}

// ── G11 THE PINS MEET PRODUCTION (replayed to the file before this one) ───────
const CLAN = 'public.clan_contribute__ungated(uuid,bigint,integer)';
const LIVE_CLAN_MD5 = '27e05ce903b0f6b037eca83aacc522f8';   // production's prosrc md5, measured read-only 2026-10-23
async function pinsArm(mutate) {
  const text = await migrationText(mutate);
  const row = new RegExp("\\('" + CLAN.replace(/[().]/g, '\\$&') + "', '([0-9a-f]{32})', '([0-9a-f]{32})', '([0-9a-f]{32})'\\)").exec(text);
  if (!row) throw harness('G11: no §0 row with a production image for ' + CLAN);
  const [, pre, post, live] = row;
  ok(live === LIVE_CLAN_MD5, `G11: §0 pins production's ${CLAN} as ${live}, measured ${LIVE_CLAN_MD5}`);
  const md5Of = (d) => d.one("select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure($1)", [CLAN]);
  const reshape = async (d, fn) => {
    const def = await d.one('select pg_get_functiondef(to_regprocedure($1))', [CLAN]);
    await d.q(fn(def.replace(/\r/g, '')));
  };
  /* (a) production's image: the replayed body with its whole-line comments stripped. */
  {
    const { db } = await bootReplay({ upTo: PREV });
    const d = drivers(db);
    ok(await md5Of(d) === pre, `G11: the replay builds ${CLAN} as ${await md5Of(d)}, §0 pins ${pre}`);
    await reshape(d, (def) => def.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n'));
    ok(await md5Of(d) === LIVE_CLAN_MD5, `G11: the comment-stripped replay body is ${await md5Of(d)}, production measured ${LIVE_CLAN_MD5}`);
    let err = null;
    try { await db.exec('begin;\n' + text + '\ncommit;'); } catch (e) { err = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
    if (ok(err === null, `G11: the apply onto production's image was refused: ${err}`)) {
      ok(await md5Of(d) === post, `G11: onto production's image the file installed ${await md5Of(d)}, its post-image is ${post}`);
    }
    await db.close?.();
  }
  /* (b) a body moved any other way: refused at §0, nothing lands. */
  {
    const { db } = await bootReplay({ upTo: PREV });
    const d = drivers(db);
    await reshape(d, (def) => def.replace('\nbegin\n', '\nbegin\n  perform 1;   -- another lane moved it\n'));
    let err = null;
    try { await db.exec('begin;\n' + text + '\ncommit;'); } catch (e) { err = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
    ok(err !== null && err.includes('PIN: ' + CLAN), `G11: a moved ${CLAN} was not refused at §0 (${err})`);
    ok(!(await d.one("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'account_wallet' and column_name = 'gold')")),
      'G11: a refused apply left the purse column behind');
    await db.close?.();
  }
}

// ── G2-G10 on the whole chain ────────────────────────────────────────────────
async function chainArms(mutate, M) {
  const { db } = await bootReplay({ patches: sqlPairs(mutate).length ? new Map([[MIG, sqlPairs(mutate)]]) : undefined, upTo: MIG });
  const d = drivers(db);

  // G2 ONE PURSE.
  const a = await d.newAccount();
  await d.seedPurse(a, 1000);
  const s0 = await d.state(a, 0), s1 = await d.state(a, 1);
  ok(s0 && s1 && s0.state.gold === 1000 && s1.state.gold === 1000 && s0.state.gold_v === s1.state.gold_v && Number.isInteger(s0.state.gold_v),
    `G2: two heroes of one account read ${JSON.stringify([s0 && s0.state.gold, s0 && s0.state.gold_v])} and ${JSON.stringify([s1 && s1.state.gold, s1 && s1.state.gold_v])} (purse 1000)`);

  // G3 TWO HEROES SPEND IT, BOTH ORDERS.
  let r = await d.apply(a, 0, -900, 'shop_buy:g3:1');
  ok(r && r.ok === true && await d.purse(a) === 100, `G3: slot 0 spending 900 of 1000 answered ${JSON.stringify(r && r.error)} (purse ${await d.purse(a)})`);
  r = await d.apply(a, 1, -150, 'shop_buy:g3:2');
  ok(r && r.error === 'insufficient_gold' && await d.purse(a) === 100, `G3: slot 1 spending 150 of 100 answered ${JSON.stringify(r && r.error)} (purse ${await d.purse(a)})`);
  const b = await d.newAccount();
  await d.seedPurse(b, 1000);
  r = await d.apply(b, 1, -900, 'shop_buy:g3:3');
  const r2 = await d.apply(b, 0, -150, 'shop_buy:g3:4');
  ok(r && r.ok === true && r2 && r2.error === 'insufficient_gold' && await d.purse(b) === 100,
    `G3: the other order answered ${JSON.stringify([r && r.error, r2 && r2.error])} (purse ${await d.purse(b)})`);

  // G4 TWO HUNTS RACE ON ONE PURSE — both doors.
  for (const door of ['tick', 'settle']) {
    const u = await d.newAccount();
    await d.options(u, 0, { gold_floor: 0 }); await d.options(u, 1, { gold_floor: 0 });
    /* every Mill Cellar drop a vendor buys is SOLD ON PICKUP (the loot filter): its sale is a hunt gold move (G7) */
    for (const slot of [0, 1]) for (const item of await d.sellable()) {
      await d.as(u); await d.gate();
      const lr = await d.one("select public.hr_loot_rule_set($1, $2, 'sell', gen_random_uuid())", [slot, item]);
      if (!lr || lr.ok !== true) throw harness(`loot rule refused for ${item}: ${JSON.stringify(lr)}`);
    }
    await d.seedPurse(u, 500);
    await hunting(d, u, [0, 1]);
    const p0 = await propose(M, d, u, 0), p1 = await propose(M, d, u, 1);
    const c0 = await netOf(d, memberOf(p0, u, 0)), c1 = await netOf(d, memberOf(p1, u, 1));
    addBuys(memberOf(p1, u, 1), Math.floor((500 + c1 - 20) / 14));       // slot 1's bill leaves < 20
    const r1 = await commit(M, d, p1);
    ok(r1 && r1.ok === true, `G4 ${door}: slot 1's window answered ${JSON.stringify(r1).slice(0, 300)}`);
    const left = await d.purse(u);
    /* slot 0's bill, read at 500, cannot be paid now: above what is left plus its coins and anything it sells on pickup */
    addBuys(memberOf(p0, u, 0), Math.ceil((left + c0 + OVER) / 14));
    const inst0 = await d.one('select instance_id from public.hunt_sessions where user_id = $1 and slot = 0', [u]);
    const sw0 = await d.one('select world_swing::text from public.hunt_instances where id = $1', [inst0]);
    const r0 = await commit(M, d, p0);
    say(`G4 ${door}: coins ${c0} / ${c1}; slot 1's bill left ${left}; slot 0's raced bill -> ${r0 && r0.error}`);
    ok(r0 && r0.ok === false && r0.error === 'gold_short', `G4 ${door}: slot 0's raced window answered ${JSON.stringify(r0).slice(0, 300)}`);
    ok(await d.purse(u) === left && await d.one('select world_swing::text from public.hunt_instances where id = $1', [inst0]) === sw0
      && !(await d.one("select exists (select 1 from public.player_ledger where user_id = $1 and slot = 0 and intent = 'supply_buy')", [u])),
      `G4 ${door}: the refused window moved something (purse ${await d.purse(u)} vs ${left})`);
    // settleHunt, raced the same way on its first attempt, re-reads and lands.
    let first = true;
    const racing = async (text, params) => {
      if (first && /hr_hunt_apply_instance/.test(text)) {
        first = false;
        const members = JSON.parse(params[3]);
        const m = members.find((x) => Number(x.slot) === 0);
        const have = await d.purse(u);
        m.hunt.buys = Object.assign({}, m.hunt.buys || {}, { salted_shrimp: Math.ceil((have + Number(m.delta.gold || 0) + OVER) / 14) });
        params = [...params]; params[3] = JSON.stringify(members);
      }
      return d.exec(text, params);
    };
    const v = await M.HS.settleHunt(door === 'tick' ? { exec: racing, user: u, slot: 0, mode: 'tick', grounds: {} }
      : { exec: racing, user: u, slot: 0, mode: 'settle', bucket: null, project: true, live: true, grounds: {} });
    ok(!first && v && v.outcome === 'paid', `G4 ${door}: settleHunt after a raced first attempt answered ${JSON.stringify(v && { outcome: v.outcome, reason: v.reason })}`);
    const c = await chain(d, u);
    ok(!c.bad.length && c.end === c.purse && c.purse >= 0, `G4 ${door}: the ledger chain ${JSON.stringify(c.bad)} ends ${c.end}, purse ${c.purse}`);
    const e0 = await d.state(u, 0), e1 = await d.state(u, 1);
    ok(e0.state.gold === c.purse && e1.state.gold === c.purse, `G4 ${door}: the heroes read ${e0.state.gold} / ${e1.state.gold}, purse ${c.purse}`);
  }

  // G5 ONE PARTY, TWO HEROES OF ONE ACCOUNT.
  {
    const u = await d.newAccount();
    await d.seedPurse(u, 300);                                    // exactly the default floor (300)
    await hunting(d, u, [0, 1], { party: true, mins: 14 });
    const inst = await d.one('select count(distinct instance_id)::int from public.hunt_sessions where user_id = $1 and ended_at is null', [u]);
    ok(inst === 1, `G5: the two own heroes hunt ${inst} instances`);
    const from = Number(await d.one('select floor(extract(epoch from i.settled_to) * 1000)::bigint::text from public.hunt_instances i join public.hunt_sessions h on h.instance_id = i.id where h.user_id = $1 and h.slot = 0', [u]));
    const p = await propose(M, d, u, 0, from + 6 * 60000);
    const m0 = memberOf(p, u, 0), m1 = memberOf(p, u, 1);
    const c0 = await netOf(d, m0), c1 = await netOf(d, m1);
    const n = Math.floor((c0 + c1) / 14);
    if (ok(m0 && m1 && n * 14 > c0, `G5: the window's coins (${c0} + ${c1}) cannot make a bill slot 0 pays only with slot 1's coins`)) {
      addBuys(m0, n);                                             // slot 0 (applied first) spends both heroes' coins
      const res = await commit(M, d, p);
      say(`G5: coins ${c0} + ${c1}; slot 0's bill ${n * 14} -> ${res && (res.ok ? 'landed' : res.error)}; purse ${await d.purse(u)}`);
      ok(res && res.ok === true, `G5: a bill one account's two heroes earned together answered ${JSON.stringify(res).slice(0, 300)}`);
      const c = await chain(d, u);
      ok(!c.bad.length && c.purse === 300 + c0 + c1 - n * 14 && c.purse >= 300, `G5: the chain ${JSON.stringify(c.bad)}; purse ${c.purse}, expected ${300 + c0 + c1 - n * 14}`);
    }
    for (const door of ['tick', 'settle']) {
      /* the rest of the hunt: the browser closed (the tick, to 10 min), then watched (the player's settle, to now) */
      const v = await M.HS.settleHunt(door === 'tick' ? { exec: d.exec, user: u, slot: 0, mode: 'tick', grounds: {}, atMs: from + 10 * 60000 }
        : { exec: d.exec, user: u, slot: 1, mode: 'settle', bucket: null, project: true, live: true, grounds: {} });
      say(`G5 ${door}: ${v && v.outcome}; purse ${await d.purse(u)}`);
      ok(v && v.outcome === 'paid', `G5 ${door}: the party's settle answered ${JSON.stringify(v && { outcome: v.outcome, reason: v.reason })}`);
      const c = await chain(d, u);
      ok(!c.bad.length && c.end === c.purse, `G5 ${door}: the chain ${JSON.stringify(c.bad)} ends ${c.end}, purse ${c.purse}`);
    }
  }

  // G6 THE FLOOR IS ON THE ACCOUNT PURSE.
  {
    const u = await d.newAccount();
    await d.options(u, 0, { gold_floor: 80 });
    await d.seedPurse(u, 100);
    await hunting(d, u, [0]);
    let p = await propose(M, d, u, 0);
    let m = memberOf(p, u, 0);
    let c0 = await netOf(d, m);
    addBuys(m, Math.floor((100 + c0 - 80) / 14) + 1);            // would leave the purse under 80
    let res = await commit(M, d, p);
    if (ok(res && res.ok === false && res.error === 'gold_short' && res.detail && res.detail.why === 'floor',
      `G6: a bill under the floor answered ${JSON.stringify(res).slice(0, 300)}`)) {
      p = await propose(M, d, u, 0);
      m = memberOf(p, u, 0); c0 = await netOf(d, m);
      const n = Math.floor((100 + c0 - 80) / 14);
      if (n > 0) addBuys(m, n);
      res = await commit(M, d, p);
      say(`G6: coins ${c0}; a bill of ${n * 14} keeping 80 of 100 -> ${res && (res.ok ? 'landed' : res.error + ' ' + JSON.stringify(res.detail))}; purse ${await d.purse(u)}`);
      ok(res && res.ok === true && await d.purse(u) >= 80, `G6: a bill that keeps the floor answered ${JSON.stringify(res && res.error)} (purse ${await d.purse(u)})`);
    }
  }

  // G7 THE LEDGER BALANCES.
  for (const u of [a, b]) {
    const c = await chain(d, u);
    ok(!c.bad.length && c.end === c.purse, `G7: account ${u.slice(0, 8)}: ${JSON.stringify(c.bad)}; chain ends ${c.end}, purse ${c.purse}`);
  }
  const hunts = await d.q(`select intent, gold_kind k, count(*)::int n, count(session_id)::int s from public.player_ledger
                             where coalesce(gold, 0) <> 0 and (session_id is not null or intent in ('supply_buy', 'vendor_cover', 'loot_sell')) group by 1, 2`);
  ok(hunts.length > 0 && hunts.every((h) => h.n === h.s) && hunts.some((h) => h.k === 'hunt_supply') && hunts.some((h) => h.k === 'hunt_loot')
    && hunts.some((h) => h.intent === 'loot_sell' && h.k === 'hunt_sale'),
    `G7: the hunt gold rows are ${JSON.stringify(hunts)} (every one with its session; coins, loot sold on pickup and store bills present)`);
  let lie = null;
  try { await d.q("insert into public.player_ledger (user_id, slot, kind, intent, gold, purse) values ($1, 0, 'admin', 'g7_lie', 5, 999999)", [a]); }
  catch (e) { lie = String(e.message); }
  ok(lie && /ledger_purse/.test(lie), `G7: a gold row stating purse 999,999 was ${lie ? 'refused: ' + lie.slice(0, 80) : 'journalled'}`);
  /* a writer that states no purse (the farm's rows, 2026-12-14-shared-farm.sql) has it filled from the wallet */
  await d.q('update public.account_wallet set gold = gold + 5 where user_id = $1', [a]);
  await d.q("insert into public.player_ledger (user_id, slot, kind, intent, gold) values ($1, 0, 'admin', 'g7_none', 5)", [a]);
  const filled = await d.q("select gold::text g, purse::text p, gold_kind k from public.player_ledger where user_id = $1 and intent = 'g7_none' and gold <> 0", [a]);
  ok(filled.length === 1 && Number(filled[0].p) === await d.purse(a) && filled[0].k === 'other', `G7: a gold row stating no purse reads ${JSON.stringify(filled)} (purse ${await d.purse(a)})`);
  // G7's farm half: a plot upgrade through hr_farm_purse_pay (2026-12-14-shared-farm.sql) pays from the ACCOUNT purse.
  {
    const u = await d.newAccount();
    const tier = (await d.q("select gold_cost::text g, req_farm_level l from public.hr_plot_tier where plot_level = 2"))[0];
    if (ok(tier && Number(tier.g) > 0, `G7: no priced plot tier 2 (${JSON.stringify(tier)})`)) {
      await d.q("update public.player_skills set xp = 100000000 where user_id = $1 and skill_id = 'farming'", [u]);
      await d.seedPurse(u, Number(tier.g) + 3);
      await d.as(u); await d.gate();
      const up = await d.one('select public.hr_farm_upgrade_plot(1, gen_random_uuid(), 2)');
      const c = await chain(d, u);
      ok(up && up.ok === true && up.paid_with === 'gold' && await d.purse(u) === 3 && !c.bad.length && c.end === 3
        && c.rows.some((r) => r.intent === 'farm_upgrade_plot' && r.k === 'farm' && Number(r.slot) === 1),
        `G7: slot 1's plot upgrade answered ${JSON.stringify(up)}; purse ${await d.purse(u)}; chain ${JSON.stringify(c.bad)}`);
    }
  }

  // G8 NO BODY READS A PER-HERO PURSE.
  const bodies = await d.q(`select p.oid::regprocedure::text sig, p.prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))`);
  const stale = [];
  for (const f of bodies) for (const hit of perHeroGold(f.src)) stale.push(`${f.sig}: ${hit}`);
  ok(!stale.length, `G8: bodies still read per-hero gold: ${stale.slice(0, 6).join(' | ')}`);
  const views = await d.q(`select c.relname, pg_get_viewdef(c.oid, true) def from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`);
  const staleViews = views.filter((v) => perHeroGold(v.def).length);
  ok(!staleViews.length, `G8: a view reads player_state gold: ${staleViews.map((v) => v.relname + ' ' + perHeroGold(v.def).join(','))}`);

  // G10 THE ACL, and the lock order in the installed bodies.
  for (const sig of ['public.hr_purse_of(uuid)', 'public.hr_purse_lock(uuid)', 'public.hr_purse_move(uuid,bigint,bigint)', 'public.hr_gold_kind(text,text,uuid)']) {
    for (const role of ['anon', 'authenticated', 'service_role', 'hr_engine']) {
      ok(!(await d.one(`select has_function_privilege($1, $2, 'execute')`, [role, sig])), `G10: ${role} can execute ${sig}`);
    }
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    ok(!(await d.one(`select has_table_privilege($1, 'public.account_wallet', 'insert,update,delete,truncate')`, [role])), `G10: ${role} writes account_wallet`);
  }
  const inst = (await d.one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)')")).replace(/--[^\n]*/g, '');
  const iChar = inst.indexOf('perform public.hr_hunt_lock('), iPurse = inst.indexOf('perform public.hr_purse_lock(v_u)'), iMember = inst.indexOf('public.hr_hunt_apply_member(');
  ok(iChar > 0 && iPurse > iChar && iMember > iPurse, `G10: lock order in hr_hunt_apply_instance is characters ${iChar} -> purses ${iPurse} -> members ${iMember}`);
  const mv = (await d.one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)')"));
  ok(/v := public\.hr_purse_lock\(p_user\);[\s\S]*update public\.account_wallet/.test(mv), 'G10: hr_purse_move does not lock the purse before it moves it');

  // G9 RE-APPLY IS A NO-OP.
  const fp = JSON.stringify(await inventory(db));
  const purses = JSON.stringify(await d.q('select user_id::text, gold::text, version::text from public.account_wallet order by 1'));
  await d.as('');
  let again = null;
  try { await db.exec('begin;\n' + await migrationText(mutate) + '\ncommit;'); }
  catch (e) { again = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
  if (ok(again === null, 'G9: a second apply was refused: ' + again)) {
    ok(JSON.stringify(await inventory(db)) === fp, 'G9: a second apply changed the schema fingerprint');
    ok(JSON.stringify(await d.q('select user_id::text, gold::text, version::text from public.account_wallet order by 1')) === purses, 'G9: a second apply moved a purse');
  }
  await db.close?.();
}

/* A per-hero gold read or write in one body: aliases bound to player_state (a %rowtype variable, a FROM / JOIN
   alias, `with ps as (... from public.player_state ...)`) and then `<alias>.gold`, `select gold ... from
   public.player_state`, `update public.player_state set ... gold`, or `insert into public.player_state (... gold`. */
export function perHeroGold(src) {
  const code = String(src || '').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^']|'')*'/g, "''");
  const hits = [];
  const aliases = new Set();
  const PS = '(?:public\\.)?player_state';
  for (const m of code.matchAll(new RegExp('\\b(\\w+)\\s+' + PS + '%rowtype', 'gi'))) aliases.add(m[1].toLowerCase());
  for (const m of code.matchAll(new RegExp('\\b' + PS + '\\s+(?:as\\s+)?(\\w+)', 'gi'))) if (!/^(where|for|on|set|order|group|limit|left|join|inner|using|returning|values|in|is|and|or)$/i.test(m[1])) aliases.add(m[1].toLowerCase());
  for (const m of code.matchAll(new RegExp('\\bwith\\s+(\\w+)\\s+as\\s*\\(\\s*select[^)]*?from\\s+' + PS + '\\b', 'gi'))) aliases.add(m[1].toLowerCase());
  for (const a of aliases) for (const m of code.matchAll(new RegExp('\\b' + a + '\\.gold\\b(?!_)', 'gi'))) hits.push(m[0]);
  for (const m of code.matchAll(new RegExp('select\\s+gold\\b[^;]*?\\bfrom\\s+' + PS + '\\b', 'gi'))) hits.push(m[0].slice(0, 60));
  for (const m of code.matchAll(new RegExp('update\\s+' + PS + '\\b[^;]*?\\bset\\b[^;]*?\\bgold\\s*=', 'gi'))) hits.push(m[0].slice(0, 60));
  for (const m of code.matchAll(new RegExp('insert\\s+into\\s+' + PS + '\\s*\\([^)]*\\bgold\\b', 'gi'))) hits.push(m[0].slice(0, 60));
  for (const m of code.matchAll(/\(\s*select\s+gold\s+from\s+ps\s*\)/gi)) hits.push(m[0]);
  return hits;
}

// ── E1 / E2 (no database) ────────────────────────────────────────────────────
async function engineArms(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const MEM = await import(u('src/core/member.js'));
  const AR = await import(u('src/core/action-rules.js'));
  const HS = await import(u('supabase/functions/hr-accrue/hunt-settle.js'));
  const basics = { salted_shrimp: { kind: 'heal', price: 14, heals: 54, mana: 0, partner: 'cooked_shrimp' } };
  const side = (user, purse, floor = 0) => ({ mi: { user, key: user + ':x' }, hs: AR.newHuntSession({ purse, goldFloor: floor, basics, onEmpty: 'switch' }) });
  const tally = (hs) => { hs.tally = { bought: {}, covered: {} }; return hs; };
  const [a, b, c] = [side('u1', 100), side('u1', 100), side('u2', 100)];
  for (const s of [a, b, c]) tally(s.hs);
  MEM.sharePurses([a, b, c]);
  const got = AR.buyFromShop(a.hs, 'salted_shrimp', 6);   // 84 of the account's 100
  ok(got === 6 && b.hs.purse === 16, `E1: hero A bought ${got} for 84 of one purse; hero B sees ${b.hs.purse} (expected 16)`);
  ok(AR.buyFromShop(b.hs, 'salted_shrimp', 2) === 1 && b.hs.goldOut === true && a.hs.purse === 2, `E1: hero B overspent the shared purse (A sees ${a.hs.purse})`);
  b.hs.purse = b.hs.purse + 30;   // coins hero B looted
  ok(AR.buyFromShop(a.hs, 'salted_shrimp', 2) === 2 && a.hs.purse === 4, `E1: hero A cannot spend coins hero B looted (purse ${a.hs.purse})`);
  ok(c.hs.purse === 100 && AR.buyFromShop(c.hs, 'salted_shrimp', 1) === 1 && c.hs.purse === 86, `E1: another account's purse moved with this one's (${c.hs.purse})`);
  ok(HS.retryableSettle({ outcome: 'refused', reason: 'gold_short' }) === true
    && HS.retryableSettle({ outcome: 'refused', reason: 'end_not_proven', body: { detail: { detail: { reason: 'gold_out' } } } }) === true
    && HS.retryableSettle({ outcome: 'refused', reason: 'end_not_proven', body: { detail: { detail: { reason: 'stamina' } } } }) === false
    && HS.retryableSettle({ outcome: 'refused', reason: 'value_over' }) === false && HS.retryableSettle({ outcome: 'paid' }) === false,
  'E2: retryableSettle does not re-read exactly on a purse race (gold_short, gold_out not proven)');
}

async function run(mutate) {
  problems.length = 0;
  const m = mutate && MUTATIONS[mutate];
  if (mutate && !m) throw harness(`unknown mutation: ${mutate}`);
  const tree = await treeFor(mutate);
  try {
    await engineArms(tree.root);
    if (m && m.fold) { await foldArm(mutate); return [...problems]; }
    if (m && m.pins) { await pinsArm(mutate); return [...problems]; }
    if (!m || m.kind === 'sql' || m.kind === 'js') {
      const M = await HARNESS.loadEdge(tree.root);
      await chainArms(m && m.kind === 'sql' ? mutate : null, M);
    }
    if (!m) { await foldArm(null); await pinsArm(null); }
  } finally { await tree.done(); }
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id} (${m.kind})\n    ${m.why}`);
    process.exit(0);
  }
  const single = argv.find((x) => x.startsWith('--mutate='));
  if (argv.includes('--selftest') || single) {
    const ids = single ? [single.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${String(caught).slice(0, 220)}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `account-gold --selftest: ${slipped} mutation(s) SLIPPED` : `account-gold --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('account-gold: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('account-gold: one purse per account (G1-G11, E1-E2 green): folded exactly, shared by every hero, raced spends refused both orders, hunt races re-run on both doors, a party of one account pays after its coins, the floor holds, the ledger chain balances, no per-hero read survives, re-apply a no-op, ACL closed, the pins accept production\'s image and refuse any other');
  process.exit(0);
} catch (e) {
  console.error(`account-gold: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
