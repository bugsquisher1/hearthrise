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
//   G1  the ONE recommendation (src/shell/hunt-list.js recommendedHunt) prefers a ground whose
//       groupFit suits the party; a party ground tells a lone hero "Best with a party of 2–4"
//   G2  a ground with a hall built for a party (forParty: the Rat King) is a party ground: a lone hero
//       is never recommended one; past every solo band the pick is the nearest solo ground below
//       and the Hunts window says so plainly; a party is recommended by its seats' levels
//   G2b a party ground's card never offers it alone below its measured break-even (designer
//       2026-10-21, CONFLICTS item 2): the Warrens reads "Best with 2 to 4, and alone it pays from Level 45"
//       and no party ground reads "Alone or with up to"; a solo or both ground still does
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
  const lost = 'If you die, the hunt ends and you lose ' + Math.round(DEATH_XP_LOSS * 100) + '% of your XP.';
  const one = HL.rangeWords(row, 39), near = HL.rangeWords(row, 34), far = HL.rangeWords(row, 28), at = HL.rangeWords(row, 40);
  ok('W1', typeof one === 'string' && one.startsWith('You\'re 1 Level under this ground. '), 'one Level under reads ' + JSON.stringify(one));
  ok('W1', near === 'You\'re 6 Levels under this ground. ' + HL.ABOVE_LEVEL_WORDS + ' ' + lost && /More XP and better loot/.test(near) && !/expect losses/.test(near), 'six Levels under reads ' + JSON.stringify(near));
  ok('W1', typeof far === 'string' && far.startsWith('You\'re 12 Levels under this ground. ') && /far stronger than you/.test(far) && /much more on supplies, or to die/.test(far) && /More XP and better loot/.test(far) && far.endsWith(lost), 'twelve Levels under reads ' + JSON.stringify(far));
  ok('W1', ![one, near, far].some((w) => /hit (you )?(far )?harder|\d+% harder/.test(w)), 'the warning claims a penalty: ' + near);
  ok('W1', at === null && HL.rangeWords(row, 70) === null && HL.rangeWords(row, null) === null, 'at / over the floor or with no level must say nothing');
  ok('W1', HL.fitWords(row, 34).tone === 'above' && HL.fitWords(row, 28).tone === 'far', 'the list line reads ' + JSON.stringify([HL.fitWords(row, 34), HL.fitWords(row, 28)]));

  /* G1 (coordinator 10-18): the one recommendation prefers a ground built for the group; a party ground
     stays listed and enterable and tells a lone hero it is best with a party. */
  const rows = HL.huntRows();
  /* Level 12, with the party ground's band widened to start ABOVE the sewer's (10-50): the real Q9 bands
     (thicket 5-15, sewer 8-25, warrens 32-50) leave no level where a party ground out-ranks a solo one. */
  const wide = rows.map((r) => (r.groupFit === 'party' ? { ...r, band: [10, 50] } : r));
  const solo12 = HL.recommendedHunt(12, 1, wide), party40 = HL.recommendedHunt(40, 3, rows);
  ok('G1', !!solo12 && solo12.groupFit !== 'party' && solo12.band[0] <= 12 && 12 <= solo12.band[1], 'a lone Level-12 hero is recommended ' + (solo12 && solo12.hunt + ' (' + solo12.groupFit + ')'));
  const pg = rows.find((r) => r.groupFit === 'party');
  ok('G1', !!pg && /^Best with a party of 2–[2-5]$/.test(HL.groupWords(pg, 1) || '') && HL.groupWords(pg, 2) === null, 'a party ground does not tell a lone hero it is best with a party: ' + (pg && HL.groupWords(pg, 1)));
  ok('G1', !!party40 && HL.fitsGroup(party40, 3), 'a party of three at 40 is recommended ' + (party40 && party40.hunt));
  /* G2 (Tyler 2026-10-21: "The Sewer is a party hunt"): a ground with a party-only hall is a party ground to
     the advice; a lone hero is never recommended one, at any level; where no solo ground holds the level the
     pick is the nearest solo ground below and the note says so; a party is recommended by its levels. */
  const { HUNT_GROUNDS } = await import(pathToFileURL(join(base, 'src/data/hunt-grounds.js')).href + '?t=' + Math.random());
  const halls = Object.values(HUNT_GROUNDS).filter((g) => g.pockets.some((p) => p.forParty)).map((g) => g.hunt);
  ok('G2', halls.length > 0 && halls.every((h) => (rows.find((r) => r.hunt === h) || {}).groupFit === 'party'), 'a ground with a party-only hall is not a party ground to the advice: ' + halls.join(', '));
  const solo15 = HL.recommendedHunt(15, 1, rows);
  ok('G2', !!solo15 && HL.fitsGroup(solo15, 1) && !halls.includes(solo15.hunt), 'a lone Level-15 hero is recommended ' + (solo15 && solo15.hunt));
  const top = Math.max(...rows.map((r) => r.band[1]));
  for (let lv = 1; lv <= top; lv++) {
    const r = HL.recommendation(lv, 1, rows);
    if (!r.row || !HL.fitsGroup(r.row, 1)) { ok('G2', false, 'a lone Level-' + lv + ' hero is recommended ' + (r.row && r.row.hunt)); break; }
    const inBand = r.row.band[0] <= lv && lv <= r.row.band[1];
    if (!inBand && !(r.row.band[1] < lv && typeof r.note === 'string' && r.note.startsWith('There\'s no ground for one hero at Level ' + lv + ' yet. ' + r.row.name))) {
      ok('G2', false, 'a lone Level-' + lv + ' hero is sent to ' + r.row.hunt + ' [' + r.row.band + '] with the note ' + JSON.stringify(r.note)); break;
    }
    if (inBand && r.note !== null) { ok('G2', false, 'a fitting ground still carries a note at Level ' + lv); break; }
  }
  const duo = HL.recommendation([12, 20], 2, rows);
  ok('G2', !!duo.row && HL.fitsGroup(duo.row, 2) && duo.row.band[0] <= 12 && 20 <= duo.row.band[1] && duo.note === null, 'a party at Levels 12 and 20 is recommended ' + (duo.row && duo.row.hunt));
  /* G4: where the advice stands until the pace is re-measured (level-curve reads it: a pair sent to the Glade and a lone 45 sent to the Warrens re-land together, 2026-11-04): the Warrens is a party's, and a pair's first ground is the Sewer. */
  const lone = (lv) => HL.recommendation(lv, 1, rows);
  ok('G4', lone(44).row.hunt === 'mosslight_glade' && /Coppercap Warrens is right for your level if you bring a party/.test(lone(44).note || ''), 'a lone Level 44 reads ' + JSON.stringify(lone(44).note));
  const sewerPair = HL.recommendation([12, 12], 2, rows);
  ok('G4', sewerPair.row.hunt === 'millrace_sewer', 'the first party ground moved: a pair at Level 12 is sent to ' + sewerPair.row.hunt);
  /* G5 (first principle, played 11-04): the window opens on the harder ground this hero last hunted and came home from; never on one that killed it, and never on one below the advice. */
  const rec22 = HL.recommendation(22, 1, rows);
  const open = (last) => HL.openingPick(rec22, rows, last).hunt;
  ok('G5', open(null) === 'mosslight_glade', 'no hunt yet opens on ' + open(null));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: 'left' }) === 'coppercap_warrens', 'a hero home from the Warrens opens on ' + open({ huntId: 'coppercap_warrens', endReason: 'left' }));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: null }) === 'coppercap_warrens', 'a hero in the Warrens opens on ' + open({ huntId: 'coppercap_warrens', endReason: null }));
  ok('G5', open({ huntId: 'coppercap_warrens', endReason: 'died' }) === 'mosslight_glade', 'a hero the Warrens killed opens on ' + open({ huntId: 'coppercap_warrens', endReason: 'died' }));
  ok('G5', open({ huntId: 'wickstead', endReason: 'left' }) === 'mosslight_glade', 'a hero who has outgrown its last ground opens on ' + open({ huntId: 'wickstead', endReason: 'left' }));
  /* G6: the list's two tags, on the advice and the ground above it; a note means the advice's band doesn't hold, so no Fits. */
  const tagged = (lv) => { const rec = HL.recommendation(lv, 1, rows), step = STEP.nextStepUp(rows, lv, true); return rows.filter((r) => HL.adviceTag(r, rec, step, false)).map((r) => r.hunt + ':' + HL.adviceTag(r, rec, step, false)).join(); };
  ok('G6', tagged(1) === 'mill_cellar:Right for your level', 'Level 1 reads ' + tagged(1));
  ok('G6', tagged(11) === 'wickstead:Right for your level,mosslight_glade:Next step up', 'Level 11 reads ' + tagged(11));
  ok('G6', tagged(17) === 'mosslight_glade:Right for your level,coppercap_warrens:Next step up', 'Level 17 reads ' + tagged(17));
  ok('G6', tagged(16) === 'mosslight_glade:Right for your level', 'Level 16 (16 under the Warrens) reads ' + tagged(16));
  ok('G6', tagged(35) === '', 'Level 35 alone, with a note and nothing above, reads ' + tagged(35));
  const war = rows.find((r) => r.hunt === 'coppercap_warrens');
  ok('G2', !!war && HL.heroWords(war) === 'Best with 2 to 4, and alone it pays from Level 45', 'the Warrens card reads ' + JSON.stringify(war && HL.heroWords(war)));
  ok('G2', rows.filter((r) => r.groupFit === 'party').every((r) => !/^Alone/.test(HL.heroWords(r))), 'a party ground offers itself alone');
  const solo = rows.find((r) => r.groupFit !== 'party' && r.heroes > 1);
  ok('G2', !!solo && /^Alone or with up to \d more$/.test(HL.heroWords(solo)), 'a solo/both ground lost its offer: ' + (solo && HL.heroWords(solo)));
  /* G3 (panel 2026-11-01): the words say what the server allows. It walks in PARTY.maxSize on every ground (hr_hunt_party_start has no
     per-ground size), so no ground may name fewer: the Thicket read "up to 1 more" over its two start tiles, and 3 and 4 walked in. */
  const most = (await import(pathToFileURL(join(base, 'src/data/party.js')).href + '?t=' + Math.random())).PARTY.maxSize;
  for (const r of rows) {
    const said = HL.heroWords(r);
    const named = r.groupFit === 'party' ? Number((/ 2 to (\d+)/.exec(said) || [])[1]) : Number((/up to (\d+) more/.exec(said) || [])[1]) + 1;
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
  ok('G3', /^Sorrel \(Level 9\) is under this ground’s Level 16\./.test(HL.underWords(glade, low.under)) && HL.underWords(glade, []) === '', 'the warning reads ' + HL.underWords(glade, low.under));
  /* The Hunts window is the list (hunts.js) and the picked ground's page (hunt-detail.js, master-detail 2026-10-22). */
  const win = read('src/shell/windows/hunts.js') + read('src/shell/windows/hunt-detail.js');
  ok('G2', win.includes("recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list)")
    && win.includes('<p class="hs-note hw-hunts-reco" hidden></p>') && win.includes('text(reco, advice);'), 'the Hunts window does not recommend by the party\'s levels or never says the note');
  ok('W2', win.includes("text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join(' '));") && win.includes('<p class="hw-hunt-warn"></p>')
    && win.includes("(groupWords(r, size) || heroWords(r)) + '.'"),
    'the Hunts line does not draw rangeWords');
  /* W4 in plain words (Tyler 2026-11-08, the tier note "way too exact"): every harder tier's line says you can die here, Deadly's says to bring food, and the note ends on the death line. */
  const tierData = read('src/data/hunt-tiers.js');
  ok('W4', (tierData.match(/You can die here\./g) || []).length === 4 && (tierData.match(/Bring plenty of food\./g) || []).length === 2
    && read('src/shell/hunt-list.js').includes("tierLine(r, t, size) + ' ' + TIER_DEATH_LINE") && win.includes('tierWords(r, tier, size)'), 'the tier no longer says what a harder tier costs (first-week-bands.mjs bigger-pulls-words plays it)');
  ok('W2', !/prop\([^)]*'disabled'[^)]*(short|rangeWords)/.test(win), 'Enter must never be disabled by the level warning');
  ok('W2', win.includes("if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {") && win.includes("armed ? 'Enter anyway' : 'Enter'"), 'a lone hero above its level walks in with no confirm press');
  ok('W2', /res && res\.belowRange \? ' ' \+ ABOVE_LEVEL_WORDS/.test(win), 'a below_range enter does not repeat the warning');
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
  ['the recommendation ignores the group', 'src/shell/hunt-list.js', 'const fit = rows.filter((r) => fitsGroup(r, partySize));', 'const fit = rows;'],
  ['the window forgets the harder ground the hero chose', 'src/shell/hunt-list.js', 'return was && advised && was.band[0] > advised.band[0] ? was : advised;', 'return advised;'],
  ['the window re-opens on the ground that killed the hero', 'src/shell/hunt-list.js', "const was = last && last.endReason !== 'died' ? list.find((r) => r.hunt === last.huntId) : null;", 'const was = last ? list.find((r) => r.hunt === last.huntId) : null;'],
  ['a hall built for a party leaves its ground solo (the Sewer)', 'src/shell/hunt-list.js', "groupFit: g.pockets.some((p) => p.forParty) ? 'party' : g.groupFit,", 'groupFit: g.groupFit,'],
  ['the gap falls back to a party ground in band', 'src/shell/hunt-list.js', "    return { row: below, note };\n", ''],
  ['the gap is not said', 'src/shell/hunt-list.js', 'return { row: below, note };', 'return { row: below, note: null };'],
  ['a party is recommended by its own hero\'s level', 'src/shell/windows/hunts.js', 'recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list)', 'recommendation(level, size, list)'],
  ['a party ground never says so', 'src/shell/hunt-list.js', "r.groupFit === 'party' && (Number(partySize) || 1) < 2 ?", 'false ?'],
  ['the warning words are dropped', 'src/shell/hunt-list.js', "  if (!Number.isInteger(level) || level >= r.band[0]) return null;\n  const gap", "  return null;\n  const gap"],
  ['a party ground offers itself alone again', 'src/shell/hunt-list.js', "  if (r.groupFit === 'party' && r.heroes > 1) {", '  if (false) {'],
  ['the Warrens forgets its solo break-even', 'src/data/hunt-grounds.js', '    soloFrom: 45,\n', ''],
  ['far under reads as near (the words never lean harder)', 'src/shell/hunt-list.js', "(gap >= FAR_UNDER_LEVELS ? FAR_WORDS : ABOVE_LEVEL_WORDS)", 'ABOVE_LEVEL_WORDS'],
  ['the words forget what dying costs', 'src/shell/hunt-list.js', "    + ' If you die, the hunt ends and you lose ' + Math.round(DEATH_XP_LOSS * 100) + '% of your XP.';", "    + '';"],
  ['the fight reads a hero Level again (S2)', 'src/core/hunt/damage.js', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));', 'swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow) + (t.heroLv ? 0 : 0));'],
  ['a gap row comes back in the data (S2)', 'src/data/hunt-tuning.js', '  partyShareRangePm: 667,', '  partyShareRangePm: 667,\n  underFloorAtkPm: 50,'],
  ['the warning claims a penalty again', 'src/shell/hunt-list.js', "'Its monsters are stronger than you. Expect to spend more on supplies, or to die. More XP and better loot.'", "'More XP and better loot, but its monsters hit harder.'"],
  ['a margin comes back in the data', 'src/data/hunt-sessions.js', '  bagLines: 10,\n', '  bagLines: 10,\n  belowRangeRefuse: 15,\n'],
  ['a lone hero walks in with no confirm press', 'src/shell/windows/hunts.js', "if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {", 'if (false) {'],
  ['the tier says nothing of what it costs', 'src/data/hunt-tiers.js', "The most XP for each kill. Bring plenty of food. You can die here.' }),", "The most XP for each kill.' }),"],
  ['the window never draws the warning', 'src/shell/windows/hunts.js', "text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join(' '));", ''],
  ['a ground names its start tiles, not the party the server allows (G3)', 'src/shell/hunt-list.js', 'heroes: PARTY.maxSize,', 'heroes: Math.min(g.start.length, PARTY.maxSize),'],
  ['the leader\'s warning names the leader too (G3)', 'src/shell/hunt-list.js', 's.seat !== party.me && Number.isInteger(s.level)', 'Number.isInteger(s.level)'],
  ['the session drops below_range', 'src/session/character-session.js', 'return { ok: true, belowRange: true };', 'return { ok: true };'],
  ['the gate keeps a hard floor', 'supabase/migrations/2027-02-24-risk-no-level-block.sql', "  -- SECURITY C2: every spawn's OWN gate", "  if public.hr_level_of(p_user, p_slot) < 1 then perform 1; end if;\n  -- SECURITY C2: every spawn's OWN gate"],
  ['the enter answer loses its flag', 'supabase/migrations/2026-10-25-party-invites.sql', "'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt)", "'below_range', false"],
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
