// tests/hunt-core/party-tiers.mjs — "ALONE, MELEE AND RANGER HEROES DIE HERE FAST" IS SAID WHERE IT'S TRUE, AND ONLY THERE (lane/d-party-lines,
// 2026-11-15; the board's "Dangerous on the Morrow is a party tier"). Run by run-all.mjs; `--only a,b` plays just those cases and their mutants.
//
// A pack's `partyTiers` (hunt-tiers.js PARTY_TIERS) names the harder tiers a lone Melee or Ranger hero can't hold on that ground at any Level of
// its band, while a party with a Healer can. The Hunts page says so to a hero alone (hunt-list.js tierWords, hunts.tier_party). Since one
// difficulty for every group (Tyler 2026-11-08: "Either they are strong enough to do the harder content or they aren't") a lone hero still walks
// in; the line is so they know before they do.
//
//   words    the page: every ground and every tier it offers, a hero alone reads the line exactly where PARTY_TIERS names the tier, and a
//            party never does; PARTY_TIERS names only grounds that offer the tier.
//   claims   the REAL engine (tools/balance-sim's cell runner, the settle the world tick runs; one seed x 2 h a cell, the ladder kit, the
//            ground's store food). Every ground offering Dangerous: a lone hammer at the TOP of the band. Where Dangerous is named, the
//            hammer and a lone bow there each die at least once an hour (outgrowing the band never makes it a lone Melee's or bow's tier),
//            and a four with a Healer at the FLOOR dies none. Where it isn't, the hammer at the top dies at most once in its 2 h (the
//            lone Melee outgrows Dangerous inside the band, the weight-class rule: Tyler 2026-11-06). Deadly is a four's ceiling on every
//            ground by ruling (Andy 11-06, the sheet's tiers.deadly), so it is judged only where a pack names it.
//
// Measured when written (2 seeds x 2 h): named, at the top of the band the hammer died 46-207 times, the sword 34-213, the bow 14-52 and the
// crossbow 14-33; the four at the floor 0. Unnamed, the hammer at the top 0 on every ground (the bow 0-1). The guard plays the hammer and the
// bow, the cheapest pair that covers both classes the line names.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);

const HOURS = 2;
const FOUR = Object.freeze(['tank', 'healer', 'bow', 'mage']);
/* "die here fast": at least once an hour, alone at the top of the band; "holds": at most one death in the cell */
const FAST_PER_H = 1, HOLDS_MAX = 1;
const bandOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band;
const isOpen = (g) => Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g);
/* a staged ground is played as it ships, with every staged ground at or under its floor (packs ship in road order: party-class-xp-line's rule) */
const gearOf = (g) => (isOpen(g) ? {} : { gear: { openAlso: Object.keys(G.HUNT_GROUNDS).filter((x) => !isOpen(x) && bandOf(x)[0] <= bandOf(g)[0]) } });

const tiersOn = async (root) => import(pathToFileURL(join(root, 'src/data/hunt-tiers.js')).href + V);

/** The words: answers null, or the first place the page and PARTY_TIERS disagree. */
async function words(RUN, root) {
  const T = await tiersOn(root);
  const HL = await import(pathToFileURL(join(root, 'src/shell/hunt-list.js')).href + V);
  const { t } = await import(pathToFileURL(join(root, 'src/render/player-text.js')).href + V);
  const line = t('hunts.tier_party');
  if (!line || line === 'hunts.tier_party') return 'hunts.tier_party has no words';
  for (const [g, tiers] of Object.entries(T.PARTY_TIERS)) for (const id of tiers) if (!T.tiersOf(g).includes(id)) return g + ' names ' + id + ' a party\'s tier, and it does not offer ' + id;
  let named = 0;
  for (const g of Object.keys(G.HUNT_GROUNDS)) for (const id of T.tiersOf(g).filter((x) => x !== T.DEFAULT_TIER)) {
    const want = T.isPartyTier(g, id), alone = HL.tierWords({ hunt: g }, id, 1);
    if (alone.includes(line) !== want) return g + ' ' + id + ', alone: the page reads "' + alone + '"' + (want ? ', with no word that it is a party\'s tier' : ', and it is not named one');
    if (HL.tierWords({ hunt: g }, id, 2).includes(line)) return g + ' ' + id + ': a party is told to bring a party';
    named += want ? 1 : 0;
  }
  return named ? null : 'no ground names a party\'s tier: the words were never read';
}

