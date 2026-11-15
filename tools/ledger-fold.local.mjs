// tools/ledger-fold.local.mjs — the ledger's fold tier on the live server, read-only, one screen.
//
//   node tools/ledger-fold.local.mjs            the fold's state, then THE DRY RUN: what the next runs would fold, at the
//                                               server's own detail_days (3 while the tier is off). Nothing is changed.
//   node tools/ledger-fold.local.mjs --days 5   the dry run at another number of days
//   node tools/ledger-fold.local.mjs --rows 400000   read more of the waiting rows (default 200,000, the oldest: what the arm
//                                               file reads; one statement, about twice as long for twice the rows)
//
// READ THIS BEFORE 2027-04-28-ledger-fold-arm.sql IS APPLIED. That file is the step that cannot be undone: from its next
// 10-minute fire the rows counted under "Would fold" are summed into player_ledger_windows and deleted. What to read:
//   · "fit": the arm refuses under 900 in 1,000. The model (hr_ledger_fold_model) was written from the engine's code, so
//     every line under "Would stay as detail" is a row shape production holds that the code reading missed: add its key
//     to the model first, or accept that those rows keep their detail for the 90 days.
//   · rows a window: the fold's whole value. The design measured 311,589 rows into 18,276 windows (17 a window).
//
// SELECT-only through the Management API with ~/.supabase-token (read as file bytes, never printed, never in argv), inside
// a READ ONLY transaction. The dry run is hr_ledger_fold_plan, a STABLE function: PostgreSQL itself refuses a write in it.
// Its cost: one pass of the waiting rows through the ledger's (at, id) key. Local tool, not in CI; its screen is
// tools/lib/ledger-journal.mjs planLines, which tests/ledger-fold.mjs LF-DRY reads against a real plan.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HAS_WINDOWS, FOLD_STATE, foldLine, planSql, planLines, PLAN_ROWS } from './lib/ledger-journal.mjs';

const REF = 'nezapsylztqbbwuwembx';
const at = process.argv.indexOf('--days');
const days = at >= 0 ? Number(process.argv[at + 1]) : null;
const rat = process.argv.indexOf('--rows');
const rows = rat >= 0 ? Number(process.argv[rat + 1]) : PLAN_ROWS;
if ((at >= 0 && !(Number.isInteger(days) && days >= 3 && days <= 3650)) || !(Number.isInteger(rows) && rows >= 1 && rows <= 1000000)) {
  console.error('usage: node tools/ledger-fold.local.mjs [--days N] [--rows N]   (days a whole number, 3 or more; rows up to 1,000,000)'); process.exit(2);
}

const readOnly = (sql) => /^\s*(select|with)\b/i.test(sql) && !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do|copy|vacuum)\b/i.test(sql);
let token = null;
async function q(sql) {
  if (!readOnly(sql)) throw new Error('read-only queries only');
  if (token === null) token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error('the database answered ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function main() {
  if ((await q(HAS_WINDOWS))[0].has_windows !== true) {
    console.log(foldLine(null).text);
    process.exitCode = 1;
    return;
  }
  const [state] = await q(FOLD_STATE);
  console.log(foldLine(state).text);
  /* While the tier is off the dry run needs a number: 3, the arm file's. */
  const ask = days ?? (state.detail_days === null ? 3 : null);
  const [row] = await q(planSql(ask, rows));
  if (typeof row.plan === 'string') row.plan = JSON.parse(row.plan);
  for (const l of planLines(row)) console.log(l);
}
await main().catch((e) => { console.error('ledger-fold: ' + e.message); process.exitCode = 2; });
