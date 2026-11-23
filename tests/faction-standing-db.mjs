#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/faction-standing-db.mjs — THE TWO FACTIONS ON THE REPLAYED CHAIN WITH THE SHIPPED ENGINE (supabase/migrations/2027-04-22-faction-
//   standing.sql, 2027-04-22-faction-catalogue.generated.sql; src/data/factions.js; Tyler 2026-11-14). No ground pays standing in the data
//   yet, so the arms that hunt write one catalogue row, the fixture ground (mill_cellar's) paying the first side. Since
//   1068-faction-company.sql (docs/design/redesign/25-factions.md) the side, the standing and the claims are the COMPANY's (the account's):
//   every arm reads the company tables, and the verbs' bodies at the chain end are that file's.
//
//   node tests/faction-standing-db.mjs            the guard
//   node tests/faction-standing-db.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-04-22-faction-standing.sql supabase/migrations/1068-faction-company.sql
//
//   FS-COMPANY one side a company: hero 1's Krell kill lets hero 0 join and hero 1 can't join again; both heroes' settled time sums into the
//             company's standing, each on its own day row; a piece hero 0 claims is the company's; the section lists only open pieces with
//             their server price; the DARK paid piece (opened for the arm) is priced at the company's TOP Level (src/data/factions.js
//             stockPrice equal), a quote at the pressing hero's Level is quote_changed, the buy takes exactly that gold, a second is piece_owned
//   FS-WORDS  every refusal by its code, as a signed-in player calls it, each moving nothing: joining before the server counted a Krell kill,
//             a side that is none, a second join; a swap with no side, to its own side, inside the week, twice; a finish with no swap or
//             short of the hours; a claim of nothing, or short of standing. No verb takes a number
//   FS-LOCK   the second press of one key, run as it runs after the lock it waited on (its first key read cut out), answers the first's
//             receipt and moves nothing
//   FS-BOTH   the settle credits standing with the browser closed (the tick) and with the hunt viewed (index.ts's settle): exactly the
//             hunting time the settle proved, the same on both doors, journalled as one row per day; a hero of the other side earns
//             nothing there, a hero swapping to it earns swap time and no standing
//   FS-END    a hunt that ends mid-window (the hero left) is credited to its end, not to the window's
//   FS-DAY    the credit split at UTC midnight, a day's ceiling held against a window counted twice, a swap filled to its need and no more
//   FS-TRIG   standing and days only rise and never move key; the journal is never edited or deleted
//   FS-GRANT  the five verbs (the swap's cancel, 2027-05-28-faction-swap-cancel.sql) are the client's and baselined, anon reaches none, no helper or table reaches a client; the one state section
//             is hr_faction_section, behind the `factions` switch (2027-04-23-faction-section.sql): off, it reads null and a verb refuses
//             feature_off; the one client module that names a verb is the client lane's src/session/faction-intents.js
//   FS-AGAIN  the three files applied a second time AT THEIR OWN CHAIN POSITION move nothing: every body, the settle, the catalogue rows;
//             and at the chain end the settle a later file left (2027-04-24-tower-climb.sql's floor_time splice) keeps every line of
//             this file's image in order and credits standing once (the body diff)
//   Every arm but FS-GRANT's off half runs with the `factions` switch on for everyone (runArm), as the Coordinator turns it on.
//
// TRUE CONCURRENCY is unverified here (PGlite is one backend): two presses of one hero are ordered by hr_hunt_lock (the migration's header).
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootReplay } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const FILES = ['2027-04-22-faction-catalogue.generated.sql', '2027-04-22-faction-standing.sql', '2027-04-23-faction-section.sql'];
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const [A, B, C] = H.UIDS;
const GROUND = 'mill_cellar';
const MIN = 60000;
const idem = () => crypto.randomUUID();
const harness = (m) => Object.assign(new Error(m), { harness: true });

/* As PostgREST calls it: the JWT subject, `set role authenticated`, a fresh rate counter. Each arm runs in one transaction; a call that
   raises answers { raised } (rolled back to its own savepoint), so a verb that errors instead of refusing by code is the arm's finding. */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.query('savepoint fs_call');
  await db.exec('set role authenticated');
  try { return await one(db, sql, params); }
  catch (e) { await db.query('rollback to savepoint fs_call'); return { ok: false, raised: String(e.message).split('\n')[0] }; }
  finally { await db.exec('reset role'); }
}
const join_ = (db, uid, side, key) => as(db, uid, 'select public.hr_faction_join(0, $1, $2::uuid)', [side, key || idem()]);
const start = (db, uid, side, key) => as(db, uid, 'select public.hr_faction_swap_start(0, $1, $2::uuid)', [side, key || idem()]);
const finish = (db, uid, key) => as(db, uid, 'select public.hr_faction_swap_finish(0, $1::uuid)', [key || idem()]);
const claim = (db, uid, piece, key) => as(db, uid, 'select public.hr_faction_outfit_claim(0, $1, $2::uuid)', [piece, key || idem()]);
const krell = (db, uid) => db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
  select $1, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now() from public.hr_faction_rule r where r.id
  on conflict (user_id, slot, kind, key, period_key) do update set value = 1`, [uid]);
const rows = async (db, uid) => ({
  members: Number(await one(db, 'select count(*) from public.hr_faction_companies where user_id = $1', [uid])),
  ledger: Number(await one(db, 'select count(*) from public.hr_faction_ledger where user_id = $1', [uid])),
  claims: Number(await one(db, 'select count(*) from public.hr_faction_company_claims where user_id = $1', [uid])),
});
const standing = async (db, uid) => Object.fromEntries((await q(db, 'select faction, ms from public.hr_faction_company_standing where user_id = $1', [uid])).map((r) => [r.faction, Number(r.ms)]));
const member = (db, uid, faction, extra = {}) => db.query(`insert into public.hr_faction_companies (user_id, faction, swap_to, swap_at, swap_ms)
  values ($1, $2, $3, case when $3::text is null then null else now() end, 0)`, [uid, faction, extra.swapTo || null]);

async function ctx(db) {
  const rule = (await q(db, 'select join_monster, swap_ms, cooldown_ms, day_cap_ms from public.hr_faction_rule where id'))[0];
  const sides = (await q(db, 'select faction_id from public.hr_factions order by ord')).map((r) => r.faction_id);
  const pieces = await q(db, 'select piece_id, faction, need_ms from public.hr_faction_outfits order by ord');
  if (!rule || sides.length !== 2 || !pieces.length) throw harness('the catalogue is not there: ' + JSON.stringify({ rule, sides }));
  return { rule: { ...rule, swap_ms: Number(rule.swap_ms), cooldown_ms: Number(rule.cooldown_ms), day_cap_ms: Number(rule.day_cap_ms) }, sides, pieces };
}

/* A hero on slot 0, made as the settle harness makes one. */
async function hero(db, M, uid) {
  await H.character(db, M, uid, { level: 25, inv: { cooked_shrimp: 30 }, gold: 100000 });
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'faction-standing-db') on conflict (user_id) do nothing`, [uid]);
}

