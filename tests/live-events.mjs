#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/live-events.mjs — LIVE EVENTS, STEPS 1 AND 2 (lane/c-live-events; the designer's plan, board "2026-11-07 Live events";
// src/data/live-events.js, tools/gen-live-events.mjs, supabase/migrations/2027-03-22-live-events*.sql, src/core/live-events.js,
// src/core/hunt/xp-share.js, supabase/functions/hr-accrue/accrual.js + hunt-settle.js). The browser's prediction of an event's kills
// is tests/hunt-live.mjs LV-EVENT (the hunt viewed, in the browser).
//
//   node tests/live-events.mjs            the guard
//   node tests/live-events.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-03-22-live-events.sql
//
// ARMS (no database)
//   LE-PMAT    pmAt: a window holds [from, to): its start in, its end out; a malformed window is no window; no hook when nobody has one
//   LE-KILL    a kill pays the dial of ITS OWN time, to the hero whose account holds the window only: inside, Level XP x1.25 with the
//              added part as `ev`; at the end instant and before the start, the row as written and no `ev`
// ARMS (the real replayed chain, PGlite, as hr_engine; the real Mill Cellar; a Level 20 hero; an event row +25% from minute 3)
//   LE-CAT     the server's two catalogues are tools/gen-live-events.mjs catalogueOf(the data), row for row; both switches are off
//   LE-CLOSED  BROWSER CLOSED (the tick's slices): the hero's Level XP is the switch-off run's plus exactly the tally's xp_event (> 0, less
//              than a quarter of the run: the first minutes are outside); coin, items, skill XP, kills, deaths, the bag and the hunt
//              ledger are the switch-off run's to the unit; the closed session's personal best is the switch-off run's (the event's
//              part left out)
//   LE-VIEWED  HUNT VIEWED (the player door's 16 s settles): the same hunt lands the same Level XP, xp_event, coin, items, world
//   LE-SWITCH  the switch off mid-hunt: the next windows add nothing; on again, they add again. Every flip is a row, none a release
//   LE-PARTY   `accounts` on for the leader only: the leader's kills pay the dial, the member's exactly what they pay with it off
//   LE-BOUND   the commit re-proves the claim: the Level XP bound grows by the account's own dial and nothing else (kills x the
//              ground's best kill x headroom x 1.25 lands, one more is refused; the same without the event is refused); an event
//              part with no event live, or more than the dial could add, is refused (bad_xp_event)
//   LE-FEE     OPEN HALLS: the quote is 0 for the account the switch holds while the window holds now; a free call seats the party,
//              moves no gold, journals its row (fee_pm 0, the event) and counts toward the day's three; the same 0 with the switch
//              off is a stale price (quote_changed) that moves nothing
//   LE-SECTION the envelope's `live_events` lists what is on or starts within 7 days for this account's switches; a stranger's is null
//   LE-ANNOUNCE one System line a window edge, once, its words filled in UTC; a testers' event says nothing to everyone
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const MIN = 60000;
const ARMS = ['LE-PMAT', 'LE-KILL', 'LE-CAT', 'LE-CLOSED', 'LE-VIEWED', 'LE-SWITCH', 'LE-PARTY', 'LE-BOUND', 'LE-FEE', 'LE-SECTION', 'LE-ANNOUNCE'];

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS
// ═══════════════════════════════════════════════════════════════════════
function lePmat(M) {
  const { pmAt, xpMultFor } = M.LE;
  const bad = [];
  const W = [[1000, 2000, 1250], [3000, 4000, 1100]];
  for (const [at, want] of [[999, 1000], [1000, 1250], [1999, 1250], [2000, 1000], [3500, 1100], [4000, 1000]]) {
    if (pmAt(W, at) !== want) bad.push('pmAt at ' + at + ' answered ' + pmAt(W, at) + ', want ' + want);
  }
  for (const [w, why] of [[[[0, 10, 1250.5]], 'a fractional dial'], [[[0, 'x', 1250]], 'a window with no end'], [[[0, 10]], 'a window of two numbers'], ['x', 'no list']]) {
    if (pmAt(w, 5) !== 1000) bad.push(why + ' gave ' + pmAt(w, 5));
  }
  if (pmAt(W, NaN) !== 1000) bad.push('no instant gave ' + pmAt(W, NaN));
  const sides = [{ mi: { key: 'a' }, member: { unitId: 1 } }, { mi: { key: 'b' }, member: { unitId: 2 } }];
  if (xpMultFor(sides, () => null) !== null || xpMultFor(sides, () => []) !== null || xpMultFor([], () => W) !== null) bad.push('a hook is set with no window');
  const f = xpMultFor(sides, (s) => (s.mi.key === 'a' ? W : null));
  if (!f || f({ id: 1 }, 1500) !== 1.25 || f({ id: 2 }, 1500) !== 1 || f({ id: 9 }, 1500) !== 1 || f({ id: 1 }, 2000) !== 1) bad.push('the hook is not each hero\'s own dial at the instant');
  return bad;
}

