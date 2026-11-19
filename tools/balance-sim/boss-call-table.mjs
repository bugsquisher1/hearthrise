#!/usr/bin/env node
// tools/balance-sim/boss-call-table.mjs — CALL OUT, MEASURED ON THE REAL SETTLE (Tyler 2026-11-04; src/data/boss-calls.js).
//
//   node tools/balance-sim/boss-call-table.mjs --hall krells_hold [--level 98] [--first] [--spell hall_fire.hitPm=300,hall_fire.cdMs=20000] [--named-hp N --named-atk N --named-rage N] ...
//                                          a KEYED HALL (src/data/boss-halls.js) on the same rows and bars. It pays, so the money line is not read.
//                                          --first: every kit without the boss's own prize (the party reading his card for the first time)
//   node tools/balance-sim/boss-call-table.mjs [--seeds 12] [--only rat|chief] [--json OUT] [--hp 1500 --atk 21 --acc 0.7 --lvl 25 --rage 1400 --addhp 260 --addatk 30 --addacc 0.1 --addlvl 40 --adds 5 --guard 500] [--cliff] [--ship] [--focus] [--rows REGEX] [--stats]
//
//   node tools/balance-sim/boss-call-table.mjs --selftest
//                                          the money line bites: planted payouts (skill XP, Level XP, coin, an item on a loss or off his table) each throw
//
// THE MONEY LINE (Tyler 2026-11-14, src/data/boss-calls.js; option B): a called fight pays NO XP and NO coin on any route; a WIN may drop his
// own ground table (the boss `of`'s monsters.js drops) and his call-only piece, and nothing else; a loss or the limit drops nothing. Every
// try is read against that (calledPayProblems) and the first that breaks it throws. A keyed hall pays, so it is not read.
//
// Each cell plays the called room to its end through accrueHunt (tests/hunt-core/fixtures/play-ground.mjs, the settle
// the world tick runs), a fresh hunt secret per seed, and reads how it ended: the kill, a death or the limit. It plays
// the room as data ships it; --hp, --atk, --acc and --lvl try another row on the same dice (scratch, nothing is written). --cliff plays only the rows that read the cliff.
//
// THE TARGET (Tyler's RISK AND DEATH ruling): an optimized party can survive it; a careless one dies. "Optimized" here
// is a real choice a player makes: bring a Healer and a tank, wear the ground's own tier, set the right food. "Careless"
// is the same Level with the wrong answer: no Healer, no tank, the starter bar, or several Levels under.
// Output: one line a cell: win rate, median time to kill, deaths per try, the food bill per head, the lowest typical HP.
//
// THE SHIP BAR (Tyler 2026-11-05: "phases"): same gear, about 30% with a bad bar and 85% with a good one; one gear tier behind on a good bar, about 40%. --ship plays only those rows.
// BARS below says what each bar is, slot by slot: the party's kit and food are the same, only the bar and the Target setting change.
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { loadGear, STYLES } from './gear.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;

/* WHAT ONE CALLED TRY MAY PAY (the money line above), as problems; [] when it held. `pays`: { how, xp, lvl, coin, items: { id: qty gained } };
   `allowed`: the Set a win may drop (allowedDrops). Pure: --selftest feeds it planted payouts. */
function calledPayProblems(pays, allowed) {
  const out = [];
  if (pays.xp) out.push(pays.xp + ' skill XP');
  if (pays.lvl) out.push(pays.lvl + ' Level XP');
  if (pays.coin) out.push(pays.coin + ' coin');
  const got = Object.entries(pays.items || {}).filter(([, n]) => n > 0).map(([id]) => id);
  if (got.length && pays.how !== 'felled') out.push('items on a ' + pays.how + ' (' + got.join(', ') + ')');
  const off = got.filter((id) => !allowed.has(id));
  if (off.length) out.push('items off his table (' + off.join(', ') + ')');
  return out;
}
/* What a win may drop: the copied boss's own table (monsters.js `of`'s drops) and the call's call-only piece. */
const allowedDrops = (call, monsters) => new Set([...((monsters[call.of] && monsters[call.of].drops) || []).map((d) => d.id), ...(call.callOnly ? [call.callOnly] : [])]);

