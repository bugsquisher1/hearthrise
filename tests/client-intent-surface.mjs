#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-intent-surface.mjs — WHAT THE CLIENT CAN SAY TO THE SERVER, WHOLE.
//
//   node tests/client-intent-surface.mjs             the guard
//   node tests/client-intent-surface.mjs --selftest  planted shapes must go RED / stay GREEN
//
// mutant-anchors: none — the proof plants into in-memory file maps, never the tree
//
// CLAUDE.md §1: the client sends INTENTS and renders what the server returns.
// The old client's write censuses (gold/gem/inventory sites, farm gestures,
// settle-first callers, per-feature RPC callers) retired with it on 2026-10-17;
// this pins the rebuilt client's WHOLE surface instead, so a new intent is a
// deliberate edit to the list below, never a line that slipped in:
//   IS-1  every RPC the client names (`rpc('<name>'`) is on CLIENT_RPCS;
//   IS-2  the edge is called with the character's slot and nothing else
//         (`accrue({ slot: this.slot })`), or — in CharacterSession.edgeIntent
//         only — with the body src/session/edge-intents.js builds;
//   IS-5  that builder's EDGE_INTENTS is exactly CLIENT_EDGE_INTENTS below
//         (each verb with the only fields it may carry: names and counts), no
//         field is named like a value (price, gold, cost, total, amount, ask),
//         every edgeIntent('<verb>' call names a pinned verb, and every pinned
//         verb is called somewhere (a stale entry is a standing permission);
//   IS-3  ONE server link: `fetch(` appears only in src/session/server.js, and no
//         client module reaches PostgREST tables or RPCs through supabase-js
//         (`.from(`, `.rpc(`) — the client's only use of supabase-js is auth and
//         the push channel;
//   IS-4  non-vacuity: the client tree is read, and each allowed RPC is named.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIRS = ['src/app', 'src/session', 'src/shell', 'src/net', 'src/world', 'src/platform', 'src/render', 'src/hunt-view', 'src/social'];
const LINK = 'src/session/server.js';

