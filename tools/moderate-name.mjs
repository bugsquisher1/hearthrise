#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/moderate-name.mjs — TAKE A PLAYER'S NAME BACK (Coordinator only).
//
//   node tools/moderate-name.mjs <user-uuid> "<reason>"            do it
//   node tools/moderate-name.mjs <user-uuid> "<reason>" --dry-run  print the SQL only
//
// Calls public.hr_mod_force_rename(<uuid>, <reason>) on production through the
// Supabase management endpoint (the one tools/apply-migration.mjs and
// tools/vitals.mjs use). That function is executable by NO client role and not
// by service_role; the management endpoint runs as the database owner, which is
// the only way in. It is never run automatically.
//
// WHAT IT DOES (2026-10-11-name-moderation.sql §11): the player's name becomes
// Adventurer-NNNN, they are flagged and must pick a new name (the game opens a
// rename prompt from the envelope's must_rename), the old name's fold key is
// held so no variant of it can be claimed again, one player_ledger row
// (kind moderation_rename, meta {old_canon_hash, reason}) is written, their
// stamped listing / buy-offer / chat names follow, and the boards refresh.
// Replaying it on a player who has not renamed yet writes nothing.
//
// NEVER PRINTS THE NAME. Neither the request nor the response carries it; the
// reason should describe the violation ("racial slur"), not quote it.
// The token is read from ~/.supabase-token as file bytes and is never printed
// or placed in argv. Refuses 00:00-00:10 UTC (CLAUDE.md §2 production window).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage(msg) {
  console.error(`moderate-name: ${msg}\n  usage: node tools/moderate-name.mjs <user-uuid> "<reason>" [--dry-run]`);
  process.exitCode = 2;
}

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dry = process.argv.includes('--dry-run');
const [user, reason] = args;

if (args.length !== 2) usage('expected exactly a user uuid and a reason');
else if (!UUID_RE.test(user)) usage('the first argument is not a uuid');
else if (!/^[\x20-\x7e]{3,200}$/.test(reason)) usage('the reason must be 3-200 printable ASCII characters');
else {
  // The uuid is regex-checked; the reason is a standard SQL literal with its
  // quotes doubled (standard_conforming_strings is on, so backslash is inert).
  const sql = `select public.hr_mod_force_rename('${user.toLowerCase()}'::uuid, '${reason.replace(/'/g, "''")}') as result`;
  const now = new Date();
  if (dry) {
    console.log(sql);
  } else if (now.getUTCHours() === 0 && now.getUTCMinutes() < 10) {
    console.error('moderate-name: refusing - production writes never run 00:00-00:10 UTC'); process.exitCode = 2;
  } else {
    const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
    const res = await fetch(URL_Q, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`moderate-name: HTTP ${res.status}: ${body.slice(0, 400)}`); process.exitCode = 1;
    } else {
      const out = JSON.parse(body)?.[0]?.result;
      console.log(JSON.stringify(out));
      if (!out || out.ok !== true) process.exitCode = 1;
    }
  }
}
