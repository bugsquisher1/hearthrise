#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// PACK A MIGRATION INTO A MANAGEMENT-API REQUEST BODY.
//
// WHY THIS EXISTS. Applying a migration here used to mean reproducing the
// file's SQL inside a tool argument, which is the transcription-risk class that
// correctly stopped the Edge Function deploy: a slip anywhere in 84 KB of
// security SQL is silent, and the file's own self-check cannot catch a typo that
// still parses. This reads the FILE BYTES off disk and emits the JSON body, so
// nothing is ever hand-authored.
//
//   node tools/pack-migration.mjs supabase/migrations/<file>.sql <out.json>
//   curl -sS -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
//     -H "Authorization: Bearer $(cat ~/.supabase-token)" \
//     -H "Content-Type: application/json" --data-binary @<out.json>
//
// HTTP 201 means committed. The file's own `do $$` block is still the commit
// gate — a raise aborts the transaction and nothing lands.
//
// REFUSES TO PACK a file that already contains its own transaction control,
// because wrapping `begin; … begin; … commit; … commit;` silently changes where
// the rollback boundary is, and the whole safety property here is that ONE
// failure undoes ALL of it.
// ════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , sqlPath, outPath] = process.argv;
if (!sqlPath || !outPath) {
  console.error('usage: node tools/pack-migration.mjs <migration.sql> <out.json>');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

// A file that opens its own transaction must not be wrapped in another one.
const txn = sql.match(/^[ \t]*(begin|commit|rollback)[ \t]*;/im);
if (txn) {
  console.error(`REFUSED: ${sqlPath} contains its own transaction control (${txn[1]}).`);
  console.error('Wrapping it would move the rollback boundary. Apply it unwrapped, deliberately.');
  process.exit(1);
}

// A migration with no self-verifying block has no commit gate. Warn loudly
// rather than refuse — a few legitimate files are pure DDL.
if (!/do\s+\$\$/i.test(sql)) {
  console.error(`WARNING: ${sqlPath} has no "do $$" block, so it ships no commit gate.`);
  console.error('Every migration here is supposed to verify itself. Check this is deliberate.');
}

const body = JSON.stringify({ query: `begin;\n${sql}\ncommit;` });
fs.writeFileSync(outPath, body);

const digest = crypto.createHash('sha256').update(sql).digest('hex');
console.log(`packed   ${sqlPath}`);
console.log(`  sql    ${sql.length} bytes`);
console.log(`  sha256 ${digest}`);
console.log(`  body   ${body.length} bytes -> ${outPath}`);
