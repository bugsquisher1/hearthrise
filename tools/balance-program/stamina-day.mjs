#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/stamina-day.mjs — THE STAMINA DAY, PLAYED ON THE SERVER (balance program 50-standards.md section 5.2, step 0:
// "Verify the stamina day on the server". The clock of section 1.1 is COMPUTED from the data rows; this plays it).
//
//   node tools/balance-program/stamina-day.mjs [--days 2] [--write]
//        PLAY, no browser, no production: the replayed chain (tools/qa/local-world.mjs openWorld: PGlite + the real hr-accrue handler +
//        the signed world tick). Three heroes, each its own account, signed in through the auth shim, created by hr_create_hero, sent
//        hunting by hr_hunt_enter (p_hours null: until the bar runs out), and time passed with the world's own wait (every hunt's clocks
//        and every resting hero's stamina clock move together, then the tick settles the window as production does):
//          free-2   a FREE hero started twice a day, 12 hours apart (the free game: 8 h, rest 4 h, 4 h, rest 8 h)
//          free-1   a FREE hero started once a day (FREE_ONE_VISIT: 8 h)
//          prem-1   a PREMIUM hero started once a day (its 12 h bar)
//        No refill is bought. Each start, end, end reason and the pool the server held at each start are recorded; hunted hours are
//        hunt_from -> ended_at of each session (the walk in rests, as the rule says). --write keeps the answer in stamina-day.json,
//        which tools/balance-program/progression-grid.mjs reads (its `clock` block) and prints.
//
// The heroes are the start kit's, set to Level 25 inside this throwaway database (tests/cellar-outgrown.mjs levelTo's move) and sent to
// the Meadowbrook Thicket (no exit Level), so no end but the bar's can come first: the proof is about the bar, not the fight. Premium is
// beta_premium off (every hero free) and one hero's own premium_until set 30 days ahead, the two ways the server reads it
// (2026-12-17-beta-premium.sql hr_premium_until). Nothing here touches production: openWorld refuses a production pointer in the env.
//
// Exit 0 when the server agrees with the clock of 50-standards 1.1 (free-2 and prem-1 hunt 12.0 h a day, free-1 8.0, every end `stamina`,
// within 0.1 h); 1 when it disagrees ("If the server disagrees, the clock of 1.1 is wrong and everything waits"); 2 harness.
// mutant-anchors: none: a measuring tool; the grid reads its answer and the guard prints it
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STAMINA_DAY_FILE = join(ROOT, 'tools', 'balance-program', 'stamina-day.json');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const GROUND = 'meadowbrook_thicket';
const LEVEL = 25;
/* the three heroes: when each starts a hunt, in hours of server time from the first start */
export const HEROES = Object.freeze([
  Object.freeze({ id: 'free-2', premium: false, startsEvery: 12, words: 'free, two starts a day 12 h apart' }),
  Object.freeze({ id: 'free-1', premium: false, startsEvery: 24, words: 'free, one start a day' }),
  Object.freeze({ id: 'prem-1', premium: true, startsEvery: 24, words: 'Premium, one start a day' }),
]);
/* what 50-standards 1.1 says each reads (COMPUTED from the stamina rows); the server must agree within TOL */
export const EXPECTED = Object.freeze({ 'free-2': 12, 'free-1': 8, 'prem-1': 12 });
const TOL = 0.1;

