#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-hall-advice.mjs — WHAT A HALL'S CARD SAYS WINS, WINS (the QA audit's F22, 2026-11-15: "The hall's own advice doesn't beat Krell").
//   A player who does exactly what the hall's card says must win most of the time. This reads the card a player reads (boss-halls.js: the food
//   line `storeFloor` and the label lines `bars`), builds the bar and the party those lines describe and nothing else, and plays them on the real
//   settle (tests/hunt-core/fixtures/play-ground.mjs, the world tick's accrueHunt) against the hall's boss.
//
//   node tests/boss-hall-advice.mjs              the guard
//   node tests/boss-hall-advice.mjs --table      every cell's win rate (the designer's read)
//   node tests/boss-hall-advice.mjs --seeds N    more tries a cell (default 40, the boss-call-table.mjs dice: --hall --first --rows "^Size")
//   node tests/boss-hall-advice.mjs --mutate     every planted defect must turn its arm red
//
// mutant-anchors: src/data/grounds/krells_hold/pack.js
//
//   HA-READ  every line on an open hall's card is one this guard can play. A line it can't read is advice nobody measured.
//   HA-WIN   each party the card names wins at least RATE of the tries, on the bar its lines build, in the gear a hero holds BEFORE the boss's
//            first win (his own prize held out: at Krell it is the only tier 7, and the card is read before it), at the Level the line names,
//            or the hall's floor when it names none. "A third hero" is every way to fight (gear.mjs STYLES), so the line is true whoever comes;
//            "two more" is every pair of them.
//   HA-FLOOR the card's food (`storeFloor`) is the floor (lane/c-engine-reds, 2026-11-21): on the next cheaper store food (supply-basics.js
//            heal rows by price) at least one party the card names wins under RATE. A food every party also wins on one step down is a card
//            that bills every hero for food nobody needs and a door that tells a hero holding enough food that it "heals too little": with
//            the spell rule every party won 38 to 40 of 40 on Salted Lobster while the card still asked for Swordfish (432 gold a bite, not
//            180), and HA-WIN could not tell the two cards apart (its Lobster mutant ESCAPED, staging run 44870672285).
//
// THE CARD'S GRAMMAR (label lines, Tyler 2026-11-14 "Recommended: 4+ players"; one form a line):
//   Everyone: Eat under P%                            every food slot under P% HP
//   Healer: <spell> when N are under P%               the healer's slot, N allies under P%
//   Healer: <spell> under P%                          the healer's slot, the lowest ally under P%
//   Party: a tank, a healer and two more              a tank, a healer and every pair of kinds (36), at the hall's floor
//   Party: a tank, a healer and a third hero          a tank, a healer and one more of every kind, at the hall's floor
//   Party: a tank, a healer, a K1 and a K2             that four (K1, K2 gear.mjs STYLES kinds), at the hall's floor
//   Party: a tank and a healer                        the two, at the hall's floor (the card the audit read)
//   Two heroes: Level L or higher                     the tank and the healer alone, at Level L
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT as REPO, plant } from './hunt-core/fixtures/h1.js';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const { PLAY_TREES } = await import(pathToFileURL(join(REPO, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const { loadGear, STYLES } = await import(pathToFileURL(join(REPO, 'tools/balance-sim/gear.mjs')).href);

/* THREE TIMES IN FOUR: a boss may be hard, never a lie. Each plan the card names wins at least this share of its tries (Krell's card, 40 tries
   a cell, after cloth's Magic damage cut (lane/d-mage-110): a tank, a healer and two more 80 to 100% at 85 for every pair; the card's old
   third hero 0% as a tank or a sword alone, and two heroes 0% at every Level up to 120). The seeds are fixed (boss-call-table.mjs secretOf),
   so a cell's rate moves only when the data does. */
const RATE = 0.75;
const argN = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = argN('--seeds', 40);
/* a planted run loads the settle from the planted tree; the gear ladder is the repo's gear.mjs reading the planted tree's data */
const TREES = [...PLAY_TREES, 'tests/hunt-core/fixtures'];

/* the boss-call-table.mjs dice, so a cell here is the same fight as that table's row */
const secretOf = (seed) => {
  let h = 2166136261 >>> 0;
  for (const c of 'bosscall:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
};

export async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const V = sourceQuery(root);
  const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  return {
    play: await loadPlay(root), gear: await loadGear(root),
    BH: await import(u('src/data/boss-halls.js')),
    G: await import(u('src/data/hunt-grounds.js')),
    H: await import(u('src/data/hunts.js')),
    AB: await import(u('src/data/abilities.js')),
    SK: await import(u('src/data/start-kit.js')),
    SP: await import(u('src/data/supplies.js')),
    SB: await import(u('src/data/supply-basics.js')),
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
  };
}

/* ── THE CARD, READ ──────────────────────────────────────────────────────────── */
/** A hall's card as a plan: { eat, slots: { healer: [slot] }, parties: [{ line, party: [style], L }], unread: [the lines it can't play] }. */
export function readCard(X, hall) {
  const floor = X.H.HUNT_INDEX[hall.hunt].band[0];
  const abilityNamed = (n) => Object.values(X.AB.ABILITIES).find((a) => a && a.n === n) || null;
  const plan = { eat: null, slots: {}, parties: [], unread: [] };
  const slot = (role, name, conditions, line) => {
    const a = abilityNamed(name);
    if (!a) { plan.unread.push(line + ' (no spell named ' + name + ')'); return; }
    (plan.slots[role] = plan.slots[role] || []).push({ action: { type: 'ability', id: a.id }, conditions, join: 'and' });
  };
  let m;
  for (const line of hall.bars || []) {
    if ((m = /^Everyone: Eat under (\d+)%$/.exec(line))) plan.eat = Number(m[1]);
    else if ((m = /^Healer: (.+) when (\d+) are under (\d+)%$/.exec(line))) slot('healer', m[1], [{ metric: 'allies_below', op: 'gte', value: Number(m[2]), subject: 'under_' + m[3] }], line);
    else if ((m = /^Healer: (.+) under (\d+)%$/.exec(line))) slot('healer', m[1], [{ metric: 'ally_hp_pct', op: 'lt', value: Number(m[2]), subject: 'lowest' }], line);
    else if (line === 'Party: a tank, a healer and two more') {
      const kinds = Object.keys(STYLES);
      for (let i = 0; i < kinds.length; i++) for (let j = i; j < kinds.length; j++) plan.parties.push({ line, party: ['tank', 'healer', kinds[i], kinds[j]], L: floor });
    }
    else if (line === 'Party: a tank, a healer and a third hero') for (const s of Object.keys(STYLES)) plan.parties.push({ line, party: ['tank', 'healer', s], L: floor });
    /* a named four (lane/tuning-pass, the designer 2026-11-23: at the floor only some fours win, so the card names the one that does) */
    else if ((m = /^Party: a tank, a healer, an? ([a-z]+) and an? ([a-z]+)$/.exec(line)) && STYLES[m[1]] && STYLES[m[2]]) plan.parties.push({ line, party: ['tank', 'healer', m[1], m[2]], L: floor });
    else if (line === 'Party: a tank and a healer') plan.parties.push({ line, party: ['tank', 'healer'], L: floor });
    else if ((m = /^Two heroes: Level (\d+) or higher$/.exec(line))) plan.parties.push({ line, party: ['tank', 'healer'], L: Number(m[1]) });
    else plan.unread.push(line);
  }
  if (!plan.parties.length) plan.unread.push('(no party line: the card names nobody to bring)');
  return plan;
}

/** Each hero's bar: the card's slots for its role, then the start bar's three slots on the card's food (`storeFloor`), eating at its line. */
function barOf(X, hall, plan, role) {
  const guide = X.SP.BAG_GUIDE_BY_HUNT[hall.id];
  const cooked = (X.SB.BASIC_SUPPLIES.find((b) => b.id === hall.storeFloor) || {}).partner;
  const drink = guide ? (X.SB.BASIC_SUPPLIES.find((b) => b.kind === 'mana' && b.partner === guide.magic.mana.id) || {}).id : null;
  const item = { d_food: cooked, d_food_store: hall.storeFloor, ...(drink ? { d_drink: drink } : {}) };
  const food = X.SK.START_BAR.map((x) => {
    const y = JSON.parse(JSON.stringify(x));
    if (item[y.id]) y.action.id = item[y.id];
    if (Number.isInteger(plan.eat) && y.conditions[0].metric === 'self_hp_pct') y.conditions[0].value = plan.eat;
    return y;
  });
  return [...(plan.slots[role] || []).map((s) => JSON.parse(JSON.stringify(s))), ...food];
}

/* ── ONE FIGHT ──────────────────────────────────────────────────────────────── */
/** One try to its end: 'felled', 'death', 'time' or 'other'. */
export function fightOnce(X, hall, plan, party, L, seed) {
  const ground = X.G.HALL_GROUNDS[hall.hunt];
  /* THE GEAR AT HIS FIRST WIN: the ladder at L (gear.mjs kitOf), every staged ground's drops counted, his own prize held out */
  const staged = Object.keys(X.G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(X.G.OPEN_GROUNDS, g));
  const prize = (X.EM[X.BH.hallBossOf(ground)].drops || []).map((d) => d.id);
  const kits = party.map((s) => X.gear.kitOf(s, L, { openAlso: staged, exclude: prize }));
  const roles = party.map((s) => STYLES[s].role);
  let how = 'other';
  X.play.run(hall.hunt, L, roles, {
    ground, spanMs: X.BH.BOSS_HALL_RULES.limitMs + 30000, windowMs: 60000, secret: secretOf(seed), leaveTogether: true,
    equipment: (role, i) => kits[i], bar: (role) => barOf(X, hall, plan, role),
    bag: (role, i) => (kits[i].ammo === 'bronze_arrows' ? { bronze_arrows: { loaded: 1 } } : {}),
    onWindow: (o) => {
      for (const p of o.members) {
        const r = p.hunt.ended && p.hunt.ended.reason;
        if (r === 'boss_felled') how = 'felled';
        else if (r === 'boss_time' && how !== 'felled') how = 'time';
        else if ((r === 'died' || r === 'party_member_died') && how === 'other') how = 'death';
      }
    },
  });
  return how;
}

/* ── THE GUARD ──────────────────────────────────────────────────────────────── */
async function guard(root, o = {}) {
  const X = await loadAll(root);
  const bad = [];
  const halls = Object.values(X.BH.OPEN_BOSS_HALLS).filter((h) => (h.bars || []).length);
  if (!halls.length) return ['HA-READ no open hall has a card to check (Krell\'s Hall reads none)'];
  for (const hall of halls) {
    const plan = readCard(X, hall);
    for (const line of plan.unread) bad.push('HA-READ ' + hall.id + '\'s card says "' + line + '", a line this guard can\'t play');
    if (plan.unread.length) continue;
    for (const c of plan.parties) {
      const ends = { felled: 0, death: 0, time: 0, other: 0 };
      for (let s = 0; s < SEEDS; s++) {
        ends[fightOnce(X, hall, plan, c.party, c.L, s)] += 1;
        /* a mutant run stops a cell once it can no longer reach the rate, or has reached it */
        if (o.failFast && (SEEDS - (s + 1) + ends.felled < RATE * SEEDS || ends.felled >= RATE * SEEDS)) break;
      }
      const tries = ends.felled + ends.death + ends.time + ends.other;
      const words = c.party.join(' + ') + ' at Level ' + c.L + ': ' + ends.felled + ' of ' + tries + ' won (' + ends.death + ' died, ' + ends.time + ' out of time)';
      if (o.table) console.log('  ' + hall.id + ' | ' + c.line + ' | ' + words);
      if (ends.felled < RATE * SEEDS) bad.push('HA-WIN ' + hall.id + '\'s card says "' + c.line + '" and ' + words + ', under ' + Math.round(RATE * 100) + '%');
      if (o.failFast && bad.length) return bad;
    }
    if (!bad.some((b) => b.startsWith('HA-WIN ' + hall.id + '\''))) bad.push(...floorFails(X, hall, plan, o));
    if (o.failFast && bad.length) return bad;
  }
  return bad;
}

/** HA-FLOOR: one store food cheaper than the card's, some party the card names loses (under RATE). Each cell stops once it has lost (the
    floor holds: done) or has won; red when every party wins on the cheaper food. */
function floorFails(X, hall, plan, o = {}) {
  if (!hall.storeFloor) return [];
  const foods = X.SB.BASIC_SUPPLIES.filter((b) => b.kind === 'heal' && Number.isFinite(b.price)).sort((a, b) => a.price - b.price);
  const at = foods.findIndex((b) => b.id === hall.storeFloor);
  if (at <= 0) return [];
  const cheaper = foods[at - 1], down = { ...hall, storeFloor: cheaper.id };
  let worst = null;
  for (const c of plan.parties) {
    let felled = 0, s = 0;
    for (; s < SEEDS; s++) {
      if (fightOnce(X, down, plan, c.party, c.L, s) === 'felled') felled += 1;
      if (SEEDS - (s + 1) + felled < RATE * SEEDS) {
        if (o.table) console.log('  ' + hall.id + ' | HA-FLOOR on ' + cheaper.n + ' | ' + c.party.join(' + ') + ' at Level ' + c.L + ' loses: ' + felled + ' of ' + (s + 1) + ' won');
        return [];
      }
      if (felled >= RATE * SEEDS) break;
    }
    if (!worst || felled / (s + 1) < worst.share) worst = { share: felled / (s + 1), words: c.party.join(' + ') + ' ' + felled + ' of ' + (s + 1) };
  }
  const name = (id) => (foods.find((b) => b.id === id) || { n: id }).n;
  return ['HA-FLOOR ' + hall.id + '\'s card asks for ' + name(hall.storeFloor) + ', and every party it names also wins on ' + cheaper.n + ' (the weakest '
    + (worst ? worst.words : '-') + '): the card bills every hero for food nobody needs'];
}

/* ── THE PROOF ──────────────────────────────────────────────────────────────── */
const PACK = 'src/data/grounds/krells_hold/pack.js';
const LINES = "'Party: a tank, a healer, a hammer and a mage'] },";
const MUTANTS = [
  /* the card the audit read (F22): a tank and a healer, nothing about a third */
  { name: 'the card says a tank and a healer (the audit\'s card)', edits: [[PACK, LINES, "'Party: a tank and a healer'] },"]], want: /HA-WIN krells_hold's card says "Party: a tank and a healer" and tank \+ healer at Level 85/ },
  /* the card before the tuning pass (lane/tuning-pass): at 85 only some pairs win (krell-after.txt: other damage pairs 40 to 63%, a third tank 5%) */
  { name: 'the card says a tank, a healer and two more (red at 85)', edits: [[PACK, LINES, "'Party: a tank, a healer and two more'] },"]], want: /HA-WIN krells_hold's card says "Party: a tank, a healer and two more"/ },
  { name: 'a party line nobody measured', edits: [[PACK, LINES, "'Party: four mages'] },"]], want: /HA-READ krells_hold's card says "Party: four mages"/ },
  /* the card F22 shipped, true until cloth's Magic damage cut (lane/d-mage-110): a third tank or a sword alone runs out of time at 85 */
  { name: 'the card asks for a third hero (the F22 card)', edits: [[PACK, LINES, "'Party: a tank, a healer and a third hero'] },"]], want: /HA-WIN krells_hold's card says "Party: a tank, a healer and a third hero" and tank \+ healer \+ tank at Level 85/ },
  { name: 'two heroes from Level 106 (the F22 card)', edits: [[PACK, LINES, "'Two heroes: Level 106 or higher', 'Party: a tank, a healer, a hammer and a mage'] },"]], want: /HA-WIN krells_hold's card says "Two heroes: Level 106 or higher" and tank \+ healer at Level 106/ },
  /* the line the first fix shipped: measured in Krell's own tier 7, which nobody wears before his first win */
  { name: 'two heroes from Level 88', edits: [[PACK, LINES, "'Two heroes: Level 88 or higher', 'Party: a tank, a healer, a hammer and a mage'] },"]], want: /HA-WIN krells_hold's card says "Two heroes: Level 88 or higher" and tank \+ healer at Level 88/ },
  /* THE FOOD IS THE FLOOR (HA-FLOOR, lane/c-engine-reds): the card before the spell rule, Swordfish, where every party wins on Lobster. This
     was the "Salted Lobster" mutant that ESCAPED HA-WIN (staging run 44870672285); its twin "the first fix's card (Salted Lobster, two heroes
     from 88)" is retired with it: on the Lobster card it is the "two heroes from Level 88" mutant above. */
  { name: 'the card\'s food is Salted Swordfish (one step dearer than every party needs)', edits: [[PACK, "storeFloor: 'salted_lobster',", "storeFloor: 'salted_swordfish',"]], want: /HA-FLOOR krells_hold's card asks for Salted Swordfish, and every party it names also wins on Salted Lobster/ },
  /* one step under the floor: deaths under his enrage */
  { name: 'the card\'s food is Salted Trout', edits: [[PACK, "storeFloor: 'salted_lobster',", "storeFloor: 'salted_trout',"]], want: /HA-WIN krells_hold's card says "Party: a tank, a healer, a hammer and a mage"/ },
  { name: 'everyone eats at 40%', edits: [[PACK, "bars: ['Everyone: Eat under 75%',", "bars: ['Everyone: Eat under 40%',"]], want: /HA-WIN/ },
  { name: 'the card\'s food is the start bar\'s Salted Shrimp', edits: [[PACK, "storeFloor: 'salted_lobster',", "storeFloor: 'salted_shrimp',"]], want: /HA-WIN/ },
  /* HIS HEALTH IS THE HALL KIND'S LEVER since the hall's switch (lane/hall-formula: src/core/hunt/hall-formula.js; his row's hand `hp` is read
     only with the switch off): half as much again */
  { name: 'Krell at half as much health again', edits: [['src/data/bosses.js', "hall: Object.freeze({ role: 'elite', hpPpm: ", "hall: Object.freeze({ role: 'elite', hpPpm: 1.5 * "]], want: /HA-WIN/ },
  { name: 'a healer line naming no spell', edits: [[PACK, "'Healer: Greater Mend under 85%'", "'Healer: Great Mend under 85%'"]], want: /HA-READ .*no spell named Great Mend/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await guard(REPO, { failFast: true });
      console.log('boss-hall-advice --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const { root, done } = plant(m.edits, TREES);
      let got = [];
      try { got = await guard(root, { failFast: true }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      finally { done(); }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'boss-hall-advice --mutate: ' + escaped + ' ESCAPED' : 'boss-hall-advice --mutate: ' + list.length + '/' + list.length + ' caught');
    process.exit(escaped ? 1 : 0);
  }
  const t0 = Date.now();
  const bad = await guard(REPO, { table: process.argv.includes('--table') });
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-hall-advice: ' + bad.length + ' FAILED' : 'boss-hall-advice: green (every line on the card read, every party it names wins ' + Math.round(RATE * 100) + '%+ of ' + SEEDS + ' in the gear before his first win, and its food is the floor: a party loses one step cheaper, ' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
