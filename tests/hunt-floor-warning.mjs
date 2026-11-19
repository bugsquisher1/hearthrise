#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-floor-warning.mjs — A HUNT'S LEVEL FLOOR IS ONLY A WARNING (Tyler 2026-11-04 UTC: any hero may walk into any ground).
//
//   node tests/hunt-floor-warning.mjs             the arms, on the real modules
//   node tests/hunt-floor-warning.mjs --selftest  every planted defect must turn an arm red
//
// ARMS
//   W1  rangeWords: under band[0] says how many Levels under, what it pays, what it risks and what dying costs (first-week-bands.mjs
//       proves the claims on the real engine); FAR under says only a built hero lasts; at or over the floor, or with no level, says nothing
//   W2  the Hunts window draws rangeWords on every line and never disables Enter on it; the first press arms "Enter anyway" and sends
//       nothing, the second goes (one confirm, never more); a successful enter that the server answered below_range repeats the warning
//   W3  CharacterSession hands the server's below_range back to the window
//   W4  the pull size says why a bigger pull matters
//   S1  NOTHING REFUSES A LEVEL: the newest hr_hunt_gate body (2027-02-24-risk-no-level-block.sql) never compares a Level with the floor, and the data has
//       no margin; hr_hunt_enter_for answers below_range from hr_hunt_below_range. The executed proof is that file's own self-check in the chain replay.
//   S2  NOTHING IN THE FIGHT READS IT (Tyler 2026-11-04: "They are just simply harder"): no gap row in the data, no Level in damage.js or combat.js; hunt-core/damage.mjs
//       same-blow-at-any-level plays it. The only reader of a unit's Level is the party's level share (xp-share.js), which Tyler is deciding on separately.
//   G1  the ONE recommendation (src/shell/hunt-list.js recommendedHunt) prefers a ground that suits the group
//       (fitsGroup: a lone hero any ground not built for a party, a party its measured line)
//   G8  a party is sent where it is measured to pay: a four at 16, 25 and 28 to the Glade (no note), a four at 13 and a pair at 15
//       to the Sewer; Wickstead (under alone on every tier) never suits a party; a tie of floors goes to the higher measured line
//   G2  a ground with a hall built for a party (forParty: the Rat King) is a party ground: a lone hero
//       is never recommended one; past every solo band the pick is the nearest solo ground below
//       and the Hunts window says so plainly; a party is recommended by its seats' levels
//   G2b a party ground's card never offers it alone below its measured break-even (designer
//       2026-10-21, CONFLICTS item 2): the Warrens reads "Best with 2 to 4, and alone it pays from Level 45"
//       and every ground reads "Players: 1 to N" (the size the server allows)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELFTEST = process.argv.includes('--selftest');

