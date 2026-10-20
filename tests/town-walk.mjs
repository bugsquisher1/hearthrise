#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-walk.mjs — TWO PLAYERS IN THE COMMON SEE EACH OTHER WALK.
//
//   node tests/town-walk.mjs                the rules (pure node, then a real Chromium)
//   node tests/town-walk.mjs --pure         the pure rules only (no browser)
//   node tests/town-walk.mjs --mutate       every planted defect must turn a rule RED
//   node tests/town-walk.mjs --shots <dir>  also write the visual-gate screenshot (1440x900)
//
// mutant-anchors: src/session/town-presence.js src/session/account-session.js src/world/world-boot.js src/app/world-pane.js
// mutant-writes-tree: no — pure mutants plant into a temp copy of src/, page mutants into served overrides
//
// The server half (own position only, catalogue bounds, the 250 ms floor and
// 90/min, refused while hunting; walkers fresh, capped, never self, quiet,
// hunting, blocked either way or closed) is EXECUTED by the §6 self-check of
// supabase/migrations/2026-10-25-town-walk.sql on every chain replay
// (tests/schema-drift.mjs). The walking itself (re-aim without a jump, the clip
// never restarts, leave = gone) is tests/world-town-home.mjs family T. These are
// the client's rules:
//   TW-1  TWO ACCOUNTS, ONE TOWN: two AccountSessions on one server each see the
//         other's character (the server's id, name, level, role, tiles) and
//         never their own
//   TW-2  THE PUBLISH IS CAPPED: a hero walking every frame for 3 s sends at most
//         one hr_town_move per publishMinMs; standing still sends nothing until
//         the keepalive, then one; every publish names only the slot, the map,
//         four whole tiles and a facing
//   TW-3  BLOCKED = HIDDEN: a player this account blocks is not among the walkers
//         at once, before the server's next answer
//   TW-4  LEAVING: show(null) sends ONE leave (null map) and the other player's
//         next read no longer has them; closing a character leaves too, and a
//         publish still in flight when the hero left is followed by a leave
//   TW-5  REPLACED, NEVER MERGED; STALE SHOWS NOBODY: each answer replaces the
//         list; an answer older than staleMs shows nobody
//   TW-6  A WALKER IS THE SERVER'S ROW: a bad id, tile or facing is dropped; at
//         most `cap` are kept
//   TW-7  ONE CATALOGUE: every kind:'town' map row has its hr_town_maps seed row
//         with the same size
//   TW-9  ONE ACCOUNT, TWO CHARACTERS: each of an account's playing characters sees the
//         other in town (a walker is a user AND a slot), never itself
//   TW-10 VIEWING ANOTHER CHARACTER: a parked presence (its World pane closed) keeps its
//         body in town with keepalives and no reads, and leaves once it starts a hunt
//   TW-8  [page] in The Common a peer the server names walks beside the hero; a
//         right-click on them opens the player menu under their name (Inspect
//         gear, Message, Add friend, Invite to party, Block); the hero publishes
//         its own tiles; the Home button leaves town; zero console errors
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ANDY = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const TYLER = '11111111-0000-4000-8000-0000000000b2';

/* The fixture as a character standing in town: no hunt, no party, idle. */
function townEnvelope(name) {
  const e = clone(FIXTURE);
  for (const k of ['hunt', 'hunt_settings', 'party', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'hunt_server_now_ms']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: null, active_id: null });
  if (name) e.name = name;
  return e;
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const [acct, town, data, maps] = await Promise.all(['src/session/account-session.js', 'src/session/town-presence.js',
    'src/data/town-presence.js', 'src/data/world/maps/index.js'].map((p) => import(u(p))));
  return { acct, town, data, maps, sql: readFileSync(join(base, 'supabase/migrations/2026-10-25-town-walk.sql'), 'utf8') };
}

