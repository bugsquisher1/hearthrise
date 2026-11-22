#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-report.mjs — THE HUNT REPORT ON THE END CARD READS ONLY THE SERVER'S COUNTERS (lane/c-hunt-report, build plan FB-7; GR-66).
//   src/session/report-sections.js (the server's report, typed), src/hunt-view/hunt-report.js (the facts a card keeps),
//   src/session/hunt-summaries.js (the residue's bound), src/shell/hunt-report.js (the words).
//
//   node tests/hunt-report.mjs            the guard (pure Node: the real modules, no browser, no database)
//   node tests/hunt-report.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/hunt-view/hunt-report.js src/shell/hunt-report.js src/session/report-sections.js src/session/hunt-summaries.js
// ci-step: client-guards | The hunt report: the server's counters, the same card viewed and closed, plain words, bounded in the residue
// ci-run: node tests/hunt-report.mjs
// ci-run: node tools/mutant-gate.mjs node tests/hunt-report.mjs --mutate
//
//   HR-FACTS     one server report, its death row and its end: the word, the lowest health with monster and blow, the close calls, what
//                ran dry and how far in, each death's Level XP with what Blessings saved, each bar slot's uses, share of the damage or the
//                healing, and why a slot never fired (its most frequent wait, else its condition was never true)
//   HR-DOORS     THE SAME BLOCK VIEWED AND CLOSED: the report read off the `hunt` section (the card recorded at the end, the hunt
//                viewed) and off the free analyzer's session block (an earlier hunt's card read on return, the browser closed) give the
//                same facts and the same lines; an old hunt with no report shows no block
//   HR-WORDS     the lines in plain English (no semicolon, dash or colon), the word first, the swing and the spell in the house's
//                voice, a death's hunting time from the hunt's own Level XP an hour, the change line with what the slot did before
//   HR-RESIDUE   the card keeps the facts through the residue's bound, and a forged or oversized report is cut to its bound or dropped
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(root) {
  const u = (p) => import(pathToFileURL(join(root, p)).href);
  return { RS: await u('src/session/report-sections.js'), HR: await u('src/hunt-view/hunt-report.js'), HSUM: await u('src/session/hunt-summaries.js'),
    W: await u('src/shell/hunt-report.js'), HSEC: await u('src/session/hunt-sections.js') };
}

const START = Date.UTC(2026, 10, 22, 8, 0, 0);
/* The server's report as 1053-hunt-report.sql stores it and hr_hunt_view projects it (with the shares' maps). */
const SERVER = Object.freeze({
  low: { pm: 63, by: 'rat', blow: 'basic', at: START + 3600000 }, close: 2,
  fired: { e0001aa01: 40, d_food: 6 }, waits: { e0001bb02: { mana: 1, cooldown: 3 }, d_drink: {} },
  bar: [['e0001aa01', 'power_strike', 0], ['e0001bb02', 'mend', 1], ['d_food', 'cooked_shrimp', 2], ['d_drink', 'thin_turnip_juice', 3]],
  gear: { w: 2, a: 9, n: 4 }, dry: { cooked_shrimp: START + 4500000 },
  dealt: { basic: 600, power_strike: 400 }, healed: { cooked_shrimp: 300, mend: 0 },
});
const DEATHS = [{ id: 9, session: 's1', xp: 5000, saved: { level: 1250 }, blessings: 1 }];