function leKill(M) {
  const { xpMultFor } = M.LE;
  const bad = [];
  const sides = [{ mi: { key: 'a' }, member: { unitId: 1 } }, { mi: { key: 'b' }, member: { unitId: 2 } }];
  const hook = xpMultFor(sides, (s) => (s.mi.key === 'a' ? [[1000, 2000, 1250]] : null));
  const pp = M.PCX.partyClassXp(null, ['tank', 'tank']).permille;
  const kill = (atMs, withHook) => {
    const events = [];
    const inst = { world: { units: [{ id: 1, side: 'hero', alive: true, role: 'tank', heroLv: 10 }, { id: 2, side: 'hero', alive: true, role: 'tank', heroLv: 10 }] }, ground: null };
    M.XS.shareKillXp(inst, { t: 99, u: 1, xp: 200 }, { atMs, emit: (e) => events.push(e), ...(withHook ? { xpMultOf: hook } : {}) });
    return Object.fromEntries(events.filter((e) => e.type === 'xp').map((e) => [e.u, e]));
  };
  const plain = Math.floor((100 * pp) / 1000 + 1e-9), boosted = Math.floor((100 * pp * 1.25) / 1000 + 1e-9);
  const inside = kill(1500, true);
  if (!inside[1] || inside[1].amount !== boosted || inside[1].ev !== boosted - plain || !(inside[1].ev > 0)) bad.push('inside the window the event hero earned ' + JSON.stringify(inside[1]) + ', want ' + boosted + ' with ev ' + (boosted - plain));
  if (!inside[2] || inside[2].amount !== plain || inside[2].ev !== undefined) bad.push('the hero with no window earned ' + JSON.stringify(inside[2]) + ', want ' + plain + ' and no ev');
  for (const at of [999, 2000]) {
    const k = kill(at, true);
    if (!k[1] || k[1].amount !== plain || k[1].ev !== undefined) bad.push('at ' + at + ' (outside) the event hero earned ' + JSON.stringify(k[1]));
  }
  const none = kill(1500, false);
  if (!none[1] || none[1].amount !== plain || none[1].ev !== undefined) bad.push('with no hook the hero earned ' + JSON.stringify(none[1]));
  /* the member's tally keeps the event's part apart (member.js addLevelXp's third argument, hunt-rewards.js passes it) */
  const src = readFileSync(join(M.root, 'src/core/hunt-rewards.js'), 'utf8');
  if (!src.includes("call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);")) bad.push('hunt-rewards.js does not hand the event\'s part to the member');
  return bad;
}

