#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gold-estimate.mjs — ABOUT N GOLD AN HOUR ON EACH SCALE GROUND, AND WHAT THE HUNT EARNED (lane/gold-per-hour, Tyler 2026-11-22).
//   src/core/gold-estimate.js (the rule; its SQL twin is generated and pinned by tools/gen-gold-estimate.mjs), src/session/gold-estimate-sections.js
//   (the `gold_estimate` section, read), src/shell/windows/company-pane.js (the Hunts window's line), src/hunt-view/summary-model.js and
//   src/session/hunt-summaries.js (the card keeps the server's per-hour gold and supplies), src/shell/hunt-report.js and
//   src/shell/windows/away.js (the earned line on the report and the return card).
//
//   node tests/gold-estimate.mjs            the guard (pure Node: the real modules over fixture envelopes, no browser, no database)
//   node tests/gold-estimate.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/core/gold-estimate.js src/session/gold-estimate-sections.js src/shell/windows/company-pane.js src/hunt-view/summary-model.js src/session/hunt-summaries.js src/shell/windows/away.js src/shell/hunt-report.js
// ci-step: client-guards | Gold an hour - the Hunts window shows the server's estimate, the report and the return card what the hunt earned
// ci-run: node tools/gen-gold-estimate.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-gold-estimate.mjs --selftest
// ci-run: node tests/gold-estimate.mjs
// ci-run: node tools/mutant-gate.mjs node tests/gold-estimate.mjs --mutate
//
//   GE-RULE    the estimate is the wage at the hero's Level held to the ground's band top, times the Risk's ratio, to two figures: Level 63
//              Steady on Muster Barrows is 4,900; Careful under Steady under Bold; past the top it stops; under the floor, off the scale or
//              for an unknown Risk there is none
//   GE-READ    the section reads exactly what the server sent, and a missing, negative, fractional or string value reads null
//   GE-HUNTS   the Hunts window draws "Est. 4,900 gold/hr (before supplies)" under the Risk pick at the plan's Risk (Steady when the
//              plan names none, Bold's own number on Bold), and nothing before the section comes or under the floor
//   GE-REPORT  the end card keeps the server's per-hour gold and supplies through the residue, and its risk block ends on "Gold/hr: 4,812 · Supplies/hr: 950
//              an hour. Supplies used 950 gold an hour." on a scale ground; the return card says the same, from the stored card or from the
//              analyzer while it reads that session; none off the scale, none for an unrated hunt
//   GE-WORDS   the player sees gold, never the word wage; genre labels (no semicolon or dash; a colon only as Label: value, never joining clauses, Tyler 2026-11-14)
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { harnessFail, verdict } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(root) {
  const u = (p) => import(pathToFileURL(join(root, p)).href);
  return { GE: await u('src/core/gold-estimate.js'), W: await u('src/core/wage.js'), GES: await u('src/session/gold-estimate-sections.js'),
    PANE: await u('src/shell/windows/company-pane.js'), SM: await u('src/hunt-view/summary-model.js'), HSUM: await u('src/session/hunt-summaries.js'),
    HSEC: await u('src/session/hunt-sections.js'), RS: await u('src/session/report-sections.js'), HR: await u('src/hunt-view/hunt-report.js'),
    REP: await u('src/shell/hunt-report.js'), REC: await u('src/hunt-view/summary-recorder.js'), AWAY: await u('src/shell/windows/away.js'),
    HT: await u('src/data/text/hunts.js'), RT: await u('src/data/text/report.js') };
}

