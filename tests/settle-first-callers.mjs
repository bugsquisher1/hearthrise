#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-first-callers.mjs — EVERY CLIENT-DIRECT SENDER OF A SETTLE-GATED
//                                  RPC GOES THROUGH THE ONE HANDLER (2026-09-28)
//
//   node tests/settle-first-callers.mjs             the guard
//   node tests/settle-first-callers.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// 2026-09-28-settle-before-mutate.sql makes twelve client-direct value RPCs
// refuse `settle_first` / `party_hunt_running` while the character's window is
// unsettled. The client half (Security SEC_SETTLE_BEFORE_MUTATE_F2F3 row 1b)
// routes those refusals into ONE handler — src/net/settle-first.js
// `withSettleFirstRetry`: wait for the server's settle, re-send the same intent
// once, then say the realm's words. A thirteenth caller written next month with
// a bare `fetch` would bring back the generic error this lane removed, and
// nothing in the in-page suite would notice (its RPCs are stubbed per test).
// So this holds the SHAPE:
//
//   SF-1  the handler's list (SETTLE_GATED_RPCS) is exactly the eleven below
//         (hr_claim_daily left the client surface with the daily board).
//   SF-2  every code (not comment) string literal naming one of the eleven lives
//         in a registered sender file, the registered number of times. A new
//         sender is red until it is wired and registered here.
//   SF-3  every registered sender carries its wiring: the send sits inside the
//         handler, and the unwrapped primitive is reachable only from it.
//   SF-4  every claim/shop surface marks its controls `data-hr-settle-latch`, so
//         the boot-settle latch (§6) can hold them.
//
// Text-only, credential-free, milliseconds. --selftest plants one defect per
// rule (and per wiring shape) and requires each to be caught by its named rule,
// plus a negative control (a comment-only mention) that must stay silent.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const GATED = [
  'hr_claim_quest', 'hr_claim_goal', 'hr_claim_milestone', 'hr_claim_rank',
  'hr_credit_kills', 'hr_trait_buy', 'raid_claim', 'world_event_claim',
  'hr_set_auto_eat', 'hr_bank_move', 'hr_farm_harvest',
];