const ARMS = {
  'FS-WORDS': async (db, M, X) => {
    const bad = [];
    const [a, b] = X.sides;
    await hero(db, M, A);
    await hero(db, M, C);
    /* no verb takes a number */
    for (const [fn, want] of [['hr_faction_join', 'p_slot integer, p_faction text, p_idem uuid'], ['hr_faction_swap_start', 'p_slot integer, p_faction text, p_idem uuid'],
      ['hr_faction_swap_finish', 'p_slot integer, p_idem uuid'], ['hr_faction_swap_cancel', 'p_slot integer, p_idem uuid'], ['hr_faction_outfit_claim', 'p_slot integer, p_piece text, p_idem uuid']]) {
      const got = await one(db, `select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
      if (got !== want) bad.push(`FS-WORDS ${fn} takes (${got})`);
    }
    let v = await join_(db, A, a);
    if (v.error !== 'join_locked' || Number(v.kills) !== 0 || v.monster !== X.rule.join_monster) bad.push('FS-WORDS a join before Krell answered ' + JSON.stringify(v));
    if ((await rows(db, A)).members || (await rows(db, A)).ledger) bad.push('FS-WORDS a refused join wrote a row');
    await krell(db, A);
    v = await join_(db, A, 'the_crown');
    if (v.error !== 'unknown_faction') bad.push('FS-WORDS a side that is none answered ' + JSON.stringify(v));
    v = await join_(db, A, a);
    if (v.ok !== true || v.faction.faction !== a || v.faction.can_join !== false || v.faction.swap !== null) bad.push('FS-WORDS the join answered ' + JSON.stringify(v));
    v = await join_(db, A, b);
    if (v.error !== 'already_joined') bad.push('FS-WORDS a second join answered ' + JSON.stringify(v));
    v = await finish(db, A);
    if (v.error !== 'no_swap') bad.push('FS-WORDS a finish with no swap answered ' + JSON.stringify(v));
    v = await start(db, A, a);
    if (v.error !== 'same_faction') bad.push('FS-WORDS a swap to its own side answered ' + JSON.stringify(v));
    v = await start(db, A, 'the_crown');
    if (v.error !== 'unknown_faction') bad.push('FS-WORDS a swap to no side answered ' + JSON.stringify(v));
    v = await start(db, A, b);
    const ready = await one(db, 'select $2::timestamptz = changed_at + make_interval(secs => $3::bigint / 1000.0) from public.hr_faction_companies where user_id = $1', [A, v.ready_at || null, X.rule.cooldown_ms]);
    if (v.error !== 'swap_cooldown' || ready !== true) bad.push('FS-WORDS a swap inside the week answered ' + JSON.stringify(v) + ', want ready_at a week after its join');
    await db.query('update public.hr_faction_companies set changed_at = changed_at - make_interval(secs => $2::bigint / 1000.0 + 1) where user_id = $1', [A, X.rule.cooldown_ms]);
    v = await start(db, A, b);
    if (v.ok !== true || !v.faction.swap || v.faction.swap.to !== b || Number(v.faction.swap.ms) !== 0) bad.push('FS-WORDS the swap start answered ' + JSON.stringify(v));
    v = await start(db, A, b);
    if (v.error !== 'swap_open') bad.push('FS-WORDS a second swap answered ' + JSON.stringify(v));
    v = await finish(db, A);
    if (v.error !== 'swap_short' || Number(v.need_ms) !== X.rule.swap_ms || Number(v.have_ms) !== 0) bad.push('FS-WORDS a finish short answered ' + JSON.stringify(v));
    v = await claim(db, A, 'zz_nothing');
    if (v.error !== 'unknown_piece') bad.push('FS-WORDS a piece that is none answered ' + JSON.stringify(v));
    const p = X.pieces.find((x) => x.faction === a);
    v = await claim(db, A, p.piece_id);
    if (v.error !== 'standing_short' || Number(v.need_ms) !== Number(p.need_ms) || Number(v.have_ms) !== 0) bad.push('FS-WORDS a claim short answered ' + JSON.stringify(v));
    if ((await rows(db, A)).claims) bad.push('FS-WORDS a refused claim held a piece');
    /* the earned claim, once */
    await db.query(`insert into public.hr_faction_company_standing (user_id, faction, ms) values ($1, $2, $3)`, [A, a, Number(p.need_ms)]);
    v = await claim(db, A, p.piece_id);
    if (v.ok !== true || !v.faction.pieces.find((x) => x.id === p.piece_id && x.held === true)) bad.push('FS-WORDS the earned claim answered ' + JSON.stringify(v));
    v = await claim(db, A, p.piece_id);
    if (v.error !== 'piece_owned') bad.push('FS-WORDS a second claim answered ' + JSON.stringify(v));
    /* a hero of no side */
    for (const [name, call] of [['a swap', () => start(db, C, b)], ['a finish', () => finish(db, C)]]) {
      v = await call();
      if (v.error !== 'not_member') bad.push(`FS-WORDS ${name} by a hero of no side answered ` + JSON.stringify(v));
    }
    const kinds = (await q(db, 'select kind from public.hr_faction_ledger where user_id = $1 order by id', [A])).map((r) => r.kind).join();
    if (kinds !== 'join,swap_start,claim') bad.push('FS-WORDS the journal reads ' + kinds);
    return bad;
  },

  /* THE COMPANY (1068-faction-company.sql, 25-factions.md 2.1 to 2.4): one side, one standing and one quartermaster for every hero */
  'FS-COMPANY': async (db, M, X) => {
    const bad = [];
    const [a, b] = X.sides;
    await hero(db, M, A);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [A]);
    const two = await one(db, 'select public.hr_create_character(1)');
    if (!two || two.ok !== true) return ['FS-COMPANY harness: the second hero was refused ' + JSON.stringify(two)];
    await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level(90) where user_id = $1 and slot = 1', [A]);
    /* hero 1's Krell kill opens joining for hero 0; the side is the company's */
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
      select $1, 1, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now() from public.hr_faction_rule r where r.id`, [A]);
    let v = await join_(db, A, a);
    if (v.ok !== true || v.faction.faction !== a) bad.push('FS-COMPANY hero 1\'s Krell kill did not let hero 0 join: ' + JSON.stringify(v));
    v = await as(db, A, 'select public.hr_faction_join(1, $1, $2::uuid)', [b, idem()]);
    if (v.error !== 'already_joined') bad.push('FS-COMPANY hero 1 joined a second side: ' + JSON.stringify(v));
    /* both heroes' settled time sums into the company's standing, each clamped on its own day row */
    await db.query(`insert into public.hr_faction_grounds (hunt_id, faction) values ('zz_a', $1)`, [a]);
    const credit = (slot, from, to) => one(db, 'select public.hr_faction_credit($1::uuid, $2, \'zz_a\', $3::timestamptz, $4::timestamptz)', [A, slot, from, to]);
    await credit(0, '2026-11-03T00:00:00Z', '2026-11-03T02:00:00Z');
    await credit(1, '2026-11-03T00:00:00Z', '2026-11-03T03:00:00Z');
    const st = await standing(db, A);
    const days = (await q(db, 'select slot, ms from public.hr_faction_days where user_id = $1 order by slot', [A])).map((r) => [r.slot, Number(r.ms)]);
    if (st[a] !== 5 * 60 * MIN || JSON.stringify(days) !== JSON.stringify([[0, 2 * 60 * MIN], [1, 3 * 60 * MIN]])) bad.push(`FS-COMPANY two heroes credited ${JSON.stringify({ st, days })}, want 5 h to the company and each hero its own day`);
    /* a piece claimed by hero 0 is the company's: hero 1 can't claim it again, and the section shows it held on both */
    const p = X.pieces.find((x) => x.faction === a);
    await db.query('update public.hr_faction_company_standing set ms = greatest(ms, $2) where user_id = $1 and faction = $3', [A, Number(p.need_ms), a]);
    v = await claim(db, A, p.piece_id);
    if (v.ok !== true) bad.push('FS-COMPANY the claim answered ' + JSON.stringify(v));
    v = await as(db, A, 'select public.hr_faction_outfit_claim(1, $1, $2::uuid)', [p.piece_id, idem()]);
    if (v.error !== 'piece_owned') bad.push('FS-COMPANY hero 1 claimed the company\'s piece again: ' + JSON.stringify(v));
    const held1 = await one(db, 'select public.hr_faction_view($1::uuid, 1)', [A]);
    if (!held1.pieces.find((x) => x.id === p.piece_id && x.held === true) || held1.faction !== a) bad.push('FS-COMPANY hero 1 does not see the company\'s piece or side: ' + JSON.stringify(held1).slice(0, 200));
    /* the quartermaster lists only open pieces, each with its server price (a free piece 0) */
    if (held1.pieces.some((x) => x.price !== 0) || held1.pieces.length !== Number(await one(db, 'select count(*) from public.hr_faction_stock where open'))) bad.push('FS-COMPANY the section lists ' + JSON.stringify(held1.pieces).slice(0, 200));
    /* THE PAID PIECE (dark: no client role), opened for the arm: priced at the company's TOP Level, not the pressing hero's */
    const paid = (await q(db, 'select piece_id, faction, need_ms from public.hr_faction_stock where wage_hours_pm is not null and faction = $1 order by need_ms limit 1', [a]))[0];
    await db.query('update public.hr_faction_stock set open = true where piece_id = $1', [paid.piece_id]);
    await db.query('update public.hr_faction_company_standing set ms = greatest(ms, $2) where user_id = $1 and faction = $3', [A, Number(paid.need_ms), a]);
    const top = Number(await one(db, 'select public.hr_level_of($1::uuid, 1)', [A])), low = Number(await one(db, 'select public.hr_level_of($1::uuid, 0)', [A]));
    const price = Number(await one(db, 'select public.hr_faction_piece_price($1, $2)', [paid.piece_id, top]));
    const lowPrice = Number(await one(db, 'select public.hr_faction_piece_price($1, $2)', [paid.piece_id, low]));
    if (!(top > low) || !(price > lowPrice)) return [...bad, `FS-COMPANY harness: the heroes' Levels ${low}/${top} price ${lowPrice}/${price}`];
    const { stockPrice } = await import(pathToFileURL(join(ROOT, 'src/data/factions.js')).href);
    if (stockPrice(paid.piece_id, top) !== price) bad.push(`FS-COMPANY the server prices ${paid.piece_id} at Level ${top} at ${price}, src/data/factions.js at ${stockPrice(paid.piece_id, top)}`);
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [A, price + 500]);
    const buy = async (slot, gold) => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [A]);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [A]);
      await db.query('savepoint fs_buy');
      try { return await one(db, 'select public.hr_faction_buy($1, $2, $3, $4::uuid)', [slot, paid.piece_id, gold, idem()]); }
      catch (e) { await db.query('rollback to savepoint fs_buy'); return { ok: false, raised: String(e.message).split('\n')[0] }; }
    };
    v = await buy(0, lowPrice);
    if (v.error !== 'quote_changed' || Number(v.price) !== price) bad.push('FS-COMPANY a buy at the pressing hero\'s Level answered ' + JSON.stringify(v).slice(0, 160));
    v = await buy(0, price);
    const purse = Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [A]));
    if (v.ok !== true || purse !== 500) bad.push(`FS-COMPANY the buy answered ${JSON.stringify(v).slice(0, 160)} and left ${purse} gold, want 500`);
    v = await buy(1, price);
    if (v.error !== 'piece_owned' || Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [A])) !== 500) bad.push('FS-COMPANY a second buy answered ' + JSON.stringify(v).slice(0, 160));
    const dark = await one(db, `select has_function_privilege('authenticated', 'public.hr_faction_buy(integer,text,bigint,uuid)', 'execute')`);
    if (dark !== false) bad.push('FS-COMPANY hr_faction_buy is not dark');
    return bad;
  },

  'FS-LOCK': async (db, M, X) => {
    const bad = [];
    await hero(db, M, A);
    await krell(db, A);
    const k = idem();
    const first = await join_(db, A, X.sides[0], k);
    if (first.ok !== true) return ['FS-LOCK harness: the join answered ' + JSON.stringify(first)];
    /* the live body with its FIRST key read (the one before the lock) cut out */
    const READ = '  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);\n  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n';
    const def = String(await one(db, `select pg_get_functiondef('public.hr_faction_join(integer,text,uuid)'::regprocedure)`)).replace(/\r/g, '');
    if (def.split(READ).length !== 2) return ['FS-LOCK harness: hr_faction_join has no single key read before its lock'];
    await db.exec(def.replace('FUNCTION public.hr_faction_join(', 'FUNCTION public.hr__fj_after(').replace(READ, ''));
    await db.exec('grant execute on function public.hr__fj_after(integer, text, uuid) to authenticated');
    const again = await as(db, A, 'select public.hr__fj_after(0, $1, $2::uuid)', [X.sides[0], k]);
    const r = await rows(db, A);
    if (again.ok !== true || JSON.stringify(again) !== JSON.stringify(first) || r.members !== 1 || r.ledger !== 1) {
      bad.push('FS-LOCK the second press after the lock answered ' + JSON.stringify(again).slice(0, 160) + ' and left ' + JSON.stringify(r));
    }
    return bad;
  },

  'FS-BOTH': async (db, M, X) => {
    const bad = [];
    const [a, b] = X.sides;
    const got = {};
    for (const door of ['fire', 'viewed']) {
      for (const who of ['own', 'other', 'swap']) {
        await db.query('savepoint fs_door');
        await db.query(`insert into public.hr_faction_grounds (hunt_id, faction) values ($1, $2) on conflict (hunt_id) do update set faction = excluded.faction`, [GROUND, a]);
        const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 25 });
        if (who === 'own') await member(db, A, a);
        if (who === 'other') await member(db, A, b);
        if (who === 'swap') await member(db, A, b, { swapTo: a });
        const cuts = H.ticksOf(60000, 20 * MIN)(h.from);
        for (const t of cuts) {
          if (door === 'fire') await H.settleTo(db, M, t);
          else {
            const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: A, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: t, minWindowMs: 0, grounds: H.groundsOf(M) });
            if (v.outcome !== 'paid') { bad.push(`FS-BOTH viewed settled nothing: ${JSON.stringify({ o: v.outcome, r: v.reason }).slice(0, 200)}`); break; }
          }
        }
        const s = (await q(db, 'select hunt_from, settled_to, ended_at from public.hunt_sessions where id = $1', [h.sid]))[0];
        const hunted = Date.parse(s.settled_to) - Date.parse(s.hunt_from);
        if (hunted < 19 * MIN) bad.push(`FS-BOTH ${door} ${who}: the settle covered ${hunted} ms, the arm meant 20 minutes (ended ${s.ended_at})`);
        const st = await standing(db, A);
        const sw = Number(await one(db, 'select swap_ms from public.hr_faction_companies where user_id = $1', [A]));
        const days = (await q(db, 'select faction, ms, swap_ms from public.hr_faction_days where user_id = $1 order by day, faction', [A])).map((r) => [r.faction, Number(r.ms), Number(r.swap_ms)]);
        if (who === 'own' && (st[a] !== hunted || st[b] || sw !== 0)) bad.push(`FS-BOTH ${door}: its own side's ground credited ${JSON.stringify(st)}, swap ${sw}, for ${hunted} ms hunted`);
        if (who === 'other' && (Object.keys(st).length || sw !== 0 || days.length)) bad.push(`FS-BOTH ${door}: the other side's ground credited ${JSON.stringify({ st, sw, days })}`);
        if (who === 'swap' && (Object.keys(st).length || sw !== Math.min(hunted, X.rule.swap_ms))) bad.push(`FS-BOTH ${door}: the swap's ground credited standing ${JSON.stringify(st)}, swap ${sw}, for ${hunted} ms hunted`);
        const dayMs = days.reduce((n, d) => n + d[1] + d[2], 0);
        if (who !== 'other' && (dayMs !== hunted || days.length > 2)) bad.push(`FS-BOTH ${door} ${who}: the day rows read ${JSON.stringify(days)} for ${hunted} ms`);
        got[door + ':' + who] = JSON.stringify({ st, sw, hunted });
        await db.query('rollback to savepoint fs_door');
      }
    }
    for (const who of ['own', 'other', 'swap']) if (got['fire:' + who] !== got['viewed:' + who]) bad.push(`FS-BOTH ${who}: the closed browser credited ${got['fire:' + who]}, the viewed hunt ${got['viewed:' + who]}`);
    return bad;
  },

  'FS-END': async (db, M, X) => {
    await db.query(`insert into public.hr_faction_grounds (hunt_id, faction) values ($1, $2) on conflict (hunt_id) do update set faction = excluded.faction`, [GROUND, X.sides[0]]);
    const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 25 });
    await member(db, A, X.sides[0]);
    await db.query(`update public.hunt_sessions set leave_at = hunt_from + interval '7 minutes 30 seconds' where id = $1`, [h.sid]);
    for (const t of H.ticksOf(60000, 12 * MIN)(h.from)) await H.settleTo(db, M, t);
    const s = (await q(db, 'select hunt_from, ended_at, end_reason from public.hunt_sessions where id = $1', [h.sid]))[0];
    if (s.end_reason !== 'left') return [`FS-END harness: the hunt ended ${s.end_reason} at ${s.ended_at}, not by its leave`];
    const want = Date.parse(s.ended_at) - Date.parse(s.hunt_from);
    const st = await standing(db, A);
    return st[X.sides[0]] === want && want === 7.5 * MIN ? [] : [`FS-END a hunt that left at 7m30s was credited ${JSON.stringify(st)}, want ${want}`];
  },

  'FS-DAY': async (db, M, X) => {
    const bad = [];
    const [a, b] = X.sides;
    await hero(db, M, A);
    await member(db, A, a, { swapTo: b });
    await db.query(`insert into public.hr_faction_grounds (hunt_id, faction) values ('zz_a', $1), ('zz_b', $2)`, [a, b]);
    const credit = (hunt, from, to) => one(db, 'select public.hr_faction_credit($1::uuid, 0, $2, $3::timestamptz, $4::timestamptz)', [A, hunt, from, to]);
    const day = (iso) => q(db, 'select faction, ms, swap_ms from public.hr_faction_days where user_id = $1 and day = $2::date', [A, iso]);
    /* across midnight: two days, each its own part */
    let v = await credit('zz_a', '2026-11-01T23:50:00Z', '2026-11-02T00:20:00Z');
    const d1 = await day('2026-11-01'), d2 = await day('2026-11-02');
    if (Number(v.ms) !== 30 * MIN || d1.length !== 1 || Number(d1[0].ms) !== 10 * MIN || d2.length !== 1 || Number(d2[0].ms) !== 20 * MIN) bad.push(`FS-DAY a window across midnight booked ${JSON.stringify({ v, d1, d2 })}`);
    /* the day's ceiling, against a window counted twice */
    await credit('zz_a', '2026-11-05T00:00:00Z', '2026-11-05T20:00:00Z');
    await credit('zz_a', '2026-11-05T04:00:00Z', '2026-11-05T23:59:59Z');
    const d5 = (await day('2026-11-05')).reduce((n, r) => n + Number(r.ms) + Number(r.swap_ms), 0);
    if (d5 !== Math.min(X.rule.day_cap_ms, 20 * 60 * MIN + 20 * 60 * MIN - 1000)) bad.push(`FS-DAY a day counted twice credited ${d5} ms, its ceiling ${X.rule.day_cap_ms}`);
    const all = (await standing(db, A))[a], sum = Number(await one(db, 'select sum(ms) from public.hr_faction_days where user_id = $1 and faction = $2', [A, a]));
    if (all !== sum) bad.push(`FS-DAY the standing (${all}) is not its days' sum (${sum})`);
    /* the swap fills to its need and no further, and pays no standing */
    v = await credit('zz_b', '2026-11-07T00:00:00Z', new Date(Date.parse('2026-11-07T00:00:00Z') + X.rule.swap_ms + 30 * MIN).toISOString());
    const sw = Number(await one(db, 'select swap_ms from public.hr_faction_companies where user_id = $1', [A]));
    if (Number(v.ms) !== X.rule.swap_ms || sw !== X.rule.swap_ms || (await standing(db, A))[b]) bad.push(`FS-DAY the swap's ground credited ${JSON.stringify(v)}, swap ${sw}, want ${X.rule.swap_ms} and no standing`);
    /* a ground of no side, and a window of nothing */
    if (await credit('zz_none', '2026-11-08T00:00:00Z', '2026-11-08T01:00:00Z') !== null) bad.push('FS-DAY a ground of no side paid');
    if (await credit('zz_a', '2026-11-08T01:00:00Z', '2026-11-08T01:00:00Z') !== null) bad.push('FS-DAY an empty window paid');
    return bad;
  },

  'FS-TRIG': async (db, M, X) => {
    const bad = [];
    await hero(db, M, A);
    await db.query(`insert into public.hr_faction_company_standing (user_id, faction, ms) values ($1, $2, 1000)`, [A, X.sides[0]]);
    await db.query(`insert into public.hr_faction_days (user_id, slot, day, faction, ms) values ($1, 0, '2026-11-01', $2, 1000)`, [A, X.sides[0]]);
    await db.query(`insert into public.hr_faction_ledger (user_id, slot, kind, faction, idem) values ($1, 0, 'join', $2, $3)`, [A, X.sides[0], idem()]);
    const refused = async (what, sql) => {
      await db.query('savepoint fs_trig');
      let threw = false;
      try { await db.query(sql, [A]); } catch { threw = true; }
      await db.query('rollback to savepoint fs_trig');
      if (!threw) bad.push('FS-TRIG ' + what + ' went through');
    };
    await refused('a standing lowered', 'update public.hr_faction_company_standing set ms = ms - 1 where user_id = $1');
    await refused('a standing moved to the other side', `update public.hr_faction_company_standing set faction = '${X.sides[1]}' where user_id = $1`);
    await refused('a day lowered', 'update public.hr_faction_days set ms = 0 where user_id = $1');
    await refused('a day moved', `update public.hr_faction_days set day = '2026-11-02' where user_id = $1`);
    await refused('a journal row edited', `update public.hr_faction_ledger set kind = 'claim' where user_id = $1`);
    await refused('a journal row deleted', 'delete from public.hr_faction_ledger where user_id = $1');
    await db.query('update public.hr_faction_company_standing set ms = ms + 5 where user_id = $1', [A]).catch((e) => bad.push('FS-TRIG a raise was refused: ' + e.message));
    return bad;
  },

  'FS-GRANT': async (db, M, X) => {
    const bad = [];
    const verbs = ['hr_faction_join(integer,text,uuid)', 'hr_faction_swap_start(integer,text,uuid)', 'hr_faction_swap_finish(integer,uuid)', 'hr_faction_swap_cancel(integer,uuid)', 'hr_faction_outfit_claim(integer,text,uuid)'];
    for (const f of verbs) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') an, has_function_privilege('authenticated', $1, 'execute') au,
        exists (select 1 from public.hr_client_rpc_baseline b where b.grantee = 'authenticated' and b.proname = split_part($2, '(', 1)) base`, ['public.' + f, f]);
      if (r.an || !r.au || !r.base) bad.push(`FS-GRANT ${f}: anon ${r.an}, authenticated ${r.au}, baselined ${r.base}`);
    }
    const helpers = await q(db, `select p.oid::regprocedure::text f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_faction\\_%'
      and p.proname not in ('hr_faction_join', 'hr_faction_swap_start', 'hr_faction_swap_finish', 'hr_faction_swap_cancel', 'hr_faction_outfit_claim')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    for (const h of helpers) bad.push('FS-GRANT a client role reaches ' + h.f);
    const n = Number(await one(db, `select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_faction\\_%'`));
    if (n < 10) bad.push(`FS-GRANT the read found ${n} faction functions: the search broke`);
    const tables = await q(db, `select c.relname t, c.relrowsecurity rls,
        has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate') au, has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate') an,
        exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) pol
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'hr\\_faction%'`);
    if (tables.length !== 10) bad.push(`FS-GRANT ${tables.length} faction tables, want 10`);
    for (const t of tables) if (!t.rls || t.au || t.an || t.pol) bad.push(`FS-GRANT ${t.t}: rls ${t.rls}, authenticated ${t.au}, anon ${t.an}, policy ${t.pol}`);
    const hyg = await one(db, 'select public.hr_assert_grant_hygiene(false)');
    if (hyg && Array.isArray(hyg.ungated_client_rpcs) && hyg.ungated_client_rpcs.some((x) => /hr_faction/.test(x))) bad.push('FS-GRANT a verb is ungated: ' + hyg.ungated_client_rpcs);
    /* BEHIND THE SWITCH: one section, hr_faction_section; with the switch off for the account it reads null and the door refuses */
    const secs = (await q(db, `select key, fn from public.hr_state_sections where fn like 'hr\\_faction%'`)).map((r) => r.key + ':' + r.fn);
    if (secs.join() !== 'factions:hr_faction_section') bad.push('FS-GRANT the faction sections are ' + JSON.stringify(secs));
    await hero(db, M, A);
    await krell(db, A);
    await db.query("update public.hr_feature_switches set scope = 'off' where switch_id = 'factions'");
    const off = await one(db, 'select public.hr_faction_section($1::uuid, 0)', [A]);
    const shut = await join_(db, A, X.sides[0]);
    if (off !== null || shut.error !== 'feature_off' || (await rows(db, A)).members) bad.push('FS-GRANT with the switch off the section reads ' + JSON.stringify(off) + ' and a join answers ' + JSON.stringify(shut));
    const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
    const callers = walk(join(ROOT, 'src')).filter((f) => /hr_faction_(join|swap_start|swap_finish|outfit_claim|view)\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1).split('\\').join('/'));
    if (callers.join() !== 'src/session/faction-intents.js') bad.push('FS-GRANT the client modules naming a faction verb are ' + JSON.stringify(callers) + ', want the client lane\'s one');
    return bad;
  },

  /* FS-AGAIN, TWO LEGS (lane/c-tower-paydown, 2026-11-16). 2027-04-24-tower-climb.sql splices its `floor_time` arm into the settle this file
     restates whole, so over the WHOLE chain this file's §0 pin refuses a second apply, by design: its whole restatement would erase that arm.
     (1) AT THE FILES' OWN CHAIN POSITION (market-v2 M0's move): "are the three files idempotent" is asked where they are the chain end, a
         second database replayed up to the last of them; a second apply there moves nothing, as before.
     (2) AT THE CHAIN END, THE BODY DIFF: the settle any later file left is still this file's image, every line of it kept and in order (a
         later file may only add lines), and it credits standing exactly once. A later restatement from a stale template, or one that drops
         this file's credit, is red here, not only at the next re-apply. */
  'FS-AGAIN': async (db, M, X, mutant) => {
    const bad = [];
    const settleDef = async (d) => String(await one(d, `select pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure)`)).replace(/\r/g, '');
    const { db: own } = await bootReplay({ upTo: FILES[FILES.length - 1] });
    let mine;
    try {
      /* the factions open, as runArm opens them on the chain end (a re-apply must keep the Coordinator's flip) */
      await own.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions'");
      mine = await settleDef(own);
      bad.push(...await againAt(own, mutant));
    } finally { await own.close().catch(() => {}); }
    const end = await settleDef(db);
    const endLines = end.split('\n');
    let at = 0;
    for (const line of mine.split('\n')) {
      const i = endLines.indexOf(line, at);
      if (i < 0) { bad.push('FS-AGAIN the settle at the chain end is not this file\'s image plus a later file\'s lines: it lost, or moved, ' + JSON.stringify(line.trim()).slice(0, 140)); break; }
      at = i + 1;
    }
    const credits = end.split('perform public.hr_faction_credit(').length - 1;
    if (credits !== 1) bad.push(`FS-AGAIN the settle at the chain end credits standing ${credits} times (want once)`);
    return bad;
  },
};