const M = 'muster_barrows';
/* THE FIXTURE ENVELOPE: the sections as hr_state_of sends them (1056 `danger`, 1060 `gold_estimate`) for a Level 63 hero */
const GOLD = Object.freeze({ level: 63, grounds: { [M]: { careful: 3100, steady: 4900, bold: 6200 } } });
const UNDER = Object.freeze({ level: 30, grounds: { [M]: { careful: null, steady: null, bold: null } } });
const csOf = (sections, cards) => ({ slot: 0, status: 'ready', read: (k) => sections[k], record: { residue: { huntSummaries: cards || [] } } });
const START = Date.UTC(2026, 10, 22, 8, 0, 0);
/* an ended Muster hunt (hr_hunt_view) with its report, and the analyzer's hero with the server's per-hour figures (hr_hunt_stats_of per_hour) */
const REPORT = Object.freeze({ low: { pm: 400, by: 'rat', blow: 'basic', at: START + 60000 }, close: 0, deep: 640, falls: [] });
const HUNT_VIEW = Object.freeze({ session_id: 's7', ended: true, session: { id: 's7', hunt_id: M, ended_at: new Date(START + 7200000).toISOString(),
  entered_at: new Date(START).toISOString(), end_reason: 'stamina', risk_end: 'steady', danger_end: 632, tally: { kills: 50, report: REPORT } } });
const HERO = Object.freeze({ kills: 50, xp: { level: 9000 }, coins: 7000, loot_value: 2624, waste: 1900, balance: 7724,
  per_hour: { xp: 4500, gold: 4812, waste: 950, balance: 3862 } });
const EARNED = 'Gold/hr: 4,812 · Supplies/hr: 950';

/* the Hunts window's Risk pick, as tests/danger-client.mjs DC-9 draws it: a box with its buttons and lines */
const el = (a = {}) => ({ a: Object.assign({}, a), textContent: '', hidden: false, disabled: false,
  getAttribute(k) { return k in this.a ? this.a[k] : null; }, setAttribute(k, v) { this.a[k] = String(v); }, hasAttribute(k) { return k in this.a; }, removeAttribute(k) { delete this.a[k]; } });
function goldLineOf(X, sections, hunt = M) {
  const lines = { '.hw-stance-note': el(), '.hw-stance-depth': el(), '.hw-stance-gold': el() };
  const box = Object.assign(el(), { querySelectorAll: () => [], querySelector: (q) => lines[q] || null });
  X.PANE.patchStance({ querySelector: () => box }, { character: csOf(sections) }, { hunt, pending: false, follower: false });
  return lines['.hw-stance-gold'].textContent;
}

