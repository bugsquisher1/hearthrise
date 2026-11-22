#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/danger-client.mjs — THE DANGER SCALE'S CLIENT HALF (lane/r1-danger-client; 1056-danger-scale.sql, 12-targets.md 2.6 and 3.1).
//
//   DC-1 dangerOf reads the server's `danger` section bounded: an unknown Risk reads null, a bad step drops, no section reads null
//   DC-2 depthOf shows "Depth N of 20" on the ground's band (floor 1, top 20, held 1..20), null off the scale: never the raw step
//   DC-3 setRisk sends ONE hr_hunt_risk_set with the slot and the word only, and the hero takes the envelope the answer carries
//   DC-4 setRisk refuses a word outside the catalogue without asking the server; a refusal re-reads the hero and carries the code
//   DC-5 the top bar's depth mark names the Risk the hunt stands at now and its depth, '' off the scale or with no hunt on it
//   DC-6 the player text is plain (no semicolons, no em dashes) and bad_risk has its own refusal line
//   DC-7 the Risk pick answers: every press the pane draws is routed to it by the Hunts window, a press sends its one intent, and the
//        pick names itself Risk on screen
//   DC-8 the top bar's depth sits in its own quiet mark (.ht-mark, the body face), never inside the ground's Cinzel name
//   DC-9 a plan with no Risk shows the server's default (Steady) pressed with its line, never "Pick a Risk"; the server's own stance wins
// ════════════════════════════════════════════════════════════════════════
import { dangerOf, parseDanger, depthOf, onScale, STANCE_IDS } from '../src/session/danger-sections.js';
import { setRisk, riskOk } from '../src/session/danger-intents.js';
import { depthMark } from '../src/shell/widgets/hunt-topbar.js';
import { DANGER_GROUNDS, DEPTHS, DEFAULT_RISK } from '../src/data/danger.js';
import { REFUSAL_WORDS } from '../src/data/refusal-words.js';
import { HUNTS_TEXT } from '../src/data/text/hunts.js';
import { HUD_TEXT } from '../src/data/text/hud.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const check = (id, ok, msg) => { if (!ok) { fails++; console.log('✗ ' + id + ' ' + msg); } else console.log('✓ ' + id + ' ' + msg); };
const csOf = (danger) => ({ slot: 0, status: 'ready', read: (k) => (k === 'danger' ? danger : undefined) });
const M = 'muster_barrows';
const band = DANGER_GROUNDS[M];

// DC-1
const d = parseDanger({ risk: 'steady', held: { [M]: 600, bad: -3, 'Bad Id': 5 }, playing: { hunt: M, from: 'bold', risk: 'steady', start: 560, step: 610, cool: 3 } });
check('DC-1', d.risk === 'steady' && d.held[M] === 600 && Object.keys(d.held).length === 1 && d.playing.risk === 'steady' && d.playing.from === 'bold' && d.playing.step === 610,
  'the section reads bounded: ' + JSON.stringify(d));
check('DC-1', parseDanger({ risk: 'reckless', held: {}, playing: null }).risk === null && dangerOf(csOf(undefined)) === null && dangerOf(csOf({ risk: null, held: {}, playing: null })).playing === null,
  'an unknown Risk reads null, a missing section reads null');

// DC-2
check('DC-2', onScale(M) && !onScale('mill_cellar') && depthOf('mill_cellar', 600) === null, 'only the scale grounds read a depth');
check('DC-2', depthOf(M, band.floorStep).depth === 1 && depthOf(M, band.topStep).depth === DEPTHS && depthOf(M, band.topStep).of === 20
  && depthOf(M, 0).depth === 1 && depthOf(M, 4000).depth === DEPTHS && depthOf(M, band.refStep).depth > 1 && depthOf(M, band.refStep).depth < DEPTHS,
  'floor is Depth 1, top Depth 20, middle between, held to the band: ' + JSON.stringify(depthOf(M, band.refStep)));
check('DC-2', depthOf(M, 590).depth !== 590 && depthOf(M, -1) === null && depthOf(M, 1.5) === null, 'never the raw step, a bad step reads null');

