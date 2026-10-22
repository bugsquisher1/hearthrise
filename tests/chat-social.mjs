#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/chat-social.mjs — THE CHAT WINDOW AND THE SOCIAL SIDE, ONE TEST PER RULE.
//
//   node tests/chat-social.mjs                the rules (pure node, then a real Chromium)
//   node tests/chat-social.mjs --pure         the pure rules only (no browser)
//   node tests/chat-social.mjs --mutate       every planted defect must turn a rule RED
//   node tests/chat-social.mjs --shots <dir>  also write the visual-gate screenshots (1440x900, 922x423)
//
// mutant-anchors: src/social/ src/data/chat-channels.js src/data/shell-windows.js src/shell/window-sizes.js src/shell/windows/inventory/index.js src/styles/hunt.css src/shell/context-menu.js src/shell/menu-providers.js src/shell/windows/chat.js src/shell/windows/friends.js src/hunt-view/scene.js src/session/party-sections.js src/world/world-boot.js
// mutant-writes-tree: no — pure mutants plant into a temp copy of src/, page mutants into served overrides
//
// The server half of every rule (the sender's name, level and role stamped by
// the server; the rate limit; a forged or unknown item link refused; a block
// refusing whispers, friend asks and inspect both ways; inspect answering worn
// items only; the closed-mode refusal) is EXECUTED by the §6/§7 self-checks of
// supabase/migrations/2026-10-25-chat-channels.sql and 2026-10-25-social.sql on
// every chain replay (tests/schema-drift.mjs). These are the client's rules:
//   CL-1  A LINE IS THE SERVER'S ROW: time HH:MM, name, level, and the role is
//         roleForWeapon(weapon, pick) — a pick the weapon does not allow is ignored
//   CL-2  SEND IS ONE INTENT: hr_chat_send names the slot, the channel KIND and the
//         body, nothing about the sender; the line shows only from the answer
//   CL-3  CHANNELS ARE THE SERVER'S: the client listens to exactly global, system and
//         the zone and party hr_chat_recent named; Party shows only in a party
//   CL-4  HISTORY IS THE SERVER'S WINDOW (2026-11-19-chat-stream-safe.sql): every
//         re-read REPLACES the server tabs with exactly the lines hr_chat_recent
//         returned (a line older than the server's floor leaves the window), and a
//         body renders as the server sent it (a masked word stays stars; the
//         client never filters, restores or re-words a line)
//   UN-1  UNREAD: a pushed line on a tab not on screen counts; on screen it does
//         not; a window that stopped painting is not on screen
//   WH-1  A WHISPER opens its conversation with an unread count; sending is ONE
//         hr_whisper_send naming the slot, the target id and the body
//   BL-1  A BLOCK is ONE hr_block_set, and the blocked player's lines leave the
//         chat and the whispers at once
//   LK-1  ITEM LINKS: only a catalogue id becomes a link (an unknown id is words);
//         the body carries the id marker, at most three, never a name or rarity
//   WN-1  A WORLD NOTICE (a System row, written only by the server: 2026-11-24-rare-broadcast.sql)
//         reads as one sentence, the hero's name first, its item a link and its hunt
//         marker the hunt's name; in a player's line a hunt marker stays as typed
//   RB-1  WORLD_NOTICES.rare_drop (src/data/chat-channels.js) is the migration's seeded rule
//   MN-1  THE MENU lists the data rows its providers allow, in row order: Trade
//         never (hidden until its lane); no Message or Block on yourself; a
//         blocked player gets Unblock; a monster gets Look
//   FR-1  FRIENDS read as the server said: online, and what they are doing
//   ON-1  PLAYERS ONLINE (tracker r16): the count is hr_players_online's answer, asked
//         on each social poll naming the account's open character slots, replaced by
//         each answer; a refused or malformed answer reads "— online", never the last
//         number
//   ON-2  [page] the counter reads the server's "3 online" at 12 px or more, on
//         screen, overlapping no other widget; off by default on a phone
//   CW-1  [page] a pushed line renders time + name [level, role glyph] + body, the
//         name coloured by role; a link shows the catalogue name in its rarity
//   CW-2  [page] an unread dot on a tab that got a line, cleared when shown
//   CW-3  [page] typing in the field never gets past it to the World's walk keys;
//         once blurred (Esc), W reaches the page again; Enter sends ONE intent
//   CW-5  [page] a right-click on the World's canvas: a party member opens the player menu
//         under that player's name (the server's party_people id: Message, Add friend,
//         Block), a monster opens Look, the ground opens nothing, the viewed hero no menu
//   RT-1  the realtime bindings one client holds are capped by CHAT_LIMITS.realtimeBindingsMax
//   WT-1  a World pick becomes a stamped player, a monster, or nothing
//   CW-6  [page] THE MENU STAYS (playtest 10-22: "right click outside of the bag is not
//         sticking"): with the Inventory open, the menu a right-click on a chat name opens
//         is still open after the bag's display ticks, until Esc
//   CW-7  [page] CHAT (Tyler 2026-10-22): on desktop it opens floating at the World's
//         bottom-left (12 px in, 44 px up, clear of Players online; 12 px above the action
//         bar where its column crosses the bar, never over it), see-through
//         (background alpha under .9) with lines at 12 px or more; its grip makes it 80 px
//         wider and 60 px taller with its bottom-left corner still, that size is ONE
//         residue put (winSize.chat) and comes back after a reload; on a phone it is the
//         right-hand sheet with no grip
//   CW-4  [page] the right-click menu on a name opens at page level with Inspect,
//         Message, Add friend, Invite to party, Block (no Trade); a press on it never reaches the World;
//         Inspect shows the worn items; zero console errors throughout
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href);
const NOTICE_SQL = await readFile(join(ROOT, 'supabase/migrations/2026-11-24-rare-broadcast.sql'), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const OTHER = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const PARTY = 'party:dddddddd-0000-4000-8000-0000000000c1';
const ZONE = 'local:mill_cellar';
let seq = 0;
const row = (o) => Object.assign({ id: '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0'), channel: 'global', from_id: OTHER,
  from_name: 'Bramble', from_slot: 0, from_level: 34, from_weapon: 'sword', from_role: null, body: 'hello', created_at: '2026-10-18T09:05:00Z' }, o);

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const [lines, store, wh, menu, prov, friends, fwin, rt, chans, online] = await Promise.all(['src/social/chat-lines.js', 'src/social/social-session.js',
    'src/social/whispers.js', 'src/shell/context-menu.js', 'src/shell/menu-providers.js', 'src/social/friends.js', 'src/shell/windows/friends.js',
    'src/social/realtime.js', 'src/data/chat-channels.js', 'src/social/players-online.js'].map((p) => import(u(p))));
  return { lines, store, wh, menu, prov, friends, fwin, rt, chans, online };
}

