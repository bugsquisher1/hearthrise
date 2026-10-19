#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/party-ui.mjs — THE PARTY, THE CHARACTER STRIP AND THE ALERTS, ONE TEST PER RULE.
//
//   node tests/party-ui.mjs                the rules (pure node, then a real Chromium)
//   node tests/party-ui.mjs --pure         the pure rules only (no browser)
//   node tests/party-ui.mjs --mutate       every planted defect must turn a rule RED
//   node tests/party-ui.mjs --shots <dir>  also write the visual-gate screenshots (1440x900, 922x423)
//
// mutant-anchors: src/shell/alerts.js src/shell/hunt-list.js src/session/party-sections.js src/session/character-session.js src/shell/windows/party.js src/shell/windows/party-finder.js src/app/character-strip.js src/shell/widgets/alerts.js
// mutant-writes-tree: no — pure mutants plant into a temp copy of src/, page mutants into served overrides
//
// The fixture is tests/fixtures/party-envelope.json (S1's `party` shape plus this lane's asks).
// (The 4-character limit and "a switch disturbs nobody" are session rules: tests/session-core.mjs ACC-4, VIEW-2.)
//   AL-1  ONE ALERT PER EVENT ID: a rare drop and a knock-out alert once each; a re-read,
//         a re-sent event, a reload (the ids come back in the residue) add none; a NEW
//         event id adds exactly one; a kind switched off adds none
//   PI-1  PARTY CONTROLS ARE INTENT-ONLY: each party verb is ONE rpc naming only the slot,
//         ids, a seat or a name (never a user id, never a number of the server's); the record
//         moves only from the re-read; a refusal re-reads nothing; a malformed one sends nothing
//   PR-1  THE ROLE IS THE WEAPON'S: seats read roleForWeapon (a pick only where the weapon
//         allows it); no client module keeps its own weapon-to-role table
//   UI-1  the strip shows one tab per character with its name, what it is doing and its alert
//         badge; a tab press shows that character and re-reads nobody
//   UI-2  the alert lines show each alert once, survive a re-read without repeating, and go
//         when dismissed
//   UI-3  the Party window: the seats with the leader's crown; Start is ONE hr_hunt_party_start,
//         off from the press until the server answered; the finder defaults to this
//         character's weapon and Join is ONE hr_hunt_party_join
//   UI-5  the party notes are the PICKED ground's, from its catalogue row, updated on change
//   AL-2  no out-of-stock warning while the store pays; none for a resource the hero does not use
//   UI-4  the command centre lists every open character; zero console errors throughout
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/party-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
/* UI-5: each ground's party note, read off ITS catalogue row (the pocket with minParty and the boss in it). */
const { HUNT_GROUNDS } = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href);
const { MONSTERS } = await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href);
const PARTY_NOTES = Object.fromEntries(Object.values(HUNT_GROUNDS).map((g) => {
  const p = g.pockets.find((q) => q.minParty);
  const boss = p && p.spawns.map((x) => MONSTERS[x.monster]).find((m) => m && m.boss);
  return [g.hunt, p && boss ? 'The ' + boss.name + ' wants a party of ' + ['', 'one', 'two', 'three', 'four'][p.minParty] + ' or more. Alone, you skip that hall.' : ''];
}));
if (!PARTY_NOTES.millrace_sewer || PARTY_NOTES.coppercap_warrens !== '') throw new Error('party-ui: UI-5 needs a party-gated ground and one without');
const PARTY_RPCS = ['hr_hunt_party_create', 'hr_hunt_party_join', 'hr_hunt_party_leave', 'hr_hunt_party_kick', 'hr_hunt_party_invite',
  'hr_hunt_party_accept', 'hr_hunt_party_decline', 'hr_hunt_party_start', 'hr_hunt_restart'];

/* ── PURE ── */