/** The claims on the engine, on `grounds` (default every ground offering Dangerous). Answers null or the first claim that is false. */
const claims = (grounds) => async (RUN, root) => {
  const T = await tiersOn(root);
  const cell = (g, party, level, tier, tag) => RUN.runCell({ id: 'pt:' + [g, party.join('+'), level, tier, tag].join(':'), ground: g, party, level, hours: HOURS, seeds: 1,
    windowMs: 120000, density: T.tierRowOf(g, tier).pull[party.length - 1] || undefined, options: { tier }, ...gearOf(g) });
  const deaths = (r) => r.heroes.reduce((s, h) => s + h.deaths, 0);
  for (const g of grounds || Object.keys(G.HUNT_GROUNDS)) {
    const [floor, top] = bandOf(g);
    for (const tier of T.tiersOf(g).filter((x) => x !== T.DEFAULT_TIER && (x === 'dangerous' || T.isPartyTier(g, x)))) {
      const hammer = deaths(cell(g, ['hammer'], top, tier, 'top'));
      if (!T.isPartyTier(g, tier)) {
        if (hammer > HOLDS_MAX) return g + ' ' + tier + ': a lone hammer at the top of the band (' + top + ') died ' + hammer + ' times in ' + HOURS + ' h, and the page doesn\'t say it\'s a party\'s tier (its pack\'s partyTiers)';
        continue;
      }
      const bow = deaths(cell(g, ['bow'], top, tier, 'top'));
      if (hammer < FAST_PER_H * HOURS || bow < FAST_PER_H * HOURS) return g + ' ' + tier + ': named a party\'s tier, and alone at the top of the band (' + top + ') a hammer died ' + hammer + ' and a bow ' + bow + ' times in ' + HOURS + ' h (the words say they die fast)';
      const four = cell(g, FOUR, floor, tier, 'floor');
      if (deaths(four) > 0) return g + ' ' + tier + ': named a party\'s tier, and a four with a Healer at the floor (' + floor + ') died ' + deaths(four) + ' times in ' + HOURS + ' h';
    }
  }
  return null;
};

const cases = { words, claims: claims(null) };

const PACK = (g) => 'src/data/grounds/' + g + '/pack.js';
const mutants = [
  /* the data, both ways: a ground whose lone Melee dies at the top loses its word, and one where a lone Melee holds gains it */
  { name: 'Wyvern Roost loses its word: a lone hammer dies at the top and nobody is told', case: 'claims', grounds: ['wyvern_roost'],
    edits: [[PACK('wyvern_roost'), "  partyTiers: ['dangerous'],\n", '']] },
  { name: 'the Slake is named a party\'s tier, where a lone hammer holds at the top', case: 'claims', grounds: ['the_slake'],
    edits: [[PACK('the_slake'), "  bagGuide: { tier: 4,\n    melee: { heal: { id: 'cooked_lobster', qty: 100 } },", "  partyTiers: ['dangerous'],\n  bagGuide: { tier: 4,\n    melee: { heal: { id: 'cooked_lobster', qty: 100 } },"]] },
  /* the party half of the claim: Dangerous twice as hard and a four with a Healer dies at Carter's Rest's floor too */
  { name: 'Dangerous hits twice as hard: a four with a Healer dies at Carter\'s Rest', case: 'claims', grounds: ['carters_rest'],
    edits: [['src/data/balance-sheet.js', 'dangerous: Object.freeze({ pull: 5, lift: 0.8, dmgPm: 1170, hpPm: 1100, xpPm: 1200 }),', 'dangerous: Object.freeze({ pull: 5, lift: 0.8, dmgPm: 2340, hpPm: 1100, xpPm: 1200 }),']] },
  /* the page: the line is never added */
  { name: 'the Hunts page never says it', case: 'words', also: ['src/shell/hunt-list.js', 'src/render'],
    edits: [['src/shell/hunt-list.js', "const alone = size <= 1 && isPartyTier(r.hunt, tier.id) ? [t('hunts.tier_party')] : [];", 'const alone = [];']] },
  { name: 'a party is told it too', case: 'words', also: ['src/shell/hunt-list.js', 'src/render'],
    edits: [['src/shell/hunt-list.js', "const alone = size <= 1 && isPartyTier(r.hunt, tier.id) ? [t('hunts.tier_party')] : [];", "const alone = isPartyTier(r.hunt, tier.id) ? [t('hunts.tier_party')] : [];"]] },
];

const R = makeReport('hunt-core/party-tiers');
const RUN = await loadCellRunner(ROOT);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const k of ONLY || []) R.ok(!!cases[k], '--only names no case ' + k);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = await fn(RUN, ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const PICKED = process.argv.includes('--no-mutate') ? [] : mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures', ...(mu.also || [])]);
  try {
    let why = null;
    const fn = mu.grounds ? claims(mu.grounds) : cases[mu.case];
    try { why = await fn(await loadCellRunner(p.root), p.root); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
