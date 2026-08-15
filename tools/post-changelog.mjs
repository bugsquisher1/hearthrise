#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// POST A RELEASE NOTE TO THE DISCORD CHANGELOG CHANNEL.
//
//   node tools/post-changelog.mjs <message-file> [--dry-run]
//
// The webhook URL lives at ~/.hearthrise/changelog-webhook and MUST NOT be
// committed — the repo's secret guard fails the build on a webhook URL in
// tracked files, and it is right to. This reads it at run time and never
// prints it.
//
// --dry-run renders exactly what would be sent and posts nothing. Use it
// first: a changelog post reaches real players and cannot be un-sent, only
// edited or deleted after the fact.
// ════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DISCORD_CONTENT_LIMIT = 2000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const msgPath = args.find((a) => !a.startsWith('--'));

if (!msgPath) {
  console.error('usage: node tools/post-changelog.mjs <message-file> [--dry-run]');
  process.exit(1);
}

const content = fs.readFileSync(msgPath, 'utf8').trim();
if (!content) {
  console.error('REFUSED: the message file is empty.');
  process.exit(1);
}
if (content.length > DISCORD_CONTENT_LIMIT) {
  console.error(`REFUSED: ${content.length} chars exceeds Discord's ${DISCORD_CONTENT_LIMIT}-char limit.`);
  console.error('Split it, or switch to an embed (4096-char description).');
  process.exit(1);
}

console.log('─'.repeat(64));
console.log(content);
console.log('─'.repeat(64));
console.log(`${content.length} / ${DISCORD_CONTENT_LIMIT} chars`);

if (dryRun) {
  console.log('\nDRY RUN — nothing was sent.');
  process.exit(0);
}

const hookPath = path.join(os.homedir(), '.hearthrise', 'changelog-webhook');
if (!fs.existsSync(hookPath)) {
  console.error(`\nNo webhook at ${hookPath} — cannot post.`);
  process.exit(1);
}
const webhook = fs.readFileSync(hookPath, 'utf8').trim();

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content }),
});

// Never echo the response body verbatim — a Discord error can quote the URL.
if (res.ok) {
  console.log(`\nPOSTED — HTTP ${res.status}`);
} else {
  console.error(`\nFAILED — HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}
