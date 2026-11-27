#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/flame-client.mjs — THE INNER FLAME IN THE BROWSER: THE SECTION'S READER AND THE RETURN CARD'S LINE (lane/f1-inner-flame,
// 2026-11-27; 21-flame-temper-imbue-loot.md section 1.5; the server half is tests/flame-settle-db.mjs).
//
//   node tests/flame-client.mjs            the rules
//   node tests/flame-client.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: client-guards | Inner Flame in the browser - the flame section's reader and the return card's line
// ci-run: node tests/flame-client.mjs
// ci-run: node tools/mutant-gate.mjs node tests/flame-client.mjs --mutate
//
// mutant-anchors: src/session/flame-sections.js src/shell/windows/away.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   FC-1  THE READER (src/session/flame-sections.js): dark (no section) reads null and no hunt; lit, the section reads as the server sent it,
//         a malformed hunt row is dropped, and a hunt's flame is the row of ITS session (the luck it froze, the Remains it burned)
//   FC-2  THE RETURN CARD (src/shell/windows/away.js awayBlockOf): a hunt's block says what it burned and the Rare chance it rolled at, the
//         server's numbers ("Flame: burned 41 Remains · Rare chance +26%"); only the burn, or only the chance, when the other is none;
//         nothing for a hunt the section does not list, a town job or a dark section
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

const S1 = '11111111-1111-4111-8111-111111111111', S2 = '22222222-2222-4222-8222-222222222222', S3 = '33333333-3333-4333-8333-333333333333';
const S4 = '44444444-4444-4444-8444-444444444444';
const SECTION = { level: 7, points: 41000, height: 14200, room: 19660, luck_pm: 217, burn_ppm: 79000, stoke: { keep: 'full' }, fuel: { bones: 45 },
  hunts: [
    { session: S1, slot: 0, luck_pm: 257, units: 41 },
    { session: S2, slot: 1, luck_pm: 0, units: 12 },
    { session: S3, slot: 0, luck_pm: 200, units: 0 },
    { session: 'not-a-uuid', slot: 0, luck_pm: 300, units: 5 },
    { session: S4, slot: 0, luck_pm: -1, units: 5 },
  ] };
const csOf = (data) => ({ slot: 0, status: 'ready', read: (k) => data[k], record: { residue: {} } });

async function pure(base) {
  const out = [];
  const u = async (p) => import(pathToFileURL(join(base, p)).href);
  const FS = await u('src/session/flame-sections.js'), AW = await u('src/shell/windows/away.js');
  const lit = csOf({ flame: SECTION, hunt: { session_id: S1, ended: true } });
  const dark = csOf({ flame: null });

  /* FC-1 */
  if (FS.flameOf(dark) !== null || FS.flameHuntOf(dark, S1) !== null) out.push('FC-1 a dark section reads something');
  const f = FS.flameOf(lit);
  if (!f || f.level !== 7 || f.height !== 14200 || f.room !== 19660 || f.luckPm !== 217) out.push('FC-1 the section reads ' + JSON.stringify(f));
  if (!f || f.hunts.map((h) => h.session).join(',') !== [S1, S2, S3].join(',')) out.push('FC-1 the hunts read ' + JSON.stringify(f && f.hunts.map((h) => h.session)));
  const h1 = FS.flameHuntOf(lit, S1), h2 = FS.flameHuntOf(lit, S2);
  if (!h1 || h1.luckPm !== 257 || h1.units !== 41 || !h2 || h2.luckPm !== 0 || h2.units !== 12) out.push('FC-1 a hunt reads ' + JSON.stringify([h1, h2]));
  if (FS.flameHuntOf(lit, '55555555-5555-4555-8555-555555555555') !== null || FS.flameHuntOf(lit, S4) !== null) out.push('FC-1 an unlisted or malformed hunt reads a flame');

  /* FC-2 */
  const block = (cs, sid, o = {}) => AW.awayBlockOf(cs, { session: sid, facts: { hunt: 'muster_barrows' }, ...o });
  const both = block(lit, S1).flame, burned = block(lit, S2).flame, luck = block(lit, S3).flame;
  if (both !== 'Flame: burned 41 Remains · Rare chance +26%') out.push('FC-2 the burn and the chance read ' + JSON.stringify(both));
  if (burned !== 'Flame: burned 12 Remains') out.push('FC-2 a burn with no chance reads ' + JSON.stringify(burned));
  if (luck !== 'Flame: Rare chance +20%') out.push('FC-2 a chance with no burn reads ' + JSON.stringify(luck));
  if (block(lit, '55555555-5555-4555-8555-555555555555').flame !== '' || block(dark, S1).flame !== '') out.push('FC-2 an unlisted hunt or a dark section says a flame');
  if (AW.awayBlockOf(lit, { session: S1, work: 'w1', facts: {} }).flame !== '') out.push('FC-2 a town job\'s card says a flame');
  return out;
}

const MUTANTS = [
  ['the card drops the flame', 'src/shell/windows/away.js', "flame: hunt && cs && a.session ? flameLine(flameHuntOf(cs, a.session)) : '',", "flame: '',"],
  ['the chance is the permille', 'src/shell/windows/away.js', 'const pct = Math.round(h.luckPm / 10);', 'const pct = h.luckPm;'],
  ['a burn with no chance says nothing', 'src/shell/windows/away.js', "  if (h.units > 0) return t('away.card_flame_burned', { n: whole(h.units) });\n", ''],
  ['any hunt reads the first one', 'src/session/flame-sections.js', 'const h = f.hunts.find((x) => x.session === sid);', 'const h = f.hunts[0];'],
  ['a malformed hunt row is kept', 'src/session/flame-sections.js', "typeof h.session === 'string' && ID.test(h.session) && whole(h.luck_pm) && whole(h.units))", "typeof h.session === 'string')"],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/flame-client.mjs', pure, mutants: MUTANTS,
  green: 'the flame section reads as the server sent it and the return card says what each hunt burned and rolled at' });
