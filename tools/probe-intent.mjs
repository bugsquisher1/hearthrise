#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// ONE INTENT CALL, AND THE WHOLE ANSWER.
//
//   node tools/probe-intent.mjs [--kind combat --id slime]
//
// WHY THIS EXISTS. `tools/race-test.mjs` stopped with a 409 whose error name
// was past the width of a Windows console, and neither a pipe nor
// Start-Transcript could recover it: a pipe hides the password prompt (stdout
// buffers), and PowerShell 5.1's transcript does not capture a native process's
// stdout at all. Both attempts cost a real run.
//
// So this makes ONE call, prints the parsed fields first and small, and writes
// the untruncated body to a file. The console line is the answer; the file is
// there when the answer is not enough.
//
// It writes nothing but a rate-counter row on a refusal. On SUCCESS it does move
// the activity pointer — that is the operation under test and it says so before
// asking for anything.
// ════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import readline from 'node:readline';

const boot = fs.readFileSync(new URL('../src/net/supabase-bootstrap.js', import.meta.url), 'utf8');
const url = (boot.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const key = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0];
if (!url || !key) { console.error('could not read project url/anon key'); process.exit(1); }

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const KIND = argOf('--kind', 'combat');
const ID   = argOf('--id', 'slime');
const SLOT = Number(argOf('--slot', '0'));
const OUT  = 'probe-intent-out.json';

function ask(q, hidden = false) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const on = (c) => { if (['\n', '\r', ''].includes(c.toString('utf8'))) process.stdin.removeListener('data', on);
                          else process.stdout.write('[2K[200D' + q + '*'.repeat(rl.line.length)); };
      process.stdin.on('data', on);
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); res(a.trim()); });
  });
}

(async () => {
  console.log(`\nOne POST to hr-accrue: set_activity -> ${KIND}/${ID}, slot ${SLOT}.`);
  console.log('On success this MOVES the activity pointer. On refusal it writes only a rate row.\n');
  const email = await ask('throwaway email    : ');
  const password = await ask('password (hidden)  : ', true);

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  if (!auth?.access_token) { console.log('\nSIGN-IN FAILED —', JSON.stringify(auth).slice(0, 300)); process.exit(1); }

  const body = {
    verb: 'set_activity', slot: SLOT,
    intentId: crypto.randomUUID(),
    activity: { kind: KIND, id: KIND === 'idle' ? null : ID },
  };
  const res = await fetch(`${url}/functions/v1/hr-accrue`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  fs.writeFileSync(OUT, text);

  let j = null; try { j = JSON.parse(text); } catch {}
  console.log(`\n──────── HTTP ${res.status} ────────`);
  /* The whole point: the fields that name the failure, FIRST and on their own
     lines, so no console width can hide them. */
  for (const k of ['error', 'stage', 'why', 'reason', 'kind', 'id', 'needs']) {
    if (j && j[k] !== undefined) console.log(`  ${k.padEnd(7)}: ${JSON.stringify(j[k])}`);
  }
  if (j && j.detail !== undefined) console.log(`  detail : ${JSON.stringify(j.detail).slice(0, 300)}`);
  if (j && j.ok === true) console.log('  ok     : true — the pointer moved');
  console.log(`\nfull body written to ${OUT} (${text.length} bytes)`);
})();