// ═══════════════════════════════════════════════════════════════════════
// DATABASE ARMS
// ═══════════════════════════════════════════════════════════════════════
const { one, q, inTx, makeExec, UIDS } = H;
const UID = UIDS[0];
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const key = () => crypto.randomUUID();
const HERO = { level: 20, inv: { cooked_shrimp: 60 }, bag: [{ item: 'cooked_shrimp', qty: 50 }], gold: 1000000, realGround: true };
const flip = (db, sw, scope, accounts = []) => db.query('update public.hr_feature_switches set scope = $2, accounts = $3::uuid[], updated_at = now() where switch_id = $1', [sw, scope, accounts]);
/* An event row of the arm's own (the catalogue's two cleared first, so a real weekend on the clock never joins in) */
async function event(db, id, type, pm, scope, firstMs, hours, o = {}) {
  await db.query(`insert into public.hr_live_events (event_id, type_id, pm, scope, first_at, hours, every_days, until_at, name, start_words, end_words)
                  values ($1, $2, $3, $4::text[], to_timestamp($5::bigint / 1000.0), $6, $7, null, 'Probe', $8, $9)`,
  [id, type, pm, scope, Math.floor(firstMs), hours, o.everyDays ?? null, o.start || 'The probe started.', o.end || 'The probe ended.']);
}
const nowMs = async (db) => Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint::text'));
/* the session's end, then its fold now (hr_hunt_best_on_end is a deferred constraint trigger: it folds at COMMIT, and an arm rolls back) */
const close = async (db, sid) => { await db.query(`select public.hr_hunt_close($1::uuid, 'server', now(), true)`, [sid]); await db.query('select public.hr_hunt_best_fold($1::uuid)', [sid]); };
const bestOf = async (db, uid) => (await q(db, `select xp_h::text as x from public.hunt_bests where user_id = $1 and slot = 0 and hunt_id = 'mill_cellar' and mode = 'solo'`, [uid]))[0];
const lx = (s) => Number(s.level_xp);
const xpEventOf = (s) => Number((s.tally && s.tally.xp_event) || 0);
/* every field a live event must leave alone (the snapshot less Level XP, the tally's XP and the instance world, whose open "+XP" group carries the paid amounts) */
const others = (s) => {
  const t = { ...(s.tally || {}) };
  delete t.xp; delete t.xp_event;
  return JSON.stringify({ gold: s.gold, skills: s.skills, inv: s.inv, bag: s.bag, ledger: s.ledger, deaths: s.deaths, death_xp: s.death_xp, hp: s.hp,
    stats: s.stats, session: s.session, tally: t });
};
const every = (from, step, span) => Array.from({ length: Math.ceil(span / step) }, (_, i) => Math.min(from + (i + 1) * step, from + span));
async function cuts(db, M, list, o = {}) { for (const t of list) { const r = await H.settleTo(db, M, t, o); if (r && r.skipped === 'no_hunt') break; } }
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(Math.max(0, i - 60), i + 60) + '  vs  ' + b.slice(Math.max(0, i - 60), i + 60); };

