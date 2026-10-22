#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-floor-warning.mjs — A HUNT'S LEVEL FLOOR IS A WARNING (Tyler 2026-10-18).
//
//   node tests/hunt-floor-warning.mjs             the arms, on the real modules
//   node tests/hunt-floor-warning.mjs --selftest  every planted defect must turn an arm red
//
// ARMS
//   W1  rangeWords: under band[0] within SESSION_LIMITS.belowRangeRefuse says
//       "This hunt is above your level, expect losses."; that many or more under
//       says it is too far; at or over the floor, or with no level, says nothing
//   W2  the Hunts window draws rangeWords on every line and never disables Enter
//       on it (the server decides), and a successful enter that the server
//       answered below_range repeats the warning
//   W3  CharacterSession hands the server's below_range back to the window
//   S1  the margin is the DATA's: the forward hunt-sessions catalogue writes
//       below_range_refuse = SESSION_LIMITS.belowRangeRefuse, and the gate file
//       reads hr_hunt_limit('below_range_refuse') and names no number of its own;
//       hr_hunt_enter_for answers below_range from hr_hunt_below_range. The
//       executed proof is each file's own self-check in the chain replay
//       (2026-10-25-hunt-floor-warning.sql §3, 2026-10-25-party-invites.sql §5).
//   G1  the ONE recommendation (src/shell/hunt-list.js recommendedHunt) prefers a ground whose
//       groupFit suits the party; a party ground tells a lone hero "Best with a party of 2–4"
//   G2  a ground with a party-only hall (minParty: the Rat King) is a party ground: a lone hero
//       is never recommended one; past every solo band the pick is the nearest solo ground below
//       and the Hunts window says so plainly; a party is recommended by its seats' levels
//   G2b a party ground's card never offers it alone below its measured break-even (designer
//       2026-10-21, CONFLICTS item 2): the Warrens reads "A party of 2 to 4, or alone from Level 45"
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
  const { SESSION_LIMITS } = await import(pathToFileURL(join(base, 'src/data/hunt-sessions.js')).href + '?t=' + Math.random());
  const m = SESSION_LIMITS.belowRangeRefuse;
  ok('W1', Number.isInteger(m) && m === 15, 'SESSION_LIMITS.belowRangeRefuse is ' + m + ' (Tyler 10-18: 15)');
  const row = { band: [40, 60] };
  const near = HL.rangeWords(row, 40 - m + 1), far = HL.rangeWords(row, 40 - m), at = HL.rangeWords(row, 40);
  ok('W1', near === 'This hunt is above your level, expect losses.', 'one level inside the margin reads ' + JSON.stringify(near));
  ok('W1', typeof far === 'string' && far !== near && /too far/.test(far), 'the margin itself reads ' + JSON.stringify(far));
  ok('W1', at === null && HL.rangeWords(row, 70) === null && HL.rangeWords(row, null) === null, 'at / over the floor or with no level must say nothing');

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
  const halls = Object.values(HUNT_GROUNDS).filter((g) => g.pockets.some((p) => p.minParty)).map((g) => g.hunt);
  ok('G2', halls.length > 0 && halls.every((h) => (rows.find((r) => r.hunt === h) || {}).groupFit === 'party'), 'a ground with a party-only hall is not a party ground to the advice: ' + halls.join(', '));
  const solo15 = HL.recommendedHunt(15, 1, rows);
  ok('G2', !!solo15 && HL.fitsGroup(solo15, 1) && !halls.includes(solo15.hunt), 'a lone Level-15 hero is recommended ' + (solo15 && solo15.hunt));
  const top = Math.max(...rows.map((r) => r.band[1]));
  for (let lv = 1; lv <= top; lv++) {
    const r = HL.recommendation(lv, 1, rows);
    if (!r.row || !HL.fitsGroup(r.row, 1)) { ok('G2', false, 'a lone Level-' + lv + ' hero is recommended ' + (r.row && r.row.hunt)); break; }
    const inBand = r.row.band[0] <= lv && lv <= r.row.band[1];
    if (!inBand && !(r.row.band[1] < lv && typeof r.note === 'string' && r.note.startsWith('No ground for one hero fits Level ' + lv + ' yet. ' + r.row.name))) {
      ok('G2', false, 'a lone Level-' + lv + ' hero is sent to ' + r.row.hunt + ' [' + r.row.band + '] with the note ' + JSON.stringify(r.note)); break;
    }
    if (inBand && r.note !== null) { ok('G2', false, 'a fitting ground still carries a note at Level ' + lv); break; }
  }
  const duo = HL.recommendation([12, 20], 2, rows);
  ok('G2', !!duo.row && HL.fitsGroup(duo.row, 2) && duo.row.band[0] <= 12 && 20 <= duo.row.band[1] && duo.note === null, 'a party at Levels 12 and 20 is recommended ' + (duo.row && duo.row.hunt));
  const war = rows.find((r) => r.hunt === 'coppercap_warrens');
  ok('G2', !!war && HL.heroWords(war) === 'A party of 2 to 4, or alone from Level 45', 'the Warrens card reads ' + JSON.stringify(war && HL.heroWords(war)));
  ok('G2', rows.filter((r) => r.groupFit === 'party').every((r) => !/^Alone/.test(HL.heroWords(r))), 'a party ground offers itself alone');
  const solo = rows.find((r) => r.groupFit !== 'party' && r.heroes > 1);
  ok('G2', !!solo && /^Alone or with up to \d more$/.test(HL.heroWords(solo)), 'a solo/both ground lost its offer: ' + (solo && HL.heroWords(solo)));
  /* The Hunts window is the list (hunts.js) and the picked ground's page (hunt-detail.js, master-detail 2026-10-22). */
  const win = read('src/shell/windows/hunts.js') + read('src/shell/windows/hunt-detail.js');
  ok('G2', win.includes("recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list)")
    && win.includes('<p class="hs-note hw-hunts-reco" hidden></p>') && win.includes('text(reco, advice);'), 'the Hunts window does not recommend by the party\'s levels or never says the note');
  ok('W2', win.includes("text(det.querySelector('.hw-hunt-warn'), rangeWords(r, level) || '');") && win.includes('<p class="hw-hunt-warn"></p>')
    && win.includes("[heroWords(r), groupWords(r, size)].filter(Boolean).join('. ')"),
    'the Hunts line does not draw rangeWords');
  ok('W2', !/prop\([^)]*'disabled'[^)]*(short|rangeWords)/.test(win), 'Enter must never be disabled by the level warning (the server decides)');
  ok('W2', /res && res\.belowRange \? ' ' \+ ABOVE_LEVEL_WORDS/.test(win), 'a below_range enter does not repeat the warning');
  const cs = read('src/session/character-session.js');
  ok('W3', cs.includes('ans.body.ok === true && ans.body.below_range === true) { await this.load(); return { ok: true, belowRange: true }; }'), 'CharacterSession drops the server\'s below_range');

  const cat = read('supabase/migrations/2026-10-25-hunt-sessions-catalogue.generated.sql');
  ok('S1', cat.includes("('below_range_refuse', " + m + ')'), 'the catalogue does not write below_range_refuse = ' + m);
  const gate = read('supabase/migrations/2026-10-25-hunt-floor-warning.sql');
  const body = gate.slice(gate.indexOf('create or replace function public.hr_hunt_gate'), gate.indexOf('revoke execute on function public.hr_hunt_gate'));
  ok('S1', /v_refuse int := public\.hr_hunt_limit\('below_range_refuse'\);/.test(body) && /if v_min - v_cl >= coalesce\(v_refuse, 1\) then/.test(body),
    'hr_hunt_gate does not refuse on the data margin');
  ok('S1', !/\b15\b/.test(body), 'hr_hunt_gate names a number of its own');
  const pi = read('supabase/migrations/2026-10-25-party-invites.sql');
  ok('S1', pi.includes("'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt)") && pi.includes("'below_range', coalesce((v_r->>'below_range')::boolean, false)"),
    'hr_hunt_enter_for / hr_hunt_enter do not answer below_range');
  return red;
}

