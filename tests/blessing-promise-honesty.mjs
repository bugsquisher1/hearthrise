#!/usr/bin/env node
// ============================================================================
// tests/blessing-promise-honesty.mjs — NO CLIENT COPY OR CODE PROMISES A
// BLESSING EFFECT THE SERVER DOES NOT PAY.
//
//   node tests/blessing-promise-honesty.mjs             # the guard
//   node tests/blessing-promise-honesty.mjs --selftest  # mutation proof
//
// The engine's bonusFor (supabase/functions/hr-accrue/accrual.js) has three
// layers — rooms/perks, companion, buff queue — and NO blessing layer. Until
// b560 src/features/world-events.js wrapped window.getBonus with one anyway, so
// Home, Events, the login toast and the activity note promised gather/craft/
// cook speed, yield and gold find the realm never pays (CLAUDE.md §6: the
// browser never says one thing while the server says another). This guard
// keeps the promise withdrawn until a server layer exists to back it.
//
// RULES (comments stripped, strings kept — tests/retired-capability-copy.mjs's
// prepare()):
//   layer      world-events.js wraps or reads getBonus
//   magnitude  a pool entry carries a `bonus:` table
//   pool-copy  a world-events.js string names a %, speed, yield, gold find or XP
//   reader     any shipped file asks the calendar for a paid amount
//              (liveBonusFor / summaryFor / WorldEvents.bonusFor / blessingPart)
//   copy       a shipped sentence says a blessing pays, speeds, yields, finds gold
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepare, loadFiles } from './retired-capability-copy.mjs';

const WE = 'src/features/world-events.js';

const FILE_RULES = [
  { id: 'layer', why: 'the calendar may not add into getBonus — the engine has no blessing layer',
    re: /\bgetBonus\b/ },
  { id: 'magnitude', why: 'a blessing pool entry may not carry a bonus table the server never pays',
    re: /\bbonus\s*:/ },
  { id: 'pool-copy', why: 'blessing copy may not name a number or a rate the server never pays',
    re: /\d+\s*%|\b(speed|yield|gold find|XP)\b/i },
];

const ALL_RULES = [
  { id: 'reader', why: 'nothing may read a paid amount off the blessing calendar',
    re: /\bliveBonusFor\b|\bsummaryFor\b|WorldEvents\)?\s*\.\s*bonusFor\b|\bW\.bonusFor\b|\bblessingPart\b/ },
  { id: 'copy', why: 'no sentence may say a blessing pays, speeds, yields or finds gold',
    re: /\bblessings?\b[^'"`<>\n.]{0,60}?\b(pay|pays|paid|paying|speeds?|faster|yields?|gold find|XP)\b|\bblessings?\b[^'"`<>\n.]{0,60}?[+−]\s*\d+\s*%/i },
];

export function scanText(rel, src) {
  const code = prepare(src);
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  const rules = rel === WE ? FILE_RULES.concat(ALL_RULES) : ALL_RULES;
  const hits = [];
  for (const r of rules) {
    const re = new RegExp(r.re.source, r.re.flags.replace('g', '') + 'g');
    let m;
    while ((m = re.exec(code)) !== null) hits.push(`${rel}:${lineOf(m.index)} [${r.id}] "${m[0]}" — ${r.why}`);
  }
  return hits;
}

export function scanAll(files) {
  const problems = files.flatMap((f) => scanText(f.rel, f.text));
  if (files.length < 50) problems.push(`only ${files.length} files scanned — the walk is broken`);
  if (!files.some((f) => f.rel === WE)) problems.push(`${WE} was not scanned — the guard is blind`);
  return problems;
}

async function selftest(root) {
  const files = await loadFiles(root);
  const we = files.find((f) => f.rel === WE);
  const home = files.find((f) => f.rel === 'src/features/home-dashboard.js');
  const fails = [];
  const probe = (name, rel, text, wantRed) => {
    const red = scanText(rel, text).length > 0;
    if (red !== wantRed) fails.push(`${name}: expected ${wantRed ? 'RED' : 'GREEN'}`);
  };
  probe('clean world-events.js', WE, we.text, false);
  probe('clean home-dashboard.js', home.rel, home.text, false);
  const PLANTS = [
    ['layer', WE, "\nwindow.getBonus = function (k) { return 0; };\n"],
    ['magnitude', WE, "\nvar X = [{ id: 'x', name: 'X', desc: 'x', bonus: { gatherSpeed: 0.04 } }];\n"],
    ['pool-copy %', WE, "\nvar X = { desc: '+4% all XP' };\n"],
    ['pool-copy speed', WE, "\nvar X = { desc: 'swifter gather speed' };\n"],
    ['pool-copy gold', WE, "\nvar X = { desc: 'more gold find' };\n"],
    ['reader liveBonusFor', home.rel, "\nvar v = window.HearthriseWorldEvents.liveBonusFor('goldFind');\n"],
    ['reader summaryFor', home.rel, "\nvar v = WE.summaryFor(['allXP']);\n"],
    ['reader bonusFor', home.rel, "\nvar v = window.HearthriseWorldEvents.bonusFor('allXP');\n"],
    ['copy pays', home.rel, "\nvar s = 'Blessings and food buffs pay while you play.';\n"],
    ['copy percent', home.rel, "\nvar s = 'Today\\'s blessing: +4% gather speed';\n"],
    ['copy split literal', home.rel, "\nvar s = 'the blessing ' + 'speeds your gathering';\n"],
  ];
  for (const [name, rel, plant] of PLANTS) {
    const base = rel === WE ? we.text : home.text;
    probe(`(a) ${name}`, rel, base + plant, true);
    probe(`(b) ${name} in a comment`, rel, base + '\n/* ' + plant.replace(/\*\//g, '') + ' */\n', false);
  }
  for (const ok of ['Press an offering for a blessing.', 'Blessings remain active while you are online.',
    "the realm's blessing is at its limit", 'Food buffs pay while you play.', 'Might blessing']) {
    probe(`(c) negative control "${ok}"`, home.rel, home.text + `\nvar __m = ${JSON.stringify(ok)};\n`, false);
  }
  if (!scanAll(files.filter((f) => f.rel !== WE)).some((p) => /blind/.test(p))) fails.push('(d) a missing world-events.js was not reported');
  return fails;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = process.cwd();
  if (process.argv.includes('--selftest')) {
    const fails = await selftest(root);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? `SELFTEST FAILED (${fails.length})` : 'selftest: every plant flipped the verdict');
    process.exit(fails.length ? 1 : 0);
  }
  const problems = scanAll(await loadFiles(root));
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(problems.length
    ? `FAIL blessing-promise-honesty: ${problems.length} finding(s)`
    : 'PASS blessing-promise-honesty: no client code or copy promises a blessing effect the server never pays');
  process.exit(problems.length ? 1 : 0);
}