async function main() {
  const days = Number(arg('days', 2));
  if (!(days >= 1 && days <= 7)) { console.error('stamina-day: --days 1..7'); return 2; }
  const t0 = Date.now();
  const { openWorld } = await import(u('tools/qa/local-world.mjs'));
  const XP = await import(u('src/core/xp.js'));
  const { BASE_DEFAULT_COLORS } = await import(u('src/data/outfits.js'));
  const { STAMINA_MAX_MS } = await import(u('src/data/hunt-sessions.js'));
  const world = await openWorld({ tickMs: false });
  const db = world.db;
  const log = (s) => console.log('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + s);
  log('world up (chain replayed and opened)');
  try {
    await db.query(`update public.hr_flags set enabled = false where key = 'beta_premium'`);
    const post = async (path, body, bearer) => {
      const r = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) }, body: JSON.stringify(body) });
      const text = await r.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
      return { status: r.status, body: json };
    };
    const heroes = [];
    for (const h of HEROES) {
      const email = 'stamina-' + h.id + '@local-world.test', password = 'local-world-password';
      const su = await post('/auth/v1/signup', { email, password });
      if (su.status !== 200) throw new Error('signup ' + h.id + ': ' + JSON.stringify(su.body));
      const tk = await post('/auth/v1/token?grant_type=password', { email, password });
      const token = tk.body && tk.body.access_token;
      if (!token) throw new Error('token ' + h.id + ': ' + JSON.stringify(tk.body));
      const uid = su.body.id;
      const made = await post('/rest/v1/rpc/hr_create_hero', { p_slot: 0, p_name: 'Stam' + h.id.replace(/[^a-z0-9]/g, ''), p_colors: { ...BASE_DEFAULT_COLORS }, p_idem: randomUUID() }, token);
      if (!(made.body && made.body.ok === true)) throw new Error('create ' + h.id + ': ' + JSON.stringify(made.body));
      await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [uid, XP.charXpForLevel(LEVEL)]);
      if (h.premium) await db.query(`update public.player_state set premium_until = now() + interval '30 days' where user_id = $1 and slot = 0`, [uid]);
      heroes.push({ ...h, uid, token, starts: [] });
    }
    log('three heroes made at Level ' + LEVEL + ' (beta_premium off; prem-1 has its own premium_until)');
    const poolOf = async (uid) => Number((await db.query('select public.hr_stamina_of($1, 0, now()) as v', [uid])).rows[0].v);
    const capOf = async (uid) => Number((await db.query('select public.hr_stamina_cap($1, 0, now()) as v', [uid])).rows[0].v);
    const openOf = async (uid) => (await db.query('select id from public.hunt_sessions where user_id = $1 and ended_at is null', [uid])).rows[0] || null;
    const enter = async (h, at) => {
      const pool = await poolOf(h.uid);
      const open = await openOf(h.uid);
      if (open) { h.starts.push({ at, pool, refused: 'a hunt is still open' }); return; }
      await db.query('delete from public.hr_rate_counters where user_id = $1', [h.uid]);
      const r = await post('/rest/v1/rpc/hr_hunt_enter', { p_slot: 0, p_hunt: GROUND, p_bag: [], p_preset: 0, p_hours: null, p_idem: randomUUID() }, h.token);
      h.starts.push({ at, poolH: Math.round(pool / 36000) / 100, ok: !!(r.body && r.body.ok), ...(r.body && r.body.ok ? {} : { refused: r.body && (r.body.error || r.body.message) }) });
    };
    for (const h of heroes) h.cap = Math.round(await capOf(h.uid) / 36000) / 100;
    const STEP_MIN = 60;
    for (let t = 0; t < days * 24; t += STEP_MIN / 60) {
      for (const h of heroes) if (t % h.startsEvery === 0) await enter(h, t);
      const s = await world.wait(STEP_MIN);
      if (t % 6 === 5) log('t = ' + (t + 1) + ' h, ' + s.fires + ' fires');
    }
    /* sessions, oldest first: hunted = hunt_from -> ended_at (an open one to its settled_to) */
    const out = { schema: 'hearthrise.balance-program.stamina-day/1', at: new Date().toISOString().slice(0, 10), commit: commitOf(), ground: GROUND, level: LEVEL, days,
      stepMinutes: STEP_MIN, dataRows: { freeH: STAMINA_MAX_MS.free / 3600000, premiumH: STAMINA_MAX_MS.premium / 3600000 }, heroes: {} };
    let bad = [];
    for (const h of heroes) {
      const { rows } = await db.query(`select extract(epoch from hunt_from - (select min(entered_at) from public.hunt_sessions where user_id = $1)) / 3600 as from_h,
          extract(epoch from coalesce(ended_at, settled_to) - hunt_from) / 3600 as hunted_h, end_reason
        from public.hunt_sessions where user_id = $1 order by entered_at`, [h.uid]);
      const sessions = rows.map((r) => ({ fromH: Math.round(Number(r.from_h) * 100) / 100, huntedH: Math.round(Number(r.hunted_h) * 100) / 100, end: r.end_reason }));
      const total = sessions.reduce((s, x) => s + x.huntedH, 0);
      const refills = Number((await db.query(`select count(*)::int as n from public.player_ledger where user_id = $1 and intent ilike '%refill%'`, [h.uid])).rows[0].n);
      const aDay = Math.round((total / days) * 100) / 100;
      out.heroes[h.id] = { words: h.words, premium: h.premium, capH: h.cap, startsADay: 24 / h.startsEvery, huntedHoursADay: aDay, totalHuntedH: Math.round(total * 100) / 100,
        refills, starts: h.starts, sessions };
      const ends = sessions.filter((x) => x.end && x.end !== 'stamina');
      if (Math.abs(aDay - EXPECTED[h.id]) > TOL) bad.push(h.id + ' hunts ' + aDay + ' h a day, not ' + EXPECTED[h.id]);
      if (ends.length) bad.push(h.id + ' ended ' + ends.map((x) => x.end).join(', ') + ' (not the bar)');
      if (refills) bad.push(h.id + ' bought ' + refills + ' refills');
    }
    out.verdict = bad.length ? 'DISAGREES: ' + bad.join('; ') : 'AGREES: free two starts 12 h, free one start 8 h, Premium one start 12 h, no refill';
    out.wallS = Math.round((Date.now() - t0) / 1000);
    console.log('STAMINA DAY on the replayed chain, ' + days + ' days of server time, ' + GROUND + ' at Level ' + LEVEL + ', ' + out.wallS + ' s:');
    console.log('hero | cap | starts a day | hunted h a day | sessions (start h: hunted h, end)');
    for (const [id, r] of Object.entries(out.heroes)) console.log([id, r.capH + ' h', r.startsADay, r.huntedHoursADay, r.sessions.map((s) => s.fromH + ': ' + s.huntedH + ' ' + s.end).join('; ')].join(' | '));
    console.log(out.verdict);
    if (argv.includes('--write')) { writeFileSync(STAMINA_DAY_FILE, JSON.stringify(out, null, 1) + '\n'); console.log('wrote ' + STAMINA_DAY_FILE); }
    return bad.length ? 1 : 0;
  } finally {
    await world.close();
  }
}
function commitOf() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
