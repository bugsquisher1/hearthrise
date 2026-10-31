#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/party-soak.mjs — FOUR OWN HEROES HUNT FOR HOURS ON THE REAL CHAIN AND THE REAL ENGINE.
//
//   node tools/qa/party-soak.mjs                        every open ground in band: 3 h at its top density, 1 h at density 1
//   node tools/qa/party-soak.mjs --hours 12 --low 3     the long soak
//   node tools/qa/party-soak.mjs mosslight_glade:24     one ground at Level 24
//
// On tools/qa/local-world.mjs (no production, no secrets, skip moves hunt clocks only). A party of tank, healer, ranger
// and mage, one account, no selling, starts on the real verbs and re-enters on any end. After each stretch it prints the
// ends, every new refusal (hr_rejections), forfeits, the bag's stacks, the kills per monster and THE BOOKS: every gold and
// item movement of the account against player_ledger (a loot row carries its items in meta.delta.i). Levels, gear and the
// purse are LOCAL fixtures, written straight to this in-memory database. Exit 0: no forfeit, no refusal, books even; 1 red.
// Found on its first run: 100 kinds in the bag after 33 hunting hours, then forfeits within minutes (2027-02-11-hunt-loot-past-bag-cap.sql).
// mutant-anchors: none — a manual tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { HUNTS } from '../../src/data/hunts.js';
import { HUNT_GROUNDS, OPEN_GROUNDS } from '../../src/data/hunt-grounds.js';
import { charXpForLevel, skillXpForLevel } from '../../src/core/xp.js';
import { openWorld } from './local-world.mjs';

const PASSWORD = 'local-world-password';   // local-world's own throwaway: these accounts die with the process
const ROLES = ['tank', 'healer', 'ranger', 'mage'];
const idem = () => randomUUID();
const arg = (name, d) => { const i = process.argv.indexOf(name); return i < 0 ? d : Number(process.argv[i + 1]); };

/* The set a measured hero at Level L wears (tests/hunt-core/fixtures/play-ground.mjs's ladder). */
function kitOf(L, role) {
  const t = L < 15 ? 0 : L < 30 ? 1 : L < 45 ? 2 : 3;
  const m = ['bronze', 'iron', 'steel', 'mithril'][t];
  const cloth = (a) => ({ helmet: a[t] + '_helmet', body: a[t] + '_body', pants: a[t] + '_pants', boots: a[t] + '_boots' });
  const casters = cloth(['apprentice', 'adept', 'scholar', 'warlock']);
  return {
    tank: { weapon: ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword'][t], shield: ['bronze_rimmed_shield', 'ironbound_shield', 'coppercap_shield', 'coppercap_shield'][t],
      helmet: m + '_helm', body: m + '_platebody', pants: m + '_platelegs', boots: m + '_boots' },
    healer: { weapon: ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff'][t], ...casters },
    ranger: { weapon: ['shortbow', 'willow_longbow', 'maple_bow', 'maple_bow'][t], ammo: 'bronze_arrows', ...cloth(['leather', 'studded', 'boarhide', 'snakeskin']) },
    mage: { weapon: ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand'][t], shield: ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook'][t], ...casters },
  }[role];
}

const world = await openWorld({ tickMs: false });
const q = async (sql, p) => (await world.db.query(sql, p)).rows;
const post = async (path, body, token) => {
  const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const EMAIL = 'soak@local-world.test';
await post('/auth/v1/signup', { email: EMAIL, password: PASSWORD });
const login = async () => (await post('/auth/v1/token?grant_type=password', { email: EMAIL, password: PASSWORD })).body;
const first = await login();
const uid = first.user.id;
let token = first.access_token;
const rpc = async (fn, args) => (await post('/rest/v1/rpc/' + fn, args, token)).body;
const fresh = () => q('delete from public.hr_rate_counters where user_id = $1', [uid]);
const purse = (n) => q(`insert into public.account_wallet (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = $2`, [uid, n]);

for (let s = 0; s < 4; s++) {
  const hero = () => rpc('hr_create_hero', { p_slot: s, p_name: 'Soak_' + 'ABCD'[s], p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: idem() });
  let r = await hero();
  if (!r || r.ok !== true) { await purse(100000000); await rpc('hr_buy_hero_slot', { p_slot_id: s, p_slot: 0, p_idem: idem() }); r = await hero(); }
  if (!r || r.ok !== true) throw new Error('hero ' + s + ': ' + JSON.stringify(r));
  await fresh();
}
for (const s of [1, 2, 3]) { await rpc('hr_hunt_party_invite_own', { p_slot: 0, p_other_slot: s, p_idem: idem() }); await fresh(); }

async function outfit(L) {
  for (let s = 0; s < 4; s++) {
    await q('update public.player_state set level_xp = $3, hp = 1000000, stamina_ms = 43200000, stamina_at = now() where user_id = $1 and slot = $2', [uid, s, charXpForLevel(L)]);
    for (const k of ['melee', 'ranged', 'magic', 'defense']) {
      await q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, $3, $4) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, s, k, skillXpForLevel(k, L)]);
    }
    await q('delete from public.player_equipment where user_id = $1 and slot = $2', [uid, s]);
    for (const [eq, id] of Object.entries(kitOf(L, ROLES[s]))) await q('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, $2, $3, $4)', [uid, s, eq, id]);
  }
}