const ARMS = {
  'HR-FACTS': async (X) => {
    const out = [];
    const f = X.HR.reportFacts(X.RS.reportFrom(SERVER), { deaths: DEATHS, reason: 'heals_out', enteredMs: START });
    const want = {
      word: 'near', low: [63, 'rat', 'basic'], close: 2, dry: [['cooked_shrimp', 4500000]], ranOut: 'heals_out', deaths: [[5000, 1250, 1]],
      rules: [['e0001aa01', 'power_strike', 0, 40, '', 'd', 400], ['e0001bb02', 'mend', 1, 0, 'cooldown', '', -1],
        ['d_food', 'cooked_shrimp', 2, 6, '', 'h', 1000], ['d_drink', 'thin_turnip_juice', 3, 0, 'never_true', '', -1]],
    };
    if (JSON.stringify(f) !== JSON.stringify(want)) out.push('the facts read ' + JSON.stringify(f) + '\n      want ' + JSON.stringify(want));
    if (X.HR.reportFacts(null, {}) !== null || X.RS.reportFrom({}) !== null) out.push('no report made facts');
    const close = X.HR.reportFacts(X.RS.reportFrom({ low: { pm: 400, by: 'rat', blow: 'basic', at: 1 } }), {});
    if (!close || close.word !== 'close' || close.close !== 0) out.push('a fall to 40% reads ' + JSON.stringify(close));
    return out;
  },
  'HR-DOORS': async (X) => {
    const out = [];
    /* the card recorded at the end: the `hunt` section's session tally (hr_hunt_view) */
    const viewed = X.RS.huntReportOf({ read: (k) => (k === 'hunt' ? { session_id: 's1', ended: true, session: { id: 's1', tally: { kills: 9, report: SERVER } } } : null) });
    /* the card read on return: the free analyzer's session block (hr_hunt_analyzer_basic `session.report`) through the analyzer's reader */
    const an = X.HSEC.analyzerFrom({ read: () => null }, { tier: 'basic', session: { id: 's1', hunt: 'mill_cellar', report: SERVER }, hero: { kills: 9, xp: { level: 100 } } });
    const closed = X.RS.reportFrom(an && an.session ? an.session.report : null);
    /* ...and the premium block, whose session is the whole hr_hunt_view */
    const prem = X.HSEC.analyzerFrom({ read: () => null }, { tier: 'premium', session: { id: 's1', tally: { report: SERVER } }, hero: { kills: 9 } });
    const premR = X.RS.reportFrom(prem && prem.session ? prem.session.report : null);
    const facts = (r) => JSON.stringify(X.HR.reportFacts(r, { deaths: DEATHS, reason: 'stamina', enteredMs: START }));
    if (!viewed || facts(viewed) !== facts(closed) || facts(viewed) !== facts(premR)) out.push('viewed ' + facts(viewed) + ' closed ' + facts(closed) + ' premium ' + facts(premR));
    const lines = (r) => JSON.stringify([X.W.riskLines(X.HR.reportFacts(r, { deaths: DEATHS, enteredMs: START }), 5000), X.W.rulesLines(X.HR.reportFacts(r, {}), null)]);
    if (lines(viewed) !== lines(closed)) out.push('the two doors draw different lines');
    const old = X.RS.huntReportOf({ read: (k) => (k === 'hunt' ? { session: { id: 's0', tally: { kills: 3 } } } : null) });
    if (old !== null || X.W.riskLines(X.HR.reportFacts(old, {}), 100).length || X.W.rulesLines(null, null).length) out.push('an old hunt with no report shows a block');
    return out;
  },
  'HR-WORDS': async (X) => {
    const out = [];
    const f = X.HR.reportFacts(X.RS.reportFrom(SERVER), { deaths: DEATHS, reason: 'heals_out', enteredMs: START });
    const risk = X.W.riskLines(f, 10000).map((l) => l.text), rules = X.W.rulesLines(f, null).map((l) => l.text);
    const want = ['Near death', 'Lowest health 6%, from a Giant Rat.', '2 close calls under a quarter of health.', 'Ran out of Cooked Shrimp 1 h 15 min in.',
      'Ran out of food, and the hunt ended.', 'Died and lost 5,000 Level XP, about 30 min of hunting.', 'Blessings saved 1,250 Level XP.'];
    if (JSON.stringify(risk) !== JSON.stringify(want)) out.push('the risk block reads ' + JSON.stringify(risk) + '\n      want ' + JSON.stringify(want));
    if (!X.W.riskLines(f, 10000)[0].word) out.push('the word is not the first line');
    if (rules.length !== 4 || !/^Power Strike fired 40 times and did 40% of the damage\.$/.test(rules[0]) || !/^Mend never fired because it was still cooling down\.$/.test(rules[2])
        || !/never fired because its condition was never true\.$/.test(rules[3])) out.push('the rules block reads ' + JSON.stringify(rules));
    const spell = X.W.riskLines(X.HR.reportFacts(X.RS.reportFrom({ low: { pm: 900, by: 'rat', blow: 'gnaw', at: 1 } }), {}), null).map((l) => l.text);
    if (spell[0] !== 'Safe' || !/^Lowest health 90%, from Giant Rat's .+\.$/.test(spell[1]) || spell[2] !== 'No close calls.') out.push('a spell\'s fall reads ' + JSON.stringify(spell));
    /* the change line: slot 1's rule is new since the last hunt here, and the old hunt's Power Strike did 14% */
    const prev = { rules: [['e0000old1', 'power_strike', 0, 10, '', 'd', 140], ['e0001bb02', 'mend', 1, 2, '', 'h', 500]] };
    const ch = X.W.rulesLines(f, prev).map((l) => l.text);
    if (ch[ch.length - 1] !== 'You changed slot 1. Power Strike did 40% of the damage. It was 14%.') out.push('the change line reads ' + JSON.stringify(ch[ch.length - 1]));
    if (X.W.rulesLines(f, { rules: f.rules }).length !== 4) out.push('an unchanged bar has a change line');
    const all = [...risk, ...rules, ...spell, ...ch];
    if (all.some((s) => /[;—–:]/.test(s))) out.push('a line has a semicolon, a dash or a colon: ' + all.find((s) => /[;—–:]/.test(s)));
    return out;
  },
  'HR-RESIDUE': async (X) => {
    const out = [];
    const f = X.HR.reportFacts(X.RS.reportFrom(SERVER), { deaths: DEATHS, reason: 'heals_out', enteredMs: START });
    const kept = X.HSUM.sanitizeSummary({ id: 's1', hunt: 'mill_cellar', report: f });
    if (JSON.stringify(kept.report) !== JSON.stringify(f)) out.push('the residue changed the facts: ' + JSON.stringify(kept.report));
    const forged = X.HSUM.sanitizeSummary({ id: 's1', report: Object.assign({}, f, { word: 'fine' }) });
    if (forged.report !== null) out.push('a report with no word of the three survived');
    const big = X.HSUM.sanitizeSummary({ id: 's1', report: Object.assign({}, f, {
      rules: Array.from({ length: 40 }, (_, i) => ['r' + i, 'mend', i, 1, '', 'h', 2000]).concat(Array.from({ length: 40 }, (_, i) => ['q' + i, 'mend', i, 1, '', 'h', 5])),
      low: [5000, 'rat', 'basic'], dry: Array.from({ length: 30 }, (_, i) => ['bread', i]) }) });
    if (!big.report || big.report.rules.length > 16 || big.report.low !== null || big.report.dry.length > 8 || big.report.rules.some((r) => r[6] > 1000)) {
      out.push('an oversized report passed: ' + JSON.stringify(big.report).slice(0, 200));
    }
    return out;
  },
};

