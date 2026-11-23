#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/content-checklist.mjs — THE MOVE AND WEAPON CHECKLISTS READ THE DATA (lane/content-pipeline, 2026-11-22).
//
//   node tests/content-checklist.mjs
//
// tools/content-checklist.mjs prints what adding one move or one weapon takes (docs/design/redesign/24-content-pipeline.md sections
// 3.6 and 3.7), ticking what the data can answer. This holds the ticks to the data:
//   CL-1  every live move: its row, its icon and its words are ticked; a default-bar move names its role; a rune move names its family
//   CL-2  a move nobody wrote ticks nothing the data answers
//   CL-3  every discipline: its row, its role keys, its moves and its weapon line (a native weapon) are ticked, and its skill
//   CL-4  the Roads and Signature steps stay open while src/data/talents.js and src/data/signatures.js do not exist, and tick once a
//         full road and a Signature are planted (the contract of 24 section 4)
//   CL-5  the render marks each step [x], [ ], [-] or [?] and counts them
// ════════════════════════════════════════════════════════════════════════
import { load, moveSteps, weaponSteps, render } from '../tools/content-checklist.mjs';

const c = await load();
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const find = (steps, re) => steps.find((s) => re.test(s.what));

/* CL-1 */
for (const a of Object.values(c.abilities).filter((r) => r.active)) {
  const s = moveSteps(c, a.id);
  ok(find(s, /^The row/).done === true, 'CL-1 ' + a.id + ' row not ticked');
  ok(find(s, /^Its icon/).done === true, 'CL-1 ' + a.id + ' icon not ticked');
  ok(find(s, /^Its words/).done === true, 'CL-1 ' + a.id + ' words not ticked');
  const fam = find(s, /^Its rune family/);
  ok(a.rune ? fam.done === true : fam.done === null, 'CL-1 ' + a.id + ' rune family ' + fam.done + ' (rune ' + a.rune + ')');
}
ok(/\(mage\)/.test(find(moveSteps(c, 'fireball'), /^On an unedited bar/).what), 'CL-1 fireball is not on the mage\'s default bar');
/* CL-2 */
const none = moveSteps(c, 'no_such_move');
ok(none.every((s) => s.done !== true), 'CL-2 an unwritten move ticked: ' + none.filter((s) => s.done === true).map((s) => s.what).join(' | '));
/* CL-3 */
for (const [id, d] of Object.entries(c.disciplines)) {
  const s = weaponSteps(c, id);
  for (const re of [/^Its discipline/, /^Its role keys/, /^Its moves/]) ok(find(s, re).done === true, 'CL-3 ' + id + ' ' + re);
  if (d.weapon) { ok(find(s, /^Its line of weapons/).done === true, 'CL-3 ' + id + ' weapon line'); ok(find(s, /^Its skill/).done === true, 'CL-3 ' + id + ' skill'); }
}
ok(weaponSteps(c, 'spear').every((s) => s.done !== true), 'CL-3 an unwritten weapon ticked');
/* CL-4 */
const roadStep = (cc) => find(moveSteps(cc, 'fireball'), /^Its road/).done, sigStep = (cc) => find(moveSteps(cc, 'fireball'), /^Its Signature/).done;
if (!c.nodes) ok(roadStep(c) === false, 'CL-4 a road ticked with no talents.js');
if (!c.signatures) ok(sigStep(c) === false, 'CL-4 a Signature ticked with no signatures.js');
const planted = { ...c,
  nodes: [1, 2, 3, 4, 5].map((i) => ({ id: 'fb_r' + i, kind: 'rank', move: 'fireball' })).concat([1, 2].map((i) => ({ id: 'fb_x' + i, kind: 'crossroads', move: 'fireball', options: ['a', 'b', 'c'] }))),
  signatures: [{ id: 'hall_fire_wand', move: 'fireball', home: { kind: 'monster', id: 'x' } }] };
ok(roadStep(planted) === true && sigStep(planted) === true, 'CL-4 a full road and a Signature did not tick');
ok(roadStep({ ...planted, nodes: planted.nodes.slice(1) }) === false, 'CL-4 four rank stones ticked the road');
/* CL-5 */
const out = render('move', 'fireball', moveSteps(c, 'fireball'));
ok(/- \[x\] The row/.test(out) && /- \[\?\] Its share fitted/.test(out) && /steps the data can answer are done/.test(out), 'CL-5 render:\n' + out);

if (fails.length) { console.error('content-checklist: ' + fails.length + ' failed\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('content-checklist: ' + Object.values(c.abilities).filter((r) => r.active).length + ' moves and ' + Object.keys(c.disciplines).length + ' weapons tick from the data');
