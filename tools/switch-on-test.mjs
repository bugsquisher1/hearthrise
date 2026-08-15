#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// THE SWITCH-ON TEST — the cheapest honest end-to-end check of hr-accrue.
//
// WHY THIS EXISTS. Everything below the HTTP shell has been proven directly
// against the database: the five RPCs exist, they are hr_engine-only, hr_apply
// refuses replays/stale versions/intent collisions, the deployed payload hash
// matches the repo. The ONE layer nobody has exercised is the shell itself —
// HR_ENGINE_DB_URL (the pooler string), the JWT verification, and the
// `set local role hr_engine` that makes the grants apply. Every one of those
// fails as a generic 500 that looks exactly like the other two.
//
// Everything reachable without a real user JWT stops at 401, so "deployed and
// correctly refusing" cannot be told apart from "deployed but 500ing on a bad
// secret" from the outside. That is why this needs a real signed-in user.
//
// WHAT A PASS LOOKS LIKE: **409 no_character**. An empty slot 5 returns that
// only AFTER a successful hr_rate_gate + hr_state_of round trip, so one 409
// proves the pooler string, the role switch and all five grants at once —
// while writing nothing but a rate-bucket row.
//
// The password is read from stdin, never from argv and never from an env var,
// so it stays out of shell history and out of the process table.
// ════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import readline from 'node:readline';

const boot = fs.readFileSync(new URL('../src/net/supabase-bootstrap.js', import.meta.url), 'utf8');
const url = (boot.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const key = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0];
if (!url || !key) {
  console.error('Could not read the project url/anon key out of src/net/supabase-bootstrap.js');
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Mute the echo so the password never appears on screen or in a scrollback.
      const onData = (char) => {
        if (['\n', '\r', ''].includes(char.toString('utf8'))) process.stdin.removeListener('data', onData);
        else process.stdout.write('[2K[200D' + question + '*'.repeat(rl.line.length));
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

const SLOT = Number(process.argv[2] ?? 5);

(async () => {
  console.log(`\nproject : ${url}`);
  console.log(`target  : POST /functions/v1/hr-accrue  {"slot":${SLOT}}\n`);

  const email = await ask('throwaway account email: ');
  const password = await ask('password (hidden)     : ', { hidden: true });

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));

  if (!auth?.access_token) {
    console.log('\nSIGN-IN FAILED —', JSON.stringify(auth).slice(0, 400));
    console.log('\nIf this says "Email not confirmed", create the user in the Supabase dashboard');
    console.log('with "Auto Confirm User" ticked (Authentication -> Users -> Add user).');
    process.exit(1);
  }
  console.log(`\nsigned in — user ${auth.user.id}`);

  const started = Date.now();
  const res = await fetch(`${url}/functions/v1/hr-accrue`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot: SLOT }),
  });
  const body = await res.text();
  console.log(`hr-accrue  HTTP ${res.status}  (${Date.now() - started} ms)`);
  console.log(body.slice(0, 800));

  // The verdict, spelled out — a status code nobody can interpret is not a result.
  console.log('\n──────────────────────────────────────────────');
  if (res.status === 409 && body.includes('no_character')) {
    console.log('PASS — 409 no_character.');
    console.log('The pooler string, the `set local role hr_engine`, and all five engine');
    console.log('grants are proven live. This is the expected answer for an empty slot.');
  } else if (res.status === 200) {
    console.log('PASS (and this slot has a character) — the engine computed an accrual.');
    console.log('Check that `version` advanced and the watermark landed inside [old, now()].');
  } else if (res.status === 401) {
    console.log('FAIL — 401. The JWT was refused. The sign-in worked, so this points at');
    console.log('in-function JWKS verification rather than at the account.');
  } else if (res.status === 429) {
    console.log('INCONCLUSIVE — 429. The rate gate fired before the DB round trip. Wait and re-run.');
  } else if (res.status >= 500) {
    console.log('FAIL — 5xx. This is the failure this test exists to find: almost certainly');
    console.log('HR_ENGINE_DB_URL (wrong password, wrong pooler port — it must be 6543, or a');
    console.log('missing secret). The outer catch swallows the real error and returns a generic');
    console.log('500, so the status alone will not tell you which. Check the function logs.');
  } else {
    console.log(`UNEXPECTED — ${res.status}. Paste this whole output back.`);
  }
})();
