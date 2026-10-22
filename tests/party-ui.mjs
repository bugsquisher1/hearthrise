#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/party-ui.mjs — THE PARTY, THE CHARACTER STRIP AND THE ALERTS, ONE TEST PER RULE.
//
//   node tests/party-ui.mjs                the rules (pure node, then a real Chromium)
//   node tests/party-ui.mjs --pure         the pure rules only (no browser)
//   node tests/party-ui.mjs --mutate       every planted defect must turn a rule RED
//   node tests/party-ui.mjs --shots <dir>  also write the visual-gate screenshots (1440x900, 922x423)
//
// mutant-anchors: src/shell/alerts.js src/shell/hunt-list.js src/session/party-sections.js src/session/character-session.js src/shell/windows/party.js src/shell/windows/party-finder.js src/app/character-strip.js src/shell/widgets/alerts.js src/session/party-intents.js src/shell/intent-words.js src/shell/windows/hunts.js src/shell/windows/inventory/bury.js
// mutant-writes-tree: no — pure mutants plant into a temp copy of src/, page mutants into served overrides
//
// The fixture is tests/fixtures/party-envelope.json (S1's `party` shape plus this lane's asks).
// (The 4-character limit and "a switch disturbs nobody" are session rules: tests/session-core.mjs ACC-4, VIEW-2.)
//   AL-1  ONE ALERT PER EVENT ID: a rare drop and a death alert (the hunt ending `died`) once each; a re-read,
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
//   PI-2  THE ONE-WAY FLOW'S VERBS (src/session/party-intents.js, PARTY_SPEC 2026-10-19): Start
//         names the picked hunt, Disband and an own invite by slot are each ONE rpc (slot, hunt,
//         own slot only); a refusal re-reads nobody and `not_ready` names each seat in words;
//         an ok re-reads every own character the verb touched; a malformed one sends nothing
//   UI-3  the Hunts window is where a party starts: the leader's Enter reads "Start with party"
//         and is ONE hr_hunt_party_start naming the picked hunt, off until the server
//         answered, and a refusal names who was not ready; a member's Enter stays off. The
//         Party window is Invites + Find a party: Invites opens first while one waits, Join is
//         ONE hr_hunt_party_accept; the finder defaults to this character's weapon (no ground
//         filter) and Join is ONE hr_hunt_party_join
//   UI-5  the party note is the PICKED ground's, from its catalogue row, on its Hunts line
//   UI-6  an invite reaches the player as an alert line with Join / No thanks; Join is ONE
//         hr_hunt_party_accept for that character, off until the server answered
//   UI-7  a character tab's right-click: Invite to party for an own character in no party (ONE
//         hr_hunt_party_invite_own naming the viewed slot and that slot), Leave party for one
//         that sits in a party, nothing party-wise otherwise
//   UI-8  the leader's Find tab carries the listing switch (a party is private until listed,
//         Security reopen #1): it reads the server's `listed` and is ONE hr_hunt_party_list,
//         off until the server answered
//   AL-2  no out-of-stock warning while the store pays; none for a resource the hero does not use
//   UI-4  the command centre lists every open character; zero console errors throughout
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
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
const PARTY_RPCS = ['hr_hunt_party_join', 'hr_hunt_party_leave', 'hr_hunt_party_kick', 'hr_hunt_party_invite',
  'hr_hunt_party_accept', 'hr_hunt_party_decline', 'hr_hunt_party_start', 'hr_hunt_restart', 'hr_hunt_party_invite_own', 'hr_hunt_party_disband', 'hr_hunt_party_list'];

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
    HS: await import(u('src/session/hunt-sections.js')),
    HUD: await import(u('src/data/hunt-hud.js')),
    ROLES: await import(u('src/data/hunt-roles.js')),
    PI: await import(u('src/session/party-intents.js')),
    PP: await import(u('src/shell/widgets/party-panel.js')),
    IW: await import(u('src/shell/intent-words.js')),
    BURY: await import(u('src/shell/windows/inventory/bury.js')),
  };
}

function account(M, srv) {
  const auth = { userId: () => UID, token: () => 'jwt', signOut: async () => {} };
  return new M.A.AccountSession({ auth, server: srv, tab: memTab(), channel: null, timers });
}