/* --selftest: the check reads green on a clean win and a clean loss, and red on each planted payout (each a mutant of a try). */
if (process.argv.includes('--selftest')) {
  const { BOSS_CALLS: CALLS } = await import(u('src/data/boss-calls.js'));
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const rat = CALLS.rat_king, ok = allowedDrops(rat, MONSTERS);
  const win = { how: 'felled', xp: 0, lvl: 0, coin: 0, items: { rat_tail: 1, bones: 2, kingstooth: 1 } };
  const clean = [['a win with his table and Kingstooth', win], ['a loss with nothing', { how: 'death', xp: 0, lvl: 0, coin: 0, items: {} }],
    ['a win that spent a stack', { ...win, items: { ...win.items, bronze_arrows: -3 } }]];
  const planted = [['skill XP on a win', { ...win, xp: 40 }], ['Level XP on a win', { ...win, lvl: 120 }], ['coin on a win', { ...win, coin: 25 }],
    ['skill XP on a loss', { how: 'death', xp: 5, lvl: 0, coin: 0, items: {} }], ['coin at the limit', { how: 'time', xp: 0, lvl: 0, coin: 1, items: {} }],
    ['an item on a loss', { how: 'death', xp: 0, lvl: 0, coin: 0, items: { rat_tail: 1 } }], ['an item at the limit', { how: 'time', xp: 0, lvl: 0, coin: 0, items: { kingstooth: 1 } }],
    ["another call's piece on a win", { ...win, items: { cauldron_lid: 1 } }]];
  const bad = [];
  if (!ok.has('kingstooth') || !ok.has('rat_tail') || ok.has('cauldron_lid')) bad.push("the Rat King's allowed drops read " + [...ok].join(','));
  for (const [name, t] of clean) if (calledPayProblems(t, ok).length) bad.push('clean ' + name + ' read ' + calledPayProblems(t, ok).join('; '));
  for (const [name, t] of planted) if (!calledPayProblems(t, ok).length) bad.push('planted ' + name + ' ESCAPED');
  for (const b of bad) console.log('  x ' + b);
  console.log(bad.length ? 'boss-call-table --selftest: ' + bad.length + ' case(s) wrong'
    : 'boss-call-table --selftest: ' + clean.length + ' clean tries pass, ' + planted.length + '/' + planted.length + ' planted payouts caught');
  process.exit(bad.length ? 1 : 0);
}

const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
const play = await loadPlay(ROOT);
const gear = await loadGear(ROOT);
const { BUILD } = await import(u('src/build-info.js'));
const v = '?v=' + BUILD.version;
const G = await import(u('src/data/hunt-grounds.js'));
const { BOSS_CALLS, BOSS_CALL_RULES } = await import(u('src/data/boss-calls.js'));
const { BOSS_HALLS, BOSS_HALL_RULES, hallBossOf, isNamedAdd } = await import(u('src/data/boss-halls.js'));
/* the engine's own spell rows (a --spell what-if moves the row the fight reads) */
const ENGINE_SPELLS = (await import(u('src/data/monster-spells.js') + v)).MONSTER_SPELLS;
const { START_BAR } = await import(u('src/data/start-kit.js'));
const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js'));
const SB = await import(u('src/data/supply-basics.js'));
const await_hunts = await import(u('src/data/hunts.js'));
/* the engine's own module instances (src/core imports src/data with ?v=): a what-if moves the rows the fight reads */
const ENGINE_MONSTERS = (await import(u('src/data/monsters.js') + v)).MONSTERS;
const COND = await import(u('src/core/hunt/conditions.js') + v);

/* A KEYED HALL IS FITTED IN THE GEAR ITS KEY HOLDER WEARS (designer 2026-11-14, lane/d-march-balance). Its ground is staged until the
   region ships, and so are the grounds that drop that region's gear, so the open-ground ladder dressed the Level 98 party at Krell's
   Hall in tier 3 steel: he was fitted to the ship bar in gear nobody who holds his key wears, and in the Hold's own tier 6 he was a
   two-minute fight the hand play won 5 of 5. A hall plays every staged ground as open (gear.mjs openAlso), the ladder it ships on. */
const STAGED = Object.keys(G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g));
/* --first: THE PARTY AT ITS FIRST WIN (the QA audit's F22, 2026-11-15). A hall's own prize drops only from its boss, so a party reading the
   hall's card for the first time wears none of it: at Krell from 88 the ladder dressed it in his tier 7, and a pair that loses in tier 6
   read as winning. --first holds the boss's own rows out of every kit. */