/** A fake server over the fixture: versions rise, the residue a put stores comes back (like hr_state_of's client_state). */
function fakeServer(o = {}) {
  const st = { calls: [], env: clone(FIXTURE.characters), version: 1, residue: o.residue || { 0: {}, 1: {} }, reply: { ok: true } };
  const next = (slot) => Object.assign(clone(st.env[slot]), { version: ++st.version, client_state: clone(st.residue[slot] || {}) });
  st.rpc = async (name, args) => {
    st.calls.push([name, args]);
    if (name === 'hr_load') return { ok: true, status: 200, body: st.env[args.p_slot] ? next(args.p_slot) : { ok: false, error: 'no_character' }, closed: false };
    if (name === 'hr_put_client_state') { st.residue[args.p_slot] = Object.assign(st.residue[args.p_slot] || {}, args.p_patch); return { ok: true, status: 200, body: { ok: true } }; }
    if (name === 'hr_hunt_party_finder') return { ok: true, status: 200, body: { ok: true, parties: [] } };
    return { ok: true, status: 200, body: clone(st.reply) };
  };
  st.accrue = async (body) => { st.calls.push(['accrue', body]); return { ok: true, status: 200, body: Object.assign({ accrued: true }, next(body.slot)) }; };
  return st;
}
const timers = { setTimer: () => 0, clearTimer: () => {} };
const memTab = () => { const m = new Map(); return { get: (k) => m.get(k) || null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) }; };

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return {
    A: await import(u('src/session/account-session.js')),
    C: await import(u('src/session/character-session.js')),
    AL: await import(u('src/shell/alerts.js')),
    PS: await import(u('src/session/party-sections.js')),
    HUD: await import(u('src/data/hunt-hud.js')),
    ROLES: await import(u('src/data/hunt-roles.js')),
  };
}

function account(M, srv) {
  const auth = { userId: () => UID, token: () => 'jwt', signOut: async () => {} };
  return new M.A.AccountSession({ auth, server: srv, tab: memTab(), channel: null, timers });
}