const ARMS = {
  'GE-RULE': async (X) => {
    const out = [];
    const e = (r, L) => X.GE.goldEstimate(M, r, L);
    if (e('steady', 63) !== 4900) out.push('Level 63 Steady reads ' + e('steady', 63) + ', want 4,900 (wage(63) = ' + X.W.wage(63) + ')');
    if (!(e('careful', 63) < e('steady', 63) && e('steady', 63) < e('bold', 63))) out.push('the Risks are out of order: ' + [e('careful', 63), e('steady', 63), e('bold', 63)]);
    if (e('steady', 76) !== e('steady', 75) || e('steady', 4000) !== e('steady', 75) || e('steady', 74) > e('steady', 75)) out.push('past the band top it does not stop: ' + [e('steady', 74), e('steady', 75), e('steady', 76), e('steady', 4000)]);
    if (e('steady', 54) !== null || e('steady', 1) !== null || e('steady', 55) === null) out.push('the band floor is not kept: ' + [e('steady', 1), e('steady', 54), e('steady', 55)]);
    if (X.GE.goldEstimate('mill_cellar', 'steady', 60) !== null || e('reckless', 60) !== null) out.push('an estimate off the scale or for an unknown Risk');
    if (X.GE.roundAbout(4886) !== 4900 || X.GE.roundAbout(640) !== 640 || X.GE.roundAbout(12345) !== 12000 || X.GE.roundAbout(99) !== 99 || X.GE.roundAbout(4850) !== 4900) {
      out.push('two figures reads ' + [4886, 640, 12345, 99, 4850].map(X.GE.roundAbout));
    }
    return out;
  },
  'GE-READ': async (X) => {
    const out = [];
    const cs = csOf({ gold_estimate: GOLD });
    const got = ['careful', 'steady', 'bold'].map((r) => X.GES.goldEstimateOf(cs, M, r));
    if (got.join() !== '3100,4900,6200') out.push('the section reads ' + got);
    const bad = csOf({ gold_estimate: { grounds: { [M]: { careful: -5, steady: 4900.5, bold: '6200' } } } });
    if (['careful', 'steady', 'bold'].some((r) => X.GES.goldEstimateOf(bad, M, r) !== null)) out.push('a bad value reads as gold');
    if (X.GES.goldEstimateOf(csOf({}), M, 'steady') !== null || X.GES.goldEstimateOf(cs, 'mill_cellar', 'steady') !== null
        || X.GES.goldEstimateOf(cs, M, 'toString') !== null) out.push('no section, another ground or a prototype key reads as gold');
    return out;
  },
  'GE-HUNTS': async (X) => {
    const out = [];
    const steady = goldLineOf(X, { danger: { risk: null, held: {}, playing: null }, gold_estimate: GOLD });
    if (steady !== 'Est. 4,900 gold/hr (before supplies)') out.push('a plan with no Risk reads ' + JSON.stringify(steady));
    const bold = goldLineOf(X, { danger: { risk: 'bold', held: {}, playing: null }, gold_estimate: GOLD });
    if (bold !== 'Est. 6,200 gold/hr (before supplies)') out.push('Bold reads ' + JSON.stringify(bold));
    if (goldLineOf(X, { danger: { risk: 'steady', held: {}, playing: null } }) !== '') out.push('a line before the section came');
    if (goldLineOf(X, { gold_estimate: GOLD }) !== '') out.push('a line before the danger section came (no Risk known)');
    if (goldLineOf(X, { danger: { risk: 'steady', held: {}, playing: null }, gold_estimate: UNDER }) !== '') out.push('a line under the band floor');
    return out;
  },
  'GE-REPORT': async (X) => {
    const out = [];
    const cs = csOf({ hunt: HUNT_VIEW });
    const s = X.SM.endedSessionOf(cs);
    const an = X.HSEC.analyzerFrom(csOf({}), { tier: 'basic', session: { id: 's7', hunt: M, report: REPORT }, hero: HERO });
    const f = X.HR.reportFacts(X.RS.reportFrom(REPORT), { hunt: M, risk: 'steady', step: 632, enteredMs: START });
    const card = X.HSUM.sanitizeSummary(X.SM.buildSummary(s, an, [], null, null, null, f));
    if (!card || card.goldH !== 4812 || card.wasteH !== 950) out.push('the card keeps ' + JSON.stringify(card && { goldH: card.goldH, wasteH: card.wasteH }));
    const lines = X.REP.riskLines(card.report, card.xpH, card).map((l) => l.text);
    if (lines[lines.length - 1] !== EARNED) out.push('the risk block ends on ' + JSON.stringify(lines[lines.length - 1]));
    if (!/^Held Depth/.test(lines[lines.length - 2] || '')) out.push('the earned line does not follow the cause line: ' + JSON.stringify(lines));
    /* off the scale: no cause line, so no earned line beside a number the Hunts window never showed */
    const tier = X.HR.reportFacts(X.RS.reportFrom(REPORT), { hunt: 'mill_cellar', risk: null, step: null, enteredMs: START });
    if (X.REP.riskLines(tier, null, card).some((l) => l.text === EARNED)) out.push('an earned line off the scale');
    /* the return card: from the stored card, and from the analyzer while it reads the session (no card yet) */
    const back = X.AWAY.awayBlockOf(csOf({}, [card]), { session: 's7', facts: { hunt: M } });
    if (!back.cause.endsWith(' ' + EARNED) || !/^Held Depth/.test(back.cause)) out.push('the return card reads ' + JSON.stringify(back.cause));
    const live = X.REC.earnRatesOf(csOf({ hunt_analyzer: { tier: 'basic', session: { id: 's8', hunt: M }, hero: HERO } }), 's8');
    if (!live || live.goldH !== 4812 || live.wasteH !== 950) out.push('the open hunt reads ' + JSON.stringify(live));
    if (X.REC.earnRatesOf(csOf({ hunt_analyzer: { tier: 'basic', session: { id: 's9', hunt: M }, hero: HERO } }), 's8') !== null) out.push('another session\'s rates were read');
    const unrated = Object.assign({}, HERO); delete unrated.per_hour;
    if (X.REC.earnRatesOf(csOf({ hunt_analyzer: { tier: 'basic', session: { id: 's8', hunt: M }, hero: unrated } }), 's8') !== null) out.push('an unrated hunt has rates');
    if (X.REP.earnedLine({ goldH: 4812, wasteH: null }) !== 'Gold/hr: 4,812' || X.REP.earnedLine(null) !== '') out.push('no supplies or no rates read wrong');
    const forged = X.HSUM.sanitizeSummary({ id: 's7', goldH: 'lots', wasteH: Infinity });
    if (forged.goldH !== null || forged.wasteH !== null) out.push('the residue kept a forged rate: ' + JSON.stringify(forged));
    return out;
  },
  'GE-WORDS': async (X) => {
    const out = [];
    const words = [X.HT.HUNTS_TEXT.gold_about, X.RT.REPORT_TEXT.earned, X.RT.REPORT_TEXT.earned_only, EARNED, 'Est. 4,900 gold/hr (before supplies)'];
    if (words.some((w) => typeof w !== 'string' || /wage/i.test(w) || /[;—–]/.test(w) || /:\s+[a-z]/.test(w))) out.push('a line says wage or is not plain: ' + JSON.stringify(words));
    return out;
  },
};