// DC-3
const sent = []; let loaded = null;
const cs = { slot: 2, status: 'ready', read: () => undefined, load: async (env) => { loaded = env; return true; }, resync: async () => { loaded = 'resync'; } };
const env = { danger: { risk: 'steady', held: {}, playing: null } };
const account = { server: { rpc: async (name, args) => { sent.push([name, args]); return { ok: true, body: { ok: true, risk: 'steady', envelope: env } }; } }, characters: () => [cs] };
const r = await setRisk(account, cs, 'steady');
check('DC-3', r.ok && sent.length === 1 && sent[0][0] === 'hr_hunt_risk_set' && sent[0][1].p_slot === 2 && sent[0][1].p_risk === 'steady'
  && Object.keys(sent[0][1]).sort().join() === 'p_idem,p_risk,p_slot' && loaded === env, 'one intent, slot and word only, the envelope taken: ' + JSON.stringify(sent));

// DC-4
sent.length = 0;
const bad = await setRisk(account, cs, 'reckless');
check('DC-4', !bad.ok && bad.error === 'bad_intent' && sent.length === 0 && riskOk('none') && STANCE_IDS.every(riskOk), 'a word off the catalogue never reaches the server');
const refusing = { server: { rpc: async () => ({ ok: true, body: { ok: false, error: 'not_leader' } }) }, characters: () => [cs] };
loaded = null;
const no = await setRisk(refusing, cs, 'bold');
check('DC-4', !no.ok && no.error === 'not_leader' && loaded === 'resync', 'a refusal re-reads the hero and carries the code');

// DC-5
const mark = depthMark(csOf({ risk: 'bold', held: {}, playing: { hunt: M, from: 'bold', risk: 'steady', start: 460, step: band.topStep, cool: 0 } }), M);
check('DC-5', mark === 'Steady, Depth 20 of 20' && !/710/.test(mark), 'the top bar reads the Risk now and the depth: "' + mark + '"');
check('DC-5', depthMark(csOf({ risk: 'steady', held: {}, playing: null }), M) === '' && depthMark(csOf(undefined), M) === '', 'nothing without a scale hunt');

// DC-6
const words = Object.entries(HUNTS_TEXT).filter(([k]) => /^(stance_|depth_|head_stance)/.test(k)).concat([['hud.depth_now', HUD_TEXT.depth_now]]);
check('DC-6', words.length >= 10 && words.every(([, v]) => typeof v === 'string' && !/[;—]/.test(v)), 'the Risk text is plain');
check('DC-6', typeof REFUSAL_WORDS.bad_risk === 'string' && STANCE_IDS.every((id) => typeof HUNTS_TEXT['stance_' + id] === 'string'), 'bad_risk and each Risk have words');