/* A second apply of the three files over `db` (a mutant's file text edited for it): byte-identical, or what moved. */
async function againAt(db, mutant) {
  const image = () => one(db, `select jsonb_build_object(
      'defs', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''))
                 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'hr\\_faction\\_%' or p.proname = 'hr_hunt_settle_session')),
      'rows', (select jsonb_build_object('f', jsonb_agg(f order by f.faction_id)) from public.hr_factions f) ||
              (select jsonb_build_object('r', jsonb_agg(r)) from public.hr_faction_rule r) ||
              (select jsonb_build_object('o', jsonb_agg(o order by o.piece_id)) from public.hr_faction_outfits o) ||
              (select jsonb_build_object('g', coalesce(jsonb_agg(g order by g.hunt_id), '[]'::jsonb)) from public.hr_faction_grounds g) ||
              (select jsonb_build_object('sw', jsonb_agg(jsonb_build_array(w.scope, w.accounts, w.note))) from public.hr_feature_switches w where w.switch_id = 'factions') ||
              (select jsonb_build_object('sec', jsonb_agg(jsonb_build_array(x.key, x.fn))) from public.hr_state_sections x where x.key = 'factions'),
      'base', (select jsonb_agg(jsonb_build_array(b.proname, b.identity_args, b.grantee, b.note) order by b.proname) from public.hr_client_rpc_baseline b where b.proname like 'hr\\_faction\\_%'))`);
  const before = await image();
  for (const f of FILES) {
    let sql = MIG(f);
    if (mutant && mutant.sql && mutant.sql[0] === f) sql = sql.replace(mutant.sql[1], mutant.sql[2]);
    try { await db.exec(sql); } catch (e) { return [`FS-AGAIN a second apply of ${f} RAISED: ${String(e.message).split('\n')[0]}`]; }
  }
  const after = await image();
  return JSON.stringify(after) === JSON.stringify(before) ? [] : ['FS-AGAIN a second apply moved ' + Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).join(', ')];
}

