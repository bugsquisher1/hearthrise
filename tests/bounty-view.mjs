#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/bounty-view.mjs — ONE FIGURE PER CONTRACT (CLAUDE.md §6, 2026-09-27)
//
//   node tests/bounty-view.mjs             # the case table
//   node tests/bounty-view.mjs --selftest  # each mutation of src/core/bounty.js must go red
//
// Every bounty surface prints bountyView(active, G._bountyServer).mark: the
// server's figure when the server has named THIS contract, else '—'. The
// attended counter is never a figure for a server-settled type; it only feeds
// attemptProgress ("does the player believe this is done", the retry timer).
// Pure: imports src/core/bounty.js and nothing else.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'core', 'bounty.js');

const cull = (x) => ({ id: 'b1', type: 'cull', target: 'goblin', required: 20, progress: 9, ...x });
const mirror = (x) => ({ spoke: true, bounty_id: 'b1', target: 'goblin', progress: 15, ...x });

/** Every case returns '' when it holds, or a sentence naming what broke. */
function cases(B) {
  const out = [];
  const check = (name, ok, got) => { if (!ok) out.push(`${name}: got ${JSON.stringify(got)}`); };
  let v = B.bountyView(cull(), null, {});
  check('unknown renders pending, never the attended 9', v.known === false && v.progress === null && v.mark === '—' && v.text === '— / 20', v);
  check('unknown is never claimable', v.claimable === false, v);
  v = B.bountyView(cull({ progress: 23 }), null, {});
  check('a local 23/20 is not a figure and not a Claim', v.mark === '—' && v.claimable === false && v.confirming === true, v);
  v = B.bountyView(cull(), mirror(), {});
  check('known 15/20 renders the server figure', v.known && v.progress === 15 && v.mark === '15' && v.text === '15 / 20' && !v.claimable, v);
  v = B.bountyView(cull(), mirror({ progress: 218 }), {});
  check('known 218 clamps to 20 and is claimable', v.progress === 20 && v.claimable === true, v);
  v = B.bountyView(cull(), mirror({ progress: 0 }), {});
  check('a server 0 is a real figure', v.known && v.mark === '0', v);
  v = B.bountyView(cull(), mirror({ bounty_id: 'b2' }), {});
  check('another contract\'s figure renders pending', v.known === false && v.mark === '—', v);
  v = B.bountyView(cull(), mirror({ target: 'wolf' }), {});
  check('a same-id, other-target figure renders pending', v.known === false, v);
  v = B.bountyView(cull(), { spoke: true, bounty_id: null, target: null, progress: null }, {});
  check('a server "no contract" renders pending', v.known === false && v.mark === '—', v);
  v = B.bountyView(cull(), mirror({ progress: 20 }), { inFlight: true });
  check('a turn-in in flight is not claimable', v.claimable === false && v.known && v.mark === '20', v);
  v = B.bountyView({ id: 'p', type: 'proof', target: 'goblin', required: 5, progress: 1 }, null, { proofHave: 4 });
  check('a client-settled type keeps its local figure', v.known && v.progress === 4 && v.mark === '4', v);
  v = B.bountyView(cull({ _acceptError: 'no_row' }), null, {});
  check('a refused accept is an orphan', v.orphan === true && v.mark === '—', v);
  check('attemptProgress takes the higher of local and server', B.attemptProgress(cull(), 0, 15) === 15 && B.attemptProgress(cull(), 0, null) === 9, [B.attemptProgress(cull(), 0, 15), B.attemptProgress(cull(), 0, null)]);
  let m = B.judgeServerBounty(null, null);
  check('a null projection is the server speaking', m && m.spoke === true && m.bounty_id === null, m);
  m = B.judgeServerBounty({ bounty_id: 'b1', target: 'goblin', progress: 'x' }, null);
  check('a malformed projection is refused', m === null, m);
  m = B.judgeServerBounty({ bounty_id: 'b1', target: 'goblin', progress: 12 }, mirror({ progress: 15 }));
  check('raise-only: a lower same-id figure never overwrites', m && m.progress === 15, m);
  m = B.judgeServerBounty({ bounty_id: 'b1', target: 'goblin', progress: 17 }, mirror({ progress: 15 }));
  check('a higher same-id figure lands', m && m.progress === 17, m);
  m = B.judgeServerBounty({ bounty_id: 'b2', target: 'wolf', progress: 3 }, mirror({ progress: 15 }));
  check('a different contract replaces', m && m.bounty_id === 'b2' && m.progress === 3, m);
  return out;
}

async function load(src) {
  const dir = mkdtempSync(join(tmpdir(), 'bounty-view-'));
  const f = join(dir, 'bounty.js');
  writeFileSync(f, src);
  try { return await import(pathToFileURL(f).href); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* Each arm rewrites ONE line of the shipped source; the table must go red. */
const ARMS = [
  ['m1 fall back to the local counter when unknown', /const raw = server \? mp : local;/, 'const raw = server && Number.isFinite(mp) ? mp : local;'],
  ['m2 drop the bounty_id/target identity check', /const named = [^\n]*;/, 'const named = !!mirror;'],
  ['m3 derive claimable from attemptProgress', /const claimable = [^\n]*;/, 'const claimable = attemptProgress(active, o.proofHave, named ? mp : null) >= req && !o.inFlight;'],
  ['m4 render 0 instead of the pending mark', /const mark = [^\n]*;/, "const mark = known ? String(progress) : '0';"],
  ['m5 let a lower same-id figure overwrite', /const keep = [^\n]*;/, 'const keep = null;'],
];

async function main() {
  const src = readFileSync(SRC, 'utf8');
  const fails = cases(await import(pathToFileURL(SRC).href));
  if (!process.argv.includes('--selftest')) {
    if (fails.length) { console.error('✗ bounty-view: ' + fails.length + ' case(s) red'); fails.forEach((f) => console.error('   ' + f)); return 1; }
    console.log('bounty-view: every case holds (one figure per contract: the server\'s, or pending).');
    return 0;
  }
  if (fails.length) { console.error('SELFTEST control: the shipped source is red; no arm proves anything.'); return 1; }
  let bad = 0;
  for (const [label, re, repl] of ARMS) {
    if (!re.test(src)) { bad++; console.error(`  FAIL ${label}: the line to mutate is gone (re-anchor the arm)`); continue; }
    const red = cases(await load(src.replace(re, repl)));
    if (red.length) console.log(`  ok   ${label} → red (${red[0].split(':')[0]})`);
    else { bad++; console.error(`  FAIL ${label}: the table stayed green`); }
  }
  if (bad) { console.error(`✗ bounty-view --selftest: ${bad} arm(s) not caught.`); return 1; }
  console.log(`bounty-view --selftest: control green, ${ARMS.length} arms red.`);
  return 0;
}

process.exitCode = await main();
