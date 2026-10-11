#!/usr/bin/env node
// tools/discord-gift-code.mjs — rotate the Discord gift code (operator one-liner).
//
//   node tools/discord-gift-code.mjs              new random code, retire the old one, print it
//   node tools/discord-gift-code.mjs --code=XYZ   use this code instead (6-32 letters/digits)
//   node tools/discord-gift-code.mjs --dry-run    print the SQL it would send; send nothing
//
// The code is what Tyler posts in the Discord welcome channel; players type it
// into "Claim Discord gift" and hr_claim_discord_gift pays once per account
// (supabase/migrations/2026-10-18-discord-gift.sql). The server stores only its
// sha256; the previous code answers code_expired from the moment this runs.
//
// The management-API token is read as file bytes from ~/.supabase-token and is
// never printed, logged or put in argv. The code itself is not a secret (it is
// posted publicly), so it is printed — that is the point of the tool.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';

const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';
// No 0/O/1/I/L: a code read off a phone screen must survive being typed.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const dryRun = process.argv.includes('--dry-run');

function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `HEARTH-${s}`;
}

const display = arg('code') || newCode();
const norm = display.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
// Same shape rule as the server; it also makes the SQL literal below injection-free.
if (!/^[A-Z0-9]{6,32}$/.test(norm)) {
  console.error('discord-gift-code: a code is 6-32 letters or digits');
  process.exit(2);
}
const sql = `select public.hr_discord_code_rotate('${norm}') as r;`;

if (dryRun) {
  console.log(`dry run — would send: ${sql}`);
  console.log(`Discord gift code (not installed): ${display}`);
  process.exit(0);
}

let token;
try { token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim(); }
catch { console.error('discord-gift-code: ~/.supabase-token is not readable'); process.exit(2); }

const res = await fetch(URL_Q, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) {
  // The server's message names the rule that refused (reused code, bad shape); it never carries the token.
  console.error(`discord-gift-code: HTTP ${res.status}: ${body.slice(0, 300)}`);
  process.exit(1);
}
let r = null;
try { r = JSON.parse(body)[0]?.r; } catch { r = null; }
if (!r || r.ok !== true) {
  console.error(`discord-gift-code: unexpected answer: ${body.slice(0, 300)}`);
  process.exit(1);
}
console.log(`Discord gift code: ${display}   (previous codes retired: ${r.retired})`);
console.log('Post it in the Discord welcome channel. Players enter it under "Claim Discord gift".');