const MUTANTS = [
  ['a slot that never fired reads its first wait, not its most frequent', 'HR-FACTS', 'src/hunt-view/hunt-report.js', '(best === null || w[why] > w[best])', '(best === null)'],
  ['the healing share is read off the damage', 'HR-FACTS', 'src/hunt-view/hunt-report.js', "if (nat(healed[uses]) > 0) return ['h', Math.round((healed[uses] * 1000) / Math.max(1, sum(healed)))];", "if (nat(healed[uses]) > 0) return ['h', Math.round((healed[uses] * 1000) / Math.max(1, sum(dealt)))];"],
  ['a dry stack is timed from the epoch, not the hunt', 'HR-WORDS', 'src/hunt-view/hunt-report.js', '[item, start !== null ? Math.max(0, at - start) : -1]', '[item, at]'],
  ['the free analyzer\'s report is not read', 'HR-DOORS', 'src/session/hunt-sections.js', 'report: isObj(s.report) ? s.report : ', 'report: '],
  ['a death\'s hunting time divides the wrong way', 'HR-WORDS', 'src/shell/hunt-report.js', '(xp / xpH) * 3600000', '(xpH / xp) * 3600000'],
  ['the change line forgets the old share', 'HR-WORDS', 'src/hunt-view/hunt-report.js', 'wasPm: then ? then[6] : -1', 'wasPm: -1'],
  ['the residue keeps a forged word', 'HR-RESIDUE', 'src/session/hunt-summaries.js', "if (!isObj(v) || !WORDS.includes(v.word)) return null;", 'if (!isObj(v)) return null;'],
  ['the residue keeps every rule', 'HR-RESIDUE', 'src/session/hunt-summaries.js', "? [p[0], p[1], p[2], p[3], p[4], p[5], p[6]] : null), 16),", "? [p[0], p[1], p[2], p[3], p[4], p[5], p[6]] : null), 99),"],
  ['a report with only a low reads as none', 'HR-FACTS', 'src/session/report-sections.js', "if (!isObj(raw) || !Object.keys(raw).length) return null;", "if (!isObj(raw) || !raw.fired) return null;"],
];

async function runAll(X, only) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    let got;
    try { got = await arm(X); } catch (e) { got = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
    for (const g of got) fails.push(id + ' ' + g);
  }
  return fails;
}

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await runAll(await load(ROOT));
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `hunt-report: ${fails.length} RED` : `hunt-report: green (${Object.keys(ARMS).join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runAll(await load(ROOT));
  if (clean.length) { console.error('hunt-report --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-rep-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 60))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      const got = await runAll(await load(dir), arm);
      if (got.length) console.log(`  caught  ${name} (${arm}): ${got[0].slice(0, 140)}`);
      else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(escaped ? `hunt-report --mutate: ${escaped} ESCAPED` : `hunt-report --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exit(escaped ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