/* file → { literals: {rpc: count}, wire: [[label, predicate(code)]] } */
const count = (code, s) => code.split(s).length - 1;
export const SENDERS = {
  'src/net/goal-claim.js': {
    literals: { hr_claim_quest: 1, hr_claim_goal: 1, hr_claim_milestone: 1,
      hr_claim_rank: 1, hr_credit_kills: 1, hr_set_auto_eat: 1 },
    wire: [
      ['call() routes gated verbs through the handler',
        (c) => /SF\.withSettleFirstRetry\(function \(\) \{ return callOnce\(name, body\); \}\)/.test(c)],
      ['callOnce is reached only from call()', (c) => count(c, 'callOnce(') === 3],
      ['every gated verb is in SETTLE_GATED', (c) => {
        const m = c.match(/var SETTLE_GATED = \{([^}]*)\}/);
        return !!m && ['hr_claim_quest', 'hr_claim_goal', 'hr_claim_milestone',
          'hr_claim_rank', 'hr_credit_kills', 'hr_set_auto_eat'].every((n) => new RegExp('\\b' + n + ':').test(m[1]));
      }],
      ['no gated verb is sent through callOnce directly', (c) => !/callOnce\('/.test(c)],
    ],
  },
  'src/features/muster.js': {
    literals: { world_event_claim: 3 },
    wire: [
      ['the claim is sent from `send`', (c) => /var send = function \(\) \{ return rpc\('world_event_claim', claimBody\); \};/.test(c)],
      ['`send` goes through the handler', (c) => /SF\.withSettleFirstRetry\(send\)/.test(c)],
      ['no other world_event_claim send', (c) => count(c, "rpc('world_event_claim'") === 1],
    ],
  },
  'src/features/raids.js': {
    literals: { raid_claim: 3 },
    wire: [
      ['the claim is sent from `send`', (c) => /var send = function \(\) \{ return rpc\('raid_claim', claimBody\); \};/.test(c)],
      ['`send` goes through the handler', (c) => /SF\.withSettleFirstRetry\(send\)/.test(c)],
      ['no other raid_claim send', (c) => count(c, "rpc('raid_claim'") === 1],
    ],
  },
  'src/net/farm-sync.js': {
    literals: { hr_farm_harvest: 1 },
    wire: [
      ['the harvest is sent inside the handler',
        (c) => /withSettleFirstRetry\(\(\) => callFarmRpc\('hr_farm_harvest', body, o\)\)/.test(c)],
    ],
  },
  'src/net/bank-sync.js': {
    literals: { hr_bank_move: 1 },
    wire: [
      ['bankMove goes through the handler', (c) => /withSettleFirstRetry\(\(\) => postBankMove\(f, cfg, body\)\)/.test(c)],
      ['postBankMove is reached only from the handler', (c) => count(c, 'postBankMove(') === 2],
    ],
  },
  'src/net/gold.js': {
    literals: { hr_trait_buy: 1 },
    wire: [
      ['buyTrait goes through the handler', (c) => /withSettleFirstRetry\(\(\) => buyTraitOnce\(traitId, key\)\)/.test(c)],
      ['buyTraitOnce is reached only from the handler', (c) => count(c, 'buyTraitOnce(') === 2],
    ],
  },
};

export const LATCH_SURFACES = [
  'src/legacy.js',                  // daily/weekly goal claim
  'src/features/collection-log.js', // milestone claim
  'src/features/renown.js',         // rank claim
  'src/render/shop.js',             // trait buy
  'src/render/bank-panel.js',       // bank move
  'src/screens/farm.js',            // harvest
  'src/settings-page.js',           // auto-eat toggle
  'src/features/muster.js',         // rally chest
  'src/features/raids.js',          // raid chest
];

/* Comments out, strings kept: a name in prose is not a sender. Quote-aware, so a
   URL's `//` inside a string is not a comment. */
export function stripComments(t) {
  let out = '', i = 0, q = null;
  while (i < t.length) {
    const ch = t[i], two = t.slice(i, i + 2);
    if (q) {
      out += ch;
      if (ch === '\\') { out += t[i + 1] || ''; i += 2; continue; }
      /* A quote or a newline closes it: '…' and "…" cannot span lines, so a quote
         inside a regex literal costs one line of accuracy, never the file. */
      if (ch === q || (ch === '\n' && q !== '`')) q = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; out += ch; i++; continue; }
    if (two === '//') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (two === '/*') { i += 2; while (i < t.length && t.slice(i, i + 2) !== '*/') { if (t[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    out += ch; i++;
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

/* Test fixtures stub these RPCs by URL; the census rows and the handler's own
   list name them as data. None of them sends anything. */
const EXEMPT = /^src\/(features\/smoke(-test\.js|\/)|net\/settle-first\.js$|net\/gold-sites\.js$|net\/gem-sites\.js$|data\/)/;

export function loadTree() {
  const files = {};
  for (const f of walk(join(ROOT, 'src'))) files[f] = readFileSync(join(ROOT, f), 'utf8');
  return files;
}

export function check(files) {
  const findings = [];
  const red = (rule, msg) => findings.push({ rule, msg });

  const sf = files['src/net/settle-first.js'] || '';
  const m = sf.match(/SETTLE_GATED_RPCS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  const listed = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort() : [];
  if (JSON.stringify(listed) !== JSON.stringify([...GATED].sort())) {
    red('SF-1', 'settle-first.js SETTLE_GATED_RPCS is ' + JSON.stringify(listed) + ', expected the eleven');
  }

  const lit = new RegExp("['\"`](" + GATED.join('|') + ")['\"`]", 'g');
  for (const f of Object.keys(files).sort()) {
    if (EXEMPT.test(f)) continue;
    const code = stripComments(files[f]);
    const seen = {};
    for (const x of code.matchAll(lit)) seen[x[1]] = (seen[x[1]] || 0) + 1;
    const reg = SENDERS[f];
    if (!Object.keys(seen).length) { if (reg) red('SF-2', f + ': registered sender names no gated RPC'); continue; }
    if (!reg) { red('SF-2', f + ': sends ' + Object.keys(seen).join(', ') + ' outside the settle-first handler (unregistered)'); continue; }
    for (const n of new Set([...Object.keys(seen), ...Object.keys(reg.literals)])) {
      if ((seen[n] || 0) !== (reg.literals[n] || 0)) {
        red('SF-2', f + ': ' + n + ' named ' + (seen[n] || 0) + '× in code, registered ' + (reg.literals[n] || 0) + '×');
      }
    }
    for (const [label, ok] of reg.wire) if (!ok(code)) red('SF-3', f + ': ' + label);
  }
  for (const f of Object.keys(SENDERS)) if (!(f in files)) red('SF-2', f + ': registered sender is missing');

  for (const f of LATCH_SURFACES) {
    if (!/data-hr-settle-latch/.test(stripComments(files[f] || ''))) red('SF-4', f + ': no control carries data-hr-settle-latch');
  }
  return findings;
}

/* ── --selftest: one planted defect per rule and wiring shape ─────────────── */
const PLANTS = [
  ['SF-1', 'the handler forgets a verb', (t) => { t['src/net/settle-first.js'] = t['src/net/settle-first.js'].replace(/'hr_claim_rank',\s*/, ''); }],
  ['SF-2', 'a new bare sender', (t) => { t['src/features/new-thing.js'] = "fetch(u + '/rest/v1/rpc/' + 'hr_claim_rank', {});\n"; }],
  ['SF-2', 'a second send in a registered file', (t) => { t['src/net/bank-sync.js'] += "\nfetch('hr_bank_move');\n"; }],
  ['SF-3', 'goal-claim drops a verb from SETTLE_GATED', (t) => { t['src/net/goal-claim.js'] = t['src/net/goal-claim.js'].replace('hr_claim_rank: 1, hr_credit_kills', 'hr_credit_kills'); }],
  ['SF-3', 'goal-claim sends a gated verb unwrapped', (t) => { t['src/net/goal-claim.js'] = t['src/net/goal-claim.js'].replace("return call('hr_claim_quest'", "return callOnce('hr_claim_quest'"); }],
  ['SF-3', 'bank-sync calls the primitive directly', (t) => { t['src/net/bank-sync.js'] = t['src/net/bank-sync.js'].replace('withSettleFirstRetry(() => postBankMove(f, cfg, body))', 'postBankMove(f, cfg, body)'); }],
  ['SF-3', 'gold.js buyTrait bypasses the handler', (t) => { t['src/net/gold.js'] = t['src/net/gold.js'].replace('withSettleFirstRetry(() => buyTraitOnce(traitId, key))', 'buyTraitOnce(traitId, key)'); }],
  ['SF-3', 'farm harvest sent bare', (t) => { t['src/net/farm-sync.js'] = t['src/net/farm-sync.js'].replace("withSettleFirstRetry(() => callFarmRpc('hr_farm_harvest', body, o))", "callFarmRpc('hr_farm_harvest', body, o)"); }],
  ['SF-3', 'muster sends the claim without the handler', (t) => { t['src/features/muster.js'] = t['src/features/muster.js'].replace('SF.withSettleFirstRetry(send)', 'send()'); }],
  ['SF-3', 'raids sends the claim without the handler', (t) => { t['src/features/raids.js'] = t['src/features/raids.js'].replace('SF.withSettleFirstRetry(send)', 'send()'); }],
  ['SF-4', 'the trait Buy button loses its latch', (t) => { t['src/render/shop.js'] = t['src/render/shop.js'].split('data-hr-settle-latch').join(''); }],
];
const CONTROLS = [
  ['a comment-only mention', (t) => { t['src/features/new-thing.js'] = "// hr_bank_move is the Depot verb\n/* 'hr_claim_rank' */\n"; }],
];

function selftest() {
  const base = loadTree();
  let bad = 0;
  const clean = check(base);
  if (clean.length) { console.log('✗ clean arm is red: ' + clean.map((f) => f.msg).join('; ')); bad++; }
  else console.log('✓ clean arm is green');
  for (const [rule, label, plant] of PLANTS) {
    const t = { ...base }; plant(t);
    const hit = check(t).some((f) => f.rule === rule);
    console.log((hit ? '✓ caught ' : '✗ MISSED ') + rule + ' — ' + label);
    if (!hit) bad++;
  }
  for (const [label, plant] of CONTROLS) {
    const t = { ...base }; plant(t);
    const f = check(t);
    console.log((f.length ? '✗ control went red: ' : '✓ control silent — ') + label);
    if (f.length) bad++;
  }
  console.log(bad ? `\n✗ settle-first-callers --selftest: ${bad} failure(s)` : `\n✓ settle-first-callers --selftest: ${PLANTS.length}/${PLANTS.length} caught, ${CONTROLS.length} control(s) silent`);
  return bad ? 1 : 0;
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const findings = check(loadTree());
  for (const f of findings) console.log('✗ ' + f.rule + '  ' + f.msg);
  if (findings.length) { console.log(`\n✗ settle-first-callers: ${findings.length} finding(s)`); return 1; }
  console.log(`✓ settle-first-callers: ${GATED.length} RPCs, ${Object.keys(SENDERS).length} senders wired, ${LATCH_SURFACES.length} latch surfaces`);
  return 0;
}

process.exitCode = main();