/* The client's whole RPC surface, each with what it is for. */
export const CLIENT_RPCS = Object.freeze({
  hr_load: 'the full read of one character (CharacterSession.load)',
  hr_create_character: 'make the character in an owned slot (AccountSession.create)',
  hr_put_client_state: 'the allowlisted display residue (CharacterSession.flushResidue)',
  hr_action_set_options: 'the per-hero hunt settings intent, catalogue-validated and refused not clamped (CharacterSession.setHuntOptions)',
  hr_action_set_copy: 'copy one character\'s hunt settings onto another of the caller\'s characters; moves no value (CharacterSession.copyHuntSettingsTo)',
  hr_hunt_leave: 'leave the running hunt; the server settles and ends it (CharacterSession.leaveHunt)',
  /* Tyler's first playtest (10-18): going hunting and the home storage, both live, reviewed server verbs. */
  hr_hunt_enter: 'go hunting with names and counts of own supplies; band, stamina and stock are the server’s (CharacterSession.enterHunt; CharacterSession.huntAgain, the Hunt again card)',
  hr_bank_move: 'move a stack between the bag and the home storage, value-neutral (CharacterSession.moveStorage)',
  /* The alpha windows (2026-10-18; CONFLICTS.md): staged for the server lane, refused as http_404 until it lands. */
  hr_item_lock: 'lock or unlock an item so no bulk sale can name it (CharacterSession.lockItem)',
  hr_loot_rule_set: 'keep / sell / ignore an item on pickup, applied by the server (CharacterSession.setLootRule)',
  hr_restock_set: 'the remembered restock targets, counts only (CharacterSession.setRestock)',
  hr_shop_refill: 'the one-tap refill at server prices, refused if the quoted total moved (CharacterSession.refill)',
  hr_hunt_preset_save: 'snapshot the action set, gear and restock targets as a setup (CharacterSession.savePreset)',
  hr_hunt_preset_apply: 'put a saved setup back on (CharacterSession.applyPreset)',
  hr_account_items: 'where an item is across this account, a read (AccountSession.findItems)',
  /* The party (S1, 2026-10-23-hunt-party.sql): slot + party id or seat only; no user id crosses. */
  hr_hunt_party_join: 'take a free seat in an open party by its id (CharacterSession.joinParty)',
  hr_hunt_party_leave: 'leave this character’s party (CharacterSession.leaveParty)',
  hr_hunt_party_kick: 'the leader removes the member in a seat (CharacterSession.kickSeat)',
  hr_hunt_party_finder: 'open parties with a free seat, by hunt and missing weapon type, a read (CharacterSession.findParties)',
  /* The party UI's asks (CONFLICTS.md 2026-10-18 party UI): staged, refused as http_404 until the server lands them. */
  hr_hunt_party_invite: 'invite a character by its display name; the server resolves it (CharacterSession.inviteByName)',
  hr_hunt_party_accept: 'accept an invite to this character by its id (CharacterSession.answerInvite)',
  hr_hunt_party_decline: 'decline an invite to this character by its id (CharacterSession.answerInvite)',
  hr_hunt_party_start: 'the leader picks the ground and starts the party hunt, each member on its own saved setup, all or none (party-intents.js startPartyHunt)',
  /* The one-way party flow (2026-10-28-party-flow.sql): an own character by slot, the leader's disband; slot only, no user id. */
  hr_hunt_party_invite_own: 'seat one of this account’s own characters, by slot, in this character’s party at once (party-intents.js inviteOwn)',
  hr_hunt_party_disband: 'the leader closes its party in town (party-intents.js disbandParty)',
  hr_hunt_party_list: 'the leader shows or hides its party in the finder, a yes/no (party-intents.js listParty)',
  hr_hunt_restart: 'go back to the hunt that just ended on that session’s own setup (CharacterSession.restartHunt)',
  /* Lane S2's Services window: each sends the server's own QUOTE (refused quote_changed otherwise), never a price of its own. */
  hr_stamina_refill: 'buy the next stamina refill at the quoted price (CharacterSession.buyStamina)',
  hr_blessing_buy: 'buy one blessing tier at the quoted price, 0 under the free level (CharacterSession.buyBlessing)',
  hr_character_name_set: 'claim this character’s own name, checked by the server (CharacterSession.setName)',
  /* The social side (2026-10-25-chat-channels.sql, 2026-10-25-social.sql): a slot, a channel KIND, a body,
     a target (a user id or a claimed name) and a yes/no — never a name, level, zone or role of the sender. */
  hr_chat_send: 'post a line to global / local / party; the server names the sender and the channel (ChatStore.send)',
  hr_chat_recent: 'the chat history and the channels to listen to, a read (ChatStore.refresh)',
  hr_whisper_send: 'a private line to one player; refused across a block (WhisperStore.send)',
  hr_whispers_recent: 'the recent whispers to and from this account, a read (WhisperStore.load)',
  hr_block_set: 'block or unblock a player (BlockStore.set)',
  hr_friend_request: 'ask a player to be friends (FriendStore.request)',
  hr_friend_answer: 'accept or decline a friend ask made to this account (FriendStore.answer)',
  hr_friend_remove: 'end a friendship or withdraw an ask (FriendStore.remove)',
  hr_social_state: 'friends, asks and blocks, and this account’s presence stamp, a read (SocialSession.reread)',
  hr_inspect: 'another player’s worn items, a read (inspectOf)',
  /* Town presence (2026-10-25-town-walk.sql): this character's own tile, goal tile and facing, catalogue-bounded; never a user or a time. */
  hr_town_move: 'where this character stands and walks to in a town, or a null map to leave; display presence (TownPresence.publish)',
  hr_town_walkers: 'who stands on a town map now, as the server names them, a read (TownPresence.read)',
  hr_outfit_set: 'wear an owned outfit with a dye index per region; cosmetic, the server checks ownership (CharacterSession.saveOutfit)',
});

