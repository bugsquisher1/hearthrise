#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-walk.mjs — TWO PLAYERS IN THE COMMON SEE EACH OTHER WALK.
//
//   node tests/town-walk.mjs                the rules (pure node, then a real Chromium)
//   node tests/town-walk.mjs --pure         the pure rules only (no browser)
//   node tests/town-walk.mjs --mutate       every planted defect must turn a rule RED
//   node tests/town-walk.mjs --shots <dir>  also write the visual-gate screenshot (1440x900)
//
// mutant-anchors: src/session/town-presence.js src/session/account-session.js src/world/world-boot.js src/world/walk-scene.js src/world/sandbox-scene.js src/app/world-pane.js supabase/migrations/2027-01-28-town-stands.sql
// mutant-writes-tree: no — pure mutants plant into a temp copy of src/, page mutants into served overrides
//
// The server half (own position only, catalogue bounds, the 250 ms floor and
// 90/min, refused while hunting; THE STANDS: one body a stand, an unviewed
// worker at its station, a hunt out and back by the arrival, the 61st player in
// instance 2, parties and friends together, the windowed read capped and only
// changes) is EXECUTED by the self-checks of
// supabase/migrations/2026-10-25-town-walk.sql and 2027-01-28-town-stands.sql on
// every chain replay (tests/schema-drift.mjs), and on a committed database by
// tests/town-stands.mjs. The walking itself (re-aim without a jump, the clip
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
//   TW-5  A WHOLE ANSWER REPLACES, A DELTA ONLY CHANGES; STALE SHOWS NOBODY: a `full`
//         answer replaces the list; a delta upserts the walkers it names and drops
//         the `gone`, never re-adding anyone; a read sends the last answer's cursor
//         and the hero's centre, a whole read at least every fullEveryMs sends none;
//         an answer older than staleMs shows nobody
//   TW-6  A WALKER IS THE SERVER'S ROW: a bad id, tile or facing is dropped; at
//         most `cap` (the server's view cap, TOWN_INSTANCE.cap) are kept; one that
//         neither stands nor walks inside the answer's `area` is dropped
//   TW-7  ONE CATALOGUE: every kind:'town' map row has its hr_town_maps row (the
//         generated stations catalogue) with the same size
//   TW-9  ONE ACCOUNT, TWO CHARACTERS: each of an account's playing characters sees the
//         other in town (a walker is a user AND a slot), never itself
//   TW-10 VIEWING ANOTHER CHARACTER: a parked presence (its World pane closed) keeps its
//         body in town with hr_town_here keepalives (its slot and map, no tile) and no
//         reads, and leaves once it starts a hunt
//   TW-11 BOOT / RELOAD: every playing character not hunting gets a town body on open, so the
//         viewed one sees the other without viewing it first; a hunting one is not drawn; one
//         BACK from a hunt (the server's hunt section names the ended session) stands in town;
//         a parked one whose hunt ends while the page is open stands again on the re-read
//   TW-13 SWITCHED AWAY MID-HUNT: a character that went hunting while viewed (its World showed
//         no town) and is then left for another stands on the arrival stand the SERVER gives it
//         once its hunt ends, and names no tile of its own
//   TW-12 ONE BODY PER CHARACTER ON THE SERVER: the chain's last hr_town_move keys its upsert,
//         floor and hunting delete by user AND slot, and town_positions' primary key is
//         (user_id, slot), as the fake server below models it (Tyler live v0.2.20: one
//         account row meant each character overwrote the other)
//   TW-15 WHERE THE BODY STANDS: from boot on the SERVER's stand (never the map's start);
//         placeOn is the body's place across a park and a show (a pane shown again starts its
//         hero there); a parked body back from a hunt stands where the server set it down
//   TW-17 READ ONLY WHAT IS DRAWN (perf audit 10-23): a shown town reads its people on the poll only while a
//         frame asks for them; not drawn it reads nothing, and the first frame after a pause reads at once
//   TW-16 A PEER WEARS ITS OWN LOOK (Tyler live v0.2.31: "Just defaults to the paladin"): the chain's
//         last hr_town_look (the look hr_town_view sends) names a walker's role with the character's own `role` section function
//         (the worn weapon's role), never the retired action-set pick; another player who appears is
//         drawn in the outfit its own screen shows (its weapon's, or the one it chose), and still is
//         after the viewer reloads
//   TW-18 NO TILE BEFORE THE STAND (the real town, 2026-10-25: every hero stacked on the start tile): a
//         viewed presence publishes nothing and has no place until the server's stand is known (me()),
//         then publishes from it; a parked one never names a tile at all
//   TW-19 THE SERVER MOVES THE STAND: an answer with a new stand changes me() (the World walks the
//         hero there); a parked body's placeOn follows the server's new stand; go(station) sends
//         only the slot and a station id, and a bad station sends nothing
//   TW-14 [page] ONE ACCOUNT, TWO HEROES, SWITCHED A -> B -> A (Andy 10-21: "Not able to consistently
//         see both characters on a map"): after every switch the viewed hero sees the other one drawn
//         in town; switching never moves a hero (the one shown again stands where it stood, never
//         at its stand or the map's start) and never resets its Town / Home pick; zero console errors
//   TW-8  [page] in town a peer the server names walks beside the hero; a
//         right-click on them opens the player menu under their name (Inspect
//         gear, Message, Add friend, Invite to party, Block); the hero starts on
//         its server stand and publishes its own tiles; when the server moves its
//         stand the hero WALKS there (display only) and publishes the walk; the
//         Home button leaves town; back in town, set down by the server mid-walk,
//         it walks on to its stand; zero console errors
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB, UID } from './_client-harness.mjs';
import { roleForWeapon as ROLE_FOR_WEAPON } from '../src/data/hunt-roles.js';
/* the stations as the server catalogue reads them (the seed's rows, or the real town's STATIONS) */
import { townStations, OUT_FILE as CATALOGUE } from '../tools/gen-town-stations.mjs';
import { TOWN_NAME } from '../src/data/world/town/plan.js';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ANDY = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const TYLER = '11111111-0000-4000-8000-0000000000b2';
/* the fakes' read area: the whole town (a real answer's area is the viewer's window; the presence drops what lies outside it) */
const AREA = Object.freeze([0, 0, 255, 255]);
/* the server's stand answer (hr_town_view / hr_town_here `me`) */
const ME = (x = 4, y = 11, o = {}) => Object.assign({ map: 'town_common', inst: 1, station: 'green', stand: 1, x, y, gx: x, gy: y, dir: 's', at: [x, y],
  work: false, since_ms: 1 }, o);

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
  const [acct, town, data, maps, cast, mapc, bookm, sets, terrain, look, roles, stations] = await Promise.all(['src/session/account-session.js', 'src/session/town-presence.js',
    'src/data/town-presence.js', 'src/data/world/maps/index.js', 'src/world/town-scene.js', 'src/world/core/map-compile.js', 'src/world/core/book.js',
    'src/data/world/atlas-sets.js', 'src/data/world/terrain.js', 'src/session/hero-look.js', 'src/data/hunt-roles.js', 'src/data/world/stations.js'].map((p) => import(u(p))));
  return { base, acct, town, data, maps, cast, mapc, bookm, sets, terrain, look, roles, stations,
    catalogue: readFileSync(join(base, 'supabase/migrations', CATALOGUE), 'utf8') };
}

/* The chain's last word on `fn` (its body, from the file the apply order applies last), and the function the
   chain's `role` state section names. A migration copied into `base` (a mutant) is read from there. */
