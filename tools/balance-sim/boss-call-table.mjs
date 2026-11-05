#!/usr/bin/env node
// tools/balance-sim/boss-call-table.mjs — CALL OUT, MEASURED ON THE REAL SETTLE (Tyler 2026-11-04; src/data/boss-calls.js).
//
//   node tools/balance-sim/boss-call-table.mjs [--seeds 12] [--only rat|chief] [--json OUT] [--hp 1500 --atk 21] [--monster id]
//
// Each cell plays the called room to its end through accrueHunt (tests/hunt-core/fixtures/play-ground.mjs, the settle
// the world tick runs), a fresh hunt secret per seed, and reads how it ended: the kill, a death or the limit. It plays
// the room as data ships it; --hp and --atk try another row on the same dice (scratch, nothing is written).
//
// THE TARGET (Tyler's RISK AND DEATH ruling): an optimized party can survive it; a careless one dies. "Optimized" here
// is a real choice a player makes: bring a Healer and a tank, wear the ground's own tier, set the right food. "Careless"
// is the same Level with the wrong answer: no Healer, no tank, the starter bar, or several Levels under.
// Output: one line a cell: win rate, median time to kill, deaths per try, the food bill per head, the lowest typical HP.
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { loadGear, STYLES } from './gear.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;

const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
const play = await loadPlay(ROOT);
const gear = await loadGear(ROOT);
const { BUILD } = await import(u('src/build-info.js'));
const v = '?v=' + BUILD.version;
const G = await import(u('src/data/hunt-grounds.js'));
const { BOSS_CALLS, BOSS_CALL_RULES } = await import(u('src/data/boss-calls.js'));
const { START_BAR } = await import(u('src/data/start-kit.js'));
const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js'));
const SB = await import(u('src/data/supply-basics.js'));
/* the engine's own module instances (src/core imports src/data with ?v=): a what-if moves the rows the fight reads */
const ENGINE_MONSTERS = (await import(u('src/data/monsters.js') + v)).MONSTERS;
const COND = await import(u('src/core/hunt/conditions.js') + v);

