#!/usr/bin/env node
// tools/balance-program/redesign/halls/hall-bench.mjs — A HALL'S WIN RATE, MEASURED ON THE REAL SETTLE (lane/hall-formula, 2026-11-23;
// docs/design/redesign/02-architecture.md package 7: "Halls. Boss rooms for four or for eight, built as bar checks").
//
//   node tools/balance-program/redesign/halls/hall-bench.mjs [--hall krells_hold] [--levels 85,98,110] [--seeds 20] [--rows REGEX]
//        [--formula on] [--json OUT] [--txt OUT]
//
// Every cell plays the hall's room to its end through accrueHunt (tests/hunt-core/fixtures/play-ground.mjs, the settle the world tick runs,
// viewed or not: one engine), a fresh hunt secret a seed, and reads how it ended: his kill, a death (a death ends the fight for everyone)
// or the limit. Output: one line a cell: win %, median seconds to his kill, hero deaths a try, tries that ran out of time.
//
// WHO WALKS IN (the bar check's axes, 02 package 7 and 04 section 6 "four damage dealers lose to the pressure, and a tank with two healers
// loses to the ramp"):
//   size     1 to 4 heroes on the hall card's bar (the door's bar: every role's default moves, eating at 75%, the healer's two heals, the
//            card's store food; boss-call-table.mjs BARS.door), in the gear a hero holds BEFORE his first win (the boss's own prize held
//            out of every kit, every staged ground's gear in reach: the region's own tier)
//   gear     the four one gear tier under
//   bar      the four on an untouched bar (default moves, the ground's guide food, eating at 60%)
//   lineup   four damage dealers (no tank, no healer); a tank and two healers
// RISK: a hall stands on no Danger step (a hall row is not on the scale: src/core/hunt/danger.js dangerOn), so a stance moves nothing in it;
// the risk a party takes there is its lineup and its bar, both read above.
//
// THE SWITCH: the hall's own (src/data/boss-halls.js `formula`, src/core/hunt/hall-formula.js). `--formula on` plays the formula rows with the
// data switch off (the harness writes hallRow over the engine's rows: scratch, nothing is written), so a hall can be read both ways before
// its switch moves.
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const { loadGear, STYLES } = await import(u('tools/balance-sim/gear.mjs'));
const { sourceQuery } = await import(u('tools/lib/version-stamp.mjs'));
const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
const play = await loadPlay(ROOT);
const gear = await loadGear(ROOT);
const v = sourceQuery(ROOT);
const G = await import(u('src/data/hunt-grounds.js') + v);
const { BOSS_HALLS, BOSS_HALL_RULES, hallBossOf } = await import(u('src/data/boss-halls.js') + v);
const { START_BAR } = await import(u('src/data/start-kit.js') + v);
const SB = await import(u('src/data/supply-basics.js') + v);
const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js') + v);
const COND = await import(u('src/core/hunt/conditions.js') + v);
const HF = await import(u('src/core/hunt/hall-formula.js') + v);
const ENGINE_MONSTERS = (await import(u('src/data/monsters.js') + v)).MONSTERS;

const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const HALL = arg('hall', 'krells_hold');
const hall = BOSS_HALLS[HALL];
if (!hall) throw new Error('hall-bench: no hall ' + HALL + ' (src/data/boss-halls.js BOSS_HALLS)');
const ground = G.HALL_GROUNDS[hall.hunt];
const BOSS = hallBossOf(ground);
const ROOM = [...new Set([BOSS, ...ground.pockets.flatMap((p) => (p.adds || []).map((a) => a.monster))])];
const STAGED = Object.keys(G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g));
const PRIZE = (ENGINE_MONSTERS[BOSS].drops || []).map((d) => d.id);

/* --formula on: the formula rows over the engine's own (and the fixture's, if another instance), the hall's switch as if on */
const FORCED = arg('formula', null) === 'on';
if (FORCED) for (const cat of new Set([ENGINE_MONSTERS, play.MONSTERS])) for (const id of ROOM) {
  const d = HF.hallRow(cat[id], hall.hunt);
  if (d) Object.assign(cat[id], { hp: d.hp, atk: d.atk, aim: d.aim, evasion: d.evasion, def: d.def });
}
const switchOn = FORCED || HF.hallFormulaOn(hall.hunt);
/* the rows the fight reads (the engine's one door: a switch on is the hall table) */
const rowOf = (id) => (HF.hallFormulaOn(hall.hunt) ? HF.hallRow(ENGINE_MONSTERS[id], hall.hunt) || ENGINE_MONSTERS[id] : ENGINE_MONSTERS[id]);