/* ── PURE ── */
function fakeAccount(answers) {
  const calls = [];
  const subs = new Set();
  const rec = { hunt: null, party: null };
  const cs = { slot: 0, read: (k) => rec[k], subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } };
  const acct = {
    userId: UID, viewed: 0, character: (s) => (s === 0 ? cs : null),
    subscribe: () => () => {},
    server: { rpc: async (name, args) => { calls.push({ name, args }); const a = answers[name]; return { ok: true, body: typeof a === 'function' ? await a(args) : a || { ok: true } }; } },
  };
  return { acct, calls, rec, cs };
}
function fakeRealtime() {
  const rt = { chats: [], whisperTo: null, push: null, pushW: null };
  rt.chat = (channels, onRow) => { rt.chats.push(channels.slice()); rt.push = onRow; return () => {}; };
  rt.whispers = (uid, onRow) => { rt.whisperTo = uid; rt.pushW = onRow; return () => {}; };
  return rt;
}
const tick = () => new Promise((ok) => setTimeout(ok, 0));

async function pureRules(M) {
  const fails = [];
  const fail = (m) => fails.push(m);
  const { lineOf, partsOf, bodyOf } = M.lines;
  // CL-1
  const l = lineOf(row({ from_role: 'healer', created_at: '2026-10-18T09:05:00Z' }), { tz: 'utc' });
  if (!l || l.time !== '09:05' || l.name !== 'Bramble' || l.level !== 34 || l.role !== 'tank') fail('CL-1 a sword line with a healer pick reads ' + JSON.stringify(l && { time: l.time, level: l.level, role: l.role }));
  const s = lineOf(row({ from_weapon: 'staff', from_role: 'healer' }));
  if (!s || s.role !== 'healer') fail('CL-1 a staff with a healer pick should be a healer');
  if (lineOf(row({ channel: 'party:not-a-party' })) || lineOf(row({ id: 'x' })) || lineOf(row({ created_at: 'never' }))) fail('CL-1 a malformed row became a line');
  // LK-1
  const p = partsOf('see [[item:bronze_sword]] and [[item:no_such_zz]]');
  if (!p.some((x) => x.item === 'bronze_sword') || p.some((x) => x.item === 'no_such_zz')) fail('LK-1 parts ' + JSON.stringify(p));
  const b = bodyOf('try [Bronze Sword] now', ['bronze_sword', 'no_such_zz']);
  if (b !== 'try [[item:bronze_sword]] now') fail('LK-1 the body is "' + b + '"');
  if (bodyOf('[Bronze Sword]', ['bronze_sword']).includes('Bronze')) fail('LK-1 the body carries the item name');
  const four = bodyOf('[Bronze Sword] [Bronze Sword] [Bronze Sword] [Bronze Sword]', ['bronze_sword', 'bronze_sword', 'bronze_sword', 'bronze_sword']);
  if ((four.match(/\[\[item:/g) || []).length !== 3) fail('LK-1 four links became ' + four);
  // WN-1: a System row is the server's world notice, one sentence with the hero's name first
  {
    const n = lineOf(row({ channel: 'system', from_name: 'Mira', from_level: null, from_weapon: null, body: 'found [[item:bronze_sword]] in [[hunt:mill_cellar]].' }));
    const words = n && n.parts.map((x) => (x.item ? '<' + x.item + '>' : x.text)).join('');
    if (!n || n.system !== true || n.fromId !== OTHER || n.level !== null || n.role !== null || words !== 'Mira found <bronze_sword> in ' + HUNT_INDEX.mill_cellar.name + '.')
      fail('WN-1 a world notice reads ' + JSON.stringify(n && { system: n.system, words, level: n.level }));
    if (M.lines.tabOfChannel('system', ZONE, PARTY) !== 'system') fail('WN-1 a System row is not on the System tab');
    const said = lineOf(row({ body: 'meet in [[hunt:mill_cellar]]' }));
    if (!said || said.system || said.parts.map((x) => x.text || '').join('') !== 'meet in [[hunt:mill_cellar]]') fail('WN-1 a player\'s hunt marker became ' + JSON.stringify(said && said.parts));
    /* RB-1: the data row is the migration's seeded row (src/data is the one source). */
    const rule = M.chans.WORLD_NOTICES && M.chans.WORLD_NOTICES.rare_drop;
    const seed = /insert into public\.hr_world_notice_rules \(kind, channel, per_char_day\) values \('rare_drop', '([a-z]+)', (\d+)\)/.exec(NOTICE_SQL);
    const check = /if v_cap is distinct from (\d+) then/.exec(NOTICE_SQL);
    if (!rule || !seed || !check || seed[1] !== rule.channel || Number(seed[2]) !== rule.perCharacterPerDay || Number(check[1]) !== rule.perCharacterPerDay)
      fail('RB-1 WORLD_NOTICES.rare_drop ' + JSON.stringify(rule) + ' is not 2026-11-24-rare-broadcast.sql\'s seeded row ' + JSON.stringify(seed && seed.slice(1)));
  }

  // CL-2, CL-3, UN-1 over a ChatStore
  {
    let release;
    const gate = new Promise((ok) => { release = ok; });
    const answers = {
      hr_chat_recent: { ok: true, zone: 'local:town', party: null, lines: [row({ body: 'old' })] },
      hr_chat_send: (a) => gate.then(() => ({ ok: true, line: row({ from_id: UID, from_name: 'Me', body: a.p_body }) })),
    };
    const { acct, calls, rec } = fakeAccount(answers);
    const rt = fakeRealtime();
    const soc = new M.store.SocialSession({ account: acct, realtime: rt, timers: { setTimer: () => 1, clearTimer: () => {} } });
    soc.start();
    await tick(); await tick();
    const chat = soc.chat;
    if (chat.lines('global').length !== 1) fail('CL-3 the history did not land in Global');
    const last = rt.chats[rt.chats.length - 1] || [];
    if (last.join(',') !== 'global,system,local:town') fail('CL-3 listening to ' + JSON.stringify(last));
    if (chat.shows('party')) fail('CL-3 the Party tab shows out of a party');
    const sending = chat.send('global', 'hi [Bronze Sword]', ['bronze_sword']);
    await tick();
    const sent = calls.filter((c) => c.name === 'hr_chat_send');
    if (sent.length !== 1 || Object.keys(sent[0].args).sort().join(',') !== 'p_body,p_kind,p_slot' || sent[0].args.p_kind !== 'global'
      || sent[0].args.p_body !== 'hi [[item:bronze_sword]]') fail('CL-2 sent ' + JSON.stringify(sent.map((c) => c.args)));
    if (chat.lines('global').length !== 1) fail('CL-2 the line showed before the server answered');
    release();
    const r = await sending;
    if (!r.ok || chat.lines('global').length !== 2) fail('CL-2 the answered line did not show');
    // party → re-read → listen
    rec.party = { id: 'dddddddd-0000-4000-8000-0000000000c1', self_seat: 0, leader_seat: 0, members: [{ seat: 0, name: 'Me', weapon: 'sword' }] };
    answers.hr_chat_recent = { ok: true, zone: 'local:town', party: PARTY, lines: [row({ body: 'what the ***** happened [[item:bronze_sword]]' })] };
    await chat.refresh();
    // CL-4
    const win = chat.lines('global');
    if (win.length !== 1 || win[0].parts.map((x) => x.text || '[' + x.item + ']').join('') !== 'what the ***** happened [bronze_sword]')
      fail('CL-4 the window after a re-read is not the server lines: ' + JSON.stringify(win.map((x) => x.parts)));
    if (!chat.shows('party') || (rt.chats[rt.chats.length - 1] || []).join(',') !== 'global,system,local:town,' + PARTY) fail('CL-3 a party did not add the party channel: ' + JSON.stringify(rt.chats[rt.chats.length - 1]));
    // UN-1
    chat.view('global', true);
    rt.push(row({ body: 'seen' }));
    if (chat.unread('global') !== 0) fail('UN-1 a line on the tab on screen counted unread');
    rt.push(row({ channel: 'local:town', body: 'here' }));
    if (chat.unread('local') !== 1) fail('UN-1 a line on a tab off screen did not count (' + chat.unread('local') + ')');
    rt.push(row({ channel: 'local:somewhere_else', body: 'not mine' }));
    if (chat.lines('local').some((x) => x.parts[0].text === 'not mine')) fail('CL-3 a line from another zone landed in Local');
    chat._screen.at -= 5000;
    rt.push(row({ body: 'after close' }));
    if (chat.unread('global') !== 1) fail('UN-1 a window that stopped painting still counted as on screen');
    // WH-1
    rt.pushW(row({ channel: undefined, to_id: UID, to_name: 'Me', body: 'psst' }));
    const conv = soc.whispers.conversations();
    if (conv.length !== 1 || conv[0].id !== OTHER || conv[0].unread !== 1) fail('WH-1 conversations ' + JSON.stringify(conv));
    acct.server.rpc = async (name, args) => { calls.push({ name, args }); return { ok: true, body: name === 'hr_whisper_send'
      ? { ok: true, line: row({ from_id: UID, to_id: OTHER, to_name: 'Bramble', body: args.p_body }) } : name === 'hr_block_set'
        ? { ok: true, person: { id: OTHER, name: 'Bramble' } } : { ok: true } } };
    await soc.whispers.send(conv[0].tab, 'back', []);
    const w = calls.filter((c) => c.name === 'hr_whisper_send');
    if (w.length !== 1 || Object.keys(w[0].args).sort().join(',') !== 'p_body,p_slot,p_target' || w[0].args.p_target !== OTHER) fail('WH-1 sent ' + JSON.stringify(w.map((c) => c.args)));
    // BL-1
    await soc.blocks.set(OTHER, true);
    const bl = calls.filter((c) => c.name === 'hr_block_set');
    if (bl.length !== 1 || bl[0].args.p_target !== OTHER || bl[0].args.p_on !== true) fail('BL-1 sent ' + JSON.stringify(bl.map((c) => c.args)));
    if (chat.lines('global').some((x) => x.fromId === OTHER) || soc.whispers.conversations().length) fail('BL-1 the blocked player\'s lines stayed on screen');
    // MN-1
    soc.friends.apply({ friends: [], incoming: [], outgoing: [] });
    soc.blocks.apply([]);
    const provs = Object.assign(M.prov.menuProvidersOf({ account: { social: soc }, character: null }),
      { trade: { trade: { when: () => true, run: () => ({}) } } });   // even a provider that says yes cannot list a hidden row
    const ids = (t) => M.menu.entriesFor(t, provs).map((e) => e.id).join(',');
    const other = ids({ kind: 'player', id: OTHER, name: 'Bramble', slot: 0 });
    if (other !== 'inspect,message,friend-add,block') fail('MN-1 a player gets ' + other);
    const me = ids({ kind: 'player', id: UID, name: 'Me', slot: 0 });
    if (me !== 'inspect') fail('MN-1 yourself gets ' + me);
    soc.blocks.apply([{ id: OTHER, name: 'Bramble' }]);
    if (ids({ kind: 'player', id: OTHER, name: 'Bramble' }) !== 'inspect,unblock') fail('MN-1 a blocked player gets ' + ids({ kind: 'player', id: OTHER, name: 'Bramble' }));
    const mon = ids({ kind: 'monster', id: Object.keys((await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS)[0] });
    if (mon !== 'look') fail('MN-1 a monster gets ' + mon);
    soc.destroy();
  }
  // RT-1: the realtime bindings per client are capped by the data value, across chat and whispers
  {
    const bound = [];
    const client = { realtime: { setAuth: () => {} }, removeChannel: (ch) => { ch.gone = true; },
      channel: (topic) => { const ch = { topic, on: (t, f) => { bound.push({ ch, filter: f.filter }); return ch; }, subscribe: () => ch }; return ch; } };
    const live = () => bound.filter((b) => !b.ch.gone).length;
    const r = M.rt.createSocialRealtime(client, () => 'jwt');
    const cap = M.chans.CHAT_LIMITS.realtimeBindingsMax;
    const leave = r.chat(['global', 'system', 'local:town', PARTY, 'local:a', 'local:b', 'local:c'], () => {});
    if (live() !== cap || r.bindings() !== cap) fail('RT-1 seven channels took ' + live() + ' bindings (cap ' + cap + ')');
    r.whispers(UID, () => {});
    if (live() !== cap) fail('RT-1 a whisper subscription past the cap took a binding (' + live() + ')');
    leave();
    r.whispers(UID, () => {});
    if (live() !== 1 || r.bindings() !== 1) fail('RT-1 after leaving, the whispers binding did not land alone (' + live() + ')');
    if (cap < 5) fail('RT-1 the cap ' + cap + ' cannot hold global, system, zone, party and whispers');
  }
  // WT-1: what the World picked becomes a target: a stamped player, a monster, or nothing for the ground
  {
    const mon = Object.keys((await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS)[0];
    const p = M.prov.worldTargetOf({ hits: [{ id: 'hero_look', ref: { player: { id: OTHER, name: 'Mira', slot: 0 } } }, { id: mon, ref: { monster: mon } }] });
    const m = M.prov.worldTargetOf({ hits: [{ id: 'art_x', ref: { monster: mon } }] });
    const g = M.prov.worldTargetOf({ hits: [{ id: 'grass', ref: null }] });
    if (!p || p.kind !== 'player' || p.id !== OTHER || p.name !== 'Mira') fail('WT-1 a stamped hero reads ' + JSON.stringify(p));
    if (!m || m.kind !== 'monster' || m.id !== mon) fail('WT-1 a monster reads ' + JSON.stringify(m));
    if (g !== null) fail('WT-1 the ground reads ' + JSON.stringify(g));
  }
  // FR-1
  {
    const f = new M.friends.FriendStore({ account: { server: {} }, reread: async () => {} });
    f.apply({ friends: [{ id: OTHER, name: 'Bramble', online: true, doing: { kind: 'hunting', hunt: 'mill_cellar' } }, { id: 'nope', name: 'x' },
      { id: UID, name: 'Away', online: false, doing: { kind: 'town' } }],
      incoming: [{ id: UID, name: 'Me' }], outgoing: [] });
    const list = f.friends();
    const words = list.length ? M.fwin.doingWords(list[0]) : '';
    const away = list.find((x) => x.name === 'Away');
    if (!away || M.fwin.doingWords(away) !== 'Offline · In town') fail('FR-1 an offline friend reads ' + JSON.stringify(away && M.fwin.doingWords(away)));
    if (list.length !== 2 || !/^Online · Hunting in /.test(words) || f.incoming().length !== 1) fail('FR-1 friends read ' + JSON.stringify(list) + ' "' + words + '"');
  }
  // ON-1 (tracker r16): the online count is the server's answer, asked on every social poll naming exactly the
  // account's open character slots (the server stamps its own of those present), REPLACED by each answer; a
  // failed or malformed answer shows a dash, never the last number.
  {
    let answer = { ok: true, online: 3 };
    const { acct, calls, cs } = fakeAccount({ hr_players_online: () => answer });
    const second = { slot: 2, read: () => null, subscribe: () => () => {} };
    acct.characters = () => [cs, second];
    let poll = null;
    const soc = new M.store.SocialSession({ account: acct, realtime: fakeRealtime(), timers: { setTimer: (fn) => { poll = fn; return 1; }, clearTimer: () => {} } });
    soc.start();
    for (let i = 0; i < 5; i++) await tick();
    const asks = calls.filter((c) => c.name === 'hr_players_online');
    if (asks.length !== 1 || JSON.stringify(asks[0].args) !== '{"p_slots":[0,2]}') fail('ON-1 the first poll asked ' + JSON.stringify(asks.map((c) => c.args)) + ' (want the open slots 0 and 2, once)');
    if (soc.online.count !== 3 || M.online.onlineWords(soc.online.count) !== '3 online') fail('ON-1 the server said 3, the counter reads ' + M.online.onlineWords(soc.online.count));
    answer = { ok: false, error: 'rate_limited' };
    poll(); for (let i = 0; i < 5; i++) await tick();
    if (soc.online.count !== null || M.online.onlineWords(null) !== '— online') fail('ON-1 a refused ask kept the old count ' + soc.online.count);
    answer = { ok: true, online: 'many' };
    poll(); for (let i = 0; i < 5; i++) await tick();
    if (soc.online.count !== null) fail('ON-1 a malformed count was shown: ' + soc.online.count);
    answer = { ok: true, online: 1204 };
    poll(); for (let i = 0; i < 5; i++) await tick();
    if (M.online.onlineWords(soc.online.count) !== '1,204 online') fail('ON-1 the next answer did not replace the dash: ' + M.online.onlineWords(soc.online.count));
    /* A poll whose social read fails (a session the server refused) sends no count ask and shows the dash. */
    const asked = calls.filter((c) => c.name === 'hr_players_online').length;
    acct.server.rpc = async (name, args) => { calls.push({ name, args }); return { ok: false, status: 401, body: null }; };
    poll(); for (let i = 0; i < 5; i++) await tick();
    if (calls.filter((c) => c.name === 'hr_players_online').length !== asked) fail('ON-1 a refused social read still asked the count (two dead calls a poll)');
    if (soc.online.count !== null) fail('ON-1 a refused poll kept showing ' + soc.online.count);
    soc.destroy();
    if (soc.online.count !== null) fail('ON-1 a destroyed session still shows a count');
  }
  return fails;
}

/* ── THE PAGE ── */
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

/* The fixture as the S1 server sends it: members carry their seat, and party_people names each seat's account. */
function env() {
  const e = clone(FIXTURE);
  e.party.members.forEach((m, i) => { m.seat = i; });
  e.party_people = [{ seat: 0, user: UID, slot: 0, name: 'Tyler' }, { seat: 1, user: OTHER, slot: 0, name: 'Mira' }];
  return e;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    /* The residue the page put comes back in the envelope (CW-7: a size survives a reload). */
    const kept = () => ({ client_state: Object.assign({}, FIXTURE.client_state, s.residue) });
    if (name === 'hr_put_client_state') { s.residue = Object.assign({}, s.residue, body.p_patch); return json({ ok: true }); }
    if (name === 'hr_load') return json(Object.assign(env(), kept(), { version: ++s.version }));
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, env(), kept(), { version: ++s.version }));
    if (name === 'hr_chat_recent') return json({ ok: true, zone: ZONE, party: null, lines: [row({ body: 'welcome back', created_at: '2026-10-18T08:00:00Z' })] });
    if (name === 'hr_chat_send') return json({ ok: true, line: row({ from_id: UID, from_name: 'Quill', body: body.p_body, from_weapon: 'staff', from_role: 'healer' }) });
    if (name === 'hr_social_state') return json({ ok: true, friends: [], incoming: [], outgoing: [], blocks: [] });
    if (name === 'hr_players_online') return json({ ok: true, online: 3 });
    if (name === 'hr_whispers_recent') return json({ ok: true, lines: [] });
    if (name === 'hr_inspect') return json({ ok: true, id: OTHER, name: 'Bramble', slot: 0, level: 34, weapon: 'sword', role: null, gear: [{ slot: 'weapon', item: 'bronze_sword' }] });
    return json({ ok: true });
  });
}