const DB_ARMS = {
  'LE-CAT': async (db, M) => {
    const bad = [];
    const G = await import(pathToFileURL(join(M.root, 'tools/gen-live-events.mjs')).href);
    const c = G.catalogueOf(await G.loadData(M.root));
    const types = await q(db, 'select type_id, switch_id, dial, lo, hi, stack, scope_kind from public.hr_live_event_types order by type_id');
    const wantT = c.types.map((t) => [t.id, t.switchId, t.dial, t.lo, t.hi, t.stack, t.scopeKind].join(','));
    const haveT = types.map((t) => [t.type_id, t.switch_id, t.dial, t.lo, t.hi, t.stack, t.scope_kind].join(','));
    if (wantT.join(';') !== haveT.join(';')) bad.push('the types are ' + haveT.join(';') + ', the data ' + wantT.join(';'));
    const evs = await q(db, `select event_id, type_id, pm, scope, to_char(first_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') f, hours, every_days,
                               to_char(until_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') u, name, start_words, end_words from public.hr_live_events order by event_id`);
    const wantE = c.events.map((e) => JSON.stringify([e.id, e.type, e.pm, e.scope, e.first, e.hours, e.everyDays, e.until, e.name, e.start, e.end]));
    const haveE = evs.map((e) => JSON.stringify([e.event_id, e.type_id, e.pm, e.scope, e.f, e.hours, e.every_days, e.u, e.name, e.start_words, e.end_words]));
    if (wantE.join('\n') !== haveE.join('\n')) bad.push('the events differ from the data: ' + firstDiff(haveE.join('\n'), wantE.join('\n')));
    const sw = await q(db, `select switch_id, scope from public.hr_feature_switches where switch_id in (select switch_id from public.hr_live_event_types) order by 1`);
    if (sw.length !== c.types.length || sw.some((s) => s.scope !== 'off')) bad.push('the event switches read ' + JSON.stringify(sw) + ' (want every type\'s, off)');
    return bad;
  },

  'LE-CLOSED': async (db, M) => {
    const bad = [];
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 12 });
    await event(db, 'zz_le_bonus', 'xp_bonus', 1250, ['world'], h.from + 3 * MIN, 1);
    const lx0 = Number(M.XP.charXpForLevel(20));
    await db.query('savepoint le_paths');
    await flip(db, 'event_xp_bonus', 'everyone');
    await cuts(db, M, [h.from + 11 * MIN]);
    const on = await H.snapshot(db, h.sid, UID);
    await close(db, h.sid);
    const bestOn = await bestOf(db, UID);
    await db.query('rollback to savepoint le_paths');
    await cuts(db, M, [h.from + 11 * MIN]);
    const off = await H.snapshot(db, h.sid, UID);
    await close(db, h.sid);
    const bestOff = await bestOf(db, UID);
    const ev = xpEventOf(on), gained = lx(off) - lx0;
    if (!(ev > 0) || xpEventOf(off) !== 0) bad.push('the tally kept ' + ev + ' as the event\'s part with the switch on and ' + xpEventOf(off) + ' with it off');
    if (lx(on) - lx(off) !== ev) bad.push('the hero earned ' + (lx(on) - lx(off)) + ' Level XP more with the event, the tally says ' + ev);
    if (!(ev < gained * 0.25)) bad.push('the event added ' + ev + ' to a run of ' + gained + ': a quarter or more, so the minutes before the window paid it too');
    if (others(on) !== others(off)) bad.push('the event moved something besides Level XP: ' + firstDiff(others(on), others(off)));
    if (!bestOn || !bestOff || Math.abs(Number(bestOn.x) - Number(bestOff.x)) > 1) bad.push('the personal best reads ' + JSON.stringify(bestOn) + ' with the event, ' + JSON.stringify(bestOff) + ' without');
    console.log('  LE-CLOSED Cellar at Level 20, 11 min, +25% from minute 3: ' + gained + ' Level XP without, ' + (lx(on) - lx0) + ' with (' + ev
      + ' the event\'s); the best ' + (bestOn && bestOn.x) + ' an hour with it, ' + (bestOff && bestOff.x) + ' without');
    return bad;
  },

  'LE-VIEWED': async (db, M) => {
    const bad = [];
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 8 });
    await event(db, 'zz_le_bonus', 'xp_bonus', 1250, ['world'], h.from + 2 * MIN, 1);
    await flip(db, 'event_xp_bonus', 'everyone');
    await db.query('savepoint le_paths');
    /* BROWSER CLOSED: the tick's slices. HUNT VIEWED: the player door's 16 s settles. One instance, one set of dice. */
    await cuts(db, M, [h.from + 7 * MIN]);
    const closed = JSON.stringify(await H.snapshot(db, h.sid, UID));
    await db.query('rollback to savepoint le_paths');
    await cuts(db, M, every(h.from, 16000, 7 * MIN));
    const viewed = JSON.stringify(await H.snapshot(db, h.sid, UID));
    if (viewed !== closed) bad.push('the hunt viewed lands another state than the browser closed: ' + firstDiff(viewed, closed));
    if (!(xpEventOf(JSON.parse(viewed)) > 0)) bad.push('CONTROL: the event added nothing');
    return bad;
  },

  'LE-SWITCH': async (db, M) => {
    const bad = [];
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 10 });
    await event(db, 'zz_le_bonus', 'xp_bonus', 1250, ['mill_cellar'], h.from + MIN, 2);
    await flip(db, 'event_xp_bonus', 'everyone');
    await cuts(db, M, [h.from + 3 * MIN]);
    const e1 = xpEventOf(await H.snapshot(db, h.sid, UID));
    await flip(db, 'event_xp_bonus', 'off');
    await cuts(db, M, [h.from + 6 * MIN]);
    const e2 = xpEventOf(await H.snapshot(db, h.sid, UID));
    await flip(db, 'event_xp_bonus', 'everyone');
    await cuts(db, M, [h.from + 9 * MIN]);
    const e3 = xpEventOf(await H.snapshot(db, h.sid, UID));
    if (!(e1 > 0) || e2 !== e1 || !(e3 > e2)) bad.push('the event\'s part read ' + [e1, e2, e3].join(' / ') + ' on, off, on again (want > 0, the same, more)');
    return bad;
  },

  'LE-PARTY': async (db, M) => {
    const bad = [];
    const [A, B] = UIDS;
    const h = await H.hunter(db, M, { party: [{ ...HERO, minutesAgo: 8 }, { ...HERO }] });
    await event(db, 'zz_le_bonus', 'xp_bonus', 1250, ['world'], h.from + MIN, 1);
    await db.query('savepoint le_party');
    await flip(db, 'event_xp_bonus', 'accounts', [A]);
    await cuts(db, M, [h.from + 7 * MIN]);
    const onA = await H.snapshot(db, h.sids[0], A), onB = await H.snapshot(db, h.sids[1], B);
    await db.query('rollback to savepoint le_party');
    await cuts(db, M, [h.from + 7 * MIN]);
    const offA = await H.snapshot(db, h.sids[0], A), offB = await H.snapshot(db, h.sids[1], B);
    if (!(xpEventOf(onA) > 0) || lx(onA) - lx(offA) !== xpEventOf(onA)) bad.push('the leader (on) earned ' + (lx(onA) - lx(offA)) + ' more, the tally says ' + xpEventOf(onA));
    if (xpEventOf(onB) !== 0 || lx(onB) !== lx(offB)) bad.push('the member (not on) earned ' + (lx(onB) - lx(offB)) + ' more, the tally says ' + xpEventOf(onB));
    if (others(onA) !== others(offA) || others(onB) !== others(offB)) bad.push('the event moved something besides the leader\'s Level XP');
    return bad;
  },

  'LE-BOUND': async (db, M) => {
    const bad = [];
    const h = await H.hunter(db, M, { ...HERO, minutesAgo: 6 });
    await event(db, 'zz_le_bonus', 'xp_bonus', 1250, ['world'], h.from - MIN, 1);
    const exec = makeExec(db);
    const hd = Number(await one(db, `select public.hr_hunt_limit('value_headroom')::text`));
    const best = Number(await one(db, `select max(b.xp_max)::text from public.hr_hunt_kill_bounds b
                                         where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = 'mill_cellar')`));
    const attempt = async (edit) => {
      const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, atMs: h.from + MIN }, 'tick');
      if (plan.answer) return { skipped: plan.answer.reason };
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      const m = p.commit.members[0];
      const k = Number(m.delta.journal && m.delta.journal.meta && m.delta.journal.meta.kills);
      if (edit) edit(m, k * best * hd);
      return M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
    };
    const cases = [
      ['off', 'Level XP at the plain bound', (m, b) => { m.delta.level_xp = b; }, true],
      ['off', 'one past the plain bound', (m, b) => { m.delta.level_xp = b + 1; }, 'value_over'],
      ['off', 'an event part with no event live', (m) => { m.hunt.xp_event = 1; }, 'bad_xp_event'],
      ['on', 'Level XP at the bound x1.25', (m, b) => { m.delta.level_xp = Math.floor(b * 1.25); }, true],
      ['on', 'one past the bound x1.25', (m, b) => { m.delta.level_xp = Math.floor(b * 1.25) + 1; }, 'value_over'],
      ['on', 'the whole window claimed as the event\'s', (m) => { m.hunt.xp_event = m.delta.level_xp; }, 'bad_xp_event'],
      ['on', 'the honest window', null, true],
      ['accounts', 'Level XP at the bound x1.25 for an account the switch does not hold', (m, b) => { m.delta.level_xp = Math.floor(b * 1.25); }, 'value_over'],
    ];
    await db.query('savepoint le_bound');
    for (const [scope, what, edit, want] of cases) {
      await flip(db, 'event_xp_bonus', scope === 'on' ? 'everyone' : scope, scope === 'accounts' ? [UIDS[3]] : []);
      const r = await attempt(edit);
      const ok = want === true ? r && r.ok === true : r && r.ok !== true && r.error === want;
      if (!ok) bad.push(scope + ': ' + what + ' answered ' + JSON.stringify(r).slice(0, 200) + ', want ' + (want === true ? 'ok' : want));
      await db.query('rollback to savepoint le_bound');
    }
    return bad;
  },

  'LE-FEE': async (db, M) => {
    const bad = [];
    const [a, b] = UIDS;
    for (const uid of [a, b]) await H.character(db, M, uid, { level: 20, gold: 100000 });
    await db.query('select public.hr_party_open($1::uuid, 0)', [a]);
    const pid = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [a]);
    await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [pid, b]);
    const fee = Number(await one(db, `select fee::text from public.hr_boss_calls where call_id = 'rat_king'`));
    await event(db, 'zz_le_halls', 'open_halls', 0, ['world'], (await nowMs(db)) - 60 * MIN, 12);
    const quote = () => one(db, `select public.hr_boss_call_quote($1::uuid, 0, 'rat_king')`, [a]);
    const call = async (price) => {
      await db.query('delete from public.hr_rate_counters where user_id = $1', [a]);
      await asUser(db, a);
      const r = await one(db, `select public.hr_boss_call(0, 'rat_king', $1, $2::uuid)`, [price, key()]);
      await asUser(db, '');
      return r;
    };
    const purse = async () => Number(await one(db, 'select public.hr_purse_of($1::uuid)::text', [a]));
    const rows = () => q(db, `select intent, gold, meta from public.player_ledger where user_id = $1 and intent like 'boss\\_call:%'`, [a]);
    const seated = async () => Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid]));
    let v = await quote();
    if (Number(v.price) !== fee || v.fee_pm !== 1000 || v.event !== null) bad.push('off: the quote reads ' + JSON.stringify(v));
    v = await call(0);
    if (!v || v.error !== 'quote_changed' || await purse() !== 100000 || (await rows()).length || await seated()) bad.push('off: a free call answered ' + JSON.stringify(v));
    await flip(db, 'event_open_halls', 'accounts', [a]);
    v = await quote();
    if (Number(v.price) !== 0 || v.fee_pm !== 0 || v.event !== 'zz_le_halls') bad.push('on: the quote reads ' + JSON.stringify(v));
    v = await call(0);
    const led = await rows();
    if (!v || v.ok !== true || await purse() !== 100000 || await seated() !== 2) bad.push('on: the free call answered ' + JSON.stringify(v).slice(0, 200) + ', the purse ' + await purse());
    if (led.length !== 1 || led[0].intent !== 'boss_call:rat_king:0' || Number(led[0].gold || 0) !== 0 || led[0].meta.fee_pm !== 0 || led[0].meta.event !== 'zz_le_halls')
      bad.push('on: the free call journalled ' + JSON.stringify(led));
    v = await quote();
    if (v.used !== 1 || v.left !== Number(v.per_day) - 1) bad.push('on: the free call does not count toward the day: ' + JSON.stringify(v));
    v = await call(-1);
    if (!v || v.error !== 'bad_quote') bad.push('a price under 0 answered ' + JSON.stringify(v));
    return bad;
  },

  'LE-SECTION': async (db, M) => {
    const bad = [];
    const [a, b] = UIDS;
    for (const uid of [a, b]) await H.character(db, M, uid, { level: 5 });
    const t = await nowMs(db);
    await event(db, 'zz_le_soon', 'xp_bonus', 1250, ['world'], t + 2 * 24 * 60 * MIN, 3);
    await event(db, 'zz_le_late', 'xp_bonus', 1250, ['world'], t + 9 * 24 * 60 * MIN, 3);
    await event(db, 'zz_le_halls', 'open_halls', 0, ['world'], t - MIN, 3);
    await flip(db, 'event_xp_bonus', 'accounts', [a]);
    const sa = await one(db, `select public.hr_state_of($1::uuid, 0)->'live_events'`, [a]);
    const sb = await one(db, `select public.hr_state_of($1::uuid, 0)->'live_events'`, [b]);
    const ids = (sa || []).map((x) => x.id + ':' + x.live);
    if (ids.join(',') !== 'zz_le_soon:false') bad.push('the account\'s section lists ' + JSON.stringify(sa) + ' (want the bonus in 2 days, not on yet; not the one in 9 days; not Open Halls, its switch off)');
    if (sb !== null && sb !== undefined) bad.push('a stranger\'s section reads ' + JSON.stringify(sb));
    await flip(db, 'event_open_halls', 'everyone');
    const sc = await one(db, `select public.hr_state_of($1::uuid, 0)->'live_events'`, [b]);
    if (!sc || sc.map((x) => x.id + ':' + x.live).join(',') !== 'zz_le_halls:true') bad.push('Open Halls on for everyone reads ' + JSON.stringify(sc) + ' for the stranger');
    return bad;
  },

  'LE-ANNOUNCE': async (db) => {
    const bad = [];
    const t = await nowMs(db);
    await flip(db, 'event_xp_bonus', 'everyone');
    await event(db, 'zz_le_ann', 'xp_bonus', 1250, ['world'], t - 5 * MIN, 1, { everyDays: 7, start: 'The probe started. {pct}% until {end}.' });
    await db.query('select public.hr_live_events_announce(now())');
    await db.query('select public.hr_live_events_announce(now())');
    const lines = await q(db, `select body, from_name from public.chat_messages where channel = 'system' and body like 'The probe started.%'`);
    if (lines.length !== 1 || !/^The probe started\. 25% until [A-Z][a-z]+day at \d\d:\d\d UTC\.$/.test(lines[0].body) || lines[0].from_name !== 'Havora') bad.push('the start went out as ' + JSON.stringify(lines));
    await flip(db, 'event_xp_bonus', 'testers');
    await event(db, 'zz_le_quiet', 'xp_bonus', 1250, ['world'], t - 3 * MIN, 1, { start: 'The quiet probe started.' });
    await db.query('select public.hr_live_events_announce(now())');
    const quiet = await q(db, `select body from public.chat_messages where body like 'The quiet probe%'`);
    const note = await q(db, `select lines from public.hr_live_event_notices where event_id = 'zz_le_quiet' and edge = 'start'`);
    if (quiet.length || note.length !== 1 || note[0].lines !== 0) bad.push('a testers\' event went out as ' + JSON.stringify(quiet) + ' (notice ' + JSON.stringify(note) + ')');
    return bad;
  },
};