async function pureRules(M, base) {
  const fails = [];
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(id + ': threw ' + e.message); } };

  await t('AL-1', async () => {
    const srv = fakeServer();
    const acc = account(M, srv);
    const centre = M.AL.createAlertCenter(acc);
    const cs = (await acc.open(0)).session;
    if (!cs) return 'the fixture character did not open';
    const kinds = () => centre.list().map((a) => a.kind).sort().join(',');
    if (kinds() !== 'fall,rare') return 'the first read raised [' + kinds() + '], want [fall,rare]';
    await cs.load(); await cs.hello(); await cs.load();
    if (centre.list().length !== 2) return 'a re-read repeated an alert: ' + kinds();
    cs.timeline.ingest({ events: srv.env[0].hunt_events, serverNowMs: srv.env[0].hunt_server_now_ms }, 0);
    if (centre.list().length !== 2) return 'a re-sent event raised an alert again';
    await cs.flushResidue();
    /* A reload: a new account session over the same server, whose envelope carries the stored ids. */
    const acc2 = account(M, srv);
    const centre2 = M.AL.createAlertCenter(acc2);
    const cs2 = (await acc2.open(0)).session;
    if (centre2.list().length) return 'a reload repeated ' + centre2.list().map((a) => a.id).join(', ');
    srv.env[0].hunt.hero.falls = 2;
    await cs2.load(); await cs2.load();
    if (centre2.list().length !== 1 || centre2.list()[0].kind !== 'fall') return 'a new knock-out raised ' + centre2.list().length + ' alert(s)';
    M.AL.setAlertShown(cs2, 'rare', false);
    cs2.timeline.ingest({ events: [{ id: 's1:99', type: 'rare_drop', atMs: 1760702399900, u: 1, item: 'rat_tail' }] }, 0);
    if (centre2.list().length !== 1) return 'a kind switched off still raised an alert';
    M.AL.setAlertShown(cs2, 'rare', true);
    cs2.timeline.ingest({ events: [{ id: 's1:100', type: 'rare_drop', atMs: 1760702399950, u: 1, item: 'rat_tail' }] }, 0);
    if (centre2.list().length !== 2) return 'a new rare drop id raised ' + (centre2.list().length - 1) + ' alert(s)';
    srv.env[0].bag_rules.restock.wheat_bread = 100;
    await cs2.load(); await cs2.load();
    const low = centre2.list().filter((a) => a.kind === 'low');
    return (low.length === 1 && low[0].item === 'wheat_bread') || 'low supplies raised ' + low.length + ' alert(s)';
  });

  /* AL-2 (Tyler 10-18, "Tester is out of Drink · Buy supplies" for a hero with no mana): a bar slot may
     name a KIND; a hero with no mana pool is never warned about drinks; while the store pays per use
     there is no out-of-stock warning at all (HUNT_SCREEN_SPEC §3.4 rule 7). */
  await t('AL-2', async () => {
    const lows = async (edit) => {
      const srv = fakeServer();
      const e = srv.env[0];
      e.hunt.hero.falls = 0;
      e.hunt_events = [];
      e.bag_rules.restock = {};
      edit(e);
      const acc = account(M, srv);
      const centre = M.AL.createAlertCenter(acc);
      if (!(await acc.open(0)).session) return null;
      return centre.list().filter((a) => a.kind === 'low').map((a) => a.text);
    };
    const kinds = (e, mode, food, drink) => {
      e.hunt_settings.on_empty = mode;
      e.hunt_settings.supply_source = 'mine';
      e.hunt_settings.slots = [{ action: { type: 'consume', id: 'food' } }, { action: { type: 'consume', id: 'drink' } }].concat(Array(18).fill(null));
      for (const id of ['wheat_bread', 'cooked_shrimp']) if (!food) delete e.inventory[id];
      if (!drink) delete e.inventory.goldenroot_tea;
    };
    const a = await lows((e) => { kinds(e, 'switch', false, false); e.bag_rules.restock = { goldenroot_tea: 10 }; });
    if (!a || a.length) return 'with the store paying per use, an out-of-stock warning still fired: ' + JSON.stringify(a);
    const b = await lows((e) => { kinds(e, 'end', true, false); e.hunt.hero.mana_max = 0; e.hunt.hero.mana = 0; e.bag_rules.restock = { goldenroot_tea: 10 }; });
    if (!b || b.length) return 'a hero with no mana pool was warned about drinks: ' + JSON.stringify(b);
    const c = await lows((e) => kinds(e, 'end', true, true));
    if (!c || c.length) return 'a kind slot with that kind in the bag still read as out of stock: ' + JSON.stringify(c);
    const d = await lows((e) => kinds(e, 'end', false, true));
    return (d && d.length === 1 && / is out of food\.$/.test(d[0])) || 'own stock with "end the hunt" and no food must warn once, in words: ' + JSON.stringify(d);
  });

  await t('PI-1', async () => {
    const srv = fakeServer();
    const cs = new M.C.CharacterSession({ slot: 1, uid: UID, server: srv, ...timers });
    await cs.load();
    const P = '11111111-0000-4000-8000-00000000000a';
    const ALLOWED = new Set(['p_slot', 'p_hunt', 'p_party', 'p_seat', 'p_name', 'p_invite', 'p_session', 'p_idem']);
    const verbs = [['createParty', ['millrace_sewer']], ['joinParty', [P]], ['leaveParty', []], ['kickSeat', [2]], ['inviteByName', ['Mira']],
      ['answerInvite', [P, true]], ['answerInvite', [P, false]], ['startPartyHunt', []], ['restartHunt', [P]]];
    for (const [verb, args] of verbs) {
      srv.calls.length = 0;
      srv.reply = { ok: false, error: 'not_leader' };
      const rec = cs.record;
      const r = await cs[verb](...args);
      if (r.ok || r.error !== 'not_leader') return verb + ' did not pass the refusal through: ' + JSON.stringify(r);
      if (srv.calls.length !== 1 || !PARTY_RPCS.includes(srv.calls[0][0])) return verb + ' sent ' + JSON.stringify(srv.calls.map((c) => c[0]));
      const extra = Object.keys(srv.calls[0][1]).filter((k) => !ALLOWED.has(k));
      if (extra.length) return verb + ' sent field(s) ' + extra.join(', ');
      if (srv.calls[0][1].p_slot !== 1) return verb + ' named slot ' + srv.calls[0][1].p_slot;
      if (cs.record !== rec) return verb + ' changed the record on a refusal';
      srv.calls.length = 0;
      srv.reply = { ok: true, party: { id: P, seats: [] } };
      const v = cs.record.version;
      await cs[verb](...args);
      if (srv.calls.map((c) => c[0]).join() !== srv.calls[0][0] + ',hr_load') return verb + ' answered ok without the one re-read: ' + srv.calls.map((c) => c[0]).join();
      if (!(cs.record.version > v)) return verb + ' left the record unread';
    }
    srv.calls.length = 0;
    const bad = [await cs.kickSeat(-1), await cs.joinParty('not-an-id'), await cs.createParty('Bad Hunt!'), await cs.inviteByName(' '), await cs.restartHunt(null)];
    if (bad.some((r) => r.ok) || srv.calls.length) return 'a malformed party intent was sent: ' + JSON.stringify(srv.calls);
    const f = await cs.findParties('millrace_sewer', 'bow');
    return (f.ok && srv.calls.length === 1 && srv.calls[0][0] === 'hr_hunt_party_finder' && srv.calls[0][1].p_weapon === 'bow') || 'the finder read was wrong: ' + JSON.stringify(srv.calls);
  });

  await t('PR-1', async () => {
    const members = [{ seat: 0, weapon: 'staff', role_pick: 'healer' }, { seat: 1, weapon: 'staff', role_pick: 'tank' }, { seat: 2, weapon: 'bow', role_pick: 'tank' }, { seat: 3, weapon: 'no_such_weapon', role_pick: 'tank' }];
    const cs = { read: (k) => (k === 'party' ? { id: '11111111-0000-4000-8000-00000000000a', hunt: 'mill_cellar', max: 4, leader_seat: 0, self_seat: 0, members } : undefined) };
    const p = M.PS.partyMembershipOf(cs);
    const roles = p ? p.seats.map((s) => String(s.role)).join(',') : 'none';
    if (roles !== 'healer,mage,ranger,null') return 'seat roles read ' + roles + ', want healer,mage,ranger,null';
    for (const w of Object.keys(M.ROLES.WEAPON_ROLES)) if (!M.HUD.WEAPON_WORDS[w]) return 'WEAPON_WORDS has no words for ' + w;
    const copies = [];
    const walk = (d) => { for (const n of readdirSync(join(base, d))) { const p2 = d + '/' + n; if (statSync(join(base, p2)).isDirectory()) walk(p2); else if (p2.endsWith('.js') && p2 !== 'src/data/hunt-roles.js'
      && /(?:WEAPON_ROLES\s*=|function\s+roleForWeapon\b|['"]?bow['"]?\s*:\s*\[?\s*['"]ranger['"])/.test(readFileSync(join(base, p2), 'utf8'))) copies.push(p2); } };
    for (const d of ['src/app', 'src/session', 'src/shell']) walk(d);
    return !copies.length || 'a weapon-to-role table outside src/data/hunt-roles.js: ' + copies.join(', ');
  });
  return fails;
}

/* ── IN THE PAGE ── */
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted() {
  const s = { env: clone(FIXTURE.characters), version: 1, calls: [], residue: { 0: {}, 1: {} }, delayMs: 300 };
  s.next = (slot) => Object.assign(clone(s.env[slot]), { version: ++s.version, client_state: clone(s.residue[slot] || {}) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.env[body.p_slot] ? s.next(body.p_slot) : { ok: false, error: 'no_character' });
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next(body.slot)));
    if (name === 'hr_put_client_state') { Object.assign(s.residue[body.p_slot], body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_hunt_party_finder') return json({ ok: true, parties: [{ id: 'dddddddd-0000-4000-8000-000000000004', hunt: 'millrace_sewer', max: 4,
      seats: [{ seat: 0, weapon: 'shield', name: 'Oren' }, { seat: 1, weapon: 'club', name: 'Pell' }] }] });
    if (PARTY_RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json({ ok: true }); }
    return json({ ok: true });
  });
}

