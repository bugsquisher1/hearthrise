#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-report.mjs — THE HUNT REPORT ON THE END CARD READS ONLY THE SERVER'S COUNTERS (lane/c-hunt-report, build plan FB-7; GR-66).
//   src/session/report-sections.js (the server's report, typed), src/hunt-view/hunt-report.js (the facts a card keeps),
//   src/session/hunt-summaries.js (the residue's bound), src/shell/hunt-report.js (the words).
//
//   node tests/hunt-report.mjs            the guard (pure Node: the real modules, no browser, no database)
//   node tests/hunt-report.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/hunt-view/hunt-report.js src/shell/hunt-report.js src/session/report-sections.js src/session/hunt-summaries.js src/hunt-view/summary-model.js src/session/hunt-sections.js src/hunt-view/summary-recorder.js src/shell/windows/away.js
// ci-step: client-guards | The hunt report reads the server's counters, the same card viewed and closed, plain words, bounded in the residue
// ci-run: node tests/hunt-report.mjs
// ci-run: node tools/mutant-gate.mjs node tests/hunt-report.mjs --mutate
//
//   HR-FACTS     one server report, its death row and its end: the word, the lowest health with monster and blow, the close calls, what
//                ran dry and how far in, each death's Level XP with what Blessings saved, each bar slot's uses, share of the damage or the
//                healing, and why a slot never fired (its most frequent wait, else its condition was never true)
//   HR-DOORS     THE SAME BLOCK VIEWED AND CLOSED: the report read off the `hunt` section (the card recorded at the end, the hunt
//                viewed) and off the free analyzer's session block (an earlier hunt's card read on return, the browser closed) give the
//                same facts and the same lines; an old hunt with no report shows no block
//   HR-WORDS     the lines are genre labels (no semicolon or dash; a colon only as "Label: value", never joining clauses, Tyler
//                2026-11-14, the GE-WORDS rule: the earned line's "Gold/hr: 4,812" passes), the word first, the swing and the spell in the house's
//                voice, a death's hunting time from the hunt's own Level XP an hour, the change line with what the slot did before
//   HR-CAUSE     THE CAUSE LINE on the Danger scale (lane R5): from a fixture hunt section with the report's `deep` and two `falls` and the
//                session's risk_end / danger_end, "Held Depth 14 of 20 on Steady. The deepest it went was Depth 15 of 20. Fell back 2
//                times. Last time Bran was down to 23% from a Giant Rat.", the same off the free analyzer (browser closed), off the
//                stored card and on the return card, the open hunt's from the `danger` section; a death, a nameless fall, none, the
//                cap's "or more"; nothing off the scale; depths only (a forged step-sized depth is dropped by the residue)
//   HR-RESIDUE   the card keeps the facts through the residue's bound, and a forged or oversized report is cut to its bound or dropped
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
  return { RS: await u('src/session/report-sections.js'), HR: await u('src/hunt-view/hunt-report.js'), HSUM: await u('src/session/hunt-summaries.js'),
    W: await u('src/shell/hunt-report.js'), HSEC: await u('src/session/hunt-sections.js'), SM: await u('src/hunt-view/summary-model.js'),
    REC: await u('src/hunt-view/summary-recorder.js'), AWAY: await u('src/shell/windows/away.js') };
}

/* NOT A LABEL (Tyler 2026-11-14, as tests/gold-estimate.mjs GE-WORDS): a semicolon or a dash, or a colon that joins clauses (lower case after it).
   "Gold/hr: 4,812" and "Held Depth 14 of 20" pass; "used 6 times: it did 30% of healing" does not. */
const unplain = (s) => typeof s !== 'string' || /[;—–]/.test(s) || /:\s+[a-z]/.test(s);

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
/* ON THE DANGER SCALE (1057-danger-falls.sql): the same report on Muster Barrows with its deepest step and two falls back, as hr_hunt_view
   projects them (each fall's seat named), and the session's end stance. Muster's band is 480..710 (src/data/danger.js): step 650 is Depth 15,
   632 Depth 14. */
const MUSTER = 'muster_barrows';
const SCALE = Object.freeze(Object.assign({}, SERVER, { deep: 650, falls: [
  { at: START + 600000, from: 640, to: 622, hero: 1, pm: 300, monster: 'rat', name: 'Ash' },
  { at: START + 900000, from: 650, to: 632, hero: 0, pm: 230, monster: 'rat', name: 'Bran' }] }));