/* The engine's item intents the client may send, each with the ONLY fields it may carry. */
export const CLIENT_EDGE_INTENTS = Object.freeze({
  equip: ['equip'],
  vendor_sell_many: ['lines'],
  shop_buy: ['offer', 'qty'],
  eat: ['item'],
  /* the Character window's ask: the slot only; the engine computes the sheet (hr-accrue character-sheet.js) */
  sheet: [],
  /* the Inventory's Bury: an artisan recipe by id, or idle to stop; the engine collects before it switches (hr-accrue set-activity.js) */
  set_activity: ['activity'],
});
const EDGE = 'src/session/edge-intents.js';
const VALUE_FIELD = /price|gold|cost|total|amount|ask/i;

/* EDGE_INTENTS as the builder spells it: one `verb: Object.freeze([...])` line per verb. */
function edgeTable(text) {
  const block = (text || '').match(/export const EDGE_INTENTS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!block) return null;
  const out = {};
  for (const m of block[1].matchAll(/^\s*([a-z_]+): Object\.freeze\(\[([^\]]*)\]\),?\s*$/gm)) {
    out[m[1]] = m[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

function walk(dir, out = {}) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out[p] = readFileSync(join(ROOT, p), 'utf8');
  }
  return out;
}

export function check(files) {
  const problems = [];
  const named = new Set();
  const edgeCalled = new Set();
  for (const [f, raw] of Object.entries(files)) {
    const code = strip(raw);
    for (const m of code.matchAll(/\brpc\(\s*'([a-z0-9_]+)'/g)) {
      named.add(m[1]);
      if (!Object.prototype.hasOwnProperty.call(CLIENT_RPCS, m[1])) problems.push(`IS-1 ${f} calls ${m[1]}, which is not on CLIENT_RPCS — a new intent is a reviewed edit to this list`);
    }
    for (const m of code.matchAll(/\.accrue\(([^)]*)\)/g)) {
      if (f === LINK) continue;
      const arg = m[1].replace(/\s+/g, '');
      const built = arg === 'body' && f === 'src/session/character-session.js'
        && /constbody=edgeBody\(this\.slot,verb,fields,newIdem\(\)\);if\(!body\)return/.test(code.replace(/\s+/g, ''));
      if (arg !== '{slot:this.slot}' && !built) problems.push(`IS-2 ${f} sends the edge ${m[1].trim()} — the client may name its slot, or an edgeBody-built item intent, and nothing else`);
    }
    for (const m of code.matchAll(/\bedgeIntent\(\s*'([a-z_]+)'/g)) {
      edgeCalled.add(m[1]);
      if (!Object.prototype.hasOwnProperty.call(CLIENT_EDGE_INTENTS, m[1])) problems.push(`IS-5 ${f} sends the engine intent ${m[1]}, which is not on CLIENT_EDGE_INTENTS`);
    }
    if (f !== LINK && /\bfetch\s*\(/.test(code)) problems.push(`IS-3 ${f} calls fetch — the client has ONE server link (${LINK})`);
    if (/\.from\(\s*['"`]/.test(code)) problems.push(`IS-3 ${f} reads or writes a table through supabase-js (.from) — every value comes from an RPC answer`);
    if (/\.\s*rpc\s*\(\s*['"`]/.test(code.replace(/\bserver\.rpc\(|this\._server\.rpc\(/g, '('))) problems.push(`IS-3 ${f} calls an RPC through supabase-js — RPCs go through ${LINK}`);
  }
  const n = Object.keys(files).length;
  if (n < 10 || !files[LINK]) problems.push(`IS-4 only ${n} client module(s) read — the scan is reading the wrong tree`);
  for (const r of Object.keys(CLIENT_RPCS)) if (!named.has(r)) problems.push(`IS-4 CLIENT_RPCS lists ${r} and no client module calls it — a stale entry is a standing permission`);
  const table = edgeTable(files[EDGE]);
  if (!table) problems.push(`IS-5 ${EDGE} has no readable EDGE_INTENTS table`);
  else {
    if (JSON.stringify(table) !== JSON.stringify(CLIENT_EDGE_INTENTS)) problems.push(`IS-5 ${EDGE} EDGE_INTENTS ${JSON.stringify(table)} is not the pinned ${JSON.stringify(CLIENT_EDGE_INTENTS)} — a new verb or field is a reviewed edit here too`);
    for (const [v, fields] of Object.entries(table)) for (const k of fields) if (VALUE_FIELD.test(k)) problems.push(`IS-5 the engine intent ${v} carries ${k}, a value field — the client sends names and counts only`);
  }
  for (const v of Object.keys(CLIENT_EDGE_INTENTS)) if (!edgeCalled.has(v)) problems.push(`IS-5 CLIENT_EDGE_INTENTS lists ${v} and no client module sends it — a stale entry is a standing permission`);
  return problems;
}

const files = () => CLIENT_DIRS.reduce((acc, d) => walk(d, acc), {});

if (process.argv.includes('--selftest')) {
  const real = files();
  const plant = (f, extra) => ({ ...real, [f]: (real[f] || '') + '\n' + extra + '\n' });
  const cases = [
    ['clean tree', real, null],
    ['a new RPC the list does not name', plant('src/app/boot.js', "server.rpc('hr_vendor_sell', { p_item: 'ore', p_qty: 9 });"), 'IS-1'],
    ['the edge sent an amount', plant('src/session/character-session.js', 'this._server.accrue({ slot: this.slot, gold: 500 });'), 'IS-2'],
    ['the edge sent a hand-built body outside the builder', plant('src/app/boot.js', 'server.accrue(body);'), 'IS-2'],
    ['an engine intent the pin does not name', plant('src/shell/windows/inventory/actions.js', "cs.edgeIntent('grant_gold', { qty: 5 });"), 'IS-5'],
    ['the builder grew a price field', { ...real, [EDGE]: real[EDGE].replace("shop_buy: Object.freeze(['offer', 'qty']),", "shop_buy: Object.freeze(['offer', 'qty', 'price']),") }, 'IS-5'],
    ['the builder grew a verb', { ...real, [EDGE]: real[EDGE].replace("eat: Object.freeze(['item']),", "eat: Object.freeze(['item']),\n  market_buy: Object.freeze(['listing', 'qty']),") }, 'IS-5'],
    ['a pinned engine intent nobody sends', { ...real, 'src/shell/windows/inventory/actions.js': real['src/shell/windows/inventory/actions.js'].split("edgeIntent('eat'").join("edgeIntentX('eat'") }, 'IS-5'],
    ['a second fetch', plant('src/app/world-pane.js', "fetch('/rest/v1/rpc/hr_load');"), 'IS-3'],
    ['a table read through supabase-js', plant('src/app/boot.js', "client.from('player_state').select('*');"), 'IS-3'],
    ['an RPC through supabase-js', plant('src/app/boot.js', "client.rpc('hr_load', { p_slot: 0 });"), 'IS-3'],
    ['a stale allow entry (the reader of hr_create_character gone)', { ...real, 'src/session/account-session.js': real['src/session/account-session.js'].split("'hr_create_character'").join("'hr_create_characterX'") }, 'IS-'],
    ['negative control: an RPC named in a comment', plant('src/app/boot.js', "// server.rpc('hr_vendor_sell')"), null],
  ];
  let bad = 0;
  for (const [name, f, want] of cases) {
    const got = check(f);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ client-intent-surface --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ client-intent-surface --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}
const problems = check(files());
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
console.log(`✓ client-intent-surface: the client names ${Object.keys(CLIENT_RPCS).length} RPCs (${Object.keys(CLIENT_RPCS).join(', ')}), sends the edge its slot or ${Object.keys(CLIENT_EDGE_INTENTS).length} pinned item intents (names and counts), through one link`);
