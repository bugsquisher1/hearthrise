// tests/hunt-core/tally.mjs — src/core/hunt/tally.js, the analyzer's pure accumulator (spec §3.6; parity AN-01..05).
// Run by run-all.mjs.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite35 } from './fixtures/h35.js';
import { ROOT, plant } from './fixtures/h1.js';

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
  /* A KILL WITH NO DEALER (lane/a-kill-credit-null; balance matrix run 44957840040, cell 1|bis|1:axes|normal). Hero 1's bleed is on a rat
     when its hunt ends and its unit leaves the world (a lone hero's end at a window's first boundary still steps the world once; a party
     member who died or left while the rest hunt on). The bleed ticks the rat dead and damage.js lands it with no dealer (u null). The
     settle tallies every window's events against its members' units (hr-accrue accrue-hunt.js analyzerOf, the one settle every hunt
     runs, viewed or not), and it threw, so that window could never settle. Played on the engine's own status tick, tallied as the settle
     does: nothing throws, no hero is credited the kill, and a kill credited to a unit that is not a hero is still refused. */
  'a-kill-with-no-dealer': async (M) => {
    const { unit, worldOf, ctx35, steps } = await import('./fixtures/h35.js');
    const rat = unit(M, 8, 'mon', { hp: 1, maxHp: 10 });
    rat.statuses = [{ s: 'bleed', src: 1, left: 6000, next: 100, scale: 1000 }];
    const w = worldOf(M, [unit(M, 2, 'hero'), rat]);
    const sc = ctx35(M, 1);
    steps({ world: w, ground: null, grid: null, occ: null }, sc, 0, 3, M.status.tickStatuses);
    const kill = sc.events.find((e) => e.type === 'kill');
    if (!kill || kill.u !== null || kill.t !== 8) return 'CONTROL: the departed hero\'s bleed did not land a kill with no dealer: ' + JSON.stringify(kill);
    let t;
    try { t = M.tally.tallyEvents(sc.events, { heroes: [2], kinds: M.tally.rosterOf(w).kinds }); } catch (e) { return 'the settle\'s tally refused the window: ' + e.message; }
    if (t.party.kills !== 0 || (t.heroes[2] && t.heroes[2].kills !== 0)) return 'a kill with no dealer was credited: ' + JSON.stringify(t.party);
    try { M.tally.tallyEvents([ev('kill', 1, { u: 7, t: 8 })], ROSTER); return 'a kill credited to unit 7, no hero, was accepted'; } catch { return null; }
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
  /* SUSTAIN IS ASKED FOR (Balance Lab phase 2): the settle asks for none, so its tally is the old one to the byte: the block at zero, and a
     window whose only news is a rule waiting for mana makes no hero (the analyzer would read zeros where it read null). Asked, it counts. */
  'sustain-asked-for-only': (M) => {
    const plain = M.tally.tallyEvents(SUSTAIN_WINDOW, ROSTER);
    const zero = JSON.stringify(M.tally.emptyTally().sustain);
    for (const [id, h] of Object.entries(plain.heroes)) if (JSON.stringify(h.sustain) !== zero) return 'hero ' + id + ' counted sustain unasked: ' + JSON.stringify(h.sustain);
    const wait = [ev('rule_wait', 1, { u: 2, t: 2, rule: 'r1', rule_label: 'mend', why: 'mana' })];
    if (Object.keys(M.tally.tallyEvents(wait, ROSTER).heroes).length) return 'a mana wait made a hero unasked';
    const asked = M.tally.tallyEvents(wait, { ...ROSTER, sustain: true }).heroes[2];
    return asked && asked.sustain.mana.waits === 1 && asked.sustain.waitsBy.mend === 1 ? null : 'asked, a mana wait was not counted: ' + JSON.stringify(asked && asked.sustain);
  },
  /* Every source lands in its own line, on the hero it happened to. */
  'sustain-by-source': (M) => {
    const { heroes, party } = M.tally.tallyEvents(SUSTAIN_WINDOW, { ...ROSTER, sustain: true });
    const a = heroes[1].sustain, b = heroes[2].sustain;
    const checks = [
      ['hero 1 swing', a.takenBy.swing, 2], ['hero 1 spell', a.takenBy.spell, 7], ['hero 1 status', a.takenBy.status, 3],
      ['hero 2 swing', b.takenBy.swing, 6], ['hero 1 ally heal', a.healIn.ally, 9], ['hero 1 food', a.healIn.food, 4], ['hero 2 self heal', b.healIn.self, 5],
      ['hero 2 mana spent', b.mana.spent, 11 + 3], ['hero 2 mana back', b.mana.back, 2], ['hero 1 mana spent', a.mana.spent, 0], ['hero 2 waits', b.mana.waits, 1],
      ['hero 2 waits by', b.waitsBy.mend, 1], ['hero 1 waits (a cooldown is not mana)', a.mana.waits, 0], ['no regen without anchors', a.healIn.regen + b.healIn.regen, 0],
      ['the party', party.sustain.takenBy.swing, 8],
    ];
    const bad = checks.filter(([, got, want]) => got !== want).map(([w, got, want]) => w + ' ' + got + ' != ' + want);
    return bad.length ? bad.join('; ') : null;
  },
  /* REGENERATION closes the window: start 50, lost 2 + 7 + 3, healed 9 + 4, end 60, so 9 came back with no event. A window that does
     not close (end 40: 3 HP vanished) is refused, and a hero with no anchor counts none. */
  'regen-closes-the-window': (M) => {
    const R = { ...ROSTER, sustain: true };
    const one = M.tally.tallyEvents(SUSTAIN_WINDOW, { ...R, hp: { 1: [50, 60] } }).heroes[1].sustain.healIn.regen;
    if (one !== 9) return 'regen ' + one + ', not 9';
    const still = M.tally.tallyEvents([], { ...R, hp: { 2: [70, 75] } }).heroes[2];
    if (!still || still.sustain.healIn.regen !== 5) return 'a quiet window\'s regen ' + JSON.stringify(still && still.sustain.healIn);
    try { M.tally.tallyEvents(SUSTAIN_WINDOW, { ...R, hp: { 1: [50, 40] } }); return 'a window that does not close was counted'; } catch (e) { if (!/moved with no event/.test(e.message)) return 'refused for the wrong reason: ' + e.message; }
    return null;
  },
  /* REGENERATION IS THE ENGINE'S, TO THE HP: a short real hunt (a lone tank at Level 20 who eats from its bar) on the settle the world
     tick runs, each window tallied with its anchors (the unit book's HP at the window's start, the settle's HP at its end, 0 at a death).
     On the tree: no window is refused, and HP came back by food and by regeneration. On a copy whose regeneration also counts what it
     gave (pull-cycle.js tickHeroes, the only place it is given, test-only), every anchored window's regen equals that count exactly. On
     that copy with food that heals silently the count and the tally part, and on a copy whose blows land silently the tally refuses
     the window: the anchors are a check on the engine, never a guess. */
  'regen-is-the-engines': async (M) => {
    const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const playOn = async (root) => {
      const P = await loadPlay(root);
      const sum = M.tally.emptyTally();
      let windows = 0, apart = 0, anchored = 0;
      globalThis.__hrRegen = {};
      P.run('mosslight_glade', 20, ['tank'], { spanMs: 20 * 60000, windowMs: 30000, dropEnded: true, onWindow: (out) => {
        const roster = { heroes: [], kinds: {}, sustain: true, hp: {} };
        for (const [id, u] of Object.entries(out.units || {})) roster.kinds[id] = u[0];
        for (const p of out.members) {
          const id = p.summary && p.summary.unitIdEver;
          if (!Number.isInteger(id)) continue;
          roster.heroes.push(id);
          const from = out.units[id] ? out.units[id][2] : null, died = (p.summary.deathLog || []).length > 0;
          const to = died ? 0 : p.hunt && p.hunt.ended ? null : p.delta.hp;
          if (Number.isInteger(from) && Number.isInteger(to)) roster.hp[id] = [from, to];
        }
        const t = M.tally.tallyEvents(out.events, roster);
        for (const id of Object.keys(roster.hp)) { anchored++; if (t.heroes[id].sustain.healIn.regen !== (globalThis.__hrRegen[id] || 0)) apart++; }
        globalThis.__hrRegen = {};
        M.tally.addTally(sum, t.party);
        windows++;
      } });
      return { sum, windows, apart, anchored };
    };
    const real = await playOn(M.root);
    const s = real.sum.sustain;
    if (real.windows < 10) return 'CONTROL: the hunt played ' + real.windows + ' windows';
    if (!(s.takenBy.swing > 0 && s.healIn.regen > 0 && s.healIn.food > 0)) return 'CONTROL: the hunt did not lose HP, eat and regenerate: ' + JSON.stringify(s);
    if (M.root !== ROOT) return null;
    const COUNT = ['src/core/hunt/pull-cycle.js', '    h.hp = Math.min(h.maxHp, h.hp + whole);',
      '    { const was = h.hp; h.hp = Math.min(h.maxHp, h.hp + whole); const g = globalThis.__hrRegen || (globalThis.__hrRegen = {}); g[h.id] = (g[h.id] || 0) + h.hp - was; }'];
    const SILENT_FOOD = ['src/core/hunt/consumables.js', "  if (landed > 0) sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: u.id, amount: landed, item: String(item || 'food') }));", '  void landed; void item; void sc;'];
    const SILENT_BLOW = ['src/core/hunt/damage.js', "  sc.emit(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,", "  (target.side === 'hero' ? () => {} : sc.emit)(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,"];
    const on = async (edits) => { const p = plant(edits, PLAY_TREES); try { return await playOn(p.root); } finally { p.done(); } };
    const counted = await on([COUNT]);
    if (!(counted.anchored > 10) || counted.apart) return 'regen read off the anchors parts from the regen the engine gave in ' + counted.apart + ' of ' + counted.anchored + ' windows';
    const food = await on([COUNT, SILENT_FOOD]);
    if (!food.apart) return 'a food heal with no event read as regeneration and nothing parted';
    try { await on([SILENT_BLOW]); return 'a blow with no event was let through'; } catch (e) { return /moved with no event/.test(e.message) ? null : 'the silent blow was refused for the wrong reason: ' + e.message; }
  },
};
/* THE SUSTAIN WINDOW: hero 1 (a knight) takes a rat's swing, a slime's spell and a bleed tick, is healed by hero 2 and eats; hero 2 heals itself,
   casts for 11 net with 2 back, shoots a mana shot of 3, waits once for mana and once for a cooldown (no mana wait) */
