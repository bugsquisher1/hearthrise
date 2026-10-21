// tests/hunt-core/tally.mjs — src/core/hunt/tally.js, the analyzer's pure accumulator (spec §3.6; parity AN-01..05).
// Run by run-all.mjs.
import { suite35 } from './fixtures/h35.js';

/* Heroes 1 and 2; monsters 8 (rat) and 9 (slime). */
const ROSTER = { heroes: [1, 2], kinds: { 1: 'hero', 2: 'hero', 8: 'rat', 9: 'slime' } };
const ev = (type, atMs, f) => Object.assign({ type, atMs }, f);
const WINDOW = [
  ev('dmg', 100, { u: 1, t: 8, amount: 5 }),
  ev('dmg', 200, { u: 1, t: 8, amount: 3, ability: 'rend', element: 'physical' }),
  ev('status_tick', 300, { t: 8, status: 'bleed', amount: 2, element: 'physical' }),
  ev('dmg', 300, { u: 1, t: 8, amount: 2, ability: 'bleed', element: 'physical' }),
  ev('dmg', 400, { u: 2, t: 9, amount: 4, ability: 'firebolt', element: 'ember' }),
  ev('dmg', 500, { u: 8, t: 1, amount: 2 }),
  ev('dmg', 600, { u: 9, t: 2, amount: 6, element: 'poison' }),
  ev('kill', 700, { u: 1, t: 8, gold: 7, loot: { rat_tail: 1, bones: 2 } }),
  ev('xp', 700, { u: 1, amount: 10, raw: 5 }),
  ev('xp', 700, { u: 2, amount: 5 }),
  ev('xp', 800, { u: 2, amount: 15, skill: 'magic' }),
  ev('eat', 900, { u: 1, item: 'wheat_bread', source: 'own', gold: 3 }),
  ev('drink', 900, { u: 2, item: 'tea', source: 'store', gold: 5 }),
  ev('cast', 950, { u: 1, ability: 'rend', supply: 'life_rune', source: 'store', gold: 12 }),
  ev('cast', 960, { u: 2, ability: 'firebolt' }),
  ev('heal', 990, { u: 2, t: 1, amount: 9, ability: 'mend' }),
  ev('kill', 999, { u: 9, t: 2 }),
];