/* ── THE PLANTED DEFECTS: a live body edited (fn, find, replace), a statement run (ddl), or a file's text edited for its re-apply (sql). ── */
const JOIN = 'public.hr_faction_join(integer,text,uuid)', START = 'public.hr_faction_swap_start(integer,text,uuid)';
const FIN = 'public.hr_faction_swap_finish(integer,uuid)', CLAIM = 'public.hr_faction_outfit_claim(integer,text,uuid)';
const BUY = 'public.hr_faction_buy(integer,text,bigint,uuid)';
const CREDIT = 'public.hr_faction_credit(uuid,integer,text,timestamp with time zone,timestamp with time zone)';
const LOCKED = 'public.hr_faction_locked(text,uuid,integer,uuid,text)', SETTLE = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)';
export const MUTANTS = {
  krell_skipped: { arm: 'FS-WORDS', why: 'a hero joins before the server counted a Krell kill', db: [JOIN, '  if v_kills < 1 then\n', '  if false then\n'] },
  cooldown_off: { arm: 'FS-WORDS', why: 'a swap starts inside the week', db: [START, '  if now() < v_ready then\n', '  if false then\n'] },
  finish_free: { arm: 'FS-WORDS', why: 'a swap finishes short of its hours', db: [FIN, '  if m.swap_ms < v_need then\n', '  if false then\n'] },
  claim_free: { arm: 'FS-WORDS', why: 'a piece is claimed short of standing', db: [CLAIM, '  if v_have < o.need_ms then\n', '  if false then\n'] },
  claim_twice: { arm: 'FS-WORDS', why: 'a piece is claimed twice', db: [CLAIM, "and c.piece_id = p_piece) then\n", "and c.piece_id = p_piece and false) then\n"] },
  company_krell_own: { arm: 'FS-COMPANY', why: 'only the pressing hero\'s Krell kill opens joining',
    db: [JOIN, 'from public.player_state ps where ps.user_id = v_uid;', 'from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;'] },
  company_claims_per_hero: { arm: 'FS-COMPANY', why: 'a hero claims the company\'s piece again',
    db: [CLAIM, 'c.user_id = v_uid and c.piece_id = p_piece) then', 'c.user_id = v_uid and c.slot = p_slot and c.piece_id = p_piece) then'] },
  buy_at_presser: { arm: 'FS-COMPANY', why: 'a paid piece is priced at the pressing hero\'s Level',
    db: [BUY, '  v_top := public.hr_faction_top_level(v_uid);\n', '  v_top := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));\n'] },
  buy_takes_any_price: { arm: 'FS-COMPANY', why: 'a buy takes the caller\'s price', db: [BUY, '  if v_price is distinct from p_price then\n', '  v_price := p_price;\n  if false then\n'] },
  buy_twice: { arm: 'FS-COMPANY', why: 'a company buys a piece twice', db: [BUY, 'c.user_id = v_uid and c.piece_id = p_piece) then', 'c.user_id = v_uid and c.piece_id = p_piece and false) then'] },
  view_closed: { arm: 'FS-COMPANY', why: 'the section lists closed pieces', db: ['public.hr_faction_view(uuid,integer)', 'from public.hr_faction_stock o where o.open));', 'from public.hr_faction_stock o));'] },
  joined_twice: { arm: 'FS-WORDS', why: 'a joined hero joins again', db: [JOIN, 'where m.user_id = v_uid) then', 'where m.user_id = v_uid and false) then'] },
  no_key_under_lock: { arm: 'FS-LOCK', why: 'the key is not read again under the lock',
    db: [LOCKED, '  v_r := public.hr_intent_replay(p_uid, p_slot, p_idem, p_intent);\n  if v_r is not null then return public.hr_note_rejection(p_verb, p_slot, v_r); end if;\n', ''] },
  settle_unspliced: { arm: 'FS-BOTH', why: 'the settle credits nothing', db: [SETTLE, '  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));\n', ''] },
  other_side_pays: { arm: 'FS-BOTH', why: 'a hero of the other side earns standing on this side\'s ground', db: [CREDIT, '  else return null; end if;\n', '  else v_swap := false; end if;\n'] },
  swap_pays_standing: { arm: 'FS-BOTH', why: 'a swapping hero earns standing on the new side', db: [CREDIT, '  elsif m.swap_to = v_side then v_swap := true;\n', '  elsif m.swap_to = v_side then v_swap := false;\n'] },
  credit_to_window: { arm: 'FS-END', why: 'a hunt that ended mid-window is credited to the window\'s end', db: [SETTLE, 'v_s.settled_to, coalesce(v_end_at, v_to));', 'v_s.settled_to, v_to);'] },
  no_day_split: { arm: 'FS-DAY', why: 'a window across midnight books one day', db: [CREDIT, "    v_b := least(p_to, (v_day + 1)::timestamp at time zone 'UTC');\n", '    v_b := p_to;\n'] },
  no_day_cap: { arm: 'FS-DAY', why: 'a day passes its ceiling', db: [CREDIT, 'r.day_cap_ms - v_used,', 'r.day_cap_ms,'] },
  swap_uncapped: { arm: 'FS-DAY', why: 'a swap fills past its need', db: [CREDIT, 'coalesce(v_room - v_total, v_ms)', 'v_ms'] },
  raise_only_off: { arm: 'FS-TRIG', why: 'a standing can be lowered', ddl: 'drop trigger hr_faction_company_standing_raise_only on public.hr_faction_company_standing' },
  ledger_mutable: { arm: 'FS-TRIG', why: 'the journal can be edited', ddl: 'drop trigger hr_faction_ledger_immutable on public.hr_faction_ledger' },
  verb_to_anon: { arm: 'FS-GRANT', why: 'anon can join', ddl: 'grant execute on function public.hr_faction_join(integer, text, uuid) to anon' },
  helper_open: { arm: 'FS-GRANT', why: 'a client can credit standing', ddl: 'grant execute on function public.hr_faction_credit(uuid, integer, text, timestamptz, timestamptz) to authenticated' },
  table_open: { arm: 'FS-GRANT', why: 'a client can read and write standing', ddl: 'grant select, update on public.hr_faction_company_standing to authenticated' },
  unbaselined: { arm: 'FS-GRANT', why: 'a verb is not on the client baseline', ddl: "delete from public.hr_client_rpc_baseline where proname = 'hr_faction_swap_finish'" },
  door_open: { arm: 'FS-GRANT', why: 'a verb runs with the switch off', db: [LOCKED, "  if not public.hr_feature_on('factions', p_uid) then\n", '  if false then\n'] },
  section_unswitched: { arm: 'FS-GRANT', why: 'the section shows with the switch off',
    db: ['public.hr_faction_section(uuid,integer)', "  if not public.hr_feature_on('factions', p_user) then return null; end if;\n", ''] },
  switch_reverted: { arm: 'FS-AGAIN', why: 'a second apply turns the Coordinator\'s switch back off',
    sql: ['2027-04-23-faction-section.sql', '  on conflict (switch_id) do nothing;', "  on conflict (switch_id) do update set scope = 'off';"] },
  repin_lost: { arm: 'FS-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image',
    sql: ['2027-04-22-faction-standing.sql', /and v_md5 is distinct from '[0-9a-f]{32}' then/, "and v_md5 is distinct from '00000000000000000000000000000000' then"] },
  stale_template: { arm: 'FS-AGAIN', why: 'the settle is restated from a template that lost another file\'s line',
    sql: ['2027-04-22-faction-standing.sql', "      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)\n", ''] },
  /* the chain end's leg: a LATER file's settle (2027-04-24-tower-climb.sql splices it today) */
  later_lost_line: { arm: 'FS-AGAIN', why: 'a later file restates the settle from a template that lost one of this file\'s lines',
    db: [SETTLE, "      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)\n", ''] },
  later_credits_twice: { arm: 'FS-AGAIN', why: 'a later file\'s settle credits standing twice',
    db: [SETTLE, '  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));\n',
      '  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));\n  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));\n'] },
};