const HUNT_VIEW = Object.freeze({ session_id: 's7', ended: true, session: { id: 's7', hunt_id: MUSTER, ended_at: new Date(START + 7200000).toISOString(),
  end_reason: 'stamina', risk_end: 'steady', danger_end: 632, tally: { kills: 50, report: SCALE } } });
const CAUSE = 'Held Depth 14 of 20 (Steady) · Deepest Depth 15 of 20 · Fell back 2 times (last Bran at 23%, Giant Rat)';

const ARMS = {
  'HR-FACTS': async (X) => {
    const out = [];
    const f = X.HR.reportFacts(X.RS.reportFrom(SERVER), { deaths: DEATHS, reason: 'heals_out', enteredMs: START });
    const want = {
      word: 'near', low: [63, 'rat', 'basic'], close: 2, dry: [['cooked_shrimp', 4500000]], ranOut: 'heals_out', deaths: [[5000, 1250, 1]],
      rules: [['e0001aa01', 'power_strike', 0, 40, '', 'd', 400], ['e0001bb02', 'mend', 1, 0, 'cooldown', '', -1],
        ['d_food', 'cooked_shrimp', 2, 6, '', 'h', 1000], ['d_drink', 'thin_turnip_juice', 3, 0, 'never_true', '', -1]],
      depth: null,
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
    const want = ['Near death', 'Lowest health 6% (Giant Rat)', '2 close calls under 25% health', 'Out of Cooked Shrimp at 1 h 15 min',
      'Hunt ended · Out of food', 'Death cost 5,000 Level XP (about 30 min of hunting)', 'Blessings saved 1,250 Level XP'];
    if (JSON.stringify(risk) !== JSON.stringify(want)) out.push('the risk block reads ' + JSON.stringify(risk) + '\n      want ' + JSON.stringify(want));
    if (!X.W.riskLines(f, 10000)[0].word) out.push('the word is not the first line');
    if (rules.length !== 4 || rules[0] !== 'Power Strike used 40 times · 40% of damage' || rules[2] !== 'Mend never used (on cooldown)'
        || !/ never used \(condition never met\)$/.test(rules[3])) out.push('the rules block reads ' + JSON.stringify(rules));
    const spell = X.W.riskLines(X.HR.reportFacts(X.RS.reportFrom({ low: { pm: 900, by: 'rat', blow: 'gnaw', at: 1 } }), {}), null).map((l) => l.text);
    if (spell[0] !== 'Safe' || !/^Lowest health 90% \(Giant Rat, .+\)$/.test(spell[1]) || spell[2] !== 'No close calls') out.push('a spell\'s fall reads ' + JSON.stringify(spell));
    /* the change line: slot 1's rule is new since the last hunt here, and the old hunt's Power Strike did 14% */
    const prev = { rules: [['e0000old1', 'power_strike', 0, 10, '', 'd', 140], ['e0001bb02', 'mend', 1, 2, '', 'h', 500]] };
    const ch = X.W.rulesLines(f, prev).map((l) => l.text);
    if (ch[ch.length - 1] !== 'Slot 1 changed to Power Strike · 40% of damage (was 14%)') out.push('the change line reads ' + JSON.stringify(ch[ch.length - 1]));
    if (X.W.rulesLines(f, { rules: f.rules }).length !== 4) out.push('an unchanged bar has a change line');
    /* a Label: value colon is the genre's own (the earned line), so it is in the list and must pass */
    const all = [...risk, ...rules, ...spell, ...ch, X.W.earnedLine({ goldH: 4812, wasteH: 950 })];
    if (all.some(unplain)) out.push('a line has a semicolon, a dash or a colon joining clauses: ' + all.find(unplain));
    return out;
  },
  'HR-CAUSE': async (X) => {
    const out = [];
    /* the ended hunt's card, from the `hunt` section (hr_hunt_view: its report's deep and falls, its risk_end and danger_end) */
    const csOf = (sections, cards) => ({ slot: 0, read: (k) => sections[k], record: { residue: { huntSummaries: cards || [] } } });
    const cs = csOf({ hunt: HUNT_VIEW });
    const s = X.SM.endedSessionOf(cs);
    if (!s || s.riskEnd !== 'steady' || s.dangerEnd !== 632 || s.hunt !== MUSTER) out.push('the ended session reads ' + JSON.stringify(s && { riskEnd: s.riskEnd, dangerEnd: s.dangerEnd, hunt: s.hunt }));
    const viewed = X.REC.depthFactsOf(cs, 's7');
    const want = { risk: 'steady', held: 14, deep: 15, of: 20, n: 2, last: ['Bran', 230, 'rat'] };
    if (JSON.stringify(viewed) !== JSON.stringify(want)) out.push('the depth facts read ' + JSON.stringify(viewed) + '\n      want ' + JSON.stringify(want));
    if (X.W.causeLine(viewed) !== CAUSE) out.push('the cause line reads ' + JSON.stringify(X.W.causeLine(viewed)) + '\n      want ' + JSON.stringify(CAUSE));
    /* the browser closed: the free analyzer's session block (risk_end / danger_end beside the report) gives the same facts */
    const an = X.HSEC.analyzerFrom({ read: () => null }, { tier: 'basic', session: { id: 's7', hunt: MUSTER, report: SCALE, risk_end: 'steady', danger_end: 632 }, hero: { kills: 50, xp: { level: 100 } } });
    const closed = an && an.session ? X.HR.reportFacts(X.RS.reportFrom(an.session.report), { hunt: an.session.hunt, risk: an.session.riskEnd, step: an.session.dangerEnd }) : null;
    if (!closed || JSON.stringify(closed.depth) !== JSON.stringify(want)) out.push('the closed door reads ' + JSON.stringify(closed && closed.depth));
    /* the risk block ends on the cause line, and the card keeps it through the residue */
    const f = X.HR.reportFacts(X.RS.reportFrom(SCALE), { hunt: MUSTER, risk: 'steady', step: 632 });
    const lines = X.W.riskLines(f, null).map((l) => l.text);
    if (lines[lines.length - 1] !== CAUSE) out.push('the risk block ends on ' + JSON.stringify(lines[lines.length - 1]));
    const card = X.HSUM.sanitizeSummary({ id: 's7', hunt: MUSTER, report: f });
    if (JSON.stringify(card.report.depth) !== JSON.stringify(want)) out.push('the residue changed the depth facts: ' + JSON.stringify(card.report.depth));
    const stored = X.REC.depthFactsOf(csOf({}, [card]), 's7');
    if (X.W.causeLine(stored) !== CAUSE) out.push('the card\'s stored facts read ' + JSON.stringify(X.W.causeLine(stored)));
    /* the return card's hero row says it (src/shell/windows/away.js awayBlockOf `cause`); a work line has none */
    const back = X.AWAY.awayBlockOf(csOf({}, [card]), { session: 's7', facts: { hunt: MUSTER } });
    if (back.cause !== CAUSE) out.push('the return card reads ' + JSON.stringify(back.cause));
    if (X.AWAY.awayBlockOf(csOf({}, [card]), { session: 's7', work: 'w1', facts: {} }).cause !== '') out.push('a work line on the return card has a cause line');
    /* the open hunt (the return card while it still runs): the `danger` section's playing Risk and step */
    const open = csOf({ hunt: { session_id: 's8', session: { id: 's8', hunt_id: MUSTER, tally: { report: SCALE } } },
      danger: { risk: 'bold', held: {}, playing: { hunt: MUSTER, from: 'bold', risk: 'steady', start: 600, step: 650, cool: 0 } } });
    const live = X.W.causeLine(X.REC.depthFactsOf(open, 's8'));
    if (!/^Held Depth 15 of 20 \(Steady\), deepest reached · Fell back 2 times \(last /.test(live)) out.push('the open hunt reads ' + JSON.stringify(live));
    /* one fall that was a death, a fall with no name and an unknown monster, none at all */
    const one = (fall) => X.W.causeLine(X.HR.depthFacts(X.RS.reportFrom({ deep: 650, falls: [fall] }), { hunt: MUSTER, risk: 'careful', step: 650 }));
    if (one({ at: 1, from: 650, to: 530, hero: 2, pm: 0, monster: 'rat', name: 'Cole' }) !== 'Held Depth 15 of 20 (Careful), deepest reached · Fell back once · Cole killed by Giant Rat') out.push('a death reads ' + JSON.stringify(one({ at: 1, from: 650, to: 530, pm: 0, monster: 'rat', name: 'Cole' })));
    if (!/Fell back once · Hero at 9% \(unknown\)$/.test(one({ at: 1, from: 650, to: 632, pm: 95, monster: 'unknown' }))) out.push('a nameless fall reads ' + JSON.stringify(one({ at: 1, from: 650, to: 632, pm: 95, monster: 'unknown' })));
    if (!/Never fell back$/.test(X.W.causeLine(X.HR.depthFacts(X.RS.reportFrom({ deep: 650 }), { hunt: MUSTER, risk: 'steady', step: 640 })))) out.push('no falls says nothing of them');
    /* the cap: the server keeps the last 12, so 12 reads as "or more" */
    const twelve = Array.from({ length: 12 }, (_, i) => ({ at: i + 1, from: 650, to: 632, pm: 200, monster: 'rat', name: 'Bran' }));
    if (!/Fell back 12\+ times \(last /.test(X.W.causeLine(X.HR.depthFacts(X.RS.reportFrom({ deep: 650, falls: twelve }), { hunt: MUSTER, risk: 'steady', step: 640 })))) out.push('the cap is not said');
    /* off the scale, or a forged step-sized depth in the residue: no line */
    if (X.HR.reportFacts(X.RS.reportFrom(SCALE), { hunt: 'mill_cellar', risk: 'steady', step: 632 }).depth !== null) out.push('a tier ground has depth facts');
    if (X.W.causeLine(null) !== '') out.push('no facts make a line');
    const forged = X.HSUM.sanitizeSummary({ id: 's7', report: Object.assign({}, f, { depth: Object.assign({}, want, { held: 632, deep: 650 }) }) });
    if (forged.report.depth !== null) out.push('the residue kept a raw step as a depth: ' + JSON.stringify(forged.report.depth));
    /* depths only, plain words */
    const all = [CAUSE, live];
    if (all.some((x) => unplain(x) || /\b6[0-9]{2}\b/.test(x))) out.push('a cause line has a step, a semicolon, a dash or a colon joining clauses: ' + JSON.stringify(all));
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
  ['the cause line names the oldest fall, not the newest', 'HR-CAUSE', 'src/hunt-view/hunt-report.js', 'falls.length ? falls[falls.length - 1] : null', 'falls.length ? falls[0] : null'],
  ['the held depth is the raw step', 'HR-CAUSE', 'src/hunt-view/hunt-report.js', 'held: held ? held.depth : null', 'held: held ? o.step : null'],
  ['the server\'s falls are not read', 'HR-CAUSE', 'src/session/report-sections.js', 'falls: fallsOf(raw.falls)', 'falls: []'],
  ['the ended session\'s stance is not read', 'HR-CAUSE', 'src/hunt-view/summary-model.js', 'riskEnd: id(s.risk_end)', 'riskEnd: null'],
  ['the closed door\'s stance is not read', 'HR-CAUSE', 'src/session/hunt-sections.js', 'riskEnd: word(s.risk_end)', 'riskEnd: null'],
  ['the open hunt ignores the danger section', 'HR-CAUSE', 'src/hunt-view/summary-recorder.js', 'live = p && p.hunt === s.hunt ? p : null', 'live = null'],
  ['the cap is not said', 'HR-CAUSE', 'src/shell/hunt-report.js', 'd.n >= HUNT_REPORT.fallsMax', 'd.n > HUNT_REPORT.fallsMax'],
  ['the residue keeps a step as a depth', 'HR-CAUSE', 'src/session/hunt-summaries.js', 'n >= 1 && n <= of ? n : null', 'n >= 1 ? n : null'],
  ['the return card drops the cause line', 'HR-CAUSE', 'src/shell/windows/away.js', "const depthWords = hunt && cs && a.session ? causeLine(depthFactsOf(cs, a.session)) : '';", "const depthWords = '';"],
  ['a line joins clauses on a colon (labels, Tyler 2026-11-14)', 'HR-WORDS', 'src/data/text/report.js', "other: '{what} used {count} times · {pct}% of healing' }", "other: '{what} used {count} times: it did {pct}% of healing' }"],
  ['a report with only a low reads as none','HR-FACTS', 'src/session/report-sections.js', "if (!isObj(raw) || !Object.keys(raw).length) return null;", "if (!isObj(raw) || !raw.fired) return null;"],
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
    console.log(fails.length ? `hunt-report: ${fails.length} RED` : `hunt-report: green (${Object.keys(ARMS).join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runAll(await load(ROOT));
  if (clean.length) { console.error('hunt-report --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-rep-'));
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
  console.log(escaped || harness ? `hunt-report --mutate: ${escaped} ESCAPED, ${harness} HARNESS`
    : `hunt-report --mutate: ${MUTANTS.length}/${MUTANTS.length} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