const cases = {
  /* AN-01: every field the analyzer reads exists, at zero. */
  fields: (M) => {
    const t = M.tally.emptyTally();
    const want = ['kills', 'deaths', 'xp', 'rawXp', 'magicXp', 'gold', 'loot', 'supplies', 'dealt', 'taken', 'healed'];
    const miss = want.filter((k) => !(k in t));
    if (miss.length) return 'missing ' + miss;
    return JSON.stringify(M.tally.tallyEvents([])) === '{"heroes":{},"party":' + JSON.stringify(t) + '}' ? null : 'an empty window is not empty';
  },
  /* AN-01/04/05: each event credits exactly what it says, to whom it says. */
  'tally-sums-match-events': (M) => {
    const { heroes } = M.tally.tallyEvents(WINDOW, ROSTER);
    const a = heroes[1]; const b = heroes[2];
    const checks = [
      [a.dealt.total, 10], [a.dealt.byAbility.basic, 5], [a.dealt.byAbility.rend, 3], [a.dealt.byAbility.bleed, 2],
      [a.dealt.byElement.physical, 10], [b.dealt.byElement.ember, 4], [a.taken.byMonster.rat, 2], [a.taken.byElement.physical, 2],
      [b.taken.byMonster.slime, 6], [b.taken.byElement.poison, 6], [a.kills, 1], [a.gold, 7], [a.loot.bones, 2], [a.loot.rat_tail, 1],
      [a.xp, 10], [a.rawXp, 5], [b.xp, 5], [b.rawXp, 5], [b.magicXp, 15], [b.healed.total, 9], [b.healed.bySource.mend, 9],
      [b.deaths, 1], [b.kills, 0],
    ];
    const bad = checks.map(([got, want], i) => (got === want ? null : '#' + i + ' ' + got + ' != ' + want)).filter(Boolean);
    return bad.length ? bad.join('; ') : null;
  },
  /* AN-02: the party is the sum of its heroes, every field. */
  'party-equals-sum-of-heroes': (M) => {
    const { heroes, party } = M.tally.tallyEvents(WINDOW, ROSTER);
    const sum = M.tally.addTally(M.tally.addTally(M.tally.emptyTally(), heroes[2]), heroes[1]);
    if (JSON.stringify(sortDeep(sum)) !== JSON.stringify(sortDeep(party))) return 'party ' + JSON.stringify(party) + ' is not the heroes summed';
    return party.dealt.total === 14 && party.kills === 1 && party.deaths === 1 && party.xp === 15 ? null : 'party totals ' + JSON.stringify(party.dealt);
  },
  /* AN-03: own stock costs nothing; store lines carry the store gold; a line of unknown origin is refused. */
  'own-supply-costs-zero': (M) => {
    const { heroes, party } = M.tally.tallyEvents(WINDOW, ROSTER);
    const a = heroes[1].supplies; const b = heroes[2].supplies;
    if (a.own.wheat_bread !== 1 || a.storeGold !== 12 || a.store.life_rune !== 1) return 'hero 1 supplies ' + JSON.stringify(a);
    if (b.store.tea !== 1 || b.storeGold !== 5 || Object.keys(b.own).length) return 'hero 2 supplies ' + JSON.stringify(b);
    if (party.supplies.storeGold !== 17) return 'party store gold ' + party.supplies.storeGold;
    try { M.tally.tallyEvents([ev('eat', 1, { u: 1, item: 'wheat_bread' })], ROSTER); return 'a supply line with no source was counted'; } catch { return null; }
  },
  /* A window is never guessed: no roster, or a credit to a unit that is not a hero, is refused. */
  'refuses-what-it-cannot-place': (M) => {
    const tries = [[WINDOW, null], [[ev('kill', 1, { u: 9, t: 8 })], ROSTER], [[ev('xp', 1, { u: 8, amount: 1 })], ROSTER],
      [[ev('dmg', 1, { u: 1, t: 8, amount: 1.5 })], ROSTER]];
    for (const [evs, r] of tries) {
      try { M.tally.tallyEvents(evs, r); return 'accepted ' + JSON.stringify(evs[0]) + ' with roster ' + JSON.stringify(r); } catch { /* refused */ }
    }
    return null;
  },
  /* The accumulator: windows folded one by one equal the whole session at once. */
  'windows-fold-to-the-session': (M) => {
    const whole = M.tally.tallyEvents(WINDOW, ROSTER).party;
    const acc = M.tally.emptyTally();
    for (const [i, j] of [[0, 3], [3, 8], [8, 9], [9, WINDOW.length]]) M.tally.addTally(acc, M.tally.tallyEvents(WINDOW.slice(i, j), ROSTER).party);
    return JSON.stringify(sortDeep(acc)) === JSON.stringify(sortDeep(whole)) ? null : 'folded windows ' + JSON.stringify(acc) + ' != ' + JSON.stringify(whole);
  },
  /* rosterOf reads heroes and monster kinds off the world. */
  'roster-from-world': (M) => {
    const w = M.worldstate.makeWorld({ units: [{ id: 1, side: 'hero', kind: 'hero' }, { id: 8, side: 'mon', kind: 'rat' }] });
    const r = M.tally.rosterOf(w);
    return JSON.stringify(r) === '{"heroes":[1],"kinds":{"1":"hero","8":"rat"}}' ? null : 'roster ' + JSON.stringify(r);
  },
};

function sortDeep(v) {
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
}

const mutants = [
  { name: 'the party is the first hero only', case: 'party-equals-sum-of-heroes',
    edits: [['src/core/hunt/tally.js', 'for (const id of Object.keys(heroes).sort((a, b) => a - b)) addTally(party, heroes[id]);',
      'for (const id of Object.keys(heroes).sort((a, b) => a - b).slice(0, 1)) addTally(party, heroes[id]);']] },
  { name: 'own stock is charged', case: 'own-supply-costs-zero',
    edits: [['src/core/hunt/tally.js', "} else if (ev.source === 'own') {\n          bump(h.supplies.own, item, n);",
      "} else if (ev.source === 'own') {\n          bump(h.supplies.own, item, n); h.supplies.storeGold += ev.gold || 0;"]] },
  { name: 'an unmarked hit is not physical', case: 'tally-sums-match-events',
    edits: [['src/core/hunt/tally.js', "const el = ev.element || 'physical';", "const el = ev.element || 'none';"]] },
  { name: 'a bleed tick is counted twice', case: 'tally-sums-match-events',
    edits: [['src/core/hunt/tally.js', "      case 'heal': {", "      case 'status_tick': { const h = heroOf(1, ev); h.dealt.total += ev.amount; break; }\n      case 'heal': {"]] },
  { name: 'folding overwrites instead of adding', case: 'windows-fold-to-the-session',
    edits: [['src/core/hunt/tally.js', 'else a[k] = (a[k] || 0) + v;', 'else a[k] = v;']] },
  { name: 'a stranger is credited', case: 'refuses-what-it-cannot-place',
    edits: [['src/core/hunt/tally.js', "    if (!ids.has(id)) throw new Error(", "    if (false) throw new Error("]] },
];

await suite35('hunt-core/tally', cases, mutants);