const FIRST = process.argv.includes('--first');
const prizeOf = (call) => (ENGINE_MONSTERS[call.monster].drops || []).map((d) => d.id);
const gearOpts = (call) => (call.hall ? { openAlso: STAGED, ...(FIRST ? { exclude: prizeOf(call) } : {}) } : {});
const secretOf = (seed) => {
  let h = 2166136261 >>> 0;
  for (const c of 'bosscall:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
};
const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
/* The ground's guide food and drink on the start bar (play-ground.mjs refBar's shape): a hero who stocked for the ground. */
const guideBar = (from, eatPct, store) => {
  const g = BAG_GUIDE_BY_HUNT[from];
  const item = g ? { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
  /* `store`: a hall card's food (BOSS_HALLS storeFloor) on the store slot, its cooked partner on the own one */
  if (store) Object.assign(item, { d_food: (SB.BASIC_SUPPLIES.find((b) => b.id === store) || {}).partner, d_food_store: store });
  return START_BAR.map((x) => {
    const y = JSON.parse(JSON.stringify(x));
    if (item[y.id]) y.action.id = item[y.id];
    if (Number.isInteger(eatPct) && y.conditions[0].metric === 'self_hp_pct') y.conditions[0].value = eatPct;
    return y;
  });
};
const starterBar = () => JSON.parse(JSON.stringify(START_BAR));
/* A spell or skill on the bar, under the game's own suggested conditions (conditions.js): what the bar window offers a player. `store`: the rune it buys per cast. */
const STORE_RUNE = { flame_strike: 'plain_fire_rune', flame_volley: 'plain_fire_rune', fireball: 'plain_fire_rune', frost_lance: 'plain_ice_rune', greater_mend: 'plain_water_rune',
  circle_of_renewal: 'plain_water_rune', arcane_barrier: 'plain_earth_rune', protective_ward: 'plain_earth_rune', green_sickness: 'plain_poison_rune', rend: 'plain_rupture_rune' };
const slotOf = (id) => ({ action: { type: 'ability', id, ...(STORE_RUNE[id] ? { store: STORE_RUNE[id] } : {}) }, conditions: COND.suggestedConditions({ type: 'ability', id }), join: 'and' });
/* A slot under conditions of its own (`when`), or the game's suggested ones. */
const slotWith = (id, when) => (when ? { ...slotOf(id), conditions: when } : slotOf(id));
const under_ = (metric, value, subject) => ({ metric, op: 'lt', value, ...(subject ? { subject } : {}) });
const aoe = (n) => ({ metric: 'enemies_in_aoe', op: 'gte', value: n });
/* THE TWO BARS. BAD answers neither question: the tank's Challenge is off his bar, nobody's slot hits more than one, the healer waits for 40% and has no party heal, everyone eats at 40% and stares at the boss.
   GOOD answers both: Challenge first, an area slot on a crowd, the damage on the weakest (the adds, then him), the healer early with a party heal, everyone eating at 75%, and the
   Mage's spell the boss doesn't resist (the King resists fire: Frost Lance, Fireball only on 3 or more; the Chief resists frost: Fireball every cast). A role's list may be per call. */
const BARS = {
  bad: { eat: 40, tmode: 'strongest', spells: {
    tank: [['power_strike']], healer: [['greater_mend', [under_('ally_hp_pct', 40, 'lowest')]]], hammer: [['power_strike']], axes: [['power_strike']], mage: [['frost_lance']], bow: [['precision_shot']] } },
  good: { eat: 75, tmode: 'weakest', spells: {
    tank: [['challenge'], ['power_strike']],
    healer: [['circle_of_renewal', [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_80' }]], ['greater_mend', [under_('ally_hp_pct', 85, 'lowest')]]],
    hammer: [['cleave', []], ['power_strike']], axes: [['cleave', []], ['power_strike']],
    mage: { rat_king: [['fireball', [aoe(3)]], ['frost_lance']], chief_coppercap: [['fireball', []]], krells_hold: [['fireball', [aoe(3)]], ['frost_lance']] }, bow: [['flame_volley', [aoe(2)]], ['precision_shot']] } },
};
/* DOES EACH QUESTION BITE? The good bar with one answer taken away. At the Chief the Mage keeps Fireball, his one spell he doesn't resist, so "no area slot" there is the hammer's Cleave. */
const without = (spells) => ({ ...BARS.good, spells: { ...BARS.good.spells, ...spells } });
BARS.noChallenge = without({ tank: [['power_strike']] });
BARS.noArea = without({ hammer: [['power_strike']], mage: { rat_king: [['frost_lance']], chief_coppercap: [['fireball', []]], krells_hold: [['frost_lance']] } });
BARS.noTarget = { ...BARS.good, tmode: 'strongest' };
BARS.eatsLate = { ...BARS.good, eat: 40 };
BARS.healsLate = without({ healer: [['greater_mend', [under_('ally_hp_pct', 40, 'lowest')]]] });
/* Both answers to where the adds go taken away: no Challenge, and the damage stays on him. */
BARS.noPeel = { ...BARS.noChallenge, tmode: 'strongest' };
/* The bad bar with Challenge first on the tank: does Challenge decide it at this boss (the hall's warning, boss-halls.js warnGuard)? */
BARS.badChallenge = { ...BARS.bad, spells: { ...BARS.bad.spells, tank: [['challenge'], ['power_strike']] } };
/* THE DOOR'S BAR (lane/d-march-balance, the v0.2.133 hands-on check): what a player builds from a hall's hints and nothing else. Every role keeps
   its default moves (rule-subjects.js ROLE_RULES) and its default Target; the hints change eating (75%) and the healer's two heals. The "good"
   bar above also re-orders the Mage and the Target, which no hint says, so a hall is fitted on this one. `card`: it eats the card's food (the
   hall's storeFloor, lane/d-audit-f22), where every other bar eats the ground's guide food. */
BARS.door = { eat: 75, tmode: null, card: true, spells: { healer: [['circle_of_renewal', [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_80' }]], ['greater_mend', [under_('ally_hp_pct', 85, 'lowest')]]] } };
BARS.doorNoChallenge = { ...BARS.door, spells: { ...BARS.door.spells, tank: [['power_strike']] } };
/* A role's slots on a bar, for this call (a list, or a list per call id). */
const spellsOf = (named, style, callId) => { const v = named.spells[style]; return (Array.isArray(v) ? v : v && v[callId]) || []; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = (n, d = 0) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/* --trace: one fight, 10 s a line: what hit whom, who ate and cast, how far he has fallen. */
const TRACE = process.argv.includes('--trace');
const traceState = { boss: 0, units: {} };
function traceWindow(o, roles) {
  for (const [id, r] of Object.entries(o.units || {})) traceState.units[id] = r;
  const name = (id) => { const r = traceState.units[id]; return r ? r[0] : String(id); };
  const on = {}, by = {}, casts = {}, spawned = [];
  let t0 = null;
  for (const e of o.events || []) {
    if (t0 === null) t0 = e.atMs;
    const tk = name(e.t);
    if (e.type === 'dmg' && inRoom(tk)) { by[tk] = (by[tk] || 0) + e.amount; if (BOSS_MONSTERS.has(tk)) traceState.boss += e.amount; }
    if (e.type === 'dmg' && inRoom(name(e.u))) { const k = name(e.u).replace('_called', '') + '>' + tk; on[k] = (on[k] || 0) + e.amount; }
    if (e.type === 'cast') casts[name(e.u) + ':' + e.ability] = (casts[name(e.u) + ':' + e.ability] || 0) + 1;
    if (e.type === 'eat') casts[name(e.u) + ':eat'] = (casts[name(e.u) + ':eat'] || 0) + 1;
    if (e.type === 'boss_phase') spawned.push(e.phase);
    if (e.type === 'kill') spawned.push('KILL ' + tk);
  }
  const hp = o.members.map((p) => p.key + '=' + p.delta.hp).join(' ');
  console.log('  ' + String(Math.round(((o.settledTo || 0) - Date.UTC(2026, 9, 18, 12, 0, 0)) / 1000)).padStart(4) + 's boss dmg ' + traceState.boss + ' | hp ' + hp + ' | onHeroes ' + JSON.stringify(on) + ' | onMons ' + JSON.stringify(by) + ' | ' + JSON.stringify(casts) + ' ' + spawned.join(','));
}
/* The room the fight is played in: the shipped row, or --adds N's what-if copy. */
function groundOf(call) {
  const g = call.hall ? G.HALL_GROUNDS[call.hunt] : G.CALLED_GROUNDS[call.hunt];
  const n = Number(arg('adds', '0'));
  if (!n) return g;
  const rows = g.pockets[0].adds;
  return { ...g, pockets: [{ ...g.pockets[0], adds: Array.from({ length: n }, (_, i) => rows[i % rows.length]) }] };
}
const BOSS_MONSTERS = new Set(Object.values(BOSS_CALLS).map((c) => c.monster));
/* A KEYED HALL as a room row of the same shape (`hall`: it pays, and its limit is the halls'). */
const hallRoom = (id) => {
  const h = BOSS_HALLS[id];
  if (!h) throw new Error('no hall ' + id + ' (src/data/boss-halls.js BOSS_HALLS)');
  const monster = hallBossOf(G.HALL_GROUNDS[h.hunt]);
  BOSS_MONSTERS.add(monster);
  ROOM_KINDS = new Set([monster, ...G.HALL_GROUNDS[h.hunt].pockets[0].adds.map((a) => a.monster)]);
  return { id: h.id, hunt: h.hunt, from: h.id, monster, hall: true, fee: 'a ' + h.key, storeFloor: h.storeFloor || null };
};
/* is unit kind `k` one of the room's monsters (a called row, or a hall's boss and wave)? */
let ROOM_KINDS = null;
const inRoom = (k) => /_called$/.test(k) || (!!ROOM_KINDS && ROOM_KINDS.has(k));

/** One try: { how: 'felled' | 'death' | 'time' | 'other', ms, deaths, store, hpMinPct }. */
function tryOnce(call, c, seed) {
  const ground = groundOf(call);
  const kits = c.party.map((s, i) => (c.gear ? c.gear(s, c.level, i, gearOpts(call)) : gear.kitOf(s, c.level, gearOpts(call))));
  const roles = c.party.map((s) => STYLES[s].role);
  const named = c.bar ? BARS[c.bar] : null;
  const bar = (role, seat) => (named
    ? [...spellsOf(named, c.party[seat], call.id).map(([id, when]) => slotWith(id, when)), ...guideBar(call.from, named.eat, named.card ? call.storeFloor : null)]
    : [...((c.spells && c.spells[c.party[seat]]) || []).map(slotOf), ...(c.starter ? starterBar() : guideBar(call.from, c.eatPct))]);
  let how = 'other', ms = 0, deaths = 0, store = 0, lowest = 100, dealt = 0, xp = 0, coin = 0, lvl = 0, phase = 'first', fell = null;
  /* --stats: who hit whom (blows, landed, damage), what each role cast, how long each phase stood */
  const units = {}, blows = {}, casts = {}, at = {}, items = {};
  const nameOf = (id) => (units[id] ? units[id][0] : String(id)).replace('_called', '');
  const out = play.run(call.hunt, c.level, roles, {
    ground, spanMs: (call.hall ? BOSS_HALL_RULES : BOSS_CALL_RULES).limitMs + 30000, windowMs: TRACE ? 10000 : 30000, secret: secretOf(seed), equipment: (role, i) => kits[i],
    bar, leaveTogether: true, ...(c.temper ? { temper: c.temper } : {}),
    ...(named ? { options: (role) => (role === 'tank' || role === 'healer' || !named.tmode ? {} : { target_mode: named.tmode }) } : {}),
    bag: (role, i) => (kits[i].ammo === 'bronze_arrows' ? { bronze_arrows: { loaded: 1 } } : {}),
    onWindow: (o) => {
      if (TRACE) traceWindow(o, roles);
      for (const [id, r] of Object.entries(o.units || {})) units[id] = r;
      for (const e of o.events || []) {
        if ((e.type === 'dmg' || e.type === 'miss') && !e.dot && inRoom(units[e.u] ? units[e.u][0] : '')) {
          const k = nameOf(e.u) + '>' + nameOf(e.t); const b = blows[k] || (blows[k] = [0, 0, 0]);
          b[0] += 1; if (e.type === 'dmg') { b[1] += 1; b[2] += e.amount; }
        }
        if (e.type === 'cast') casts[nameOf(e.u) + ':' + e.ability] = (casts[nameOf(e.u) + ':' + e.ability] || 0) + 1;
        if (e.type === 'boss_phase' && !(e.phase in at)) at[e.phase] = e.atMs;
        if (e.type === 'kill' && BOSS_MONSTERS.has(units[e.t] ? units[e.t][0] : '')) at.kill = e.atMs;
      }
      for (const e of o.events || []) if (e.type === 'boss_phase') phase = e.phase;
      for (const p of o.members) {
        if (p.hunt.ended) {
          const r = p.hunt.ended.reason;
          if (r === 'boss_felled') how = 'felled'; else if (r === 'boss_time' && how !== 'felled') how = 'time';
          else if ((r === 'died' || r === 'party_member_died') && how === 'other') how = 'death';
          ms = Math.max(ms, Date.parse(p.hunt.ended.at) - Date.UTC(2026, 9, 18, 12, 0, 0));
        }
        deaths += (p.summary.deathLog || []).length;
        for (const d of p.summary.deathLog || []) if (!fell) fell = phase + ' ' + (roles[Number.parseInt(String(p.key), 10)] || p.key) + ' by ' + d.monster;
        xp += Object.values(p.delta.xp || {}).reduce((a, b) => a + b, 0);
        lvl += p.delta.level_xp || 0;
        coin += p.delta.gold || 0;
        for (const [id, n] of Object.entries(p.delta.items || {})) items[id] = (items[id] || 0) + n;
        for (const [id, n] of Object.entries(p.hunt.buys || {})) store += n * ((play.basics[id] || {}).price || 0);
        if (p.maxHp && Number.isInteger(p.delta.hp) && !p.hunt.ended) lowest = Math.min(lowest, 100 * p.delta.hp / p.maxHp);
      }
      for (const e of o.events || []) if (e.type === 'dmg' && !e.dot) dealt += 1;
    },
  });
  const end = at.kill || (Date.UTC(2026, 9, 18, 12, 0, 0) + (ms || out.playedMs));
  const phaseS = { adds: at.adds ? ((at.enrage || end) - at.adds) / 1000 : null, enrage: at.enrage ? (end - at.enrage) / 1000 : null };
  return { how, ms: ms || out.playedMs, deaths, store: store / roles.length, lowest, pays: { how, xp, lvl, coin, items }, fell, blows, casts, phaseS };
}

/* --stats: blows per try (landed %, damage per try) for each attacker>target, casts per try, the phases' median seconds. */
function statsOf(t) {
  const n = t.length, b = {}, c = {};
  for (const x of t) {
    for (const [k, v] of Object.entries(x.blows)) { const a = b[k] || (b[k] = [0, 0, 0]); a[0] += v[0]; a[1] += v[1]; a[2] += v[2]; }
    for (const [k, v] of Object.entries(x.casts)) c[k] = (c[k] || 0) + v;
  }
  const blowWords = Object.entries(b).sort((x, y) => y[1][2] - x[1][2]).map(([k, v]) => k + ' ' + Math.round(v[0] / n) + 'x ' + Math.round((100 * v[1]) / Math.max(1, v[0])) + '% ' + Math.round(v[2] / n) + 'dmg');
  const castWords = Object.entries(c).sort().map(([k, v]) => k + ' ' + round(v / n, 1));
  const ph = (k) => round(median(t.map((x) => x.phaseS[k]).filter((v) => v !== null)));
  return 'adds ' + ph('adds') + 's, enrage ' + ph('enrage') + 's | ' + blowWords.join('; ') + ' | ' + castWords.join(' ');
}

function cell(call, c, seeds) {
  const t = [];
  for (let s = 0; s < seeds; s++) t.push(tryOnce(call, c, s));
  const won = t.filter((x) => x.how === 'felled');
  if (!call.hall) {
    const ok = allowedDrops(call, play.MONSTERS);
    for (const [i, x] of t.entries()) {
      const bad = calledPayProblems(x.pays, ok);
      if (bad.length) throw new Error('A CALLED FIGHT PAID ' + bad.join('; ') + ' on ' + c.label + ' (seed ' + i + ', ' + x.how + '): the money line is broken');
    }
  }
  return {
    call: call.id, label: c.label, level: c.level, seeds,
    win: round((100 * won.length) / seeds), felled: won.length, deaths: t.filter((x) => x.how === 'death').length, time: t.filter((x) => x.how === 'time').length,
    other: t.filter((x) => x.how === 'other').length,
    medianKillS: won.length ? round(median(won.map((x) => x.ms)) / 1000) : null,
    medianEndS: round(median(t.map((x) => x.ms)) / 1000),
    foodPerHead: round(median(t.map((x) => x.store))), lowestHpPct: round(median(t.map((x) => x.lowest))),
    stats: statsOf(t),
    fell: Object.entries(t.reduce((a, x) => { if (x.fell) a[x.fell] = (a[x.fell] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => n + ' ' + k).join('; '),
  };
}

/* THE CELLS: who walks in, and with what. `gear` absent = the style's best at its Level (gear.mjs); `starter` = the bar a hero who never touched it plays. */
const under = (off) => (s, L, i, o) => gear.kitOf(s, L, { ...(o || {}), tierOffset: off, only: 'all' });
const shipRows = (L) => [
  ['Ship: good bar, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'good' }],
  /* THE BAR A PARTY IS HANDED (lane/d-march-balance, the v0.2.132 re-play: 0 of 6 at Krell): each role's default moves (rule-subjects.js ROLE_RULES)
     and the start kit's food and drink, Salted Shrimp from the store. The row after it is the same moves on the ground's guide food. */
  ['Ship: the start bar as handed out, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], starter: true }],
  ['Ship: default moves on the ground\'s food, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'] }],
  /* CHALLENGE ON AND OFF, on the default moves and on the bad bar (a hall's warning says which: boss-halls.js warnGuard) */
  ["Ship: the door's bar, tank + healer + 2 dps", { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'door' }],
  ["Ship: the door's bar but no Challenge on the tank, tank + healer + 2 dps", { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'doorNoChallenge' }],
  ['Ship: default moves but no Challenge on the tank, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], spells: { tank: ['power_strike'] } }],
  ['Ship: bad bar but Challenge on the tank, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'badChallenge' }],
  ['Ship: bad bar, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'bad' }],
  ['Ship: good bar, one gear tier behind, tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar: 'good', gear: under(-1) }],
  ['Ship: good bar, tank + healer', { level: L, party: ['tank', 'healer'], bar: 'good' }],
  ['Ship: bad bar, tank + healer', { level: L, party: ['tank', 'healer'], bar: 'bad' }],
  ['Ship: good bar, one gear tier behind, tank + healer', { level: L, party: ['tank', 'healer'], bar: 'good', gear: under(-1) }],
  /* THE SMALL PARTY ON THE DOOR'S BAR (the QA audit's F22, 2026-11-15: a tank and a healer with every change on the hall card timed out, a third
     hero won): the card's own bar for two, and for three with each kind of third. Labels start "Size:" so the ship rows' readers pass them by. */
  ["Size: the door's bar, tank + healer", { level: L, party: ['tank', 'healer'], bar: 'door' }],
  ["Size: the door's bar, tank + healer + hammer", { level: L, party: ['tank', 'healer', 'hammer'], bar: 'door' }],
  ["Size: the door's bar, tank + healer + mage", { level: L, party: ['tank', 'healer', 'mage'], bar: 'door' }],
  ["Size: the door's bar, tank + healer + bow", { level: L, party: ['tank', 'healer', 'bow'], bar: 'door' }],
  /* ...and a third who deals none: is it the third hero, or the third hero's damage? (F22: "what it takes is damage") */
  ["Size: the door's bar, tank + healer + healer", { level: L, party: ['tank', 'healer', 'healer'], bar: 'door' }],
  ["Size: the door's bar, tank + healer + tank", { level: L, party: ['tank', 'healer', 'tank'], bar: 'door' }],
  ...[['noChallenge', 'no Challenge on the tank'], ['noArea', 'no area slot'], ['noTarget', 'damage stays on him'], ['noPeel', 'no Challenge and damage stays on him'], ['eatsLate', 'everyone eats at 40%'], ['healsLate', 'the healer waits for 40%, no party heal']]
    .map(([bar, words]) => ['Ship: good bar but ' + words + ', tank + healer + 2 dps', { level: L, party: ['tank', 'healer', 'hammer', 'mage'], bar }]),
];
const RUNS = {
  rat_king: [
    ...shipRows(25),
    ['Optimized: tank + healer + 2 dps, L25', { level: 25, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Optimized: tank + healer + bow, L25', { level: 25, party: ['tank', 'healer', 'bow'] }],
    ['Optimized: tank + healer, L25', { level: 25, party: ['tank', 'healer'] }],
    ['Over: tank + healer + 2 dps, L31', { level: 31, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Over: tank + healer, L31', { level: 31, party: ['tank', 'healer'] }],
    ['Under: tank + healer + 2 dps, L18', { level: 18, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Careless: four dps, no tank or healer, L25', { level: 25, party: ['hammer', 'axes', 'bow', 'mage'] }],
    ['Careless: tank + dps, no healer, L25', { level: 25, party: ['tank', 'hammer'] }],
    ['Careless: two dps, L25', { level: 25, party: ['hammer', 'mage'] }],
    ['Careless: four dps, starter bar, L25', { level: 25, party: ['hammer', 'axes', 'bow', 'mage'], starter: true }],
    ['Careless: tank + healer, one gear tier behind, L25', { level: 25, party: ['tank', 'healer'], gear: under(-1) }],
    ['Careless: tank + healer + 2 dps, one gear tier behind, L25', { level: 25, party: ['tank', 'healer', 'hammer', 'mage'], gear: under(-1) }],
    /* THE ACTION BAR: the same party, one thing changed. Is preparing a real decision? */
    ['Bar: tank + healer + mage, no spells, L25', { level: 25, party: ['tank', 'healer', 'mage'] }],
    ['Bar: + Greater Mend, L25', { level: 25, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'] } }],
    ['Bar: + Greater Mend, Fireball (he resists), L25', { level: 25, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'], mage: ['fireball'] } }],
    ['Bar: + Greater Mend, Frost Lance, L25', { level: 25, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'], mage: ['frost_lance'] } }],
    ['Bar: + Greater Mend, Frost Lance, Ward, Challenge, L25', { level: 25, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend', 'protective_ward'], mage: ['frost_lance'], tank: ['challenge'] } }],
    ['Bar: no tank, healer Greater Mend + 2 dps, L25', { level: 25, party: ['healer', 'hammer', 'mage'], spells: { healer: ['greater_mend'], mage: ['frost_lance'] } }],
    ['Bar: tank + dps, Mend on both, L25', { level: 25, party: ['tank', 'hammer'], spells: { tank: ['mend'], hammer: ['mend'] } }],
    ['Bar: eats at 85% not 60%, tank + dps, L25', { level: 25, party: ['tank', 'hammer'], eatPct: 85 }],
    ['Bar: tank + healer, starter food, L25', { level: 25, party: ['tank', 'healer'], starter: true }],
  ],
  chief_coppercap: [
    ...shipRows(45),
    ['Optimized: tank + healer + 2 dps, L45', { level: 45, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Optimized: tank + healer + bow, L45', { level: 45, party: ['tank', 'healer', 'bow'] }],
    ['Optimized: tank + healer, L45', { level: 45, party: ['tank', 'healer'] }],
    ['Tempered: tank + healer, all rungs, L45', { level: 45, party: ['tank', 'healer'], temper: { 'temper:blows:3': 5, 'temper:armor:3': 5 } }],
    ['Over: tank + healer + 2 dps, L55', { level: 55, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Under: tank + healer + 2 dps, L36', { level: 36, party: ['tank', 'healer', 'hammer', 'mage'] }],
    ['Careless: four dps, no tank or healer, L45', { level: 45, party: ['hammer', 'axes', 'bow', 'mage'] }],
    ['Careless: tank + dps, no healer, L45', { level: 45, party: ['tank', 'hammer'] }],
    ['Careless: two dps, L45', { level: 45, party: ['hammer', 'mage'] }],
    ['Careless: four dps, starter bar, L45', { level: 45, party: ['hammer', 'axes', 'bow', 'mage'], starter: true }],
    ['Careless: tank + healer, one gear tier behind, L45', { level: 45, party: ['tank', 'healer'], gear: under(-1) }],
    ['Careless: tank + healer + 2 dps, one gear tier behind, L45', { level: 45, party: ['tank', 'healer', 'hammer', 'mage'], gear: under(-1) }],
    ['Bar: tank + healer + mage, no spells, L45', { level: 45, party: ['tank', 'healer', 'mage'] }],
    ['Bar: + Greater Mend, L45', { level: 45, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'] } }],
    ['Bar: + Greater Mend, Frost Lance (he resists), L45', { level: 45, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'], mage: ['frost_lance'] } }],
    ['Bar: + Greater Mend, Fireball, L45', { level: 45, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend'], mage: ['fireball'] } }],
    ['Bar: + Greater Mend, Fireball, Ward, Challenge, L45', { level: 45, party: ['tank', 'healer', 'mage'], spells: { healer: ['greater_mend', 'protective_ward'], mage: ['fireball'], tank: ['challenge'] } }],
    ['Bar: no tank, healer Greater Mend + 2 dps, L45', { level: 45, party: ['healer', 'hammer', 'mage'], spells: { healer: ['greater_mend'], mage: ['fireball'] } }],
    ['Bar: tank + dps, Mend on both, L45', { level: 45, party: ['tank', 'hammer'], spells: { tank: ['mend'], hammer: ['mend'] } }],
    ['Bar: eats at 85% not 60%, tank + dps, L45', { level: 45, party: ['tank', 'hammer'], eatPct: 85 }],
    ['Bar: tank + healer, starter food, L45', { level: 45, party: ['tank', 'healer'], starter: true }],
  ],
};

/* A HALL'S ROWS: the ship bar at --level (the band's middle), the cliff either side, a hero alone. */
const HUNT_BAND = (call) => (await_hunts.HUNT_INDEX[call.hunt] || await_hunts.HUNT_INDEX[call.from]).band;
const hallRows = (L) => [
  ...shipRows(L),
  ['Optimized: tank + healer + bow, L' + L, { level: L, party: ['tank', 'healer', 'bow'] }],
  ['Careless: four dps, no tank or healer, L' + L, { level: L, party: ['hammer', 'axes', 'bow', 'mage'] }],
  ['Careless: tank + dps, no healer, L' + L, { level: L, party: ['tank', 'hammer'] }],
  ['Alone: tank, good bar, L' + L, { level: L, party: ['tank'], bar: 'good' }],
];
const seeds = Number(arg('seeds', '12'));
const only = arg('only', null);
const hp = arg('hp', null), atk = arg('atk', null), lvl = arg('lvl', null), acc = arg('acc', null), rage = arg('rage', null), addhp = arg('addhp', null), addatk = arg('addatk', null), addacc = arg('addacc', null);
const HALL = arg('hall', null);
const roomGround = (call) => (call.hall ? G.HALL_GROUNDS : G.CALLED_GROUNDS)[call.hunt];
/* the wave's plain add row (--addhp and the like move it), and a hall's named add (--named-hp, --named-atk, --named-rage) */
const addOf = (call, monsters) => monsters[(roomGround(call).pockets[0].adds.find((a) => !isNamedAdd(monsters[a.monster])) || roomGround(call).pockets[0].adds[0]).monster];
const namedOf = (call, monsters) => { const a = roomGround(call).pockets[0].adds.find((x) => isNamedAdd(monsters[x.monster])); return a ? monsters[a.monster] : null; };
/* --spell id.field=n,...: a spell row's whole number on the same dice (scratch) */
for (const s of (arg('spell', '') || '').split(',').filter(Boolean)) {
  const m = /^([a-z0-9_]+)\.([a-zA-Z]+)=(\d+)$/.exec(s);
  if (!m || !ENGINE_SPELLS[m[1]]) throw new Error('--spell ' + s + ': id.field=n on a src/data/monster-spells.js row');
  ENGINE_SPELLS[m[1]][m[2]] = Number(m[3]);
}
/* --adds N: a what-if wave of N, the room's own rows round again (a second row on a spot takes the next free tile, pull-cycle.js placeRow). */
const addsN = arg('adds', null), addlvl = arg('addlvl', null);
const FOCUS = /^Ship: (the door's bar|the door's bar but no Challenge on the tank|the start bar as handed out|default moves on the ground's food|default moves but no Challenge on the tank|bad bar but Challenge on the tank|good bar|bad bar|good bar, one gear tier behind|good bar but no Challenge on the tank|good bar but no area slot), tank \+ healer \+ 2 dps|^Careless: four dps, no tank/;
const CLIFF = /Optimized|Under|gear tier|four dps, no tank|tank \+ dps, no healer/;
const rows = [];
for (const call of (HALL ? [hallRoom(HALL)] : Object.values(BOSS_CALLS))) {
  if (only && !call.id.includes(only)) continue;
  for (const m of [namedOf(call, ENGINE_MONSTERS), namedOf(call, play.MONSTERS)]) {
    if (!m) continue;
    if (arg('named-hp', null)) m.hp = Number(arg('named-hp', null));
    if (arg('named-atk', null)) m.atk = Number(arg('named-atk', null));
    if (arg('named-rage', null)) m.phases.enrageAtkPm = Number(arg('named-rage', null));
  }
  for (const inst of [ENGINE_MONSTERS[call.monster], play.MONSTERS[call.monster]]) {
    if (hp) inst.hp = Number(hp);
    if (atk) inst.atk = Number(atk);
    if (lvl) inst.level = Number(lvl);
    if (acc) inst.baseAcc = Number(acc);
    if (rage) inst.phases.enrageAtkPm = Number(rage);
    if (arg('guard', null)) inst.phases.guardPm = Number(arg('guard', null));
  }
  for (const m of [addOf(call, ENGINE_MONSTERS), addOf(call, play.MONSTERS)]) {
    if (addhp) m.hp = Number(addhp);
    if (addatk) m.atk = Number(addatk);
    if (addacc) m.baseAcc = Number(addacc);
    if (addlvl) m.level = Number(addlvl);
  }
  const row = ENGINE_MONSTERS[call.monster];
  console.log('\n' + call.id + ' (HP ' + row.hp + ', atk ' + row.atk + ', Level ' + row.level + ', a fight ' + call.fight.fee + ' gp and ' + call.fight.staminaMs / 60000 + ' min of stamina)');
  console.log('win%  kill(s)  dead time  food/head  low HP%   party');
  for (const [label, c] of (RUNS[call.id] || hallRows(Number(arg('level', String(Math.round((HUNT_BAND(call)[0] + HUNT_BAND(call)[1]) / 2))))))) {
    if (process.argv.includes('--cliff') && !CLIFF.test(label)) continue;
    if (process.argv.includes('--ship') && !/^Ship/.test(label)) continue;
    if (process.argv.includes('--focus') && !FOCUS.test(label)) continue;
    if (arg('rows', null) && !new RegExp(arg('rows', '')).test(label)) continue;
    if (TRACE && arg('trace', null) && !label.includes(arg('trace', ''))) continue;
    if (TRACE) console.log(label);
    const r = cell(call, { label, ...c }, seeds);
    rows.push(r);
    console.log(String(r.win).padStart(4) + '  ' + String(r.medianKillS ?? '-').padStart(6) + '  ' + String(r.deaths).padStart(4) + ' ' + String(r.time).padStart(4) + '  ' + String(r.foodPerHead).padStart(9) + '  ' + String(r.lowestHpPct).padStart(6) + '   ' + label + (process.argv.includes('--why') && r.fell ? '   [' + r.fell + ']' : '') + (process.argv.includes('--stats') ? '\n        ' + r.stats : ''));
  }
}
const json = arg('json', null);
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