/* ── THE SHARED FAKE SERVER: hr_load, hr_town_move, hr_town_walkers, with the server's own rules ── */
function fakeWorld() {
  const pos = new Map();   // 'uid:slot' -> { uid, slot, map, x, y, gx, gy, dir } (a walker is a CHARACTER)
  const names = new Map();
  const blocks = new Set();   // 'a|b'
  const calls = [];
  const link = (uid) => ({
    rpc: async (name, args) => {
      calls.push({ uid, name, args });
      if (name === 'hr_load') return { ok: true, body: Object.assign(townEnvelope(names.get(uid)), { version: 1 }) };
      if (name === 'hr_town_move') {
        if (args.p_map === null) { pos.delete(uid + ':' + args.p_slot); return { ok: true, body: { ok: true, left: true } }; }
        pos.set(uid + ':' + args.p_slot, { uid, slot: args.p_slot, map: args.p_map, x: args.p_x, y: args.p_y, gx: args.p_gx, gy: args.p_gy, dir: args.p_dir });
        return { ok: true, body: { ok: true, stamped: true } };
      }
      if (name === 'hr_town_walkers') {
        const walkers = [];
        /* 2026-10-28-town-own-characters.sql: the caller's OTHER characters are walkers too (no account
           exclusion server-side); the client drops only its own character. */
        for (const p of pos.values()) {
          const id = p.uid;
          if (p.map !== args.p_map || blocks.has(uid + '|' + id) || blocks.has(id + '|' + uid)) continue;
          walkers.push({ id, slot: p.slot, name: names.get(id), level: 7, role: 'healer', x: p.x, y: p.y, gx: p.gx, gy: p.gy, dir: p.dir, age_ms: 0 });
        }
        return { ok: true, body: { ok: true, map: args.p_map, cap: 40, walkers } };
      }
      return { ok: true, body: { ok: true } };
    },
    accrue: async () => ({ ok: true, body: { accrued: false } }),
  });
  return { pos, names, blocks, calls, link };
}
const tick = () => new Promise((ok) => setTimeout(ok, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

async function account(M, world, uid, name, blocked) {
  world.names.set(uid, name);
  const auth = { userId: () => uid, token: () => 'jwt', signOut: async () => {} };
  const social = blocked ? () => ({ blocks: { has: (id) => blocked.has(id) }, start() {}, destroy() {} }) : undefined;
  const a = new M.acct.AccountSession({ auth, server: world.link(uid), social,
    timers: { setTimer: () => 0, clearTimer: () => {}, setInterval: () => 1, clearInterval: () => {} } });
  const r = await a.open(0);
  if (!r.ok) throw new Error('open failed: ' + r.reason);
  return a;
}

async function pureRules(M) {
  const fails = [];
  const fail = (m) => fails.push(m);
  const L = M.data.TOWN_PRESENCE;
  const at = (x, y, gx = x, gy = y, dir = 's') => ({ map: 'town_common', x, y, gx, gy, dir });

  // TW-1
  {
    const world = fakeWorld();
    const blockedByTyler = new Set();
    const A = await account(M, world, ANDY, 'Andy', null);
    const T = await account(M, world, TYLER, 'Tyler', blockedByTyler);
    const ta = A.townOf(0), tt = T.townOf(0);
    if (!ta || !tt) { fail('TW-1 an open character has no TownPresence'); return fails; }
    ta.show('town_common'); tt.show('town_common');
    ta.publish(at(12, 9, 15, 9, 'e')); tt.publish(at(10, 9));
    await settle();
    await ta.read(); await tt.read();
    const seenByT = tt.walkers(), seenByA = ta.walkers();
    if (seenByT.length !== 1 || seenByT[0].id !== ANDY || seenByT[0].name !== 'Andy' || seenByT[0].x !== 12 || seenByT[0].gx !== 15 || seenByT[0].dir !== 'e' || seenByT[0].role !== 'healer' || seenByT[0].level !== 7)
      fail('TW-1 Tyler sees ' + JSON.stringify(seenByT));
    if (seenByA.length !== 1 || seenByA[0].id !== TYLER) fail('TW-1 Andy sees ' + JSON.stringify(seenByA));
    // TW-3
    blockedByTyler.add(ANDY);
    if (tt.walkers().some((w) => w.id === ANDY)) fail('TW-3 a blocked player is still among the walkers');
    blockedByTyler.delete(ANDY);
    // TW-9 (Tyler 2026-10-19): one account, two characters playing: each sees the other, never itself.
    {
      const w9 = fakeWorld();
      w9.names.set(TYLER, 'Tyler');
      const mk = (slot) => new M.town.TownPresence({ server: w9.link(TYLER), slot, self: () => TYLER,
        timers: { setTimer: () => 0, clearTimer: () => {} } });
      const t0 = mk(0), t1 = mk(1);
      t0.show('town_common'); t1.show('town_common');
      t0.publish(at(10, 9)); t1.publish(at(14, 9));
      await settle();
      await t0.read(); await t1.read();
      const by0 = t0.walkers(), by1 = t1.walkers();
      if (by0.length !== 1 || by0[0].slot !== 1 || by1.length !== 1 || by1[0].slot !== 0)
        fail('TW-9 one account\'s two characters do not see each other: slot 0 sees ' + JSON.stringify(by0.map((x) => x.slot)) + ', slot 1 sees ' + JSON.stringify(by1.map((x) => x.slot)));
      t0.destroy(); t1.destroy();
    }
    // TW-4
    const before = world.calls.length;
    ta.show(null);
    await settle();
    const leaves = world.calls.slice(before).filter((c) => c.name === 'hr_town_move');
    if (leaves.length !== 1 || leaves[0].args.p_map !== null) fail('TW-4 show(null) sent ' + JSON.stringify(leaves.map((c) => c.args)));
    await tt.read();
    if (tt.walkers().length) fail('TW-4 after Andy left, Tyler still sees ' + JSON.stringify(tt.walkers()));
    if (ta.walkers().length) fail('TW-4 a presence off the town still lists walkers');
    T.close(0);
    await settle();
    if (world.pos.has(TYLER + ':0')) fail('TW-4 closing a character left its body in town');
  }
  // TW-2 and TW-4 (in flight) on one presence with a clock
  {
    const sent = [];
    let now = 0, release = null;
    const server = { rpc: (name, args) => { sent.push({ name, args }); return release ? new Promise((ok) => { const r = release; release = null; r(ok); }) : Promise.resolve({ ok: true, body: { ok: true, stamped: true, walkers: [] } }); } };
    const tp = new M.town.TownPresence({ server, slot: 2, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    tp.show('town_common');
    sent.length = 0;
    for (now = 0; now <= 3000; now += 16) { tp.publish(at(5 + Math.floor(now / 300), 9, 20, 9, 'e')); await tick(); }
    const moves = sent.filter((c) => c.name === 'hr_town_move');
    if (moves.length < 3 || moves.length > Math.floor(3000 / L.publishMinMs) + 1) fail('TW-2 3 s of walking sent ' + moves.length + ' publishes (cap ' + (Math.floor(3000 / L.publishMinMs) + 1) + ')');
    const keys = moves.length ? Object.keys(moves[0].args).sort().join(',') : '';
    if (keys !== 'p_dir,p_gx,p_gy,p_map,p_slot,p_x,p_y' || !moves.every((c) => c.args.p_slot === 2 && [c.args.p_x, c.args.p_y, c.args.p_gx, c.args.p_gy].every(Number.isInteger)))
      fail('TW-2 a publish names ' + keys + ' ' + JSON.stringify(moves[0] && moves[0].args));
    sent.length = 0;
    const still = at(15, 9);
    tp.publish(still); await tick();
    for (now = 4200; now < 4200 + L.keepaliveMs - 100; now += 250) { tp.publish(still); await tick(); }
    const quiet = sent.filter((c) => c.name === 'hr_town_move').length;
    now = 4200 + L.keepaliveMs + 50; tp.publish(still); await tick();
    const alive = sent.filter((c) => c.name === 'hr_town_move').length - quiet;
    if (quiet !== 1 || alive !== 1) fail('TW-2 standing still sent ' + quiet + ' before the keepalive and ' + alive + ' at it (want 1 and 1)');
    tp.destroy();
    // the FIRST publish still in flight when the hero leaves: its body must go too
    const tq = new M.town.TownPresence({ server, slot: 2, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    tq.show('town_common');
    let resolveMove = null;
    release = (ok) => { resolveMove = ok; };
    sent.length = 0;
    tq.publish(at(16, 9)); await tick();
    tq.show(null);
    if (resolveMove) resolveMove({ ok: true, body: { ok: true, stamped: true } });
    await settle();
    const tail = sent.filter((c) => c.name === 'hr_town_move');
    if (tail.length !== 2 || tail[1].args.p_map !== null) fail('TW-4 a publish in flight when the hero left town was not followed by a leave: ' + JSON.stringify(tail.map((c) => c.args.p_map)));
    tq.destroy();
  }
  // TW-10: another character is viewed - this one STAYS in town (keepalive, no leave) until it hunts
  {
    const sent = [];
    let now = 0, hunting = false;
    const server = { rpc: (name, args) => { sent.push({ name, args }); return Promise.resolve({ ok: true, body: { ok: true, stamped: true, walkers: [] } }); } };
    let tick10 = null;
    const tp = new M.town.TownPresence({ server, slot: 1, self: () => TYLER, busy: () => hunting,
      timers: { setTimer: (fn) => { tick10 = fn; return 1; }, clearTimer: () => {} }, now: () => now });
    tp.show('town_common');
    tp.publish(at(12, 9)); await settle();
    sent.length = 0;
    if (typeof tp.park === 'function') tp.park(); else tp.show(null);   // the World pane switched to another character
    for (now = 1000; now <= 3 * L.keepaliveMs; now += L.pollMs) { if (tick10) tick10(); await settle(); }
    const moves = sent.filter((c) => c.name === 'hr_town_move');
    if (moves.some((c) => c.args.p_map === null) || moves.length < 2)
      fail('TW-10 an unviewed character left town or stopped its keepalive: ' + JSON.stringify(moves.map((c) => c.args.p_map)));
    if (sent.some((c) => c.name === 'hr_town_walkers')) fail('TW-10 an unviewed character still reads the walkers');
    sent.length = 0; hunting = true;
    if (tick10) tick10(); await settle();
    const gone = sent.filter((c) => c.name === 'hr_town_move');
    if (gone.length !== 1 || gone[0].args.p_map !== null) fail('TW-10 an unviewed character that starts a hunt did not leave town: ' + JSON.stringify(gone.map((c) => c.args)));
    tp.destroy();
  }
  // TW-5, TW-6
  {
    let now = 1000, answer = null;
    const W = (o) => Object.assign({ id: ANDY, slot: 0, name: 'Andy', level: 3, role: null, x: 1, y: 9, gx: 1, gy: 9, dir: 's' }, o);
    const server = { rpc: async () => ({ ok: true, body: answer }) };
    const tp = new M.town.TownPresence({ server, slot: 0, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    answer = { ok: true, walkers: [W({})] };
    tp.show('town_common'); await settle();
    answer = { ok: true, walkers: [W({ id: 'bbbbbbbb-0000-4000-8000-0000000000c3', name: 'Mira' })] };
    await tp.read();
    const names = tp.walkers().map((w) => w.name).join(',');
    if (names !== 'Mira') fail('TW-5 the second answer was merged, not replaced: ' + names);
    now += L.staleMs + 1;
    if (tp.walkers().length) fail('TW-5 an answer older than staleMs still shows people');
    const bad = [W({ id: 'nope' }), W({ id: 'cccccccc-0000-4000-8000-0000000000c4', x: -1 }), W({ id: 'cccccccc-0000-4000-8000-0000000000c5', dir: 'up' }),
      W({ id: 'cccccccc-0000-4000-8000-0000000000c6', x: 2.5 }), W({ id: TYLER, name: 'Me' })];
    const many = Array.from({ length: L.cap + 5 }, (_, i) => W({ id: 'dddddddd-0000-4000-8000-' + String(i).padStart(12, '0'), name: 'p' + i }));
    answer = { ok: true, walkers: bad.concat(many) };
    await tp.read();
    const got = tp.walkers();
    if (got.length !== L.cap || got.some((w) => w.name === 'Me' || w.id === 'nope')) fail('TW-6 the walkers kept ' + got.length + ' (cap ' + L.cap + '): ' + got.slice(0, 3).map((w) => w.name).join(','));
    tp.destroy();
  }
  // TW-7
  {
    const seeds = new Map();
    for (const m of M.sql.matchAll(/\('([a-z0-9_]+)', '([a-z0-9_]+)', (\d+), (\d+)\)/g)) seeds.set(m[1], [Number(m[3]), Number(m[4])]);
    for (const row of M.maps.WORLD_MAPS.filter((m) => m.kind === 'town')) {
      const s = seeds.get(row.id);
      const w = row.rows[0].length, h = row.rows.length;
      if (!s || s[0] !== w || s[1] !== h) fail('TW-7 town map ' + row.id + ' is ' + w + 'x' + h + ' but hr_town_maps seeds ' + JSON.stringify(s));
    }
    if (!seeds.size) fail('TW-7 no hr_town_maps seed row found');
  }
  return fails;
}

/* ── THE PAGE ── */
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body, at: Date.now() });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(Object.assign(townEnvelope('Tyler'), { version: ++s.version }));
    if (name === 'hr-accrue') return json({ accrued: false });
    if (name === 'hr_town_walkers') return json({ ok: true, map: body.p_map, cap: 40, walkers: [
      { id: ANDY, slot: 0, name: 'Andy', level: 9, role: 'healer', x: 13, y: 9, gx: 14, gy: 9, dir: 'w', age_ms: 400 }] });
    if (name === 'hr_town_move') return json({ ok: true, stamped: true });
    if (name === 'hr_chat_recent') return json({ ok: true, zone: 'local:town', party: null, lines: [] });
    if (name === 'hr_social_state') return json({ ok: true, friends: [], incoming: [], outgoing: [], blocks: [] });
    if (name === 'hr_whispers_recent') return json({ ok: true, lines: [] });
    return json({ ok: true });
  });
}

async function pageRules(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const vp = { width: 1440, height: 900 };
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { calls: [], version: 1 };
    await stub(page, s);
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    if (!await wait(page, () => document.querySelector('.world-canvas') && /Common/.test((document.querySelector('.world-title') || {}).textContent || ''))) {
      fails.push('TW-8 the World did not open on The Common'); await ctx.close(); return fails;
    }
    await page.waitForTimeout(3000);   // two polls, a few publishes, Andy walking
    const reads = s.calls.filter((c) => c.name === 'hr_town_walkers');
    const moves = s.calls.filter((c) => c.name === 'hr_town_move');
    if (!reads.length || reads.some((c) => c.body.p_map !== 'town_common')) fail('TW-8 the page read ' + JSON.stringify(reads.map((c) => c.body)));
    if (!moves.length || moves.some((c) => c.body.p_map !== 'town_common' || ![c.body.p_x, c.body.p_y, c.body.p_gx, c.body.p_gy].every(Number.isInteger)))
      fail('TW-8 the hero published ' + JSON.stringify(moves.map((c) => c.body)));
    if (moves.length > 5) fail('TW-8 the hero published ' + moves.length + ' times in about 3 s');
    if (shots) await page.screenshot({ path: join(shots, 'town-two-heroes-1440x900.png') });
    const scan = await page.evaluate(() => {
      const cv = document.querySelector('.world-canvas');
      const r = cv.getBoundingClientRect();
      const seen = {};
      for (let y = r.top + 4; y < r.bottom; y += 8) for (let x = r.left + 4; x < r.right; x += 8) {
        cv.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        const m = document.querySelector('.hw-menu.is-on');
        if (!m) continue;
        seen[m.querySelector('.hw-menu-title').textContent] = Array.from(m.querySelectorAll('.hw-mi')).map((b) => b.textContent).join('|');
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
      return seen;
    });
    if (scan.Andy !== 'Inspect gear|Message|Add friend|Invite to party|Block') fail('TW-8 a right-click on Andy gave ' + JSON.stringify(scan));
    if (scan.Tyler) fail('TW-8 the viewed hero opened a player menu on itself');
    const n = s.calls.length;
    await page.click('[data-world-choice="home"]');
    await page.waitForTimeout(600);
    const left = s.calls.slice(n).filter((c) => c.name === 'hr_town_move');
    if (!left.length || left[left.length - 1].body.p_map !== null) fail('TW-8 the Home button did not leave town: ' + JSON.stringify(left.map((c) => c.body)));
    const after = s.calls.length;
    await page.waitForTimeout(2500);
    if (s.calls.slice(after).some((c) => c.name === 'hr_town_walkers')) fail('TW-8 the home scene still polls the town');
    if (errors.length) fail('TW-8 console errors: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
  function fail(m) { fails.push(m); }
}

/* ── THE MUTANTS: each must turn at least one rule red. ── */
const PURE_MUTANTS = [
  ['the publish is not capped', 'src/session/town-presence.js', '    if (since < this.limits.publishMinMs) return false;\n', ''],
  ['standing still never keeps alive', 'src/session/town-presence.js', ' && !(keepalive || since >= this.limits.keepaliveMs)) return false;', ') return false;'],
  ['a blocked player stays drawn', 'src/session/town-presence.js', 'return this._walkers.filter((w) => !this._hidden(w.id));', 'return this._walkers.slice();'],
  ['your own character is a walker', 'src/session/town-presence.js', "if ((w.id === self && w.slot === this._slot) || seen.has(key)) continue;", 'if (seen.has(key)) continue;'],
  ['your other character is hidden with you', 'src/session/town-presence.js', "if ((w.id === self && w.slot === this._slot) || seen.has(key)) continue;", 'if (w.id === self || seen.has(key)) continue;'],
  ['leaving sends nothing', 'src/session/town-presence.js', '    if (!this._out) return;\n', '    return;\n'],
  ['a leave is not sent after an in-flight publish', 'src/session/town-presence.js', 'if (this._dead || this._map !== p.map) this._leave(); else this._sent = p;', 'this._sent = p;'],
  ['a stale list still shows people', 'src/session/town-presence.js', ' || this._now() - this._readAt > this.limits.staleMs', ''],
  ['the list is merged, not replaced', 'src/session/town-presence.js', 'this._walkers = b.off ? [] : list;', 'this._walkers = this._walkers.concat(list);'],
  ['the walkers are not capped', 'src/session/town-presence.js', '      if (list.length >= this.limits.cap) break;\n', ''],
  ['viewing another character leaves town', 'src/session/town-presence.js', '    this._parked = true;\n', '    this.show(null); return;\n'],
  ['a parked character never keeps alive', 'src/session/town-presence.js', '      if (this._want && this._now() - this._sentAt >= this.limits.keepaliveMs) this._flush(true);\n      return;', '      return;'],
  ['a parked character that hunts stays in town', 'src/session/town-presence.js', '      if (this._busy()) { this.show(null); return; }\n', ''],
  ['closing a character keeps its body in town', 'src/session/account-session.js', 'if (town) { this._towns.delete(slot); town.destroy(); }', 'void town;'],
];
const PAGE_MUTANTS = [
  ['the World never tells the presence it is in town', 'src/world/world-boot.js', "      town.show(map.kind === 'town' ? map.id : null);\n", ''],
  ['the pane never hands the World its presence', 'src/app/world-pane.js', 'runtime = await bootWorld(pane, { view, character, emit, town });', 'runtime = await bootWorld(pane, { view, character, emit });'],
  ['the home scene stays in town', 'src/world/world-boot.js', "      town.show(map.kind === 'town' ? map.id : null);", "      if (map.kind === 'town') town.show(map.id);"],
];

function copySrc() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-town-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor[\\/]?/.test(p.slice(ROOT.length)) });
  mkdirSync(join(tmp, 'supabase/migrations'), { recursive: true });
  cpSync(join(ROOT, 'supabase/migrations/2026-10-25-town-walk.sql'), join(tmp, 'supabase/migrations/2026-10-25-town-walk.sql'));
  return tmp;
}

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'town-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  const onlyPure = process.argv.includes('--pure');
  const loadRoot = () => load(ROOT);
  if (!process.argv.includes('--mutate')) {
    const fails = [...await pureRules(await loadRoot()), ...(onlyPure ? [] : await pageRules(null, shots))];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'town-walk: ' + fails.length + ' rule(s) RED'
      : 'town-walk: two accounts see each other; the publish is capped; blocks hidden; leaving leaves; replaced, never merged' + (onlyPure ? '' : '; the peer walks in The Common with the one menu') + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = [...await pureRules(await loadRoot()), ...(onlyPure ? [] : await pageRules(null, null))];
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of PURE_MUTANTS) {
    const tmp = copySrc();
    try {
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      let fails;
      try { fails = await pureRules(await load(tmp)); } catch (e) { fails = ['threw: ' + e.message]; }
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  for (const [name, file, from, to] of onlyPure ? [] : PAGE_MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await pageRules({ [file]: text.replace(from, to) }, null);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  const n = PURE_MUTANTS.length + (onlyPure ? 0 : PAGE_MUTANTS.length);
  console.log(bad ? 'town-walk --mutate: ' + bad + ' escaped' : 'town-walk --mutate: ' + n + '/' + n + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