const SUSTAIN_WINDOW = [
  ev('dmg', 100, { u: 8, t: 1, amount: 2, ability: 'basic' }),
  ev('dmg', 110, { u: 9, t: 1, amount: 7, ability: 'slime_spit', element: 'poison' }),
  ev('dmg', 120, { u: 8, t: 1, amount: 3, ability: 'bleed', dot: true }),
  ev('dmg', 130, { u: 9, t: 2, amount: 6 }),
  ev('dmg', 140, { u: 1, t: 8, amount: 5 }),
  ev('heal', 200, { u: 2, t: 1, amount: 9, ability: 'mend' }),
  ev('heal', 210, { u: 1, t: 1, amount: 4, item: 'wheat_bread' }),
  ev('heal', 220, { u: 2, t: 2, amount: 5, ability: 'mend' }),
  ev('cast', 300, { u: 2, ability: 'storm', mana: 11, back: 2 }),
  ev('shot', 310, { u: 2, t: 8, item: '', rule: 'r2', mana: 3 }),
  ev('rule_wait', 320, { u: 2, t: 2, rule: 'r1', rule_label: 'mend', why: 'mana' }),
  ev('rule_wait', 330, { u: 1, t: 1, rule: 'r3', rule_label: 'bash', why: 'cooldown' }),
];

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
  { name: 'a kill with no dealer is refused (the settle throws)', case: 'a-kill-with-no-dealer',
    edits: [['src/core/hunt/tally.js', '        if (ev.u === null) break;\n', '']] },
  { name: 'a kill with no dealer and a stranger\'s pass alike', case: 'a-kill-with-no-dealer',
    edits: [['src/core/hunt/tally.js', '        if (ev.u === null) break;\n', '        if (!ids.has(ev.u)) break;\n']] },
  { name: 'a stranger is credited', case: 'refuses-what-it-cannot-place',
    edits: [['src/core/hunt/tally.js', "    if (!ids.has(id)) throw new Error(", "    if (false) throw new Error("]] },
  { name: 'sustain is counted unasked (the settle\'s analyzer moves)', case: 'sustain-asked-for-only',
    edits: [['src/core/hunt/tally.js', 'const sus = !!(roster && roster.sustain === true);', 'const sus = !!roster;']] },
  { name: 'a monster\'s spell is booked as a swing', case: 'sustain-by-source',
    edits: [['src/core/hunt/tally.js', "(ev.ability || 'basic') === 'basic' ? 'swing' : 'spell'", "'swing'"]] },
  { name: 'an ally\'s heal is booked as the hero\'s own', case: 'sustain-by-source',
    edits: [['src/core/hunt/tally.js', "ev.u === ev.t ? 'self' : 'ally'", "'self'"]] },
  { name: 'a cooldown wait is a mana wait', case: 'sustain-by-source',
    edits: [['src/core/hunt/tally.js', "if (ev.why === 'mana' && ids.has(ev.u))", 'if (ids.has(ev.u))']] },
  { name: 'regeneration forgets the heals', case: 'regen-closes-the-window',
    edits: [['src/core/hunt/tally.js', 'const regen = pair[1] - pair[0] - healIn + lost;', 'const regen = pair[1] - pair[0] + lost;']] },
  { name: 'a window that does not close is let through', case: 'regen-closes-the-window',
    edits: [['src/core/hunt/tally.js', "    if (regen < 0) throw new Error(", "    if (false) throw new Error("]] },
];

await suite35('hunt-core/tally', cases, mutants);