function chainOf(base, fn) {
  const order = JSON.parse(readFileSync(join(ROOT, 'tests/schema-apply-order.json'), 'utf8')).order;
  let body = null, roleFn = null;
  for (const file of order) {
    const rel = join('supabase/migrations', file);
    let sql;
    try { sql = readFileSync(existsSync(join(base, rel)) ? join(base, rel) : join(ROOT, rel), 'utf8'); } catch { continue; }
    const i = sql.search(new RegExp('create or replace function public\\.' + fn + '\\(', 'i'));
    if (i >= 0) {
      const tag = /\$[a-z_]*\$/i.exec(sql.slice(i));
      const a = i + tag.index + tag[0].length;
      body = sql.slice(a, sql.indexOf(tag[0], a));
    }
    for (const m of sql.matchAll(/\(\s*'role',\s*'(hr_[a-z_]+)'/g)) roleFn = m[1];
  }
  return { body, roleFn };
}

/* ── THE SHARED FAKE SERVER: hr_load, hr_town_move, hr_town_here, hr_town_view, with the server's own rules
   (2027-01-28-town-stands.sql): the server picks every body's stand (the idle station's lowest free stand, the
   arrival's for one back from a hunt), a hunter has none, a steered tile wins while it moved after the stand was
   taken, and the read names the viewer's own character too (the CLIENT drops it). ── */
function fakeWorld(M) {
  const row = townStations(M.stations).town_common;
  const standsOf = (role) => { const st = row.find((x) => x.role === role); return st.stands.concat(st.overflow).map((t, i) => ({ station: st.id, stand: i + 1, x: t[0], y: t[1] })); };
  const IDLE = standsOf('idle'), ARRIVE = standsOf('arrive');
  const pos = new Map();      // 'uid:slot' -> { uid, slot, map, x, y, gx, gy, dir, moved }: its steered tile (a walker is a CHARACTER)
  const stands = new Map();   // 'uid:slot' -> { uid, slot, map, station, stand, x, y, since }: the stand the server holds for it
  const names = new Map();
  const blocks = new Set();   // 'a|b'
  const calls = [];
  const hunting = new Set();  // 'uid:slot' out on a hunt (the server holds no body for it)
  const back = new Set();     // 'uid:slot' back from a hunt: its hunt section names the ENDED session; set down at the arrival
  /* 'uid:slot' -> { weapon, outfit }: what a character holds and chose, as TW-16 reads the chain: its walker's
     role is its own `role` section's (the worn weapon's, hunt-roles.js roleForWeapon = hr_hunt_weapon_roles), its
     outfit the one it chose. A character with no look is the healer the older rules expect. */
  const looks = new Map();
  const roleOfLook = (l) => (l.weapon ? ROLE_FOR_WEAPON(l.weapon, null) : null);
  let version = 0, clock = 0;
  const place = (key, uid, slot, map) => {
    const held = new Set(Array.from(stands.values()).map((b) => b.station + ':' + b.stand));
    const t = (back.has(key) ? ARRIVE : IDLE).find((s) => !held.has(s.station + ':' + s.stand));
    stands.set(key, { uid, slot, map, station: t.station, stand: t.stand, x: t.x, y: t.y, since: ++clock });
  };
  const where = (key) => {
    const b = stands.get(key);
    if (!b) return null;
    const p = pos.get(key);
    const steered = !!p && p.map === b.map && p.moved > b.since;
    return { map: b.map, inst: 1, station: b.station, stand: b.stand, x: steered ? p.x : b.x, y: steered ? p.y : b.y,
      gx: steered ? p.gx : b.x, gy: steered ? p.gy : b.y, dir: steered ? p.dir : 's', at: [b.x, b.y], work: false, since_ms: b.since };
  };
  const link = (uid) => ({
    rpc: async (name, args) => {
      calls.push({ uid, name, args });
      const key = uid + ':' + args.p_slot;
      if (name === 'hr_load') {
        const e = hunting.has(key) ? clone(FIXTURE) : townEnvelope(names.get(uid));
        /* hr_hunt_section_view names the open OR NEWEST session: a hero home from a hunt still has one, ended */
        if (!hunting.has(key) && back.has(key)) e.hunt = Object.assign(clone(FIXTURE.hunt), { ended: true });
        const l = looks.get(key);
        if (l) {
          e.role = { id: roleOfLook(l), weapon: l.weapon };
          e.outfit = { worn: l.outfit, colors: {}, owned: l.outfit ? [l.outfit] : [] };
        }
        return { ok: true, body: Object.assign(e, { version: ++version, account: { max_concurrent: 4 } }) };
      }
      if (name === 'hr_town_here' || name === 'hr_town_view') {
        if (hunting.has(key)) { stands.delete(key); return { ok: true, body: { ok: false, error: 'hunting' } }; }
        if (!stands.has(key)) place(key, uid, args.p_slot, args.p_map);
        if (name === 'hr_town_here') return { ok: true, body: { ok: true, me: where(key) } };
        const walkers = [];
        for (const [k, b] of stands) {
          if (b.map !== args.p_map || hunting.has(k) || blocks.has(uid + '|' + b.uid) || blocks.has(b.uid + '|' + uid)) continue;
          const w = where(k), l = looks.get(k);
          walkers.push({ id: b.uid, slot: b.slot, name: names.get(b.uid), level: 7, role: l ? world.walkerRole(l) : 'healer',
            outfit: l && l.outfit ? { id: l.outfit, colors: {} } : null, x: w.x, y: w.y, gx: w.gx, gy: w.gy, dir: w.dir, age_ms: 0, station: w.station, work: false });
        }
        return { ok: true, body: { ok: true, map: args.p_map, inst: 1, cap: 120, full: true, cursor: ++clock * 1000, area: AREA, walkers, gone: [], me: where(key) } };
      }
      if (name === 'hr_town_move') {
        if (args.p_map === null) { pos.delete(key); stands.delete(key); return { ok: true, body: { ok: true, left: true } }; }
        if (hunting.has(key)) { pos.delete(key); stands.delete(key); return { ok: true, body: { ok: false, error: 'hunting' } }; }
        const o = pos.get(key);
        const moved = !o || o.x !== args.p_x || o.y !== args.p_y || o.gx !== args.p_gx || o.gy !== args.p_gy || o.dir !== args.p_dir ? ++clock : o.moved;
        pos.set(key, { uid, slot: args.p_slot, map: args.p_map, x: args.p_x, y: args.p_y, gx: args.p_gx, gy: args.p_gy, dir: args.p_dir, moved });
        if (!stands.has(key)) place(key, uid, args.p_slot, args.p_map);
        return { ok: true, body: { ok: true, stamped: true } };
      }
      return { ok: true, body: { ok: true } };
    },
    accrue: async () => ({ ok: true, body: { accrued: false } }),
  });
  /* the role the server names for a walker with a look (TW-16 sets it from the chain's body) */
  const world = { pos, stands, names, blocks, calls, hunting, back, looks, link, walkerRole: roleOfLook, IDLE, ARRIVE };
  return world;
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

/* A one-presence server for the clock rules: every answer carries the server's stand (`me`), so publishes may go. */
const meServer = (sent) => ({ rpc: (name, args) => { sent.push({ name, args });
  return Promise.resolve({ ok: true, body: { ok: true, stamped: true, full: true, walkers: [], gone: [], me: ME() } }); } });

async function pureRules(M) {
  const fails = [];
  const fail = (m) => fails.push(m);
  const L = M.data.TOWN_PRESENCE;
  const at = (x, y, gx = x, gy = y, dir = 's') => ({ map: 'town_common', x, y, gx, gy, dir });

  // TW-1
  {
    const world = fakeWorld(M);
    const blockedByTyler = new Set();
    const A = await account(M, world, ANDY, 'Andy', null);
    const T = await account(M, world, TYLER, 'Tyler', blockedByTyler);
    const ta = A.townOf(0), tt = T.townOf(0);
    if (!ta || !tt) { fail('TW-1 an open character has no TownPresence'); return fails; }
    ta.show('town_common'); tt.show('town_common');
    await settle();   // each read names its stand (me): only then may a tile be published
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
      const w9 = fakeWorld(M);
      w9.names.set(TYLER, 'Tyler');
      const mk = (slot) => new M.town.TownPresence({ server: w9.link(TYLER), slot, self: () => TYLER,
        timers: { setTimer: () => 0, clearTimer: () => {} } });
      const t0 = mk(0), t1 = mk(1);
      t0.show('town_common'); t1.show('town_common');
      await settle();
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
    if (world.pos.has(TYLER + ':0') || world.stands.has(TYLER + ':0')) fail('TW-4 closing a character left its body in town');
  }
  // TW-2 and TW-4 (in flight) on one presence with a clock
  {
    const sent = [];
    let now = 0, release = null;
    const server = { rpc: (name, args) => { sent.push({ name, args }); return release && name === 'hr_town_move' ? new Promise((ok) => { const r = release; release = null; r(ok); })
      : Promise.resolve({ ok: true, body: { ok: true, stamped: true, full: true, walkers: [], gone: [], me: ME() } }); } };
    const tp = new M.town.TownPresence({ server, slot: 2, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    tp.show('town_common'); await settle();
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
    tq.show('town_common'); await settle();
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
  // TW-18: no tile before the server's stand; a parked character never names one
  {
    const sent = [];
    let gate = null;
    const answer = { ok: true, body: { ok: true, stamped: true, full: true, walkers: [], gone: [], me: ME(6, 12) } };
    const server = { rpc: (name, args) => { sent.push({ name, args });
      if (name === 'hr_town_view' && !gate) return new Promise((ok) => { gate = () => ok(answer); });
      return Promise.resolve(answer); } };
    let now = 0;
    const tp = new M.town.TownPresence({ server, slot: 0, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    tp.show('town_common');
    for (now = 0; now <= 2000; now += 100) { tp.publish(at(11, 9)); await tick(); }   // the World's guess: the map's start
    if (sent.some((c) => c.name === 'hr_town_move')) fail('TW-18 a tile was published before the server named the stand: ' + JSON.stringify(sent.filter((c) => c.name === 'hr_town_move').map((c) => c.args)));
    if (tp.placeOn('town_common') !== null) fail('TW-18 the body has a place (' + tp.placeOn('town_common') + ') before the server named its stand');
    if (gate) gate();
    await settle();
    if (String(tp.placeOn('town_common')) !== '6,12') fail('TW-18 once the server named the stand, the body stands at ' + tp.placeOn('town_common') + ', not (6,12)');
    now += 1000; tp.publish(at(6, 12)); await settle();
    const first = sent.filter((c) => c.name === 'hr_town_move')[0];
    if (!first || first.args.p_x !== 6 || first.args.p_y !== 12) fail('TW-18 the first publish after the stand names ' + JSON.stringify(first && first.args) + ', not the stand the World stands on');
    tp.destroy();
    const parkedSent = [];
    let pnow = 0, ptick = null;
    const tq = new M.town.TownPresence({ server: meServer(parkedSent), slot: 1, self: () => TYLER, town: 'town_common',
      timers: { setTimer: (fn) => { ptick = fn; return 1; }, clearTimer: () => {} }, now: () => pnow });
    tq.stand(); await settle();
    for (pnow = 0; pnow <= 90000; pnow += L.pollMs) { ptick(); await settle(); }
    if (parkedSent.some((c) => c.name === 'hr_town_move' && c.args.p_map !== null)) fail('TW-18 a parked character named a tile of its own');
    if (!parkedSent.some((c) => c.name === 'hr_town_here')) fail('TW-18 CONTROL: the parked character never said it was here');
    tq.destroy();
  }
  // TW-10: another character is viewed - this one STAYS in town (keepalive, no leave, no tile) until it hunts
  {
    const sent = [];
    let now = 0, hunting = false;
    let tick10 = null;
    const tp = new M.town.TownPresence({ server: meServer(sent), slot: 1, self: () => TYLER, busy: () => hunting,
      timers: { setTimer: (fn) => { tick10 = fn; return 1; }, clearTimer: () => {} }, now: () => now });
    tp.show('town_common'); await settle();
    tp.publish(at(12, 9)); await settle();
    sent.length = 0;
    if (typeof tp.park === 'function') tp.park(); else tp.show(null);   // the World pane switched to another character
    const parked = L.parkedKeepaliveMs || L.keepaliveMs;
    for (now = 1000; now <= 3 * parked; now += L.pollMs) { if (tick10) tick10(); await settle(); }
    const heres = sent.filter((c) => c.name === 'hr_town_here');
    if (sent.some((c) => c.name === 'hr_town_move') || heres.length < 2)
      fail('TW-10 an unviewed character left town, named a tile or stopped its keepalive: ' + JSON.stringify(sent.map((c) => c.name)));
    if (heres.some((c) => Object.keys(c.args).sort().join(',') !== 'p_map,p_slot' || c.args.p_slot !== 1 || c.args.p_map !== 'town_common'))
      fail('TW-10 a keepalive names more than its slot and map: ' + JSON.stringify(heres[0] && heres[0].args));
    /* perf audit 10-23: a parked body keeps alive at parkedKeepaliveMs (inside the server's 30 s), not the walking pace */
    if (heres.length > 3 || !(parked > L.keepaliveMs && parked < 30000)) fail('TW-10 a parked body kept alive ' + heres.length + ' times in ' + 3 * parked + ' ms (every ' + parked + ' ms)');
    if (sent.some((c) => c.name === 'hr_town_view')) fail('TW-10 an unviewed character still reads the town');
    sent.length = 0; hunting = true;
    if (tick10) tick10(); await settle();
    const gone = sent.filter((c) => c.name === 'hr_town_move');
    if (gone.length !== 1 || gone[0].args.p_map !== null) fail('TW-10 an unviewed character that starts a hunt did not leave town: ' + JSON.stringify(gone.map((c) => c.args)));
    tp.destroy();
  }
  // TW-17 (perf audit 10-23: the town read 30 a minute with no town drawn): a shown town reads its people on
  // the poll only while a frame asks for them (walkers()); not drawn (a hidden tab, a pane not drawing) it reads
  // nothing, and the first frame after the pause reads at once
  {
    const sent = [];
    let now = 0, tick = null;
    const tp = new M.town.TownPresence({ server: meServer(sent), slot: 0, self: () => TYLER,
      timers: { setTimer: (fn) => { tick = fn; return 1; }, clearTimer: () => {} }, now: () => now });
    tp.show('town_common'); await settle();
    const reads = () => sent.filter((c) => c.name === 'hr_town_view').length;
    for (now = 100; now <= 20000; now += L.pollMs) { tp.walkers(); tick(); await settle(); }
    const drawn = reads();
    if (drawn < 20000 / L.pollMs - 1) fail('TW-17 a drawn town read its people ' + drawn + ' times in 20 s (every pollMs)');
    /* the last frame drew at 20 s; two polls of grace, then nothing while nobody draws */
    for (now = 20100; now <= 20000 + 2 * L.pollMs; now += L.pollMs) { tick(); await settle(); }
    const quiet = reads();
    for (; now <= 60000; now += L.pollMs) { tick(); await settle(); }
    if (reads() !== quiet) fail('TW-17 a town nobody draws read its people ' + (reads() - quiet) + ' times in 40 s');
    tp.walkers(); await settle();
    if (reads() !== quiet + 1) fail('TW-17 the first frame after a pause did not read the people at once');
    tp.destroy();
  }
  // TW-11 (Tyler 2026-10-20 "can't see my other character in town"): a fresh boot / reload with two
  // playing characters: the viewed one sees the other WITHOUT the other ever being viewed; a hunter is not drawn.
  {
    const w11 = fakeWorld(M);
    w11.names.set(TYLER, 'Tyler');
    const asksForBody = (c) => c.args && c.args.p_slot === 1 && (c.name === 'hr_town_here' || (c.name === 'hr_town_move' && c.args.p_map !== null));
    const boot = async () => {
      const ticks = [];
      const a = new M.acct.AccountSession({ auth: { userId: () => TYLER, token: () => 'jwt', signOut: async () => {} }, server: w11.link(TYLER),
        timers: { setTimer: () => 0, clearTimer: () => {}, setInterval: (fn) => { ticks.push(fn); return ticks.length; }, clearInterval: () => {} } });
      const r = await a.open(0);
      if (!r.ok) throw new Error('TW-11 open failed: ' + r.reason);
      a.view(0);
      if (typeof a.openOthers === 'function') await a.openOthers([0, 1]);
      for (const fn of ticks.slice()) fn();   // the first poll tick
      await settle();
      const t0 = a.townOf(0);
      t0.show('town_common'); await settle(); await t0.read();
      /* the next poll tick (every standing character keeps its body), then the viewed one reads */
      const seen = async () => { for (const fn of ticks.slice()) fn(); await settle(); await t0.read(); return t0.walkers().filter((w) => w.id === TYLER).map((w) => w.slot); };
      return { a, seen, slots: t0.walkers().filter((w) => w.id === TYLER).map((w) => w.slot) };
    };
    let b = await boot();
    if (b.slots.join() !== '1') fail('TW-11 fresh boot: the viewed character sees own slots ' + JSON.stringify(b.slots) + ' (want [1]) before the other is viewed');
    b.a.close(0); b.a.close(1); await settle();
    b = await boot();   // reload
    if (b.slots.join() !== '1') fail('TW-11 after a reload the viewed character sees own slots ' + JSON.stringify(b.slots) + ' (want [1])');
    b.a.close(0); b.a.close(1); await settle();
    w11.hunting.add(TYLER + ':1');
    const before = w11.calls.length;
    b = await boot();
    if (b.slots.length) fail('TW-11 a hunting character is drawn in town: ' + JSON.stringify(b.slots));
    if (w11.calls.slice(before).some(asksForBody)) fail('TW-11 a hunting character asked for a town body');
    // the hunt ends while the page is open: the parked character's re-read says ended, and it stands again
    w11.hunting.delete(TYLER + ':1'); w11.back.add(TYLER + ':1');
    await b.a.character(1).load();
    let again = await b.seen();
    if (again.join() !== '1') fail('TW-11 a parked character whose hunt ended is not back in town: own slots ' + JSON.stringify(again));
    b.a.close(0); b.a.close(1); await settle();
    // a reload of a character BACK from a hunt (its section names the ended session): in town
    b = await boot();
    if (b.slots.join() !== '1') fail('TW-11 a character back from a hunt is not drawn in town after a reload: own slots ' + JSON.stringify(b.slots));
    // ...and going hunting again takes it out: it asks for no body while the server says open
    w11.back.delete(TYLER + ':1'); w11.hunting.add(TYLER + ':1');
    await b.a.character(1).load();
    const mark = w11.calls.length;
    again = await b.seen();
    if (again.length || w11.calls.slice(mark).some(asksForBody))
      fail('TW-11 a character that went hunting still stands in town: own slots ' + JSON.stringify(again));
    b.a.close(0); b.a.close(1);
  }
  // TW-13: viewed while it hunts, then another character is viewed: back from the hunt, it stands where the server sets it down.
  {
    const w13 = fakeWorld(M);
    w13.names.set(TYLER, 'Tyler');
    const ticks = [];
    const a = new M.acct.AccountSession({ auth: { userId: () => TYLER, token: () => 'jwt', signOut: async () => {} }, server: w13.link(TYLER),
      timers: { setTimer: () => 0, clearTimer: () => {}, setInterval: (fn) => { ticks.push(fn); return ticks.length; }, clearInterval: (h) => { ticks[h - 1] = null; } } });
    const run = async () => { for (const fn of ticks.slice()) if (fn) fn(); await settle(); };
    if (!(await a.open(0)).ok || !(await a.open(1)).ok) throw new Error('TW-13 open failed');
    a.view(0);
    const t0 = a.townOf(0), t1 = a.townOf(1);
    t0.show('town_common'); await settle(); t0.publish(at(12, 9)); await settle();
    w13.hunting.add(TYLER + ':0'); await a.character(0).load();
    t0.show(null);   // the viewed World now shows the hunt
    a.view(1); t0.park();   // the World pane switched to slot 1
    t1.show('town_common'); await settle();
    await run();
    await t1.read();
    if (t1.walkers().some((w) => w.id === TYLER && w.slot === 0)) fail('TW-13 a hunting character is drawn in town');
    w13.hunting.delete(TYLER + ':0'); w13.back.add(TYLER + ':0');
    await a.character(0).load();   // the hunt re-read says it ended
    const mark = w13.calls.length;
    await run();
    await t1.read();
    const seen0 = t1.walkers().find((w) => w.id === TYLER && w.slot === 0);
    const set = w13.ARRIVE[0];
    if (!seen0) fail('TW-13 switched away mid-hunt, the character is not back in town after its hunt ended');
    else if (seen0.x !== set.x || seen0.y !== set.y) fail('TW-13 back from the hunt it stands at ' + [seen0.x, seen0.y] + ', not the arrival stand the server gave it (' + [set.x, set.y] + ')');
    if (w13.calls.slice(mark).some((c) => c.name === 'hr_town_move' && c.args.p_slot === 0 && c.args.p_map !== null)) fail('TW-13 back from the hunt the client named a tile of its own');
    a.close(0); a.close(1);
  }
  // TW-15 (Andy 10-21: a switch put the hero back at the map's start): where the body stands is the presence's,
  // from the server's stand on.
  {
    const w15 = fakeWorld(M);
    w15.names.set(TYLER, 'Tyler');
    let now = 0, hunting = false, tick15 = null;
    const town = M.maps.WORLD_MAPS.find((m) => m.id === M.maps.SCENE_MAPS.town);
    const tp = new M.town.TownPresence({ server: w15.link(TYLER), slot: 1, self: () => TYLER, busy: () => hunting, town: town.id,
      timers: { setTimer: (fn) => { tick15 = fn; return 1; }, clearTimer: () => {} }, now: () => now });
    tp.stand(); tick15(); await settle();   // its body on the first tick
    const idle = w15.IDLE[0];
    if (String(tp.placeOn(town.id)) !== String([idle.x, idle.y]) || String(tp.placeOn(town.id)) === String(town.start))
      fail('TW-15 a body standing from boot is at ' + tp.placeOn(town.id) + ', not the server\'s stand ' + [idle.x, idle.y]);
    tp.show(town.id); await settle(); tp.publish(at(14, 9)); await settle();
    tp.park();                    // another character is viewed
    tp.show(town.id);             // ...and this one again
    if (String(tp.placeOn(town.id)) !== '14,9') fail('TW-15 viewed again, the body stands at ' + tp.placeOn(town.id) + ', not where it stood (14,9)');
    tp.park();
    hunting = true; w15.hunting.add(TYLER + ':1'); now += L.parkedKeepaliveMs; tick15(); await settle();
    hunting = false; w15.hunting.delete(TYLER + ':1'); w15.back.add(TYLER + ':1');
    const mark = w15.calls.length;
    now += L.parkedKeepaliveMs; tick15(); await settle();
    const arr = w15.ARRIVE[0];
    if (String(tp.placeOn(town.id)) !== String([arr.x, arr.y]))
      fail('TW-15 back from a hunt the parked body stands at ' + tp.placeOn(town.id) + ', not where the server set it down (' + [arr.x, arr.y] + ')');
    if (w15.calls.slice(mark).some((c) => c.name === 'hr_town_move' && c.args.p_map !== null)) fail('TW-15 back from a hunt the parked body named a tile of its own');
    tp.destroy();
  }
  // TW-19: the server moves the stand; go(station)
  {
    const sent = [];
    let stand = ME(4, 11, { since_ms: 1 });
    const server = { rpc: (name, args) => { sent.push({ name, args });
      return Promise.resolve({ ok: true, body: { ok: true, stamped: true, full: true, walkers: [], gone: [], me: stand } }); } };
    let now = 0, t19 = null;
    const tp = new M.town.TownPresence({ server, slot: 0, self: () => TYLER, town: 'town_common',
      timers: { setTimer: (fn) => { t19 = fn; return 1; }, clearTimer: () => {} }, now: () => now });
    tp.show('town_common'); await settle();
    const k0 = tp.me() && tp.me().station + ':' + tp.me().since;
    stand = ME(7, 8, { station: 'smithy_anvil', stand: 1, work: true, since_ms: 99 });
    await tp.read();
    const m = tp.me();
    if (!m || m.station !== 'smithy_anvil' || String(m.at) !== '7,8' || m.work !== true || (m.station + ':' + m.since) === k0)
      fail('TW-19 an answer with a new stand did not change me(): ' + JSON.stringify(m));
    tp.publish(at(7, 8)); await settle();
    tp.park();
    stand = ME(19, 9, { station: 'woodpile', stand: 1, work: true, since_ms: 150 });
    now += L.parkedKeepaliveMs; t19(); await settle();
    if (String(tp.placeOn('town_common')) !== '19,9') fail('TW-19 a parked body the server moved stands at ' + tp.placeOn('town_common') + ', not its new stand (19,9)');
    tp.show('town_common'); await settle();
    sent.length = 0;
    await tp.go('tally_board'); await tp.go(null); await tp.go('no such station!'); await tp.go(5);
    const gos = sent.filter((c) => c.name === 'hr_town_go');
    if (gos.length !== 2 || gos.some((c) => Object.keys(c.args).sort().join(',') !== 'p_slot,p_station') || gos[0].args.p_station !== 'tally_board' || gos[1].args.p_station !== null)
      fail('TW-19 go() sent ' + JSON.stringify(gos.map((c) => c.args)));
    tp.destroy();
  }
  // TW-12: the fake above keys a body by user AND slot; the real server (the chain's last word) must too.
  {
    const order = JSON.parse(readFileSync(join(ROOT, 'tests/schema-apply-order.json'), 'utf8')).order;
    let body = null, key = null;
    for (const file of order) {
      let sql;
      try { sql = readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8'); } catch { continue; }
      const i = sql.search(/create or replace function public\.hr_town_move\(/i);
      if (i >= 0) { const a = sql.indexOf('$$', i) + 2; body = sql.slice(a, sql.indexOf('$$', a)); }
      if (/create unlogged table if not exists public\.town_positions[\s\S]*?user_id uuid primary key/i.test(sql)) key = 'user_id';
      for (const m of sql.matchAll(/add constraint town_positions_pkey primary key \(([^)]*)\)/gi)) key = m[1].replace(/\s+/g, '');
    }
    if (!body) fail('TW-12 no hr_town_move body in the chain');
    else {
      if (!/on conflict \(user_id, slot\)/i.test(body)) fail('TW-12 hr_town_move upserts one body per ACCOUNT, not per character');
      const unscoped = body.split('\n').filter((l) => /town_positions/.test(l) && /where user_id = v_uid/.test(l) && !/slot = v_slot/.test(l));
      if (unscoped.length) fail('TW-12 hr_town_move reads or deletes the account\'s bodies, not the character\'s: ' + unscoped.map((l) => l.trim()).join(' | '));
    }
    if (key !== 'user_id,slot') fail('TW-12 town_positions is keyed by (' + key + '), not (user_id, slot)');
  }
  // TW-16 (Tyler live v0.2.31: "I can't see other players' skin choice. Just defaults to the paladin"):
  // A PEER WEARS ITS OWN LOOK. (a) the real server: the chain's last hr_town_look (the look hr_town_view sends
  // each walker in) names a walker's role with the function behind the character's OWN `role` section (its worn
  // weapon's), never the retired action-set pick; (b) on the fake modelled on (a), another player appears in
  // town drawn in the look its own screen draws it in (its weapon's outfit, or the one it chose), and after the
  // viewer reloads it still is.
  {
    const { body, roleFn } = chainOf(M.base, 'hr_town_look');
    const said = body && /'role',\s*public\.([a-z_]+)\(p_user,\s*p_slot\)(->>'id')?/.exec(body);
    const sectionRole = !!said && said[1] === roleFn && !!said[2];
    if (!body || !roleFn) fail('TW-16 the chain has no hr_town_look body or no `role` state section');
    else if (!sectionRole)
      fail('TW-16 hr_town_look names a walker\'s role with ' + (said ? said[0] : 'nothing') + ', not its own `role` section\'s ('
        + roleFn + '(user, slot)->>\'id\'): every peer that chose no outfit is drawn in the wrong look');
    const manifests = {};
    for (const set of M.sets.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
    const book = M.bookm.createBook(manifests);
    const common = M.mapc.compileMap(M.maps.WORLD_MAPS.find((m) => m.id === 'town_common'), { materials: M.terrain.MATERIALS, sprites: book.sprites,
      openClasses: M.terrain.OPEN_CLASSES, treeClasses: M.terrain.TREE_CLASSES, lights: M.terrain.LIGHTS, terrains: book.terrains });
    const world = fakeWorld(M);
    /* the fake names the role the chain does: the weapon's, or (the old line) the action-set pick, null for these heroes */
    if (!sectionRole) world.walkerRole = () => null;
    world.looks.set(ANDY + ':0', { weapon: 'ranged', outfit: null });      // a bow, nothing chosen: the ranger's look
    world.looks.set(ANDY + ':1', { weapon: 'sword', outfit: 'sorcerer' });  // a sword, in the Scholar's Robe it chose
    /* Tyler's town, as his World pane holds it (one presence, one cast): draw() re-reads and returns what is
       drawn of Andy's hero in `slot` (the sprite id), or null when he is not drawn. */
    const viewer = async () => {
      const T = await account(M, world, TYLER, 'Tyler', null);
      const tt = T.townOf(0), cast = M.cast.createTownCast(common, { sprites: book.sprites });
      tt.show('town_common'); await settle();
      let t = 1e6;
      const draw = async () => {
        await tt.read();
        const units = cast.frame(tt.walkers(), (t += 1000));
        return (slot) => { const u = units.find((x) => x.ref && x.ref.player.id === ANDY && x.ref.player.slot === slot); return u ? u.id : null; };
      };
      return { T, draw };
    };
    const v1 = await viewer();
    const empty = await v1.draw();
    if (empty(0) || empty(1)) fail('TW-16 Andy is drawn before he stands in town');
    const A = await account(M, world, ANDY, 'Andy', null);
    if (!(await A.open(1)).ok) fail('TW-16 Andy\'s second hero did not open');
    const own = [0, 1].map((s) => M.look.heroSprite(A.character(s)));
    if (own[0] !== 'outfit_ranger' || own[1] !== 'outfit_sorcerer') fail('TW-16 CONTROL: Andy\'s own screen draws his heroes in ' + own.join(', '));
    for (const s of [0, 1]) A.townOf(s).show('town_common');
    await settle();
    for (const s of [0, 1]) A.townOf(s).publish(at(12 + 2 * s, 9));
    await settle();
    const check = (drawn, step) => {
      for (const s of [0, 1]) if (drawn(s) !== own[s])
        fail('TW-16 ' + step + ', Tyler\'s town draws Andy\'s hero ' + s + ' in ' + drawn(s) + ', but Andy\'s own screen draws it in ' + own[s]);
    };
    check(await v1.draw(), 'once Andy appeared');
    v1.T.close(0); await settle();
    const v2 = await viewer();   // Tyler reloads
    check(await v2.draw(), 'after Tyler reloaded');
    v2.T.close(0); A.close(0); A.close(1); await settle();
  }
  // TW-5, TW-6
  {
    let now = 1000, answer = null;
    const W = (o) => Object.assign({ id: ANDY, slot: 0, name: 'Andy', level: 3, role: null, x: 1, y: 9, gx: 1, gy: 9, dir: 's' }, o);
    const sent = [];
    const server = { rpc: async (name, args) => { sent.push({ name, args }); return { ok: true, body: answer }; } };
    const tp = new M.town.TownPresence({ server, slot: 0, self: () => TYLER, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => now });
    const MIRA = 'bbbbbbbb-0000-4000-8000-0000000000c3', OWEN = 'bbbbbbbb-0000-4000-8000-0000000000c7';
    answer = { ok: true, full: true, cursor: 5e15, walkers: [W({})], gone: [], me: ME() };
    tp.show('town_common'); await settle();
    tp.publish(at(9, 9));
    answer = { ok: true, full: true, cursor: 6e15, walkers: [W({ id: MIRA, name: 'Mira' })], gone: [], me: ME() };
    sent.length = 0;
    await tp.read();
    const asked = sent.find((c) => c.name === 'hr_town_view');
    if (tp.walkers().map((w) => w.name).join(',') !== 'Mira') fail('TW-5 a whole answer was merged, not replaced: ' + tp.walkers().map((w) => w.name).join(','));
    if (!asked || asked.args.p_cursor !== 5e15 || asked.args.p_cx !== 9 || asked.args.p_cy !== 9) fail('TW-5 a read after an answer did not send its cursor and centre: ' + JSON.stringify(asked && asked.args));
    /* a delta: Owen arrives, Mira walks, Andy (never re-added) is not in it */
    answer = { ok: true, full: false, cursor: 7e15, walkers: [W({ id: OWEN, name: 'Owen' }), W({ id: MIRA, name: 'Mira', x: 3, gx: 5 })], gone: [], me: ME() };
    await tp.read();
    const names = tp.walkers().map((w) => w.name + '@' + w.x).sort().join(',');
    if (names !== 'Mira@3,Owen@1') fail('TW-5 a delta did not upsert the changed and keep the rest: ' + names);
    answer = { ok: true, full: false, cursor: 8e15, walkers: [], gone: [{ id: MIRA, slot: 0 }], me: ME() };
    await tp.read();
    if (tp.walkers().map((w) => w.name).join(',') !== 'Owen') fail('TW-5 a delta\'s gone was kept: ' + tp.walkers().map((w) => w.name).join(','));
    /* a whole read at least every fullEveryMs: no cursor sent */
    now += L.fullEveryMs; sent.length = 0;
    answer = { ok: true, full: true, cursor: 9e15, walkers: [W({ id: MIRA, name: 'Mira' })], gone: [], me: ME() };
    await tp.read();
    const whole = sent.find((c) => c.name === 'hr_town_view');
    if (!whole || whole.args.p_cursor !== null || whole.args.p_pcx !== null) fail('TW-5 no whole read after fullEveryMs: ' + JSON.stringify(whole && whole.args));
    if (tp.walkers().map((w) => w.name).join(',') !== 'Mira') fail('TW-5 the periodic whole answer did not replace the list');
    now += L.staleMs + 1;
    if (tp.walkers().length) fail('TW-5 an answer older than staleMs still shows people');
    const bad = [W({ id: 'nope' }), W({ id: 'cccccccc-0000-4000-8000-0000000000c4', x: -1 }), W({ id: 'cccccccc-0000-4000-8000-0000000000c5', dir: 'up' }),
      W({ id: 'cccccccc-0000-4000-8000-0000000000c6', x: 2.5 }), W({ id: TYLER, name: 'Me' })];
    const many = Array.from({ length: L.cap + 5 }, (_, i) => W({ id: 'dddddddd-0000-4000-8000-' + String(i).padStart(12, '0'), name: 'p' + i }));
    answer = { ok: true, full: true, cursor: 1e16, walkers: bad.concat(many), gone: [], me: ME() };
    await tp.read();
    const got = tp.walkers();
    if (got.length !== L.cap || got.some((w) => w.name === 'Me' || w.id === 'nope')) fail('TW-6 the walkers kept ' + got.length + ' (cap ' + L.cap + '): ' + got.slice(0, 3).map((w) => w.name).join(','));
    if (L.cap !== M.stations.TOWN_INSTANCE.cap) fail('TW-6 the client cap ' + L.cap + ' is not the server\'s view cap ' + M.stations.TOWN_INSTANCE.cap);
    /* the area: one standing outside it is dropped, one walking INTO it is kept */
    answer = { ok: true, full: true, cursor: 2e16, area: [0, 0, 10, 10], walkers: [W({ id: MIRA, name: 'Mira', x: 20, gx: 20 }), W({ id: OWEN, name: 'Owen', x: 20, gx: 5 })], gone: [], me: ME() };
    await tp.read();
    if (tp.walkers().map((w) => w.name).join(',') !== 'Owen') fail('TW-6 the area kept ' + tp.walkers().map((w) => w.name).join(',') + ' (want Owen, walking in)');
    tp.destroy();
  }
  // TW-7
  {
    const seeds = new Map();
    const ins = (M.catalogue.split('insert into public.hr_town_maps')[1] || '').split(';')[0];
    for (const m of ins.matchAll(/\('([a-z0-9_]+)', '[a-z0-9_]+', (\d+), (\d+), /g)) seeds.set(m[1], [Number(m[2]), Number(m[3])]);
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
    if (name === 'hr_town_view') return json({ ok: true, map: body.p_map, inst: 1, cap: 120, full: true, cursor: ++s.cursor, area: AREA, gone: [], me: s.me,
      walkers: [{ id: ANDY, slot: 0, name: 'Andy', level: 9, role: 'healer', x: 13, y: 9, gx: 14, gy: 9, dir: 'w', age_ms: 400, station: 'green', work: false }] });
    if (name === 'hr_town_here') return json({ ok: true, me: s.me });
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
  const browser = await leaseBrowser(chromium);
  try {
    const vp = { width: 1440, height: 900 };
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    /* the server's stand for Tyler: the green's first (src/data/world/stations.js), never the map's start */
    const s = { calls: [], version: 1, cursor: 1, me: ME(4, 11) };
    await stub(page, s);
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    if (!await wait(page, (name) => document.querySelector('.world-canvas') && ((document.querySelector('.world-title') || {}).textContent || '').includes(name), TOWN_NAME)) {
      fails.push('TW-8 the World did not open on ' + TOWN_NAME); await ctx.close(); return fails;
    }
    await page.waitForTimeout(3000);   // two polls, a few publishes, Andy walking
    const reads = s.calls.filter((c) => c.name === 'hr_town_view');
    const moves = s.calls.filter((c) => c.name === 'hr_town_move');
    if (!reads.length || reads.some((c) => c.body.p_map !== 'town_common')) fail('TW-8 the page read ' + JSON.stringify(reads.map((c) => c.body)));
    if (!moves.length || moves.some((c) => c.body.p_map !== 'town_common' || ![c.body.p_x, c.body.p_y, c.body.p_gx, c.body.p_gy].every(Number.isInteger)))
      fail('TW-8 the hero published ' + JSON.stringify(moves.map((c) => c.body)));
    /* it starts ON its server stand: every tile it named before it was moved is the stand */
    if (moves.some((c) => c.body.p_x !== 4 || c.body.p_y !== 11)) fail('TW-8 the hero did not start on its server stand (4,11): it published ' + JSON.stringify(moves.map((c) => [c.body.p_x, c.body.p_y])));
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
    /* THE SERVER MOVES ITS STAND (it started smithing): the hero WALKS there from where it is, and publishes the walk */
    const mark = s.calls.length;
    s.me = ME(7, 9, { station: 'smithy_anvil', stand: 2, work: true, since_ms: 2 });
    await page.waitForTimeout(4500);
    const walk = s.calls.slice(mark).filter((c) => c.name === 'hr_town_move').map((c) => c.body);
    const last = walk[walk.length - 1];
    if (!last || last.p_x !== 7 || last.p_y !== 9) fail('TW-8 the server moved the stand to (7,9) but the hero stands at ' + JSON.stringify(last && [last.p_x, last.p_y]));
    else if (!walk.some((b) => b.p_gx === 7 && b.p_gy === 9 && (b.p_x !== 7 || b.p_y !== 9))) fail('TW-8 the hero jumped to its new stand instead of walking there: ' + JSON.stringify(walk.map((b) => [b.p_x, b.p_y, b.p_gx, b.p_gy])));
    const n = s.calls.length;
    await page.click('[data-world-choice="home"]');
    await page.waitForTimeout(600);
    const left = s.calls.slice(n).filter((c) => c.name === 'hr_town_move');
    if (!left.length || left[left.length - 1].body.p_map !== null) fail('TW-8 the Home button did not leave town: ' + JSON.stringify(left.map((c) => c.body)));
    const after = s.calls.length;
    await page.waitForTimeout(2500);
    if (s.calls.slice(after).some((c) => c.name === 'hr_town_view')) fail('TW-8 the home scene still polls the town');
    /* BACK IN TOWN, SET DOWN MID-WALK (the server says it is walking from (12,10) to its stand (6,9)): it walks on there */
    s.me = ME(12, 10, { station: 'smithy_anvil', stand: 3, gx: 6, gy: 9, at: [6, 9], work: true, since_ms: 3 });
    const back = s.calls.length;
    await page.click('[data-world-choice="town"]');
    await page.waitForTimeout(4500);
    const on = s.calls.slice(back).filter((c) => c.name === 'hr_town_move' && c.body.p_map !== null).map((c) => c.body);
    const end = on[on.length - 1];
    if (!end || end.p_x !== 6 || end.p_y !== 9) fail('TW-8 set down mid-walk, the hero did not walk on to its stand (6,9): it published ' + JSON.stringify(on.map((b) => [b.p_x, b.p_y])));
    if (errors.length) fail('TW-8 console errors: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
  function fail(m) { fails.push(m); }
}

/* ── TW-14: ONE ACCOUNT, TWO HEROES, SWITCHED A -> B -> A ON THE PAGE ── */
const NAMES = ['Tyler', 'Fremulon'];
/* each hero's server stand: the green's first two (src/data/world/stations.js) */
const STANDS = [ME(4, 11), ME(5, 11, { stand: 2 })];

/* The account's two heroes on one fake server that keeps one body per character (as the chain's last
   hr_town_move does), stands each on its own server stand, and names each walker by its character
   (hr_character_name). A hero's walker is its steered tile once it walked, else its stand. */
async function stubTwo(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body, at: Date.now() });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') {
      const slot = Number.isInteger(body.p_slot) ? body.p_slot : 0;
      return json(Object.assign(townEnvelope(NAMES[slot] || 'Hero'), { version: ++s.version, hero_slots: [0, 1], account: { max_concurrent: 2 } }));
    }
    if (name === 'hr-accrue') return json({ accrued: false });
    if (name === 'hr_town_here') { s.present.add(body.p_slot); return json({ ok: true, me: STANDS[body.p_slot] }); }
    if (name === 'hr_town_move') {
      if (body.p_map === null) { s.pos.delete(body.p_slot); s.present.delete(body.p_slot); }
      else { s.present.add(body.p_slot); s.pos.set(body.p_slot, { map: body.p_map, x: body.p_x, y: body.p_y, gx: body.p_gx, gy: body.p_gy, dir: body.p_dir }); }
      return json({ ok: true, stamped: true });
    }
    if (name === 'hr_town_view') {
      s.present.add(body.p_slot);
      const walkers = [];
      for (const slot of s.present) {
        const p = s.pos.get(slot) || STANDS[slot];
        walkers.push({ id: UID, slot, name: NAMES[slot], level: 9, role: 'tank', x: p.x, y: p.y, gx: p.gx, gy: p.gy, dir: p.dir, age_ms: 0, station: 'green', work: false });
      }
      return json({ ok: true, map: body.p_map, inst: 1, cap: 120, full: true, cursor: ++s.version, area: AREA, gone: [], walkers, me: STANDS[body.p_slot] });
    }
    if (name === 'hr_chat_recent') return json({ ok: true, zone: 'local:town', party: null, lines: [] });
    if (name === 'hr_social_state') return json({ ok: true, friends: [], incoming: [], outgoing: [], blocks: [] });
    if (name === 'hr_whispers_recent') return json({ ok: true, lines: [] });
    return json({ ok: true });
  });
}

/* Who the World draws as a person (a right-click on every 8 px of the canvas: the player menu's titles). */
const peopleDrawn = (page) => page.evaluate(() => {
  const cv = document.querySelector('.world-canvas');
  const r = cv.getBoundingClientRect();
  const seen = new Set();
  for (let y = r.top + 4; y < r.bottom; y += 8) for (let x = r.left + 4; x < r.right; x += 8) {
    cv.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    const m = document.querySelector('.hw-menu.is-on');
    if (!m) continue;
    seen.add(m.querySelector('.hw-menu-title').textContent);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }
  return [...seen];
});

async function switchRules(overrides) {
  const fails = [];
  const fail = (m) => fails.push(m);
  const maps = await import(pathToFileURL(join(ROOT, 'src/data/world/maps/index.js')).href);
  const start = maps.WORLD_MAPS.find((m) => m.id === maps.SCENE_MAPS.town).start;
  const stand = [STANDS[0].x, STANDS[0].y];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { calls: [], version: 1, pos: new Map(), present: new Set() };
    await stubTwo(page, s);
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    const shows = (slot) => wait(page, ([n, name]) => !!document.querySelector('#panel-world[data-slot="' + n + '"] .world-canvas')
      && ((document.querySelector('#panel-world .world-title') || {}).textContent || '').includes(name), [slot, TOWN_NAME]);
    if (!await shows(0) || !await wait(page, () => document.querySelectorAll('.char-tab[data-slot]').length === 2)) {
      fail('TW-14 the World did not open on town with both heroes in the strip'); await ctx.close(); return fails;
    }
    /* walk Tyler off his stand: tap the ground to his side until his body stands elsewhere */
    const own = (slot) => s.calls.filter((c) => c.name === 'hr_town_move' && c.body.p_slot === slot && c.body.p_map !== null);
    const box = await page.locator('.world-canvas').boundingBox();
    let placed = null;
    for (const [dx, dy] of [[260, 80], [-260, 80], [200, -120], [-200, -120]]) {
      await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      await page.waitForTimeout(2600);
      const p = own(0).pop();
      if (p && (p.body.p_x !== stand[0] || p.body.p_y !== stand[1]) && p.body.p_x === p.body.p_gx && p.body.p_y === p.body.p_gy) { placed = [p.body.p_x, p.body.p_y]; break; }
    }
    if (!placed) { fail('TW-14 CONTROL: Tyler never walked off his stand'); await ctx.close(); return fails; }
    const mark = s.calls.length;
    const sees = async (slot, other) => {
      await page.waitForTimeout(2600);   // a town poll after the switch
      const names = await peopleDrawn(page);
      if (!names.includes(other)) fail('TW-14 viewing ' + NAMES[slot] + ' after a switch, ' + other + ' is not drawn in town (drawn: ' + JSON.stringify(names) + ')');
      if (names.includes(NAMES[slot])) fail('TW-14 viewing ' + NAMES[slot] + ', the hero is drawn as a walker of its own');
    };
    await sees(0, 'Fremulon');
    for (const slot of [1, 0, 1, 0]) {
      await page.click('.char-tab[data-slot="' + slot + '"]');
      if (!await shows(slot)) { fail('TW-14 switching to ' + NAMES[slot] + ' did not show town'); break; }
      await sees(slot, NAMES[1 - slot]);
    }
    const moved = own(0).filter((c) => s.calls.indexOf(c) >= mark && (c.body.p_x !== placed[0] || c.body.p_y !== placed[1]));
    if (moved.length) fail('TW-14 switching moved Tyler from ' + placed + ' to ' + moved.map((c) => c.body.p_x + ',' + c.body.p_y).join(' then ') + ' (his stand is ' + stand + ', the map\'s start ' + start + ')');
    /* the Town / Home pick is the hero's own: Home on Tyler, away to Fremulon and back, still Home */
    await page.click('[data-world-choice="home"]');
    await page.waitForTimeout(400);
    await page.click('.char-tab[data-slot="1"]');
    await shows(1);
    await page.click('.char-tab[data-slot="0"]');
    const home = await wait(page, () => !!document.querySelector('#panel-world[data-slot="0"] [data-world-choice="home"][aria-pressed="true"]'), null, 4000);
    if (!home) fail('TW-14 Tyler was at Home; after a switch away and back the World shows ' + await page.evaluate(() => (document.querySelector('#panel-world .world-title') || {}).textContent));
    if (errors.length) fail('TW-14 console errors: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

/* ── THE MUTANTS: each must turn at least one rule red. ── */
const PURE_MUTANTS = [
  ['the publish is not capped', 'src/session/town-presence.js', '    if (since < this.limits.publishMinMs) return false;\n', ''],
  ['standing still never keeps alive', 'src/session/town-presence.js', ' && !(keepalive || since >= this.limits.keepaliveMs)) return false;', ') return false;'],
  ['a blocked player stays drawn', 'src/session/town-presence.js', 'return this._walkers.filter((w) => !this._hidden(w.id));', 'return this._walkers.slice();'],
  ['your own character is a walker', 'src/session/town-presence.js', 'if (!w || (w.id === self && w.slot === this._slot)) continue;', 'if (!w) continue;'],
  ['your other character is hidden with you', 'src/session/town-presence.js', 'if (!w || (w.id === self && w.slot === this._slot)) continue;', 'if (!w || w.id === self) continue;'],
  ['leaving sends nothing', 'src/session/town-presence.js', '    if (!this._out) return;\n', '    return;\n'],
  ['a leave is not sent after an in-flight publish', 'src/session/town-presence.js', 'if (this._dead || this._map !== p.map) this._leave(); else this._sent = p;', 'this._sent = p;'],
  ['a stale list still shows people', 'src/session/town-presence.js', ' || this._now() - this._readAt > this.limits.staleMs', ''],
  ['a whole answer is merged, not replaced', 'src/session/town-presence.js', 'if (b.full === true || whole) { this._known = new Map(); this._fullAt = now; }', 'if (b.full === true || whole) { this._fullAt = now; }'],
  ['a delta replaces the list', 'src/session/town-presence.js', 'if (b.full === true || whole) { this._known = new Map();', 'if (true) { this._known = new Map();'],
  ['a delta keeps who is gone', 'src/session/town-presence.js', "if (g && typeof g.id === 'string') this._known.delete(g.id.toLowerCase() + ':' + g.slot);", 'void g;'],
  ['the walkers are not capped', 'src/session/town-presence.js', '{ if (list.length >= this.limits.cap) break; list.push(w); }', '{ list.push(w); }'],
  ['a read never sends its cursor', 'src/session/town-presence.js', 'p_cursor: whole ? null : this._cursor', 'p_cursor: null'],
  ['no whole read every fullEveryMs', 'src/session/town-presence.js', 'const whole = this._cursor === null || now - this._fullAt >= this.limits.fullEveryMs;', 'const whole = this._cursor === null;'],
  ['the area is ignored', 'src/session/town-presence.js', 'if (win) for (const [k, w] of this._known) if (!inArea(w.x, w.y) && !inArea(w.gx, w.gy)) this._known.delete(k);', 'void win;'],
  ['a body walking into the area is dropped', 'src/session/town-presence.js', 'if (!inArea(w.x, w.y) && !inArea(w.gx, w.gy))', 'if (!inArea(w.x, w.y))'],
  ['a tile is published before the server stand', 'src/session/town-presence.js', '    if (!this.me()) return false;\n    this._want = place;', '    this._want = place;'],
  ['the body never takes the server stand', 'src/session/town-presence.js', '    return m ? [m.x, m.y] : null;\n', '    return null;\n'],
  ['a shown-again body has no place of its own', 'src/session/town-presence.js', '    if (p) return [p.x, p.y];\n', ''],
  ['a parked body the server moved keeps its old place', 'src/session/town-presence.js', '    if (moved && this._parked) { this._want = null; this._sent = null; }\n', ''],
  ['the stand never changes once known', 'src/session/town-presence.js', '    const s = standOf(raw);', '    const s = this._me || standOf(raw);'],
  ['viewing another character leaves town', 'src/session/town-presence.js', '    if (!this._map) { this.stand(); return; }\n    this._parked = true;\n', '    if (!this._map) { this.stand(); return; }\n    this.show(null); return;\n'],
  ['a parked character never keeps alive', 'src/session/town-presence.js', '      if (this._now() - this._hereAt >= (this.limits.parkedKeepaliveMs || this.limits.keepaliveMs)) this.here();\n', ''],
  ['a parked body keeps alive at the walking pace', 'src/session/town-presence.js', '(this.limits.parkedKeepaliveMs || this.limits.keepaliveMs)', 'this.limits.keepaliveMs'],
  ['a parked body names the start tile', 'src/session/town-presence.js', "    return this._server.rpc('hr_town_here', { p_slot: this._slot, p_map: map }).then((ans) => {",
    "    this._server.rpc('hr_town_move', { p_slot: this._slot, p_map: map, p_x: 11, p_y: 9, p_gx: 11, p_gy: 9, p_dir: 's' });\n    return this._server.rpc('hr_town_here', { p_slot: this._slot, p_map: map }).then((ans) => {"],
  ['a town nobody draws keeps reading', 'src/session/town-presence.js', '    if (this._now() - this._drawnAt <= 2 * this.limits.pollMs) this.read();', '    this.read();'],
  ['a town drawn again waits for the poll', 'src/session/town-presence.js', '    if (this._map && !this._parked && now - this._drawnAt > 2 * this.limits.pollMs) this.read();\n', ''],
  ['a parked character that hunts stays in town', 'src/session/town-presence.js', '      if (this._busy()) { this._leave(); return; }\n', ''],
  ['go names more than a station', 'src/session/town-presence.js', "rpc('hr_town_go', { p_slot: this._slot, p_station: station })", "rpc('hr_town_go', { p_slot: this._slot, p_station: station, p_x: 1 })"],
  ['go sends a bad station', 'src/session/town-presence.js', "(station !== null && !(typeof station === 'string' && STATION.test(station)))", 'false'],
  ['an unviewed character has no body after a boot', 'src/session/account-session.js', '    this._towns.get(slot).stand();\n', ''],
  ['the presence has no town to stand in', 'src/session/account-session.js', "busy: () => huntOpenIn(cs.read('hunt')), town: SCENE_MAPS.town,", "busy: () => huntOpenIn(cs.read('hunt')),"],
  ['left mid-hunt, a character never stands in town again', 'src/session/town-presence.js', '    if (!this._map) { this.stand(); return; }\n', '    if (!this._map) return;\n'],
  ['boot opens only the viewed character', 'src/session/account-session.js', '    await Promise.all(want.map((slot) => this._open(slot)));\n', '    void want;\n'],
  ['closing a character keeps its body in town', 'src/session/account-session.js', 'if (town) { this._towns.delete(slot); town.destroy(); }', 'void town;'],
  ['a hero back from a hunt still counts as hunting', 'src/session/account-session.js', "busy: () => huntOpenIn(cs.read('hunt')),", "busy: () => !!cs.read('hunt'),"],
  ['an ended hunt section is an open hunt', 'src/session/account-session.js', " && h.ended !== true;\n}", ';\n}'],
  ['a walker\'s role is the retired action-set pick (live v0.2.31: every peer in plate)', 'supabase/migrations/2027-01-28-town-stands.sql',
    "'role', public.hr_role_view(p_user, p_slot)->>'id',", "'role', public.hr_chat_role_pick(p_user, p_slot),"],
  ['a walker\'s chosen outfit is dropped', 'src/session/town-presence.js', 'OUTFIT.test(w.outfit.id) ? w.outfit.id : null', 'OUTFIT.test(w.outfit.id) ? null : null'],
];
const PAGE_MUTANTS = [
  ['the World never tells the presence it is in town', 'src/world/sandbox-scene.js', "  else town.show(map.kind === 'town' ? map.id : null);\n", ''],
  ['the pane never hands the World its presence', 'src/app/world-pane.js', 'runtime = await bootWorld(pane, { view, character, emit, town, peers: opts.peers });', 'runtime = await bootWorld(pane, { view, character, emit, peers: opts.peers });'],
  ['a switch starts the hero at the map start', 'src/world/world-boot.js', "const at = held ? town.placeOn(map.id) : heroPosOn(G, map.id);", 'const at = heroPosOn(G, map.id);'],
  ['each pane mount makes a new display scratch', 'src/app/world-pane.js', '  const scratch = scratchOf(character);', "  const scratch = { choice: 'town' };"],
  ['the home scene stays in town', 'src/world/sandbox-scene.js', "  else town.show(map.kind === 'town' ? map.id : null);", "  else if (map.kind === 'town') town.show(map.id);"],
  ['the World never walks the hero to its new stand', 'src/world/world-boot.js', '      if (k && k !== walkStand) { walkStand = k; walk.goTo(town.me().at, now); }', '      if (k && k !== walkStand) { walkStand = k; }'],
  ['set down mid-walk, the hero stays where it was set down', 'src/world/world-boot.js',
    '      if (me && at && at[0] === me.x && at[1] === me.y && (me.x !== me.at[0] || me.y !== me.at[1])) walkStand = null;\n', ''],
  ['the hero jumps to its new stand', 'src/world/walk-scene.js', '    goTo(to, now) { steer.walkTo(to, now, false); },', '    goTo(to, now) { steer.walkTo(to, now - 600000, false); },'],
];

function copySrc() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-town-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor[\\/]?/.test(p.slice(ROOT.length)) });
  mkdirSync(join(tmp, 'supabase/migrations'), { recursive: true });
  for (const f of ['2026-10-25-town-walk.sql', '2026-12-10-town-walker-role.sql', '2027-01-26-town-stations.generated.sql', '2027-01-28-town-stands.sql', CATALOGUE])
    cpSync(join(ROOT, 'supabase/migrations', f), join(tmp, 'supabase/migrations', f));
  return tmp;
}

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'town-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  const onlyPure = process.argv.includes('--pure');
  const loadRoot = () => load(ROOT);
  if (!process.argv.includes('--mutate')) {
    const fails = [...await pureRules(await loadRoot()), ...(onlyPure ? [] : [...await pageRules(null, shots), ...await switchRules(null)])];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'town-walk: ' + fails.length + ' rule(s) RED'
      : 'town-walk: two accounts see each other; every body on its server stand; the publish is capped; blocks hidden; leaving leaves; whole answers replace, deltas only change' + (onlyPure ? '' : '; the peer walks in town with the one menu, the hero walks to its new stand') + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = [...await pureRules(await loadRoot()), ...(onlyPure ? [] : [...await pageRules(null, null), ...await switchRules(null)])];
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
    const over = { [file]: text.replace(from, to) };
    const fails = [...await pageRules(over, null), ...await switchRules(over)];
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  const n = PURE_MUTANTS.length + (onlyPure ? 0 : PAGE_MUTANTS.length);
  console.log(bad ? 'town-walk --mutate: ' + bad + ' escaped' : 'town-walk --mutate: ' + n + '/' + n + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
