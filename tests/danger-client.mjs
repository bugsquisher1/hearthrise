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
// ════════════════════════════════════════════════════════════════════════
import { dangerOf, parseDanger, depthOf, onScale, STANCE_IDS } from '../src/session/danger-sections.js';
import { setRisk, riskOk } from '../src/session/danger-intents.js';
import { depthMark } from '../src/shell/widgets/hunt-topbar.js';
import { DANGER_GROUNDS, DEPTHS } from '../src/data/danger.js';
import { REFUSAL_WORDS } from '../src/data/refusal-words.js';
import { HUNTS_TEXT } from '../src/data/text/hunts.js';
import { HUD_TEXT } from '../src/data/text/hud.js';

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

console.log(fails ? 'danger-client: ' + fails + ' RED' : 'danger-client: all green');
process.exit(fails ? 1 : 0);