async function runArms(db, M, only) {
  const out = {};
  for (const name of ARMS) {
    if (only && !only.includes(name)) continue;
    if (name === 'LE-PMAT') { out[name] = lePmat(M); continue; }
    if (name === 'LE-KILL') { out[name] = leKill(M); continue; }
    try {
      out[name] = await inTx(db, async () => {
        if (name !== 'LE-CAT') { await db.query('delete from public.hr_live_event_notices'); await db.query('delete from public.hr_live_events'); }
        await db.query('savepoint le_arm');
        return DB_ARMS[name](db, M);
      });
    } catch (e) {
      /* a window the server refused (H.settleTo throws on one) is the arm's finding, never the harness's */
      const m = String(e && e.message);
      out[name] = [(/^settle to \S+ refused:/.test(m) ? 'a window was refused: ' : 'threw: ') + m.slice(0, 400)];
    }
  }
  return out;
}

/* DB mutants: one anchored edit of a live body (every occurrence), the arm that must go red. Engine mutants: one anchored edit of a temp copy. */
const SIG = { apply: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', windows: 'public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)',
  fee: 'public.hr_live_fee_of(uuid,text,timestamp with time zone)', quote: 'public.hr_boss_call_quote(uuid,integer,text)', view: 'public.hr_live_events_view(uuid,integer)',
  announce: 'public.hr_live_events_announce(timestamp with time zone)', best: 'public.hr_hunt_best_fold(uuid)', read: 'public.hr_hunt_instance_read(uuid,integer)' };