async function plant(db, m) {
  if (m.ddl) return db.exec(m.ddl);
  if (!m.db) return null;
  const [sig, find, repl] = m.db;
  const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [sig])).replace(/\r/g, '');
  if (def.split(find).length !== 2) throw harness(`the mutant's line is not in ${sig} exactly once: ${find.slice(0, 80)}`);
  return db.exec(def.replace(find, () => repl));
}

async function runArm(name, M, mutant) {
  /* FS-AGAIN judges the chain as of this lane's own last file (the form of boss-hall-db HD-AGAIN and boss-call-db BD-AGAIN). A later file splices
     the settle (2027-04-24-boss-call-series.sql), and 2027-04-22-faction-standing.sql's own PIN then refuses a re-apply over it, by design: that
     refusal is proved where the later file is (boss-call-db BD-AGAIN, the series' arm). Every other arm reads the whole chain. */
  const { db } = await bootReplay(name === 'FS-AGAIN' ? { upTo: FILES[FILES.length - 1] } : undefined);
  try {
    await H.pinDice(db);
    await db.query('update public.hr_hunt_config set enabled = true where id');
    /* the factions open, as the Coordinator opens them (2027-04-23-faction-section.sql) */
    await db.query("update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions'");
    const X = await ctx(db);
    await db.query('begin');
    try {
      if (mutant) await plant(db, mutant);
      return await ARMS[name](db, M, X, mutant);
    } finally { await db.query('rollback').catch(() => {}); }
  } finally { await db.close().catch(() => {}); }
}