async function run(base) {
  const red = [];
  const ok = (id, cond, msg) => { if (!cond) red.push(id + ': ' + msg); };
  const read = (p) => readFileSync(join(base, p), 'utf8').replace(/\r\n/g, '\n');
  const HL = await import(pathToFileURL(join(base, 'src/shell/hunt-list.js')).href + '?t=' + Math.random());
  const STEP = await import(pathToFileURL(join(base, 'src/data/hunt-tutorial.js')).href + '?t=' + Math.random());
  const { SESSION_LIMITS, DEATH_XP_LOSS } = await import(pathToFileURL(join(base, 'src/data/hunt-sessions.js')).href + '?t=' + Math.random());
  ok('W1', !('belowRangeRefuse' in SESSION_LIMITS), 'the data still holds a refuse margin: ' + SESSION_LIMITS.belowRangeRefuse);
  const row = { band: [40, 60] };
  /* LABELS, one a line (Tyler 2026-11-14: everything outside lore reads like "Recommended: 4+ players") */
  const lost = 'Death: −' + Math.round(DEATH_XP_LOSS * 100) + '% Level XP';
  const one = HL.rangeWords(row, 39), near = HL.rangeWords(row, 34), far = HL.rangeWords(row, 28), at = HL.rangeWords(row, 40);
  ok('W1', typeof one === 'string' && one.startsWith('1 Level under\n'), 'one Level under reads ' + JSON.stringify(one));
  ok('W1', near === '6 Levels under\n' + HL.ABOVE_LEVEL_WORDS + '\n' + lost && /^Higher risk, better loot$/m.test(near) && !/expect losses/.test(near), 'six Levels under reads ' + JSON.stringify(near));
  ok('W1', typeof far === 'string' && far.startsWith('12 Levels under\n') && /^Much higher risk, better loot$/m.test(far) && far.endsWith(lost), 'twelve Levels under reads ' + JSON.stringify(far));
  ok('W1', ![one, near, far].some((w) => /hit (you )?(far )?harder|\d+% harder/.test(w)), 'the warning claims a penalty: ' + near);
  ok('W1', at === null && HL.rangeWords(row, 70) === null && HL.rangeWords(row, null) === null, 'at / over the floor or with no level must say nothing');
  ok('W1', HL.fitWords(row, 34).tone === 'above' && HL.fitWords(row, 28).tone === 'far', 'the list line reads ' + JSON.stringify([HL.fitWords(row, 34), HL.fitWords(row, 28)]));

  /* G1 (coordinator 10-18): the one recommendation prefers a ground built for the group; a party ground
     stays listed and enterable and tells a lone hero it is best with a party. */
  const rows = HL.huntRows();
  /* Level 12, with the party ground's band widened to start ABOVE the sewer's (10-50): the real Q9 bands
     (thicket 5-15, sewer 5-25, warrens 32-50) leave no level where a party ground out-ranks a solo one by its floor. */
  const wide = rows.map((r) => (r.groupFit === 'party' ? { ...r, band: [10, 50] } : r));
  const solo12 = HL.recommendedHunt(12, 1, wide), party40 = HL.recommendedHunt(40, 3, rows);
  ok('G1', !!solo12 && solo12.groupFit !== 'party' && solo12.band[0] <= 12 && 12 <= solo12.band[1], 'a lone Level-12 hero is recommended ' + (solo12 && solo12.hunt + ' (' + solo12.groupFit + ')'));
  const pg = rows.find((r) => r.groupFit === 'party');
  /* NO GROUND IS SOLO OR PARTY TO THE PLAYER (Tyler 2026-11-08; a ruled contract change): a ground built tough reads like any other. */
  ok('G1', !!pg && HL.heroWords(pg) === 'Players: 1 to ' + pg.heroes && HL.groupWords === undefined, 'a tough ground still labels who it is for: ' + (pg && HL.heroWords(pg)));
  ok('G1', !!party40 && HL.fitsGroup(party40, 3), 'a party of three at 40 is recommended ' + (party40 && party40.hunt));
  /* G2 (Tyler 2026-10-21: "The Sewer is a party hunt"): a ground with a party-only hall is a party ground to
     the advice; a lone hero is never recommended one, at any level; where no solo ground holds the level the
     pick is the nearest solo ground below and the note says so; a party is recommended by its levels. */
  const { HUNT_GROUNDS } = await import(pathToFileURL(join(base, 'src/data/hunt-grounds.js')).href + '?t=' + Math.random());
  /* a STAGED ground (src/data/grounds, status staged: the Muster Barrows) has no row in the list a player reads, so it gives no advice until it opens */
  const halls = Object.values(HUNT_GROUNDS).filter((g) => rows.some((r) => r.hunt === g.hunt) && g.pockets.some((p) => p.forParty)).map((g) => g.hunt);
  ok('G2', halls.length > 0 && halls.every((h) => (rows.find((r) => r.hunt === h) || {}).groupFit === 'party'), 'a ground with a party-only hall is not a party ground to the advice: ' + halls.join(', '));
  const solo15 = HL.recommendedHunt(15, 1, rows);
  ok('G2', !!solo15 && HL.fitsGroup(solo15, 1) && !halls.includes(solo15.hunt), 'a lone Level-15 hero is recommended ' + (solo15 && solo15.hunt));
  const top = Math.max(...rows.map((r) => r.band[1]));
  for (let lv = 1; lv <= top; lv++) {
    const r = HL.recommendation(lv, 1, rows);
    if (!r.row || !HL.fitsGroup(r.row, 1, lv)) { ok('G2', false, 'a lone Level-' + lv + ' hero is recommended ' + (r.row && r.row.hunt)); break; }
    const inBand = r.row.band[0] <= lv && lv <= r.row.band[1];
    /* G7 (Tyler 2026-11-11): "no good hunt" only when NO ground holds the Level; a ground that does (its row reads "In your range") is named right for it */
    const held = rows.filter((g) => g.band[0] <= lv && lv <= g.band[1]).sort((x, y) => y.band[0] - x.band[0])[0];
    const said = held ? held.name + ': right for Level ' + lv + ', tough monsters. Easier: ' + r.row.name + ' (Levels ' + r.row.band[0] + '–' + r.row.band[1] + ')'
      : 'No good hunt for Level ' + lv + ' yet. Nearest below: ' + r.row.name;
    if (!inBand && !(r.row.band[1] < lv && typeof r.note === 'string' && r.note.startsWith(said))) {
      ok('G2', false, 'a lone Level-' + lv + ' hero is sent to ' + r.row.hunt + ' [' + r.row.band + '] with the note ' + JSON.stringify(r.note)); break;
    }
    if (inBand && r.note !== null) { ok('G2', false, 'a fitting ground still carries a note at Level ' + lv); break; }
  }
  const duo = HL.recommendation([12, 20], 2, rows);
  ok('G2', !!duo.row && HL.fitsGroup(duo.row, 2) && duo.row.band[0] <= 12 && 20 <= duo.row.band[1] && duo.note === null, 'a party at Levels 12 and 20 is recommended ' + (duo.row && duo.row.hunt));
  /* G4: where a hero alone's advice stands (level-curve reads it), and a pair's first ground is the Sewer. ALONE TO THE WARRENS FROM ITS soloFrom
     (the board's 2026-11-19 complete balance look, change 8; hunt-grounds.js soloFrom, measured on tools/balance-sim/life.mjs): under it the Glade
     with the note, from it the Warrens with none. A party's advice was re-measured on 2026-11-18 (G8): a pair from 16 goes to the Glade. */
  const lone = (lv) => HL.recommendation(lv, 1, rows);
  const soloAt = (rows.find((r) => r.hunt === 'coppercap_warrens') || {}).soloFrom;
  ok('G4', Number.isInteger(soloAt) && lone(soloAt - 1).row.hunt === 'mosslight_glade' && lone(soloAt - 1).note === 'Coppercap Warrens: right for Level ' + (soloAt - 1) + ', tough monsters. Easier: Mosslight Glade (Levels 16–31)'
    && !/party|one hero|solo/i.test(lone(soloAt - 1).note || ''), 'a lone Level ' + (soloAt - 1) + ' reads ' + JSON.stringify(Number.isInteger(soloAt) && lone(soloAt - 1).note));
  ok('G4', Number.isInteger(soloAt) && [soloAt, 44].every((lv) => lone(lv).row.hunt === 'coppercap_warrens' && lone(lv).note === null),
    'a lone hero from the Warrens\' soloFrom (' + soloAt + ') to 44 is sent to ' + [soloAt, 44].map((lv) => lone(lv).row.hunt + ' ' + JSON.stringify(lone(lv).note)).join(' / '));
  const under = soloAt - 2;
  const lostThere = HL.recommendation(under, 1, rows, { minMs: 600000, grounds: { coppercap_warrens: { solo: { xpH: 9000, balanceH: -1250 }, party: null } } });
  const wonThere = HL.recommendation(under, 1, rows, { minMs: 600000, grounds: { coppercap_warrens: { solo: { xpH: 9000, balanceH: 800 }, party: null } } });
  ok('G7', lostThere.note === 'Coppercap Warrens: right for Level ' + under + ', but lost 1,250 gp/h solo. Easier: Mosslight Glade (Levels 16–31)'
    && (wonThere.note || '').startsWith('Coppercap Warrens: right for Level ' + under + ', tough monsters. ') && !/no good hunt/i.test(lostThere.note + wonThere.note) && (HL.recommendation(top + 5, 1, rows).note || '').startsWith('No good hunt for Level ' + (top + 5) + ' yet. '),
    'a lone Level ' + under + ' reads ' + JSON.stringify([lostThere.note, wonThere.note]));
  const sewerPair = HL.recommendation([12, 12], 2, rows);
  ok('G4', sewerPair.row.hunt === 'millrace_sewer', 'the first party ground moved: a pair at Level 12 is sent to ' + sewerPair.row.hunt);
  /* G4 THE SEWER FROM 5 (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5"): a fresh four or pair at the Thicket's floor is sent below, where a four earns about
     1.6x the same heroes alone in the Thicket; a hero alone at 5 is still sent to the Thicket ("a fresh solo melee should be starting in the thicket", 10-21). */
  for (const [levels, size, want] of [[[5, 5, 5, 5], 4, 'millrace_sewer'], [[5, 5], 2, 'millrace_sewer'], [[7, 6, 5, 5], 4, 'millrace_sewer'], [[5], 1, 'meadowbrook_thicket'], [[4, 4, 4, 4], 4, 'mill_cellar']]) {
    const got = HL.recommendation(levels, size, rows).row.hunt;
    ok('G4', got === want, 'a group of ' + size + ' at ' + levels.join('/') + ' is sent to ' + got + ', wanted ' + want);
  }
  /* G8 A PARTY IS SENT WHERE IT IS MEASURED TO PAY (lane/a-party-advice-glade; lane/d-party-pace's "also seen"): the workbook's groupFit 'solo' on Wickstead and
     the Glade kept a party's advice off them, so a four at 16-25 was sent to the Sewer and at 26-31 below it with a note. A party's fit is now its measured line
     (hunt-list.js fitsGroup). tools/balance-sim/party-advice-table.mjs (real settle, 2 seeds x 0.5 h, every seat at the Level), a head's Level XP an hour for a
     four (tank, Healer, bow, wand): at 16 the Sewer's best tier 52.4k against the Glade's Normal 55.7k, Dangerous 74.1k, Deadly 93.6k; at 25 the Sewer 58.2k
     against 57.8k / 81.3k / 105.5k (no deaths); at 13 the Sewer 42.7k against Wickstead's best 23.1k, so a four from 8 to 15 stays on the Sewer. */
  for (const [lv, size, want] of [[16, 4, 'mosslight_glade'], [25, 4, 'mosslight_glade'], [28, 4, 'mosslight_glade'], [20, 2, 'mosslight_glade'], [13, 4, 'millrace_sewer'], [15, 2, 'millrace_sewer']]) {
    const got = HL.recommendation(Array(size).fill(lv), size, rows);
    ok('G8', !!got.row && got.row.hunt === want && got.note === null, 'a group of ' + size + ' at ' + lv + ' is sent to ' + (got.row && got.row.hunt) + (got.note ? ' (' + got.note + ')' : '') + ', wanted ' + want);
  }
  const gladeRow = rows.find((r) => r.hunt === 'mosslight_glade'), wick = rows.find((r) => r.hunt === 'wickstead');
  ok('G8', !!gladeRow && !!wick && HL.fitsGroup(gladeRow, 4) && !HL.fitsGroup(wick, 4) && HL.fitsGroup(gladeRow, 1) && HL.fitsGroup(wick, 1),
    'a party\'s fit is not its measure (the Glade earns a four over alone on its harder tiers, Wickstead on none; a hero alone fits both): ' + JSON.stringify([gladeRow && gladeRow.partyBest, wick && wick.partyBest]));
  /* two grounds a party suits on one floor: the one it is measured to earn more on, whatever their names (planted rows) */
  const twin = (hunt, name, line) => ({ ...gladeRow, hunt, name, partyBest: { 2: line, 3: line, 4: line } });
  const tie = HL.recommendation([20, 20, 20, 20], 4, [twin('a_low', 'A', 10), twin('b_high', 'B', 40)]);
  ok('G8', !!tie.row && tie.row.hunt === 'b_high', 'on a tie of floors a four is sent to ' + (tie.row && tie.row.hunt) + ', not the higher measured line');
  /* G5 (first principle, played 11-04): the window opens on the harder ground this hero last hunted and came home from; never on one that killed it, and never on one below the advice. */
  const rec22 = HL.recommendation(22, 1, rows);
  const open = (last) => HL.openingPick(rec22, rows, last).hunt;
  ok('G5', open(null) === 'mosslight_glade', 'no hunt yet opens on ' + open(null));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: 'left' }) === 'coppercap_warrens', 'a hero home from the Warrens opens on ' + open({ huntId: 'coppercap_warrens', endReason: 'left' }));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: null }) === 'coppercap_warrens', 'a hero in the Warrens opens on ' + open({ huntId: 'coppercap_warrens', endReason: null }));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: 'died' }) === 'mosslight_glade', 'a hero the Warrens killed opens on ' + open({ huntId: 'coppercap_warrens', endReason: 'died' }));
  ok('G5', open({ huntId: 'wickstead', endReason: 'left' }) === 'mosslight_glade', 'a hero who has outgrown its last ground opens on ' + open({ huntId: 'wickstead', endReason: 'left' }));
  /* G6: the list's two tags, on the advice and the ground above it; a note means the advice's band doesn't hold, so no Fits. */
  /* the lines below are the BASE world's advice (the literal anchor); a ground pack (src/data/grounds) is read without, so a new
     ground above the top can't turn "nothing above" red outside its lane (lane/b-ground-pack phase 2) */
  const { GROUND_PACKS } = await import(pathToFileURL(join(base, 'src/data/grounds/index.js')).href + '?t=' + Math.random());
  const packIds = new Set(GROUND_PACKS.map((p) => p.id));
  const baseRows = rows.filter((r) => !packIds.has(r.hunt));
  const tagged = (lv) => { const rec = HL.recommendation(lv, 1, baseRows), step = STEP.nextStepUp(baseRows, lv, true); return baseRows.filter((r) => HL.adviceTag(r, rec, step, false)).map((r) => r.hunt + ':' + HL.adviceTag(r, rec, step, false)).join(); };
  ok('G6', tagged(1) === 'mill_cellar:Recommended', 'Level 1 reads ' + tagged(1));
  ok('G6', tagged(11) === 'wickstead:Recommended,mosslight_glade:Next step up', 'Level 11 reads ' + tagged(11));
  ok('G6', tagged(17) === 'mosslight_glade:Recommended,coppercap_warrens:Next step up', 'Level 17 reads ' + tagged(17));
  ok('G6', tagged(16) === 'mosslight_glade:Recommended', 'Level 16 (16 under the Warrens) reads ' + tagged(16));
  ok('G6', tagged(35) === '', 'Level 35 alone, with a note and nothing above, reads ' + tagged(35));
  /* G6 A PARTY READS THE LEVEL TAG, NEVER A PARTY CLAIM (lane/d-party-pace, the full-game sweep's A1: "Recommended for the party" sat on the Mill Cellar,
     where the Party window says a four earns 60% under solo). Four friends at Level 1 and at 11 read what a hero alone reads. */
  const partyTagged = (lv) => { const rec = HL.recommendation([lv, lv, lv, lv], 4, baseRows), step = STEP.nextStepUp(baseRows, lv, true); return baseRows.filter((r) => HL.adviceTag(r, rec, step, true)).map((r) => r.hunt + ':' + HL.adviceTag(r, rec, step, true)).join(); };
  ok('G6', partyTagged(1) === 'mill_cellar:Recommended', 'four friends at Level 1 read ' + partyTagged(1));
  ok('G6', !/party/i.test(partyTagged(1) + partyTagged(11) + partyTagged(17)), 'a party\'s tags claim a party ground: ' + [partyTagged(1), partyTagged(11), partyTagged(17)].join(' | '));
  const war = rows.find((r) => r.hunt === 'coppercap_warrens');
  ok('G2', !!war && HL.heroWords(war) === 'Players: 1 to 4', 'the Warrens card reads ' + JSON.stringify(war && HL.heroWords(war)));
  ok('G2', rows.every((r) => !/party|one hero|solo/i.test(HL.heroWords(r))), 'a ground is labelled solo or party: ' + rows.map((r) => HL.heroWords(r)).join(' | '));
  const solo = rows.find((r) => r.groupFit !== 'party' && r.heroes > 1);
  ok('G2', !!solo && /^Players: 1 to \d$/.test(HL.heroWords(solo)), 'a solo/both ground lost its offer: ' + (solo && HL.heroWords(solo)));
  /* G3 (panel 2026-11-01): the words say what the server allows. It walks in PARTY.maxSize on every ground (hr_hunt_party_start has no
     per-ground size), so no ground may name fewer: the Thicket read "up to 1 more" (now "Players: 1 to N") over its two start tiles, and 3 and 4 walked in. */
  const most = (await import(pathToFileURL(join(base, 'src/data/party.js')).href + '?t=' + Math.random())).PARTY.maxSize;
  for (const r of rows) {
    const said = HL.heroWords(r);
    const named = Number((/^Players: 1 to (\d+)$/.exec(said) || [])[1]);
    ok('G3', named === most, r.hunt + ' reads ' + JSON.stringify(said) + ', and the server walks in ' + most);
  }
  /* THE FIXTURE GROUND: since the Thicket gained four seats (Tyler 2026-11-02) no live ground has fewer start tiles than the party, so the rows above can't tell the party
     from the tiles. A copy of src with the Thicket cut back to the two tiles it had: it must still name the server's party. */
  const two = mkdtempSync(join(tmpdir(), 'hunt-floor-g3-'));
  try {
    cpSync(join(base, 'src'), join(two, 'src'), { recursive: true });
    const grounds = join(two, 'src/data/hunt-grounds.js');
    const FOUR_TILES = 'start: Object.freeze([[1, 19], [1, 18], [2, 19], [1, 20]]),';
    const text = readFileSync(grounds, 'utf8').replace(/\r\n/g, '\n');
    ok('G3', text.includes(FOUR_TILES), 'CONTROL: the Thicket\'s four start tiles moved, so the fixture ground was not built');
    writeFileSync(grounds, text.replace(FOUR_TILES, 'start: Object.freeze([[1, 19], [1, 18]]),'));
    const HL2 = await import(pathToFileURL(join(two, 'src/shell/hunt-list.js')).href + '?t=' + Math.random());
    const thin = HL2.huntRows().find((r) => r.hunt === 'meadowbrook_thicket');
    ok('G3', !!thin && thin.heroes === most, 'a ground of two start tiles names ' + (thin && thin.heroes) + ' heroes, and the server walks in ' + most);
  } finally { rmSync(two, { recursive: true, force: true }); }
  /* The leader's warning (2027-02-18-party-truth.sql): only the OTHER seats under the floor. */
  const glade = { band: [16, 31] };
  const seats = { me: 0, seats: [{ seat: 0, name: 'Wren', level: 5 }, { seat: 1, name: 'Sorrel', level: 9 }, { seat: 2, name: 'Bram', level: 20 }, { seat: 3, name: 'Null', level: null }] };
  const low = HL.seatsUnder(glade, seats);
  ok('G3', low.under.map((s) => s.name).join() === 'Sorrel', 'seatsUnder reads ' + JSON.stringify(low));
  ok('G3', HL.underWords(glade, low.under) === 'Under Level 16 (death risk): Sorrel, Level 9' && HL.underWords(glade, []) === '', 'the warning reads ' + HL.underWords(glade, low.under));
  /* The Hunts window is the list (hunts.js) and the picked ground's page (hunt-detail.js, master-detail 2026-10-22). */
  const win = read('src/shell/windows/hunts.js') + read('src/shell/windows/hunt-detail.js');
  /* the party's Levels: each seat's, this hero's own at the server's Level (hunt-list.js adviceLevels, which the summary's Next ground reads too) */
  ok('G2', JSON.stringify(HL.adviceLevels(7, { me: 0, seats: [{ seat: 0, level: 3 }, { seat: 1, level: 12 }] })) === '[7,12]' && HL.adviceLevels(7, null) === 7,
    'the advice\'s Levels are not every seat\'s: ' + JSON.stringify(HL.adviceLevels(7, { me: 0, seats: [{ seat: 0, level: 3 }, { seat: 1, level: 12 }] })));
  ok('G2', win.includes('recommendation(adviceLevels(level, party), size, list, bests)')
    && win.includes('<p class="hs-note hw-hunts-reco" hidden></p>') && win.includes('text(reco, advice);'), 'the Hunts window does not recommend by the party\'s levels or never says the note');
  ok('W2', win.includes("text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level, blessed ? blessed.permille : 0), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join('\\n'));") && win.includes('<p class="hw-hunt-warn"></p>')
    && win.includes("text(det.querySelector('.hw-hd-who'), heroWords(r));"),
    'the Hunts line does not draw rangeWords');
  /* W4 in plain words (Tyler 2026-11-08, the tier note "way too exact"): every harder tier's line says you can die here, Deadly's says to bring food, and the note ends on the death line. */
  const tierData = read('src/data/hunt-tiers.js');
  ok('W4', (tierData.match(/XP per kill/g) || []).length === 4 && (tierData.match(/Bring plenty of food/g) || []).length === 2 && /TIER_DEATH_LINE = 'Death: /.test(tierData)
    && read('src/shell/hunt-list.js').includes("[tierLine(r, tier, size), ...healer, TIER_DEATH_LINE].join('\\n')") && win.includes('tierWords(r, tier, size, level)'),'the tier no longer says what a harder tier costs (first-week-bands.mjs bigger-pulls-words plays it)');
  ok('W2', !/prop\([^)]*'disabled'[^)]*(short|rangeWords)/.test(win), 'Enter must never be disabled by the level warning');
  ok('W2', win.includes("if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {") && win.includes("armed ? t('controls.enter_anyway') : t('controls.enter')"), 'a lone hero above its level walks in with no confirm press');
  ok('W2', /res && res\.belowRange \? '\. ' \+ ABOVE_LEVEL_WORDS/.test(win), 'a below_range enter does not repeat the warning');
  const cs = read('src/session/character-session.js');
  ok('W3', cs.includes('ans.body.ok === true && ans.body.below_range === true) { await this.load(); return { ok: true, belowRange: true }; }'), 'CharacterSession drops the server\'s below_range');

  const blow = read('src/core/hunt/damage.js') + read('src/core/combat.js');
  ok('S2', !/heroLv|underFloor/.test(blow), 'the fight reads a hero Level against the floor');
  ok('S2', !/underFloorPm|underFloorAtkPm/.test(read('src/data/hunt-grounds.js') + read('src/data/hunt-tuning.js')), 'a level gap row is back in the data');
  const gate = read('supabase/migrations/2027-02-24-risk-no-level-block.sql');
  const body = gate.slice(gate.indexOf('create or replace function public.hr_hunt_gate'), gate.indexOf('revoke execute on function public.hr_hunt_gate'));
  ok('S1', body.length > 100 && !/band_min|combat_level|hr_level_of|below_range_refuse/.test(body) && /'unknown_activity'/.test(body) && /spawn_gate/.test(body),
    'the newest hr_hunt_gate compares a Level with the floor, or lost its other two refusals');
  const pi = read('supabase/migrations/2026-10-25-party-invites.sql');
  ok('S1', pi.includes("'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt)") && pi.includes("'below_range', coalesce((v_r->>'below_range')::boolean, false)"),
    'hr_hunt_enter_for / hr_hunt_enter do not answer below_range');
  return red;
}