const DB_MUTANTS = [
  { arm: 'LE-BOUND', name: 'the Level XP bound ignores the dial (an honest event window refused)', fn: SIG.apply,
    find: ' * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then', replace: ' then' },
  { arm: 'LE-BOUND', name: 'the Level XP bound doubles whatever is live', fn: SIG.apply, find: 'v_s.settled_to, v_to) / 1000.0 then', replace: 'v_s.settled_to, v_to) / 500.0 then' },
  { arm: 'LE-BOUND', name: 'an event part is taken with no event live', fn: SIG.apply, find: '(select case when q.m = 1000 then 0', replace: '(select case when false then 0' },
  { arm: 'LE-CLOSED', name: 'the event\'s part is never kept on the tally', fn: SIG.apply,
    find: 'update public.hunt_session_tally t set xp_event = t.xp_event + (p_hunt->>\'xp_event\')::bigint where t.session_id = p_session;', replace: 'null;' },
  { arm: 'LE-CLOSED', name: 'a best keeps the event\'s part', fn: SIG.best,
    find: ' - coalesce((select t.xp_event from public.hunt_session_tally t where t.session_id = p_session), 0) / v_wall_h', replace: '' },
  { arm: 'LE-CLOSED', name: 'the instance read hands the engine no windows', fn: SIG.read,
    find: "'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour')", replace: "'live_xp', '[]'::jsonb" },
  { arm: 'LE-SWITCH', name: 'the XP windows never ask the switch', fn: SIG.windows, find: 'public.hr_feature_on(t.switch_id, p_user)', replace: 'true' },
  { arm: 'LE-PARTY', name: 'the XP windows are the first member\'s for every member', fn: SIG.read,
    find: 'public.hr_live_xp_windows(h.user_id,', replace: 'public.hr_live_xp_windows((select h2.user_id from public.hunt_sessions h2 where h2.instance_id = v_i.id order by h2.entered_at, h2.user_id limit 1),' },
  { arm: 'LE-FEE', name: 'the quote ignores the fee dial', fn: SIG.quote, find: "v_price := (r.fee::bigint * (v_fee->>'pm')::int + 999) / 1000;", replace: 'v_price := r.fee::bigint;' },
  { arm: 'LE-FEE', name: 'the fee dial never asks the switch', fn: SIG.fee, find: 'and public.hr_feature_on(t.switch_id, p_user)', replace: '' },
  { arm: 'LE-FEE', name: 'a free call is not counted toward the day', fn: SIG.quote, find: "and l.intent like 'boss\\_call:%'", replace: "and l.intent like 'boss\\_call:%' and coalesce(l.gold, 0) <> 0" },
  { arm: 'LE-SECTION', name: 'the section lists every event, switch or not', fn: SIG.view, find: '           where public.hr_feature_on(t.switch_id, p_user)) x;', replace: '           ) x;' },
  { arm: 'LE-ANNOUNCE', name: 'a testers\' event is announced to everyone', fn: SIG.announce, find: "and f.scope = 'everyone');", replace: "and f.scope <> 'off');" },
  { arm: 'LE-ANNOUNCE', name: 'an edge is announced at every run', fn: SIG.announce, find: 'continue when v_ins = 0 or not v_on;', replace: 'continue when not v_on;' },
];
const JS_MUTANTS = [
  { arm: 'LE-PMAT', name: 'a window holds its end instant', file: 'src/core/live-events.js', from: 'atMs >= from && atMs < to) return pm;', to: 'atMs >= from && atMs <= to) return pm;' },
  { arm: 'LE-PMAT', name: 'every hero takes the first windowed hero\'s dial', file: 'src/core/live-events.js',
    from: 'const hit = live.find(([s]) => s.member && s.member.unitId === (hero && hero.id));', to: 'const hit = live[0];' },
  { arm: 'LE-KILL', name: 'a kill reads its dial with no time', file: 'src/core/hunt/xp-share.js', from: 'const m = f ? f(hero, sc.atMs) : 1;', to: 'const m = f ? f(hero) : 1;' },
  { arm: 'LE-KILL', name: 'the event\'s part is not told apart', file: 'src/core/hunt/xp-share.js', from: 'ev: paid === plain ? 0 : Math.max(0, amount - at(plain))', to: 'ev: 0' },
  { arm: 'LE-CLOSED', name: 'the settle sets no hook', file: 'supabase/functions/hr-accrue/accrual.js', from: 'const xpMultOf = xpMultFor(sides, (sd) => sd.mi.liveXp);', to: 'const xpMultOf = null;' },
  { arm: 'LE-CLOSED', name: 'the member input drops the windows', file: 'supabase/functions/hr-accrue/hunt-settle.js',
    from: 'liveXp: Array.isArray(m.live_xp) && m.live_xp.length ? m.live_xp : null,', to: 'liveXp: null,' },
  { arm: 'LE-CLOSED', name: 'the proposal never sends the event\'s part', file: 'supabase/functions/hr-accrue/accrual.js',
    from: '...(xpEvent > 0 ? { xp_event: xpEvent } : {}),', to: '' },
  { arm: 'LE-CAT', name: 'the server\'s events drift from the data (the generator moved, the file not regenerated)', file: 'tools/gen-live-events.mjs',
    from: 'events.push({ id, type: e.type, pm: e.pm, scope,', to: 'events.push({ id, type: e.type, pm: e.pm + 1, scope,' },
];

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  await H.pinDice(db);
  const at = (root, f) => import(pathToFileURL(join(root, f)).href + V);
  const load = async (root) => ({ ...(await H.loadEdge(root)), root, LE: await at(root, 'src/core/live-events.js'), XS: await at(root, 'src/core/hunt/xp-share.js'),
    PCX: await at(root, 'src/data/party-class-xp.js') });
  if (MUTATE) {
    let bad = 0;
    const M = await load(ROOT);
    const need = (m, res) => {
      const p = (res[m.arm] || [])[0];
      if (!p) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); return 1; }
      if (/^threw/.test(p)) { console.error('✗ harness: ' + m.arm + ' threw on: ' + m.name + ' (' + p.slice(0, 160) + ')'); return 1; }
      console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + p.slice(0, 110) + ')'); return 0;
    };
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    for (const m of DB_MUTANTS.filter((x) => !pick || x.name.includes(pick))) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length < 2) { console.error('✗ db mutant "' + m.name + '": anchor not found in ' + m.fn); bad++; continue; }
      await db.exec(def.split(m.find).join(m.replace));
      try { bad += need(m, await runArms(db, M, [m.arm])); } finally { await db.exec(def); }
    }
    for (const m of JS_MUTANTS.filter((x) => !pick || x.name.includes(pick))) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-le-'));
      try {
        for (const d of ['src/core', 'src/data', 'src/build-info.js', 'supabase/functions/hr-accrue', 'tools/gen-live-events.mjs', 'tests/_is-main.mjs']) {
          mkdirSync(dirname(join(dir, d)), { recursive: true });
          cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        }
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error('✗ mutant "' + m.name + '": marker not found exactly once in ' + m.file); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const Mx = await load(dir);
        bad += need(m, await runArms(db, Mx, [m.arm]));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const total = DB_MUTANTS.length + JS_MUTANTS.length;
    console.log(bad ? 'live-events --mutate: ' + bad + ' mutant(s) survived' : 'live-events --mutate: all ' + (pick ? 'picked' : total) + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const M = await load(ROOT);
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(db, M, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'live-events: ' + red + ' arm(s) red' : 'live-events: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