const secretOf = (seed) => {
  let h = 2166136261 >>> 0;
  for (const c of 'bosscall:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
};
const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
/* The ground's guide food and drink on the start bar (play-ground.mjs refBar's shape): a hero who stocked for the ground. */
const guideBar = (from, eatPct) => {
  const g = BAG_GUIDE_BY_HUNT[from];
  const item = g ? { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
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
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = (n, d = 0) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** One try: { how: 'felled' | 'death' | 'time' | 'other', ms, deaths, store, hpMinPct }. */
function tryOnce(call, c, seed) {
  const ground = G.CALLED_GROUNDS[call.hunt];
  const kits = c.party.map((s, i) => (c.gear ? c.gear(s, c.level, i) : gear.kitOf(s, c.level)));
  const roles = c.party.map((s) => STYLES[s].role);
  const bar = (role, seat) => [...((c.spells && c.spells[c.party[seat]]) || []).map(slotOf), ...(c.starter ? starterBar() : guideBar(call.from, c.eatPct))];
  let how = 'other', ms = 0, deaths = 0, store = 0, lowest = 100, dealt = 0, xp = 0, coin = 0, items = 0, lvl = 0;
  const out = play.run(call.hunt, c.level, roles, {
    ground, spanMs: BOSS_CALL_RULES.limitMs + 30000, windowMs: 30000, secret: secretOf(seed), equipment: (role, i) => kits[i],
    bar, leaveTogether: true, ...(c.temper ? { temper: c.temper } : {}),
    bag: (role, i) => (kits[i].ammo === 'bronze_arrows' ? { bronze_arrows: { loaded: 1 } } : {}),
    onWindow: (o) => {
      for (const p of o.members) {
        if (p.hunt.ended) {
          const r = p.hunt.ended.reason;
          if (r === 'boss_felled') how = 'felled'; else if (r === 'boss_time' && how !== 'felled') how = 'time';
          else if ((r === 'died' || r === 'party_member_died') && how === 'other') how = 'death';
          ms = Math.max(ms, Date.parse(p.hunt.ended.at) - Date.UTC(2026, 9, 18, 12, 0, 0));
        }
        deaths += (p.summary.deathLog || []).length;
        xp += Object.values(p.delta.xp || {}).reduce((a, b) => a + b, 0);
        lvl += p.delta.level_xp || 0;
        coin += p.delta.gold || 0;
        items += Object.keys(p.delta.items || {}).length;
        for (const [id, n] of Object.entries(p.hunt.buys || {})) store += n * ((play.basics[id] || {}).price || 0);
        if (p.maxHp && Number.isInteger(p.delta.hp) && !p.hunt.ended) lowest = Math.min(lowest, 100 * p.delta.hp / p.maxHp);
      }
      for (const e of o.events || []) if (e.type === 'dmg' && !e.dot) dealt += 1;
    },
  });
  return { how, ms: ms || out.playedMs, deaths, store: store / roles.length, lowest, paid: xp + lvl + coin + items };
}

function cell(call, c, seeds) {
  const t = [];
  for (let s = 0; s < seeds; s++) t.push(tryOnce(call, c, s));
  const won = t.filter((x) => x.how === 'felled');
  const paid = t.reduce((a, x) => a + x.paid, 0);
  if (paid !== 0) throw new Error('A CALLED FIGHT PAID ' + paid + ' on ' + c.label + ': the money line is broken');
  return {
    call: call.id, label: c.label, level: c.level, seeds,
    win: round((100 * won.length) / seeds), felled: won.length, deaths: t.filter((x) => x.how === 'death').length, time: t.filter((x) => x.how === 'time').length,
    other: t.filter((x) => x.how === 'other').length,
    medianKillS: won.length ? round(median(won.map((x) => x.ms)) / 1000) : null,
    medianEndS: round(median(t.map((x) => x.ms)) / 1000),
    foodPerHead: round(median(t.map((x) => x.store))), lowestHpPct: round(median(t.map((x) => x.lowest))),
  };
}

/* THE CELLS: who walks in, and with what. `gear` absent = the style's best at its Level (gear.mjs); `starter` = the bar a hero who never touched it plays. */
const under = (off) => (s, L) => gear.kitOf(s, L, { tierOffset: off, only: 'all' });
const RUNS = {
  rat_king: [
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

const seeds = Number(arg('seeds', '12'));
const only = arg('only', null);
const hp = arg('hp', null), atk = arg('atk', null), lvl = arg('lvl', null);
const rows = [];
for (const call of Object.values(BOSS_CALLS)) {
  if (only && !call.id.includes(only)) continue;
  for (const inst of [ENGINE_MONSTERS[call.monster], play.MONSTERS[call.monster]]) {
    if (hp) inst.hp = Number(hp);
    if (atk) inst.atk = Number(atk);
    if (lvl) inst.level = Number(lvl);
  }
  const row = ENGINE_MONSTERS[call.monster];
  console.log('\n' + call.id + ' (HP ' + row.hp + ', atk ' + row.atk + ', Level ' + row.level + ', fee ' + call.fee + ')');
  console.log('win%  kill(s)  dead time  food/head  low HP%   party');
  for (const [label, c] of RUNS[call.id]) {
    const r = cell(call, { label, ...c }, seeds);
    rows.push(r);
    console.log(String(r.win).padStart(4) + '  ' + String(r.medianKillS ?? '-').padStart(6) + '  ' + String(r.deaths).padStart(4) + ' ' + String(r.time).padStart(4) + '  ' + String(r.foodPerHead).padStart(9) + '  ' + String(r.lowestHpPct).padStart(6) + '   ' + label);
  }
}
const json = arg('json', null);
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