async function pageRules(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 922, height: 423 }]) {
      const tag = vp.width + 'x' + vp.height;
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const s = { calls: [], version: 1 };
      await stub(page, s);
      await page.goto(base + '/play.html', { waitUntil: 'load' });
      await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
      await page.fill('input[name=email]', 'qa@example.test');
      await page.fill('input[name=password]', 'not-a-real-password');
      await page.click('.auth-submit');
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
      await page.click('[data-app="play"][data-slot="0"]');
      await wait(page, () => document.querySelector('[data-hs-shell]'));
      // ON-2 (tracker r16): the counter shows the server's number, at 12 px or more, on screen and clear of every other
      // widget; on a phone it is off by default (the action bar spans that corner; HUD layout can show it).
      const phone = vp.height <= 540;
      if (phone) {
        await page.waitForTimeout(600);
        if (await page.evaluate(() => !!document.querySelector('[data-hs-widget="online"]'))) fails.push('ON-2 [' + tag + '] the counter shows by default on a phone, over the action bar');
      } else if (!await wait(page, () => { const n = document.querySelector('[data-hs-widget="online"] .hs-online-n'); return n && n.textContent === '3 online'; }, null, 4000)) {
        fails.push('ON-2 [' + tag + '] the counter does not read the server\'s "3 online": ' + JSON.stringify(await page.evaluate(() => { const n = document.querySelector('[data-hs-widget="online"]'); return n && n.textContent; })));
      } else {
        const box = await page.evaluate(() => {
          const el = document.querySelector('[data-hs-widget="online"]');
          const r = el.getBoundingClientRect();
          const hit = (q) => q.left < r.right && r.left < q.right && q.top < r.bottom && r.top < q.bottom;
          const over = Array.from(document.querySelectorAll('[data-hs-widget]')).filter((w) => w !== el && w.offsetWidth && hit(w.getBoundingClientRect())).map((w) => w.getAttribute('data-hs-widget'));
          return { px: parseFloat(getComputedStyle(el.querySelector('.hs-online-n')).fontSize), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, over };
        });
        if (!(box.px >= 12) || !box.inside || box.over.length) fails.push('ON-2 [' + tag + '] the counter is ' + JSON.stringify(box));
      }
      if (shots) await page.screenshot({ path: join(shots, 'online-' + tag + '.png') });
      await page.keyboard.press('Enter');
      if (!await wait(page, () => document.querySelector('[data-hs-win="chat"] .hc-log.is-talk.is-on li'))) { fails.push('CW-1 [' + tag + '] the chat did not open on Global with its history'); await ctx.close(); continue; }
      // CW-1
      const n = await page.evaluate(([zone]) => window.__hub.row('chat_messages', { id: '00000000-0000-4000-8000-00000000f001', channel: 'global',
        from_id: 'aaaaaaaa-0000-4000-8000-0000000000b1', from_name: 'Bramble', from_slot: 0, from_level: 34, from_weapon: 'sword', from_role: 'healer',
        body: 'look [[item:bronze_sword]]', created_at: new Date(Date.UTC(2026, 9, 18, 9, 5)).toISOString() }) + (zone ? 0 : 0), [ZONE]);
      if (n !== 1) fails.push('CW-1 [' + tag + '] the page did not listen to Global (' + n + ' bindings took the row)');
      await page.waitForTimeout(400);
      const line = await page.evaluate(() => {
        const li = document.querySelector('[data-hs-win="chat"] .hc-log.is-talk.is-on li[data-key="00000000-0000-4000-8000-00000000f001"]');
        if (!li) return null;
        return { time: li.querySelector('.hc-time').textContent, name: li.querySelector('.hc-name').textContent, cls: li.querySelector('.hc-name').className,
          tag: li.querySelector('.hc-tag') && li.querySelector('.hc-tag').textContent, glyph: !!li.querySelector('.hc-role svg'),
          link: li.querySelector('.hc-link') && li.querySelector('.hc-link').textContent, last: li === li.parentElement.lastElementChild };
      });
      const hhmm = await page.evaluate(() => { const d = new Date(Date.UTC(2026, 9, 18, 9, 5)); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
      if (!line || line.time !== hhmm || line.name !== 'Bramble' || !/is-tank/.test(line.cls) || !/\[34/.test(line.tag || '') || !line.glyph
        || line.link !== '[Bronze Sword]' || !line.last) fails.push('CW-1 [' + tag + '] the line reads ' + JSON.stringify(line));
      // CW-2
      await page.evaluate(() => window.__hub.row('chat_messages', { id: '00000000-0000-4000-8000-00000000f002', channel: 'local:mill_cellar',
        from_id: 'aaaaaaaa-0000-4000-8000-0000000000b1', from_name: 'Bramble', from_slot: 0, from_level: 34, from_weapon: 'sword', from_role: null,
        body: 'down here', created_at: new Date().toISOString() }));
      const dot = await wait(page, () => { const b = document.querySelector('[data-hs-win="chat"] [data-tab="local"]'); return b && b.classList.contains('is-unread'); }, null, 2000);
      if (!dot) fails.push('CW-2 [' + tag + '] no unread dot on Local');
      await page.click('[data-hs-win="chat"] [data-tab="local"]');
      await page.waitForTimeout(400);
      if (await page.evaluate(() => document.querySelector('[data-hs-win="chat"] [data-tab="local"]').classList.contains('is-unread'))) fails.push('CW-2 [' + tag + '] the dot stayed on the tab on screen');
      const place = await page.evaluate(() => document.querySelector('.hc-field').placeholder);
      if (!/here/.test(place)) fails.push('CW-2 [' + tag + '] Local\'s field says "' + place + '"');
      await page.click('[data-hs-win="chat"] [data-tab="global"]');
      if (shots) await page.screenshot({ path: join(shots, 'chat-' + tag + '.png') });
      // CW-3
      await page.evaluate(() => { window.__keys = []; document.addEventListener('keydown', (e) => window.__keys.push({ k: e.key, field: !!(e.target.closest && e.target.closest('input')) })); });
      await page.click('.hc-field');
      await page.keyboard.type('wasd');
      const typed = await page.evaluate(() => ({ v: document.querySelector('.hc-field').value, keys: window.__keys.slice() }));
      /* Focus-based: each key reaches the page FROM the field (the World ignores keys typed into a field), none is swallowed. */
      if (typed.v !== 'wasd' || typed.keys.filter((k) => k.field).length !== 4 || typed.keys.some((k) => !k.field)) fails.push('CW-3 [' + tag + '] typing reached the page outside the field: ' + JSON.stringify(typed));
      const before = s.calls.filter((c) => c.name === 'hr_chat_send').length;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      const sends = s.calls.filter((c) => c.name === 'hr_chat_send').slice(before);
      if (sends.length !== 1 || Object.keys(sends[0].body).sort().join(',') !== 'p_body,p_kind,p_slot' || sends[0].body.p_body !== 'wasd') fails.push('CW-3 [' + tag + '] Enter sent ' + JSON.stringify(sends.map((c) => c.body)));
      await page.keyboard.press('Escape');
      await page.evaluate(() => { window.__keys = []; });
      await page.keyboard.press('w');
      const blurred = await page.evaluate(() => ({ active: document.activeElement && document.activeElement.className, keys: window.__keys.slice() }));
      if (/hc-field/.test(blurred.active || '') || !blurred.keys.some((k) => k.k === 'w' && !k.field)) fails.push('CW-3 [' + tag + '] after Esc, W did not reach the page: ' + JSON.stringify(blurred));
      // CW-5: right-click on the World's canvas — a party member (Mira, stamped from party_people: no Invite to party, she is
      // already in it, 2026-10-20), a monster, the ground
      const scan = await page.evaluate(() => {
        const cv = document.querySelector('.world-canvas');
        if (!cv) return null;
        const r = cv.getBoundingClientRect();
        const seen = {};
        let ground = 0;
        for (let y = r.top + 6; y < r.bottom; y += 10) for (let x = r.left + 6; x < r.right; x += 10) {
          cv.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          const m = document.querySelector('.hw-menu.is-on');
          if (!m) { ground++; continue; }
          const title = m.querySelector('.hw-menu-title').textContent;
          seen[title] = Array.from(m.querySelectorAll('.hw-mi')).map((b) => b.textContent).join('|');
          document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        }
        return { seen, ground };
      });
      if (!scan) fails.push('CW-5 [' + tag + '] no world canvas');
      else {
        if (scan.seen.Mira !== 'Inspect gear|Message|Add friend|Block') fails.push('CW-5 [' + tag + '] right-click on Mira gave ' + JSON.stringify(scan.seen));
        const looks = Object.entries(scan.seen).filter(([, v]) => v === 'Look');
        if (!looks.length) fails.push('CW-5 [' + tag + '] no monster answered Look: ' + JSON.stringify(scan.seen));
        if (!scan.ground) fails.push('CW-5 [' + tag + '] every point opened a menu (the ground must open nothing)');
        if (scan.seen.Tyler) fails.push('CW-5 [' + tag + '] the viewed hero opened a player menu on itself: ' + scan.seen.Tyler);
      }
      // CW-6: with the bag open, a right-click menu outside it stays (the bag's display tick closed every menu)
      if (!phone) {
        await page.keyboard.press('b');
        if (!await wait(page, () => document.querySelector('[data-hs-win="inventory"]:not(.is-leaving) .hw-inv'), null, 3000)) fails.push('CW-6 [' + tag + '] B did not open the Inventory');
        const nb = await page.$('[data-hs-win="chat"] .hc-log.is-talk.is-on .hc-name[data-hs-player-id]');
        if (!nb) fails.push('CW-6 [' + tag + '] no name to right-click beside the bag');
        else {
          await nb.click({ button: 'right' });
          await page.waitForTimeout(900);
          if (!await page.evaluate(() => !!document.querySelector('.hw-menu.is-on'))) fails.push('CW-6 [' + tag + '] the menu opened outside the bag closed by itself');
          await page.keyboard.press('Escape');
          if (await page.evaluate(() => !!document.querySelector('.hw-menu.is-on'))) fails.push('CW-6 [' + tag + '] Esc did not close the menu');
        }
        await page.mouse.click(2, vp.height - 2);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);
      }
      // CW-4
      const nameBox = await page.$('[data-hs-win="chat"] .hc-log.is-talk.is-on .hc-name[data-hs-player-id]');
      if (!nameBox) fails.push('CW-4 [' + tag + '] no name to right-click');
      else {
        await nameBox.click({ button: 'right' });
        const menu = await page.evaluate(() => { const m = document.querySelector('.hw-menu.is-on'); return m ? { items: Array.from(m.querySelectorAll('.hw-mi')).map((b) => b.textContent), top: m.parentElement === document.body } : null; });
        if (!menu || menu.items.join('|') !== 'Inspect gear|Message|Add friend|Block' || !menu.top) fails.push('CW-4 [' + tag + '] the menu is ' + JSON.stringify(menu));
        if (shots) await page.screenshot({ path: join(shots, 'chat-menu-' + tag + '.png') });
        await page.evaluate(() => { window.__stage = 0; const st = document.querySelector('.world-stage'); if (st) st.addEventListener('click', () => { window.__stage++; }); });
        await page.click('.hw-menu.is-on .hw-mi >> text=Inspect gear');
        const insp = await wait(page, () => document.querySelector('[data-hs-win="inspect"] .hi-item[data-item="bronze_sword"]'), null, 3000);
        const reached = await page.evaluate(() => window.__stage);
        if (!insp) fails.push('CW-4 [' + tag + '] Inspect did not show the worn sword');
        if (reached) fails.push('CW-4 [' + tag + '] a press on the menu reached the World (' + reached + ')');
        if (shots) await page.screenshot({ path: join(shots, 'inspect-' + tag + '.png') });
      }
      /* The Friends window opens on N with its block list (the `blocked-players` settings row's panel). */
      await page.mouse.click(2, vp.height - 2);
      await page.keyboard.press('n');
      if (!await wait(page, () => document.querySelector('[data-hs-win="friends"] .hf-friends .hs-blocks'), null, 3000)) fails.push('CW-4 [' + tag + '] the Friends window (with its block list) did not open on N');
      if (shots) await page.screenshot({ path: join(shots, 'friends-' + tag + '.png') });
      // CW-7: the chat's corner, its see-through plate, its grip and the size a reload keeps
      const closeAll = async () => { for (let i = 0; i < 5 && await page.evaluate(() => !!document.querySelector('[data-hs-win]:not(.is-leaving)')); i++) { await page.mouse.click(2, vp.height - 2); await page.keyboard.press('Escape'); await page.waitForTimeout(220); } };
      const chatBox = () => page.evaluate(() => {
        const w = document.querySelector('[data-hs-win="chat"]:not(.is-leaving)');
        if (!w) return null;
        const sh = document.querySelector('[data-hs-shell]').getBoundingClientRect(), r = w.getBoundingClientRect();
        const bg = getComputedStyle(w).backgroundColor, m = bg.match(/\/\s*([\d.]+)\)$/) || bg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
        const line = w.querySelector('.hc-log.is-talk.is-on .hc-line'), grip = w.querySelector('.hs-grip');
        /* where it belongs: 44 px up, or 12 px above the action bar where its column crosses the bar */
        const bar = document.querySelector('[data-hs-widget="action-bar"]'), q = bar && bar.getBoundingClientRect();
        const crosses = q && q.width && r.left < q.right + 12 && q.left < r.right + 12;
        const home = crosses ? Math.round(sh.bottom - q.top + 12) : 44;
        const overBar = !!(q && q.width && r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom);
        return { left: Math.round(r.left - sh.left), right: Math.round(sh.right - r.right), bottom: Math.round(sh.bottom - r.bottom), home, overBar, w: Math.round(r.width), h: Math.round(r.height),
          alpha: m ? Number(m[1]) : 1, px: line ? parseFloat(getComputedStyle(line).fontSize) : 0, floating: w.classList.contains('is-floating'), grip: !!(grip && grip.offsetWidth) };
      });
      await closeAll();
      await page.keyboard.press('Enter');
      await wait(page, () => document.querySelector('[data-hs-win="chat"]:not(.is-leaving) .hc-log.is-talk.is-on li'), null, 3000);
      await page.waitForTimeout(300);
      const c0 = await chatBox();
      if (!c0) fails.push('CW-7 [' + tag + '] Enter did not open the chat');
      else if (phone) {
        if (c0.floating || c0.right !== 0 || c0.grip) fails.push('CW-7 [' + tag + '] the phone chat is not the right-hand sheet: ' + JSON.stringify(c0));
      } else {
        if (!c0.floating || c0.left !== 12 || c0.bottom !== c0.home || c0.overBar) fails.push('CW-7 [' + tag + '] the chat did not open at the bottom-left, clear of the bar: ' + JSON.stringify(c0));
        if (!(c0.alpha < 0.9 && c0.alpha > 0.3) || !(c0.px >= 12)) fails.push('CW-7 [' + tag + '] the chat is not see-through and readable: ' + JSON.stringify(c0));
        const g = c0.grip && await page.locator('[data-hs-win="chat"] .hs-grip').boundingBox();
        if (!g) fails.push('CW-7 [' + tag + '] the chat has no grip');
        else {
          const puts0 = s.calls.filter((c) => c.name === 'hr_put_client_state').length;
          await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
          await page.mouse.down();
          await page.mouse.move(g.x + g.width / 2 + 80, g.y + g.height / 2 - 60, { steps: 6 });
          await page.mouse.up();
          await page.waitForTimeout(2200);
          const c1 = await chatBox();
          if (c1.w - c0.w !== 80 || c1.h - c0.h !== 60 || c1.left !== c0.left || c1.bottom !== c0.bottom) fails.push('CW-7 [' + tag + '] the grip did not grow the chat up and right: ' + JSON.stringify(c0) + ' -> ' + JSON.stringify(c1));
          const puts = s.calls.filter((c) => c.name === 'hr_put_client_state').slice(puts0).filter((c) => c.body.p_patch && c.body.p_patch.winSize);
          const want = JSON.stringify({ chat: [400 + 80, 280 + 60] });
          if (puts.length !== 1 || JSON.stringify(puts[0].body.p_patch.winSize) !== want) fails.push('CW-7 [' + tag + '] the size was put as ' + JSON.stringify(puts.map((c) => c.body.p_patch)) + ', not ONE ' + want);
          await page.reload({ waitUntil: 'load' });
          await wait(page, () => document.querySelector('[data-hs-shell]') || document.querySelector('[data-app="play"][data-slot="0"]'));
          if (!(await page.$('[data-hs-shell]'))) await page.click('[data-app="play"][data-slot="0"]');
          await wait(page, () => document.querySelector('[data-hs-shell]'));
          await page.waitForTimeout(400);
          if (!await page.evaluate(() => !!document.querySelector('[data-hs-win="chat"]:not(.is-leaving)'))) await page.keyboard.press('Enter');
          await wait(page, () => document.querySelector('[data-hs-win="chat"]:not(.is-leaving)'), null, 3000);
          await page.waitForTimeout(300);
          const c2 = await chatBox();
          if (!c2 || c2.w !== c1.w || c2.h !== c1.h || c2.left !== 12 || c2.bottom !== c2.home || c2.overBar) fails.push('CW-7 [' + tag + '] after a reload the chat is ' + JSON.stringify(c2) + ', not ' + JSON.stringify(c1));
        }
      }
      if (shots) await page.screenshot({ path: join(shots, 'chat-home-' + tag + '.png') });
      if (errors.length) fails.push('CW-4 [' + tag + '] console errors: ' + errors.slice(0, 3).join(' | '));
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
  ['the server pick wins over the weapon', 'src/social/chat-lines.js', "role: weapon ? roleForWeapon(weapon, str(row.from_role, 32)) : null,", "role: str(row.from_role, 32) || (weapon ? roleForWeapon(weapon, null) : null),"],
  ['send names the sender', 'src/social/chat-store.js', "{ p_slot: cs.slot, p_kind: kind, p_body: body }", "{ p_slot: cs.slot, p_kind: kind, p_body: body, p_name: 'Me' }"],
  ['a line shows before the server answers', 'src/social/chat-store.js', "    const ans = await askVia(this._account, 'chat_send',", "    this._push(tab, Object.assign({}, this.lines(tab)[0], { id: 'optimistic' }), false);\n    const ans = await askVia(this._account, 'chat_send',"],
  ['an off-screen line never counts unread', 'src/social/chat-store.js', "    if (live && !this._onScreen(tab)) this._unread.set(tab, this.unread(tab) + 1);", ''],
  ['a closed window still counts as on screen', 'src/social/chat-store.js', " && this._now() - s.at < 1000; }", "; }"],
  ['the party channel is not listened to', 'src/social/chat-store.js', "['global', 'system', this.zone, this.party]", "['global', 'system', this.zone]"],
  ['an incoming whisper counts nothing', 'src/social/whispers.js', "&& this._now() - s.at < 1000)) c.unread++;", "&& this._now() - s.at < 1000)) c.unread += 0;"],
  ['a block leaves the lines up', 'src/social/blocks.js', "    if (on === true && who) this._onBlocked(who.id);\n", ''],
  ['an unknown id becomes a link', 'src/social/chat-lines.js', "else out.push(ITEMS[m[2]] ? { item: m[2] } : { text: m[2].replace(/_/g, ' ') });", "else out.push({ item: m[2] });"],
  ['a player\'s hunt marker names the hunt', 'src/social/chat-lines.js', "    if (m[1] === 'hunt' && !notice) continue;\n", ''],
  ['a System row reads as a player line', 'src/social/chat-lines.js', "if (!whisper && row.channel === 'system') {", 'if (false) {'],
  ['the notice drops the hero', 'src/social/chat-lines.js', "parts: [{ text: name + ' ' }].concat(partsOf(body, true))", 'parts: partsOf(body, true)'],
  ['the notice data row drifts from the migration', 'src/data/chat-channels.js', "rare_drop: Object.freeze({ channel: 'system', perCharacterPerDay: 3 })", "rare_drop: Object.freeze({ channel: 'system', perCharacterPerDay: 4 })"],
  ['links are not capped', 'src/social/chat-lines.js', "if (n >= CHAT_LIMITS.linksMax || !ITEMS[id]) continue;", "if (!ITEMS[id]) continue;"],
  ['a hidden row is listed', 'src/shell/context-menu.js', "if (row.hidden || !row.targets.includes(target.kind)) continue;", "if (!row.targets.includes(target.kind)) continue;"],
  ['you can block yourself', 'src/social/social-session.js', "const other = (t) => t.kind === 'player' && !!t.id && !this.isSelf(t);", "const other = (t) => t.kind === 'player' && !!t.id;"],
  ['a friend reads online when offline', 'src/social/friends.js', "online: f.online === true,", "online: true,"],
  ['the realtime bindings are not capped', 'src/social/realtime.js', "        .slice(0, Math.max(0, CHAT_LIMITS.realtimeBindingsMax - held()));", ";"],
  ['a failed online ask keeps the last count', 'src/social/players-online.js', '    let n = null;', '    let n = this.count;'],
  ['a refused social read still asks the count', 'src/social/social-session.js', '    if (!read) { this.online.clear(); return null; }\n', ''],
  ['the online ask names only the viewed character', 'src/social/social-session.js',
    "o.account.characters().map((cs) => cs.slot)", '[o.account.viewed]'],
  ['the ground opens a menu', 'src/shell/menu-providers.js', "    if (MONSTERS[mon]) return { kind: 'monster', id: mon, title: monsterName(mon) };", "    return { kind: 'monster', id: mon, title: String(mon) };"],
  ['a re-read keeps lines the server no longer returns', 'src/social/chat-store.js', "const keep = tab === 'system' ? this.lines(tab).filter((l) => l.system) : [];", 'const keep = this.lines(tab);'],
];
const PAGE_MUTANTS = [
  ['the bag\'s repaint closes every menu', 'src/shell/windows/inventory/index.js', 'closeFloatMenu(ctx.doc, st.sc.menuOwner || null);', 'closeFloatMenu(ctx.doc);'],
  ['the chat docks on the right', 'src/data/shell-windows.js', "height: 280, home: 'bl', resizable: true,", "height: 280, resizable: true,"],
  ['the chat is opaque', 'src/styles/hunt.css', '.hs-win[data-hs-win="chat"] { background: var(--chat-bg); }', '.hs-win[data-hs-win="chat"] { background: var(--modal-bg); }'],
  ['the chat size is not kept', 'src/shell/window-sizes.js', "      character.setResidue('winSize',", "      void character; void ("],
  ['the level is dropped from a line', 'src/shell/windows/chat.js', "(l.level !== null ? esc(l.level) : '')", "''"],
  ['no unread dot', 'src/shell/windows/chat.js', "cls(b, 'is-unread', t.unread > 0 && t.id !== tab);", "cls(b, 'is-unread', false);"],
  ['the field swallows every key', 'src/shell/windows/chat.js', "    if (type === 'keydown' && ev.key === 'Escape') { t.blur(); return true; }\n    return false;",
    "    if (type === 'keydown' && ev.key === 'Escape') { t.blur(); return true; }\n    if (type === 'keydown') { t.value += ev.key; ev.preventDefault(); return true; }\n    return false;"],
  ['Esc keeps the focus', 'src/shell/windows/chat.js', "ev.key === 'Escape') { t.blur(); return true; }", "ev.key === 'Escape') { return true; }"],
  ['a party member is not stamped', 'src/hunt-view/scene.js', "        out.ref = { player: { id: who ? who.id : null, name: (who && who.name) || m.name, slot: who ? who.slot : null } };", "        void who;"],
  ['the server ids are not read', 'src/session/party-sections.js', "    out.set(p.seat, { id: p.user, slot: Number.isInteger(p.slot) ? p.slot : null, name: name(p.name) });", "    void p;"],
  ['the World names nothing on a right-click', 'src/world/world-boot.js', "if (pick) emit('entity', { hits: pick.hits, x, y }); }", "void pick; }"],
  ['the counter does not read the server\'s count', 'src/shell/widgets/online.js', '  const s = ctx.account && ctx.account.social;', '  const s = ctx.account;'],
  ['the menu is drawn inside the World', 'src/shell/windows/float-menu.js', "  doc.body.appendChild(el);\n  return el;", "  (doc.querySelector('.world-stage') || doc.body).appendChild(el);\n  return el;"],
];

function copySrc() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-chat-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor[\\/]?/.test(p.slice(ROOT.length)) });
  return tmp;
}

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'chat-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  const onlyPure = process.argv.includes('--pure');
  if (!process.argv.includes('--mutate')) {
    const fails = [...await pureRules(await load(ROOT)), ...(onlyPure ? [] : await pageRules(null, shots))];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'chat-social: ' + fails.length + ' rule(s) RED'
      : 'chat-social: lines are the server\'s rows; one intent per send; the server\'s channels; unread; whispers; blocks; links; the one menu' + (onlyPure ? '' : '; the window in the page') + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = [...await pureRules(await load(ROOT)), ...(onlyPure ? [] : await pageRules(null, null))];
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
  console.log(bad ? 'chat-social --mutate: ' + bad + ' escaped' : 'chat-social --mutate: ' + n + '/' + n + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