/* THE DOOR'S BAR (tools/balance-sim/boss-call-table.mjs BARS.door, the same slots): what a party builds from the hall card alone */
const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
const STORE_RUNE = { greater_mend: 'plain_water_rune', circle_of_renewal: 'plain_water_rune' };
const slot = (id, when) => ({ action: { type: 'ability', id, ...(STORE_RUNE[id] ? { store: STORE_RUNE[id] } : {}) }, conditions: when || COND.suggestedConditions({ type: 'ability', id }), join: 'and' });
const guide = BAG_GUIDE_BY_HUNT[hall.id];
const doorBar = (style) => {
  const food = { ...(guide ? { d_food: guide.melee.heal.id, d_food_store: storeOf('heal', guide.melee.heal.id), d_drink: storeOf('mana', guide.magic.mana.id) } : {}),
    ...(hall.storeFloor ? { d_food: (SB.BASIC_SUPPLIES.find((b) => b.id === hall.storeFloor) || {}).partner, d_food_store: hall.storeFloor } : {}) };
  const base = START_BAR.map((x) => {
    const y = JSON.parse(JSON.stringify(x));
    if (food[y.id]) y.action.id = food[y.id];
    if (y.conditions[0].metric === 'self_hp_pct') y.conditions[0].value = 75;
    return y;
  });
  const heals = style === 'healer' ? [slot('circle_of_renewal', [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_80' }]),
    slot('greater_mend', [{ metric: 'ally_hp_pct', op: 'lt', value: 85, subject: 'lowest' }])] : [];
  return [...heals, ...base];
};

const secretOf = (seed) => {
  let h = 2166136261 >>> 0;
  for (const c of 'hallbench:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** One try: { how: 'felled' | 'death' | 'time' | 'other', ms, deaths }. */
function tryOnce(c, L, seed) {
  const kits = c.party.map((s) => gear.kitOf(s, L, { openAlso: STAGED, exclude: PRIZE, ...(c.under ? { tierOffset: -1, only: 'all' } : {}) }));
  const roles = c.party.map((s) => STYLES[s].role);
  let how = 'other', ms = 0, deaths = 0;
  const out = play.run(hall.hunt, L, roles, {
    ground, spanMs: BOSS_HALL_RULES.limitMs + 30000, windowMs: 30000, secret: secretOf(seed), equipment: (role, i) => kits[i], leaveTogether: true,
    ...(c.door ? { bar: (role, i) => doorBar(c.party[i]) } : {}),
    bag: (role, i) => (kits[i].ammo === 'bronze_arrows' ? { bronze_arrows: { loaded: 1 } } : {}),
    onWindow: (o) => {
      for (const p of o.members) {
        if (p.hunt.ended) {
          const r = p.hunt.ended.reason;
          if (r === 'boss_felled') how = 'felled'; else if (r === 'boss_time' && how !== 'felled') how = 'time';
          else if ((r === 'died' || r === 'party_member_died') && how === 'other') how = 'death';
          ms = Math.max(ms, Date.parse(p.hunt.ended.at) - T0);
        }
        deaths += (p.summary.deathLog || []).length;
      }
    },
  });
  return { how, ms: ms || out.playedMs, deaths };
}

const ROWS = [
  ['1 tank', { party: ['tank'], door: true }],
  ['2 tank+healer', { party: ['tank', 'healer'], door: true }],
  ['3 tank+healer+hammer', { party: ['tank', 'healer', 'hammer'], door: true }],
  ['4 tank+healer+hammer+mage', { party: ['tank', 'healer', 'hammer', 'mage'], door: true }],
  ['4 tank+healer+bow+axes', { party: ['tank', 'healer', 'bow', 'axes'], door: true }],
  /* the card's weakest four on the hand rows' floor read (tests/boss-hall-advice.mjs HA-WIN plays every pair of the eight kinds) */
  ['4 tank+healer+bow+bow', { party: ['tank', 'healer', 'bow', 'bow'], door: true }],
  ['4 one gear tier under',{ party: ['tank', 'healer', 'hammer', 'mage'], door: true, under: true }],
  ['4 untouched bar', { party: ['tank', 'healer', 'hammer', 'mage'] }],
  ['4 four dps, no tank or healer', { party: ['hammer', 'axes', 'bow', 'mage'], door: true }],
  ['3 tank+two healers', { party: ['tank', 'healer', 'healer'], door: true }],
];
const LEVELS = arg('levels', '85,98,110').split(',').map(Number);
const SEEDS = Number(arg('seeds', '20'));
const only = arg('rows', null);
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const row = (id) => { const r = rowOf(id); return id + ' L' + r.level + ' HP ' + r.hp + ' atk ' + r.atk + ' aim ' + r.aim + ' eva ' + r.evasion + ' def ' + r.def; };
say(HALL + ' (' + hall.hunt + '), switch ' + (switchOn ? 'ON' : 'off') + (FORCED ? ' (forced by --formula on)' : '') + ', ' + SEEDS + ' seeds a cell');
for (const id of ROOM) say('  ' + row(id));
say('Level  win%  kill(s)  deaths/try  timeouts  party');
const cells = [];
for (const L of LEVELS) {
  for (const [label, c] of ROWS) {
    if (only && !new RegExp(only).test(label)) continue;
    const t = [];
    for (let s = 0; s < SEEDS; s++) t.push(tryOnce(c, L, s));
    const won = t.filter((x) => x.how === 'felled');
    const cell = { level: L, label, seeds: SEEDS, win: Math.round((100 * won.length) / SEEDS), killS: won.length ? Math.round(median(won.map((x) => x.ms)) / 1000) : null,
      deathsPerTry: Math.round((100 * t.reduce((a, x) => a + x.deaths, 0)) / SEEDS) / 100, timeouts: t.filter((x) => x.how === 'time').length,
      other: t.filter((x) => x.how === 'other').length };
    cells.push(cell);
    say(String(L).padStart(5) + String(cell.win).padStart(6) + String(cell.killS ?? '-').padStart(9) + String(cell.deathsPerTry).padStart(12) + String(cell.timeouts).padStart(10) + '  ' + label);
  }
}
if (arg('json', null)) writeFileSync(arg('json', null), JSON.stringify({ hall: HALL, switchOn, forced: FORCED, seeds: SEEDS, rows: ROOM.map(row), cells }, null, 1) + '\n');
if (arg('txt', null)) writeFileSync(arg('txt', null), lines.join('\n') + '\n');