const MUTANTS = [
  ['the recommendation ignores the group', 'src/shell/hunt-list.js', 'const fit = rows.filter((r) => fitsGroup(r, partySize));', 'const fit = rows;'],
  ['a party-only hall leaves its ground solo (the Sewer)', 'src/shell/hunt-list.js', "groupFit: g.pockets.some((p) => p.minParty) ? 'party' : g.groupFit,", 'groupFit: g.groupFit,'],
  ['the gap falls back to a party ground in band', 'src/shell/hunt-list.js', "    return { row: below, note };\n", ''],
  ['the gap is not said', 'src/shell/hunt-list.js', 'return { row: below, note };', 'return { row: below, note: null };'],
  ['a party is recommended by its own hero\'s level', 'src/shell/windows/hunts.js', 'recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list)', 'recommendation(level, size, list)'],
  ['a party ground never says so', 'src/shell/hunt-list.js', "r.groupFit === 'party' && (Number(partySize) || 1) < 2 ?", 'false ?'],
  ['the warning words are dropped', 'src/shell/hunt-list.js', "ABOVE_LEVEL_WORDS;\n}", "null;\n}"],
  ['a party ground offers itself alone again', 'src/shell/hunt-list.js', "  if (r.groupFit === 'party' && r.heroes > 1) {", '  if (false) {'],
  ['the Warrens forgets its solo break-even', 'src/data/hunt-grounds.js', '    soloFrom: 45,\n', ''],
  ['the margin is ignored (everything under the floor is "too far")', 'src/shell/hunt-list.js', 'r.band[0] - level >= SESSION_LIMITS.belowRangeRefuse ?', 'true ?'],
  ['the margin moved off Tyler\'s 15', 'src/data/hunt-sessions.js', 'belowRangeRefuse: 15,', 'belowRangeRefuse: 10,'],
  ['the window never draws the warning', 'src/shell/windows/hunts.js', "text(det.querySelector('.hw-hunt-warn'), rangeWords(r, level) || '');", ''],
  ['the session drops below_range', 'src/session/character-session.js', 'return { ok: true, belowRange: true };', 'return { ok: true };'],
  ['the gate keeps the hard floor', 'supabase/migrations/2026-10-25-hunt-floor-warning.sql', 'if v_min - v_cl >= coalesce(v_refuse, 1) then', 'if v_cl < v_min then'],
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
  console.log('hunt-floor-warning: the floor warns within ' + 15 + ' levels, the margin is the data\'s, the window and the session carry the server\'s flag');
}