async function pureRules(M, base) {
  const fails = [];
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(id + ': threw ' + e.message); } };

  /* PI-TOWN (live v0.2.11, Andy: "no Stop line"): every town pointer the server holds (a resumed gather, a bench,
     training) is named on the Inventory's Stop line and in the Characters window; nothing runs unseen. */
  await t('PI-TOWN', async () => {
    const at = (st) => ({ read: (k) => (k === 'state' ? st : null) });
    for (const [st, want] of [[{ active_kind: 'gather', active_id: 'shrimp_s' }, 'fishing at the Shrimp Spot'],
      [{ active_kind: 'gather', active_id: 'copper_rock' }, 'mining the '], [{ active_kind: 'training', active_id: 'dummy' }, 'training'],
      [{ active_kind: 'artisan', active_id: 'no_such_recipe' }, 'at a workbench']]) {
      const line = M.BURY.buryLine(at(st));
      if (!/or stop it here\.$/.test(line) || !line.includes(want)) return 'the Stop line for ' + JSON.stringify(st) + ' reads ' + JSON.stringify(line);
      const doing = M.PS.assignmentOf(at(st)).text;
      if (!doing.startsWith('In town, ' + want)) return 'Characters reads ' + JSON.stringify(doing) + ' for ' + JSON.stringify(st);
    }
    if (M.BURY.buryLine(at({ active_kind: 'idle', active_id: null }))) return 'an idle hero gets a Stop line';
    return true;
  });

  await t('AL-1', async () => {
    const srv = fakeServer();
    const acc = account(M, srv);
    const centre = M.AL.createAlertCenter(acc);
    const cs = (await acc.open(0)).session;
    if (!cs) return 'the fixture character did not open';
    const kinds = () => centre.list().map((a) => a.kind).sort().join(',');
    if (kinds() !== 'rare') return 'the first read raised [' + kinds() + '], want [rare]';
    await cs.load(); await cs.hello(); await cs.load();
    if (centre.list().length !== 1) return 'a re-read repeated an alert: ' + kinds();
    cs.timeline.ingest({ events: srv.env[0].hunt_events, serverNowMs: srv.env[0].hunt_server_now_ms }, 0);
    if (centre.list().length !== 1) return 'a re-sent event raised an alert again';
    await cs.flushResidue();
    /* A reload: a new account session over the same server, whose envelope carries the stored ids. */
    const acc2 = account(M, srv);
    const centre2 = M.AL.createAlertCenter(acc2);
    const cs2 = (await acc2.open(0)).session;
    if (centre2.list().length) return 'a reload repeated ' + centre2.list().map((a) => a.id).join(', ');
    /* The hero dies: the hunt ends `died` (CORE_MODEL.md §6) and ONE death alert says where. */
    srv.env[0].hunt.ended = true;
    srv.env[0].hunt.session = Object.assign({}, srv.env[0].hunt.session, { end_reason: 'died', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
    await cs2.load(); await cs2.load();
    if (centre2.list().length !== 1 || centre2.list()[0].kind !== 'death' || !/died in .* and returned to town/.test(centre2.list()[0].text)) return 'a death raised ' + JSON.stringify(centre2.list().map((a) => [a.kind, a.text]));
    srv.env[0].hunt.ended = false;
    srv.env[0].hunt.session = Object.assign({}, srv.env[0].hunt.session, { end_reason: null, ended_at: null, phase: 'hunting' });
    M.AL.setAlertShown(cs2, 'rare', false);
    cs2.timeline.ingest({ events: [{ id: 's1:99', type: 'rare_drop', atMs: 1760702399900, u: 1, item: 'rat_tail' }] }, 0);
    if (centre2.list().length !== 1) return 'a kind switched off still raised an alert';
    M.AL.setAlertShown(cs2, 'rare', true);
    cs2.timeline.ingest({ events: [{ id: 's1:100', type: 'rare_drop', atMs: 1760702399950, u: 1, item: 'rat_tail' }] }, 0);
    if (centre2.list().length !== 2) return 'a new rare drop id raised ' + (centre2.list().length - 1) + ' alert(s)';
    /* A party member's rare (the settle's rare_drop names its owner, u 2) is theirs: no alert for this hero. */
    cs2.timeline.ingest({ events: [{ id: 's1:101', type: 'rare_drop', atMs: 1760702399960, u: 2, item: 'crown_shard' }] }, 0);
    if (centre2.list().length !== 2) return "a party member's rare drop raised an alert for this hero";
    /* A hero set to end its hunt on empty, out of the bread its bar eats (no restock targets: the Shop sells no supplies). */
    srv.env[0].hunt_settings = Object.assign({}, srv.env[0].hunt_settings, { on_empty: 'end', supply_source: 'mine',
      slots: [{ action: { type: 'consume', id: 'wheat_bread' } }].concat(Array(19).fill(null)) });
    delete srv.env[0].inventory.wheat_bread;
    await cs2.load(); await cs2.load();
    const low = centre2.list().filter((a) => a.kind === 'low');
    return (low.length === 1 && low[0].item === 'wheat_bread') || 'low supplies raised ' + low.length + ' alert(s)';
  });

  /* AL-3 (Tyler 2026-10-21): the use that empties the hero's own stack raises ONE line naming the slot that
     takes over, from the engine's `slot_dry` event in the server's timeline; another hero's event raises none. */
  await t('AL-3', async () => {
    const srv = fakeServer();
    srv.env[0].hunt_events = [];
    const acc = account(M, srv);
    const centre = M.AL.createAlertCenter(acc);
    const cs = (await acc.open(0)).session;
    if (!cs) return 'the fixture character did not open';
    const me = M.HS.huntOf(cs).hero.unit;
    const base = centre.list().length;
    cs.timeline.ingest({ events: [{ id: 's1:301', type: 'slot_dry', atMs: 1760702399960, u: me + 1, item: 'cooked_shrimp', next: 'salted_shrimp', slot: 2 }] }, 0);
    if (centre.list().length !== base) return 'another hero\'s run-out raised an alert';
    cs.timeline.ingest({ events: [{ id: 's1:302', type: 'slot_dry', atMs: 1760702399970, u: me, item: 'cooked_shrimp', next: 'salted_shrimp', slot: 2 }] }, 0);
    const out = centre.list().filter((a) => a.id.startsWith('out:'));
    if (out.length !== 1 || !/’s Cooked Shrimp ran out: slot 2 \(Salted Shrimp\) takes over\.$/.test(out[0].text)) return 'the run-out alert read ' + JSON.stringify(out.map((a) => a.text));
    cs.timeline.ingest({ events: [{ id: 's1:303', type: 'slot_dry', atMs: 1760702399980, u: me, item: 'thin_turnip_juice', next: null, slot: null }] }, 0);
    const none = M.AL.runOutOf(cs, { type: 'slot_dry', key: 'k', u: me, item: 'cooked_trout', next: null, slot: null });
    return (none && /Cooked Trout ran out, and no slot takes over/.test(none.text)) || 'with no takeover the line read ' + JSON.stringify(none);
  });

  /* AL-2 (Tyler 10-18, "Tester is out of Drink · Buy supplies" for a hero with no mana): a bar slot names
     ONE item (Tyler 2026-10-21); a hero with no mana pool is never warned about drinks; while the store pays
     per use there is no out-of-stock warning at all (HUNT_SCREEN_SPEC §3.4 rule 7). */
  await t('AL-2', async () => {
    const lows = async (edit) => {
      const srv = fakeServer();
      const e = srv.env[0];
      e.hunt.hero.falls = 0;
      e.hunt_events = [];
      edit(e);
      const acc = account(M, srv);
      const centre = M.AL.createAlertCenter(acc);
      if (!(await acc.open(0)).session) return null;
      return centre.list().filter((a) => a.kind === 'low').map((a) => a.text);
    };
    const kinds = (e, mode, food, drink) => {
      e.hunt_settings.on_empty = mode;
      e.hunt_settings.supply_source = 'mine';
      e.hunt_settings.slots = [{ action: { type: 'consume', id: 'cooked_shrimp' } }, { action: { type: 'consume', id: 'goldenroot_tea' } }].concat(Array(18).fill(null));
      for (const id of ['wheat_bread', 'cooked_shrimp']) if (!food) delete e.inventory[id];
      if (!drink) delete e.inventory.goldenroot_tea;
    };
    const a = await lows((e) => { kinds(e, 'switch', false, false); });
    if (!a || a.length) return 'with the store paying per use, an out-of-stock warning still fired: ' + JSON.stringify(a);
    const b = await lows((e) => { kinds(e, 'end', true, false); e.hunt.hero.mana_max = 0; e.hunt.hero.mana = 0; });
    if (!b || b.length) return 'a hero with no mana pool was warned about drinks: ' + JSON.stringify(b);
    const c = await lows((e) => kinds(e, 'end', true, true));
    if (!c || c.length) return 'a slot whose item is in the bag still read as out of stock: ' + JSON.stringify(c);
    const d = await lows((e) => kinds(e, 'end', false, true));
    return (d && d.length === 1 && / is out of Cooked Shrimp\.$/.test(d[0])) || 'own stock with "end the hunt" and no food must warn once, in words: ' + JSON.stringify(d);
  });

  await t('PI-1', async () => {
    const srv = fakeServer();
    const cs = new M.C.CharacterSession({ slot: 1, uid: UID, server: srv, ...timers });
    await cs.load();
    const P = '11111111-0000-4000-8000-00000000000a';
    const ALLOWED = new Set(['p_slot', 'p_hunt', 'p_party', 'p_seat', 'p_name', 'p_invite', 'p_session', 'p_idem']);
    const verbs = [['joinParty', [P]], ['leaveParty', []], ['kickSeat', [2]], ['inviteByName', ['Mira']],
      ['answerInvite', [P, true]], ['answerInvite', [P, false]], ['restartHunt', [P]]];
    /* createParty and the 2-arg startPartyHunt are gone (2026-10-29-party-create-retired.sql): a party is made by an invite. */
    if (typeof cs.createParty === 'function' || typeof cs.startPartyHunt === 'function') return 'CharacterSession still carries createParty / startPartyHunt';
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
    const bad = [await cs.kickSeat(-1), await cs.joinParty('not-an-id'), await cs.inviteByName(' '), await cs.restartHunt(null)];
    if (bad.some((r) => r.ok) || srv.calls.length) return 'a malformed party intent was sent: ' + JSON.stringify(srv.calls);
    const f = await cs.findParties('millrace_sewer', 'bow');
    return (f.ok && srv.calls.length === 1 && srv.calls[0][0] === 'hr_hunt_party_finder' && srv.calls[0][1].p_weapon === 'bow') || 'the finder read was wrong: ' + JSON.stringify(srv.calls);
  });

  /* PR-3 (Tyler 10-19): a party in TOWN (no instance: every unit null) is still listed, by seat, with
     who leads and who this is: the Party panel shows the party wherever it is, never "Not in a hunt." */
  await t('PR-3', async () => {
    const party = { id: '11111111-0000-4000-8000-00000000000b', hunt: 'mill_cellar', max: 2, open: true, self: null, leader: null, self_seat: 1, leader_seat: 0,
      members: [{ seat: 0, unit: null, name: 'Tyler', level: 5, weapon: 'sword', hp: 190, hp_max: 190, mana: null, mana_max: 140 },
                { seat: 1, unit: null, name: 'Tyler II', level: 3, weapon: 'staff', hp: 170, hp_max: 170, mana: null, mana_max: 120 }] };
    const p = M.HS.partyOf({ read: (k) => (k === 'party' ? party : undefined) });
    if (!p || p.members.length !== 2) return 'a party in town lists ' + (p ? p.members.length : 'no') + ' member(s), want 2';
    if (p.selfSeat !== 1 || p.leaderSeat !== 0 || p.members.some((m) => m.unit !== null)) return 'the town party lost its seats: ' + JSON.stringify(p);
    return true;
  });

  await t('PI-2', async () => {
    const srv = fakeServer();
    const acc = account(M, srv);
    const c0 = (await acc.open(0)).session;
    const c1 = (await acc.open(1)).session;
    if (!c0 || !c1) return 'the fixture characters did not open';
    const ALLOWED = new Set(['p_slot', 'p_hunt', 'p_other_slot', 'p_listed', 'p_idem']);
    srv.calls.length = 0;
    const bad = [await M.PI.startPartyHunt(acc, c0, 'Bad Hunt!'), await M.PI.inviteOwn(acc, c0, 0), await M.PI.inviteOwn(acc, c0, 9), await M.PI.inviteOwn(acc, c0, 1.5),
      await M.PI.listParty(acc, c0, 'yes')];
    if (bad.some((r) => r.ok) || srv.calls.length) return 'a malformed party intent was sent: ' + JSON.stringify(srv.calls);
    /* Start waits for everyone: the refusal names the seat, in words, and re-reads nobody. */
    srv.reply = { ok: false, error: 'not_ready', seats: [{ seat: 1, name: 'Mira', error: 'away' }] };
    const rec = c0.record;
    const r = await M.PI.startPartyHunt(acc, c0, 'millrace_sewer');
    if (r.ok || r.error !== 'not_ready' || srv.calls.length !== 1 || c0.record !== rec) return 'a refused start answered ' + JSON.stringify(r) + ' after ' + JSON.stringify(srv.calls.map((c) => c[0]));
    const a = srv.calls[0][1];
    if (srv.calls[0][0] !== 'hr_hunt_party_start' || Object.keys(a).sort().join() !== 'p_hunt,p_idem,p_slot' || a.p_slot !== 0 || a.p_hunt !== 'millrace_sewer') return 'the start sent ' + JSON.stringify(srv.calls[0]);
    if (M.IW.refusalText(r) !== 'Nobody went in: Mira is away.') return 'the not-ready words are ' + JSON.stringify(M.IW.refusalText(r));
    /* Live v0.2.11 "busy in town": an own character still gathering is settled through the engine first
       (set_activity idle collects before it switches), then the party starts. */
    srv.env[0].state = Object.assign({}, srv.env[0].state, { active_kind: 'gather', active_id: 'shrimp_s' });
    await c0.load();
    srv.calls.length = 0;
    srv.reply = { ok: true };
    await M.PI.startPartyHunt(acc, c0, 'millrace_sewer');
    const order = srv.calls.map((c) => (c[0] === 'accrue' ? 'accrue:' + JSON.stringify(c[1].activity || c[1].verb || '') : c[0])).filter((x) => x !== 'hr_load');
    if (!/^accrue:.*idle/.test(order[0] || '') || !order.includes('hr_hunt_party_start')) return 'a gathering own character was not settled before the start: ' + JSON.stringify(order);
    srv.env[0].state = Object.assign({}, srv.env[0].state, { active_kind: 'idle', active_id: null });
    await c0.load();
    /* An ok re-reads every own character the verb touched: the party's, and the one that joined. */
    for (const [fn, args, want, reads] of [['startPartyHunt', ['millrace_sewer'], 'hr_hunt_party_start', '0'], ['disbandParty', [], 'hr_hunt_party_disband', '0'],
      ['inviteOwn', [1], 'hr_hunt_party_invite_own', '0,1'], ['listParty', [true], 'hr_hunt_party_list', '0']]) {
      srv.calls.length = 0;
      srv.reply = { ok: true };
      const ok = await M.PI[fn](acc, c0, ...args);
      const sentArgs = srv.calls[0] ? srv.calls[0][1] : {};
      const extra = Object.keys(sentArgs).filter((k) => !ALLOWED.has(k));
      const loads = srv.calls.filter((c) => c[0] === 'hr_load').map((c) => c[1].p_slot).sort().join();
      if (!ok.ok || !srv.calls[0] || srv.calls[0][0] !== want || extra.length || sentArgs.p_slot !== 0) return fn + ' sent ' + JSON.stringify(srv.calls);
      if (loads !== reads) return fn + ' re-read slots [' + loads + '], want [' + reads + ']';
    }
    return true;
  });

  /* PR-4 (v0.2.11, PARTY_SPEC §2): the Party panel is the only roster. Its rows are the MEMBERSHIP (in town too,
     with away / seat kept), overlaid by seat with the hunt's numbers; "DPS and HPS" only while somebody hunts;
     Leave / Disband / Kick are party-intents verbs that re-read every own seat. */
  await t('PR-4', async () => {
    const P = '11111111-0000-4000-8000-00000000000c';
    const town = { id: P, hunt: 'mill_cellar', max: 3, open: true, self: null, leader: null, self_seat: 0, leader_seat: 0,
      members: [{ seat: 0, unit: null, hunting: false, name: 'Tyler', level: 5, weapon: 'sword', hp: 190, hp_max: 190, away: false, seat_ms: null },
                { seat: 2, unit: null, hunting: false, name: 'Mira', level: 4, weapon: 'bow', hp: 150, hp_max: 150, away: true, seat_ms: 420000 }] };
    const r = M.PP.rosterOf({ read: (k) => (k === 'party' ? town : undefined) });
    if (r.members.length !== 2 || !r.inParty || !r.isLeader || r.anyHunting) return 'the town roster read ' + JSON.stringify(r);
    const mira = r.members.find((m) => m.seat === 2);
    if (!mira || !mira.away || mira.seatMs !== 420000 || mira.level !== 4) return 'the away seat lost its clock: ' + JSON.stringify(mira);
    const hunt = { id: P, hunt: 'mill_cellar', max: 3, open: true, self: 7, leader: 7, self_seat: 0, leader_seat: 0,
      members: [{ seat: 0, unit: 7, hunting: true, name: 'Tyler', level: 5, weapon: 'sword', hp: 120, hp_max: 190, mana: 30, mana_max: 140, dps: 12.5, dealt: 900 },
                { seat: 2, unit: null, hunting: false, name: 'Mira', level: 4, weapon: 'bow', hp: 150, hp_max: 150, away: false }] };
    const h = M.PP.rosterOf({ read: (k) => (k === 'party' ? hunt : undefined) });
    const me = h.members.find((m) => m.seat === 0);
    if (!h.anyHunting || !me || me.hp !== 120 || me.mana !== 30 || me.dps !== 12.5) return 'the hunt numbers were not overlaid by seat: ' + JSON.stringify(me);
    if (h.members.find((m) => m.seat === 2).dps !== null) return 'a member in town carried hunt numbers';
    /* The panel's own wiring: words, the hidden DPS toggle, and Kick through afterLeave (every own seat re-read). */
    const nodes = new Map();
    const node = (sel) => { if (!nodes.has(sel)) nodes.set(sel, { hidden: false, disabled: false, textContent: '', a: {}, classList: { s: new Set(), contains(n) { return this.s.has(n); }, toggle(n, on) { if (on) this.s.add(n); else this.s.delete(n); } },
      getAttribute(n) { return n in this.a ? this.a[n] : null; }, setAttribute(n, v) { this.a[n] = String(v); }, hasAttribute(n) { return n in this.a; }, removeAttribute(n) { delete this.a[n]; } }); return nodes.get(sel); };
    const el = { querySelector: (sel) => (sel === '.hp-members' ? null : node(sel)) };
    const srv = fakeServer();
    const acc = account(M, srv);
    const cs = (await acc.open(0)).session;
    if (!cs) return 'the fixture character did not open';
    const view = { character: { read: (k) => (k === 'party' ? town : undefined), leaveParty: () => cs.leaveParty(), kickSeat: (s) => cs.kickSeat(s) }, account: acc, doc: null, glyphs: {} };
    M.PP.renderPartyPanel.patch(el, view);
    if (!node('[data-hs-act="expand"]').hidden) return '"DPS and HPS" shows while nobody hunts';
    if (node('[data-hs-act="leave"]').hidden || node('[data-hs-act="disband"]').hidden) return 'the leader in town has no Leave / Disband';
    srv.calls.length = 0;
    srv.reply = { ok: false, error: 'not_leader' };
    const btn = { getAttribute: (n) => (n === 'data-seat' ? '2' : null) };
    M.PP.renderPartyPanel.act(view, el, 'kick', { type: 'click' }, btn);
    for (let i = 0; i < 20 && node('.hp-msg').textContent === 'Removing…'; i++) await new Promise((res) => setTimeout(res, 5));
    const k = srv.calls.find((c) => c[0] === 'hr_hunt_party_kick');
    if (!k || k[1].p_seat !== 2 || Object.keys(k[1]).sort().join() !== 'p_idem,p_seat,p_slot') return 'Kick sent ' + JSON.stringify(srv.calls);
    if (!node('.hp-msg').textContent || node('.hp-msg').textContent === 'Removing…') return 'the refused kick has no words: ' + JSON.stringify(node('.hp-msg').textContent);
    return true;
  });

  await t('PR-1', async () => {
    const members = [{ seat: 0, weapon: 'staff', role_pick: 'healer' }, { seat: 1, weapon: 'wand', role_pick: 'tank' }, { seat: 2, weapon: 'bow', role_pick: 'tank' }, { seat: 3, weapon: 'no_such_weapon', role_pick: 'tank' }];
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

  /* PR-2 (Tyler 2026-10-19): Mage = wand + spellbook, Healer = staff. Every wand plays Mage and every staff
     Healer, the spellbook changes no role, and the server's weapon rows (hr_hunt_weapons, generated) carry
     the same key the engine and the client resolve. */
  await t('PR-2', async () => {
    const { ITEMS } = await import(pathToFileURL(join(base, 'src/data/items.js')).href);
    const R = M.ROLES;
    const role = (id) => R.roleForWeapon(R.roleWeaponOf(ITEMS[id]), 'tank');
    const wands = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'weapon' && ITEMS[id].discipline === 'destruction');
    const staves = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'weapon' && ITEMS[id].discipline === 'restoration');
    if (wands.length < 6 || staves.length < 7) return `want the wand and staff ladders, got ${wands.length} wands, ${staves.length} staves`;
    const bad = [...wands.filter((id) => role(id) !== 'mage'), ...staves.filter((id) => role(id) !== 'healer')];
    if (bad.length) return 'wrong role for ' + bad.map((id) => id + '=' + role(id)).join(', ');
    if (R.roleWeaponOf(null) !== 'neutral' || role('apprentice_primer') === 'mage' && ITEMS.apprentice_primer.slot === 'weapon') return 'the spellbook or bare hands resolve wrong';
    /* The hunt-sessions catalogue the generator writes now (its newest forward file), not a dated copy. */
    const { OUT_NAME } = await import(pathToFileURL(join(ROOT, 'tools/gen-hunt-sessions.mjs')).href);
    const sql = readFileSync(join(base, 'supabase/migrations', OUT_NAME), 'utf8');
    for (const id of [...wands, ...staves]) {
      const m = new RegExp(`\\('${id}', '([a-z_]+)'\\)`).exec(sql);
      if (!m || m[1] !== R.roleWeaponOf(ITEMS[id])) return `hr_hunt_weapons says ${id} is ${m && m[1]}, the engine says ${R.roleWeaponOf(ITEMS[id])}`;
    }
    return true;
  });
  return fails;
}

/* ── IN THE PAGE ── */
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function scripted() {
  const s = { env: clone(FIXTURE.characters), version: 1, calls: [], residue: { 0: {}, 1: {} }, delayMs: 300, startReplies: [] };
  s.next = (slot) => Object.assign(clone(s.env[slot]), { version: ++s.version, client_state: clone(s.residue[slot] || {}) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.env[body.p_slot] ? s.next(body.p_slot) : { ok: false, error: 'no_character' });
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next(body.slot)));
    if (name === 'hr_put_client_state') { Object.assign(s.residue[body.p_slot], body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_hunt_party_finder') return json({ ok: true, parties: [{ id: 'dddddddd-0000-4000-8000-000000000004', hunt: 'millrace_sewer', max: 4,
      seats: [{ seat: 0, weapon: 'shield', name: 'Oren' }, { seat: 1, weapon: 'club', name: 'Pell' }] }] });
    if (PARTY_RPCS.includes(name)) {
      await new Promise((ok) => setTimeout(ok, s.delayMs));
      return json(name === 'hr_hunt_party_start' && s.startReplies.length ? s.startReplies.shift() : { ok: true });
    }
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
  const browser = await leaseBrowser(chromium);
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
      /* A step that throws (a control missing from the page) is a red rule, never a crash of the run. */
      try {
      if (!(await openBoth(page, base))) { fails.push('UI-1 [' + tag + '] two characters did not open beside each other' + (errors.length ? ': ' + errors.slice(0, 2).join(' | ') : '')); await ctx.close(); continue; }
      /* UI-1: one tab per character, its name, what it does, its badge; a press shows it and re-reads nobody. */
      await page.waitForTimeout(400);
      const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.char-tab[data-app="show"]')).map((b) => ({ slot: b.getAttribute('data-slot'),
        name: b.querySelector('.char-tab-name').textContent, doing: b.querySelector('.char-tab-doing').textContent, badge: b.querySelector('.char-badge').textContent, on: b.classList.contains('is-shown') })));
      const t0 = tabs.find((x) => x.slot === '0'), t1 = tabs.find((x) => x.slot === '1');
      if (!t0 || t0.name !== 'Tyler' || t0.doing !== 'Hunting in The Sewer' || t0.badge !== '1') fails.push('UI-1 [' + tag + '] tab 0 reads ' + JSON.stringify(t0));
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
      /* The town character (slot 1) has an invite waiting: its alert line rides beside the rare drop (UI-6). */
      await wait(page, () => document.querySelectorAll('.hw-alert').length >= 2, null, 3000);
      if ((await lines()) !== 'invite,rare') fails.push('UI-2 [' + tag + '] the alert lines are [' + (await lines()) + '], want [invite,rare]');
      await shot('strip-alerts');
      await pushEnvelope(page, s, 0);
      if ((await lines()) !== 'invite,rare') fails.push('UI-2 [' + tag + '] after a re-read the alert lines are [' + (await lines()) + ']');
      /* UI-6: the invite toast answers in place: Join / No thanks; Join is ONE accept, off while in flight. */
      const toast = '.hw-alert[data-kind="invite"]';
      const no = await page.evaluate((q) => { const b = document.querySelector(q + ' [data-hs-act="alert-no"]'); return b && !b.hidden ? b.textContent : null; }, toast);
      if (no !== 'No thanks') fails.push('UI-6 [' + tag + '] the invite line offers ' + JSON.stringify(no) + ', not No thanks');
      const acc0 = sent(s, 'hr_hunt_party_accept').length;
      /* The press and the read in ONE turn: the button must be off from the press itself, not from some later paint. */
      const toastOff = await page.evaluate((q) => { const b = document.querySelector(q + ' [data-hs-act="alert-do"]'); b.click(); return b.disabled; }, toast);
      if (!toastOff) fails.push('UI-6 [' + tag + '] Join stayed on while the intent was in flight');
      await page.waitForTimeout(700);
      const ta = sent(s, 'hr_hunt_party_accept').slice(acc0);
      if (ta.length !== 1 || ta[0].body.p_slot !== 1 || ta[0].body.p_invite !== 'bbbbbbbb-0000-4000-8000-000000000002') fails.push('UI-6 [' + tag + '] Join sent ' + JSON.stringify(ta.map((c) => c.body)));
      /* UI-7: the strip's right-click. Tab 1 (own, in no party): Invite to party, ONE own invite; tab 0 (partied): Leave party. */
      const menuIds = async (slot) => {
        await page.keyboard.press('Escape');
        await page.click('.char-tab[data-slot="' + slot + '"]', { button: 'right' });
        await wait(page, () => document.querySelector('.hw-menu .hw-mi'), null, 2000);
        return page.evaluate(() => Array.from(document.querySelectorAll('.hw-menu .hw-mi')).map((b) => b.getAttribute('data-hs-act')));
      };
      const m1 = await menuIds(1);
      if (!m1.includes('party-invite') || m1.includes('party-leave')) fails.push('UI-7 [' + tag + '] tab 1 offers ' + JSON.stringify(m1));
      else {
        const before = sent(s, 'hr_hunt_party_invite_own').length;
        await page.click('.hw-menu [data-hs-act="party-invite"]');
        await page.waitForTimeout(700);
        const io = sent(s, 'hr_hunt_party_invite_own').slice(before);
        if (io.length !== 1 || Object.keys(io[0].body).sort().join() !== 'p_idem,p_other_slot,p_slot' || io[0].body.p_slot !== 0 || io[0].body.p_other_slot !== 1) fails.push('UI-7 [' + tag + '] Invite sent ' + JSON.stringify(io.map((c) => c.body)));
      }
      const m0 = await menuIds(0);
      if (!m0.includes('party-leave') || m0.includes('party-invite')) fails.push('UI-7 [' + tag + '] tab 0 offers ' + JSON.stringify(m0));
      else {
        const before = sent(s, 'hr_hunt_party_leave').length;
        await page.click('.hw-menu [data-hs-act="party-leave"]');
        await page.waitForTimeout(700);
        const lv = sent(s, 'hr_hunt_party_leave').slice(before);
        if (lv.length !== 1 || lv[0].body.p_slot !== 0) fails.push('UI-7 [' + tag + '] Leave sent ' + JSON.stringify(lv.map((c) => c.body)));
      }
      await page.keyboard.press('Escape');
      /* UI-3: the leader starts from the Hunts window, between hunts. */
      for (const m of s.env[0].party.members) { m.hunting = false; m.unit = null; }
      s.env[0].hunt.ended = true;
      s.env[0].hunt.session = Object.assign({}, s.env[0].hunt.session, { end_reason: 'left', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
      await pushEnvelope(page, s, 0);
      if (!(await openWin(page, 'h', 'hunts'))) fails.push('UI-3 [' + tag + '] H did not open the Hunts window');
      else {
        const W = '[data-hs-win="hunts"] ';
        /* UI-5 (Tyler 10-19): the party note is the PICKED ground's, from its row. */
        for (const hunt of ['millrace_sewer', 'coppercap_warrens', 'millrace_sewer']) {
          await page.click(W + '.hw-hunt[data-hunt="' + hunt + '"] .hw-hunt-name');
          const got = await page.evaluate((q) => { const n = document.querySelector(q); return n && !n.hidden ? n.textContent : ''; }, W + '.hw-hunt[data-hunt="' + hunt + '"] .hw-hunt-party');
          if (got !== PARTY_NOTES[hunt]) fails.push('UI-5 [' + tag + '] with ' + hunt + ' picked the note reads ' + JSON.stringify(got) + ', want ' + JSON.stringify(PARTY_NOTES[hunt]));
        }
        const go = W + '.hw-hunt[data-hunt="millrace_sewer"] [data-hs-act="enter"]';
        const label = await page.evaluate((q) => document.querySelector(q).textContent, go);
        if (label !== 'Start with party') fails.push('UI-3 [' + tag + '] the leader’s button reads ' + JSON.stringify(label));
        await shot('hunts-leader');
        s.startReplies.push({ ok: false, error: 'not_ready', seats: [{ seat: 1, name: 'Mira', error: 'away' }] });
        const before = sent(s, 'hr_hunt_party_start').length;
        await page.click(go);
        if (!(await page.evaluate((q) => document.querySelector(q).disabled, go))) fails.push('UI-3 [' + tag + '] Start with party stayed on while the intent was in flight');
        await page.waitForTimeout(700);
        const st = sent(s, 'hr_hunt_party_start').slice(before);
        if (st.length !== 1 || Object.keys(st[0].body).sort().join() !== 'p_hunt,p_idem,p_slot' || st[0].body.p_slot !== 0 || st[0].body.p_hunt !== 'millrace_sewer') fails.push('UI-3 [' + tag + '] Start sent ' + JSON.stringify(st.map((c) => c.body)));
        const said = await page.evaluate((q) => document.querySelector(q).textContent, W + '.hh-intent-msg');
        if (said !== 'Nobody went in: Mira is away.') fails.push('UI-3 [' + tag + '] a refused start says ' + JSON.stringify(said));
      }
      /* UI-4: the command centre lists both characters. */
      if (!(await openWin(page, 'o', 'characters'))) fails.push('UI-4 [' + tag + '] O did not open the command centre');
      else {
        const names = await page.evaluate(() => Array.from(document.querySelectorAll('.hw-char .hw-char-name')).map((b) => b.textContent).join(','));
        if (names !== 'Tyler,Druid') fails.push('UI-4 [' + tag + '] the command centre lists ' + names);
        await shot('command-centre');
      }
      /* UI-8: the leader's listing switch (private until listed): the server's `listed`, ONE hr_hunt_party_list. */
      if (await openWin(page, 'y', 'hunt-party')) {
        const P = '[data-hs-win="hunt-party"] ';
        await page.click(P + '.hw-tab[data-tab="find"]');
        const sw = await page.evaluate((q) => { const d = document.querySelector(q + '.hw-list-party'); return d && { hidden: d.hidden, text: d.querySelector('button').textContent }; }, P);
        if (!sw || sw.hidden || sw.text !== 'Show in the finder') fails.push('UI-8 [' + tag + '] the leader’s listing switch reads ' + JSON.stringify(sw));
        else {
          const before = sent(s, 'hr_hunt_party_list').length;
          const off = await page.evaluate((q) => { const b = document.querySelector(q + '[data-hs-act="list-party"]'); b.click(); return b.disabled; }, P);
          if (!off) fails.push('UI-8 [' + tag + '] the listing switch stayed on while in flight');
          await page.waitForTimeout(700);
          const ls = sent(s, 'hr_hunt_party_list').slice(before);
          if (ls.length !== 1 || ls[0].body.p_slot !== 0 || ls[0].body.p_listed !== true) fails.push('UI-8 [' + tag + '] the switch sent ' + JSON.stringify(ls.map((c) => c.body)));
        }
      } else fails.push('UI-8 [' + tag + '] Y did not open the Party window for the leader');
      /* UI-3: the finder on the town character starts on its own weapon; Join is one intent. */
      await closeAll(page);
      await page.click('.char-tab[data-slot="1"]');
      await wait(page, () => document.querySelector('#panel-world[data-slot="1"]') && document.querySelector('.hs-launchers'));
      if (await openWin(page, 'y', 'hunt-party')) {
        const P = '[data-hs-win="hunt-party"] ';
        /* An invite is waiting: the Invites tab opens first; Join is ONE accept naming it. */
        const tab = await page.evaluate((q) => { const b = document.querySelector(q + '.hw-tab[aria-selected="true"]'); return b && b.getAttribute('data-tab'); }, P);
        if (tab !== 'invites') fails.push('UI-3 [' + tag + '] the Party window opened on ' + JSON.stringify(tab) + ' with an invite waiting');
        await shot('party-invites');
        const acc1 = sent(s, 'hr_hunt_party_accept').length;
        /* (not on screen = the rule is red, never a crash) */
        await page.click(P + '.hw-invites [data-hs-act="accept"]', { timeout: 2000 }).catch(() => fails.push('UI-3 [' + tag + '] the invite’s Join is not on screen'));
        await page.waitForTimeout(700);
        const ac = sent(s, 'hr_hunt_party_accept').slice(acc1);
        if (ac.length !== 1 || ac[0].body.p_slot !== 1 || ac[0].body.p_invite !== 'bbbbbbbb-0000-4000-8000-000000000002') fails.push('UI-3 [' + tag + '] Join sent ' + JSON.stringify(ac.map((c) => c.body)));
        await page.click(P + '.hw-tab[data-tab="find"]');
        const w = await page.evaluate(() => document.querySelector('[data-hs-act="find-weapon"]').value);
        if (w !== 'staff') fails.push('UI-3 [' + tag + '] the finder starts on "' + w + '", not this character’s staff');
        await page.click(P + '[data-hs-act="find"]');
        await wait(page, () => document.querySelector('.hw-found-row'), null, 3000);
        const fin = sent(s, 'hr_hunt_party_finder');
        if (fin.length !== 1 || fin[0].body.p_weapon !== 'staff' || fin[0].body.p_hunt !== null) fails.push('UI-3 [' + tag + '] the finder sent ' + JSON.stringify(fin.map((c) => c.body)));
        await shot('party-finder');
        await page.click('.hw-found-row [data-hs-act="join"]');
        await page.waitForTimeout(700);
        const j = sent(s, 'hr_hunt_party_join');
        if (j.length !== 1 || j[0].body.p_party !== 'dddddddd-0000-4000-8000-000000000004' || j[0].body.p_slot !== 1) fails.push('UI-3 [' + tag + '] Join sent ' + JSON.stringify(j.map((c) => c.body)));
        /* A member (not the leader) cannot start: its Enter stays off, the leader picks the ground. */
        s.env[1].party = Object.assign(clone(s.env[0].party), { self_seat: 1, leader_seat: 0 });
        await pushEnvelope(page, s, 1);
        if (await openWin(page, 'h', 'hunts')) {
          const b = await page.evaluate(() => { const e = document.querySelector('[data-hs-win="hunts"] .hw-hunt.is-picked [data-hs-act="enter"]'); return e && { off: e.disabled, text: e.textContent }; });
          if (!b || !b.off || b.text !== 'Enter') fails.push('UI-3 [' + tag + '] a member’s Enter reads ' + JSON.stringify(b));
        } else fails.push('UI-3 [' + tag + '] H did not open the Hunts window for character 1');
      } else fails.push('UI-3 [' + tag + '] the Party window did not open for character 1');
      } catch (e) { fails.push('UI-? [' + tag + '] a page step threw: ' + String(e.message).split('\n')[0]); }
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
  ['a slot item in the bag reads as out of stock', 'src/shell/alerts.js', 'const stock = (id) => have.get(id) || 0;', 'const stock = () => 0;'],
  ['the run-out line names no takeover', 'src/shell/alerts.js', "  const then = typeof ev.next === 'string' && Number.isInteger(ev.slot)", '  const then = false'],
  ['another hero raises the run-out line', 'src/shell/alerts.js', ' || ev.u !== h.hero.unit) return null;', ') return null;'],
  ["a party member's rare drop alerts this hero", 'src/shell/alerts.js', '  if (h && h.hero && Number.isInteger(ev.u) && Number.isInteger(h.hero.unit) && ev.u !== h.hero.unit) return null;\n', ''],
  ['the run-out event raises nothing', 'src/shell/alerts.js', 'const c = rareOf(cs, ev) || runOutOf(cs, ev);', 'const c = rareOf(cs, ev);'],
  ['an alert fires on every read', 'src/shell/alerts.js', '    if (mine.has(c.id) || (Array.isArray(stored) && stored.includes(c.id))) return false;\n', ''],
  ['the shown ids are not kept for the next visit', 'src/shell/alerts.js', "    cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: (Array.isArray(stored) ? stored : []).concat(c.id).slice(-ALERTS_SEEN_MAX) });\n", ''],
  ['a switched-off kind still alerts', 'src/shell/alerts.js', '    if (!alertShown(cs, c.kind)) return false;\n', ''],
  ['a party intent changes the record before the server', 'src/session/character-session.js', "  async leaveParty() {\n    if (this._closed) return { ok: false, error: 'closed' };\n",
    "  async leaveParty() {\n    if (this._closed) return { ok: false, error: 'closed' };\n    this._record = Object.freeze(Object.assign({}, this._record, { version: this._record.version }));\n"],
  ['a kick names a user', 'src/session/character-session.js', "{ p_slot: this.slot, p_seat: seat, p_idem: newIdem() }", "{ p_slot: this.slot, p_seat: seat, p_user: this.uid, p_idem: newIdem() }"],
  ['a malformed seat is sent', 'src/session/character-session.js', "if (this._closed || !Number.isInteger(seat) || seat < 0 || seat > 7) return { ok: false, error: 'bad_intent' };", "if (this._closed) return { ok: false, error: 'bad_intent' };"],
  ['the server role pick is trusted over the weapon', 'src/session/party-sections.js', "role: roleForWeapon(w, pick),", "role: pick || roleForWeapon(w, null),"],
  ['a training pointer runs with no Stop line', 'src/session/party-sections.js', "gather: 'gathering', artisan: 'at a workbench', training: 'training' });", "gather: 'gathering', artisan: 'at a workbench' });"],
  ['a resumed gather is not named', 'src/session/party-sections.js', "  ...FISH_SPOTS.map((n) => ['gather:' + n.id, 'fishing at the ' + n.name]),\n", ''],
  ['the Stop line ignores a town pointer that is not a bury', 'src/shell/windows/inventory/bury.js', "  return words ? 'Your hero is ' + words", "  return words && false ? 'Your hero is ' + words"],
  ['a party start re-reads nobody', 'src/session/party-intents.js', "    await Promise.all(Array.from(new Set(reread)).filter((o) => o && o.status !== 'closed').map((o) => o.load()));\n", ''],
  ['the start does not settle a gathering own character first', 'src/session/party-intents.js', '  for (const o of peers) await settleTownActivity(o);\n', ''],
  ['an own invite names a user', 'src/session/party-intents.js', '{ p_slot: cs.slot, p_other_slot: otherSlot, p_idem: newIdem() }', '{ p_slot: cs.slot, p_other_slot: otherSlot, p_user: account.userId, p_idem: newIdem() }'],
  ['an own invite re-reads only the inviter', 'src/session/party-intents.js', '  const peers = partyPeersOf(account, cs).concat(other ? [other] : []);', '  const peers = partyPeersOf(account, cs);'],
  ['an own invite to the same slot is sent', 'src/session/party-intents.js', ' || otherSlot === cs.slot) {', ') {'],
  ['the roster is the hunt section only (a party in town is not listed)', 'src/shell/widgets/party-panel.js', '  if (p) {\n    const members = p.seats', '  if (p && h) {\n    const members = p.seats'],
  ['an away seat reads as in town', 'src/shell/widgets/party-panel.js', "  if (m.away) return m.seatMs === null ? 'Away' : 'Away, seat kept ' + Math.max(1, Math.ceil(m.seatMs / 60000)) + ' min';\n", ''],
  ['DPS and HPS shows with nobody hunting', 'src/shell/widgets/party-panel.js', "  prop(expand, 'hidden', !r.anyHunting);", "  prop(expand, 'hidden', false);"],
  ['not ready names nobody', 'src/shell/intent-words.js', "    return 'Nobody went in: ' + seats.map((x) => x.name + ' ' + (x.error === 'hunt_open' && x.hunt && HUNT_INDEX[x.hunt]\n      ? 'is still hunting in ' + HUNT_INDEX[x.hunt].name : SEAT_WORDS[x.error] || 'is not ready')).join('; ') + '.';", "    return 'Not everyone in the party is ready.';"],
];
const PAGE_MUTANTS = [
  ['Start with party stays on while in flight', 'src/shell/windows/hunts.js', "for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending || !!now);", "for (const b of li.querySelectorAll('button')) prop(b, 'disabled', !!now);"],
  ['a member may press Start', 'src/shell/windows/hunts.js', '      if (follower) prop(enter, \'disabled\', true);\n', ''],
  ['the strip tab is no menu target', 'src/app/character-strip.js', '  markPlayer(b, uid ? { id: uid, name: x.name, slot: x.slot } : null);', '  markPlayer(b, null);'],
  ['the invite toast cannot answer', 'src/shell/widgets/alerts.js', "  if (a.action === 'join') { if (a.invite) await settle(ctx, el, a, (cs) => cs.answerInvite(a.invite, action === 'alert-do')); return; }", "  if (a.action === 'join') return;"],
  ['the toast stays on while in flight', 'src/shell/widgets/alerts.js', "  ctx.alerts.mark(a.key, true, '');\n  renderAlerts.patch(el, ctx);\n", "  ctx.alerts.mark(a.key, true, '');\n"],
  ['the listing switch stays on while in flight', 'src/shell/windows/party-finder.js', "  prop(sw.querySelector('button'), 'disabled', sc.pending);", "  prop(sw.querySelector('button'), 'disabled', false);"],
  ['the leader has no listing switch', 'src/shell/windows/party-finder.js', "  prop(sw, 'hidden', !(mine && mine.isLeader));", "  prop(sw, 'hidden', true);"],
  ['the Party window opens on the finder with an invite waiting', 'src/shell/windows/party.js', "  const tab = sc.tab || (inv.length ? 'invites' : 'find');", "  const tab = sc.tab || 'find';"],
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