async function main() {
  const mutate = process.argv.includes('--mutate');
  const M = await H.loadEdge(H.ROOT);
  const red = [];
  for (const name of Object.keys(ARMS)) {
    try {
      const bad = await runArm(name, M);
      if (bad.length) red.push(...bad); else console.log(`  ✓ ${name}`);
    } catch (e) { console.error(`faction-standing-db HARNESS ${name}: ${e.stack || e}`); process.exit(2); }
  }
  if (red.length) { console.error(`faction-standing-db ${mutate ? '--mutate: the CLEAN arms are red' : 'RED'}:\n  ` + red.join('\n  ')); process.exit(1); }
  if (!mutate) { console.log(`faction-standing-db: green, ${Object.keys(ARMS).length} arms`); return; }
  let missed = 0, ran = 0;
  /* --only a,b: those mutants alone (a lane re-proving the arms it touched; CI runs them all) */
  const only = process.argv.includes('--only') ? String(process.argv[process.argv.indexOf('--only') + 1] || '').split(',') : null;
  for (const [id, m] of Object.entries(MUTANTS)) {
    if (only && !only.includes(id)) continue;
    let bad;
    try { bad = await runArm(m.arm, M, m); } catch (e) { if (e.harness) { console.error(`  HARNESS ${id}: ${e.message}`); process.exit(2); } bad = ['threw: ' + String(e.message).split('\n')[0]]; }
    console.log(`  ${bad.length ? 'CAUGHT' : 'MISSED'} ${id} by ${m.arm} (${m.why})${bad.length ? ': ' + bad[0].slice(0, 110) : ''}`);
    ran++; if (!bad.length) missed++;
  }
  if (missed) { console.error(`faction-standing-db --mutate: ${missed} of ${Object.keys(MUTANTS).length} MISSED`); process.exit(1); }
  console.log(`faction-standing-db --mutate: clean arms green, all ${ran} mutants run caught`);
}

if (isMain(import.meta.url)) main();