const MUTANTS = [
  ['the band top is not kept', 'GE-RULE', 'src/core/gold-estimate.js', 'Math.min(levelStep(level), g.top)', 'levelStep(level)'],
  ['the band floor is not kept', 'GE-RULE', 'src/core/gold-estimate.js', ' || levelStep(level) < g.floor) return null;', ') return null;'],
  ['the Risk is not read', 'GE-RULE', 'src/core/gold-estimate.js', '(wage(step) * GOLD_ESTIMATE.riskPm[risk]) / 1000', 'wage(step)'],
  ['a negative value reads as gold', 'GE-READ', 'src/session/gold-estimate-sections.js', 'Number.isSafeInteger(n) && n >= 0 ? n : null', 'typeof n === \'number\' ? n : null'],
  ['the Hunts window ignores the plan\'s Risk', 'GE-HUNTS', 'src/shell/windows/company-pane.js', 'goldEstimateOf(ctx.character, o.hunt, risk)', "goldEstimateOf(ctx.character, o.hunt, 'steady')"],
  ['the card keeps the balance as the gold', 'GE-REPORT', 'src/hunt-view/summary-model.js', 'goldH: ph ? ph.goldAndLoot : null', 'goldH: ph ? ph.balance : null'],
  ['the residue drops the gold an hour', 'GE-REPORT', 'src/session/hunt-summaries.js', 'goldH: num(v.goldH)', 'goldH: null'],
  ['the return card drops the earned line', 'GE-REPORT', 'src/shell/windows/away.js', 'earnedLine(earnRatesOf(cs, a.session))', "''"],
  ['the report drops the earned line', 'GE-REPORT', 'src/shell/hunt-report.js', "const earned = cause ? earnedLine(rates) : '';", "const earned = '';"],
];

async function runAll(X, only) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    let got;
    /* a throw is HARNESS, never its arm's red (tests/_mutant-verdict.mjs): a crash cannot score a mutant */
    try { got = await arm(X); } catch (e) { fails.push(harnessFail(id, e)); continue; }
    for (const g of got) fails.push(id + ' ' + g);
  }
  return fails;
}

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await runAll(await load(ROOT));
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `gold-estimate: ${fails.length} RED` : `gold-estimate: green (${Object.keys(ARMS).join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runAll(await load(ROOT));
  if (clean.length) { console.error('gold-estimate --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'gold-est-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 60))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      /* caught only by a line its arm named; a throw is HARNESS (exit 2), nothing at all an escape */
      const v = verdict(await runAll(await load(dir), arm));
      if (v.kind === 'caught') console.log(`  caught  ${name} (${v.rule}): ${v.line.slice(0, 140)}`);
      else if (v.kind === 'harness') { console.log(`  HARNESS ${name} (${arm}): ${v.why.slice(0, 140)}`); harness++; }
      else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(escaped || harness ? `gold-estimate --mutate: ${escaped} ESCAPED, ${harness} HARNESS`
    : `gold-estimate --mutate: ${MUTANTS.length}/${MUTANTS.length} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