const MUTANTS = [
  ['the recommendation ignores the group', 'src/shell/hunt-list.js', 'const fit = rows.filter((r) => fitsGroup(r, partySize, lo));', 'const fit = rows;'],
  ['a lone hero is never sent to a party ground past its soloFrom (the Glade to 44 again)', 'src/shell/hunt-list.js',
    "  if (n < 2) return r.groupFit !== 'party' || (Number.isInteger(r.soloFrom) && Number.isInteger(level) && level >= r.soloFrom);", "  if (n < 2) return r.groupFit !== 'party';"],
  ['the window forgets the harder ground the hero chose', 'src/shell/hunt-list.js', 'return was && advised && was.band[0] > advised.band[0] ? was : advised;', 'return advised;'],
  ['the window re-opens on the ground that killed the hero', 'src/shell/hunt-list.js', "const was = last && last.endReason !== 'died' ? list.find((r) => r.hunt === last.huntId) : null;", 'const was = last ? list.find((r) => r.hunt === last.huntId) : null;'],
  ['a hall built for a party leaves its ground solo (the Sewer)', 'src/shell/hunt-list.js', "groupFit: g.pockets.some((p) => p.forParty) ? 'party' : g.groupFit,", 'groupFit: g.groupFit,'],
  ['the gap falls back to a party ground in band', 'src/shell/hunt-list.js', "    return { row: below, note: [t(key,", "    return { row: inBand, note: [t(key,"],
  ['the gap is not said', 'src/shell/hunt-list.js', "    if (!inBand) return { row: below, note: [t('hunts.no_ground',", "    if (!inBand) return { row: below, note: null && [t('hunts.no_ground',"],
  ['"no good hunt" over a ground in range again (Tyler 2026-11-11)', 'src/shell/hunt-list.js', "    if (!inBand) return { row: below,", "    if (inBand || !inBand) return { row: below,"],
  ['the server\'s loss alone is not said', 'src/shell/hunt-list.js', "const key = lost ? 'hunts.right_but_lost' :", "const key = lost && false ? 'hunts.right_but_lost' :"],
  ['a party is recommended by its own hero\'s level', 'src/shell/windows/hunts.js', 'recommendation(adviceLevels(level, party), size, list, bests)', 'recommendation(level, size, list, bests)'],
  ['a ground says who it is for again (Tyler 2026-11-08: no ground is solo or party)', 'src/shell/hunt-list.js', "  return r.heroes > 1 ? t('hunts.heroes_up_to', { max: r.heroes }) : t('hunts.heroes_one');", "  return r.band[0] >= 32 ? t('hunts.heroes_one') : r.heroes > 1 ? t('hunts.heroes_up_to', { max: r.heroes }) : t('hunts.heroes_one');"],
  ['the warning words are dropped', 'src/shell/hunt-list.js', "  if (!Number.isInteger(level) || level >= r.band[0]) return null;\n  const gap", "  return null;\n  const gap"],
  ['the note sends a lone hero to bring a party again', 'src/data/text/hunts.js', "right_but_tough: '{ground}: right for {levels}, tough monsters',", "right_but_tough: '{ground}: right for {levels}, bring a party',"],
  /* "the Warrens forgets its solo break-even" retired with the words it guarded (Tyler 2026-11-08: no ground is solo or party; the card no longer
     says "alone it pays from Level 45"). soloFrom is the advice's again since 2026-11-19 (the soloFrom mutant above): no card word, a lone hero sent there from it. */
  ['far under reads as near (the words never lean harder)', 'src/shell/hunt-list.js', "(gap >= FAR_UNDER_LEVELS ? FAR_WORDS : ABOVE_LEVEL_WORDS)", 'ABOVE_LEVEL_WORDS'],
  ['the words forget what dying costs', 'src/shell/hunt-list.js', ",\n    cut ? t('hunts.range_die_blessed', { loss }) : t('hunts.range_die', { loss })]", "]"],
  ['the fight reads a hero Level again (S2)', 'src/core/hunt/damage.js', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow) + (t.heroLv ? 0 : 0));'],
  ['a gap row comes back in the data (S2)', 'src/data/hunt-tuning.js', '  partyShareRangePm: 667,', '  partyShareRangePm: 667,\n  underFloorAtkPm: 50,'],
  ['the warning claims a penalty again', 'src/data/text/hunts.js', "above_level: 'Higher risk, better loot'", "above_level: 'More XP and better loot, but its monsters hit harder'"],
  ['a margin comes back in the data', 'src/data/hunt-sessions.js', '  bagLines: 10,\n', '  bagLines: 10,\n  belowRangeRefuse: 15,\n'],
  ['a lone hero walks in with no confirm press', 'src/shell/windows/hunts.js', "if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {", 'if (false) {'],
  ['the tier says nothing of what it costs', 'src/data/hunt-tiers.js', "Most XP per kill\\nBring plenty of food' }),", "Most XP per kill' }),"],
  ['the window never draws the warning', 'src/shell/windows/hunts.js', "text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level, blessed ? blessed.permille : 0), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join('\\n'));", ''],
  ['a ground names its start tiles, not the party the server allows (G3)', 'src/shell/hunt-list.js', 'heroes: PARTY.maxSize,', 'heroes: Math.min(g.start.length, PARTY.maxSize),'],
  ['the leader\'s warning names the leader too (G3)', 'src/shell/hunt-list.js', 's.seat !== party.me && Number.isInteger(s.level)', 'Number.isInteger(s.level)'],
  ['the session drops below_range', 'src/session/character-session.js', 'return { ok: true, belowRange: true };', 'return { ok: true };'],
  ['the gate keeps a hard floor', 'supabase/migrations/2027-02-24-risk-no-level-block.sql', "  -- SECURITY C2: every spawn's OWN gate", "  if public.hr_level_of(p_user, p_slot) < 1 then perform 1; end if;\n  -- SECURITY C2: every spawn's OWN gate"],
  ['the enter answer loses its flag', 'supabase/migrations/2026-10-25-party-invites.sql', "'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt)", "'below_range', false"],
  /* G4/G8 (lane/a-party-advice-glade): a party's fit and its tie of floors read the measured line (the old tie-break on groupFit 'party', lane/d-party-pace's mutant
     anchor, is gone: the Thicket's measure keeps it out of a party's advice, and G4 still plays a four at 5 to the Sewer) */
  /* (lane/a-party-coach-card: groupFit 'solo' is retired, so the hand-tag mutant reads the lone rule, the only tag left) */
  ['a party\'s advice reads the lone rule (any ground not built for a party)', 'src/shell/hunt-list.js', "  const best = r.partyBest ? r.partyBest[Math.min(n, PARTY.maxSize)] : null;\n  return Number.isInteger(best) && best > 0;", "  return r.groupFit !== 'party';"],
  ['a party\'s advice reads no measure (Wickstead from 8)', 'src/shell/hunt-list.js', "  const best = r.partyBest ? r.partyBest[Math.min(n, PARTY.maxSize)] : null;\n  return Number.isInteger(best) && best > 0;", '  return true;'],
  /* lane/d-harder-monsters (2026-11-19): a party suits a ground it is measured to earn OVER alone on; at ">= 0" a mixed pair's break-even line on Wickstead's Deadly took it off the Sewer */
  ['a party suits a ground it only breaks even on (Wickstead from 8)', 'src/shell/hunt-list.js', 'return Number.isInteger(best) && best > 0;', 'return Number.isInteger(best) && best >= 0;'],
  ['the measure reads Normal only (the Glade\'s harder tiers forgotten)', 'src/data/party-class-xp.js', 'const lines = tiersOf(groundId).map((tier) => partyVsAlone(groundId, roles, tier))', 'const lines = [DEFAULT_TIER].map((tier) => partyVsAlone(groundId, roles, tier))'],
  ['a tie of floors ignores what a party is measured to earn', 'src/shell/hunt-list.js', '(group ? lineOf(y) - lineOf(x) : 0) || ', ''],
  /* G6 (lane/d-party-pace): the party claim on the Level tag again, where a four earns 60% under solo */
  ['a party\'s advice claims the ground for the party again (A1)', 'src/shell/hunt-list.js', "export function adviceTag(r, rec, step) {\n  if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return t('hunts.tag_right_level');",
    "export function adviceTag(r, rec, step, party) {\n  if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return party ? 'Recommended for the party' : t('hunts.tag_right_level');"],
];

if (SELFTEST) {
  const clean = await run(ROOT);
  if (clean.length) { console.error('hunt-floor-warning selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  let caught = 0;
  for (const [why, rel, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hunt-floor-'));
    try {
      for (const d of ['src', 'supabase/migrations']) { mkdirSync(join(tmp, d), { recursive: true }); cpSync(join(ROOT, d), join(tmp, d), { recursive: true }); }
      const p = join(tmp, rel);
      const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      if (!src.includes(from)) { console.error('  ✗ mutant anchor missing: ' + why); continue; }
      writeFileSync(p, src.replace(from, to));
      const red = await run(tmp);
      if (red.length) { caught++; console.log('  ✓ caught: ' + why); } else console.error('  ✗ MISSED: ' + why);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log('hunt-floor-warning selftest: ' + caught + '/' + MUTANTS.length + ' planted defects caught');
  process.exit(caught === MUTANTS.length ? 0 : 1);
} else {
  const red = await run(ROOT);
  if (red.length) { console.error('hunt-floor-warning: ' + red.length + ' failing\n  ' + red.join('\n  ')); process.exit(1); }
  console.log('hunt-floor-warning: the floor only warns, nothing refuses a Level, one confirm press, the window and the session carry the server\'s flag');
}
