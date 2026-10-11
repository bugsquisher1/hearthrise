#!/usr/bin/env node
// tools/discord-gift-code.mjs — print THIS WEEK'S Discord gift code for Tyler to post.
//
//   node tools/discord-gift-code.mjs
//
// READ-ONLY. The code is derived on the server (HMAC of the Vault secret
// hr_discord_gift_secret over the ISO week — supabase/migrations/
// 2026-10-18-discord-gift.sql) and rotates by itself every Monday 00:00 UTC; last
// week's code is honoured for one more week. This tool calls the owner-only
// hr_discord_code_current() through the management API and writes nothing:
// nothing about the code is ever committed (the repository is public).
//
// The management-API token is read as file bytes from ~/.supabase-token and is
// never printed, logged or put in argv. The code is printed — that is the point.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';
const QUERY = 'select public.hr_discord_code_current() as r';
// The one query this tool may send is a SELECT of the operator read — checked, not assumed.
if (!/^select public\.hr_discord_code_current\(\) as r$/.test(QUERY)) {
  console.error('discord-gift-code: refusing — the query is not the read-only operator read');
  process.exit(2);
}

let token;
try { token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim(); }
catch { console.error('discord-gift-code: ~/.supabase-token is not readable'); process.exit(2); }

const res = await fetch(URL_Q, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`discord-gift-code: HTTP ${res.status}: ${body.slice(0, 300)}`);
  process.exit(1);
}
let r = null;
try { r = JSON.parse(body)[0]?.r; } catch { r = null; }
if (!r || r.ok !== true || !/^HEARTH-[A-Z0-9]{6}$/.test(r.code || '')) {
  console.error(r && r.error === 'no_secret'
    ? 'discord-gift-code: the gift is CLOSED — store the Vault secret hr_discord_gift_secret (>= 32 chars) first'
    : `discord-gift-code: unexpected answer: ${body.slice(0, 300)}`);
  process.exit(1);
}
console.log(`Discord gift code for ${r.week}: ${r.code}`);
console.log(`Post it in the Discord welcome channel. It works until ${r.valid_until} (UTC); a new one starts each Monday.`);