async function books() {
  const items = await q(`select item_id, sum(n)::bigint as n from (
      select item_id, qty as n from public.player_inventory where user_id = $1
      union all select item_id, 1 from public.player_equipment where user_id = $1
      union all select item_id, qty from public.account_bank where user_id = $1
      union all select b.item_id, b.qty_left from public.hunt_bag b join public.hunt_sessions s on s.id = b.session_id where s.user_id = $1 and s.ended_at is null
    ) x group by 1`, [uid]);
  return { gold: Number((await q('select gold from public.account_wallet where user_id = $1', [uid]))[0].gold),
    items: Object.fromEntries(items.map((r) => [r.item_id, Number(r.n)])),
    last: (await q('select coalesce(max(id), 0)::bigint as i from public.player_ledger where user_id = $1', [uid]))[0].i };
}
/* What moved against what the ledger says moved: [] is even. A store use is bought and spent at once (its qty is no stock). */
async function drift(before) {
  const now = await books();
  const led = {};
  let gold = 0;
  for (const r of await q(`select intent, item_id, qty, gold, meta->'delta'->'i' as loot from public.player_ledger where user_id = $1 and id > $2`, [uid, before.last])) {
    gold += Number(r.gold || 0);
    if (r.item_id && r.intent !== 'supply_buy') led[r.item_id] = (led[r.item_id] || 0) + Number(r.qty || 0);
    for (const [id, n] of Object.entries(r.loot || {})) led[id] = (led[id] || 0) + Number(n);
  }
  const out = now.gold - before.gold === gold ? [] : [`gold: the purse moved ${now.gold - before.gold}, the ledger says ${gold}`];
  for (const id of new Set([...Object.keys(before.items), ...Object.keys(now.items), ...Object.keys(led)])) {
    const moved = (now.items[id] || 0) - (before.items[id] || 0);
    if (moved !== (led[id] || 0)) out.push(`${id}: the stock moved ${moved}, the ledger says ${led[id] || 0}`);
  }
  return out;
}

let red = 0;
const seen = new Map();
async function refusals(tag) {
  for (const r of await q(`select slot, code, n, intent, last_detail from public.hr_rejections where user_id = $1`, [uid])) {
    const k = r.slot + ':' + r.code;
    if (r.code === 'slot_not_owned' || seen.get(k) === String(r.n)) continue;
    seen.set(k, String(r.n));
    red++;
    console.log(`  REFUSED ${tag} hero ${k} x${r.n} (${r.intent}) ${JSON.stringify(r.last_detail).slice(0, 240)}`);
  }
}

const specs = process.argv.slice(2).filter((a) => /^[a-z_]+:\d+$/.test(a)).map((a) => a.split(':'));
const list = specs.length ? specs : OPEN_GROUNDS.map((id) => { const b = HUNTS.find((h) => h.id === id).band; return [id, String(Math.max(b[0] + 1, Math.round((b[0] + b[1]) / 2)))]; });
for (const [hunt, lv] of list) {
  const top = HUNT_GROUNDS[hunt].densityMax[3];
  for (const [density, hours] of [[top, arg('--hours', 3)], [1, arg('--low', 1)]]) {
    if (!hours) continue;
    token = (await login()).access_token;   // a token lives an hour; a long soak outlives it
    await outfit(Number(lv));
    await purse(50000000);
    await fresh();
    await rpc('hr_hunt_density_set', { p_slot: 0, p_hunt: hunt, p_density: density, p_idem: idem() });
    const before = await books();
    const ends = {};
    let at = new Date().toISOString();
    for (let min = 0; min < hours * 60; min += 10) {
      await q(`insert into public.social_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id) do update set seen_at = now()`, [uid]);
      await fresh();
      const open = await q('select slot from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]);
      if (!open.length) {
        const st = await rpc('hr_hunt_party_start', { p_slot: 0, p_hunt: hunt, p_idem: idem() });
        if (!st || st.ok !== true) { red++; console.log('  START REFUSED ' + JSON.stringify(st).slice(0, 300)); break; }
      } else if (open.length < 4) {
        for (const o of open) { await rpc('hr_hunt_leave', { p_slot: o.slot, p_idem: idem() }); await fresh(); }
      }
      await world.skip(10);
      for (const e of await q(`select end_reason, forfeit, ended_at from public.hunt_sessions where user_id = $1 and ended_at > $2::timestamptz order by ended_at`, [uid, at])) {
        const k = e.end_reason + (e.forfeit ? ' FORFEIT' : '');
        ends[k] = (ends[k] || 0) + 1;
        at = new Date(e.ended_at).toISOString();
        if (e.forfeit) red++;
      }
      await refusals(hunt + ' +' + (min + 10) + ' min');
    }
    for (const o of await q('select slot from public.hunt_sessions where user_id = $1 and ended_at is null', [uid])) { await fresh(); await rpc('hr_hunt_leave', { p_slot: o.slot, p_idem: idem() }); }
    await world.skip(1);
    const stacks = await q('select count(*)::int as n from public.player_inventory where user_id = $1 group by slot order by slot', [uid]);
    const kills = await q(`select k.key as mon, sum(k.value::bigint)::bigint as n from public.player_ledger l, jsonb_each_text(l.meta->'km') k where l.user_id = $1 and l.id > $2 and l.kind = 'combat' and l.slot = 0 group by 1 order by 2 desc`, [uid, before.last]);
    const off = await drift(before);
    red += off.length;
    console.log(`${hunt} L${lv} density ${density}, ${hours} h: ends ${JSON.stringify(ends)}, stacks ${stacks.map((s) => s.n).join('/')}, kills ${kills.map((k) => k.mon + ' ' + k.n).join(', ')}`);
    console.log('  books ' + (off.length ? 'OFF: ' + off.slice(0, 6).join('; ') : 'even'));
  }
}
await world.close();
console.log(red ? 'party-soak: RED (' + red + ')' : 'party-soak: green');
process.exit(red ? 1 : 0);