// DC-7 (R7 art pass 2026-11-22, played on the local world: Careful, Steady and Bold were drawn on Muster's page and pressing one did
// nothing, the Hunts window routed only Go as and the plan's press to the pane)
const pane = await import('../src/shell/windows/company-pane.js');
const drawn = [...(pane.stanceHtml() + pane.planHtml()).matchAll(/data-hs-act="([a-z-]+)"/g)].map((m) => m[1]);
check('DC-7', drawn.includes('stance') && drawn.every((a) => pane.PLAN_ACTS.includes(a)), 'every press the pane draws is one it answers: ' + JSON.stringify(drawn));
const huntsSrc = readFileSync(new URL('../src/shell/windows/hunts.js', import.meta.url), 'utf8');
check('DC-7', /if \(PLAN_ACTS\.includes\(action\)\) return actPlan\(/.test(huntsSrc), 'the Hunts window hands every one of them to the pane');
sent.length = 0;
const sc7 = {};
const csd = { slot: 2, status: 'ready', read: (k) => (k === 'danger' ? { risk: null, held: {}, playing: null } : undefined), load: async () => true, resync: async () => {} };
const took = pane.actPlan({ character: csd, account }, sc7, () => {}, 'stance', { getAttribute: (k) => (k === 'data-risk' ? 'steady' : null) });
for (let i = 0; i < 20 && !sent.length; i++) await new Promise((res) => setTimeout(res, 5));
check('DC-7', took === true && sent.length === 1 && sent[0][0] === 'hr_hunt_risk_set' && sent[0][1].p_risk === 'steady', 'a Risk press sends its one intent: ' + JSON.stringify(sent));
check('DC-7', /class="hw-stance-k"[^>]*>Risk</.test(pane.stanceHtml()), 'the pick says Risk on screen, not only to a screen reader');

// DC-8 (R7 art pass: "THE MUSTER BARROWS (STEADY, DEPTH 1 OF 20)" in the name's Cinzel capitals)
const barSrc = readFileSync(new URL('../src/shell/widgets/hunt-topbar.js', import.meta.url), 'utf8');
const huntCss = readFileSync(new URL('../src/styles/hunt.css', import.meta.url), 'utf8');
const nameLine = barSrc.split('\n').find((l) => l.includes("text(el.querySelector('.ht-name')")) || '';
check('DC-8', /<span class="ht-name"><\/span><span class="ht-mark"><\/span>/.test(barSrc) && /text\(el\.querySelector\('\.ht-mark'\), [^\n]*marks\.join/.test(barSrc)
  && !/marks|hard/.test(nameLine), 'the depth is written to .ht-mark, the name line holds the name only: ' + nameLine.trim().slice(0, 120));
check('DC-8', /\.ht-mark \{[^}]*font-family: var\(--f-ui\)/.test(huntCss), 'the mark is in the body face');

// DC-9 (lane R5): a plan with no Risk plays the server's default on a scale ground (1057-danger-falls.sql hr_danger_freeze, DEFAULT_RISK),
// so the pick shows Steady pressed with Steady's line, never "Pick a Risk"; the server's own stance still wins
const el = (a = {}) => ({ a: Object.assign({}, a), textContent: '', hidden: false, disabled: false,
  getAttribute(k) { return k in this.a ? this.a[k] : null; }, setAttribute(k, v) { this.a[k] = String(v); }, hasAttribute(k) { return k in this.a; }, removeAttribute(k) { delete this.a[k]; } });
const pickOf = (danger) => {
  const btns = STANCE_IDS.map((id) => el({ 'data-risk': id })), note = el(), depth = el();
  const box = Object.assign(el(), { querySelectorAll: () => btns, querySelector: (q) => (q === '.hw-stance-note' ? note : q === '.hw-stance-depth' ? depth : null) });
  pane.patchStance({ querySelector: () => box }, { character: csOf(danger) }, { hunt: M, pending: false, follower: false });
  return { pressed: btns.filter((b) => b.a['aria-pressed'] === 'true').map((b) => b.a['data-risk']), note: note.textContent, depth: depth.textContent };
};
const none = pickOf({ risk: null, held: {}, playing: null });
check('DC-9', none.pressed.join() === DEFAULT_RISK && DEFAULT_RISK === 'steady' && none.note === HUNTS_TEXT.stance_line_steady && !/Pick a Risk/.test(none.note),
  'no stance shows the default pressed: ' + JSON.stringify(none));
const bold = pickOf({ risk: 'bold', held: {}, playing: null });
check('DC-9', bold.pressed.join() === 'bold' && bold.note === HUNTS_TEXT.stance_line_bold, 'the server\'s stance wins: ' + JSON.stringify(bold));
check('DC-9', pickOf(undefined).pressed.length === 0, 'no section, nothing pressed');

// DC-10 (visual pass 2: 'Held depth: Depth 1 of 20' said depth twice; Tyler's label rule): the depth this hero last held, one short label
const held = pickOf({ risk: null, held: { [M]: 590 }, playing: null }).depth;
check('DC-10', /^Last held Depth \d+ of 20$/.test(held) && !/depth\W+depth/i.test(held), 'the held line reads ' + JSON.stringify(held));

// DC-11 (Tyler's label rule, 11-14, re-said 11-22): the Risk pick's lines are short labels, never sentences or colon-joined clauses
const pickLines = ['stance_line_careful', 'stance_line_steady', 'stance_line_bold', 'stance_next', 'stance_leader', 'stance_reading', 'depth_new'].map((k) => HUNTS_TEXT[k]);
check('DC-11', pickLines.every((s) => typeof s === 'string' && !/[.!?]\s|[.;:—–]$|:\s[a-z]/.test(s)), 'the pick\'s lines read ' + JSON.stringify(pickLines));

console.log(fails ? 'danger-client: ' + fails + ' RED' : 'danger-client: all green');
process.exit(fails ? 1 : 0);