async function openBoth(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  if (!(await wait(page, () => document.querySelector('#panel-world[data-slot="0"]') && document.querySelector('.hs-launchers')))) return false;
  await page.click('[data-app="characters"]');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="1"]'));
  await page.click('[data-app="play"][data-slot="1"]');
  return wait(page, () => document.querySelectorAll('.char-tab[data-app="show"]').length === 2 && document.querySelector('#panel-world[data-slot="1"]') && document.querySelector('.hs-launchers'));
}

async function closeAll(page) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  }
}
async function openWin(page, key, id) {
  await closeAll(page);
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 3000);
}
const sent = (s, name) => s.calls.filter((c) => c.name === name);

/* A new full envelope, the way the live game gets one: a frame that skips a version makes the client re-read. */
async function pushEnvelope(page, s, slot) {
  const frame = s.version + 2;
  s.version = frame;
  const before = sent(s, 'hr-accrue').length;
  await page.evaluate(([t, f, st]) => window.__hub.send(t, { t: 'delta', frame: f, patch: { state: st } }), ['hr:' + UID + ':' + slot, frame, s.env[slot].state]);
  for (let i = 0; i < 60 && sent(s, 'hr-accrue').length <= before; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(300);
}

async function pageRules(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    for (const vp of shots ? [{ width: 1440, height: 900 }, { width: 922, height: 423 }] : [{ width: 1440, height: 900 }]) {
      const tag = vp.width + 'x' + vp.height;
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const s = scripted();
      await stub(page, s);
      const shot = async (name) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: join(shots, 'party-' + tag + '-' + name + '.png') }); } };
      if (!(await openBoth(page, base))) { fails.push('UI-1 [' + tag + '] two characters did not open beside each other' + (errors.length ? ': ' + errors.slice(0, 2).join(' | ') : '')); await ctx.close(); continue; }
      /* UI-1: one tab per character, its name, what it does, its badge; a press shows it and re-reads nobody. */
      await page.waitForTimeout(400);
      const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.char-tab[data-app="show"]')).map((b) => ({ slot: b.getAttribute('data-slot'),
        name: b.querySelector('.char-tab-name').textContent, doing: b.querySelector('.char-tab-doing').textContent, badge: b.querySelector('.char-badge').textContent, on: b.classList.contains('is-shown') })));
      const t0 = tabs.find((x) => x.slot === '0'), t1 = tabs.find((x) => x.slot === '1');
      if (!t0 || t0.name !== 'Tyler' || t0.doing !== 'Hunting in Millrace Sewer' || t0.badge !== '2') fails.push('UI-1 [' + tag + '] tab 0 reads ' + JSON.stringify(t0));
      if (!t1 || t1.name !== 'Druid' || t1.doing !== 'In town, idle' || !t1.on) fails.push('UI-1 [' + tag + '] tab 1 reads ' + JSON.stringify(t1));
      const loads = s.calls.length;
      await page.click('.char-tab[data-slot="0"]');
      if (!(await wait(page, () => document.querySelector('#panel-world[data-slot="0"]') && document.querySelector('.hs-launchers') && !document.querySelector('#panel-world[data-slot="1"]')))) fails.push('UI-1 [' + tag + '] the tab did not show character 0');
      await page.waitForTimeout(300);
      const reads = s.calls.slice(loads).filter((c) => c.name === 'hr_load' || c.name === 'hr-accrue');
      if (reads.length) fails.push('UI-1 [' + tag + '] a switch re-read ' + reads.map((c) => c.name + ':' + (c.body.p_slot ?? c.body.slot)).join(', '));
      if (!(await page.evaluate((uid) => !!window.__hub.channels['hr:' + uid + ':1'], UID))) fails.push('UI-1 [' + tag + '] the switch left character 1’s channel');
      /* UI-2: each alert once; a re-read does not repeat them; dismiss removes one. */
      const lines = () => page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert')).map((li) => li.getAttribute('data-kind')).sort().join(','));
      await wait(page, () => document.querySelectorAll('.hw-alert').length >= 2, null, 3000);
      if ((await lines()) !== 'fall,rare') fails.push('UI-2 [' + tag + '] the alert lines are [' + (await lines()) + '], want [fall,rare]');
      await shot('strip-alerts');
      await pushEnvelope(page, s, 0);
      if ((await lines()) !== 'fall,rare') fails.push('UI-2 [' + tag + '] after a re-read the alert lines are [' + (await lines()) + ']');
      /* UI-3: the Party window for the leader, between hunts (nobody hunting: Start is on). */
      for (const m of s.env[0].party.members) { m.hunting = false; m.unit = null; }
      await pushEnvelope(page, s, 0);
      if (!(await openWin(page, 'y', 'hunt-party'))) fails.push('UI-3 [' + tag + '] Y did not open the Party window');
      else {
        const seats = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-seat')).map((li) => ({ name: li.querySelector('b').textContent, crown: li.querySelector('.hw-crown').classList.contains('is-on'), role: li.querySelector('.hw-roleglyph').getAttribute('data-role') })));
        if (seats.length !== 2 || !seats[0].crown || seats[1].crown || seats[0].role !== 'tank' || seats[1].role !== 'ranger') fails.push('UI-3 [' + tag + '] the seats read ' + JSON.stringify(seats));
        await shot('party-leader');
        const before = sent(s, 'hr_hunt_party_start').length;
        await page.click('[data-hs-win="hunt-party"] [data-hs-act="start"]');
        const off = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-party"] [data-hs-act="start"]').disabled);
        if (!off) fails.push('UI-3 [' + tag + '] Start stayed on while the intent was in flight');
        await page.waitForTimeout(700);
        const st = sent(s, 'hr_hunt_party_start').slice(before);
        if (st.length !== 1 || Object.keys(st[0].body).sort().join() !== 'p_idem,p_slot' || st[0].body.p_slot !== 0) fails.push('UI-3 [' + tag + '] Start sent ' + JSON.stringify(st.map((c) => c.body)));
      }
      /* UI-4: the command centre lists both characters. */
      if (!(await openWin(page, 'o', 'characters'))) fails.push('UI-4 [' + tag + '] O did not open the command centre');
      else {
        const names = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-char .hw-char-name')).map((b) => b.textContent).join(','));
        if (names !== 'Tyler,Druid') fails.push('UI-4 [' + tag + '] the command centre lists ' + names);
        await shot('command-centre');
      }
      /* UI-3: the finder on the town character starts on its own weapon; Join is one intent. */
      await closeAll(page);
      await page.click('.char-tab[data-slot="1"]');
      await wait(page, () => document.querySelector('#panel-world[data-slot="1"]') && document.querySelector('.hs-launchers'));
      if (await openWin(page, 'y', 'hunt-party')) {
        const w = await page.evaluate(() => document.querySelector('[data-hs-act="find-weapon"]').value);
        if (w !== 'staff') fails.push('UI-3 [' + tag + '] the finder starts on "' + w + '", not this character’s staff');
        /* UI-5 (Tyler 10-19): the party note is the PICKED ground's, from its row, the moment the picker changes. */
        for (const [pick, sel] of [['create-hunt', '.hw-create-note'], ['find-hunt', '.hw-find-note']]) {
          for (const [hunt, want] of [['millrace_sewer', PARTY_NOTES.millrace_sewer], ['coppercap_warrens', PARTY_NOTES.coppercap_warrens], ['millrace_sewer', PARTY_NOTES.millrace_sewer]]) {
            await page.selectOption('[data-hs-win="hunt-party"] [data-hs-act="' + pick + '"]', hunt);
            const got = await page.evaluate((q) => { const n = document.querySelector('[data-hs-win="hunt-party"] ' + q); return n && !n.hidden ? n.textContent : ''; }, sel);
            if (got !== want) fails.push('UI-5 [' + tag + '] with ' + hunt + ' picked in ' + pick + ' the note reads ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
          }
        }
        await page.selectOption('[data-hs-win="hunt-party"] [data-hs-act="find-hunt"]', '');
        await page.click('[data-hs-win="hunt-party"] [data-hs-act="find"]');
        await wait(page, () => document.querySelector('.hw-found-row'), null, 3000);
        const fin = sent(s, 'hr_hunt_party_finder');
        if (fin.length !== 1 || fin[0].body.p_weapon !== 'staff') fails.push('UI-3 [' + tag + '] the finder sent ' + JSON.stringify(fin.map((c) => c.body)));
        await shot('party-finder');
        await page.click('.hw-found-row [data-hs-act="join"]');
        await page.waitForTimeout(700);
        const j = sent(s, 'hr_hunt_party_join');
        if (j.length !== 1 || j[0].body.p_party !== 'dddddddd-0000-4000-8000-000000000004' || j[0].body.p_slot !== 1) fails.push('UI-3 [' + tag + '] Join sent ' + JSON.stringify(j.map((c) => c.body)));
      } else fails.push('UI-3 [' + tag + '] the Party window did not open for character 1');
      if (errors.length) fails.push('UI-4 [' + tag + '] console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

/* ── THE MUTANTS: each must turn at least one rule red. ── */
const PURE_MUTANTS = [
  ['the store paying per use still warns out of stock', 'src/shell/alerts.js', "const storePays = !s || s.supplySource === 'store' || s.onEmpty !== 'end';", 'const storePays = false;'],
  ['a hero with no mana pool is warned about drinks', 'src/shell/alerts.js', "const uses = (id) => kindOf(id) !== 'drink' || hero.manaMax > 0;", 'const uses = () => true;'],
  ['a kind slot reads as an item no bag holds', 'src/shell/alerts.js', 'const stock = (id) => (CONSUMABLE_KINDS[id] ? bag.reduce((n, r) => n + (kindOf(r.id) === id ? r.qty : 0), 0) : have.get(id) || 0);', 'const stock = (id) => have.get(id) || 0;'],
  ['an alert fires on every read', 'src/shell/alerts.js', '    if (mine.has(c.id) || (Array.isArray(stored) && stored.includes(c.id))) return false;\n', ''],
  ['the shown ids are not kept for the next visit', 'src/shell/alerts.js', "    cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: (Array.isArray(stored) ? stored : []).concat(c.id).slice(-ALERTS_SEEN_MAX) });\n", ''],
  ['a switched-off kind still alerts', 'src/shell/alerts.js', '    if (!alertShown(cs, c.kind)) return false;\n', ''],
  ['a party intent changes the record before the server', 'src/session/character-session.js', "  async leaveParty() {\n    if (this._closed) return { ok: false, error: 'closed' };\n",
    "  async leaveParty() {\n    if (this._closed) return { ok: false, error: 'closed' };\n    this._record = Object.freeze(Object.assign({}, this._record, { version: this._record.version }));\n"],
  ['a kick names a user', 'src/session/character-session.js', "{ p_slot: this.slot, p_seat: seat, p_idem: newIdem() }", "{ p_slot: this.slot, p_seat: seat, p_user: this.uid, p_idem: newIdem() }"],
  ['a malformed seat is sent', 'src/session/character-session.js', "if (this._closed || !Number.isInteger(seat) || seat < 0 || seat > 7) return { ok: false, error: 'bad_intent' };", "if (this._closed) return { ok: false, error: 'bad_intent' };"],
  ['the server role pick is trusted over the weapon', 'src/session/party-sections.js', "role: roleForWeapon(w, pick),", "role: pick || roleForWeapon(w, null),"],
];
const PAGE_MUTANTS = [
  ['Start stays on while in flight', 'src/shell/windows/party.js', "prop(start, 'disabled', sc.pending || p.anyHunting);", "prop(start, 'disabled', p.anyHunting);"],
  ['a tab press re-reads the character', 'src/app/boot.js', "    else if (what === 'show') goTo(slot, null);", "    else if (what === 'show') { goTo(slot, null); account.character(slot).load(); }"],
  ['the strip shows no badge', 'src/app/character-strip.js', "  text(badge, x.alerts ? String(x.alerts) : '');", "  text(badge, '');"],
  ['the finder ignores this character’s weapon', 'src/shell/windows/party-finder.js', "sc.weapon = mine && mine.weapon && WEAPON_ROLES[mine.weapon] ? mine.weapon : '';", "sc.weapon = '';"],
  ['the party note ignores the picked ground', 'src/shell/hunt-list.js', '  const g = Object.values(HUNT_GROUNDS).find((r) => r.hunt === hunt);', "  const g = HUNT_GROUNDS.millrace_sewer; void hunt;"],
];

function copySrc() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-party-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor[\\/]?/.test(p.slice(ROOT.length)) });
  return tmp;
}

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'party-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  const onlyPure = process.argv.includes('--pure');
  if (!process.argv.includes('--mutate')) {
    const fails = [...await pureRules(await load(ROOT), ROOT), ...(onlyPure ? [] : await pageRules(null, shots))];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'party-ui: ' + fails.length + ' rule(s) RED'
      : 'party-ui: alerts once per event id; party controls intent-only; roles from the weapon' + (onlyPure ? '' : '; strip, alerts, Party and command centre in the page') + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = [...await pureRules(await load(ROOT), ROOT), ...(onlyPure ? [] : await pageRules(null, null))];
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of PURE_MUTANTS) {
    const tmp = copySrc();
    try {
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      const fails = await pureRules(await load(tmp), tmp);
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(':')[0] + ')');
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
  console.log(bad ? 'party-ui --mutate: ' + bad + ' escaped' : 'party-ui --mutate: ' + n + '/' + n + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
