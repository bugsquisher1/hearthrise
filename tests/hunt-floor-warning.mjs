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
  const win = read('src/shell/windows/hunts.js');
  ok('W2', win.includes("text(li.querySelector('.hw-hunt-warn'), [rangeWords(r, level), groupWords(r, size)].filter(Boolean).join(' '));") && win.includes('<small class="hw-hunt-warn"></small>'),
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
  ['the recommendation ignores the group', 'src/shell/hunt-list.js', 'return best(inBand.filter((r) => fitsGroup(r, partySize))) || best(inBand)', 'return best(inBand)'],
  ['a party ground never says so', 'src/shell/hunt-list.js', "r.groupFit === 'party' && (Number(partySize) || 1) < 2 ?", 'false ?'],
  ['the warning words are dropped', 'src/shell/hunt-list.js', "ABOVE_LEVEL_WORDS;\n}", "null;\n}"],
  ['the margin is ignored (everything under the floor is "too far")', 'src/shell/hunt-list.js', 'r.band[0] - level >= SESSION_LIMITS.belowRangeRefuse ?', 'true ?'],
  ['the margin moved off Tyler\'s 15', 'src/data/hunt-sessions.js', 'belowRangeRefuse: 15,', 'belowRangeRefuse: 10,'],
  ['the window never draws the warning', 'src/shell/windows/hunts.js', "text(li.querySelector('.hw-hunt-warn'), [rangeWords(r, level), groupWords(r, size)].filter(Boolean).join(' '));", ''],
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
