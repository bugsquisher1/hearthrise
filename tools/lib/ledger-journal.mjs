// tools/lib/ledger-journal.mjs — THE JOURNAL A REPORT READS, DETAIL AND WINDOWS AS ONE RELATION.
//
// Since 2027-04-27-ledger-fold.sql the journal has two tiers a report must add up: public.player_ledger (every row, for
// hr_ledger_config.detail_days) and public.player_ledger_windows (the accrue and hunt supply rows past that, summed per hero,
// run and 15 minutes, proved equal to the rows they replaced). A report that reads player_ledger alone goes quiet on every day
// older than detail_days, and reads as a dead feature (CLAUDE.md §3.4) or as gold with no journal row.
//
// journal(hasWindows) is a FROM-able subquery with one shape for both tiers:
//   at (a window: its window_from; it never crosses a UTC day), user_id, slot, kind, intent, meta (a window's is the same shape,
//   summed), n (rows this line stands for: 1, or the window's), gold_pos / gold_neg (gold in and gold out, both positive).
// `count(*)` over the ledger becomes `sum(n)`; `sum(gold) filter (where gold > 0)` becomes `sum(gold_pos)`.
// A predicate on `at` pushes down into both arms, so the (at, id) and (window_from, id) keys still serve it.
//
// hasWindows: ask HAS_WINDOWS first. Before the migration is applied the table is not there, and the report must still run.
// tests/ledger-fold.mjs LF-REPORTS runs the reports' own queries before and after a fold and requires the same rows.
export const HAS_WINDOWS = "select to_regclass('public.player_ledger_windows') is not null as has_windows";

const DETAIL = 'select l.at, l.user_id, l.slot, l.kind, l.intent, l.meta, 1::bigint as n, '
  + 'greatest(coalesce(l.gold, 0), 0)::bigint as gold_pos, greatest(-coalesce(l.gold, 0), 0)::bigint as gold_neg '
  + 'from public.player_ledger l';
const WINDOWS = 'select w.window_from as at, w.user_id, w.slot, w.kind, w.intent, w.meta, w.n::bigint as n, '
  + 'w.gold_pos, w.gold_neg from public.player_ledger_windows w';

/** @param {boolean} hasWindows whether public.player_ledger_windows exists on the database being read */
export function journal(hasWindows) {
  return '(' + DETAIL + (hasWindows ? ' union all ' + WINDOWS : '') + ')';
}

/* The fold's own figures, one row (only when the table exists). `behind`: folded-kind rows the fold should have taken by now
   (older than detail_days and an hour, inside the last 8 days) that are still detail: it lagged, or it left them. */
export const FOLD_STATE = `select c.detail_days, c.window_minutes, s.folded_to, s.last_at, s.runs, s.rows_folded, s.windows, s.rows_left,
       s.last -> 'left_by' as last_left_by,
       round(extract(epoch from now() - s.last_at)) as last_age_s,
       (select count(*) from public.player_ledger_windows) as window_rows,
       pg_total_relation_size('public.player_ledger_windows') as window_bytes,
       case when c.detail_days is null then 0 else
         (select count(*) from public.player_ledger l
           where l.at >= now() - interval '8 days'
             and l.at < now() - make_interval(days => c.detail_days) - interval '1 hour'
             and public.hr_ledger_fold_model(l.kind, l.intent) is not null) end as behind
  from public.hr_ledger_config c, public.hr_ledger_fold_state s where c.only_row and s.only_row`;

/**
 * The fold's one line for a report. PURE. Healthy, numerically: on, a run inside the last 30 minutes (the job fires every 10),
 * and no folded-kind row older than detail_days and an hour still sitting as detail. Such a row is safe (it keeps its detail)
 * but it means the job is behind or a writer journals a key hr_ledger_fold_model lacks: the fold is doing less than it was
 * built to, and the disk line (the 90-day projection) is wrong by that much.
 * @param {object|null} r one FOLD_STATE row, or null when the table is not there
 * @returns {{ok: boolean, text: string}}
 */
export function foldLine(r) {
  if (!r) return { ok: true, text: 'ledger fold: not installed (2027-04-27-ledger-fold.sql is not applied)' };
  const held = `${Number(r.window_rows) || 0} windows held, ${((Number(r.window_bytes) || 0) / 1048576).toFixed(1)} MB`;
  if (r.detail_days === null || r.detail_days === undefined) {
    return { ok: true, text: `ledger fold: OFF (detail_days is null; ${held}). 2027-04-28-ledger-fold-arm.sql turns it on.` };
  }
  const age = r.last_at === null || r.last_at === undefined ? null : Number(r.last_age_s);
  const behind = Number(r.behind) || 0;
  const head = `ledger fold: ON at ${r.detail_days} days, ${Number(r.rows_folded) || 0} rows folded into ${Number(r.windows) || 0} windows so far `
    + `(${held}), last run ${age === null ? 'never' : Math.round(age / 60) + ' min ago'}`;
  if (age === null || age > 1800) return { ok: false, text: head + ' << the job fires every 10 minutes: hr-ledger-fold is not running' };
  if (behind > 0) {
    return { ok: false, text: head + ` << ${behind} folded-kind row(s) past ${r.detail_days} days are still detail`
      + ` (the last run left: ${JSON.stringify(r.last_left_by || [])}); the model lacks a key, or the job is behind` };
  }
  return { ok: true, text: head + ', nothing behind' };
}

/**
 * How many minutes a paged read of the ledger waits before it starts, so no job deletes a journal row under it. PURE.
 * hr-ledger-prune fires at :07; with the fold tier on, hr-ledger-fold fires every ten minutes on the 7 (:07, :17, ...) and
 * hr-ledger-windows-prune at :57 (2027-04-27-ledger-fold.sql put all three on one minute of ten for this). The read takes
 * about 80 s, so it starts only in the first four minutes after a ten (tier on) or outside :05 to :10 (tier off).
 * @param {number} minute the UTC minute now, 0 to 59
 * @param {boolean} foldOn hr_ledger_config.detail_days is not null (unread: say true, the longer wait)
 */
export function ledgerQuietWaitMin(minute, foldOn) {
  const m = ((Math.floor(Number(minute)) % 60) + 60) % 60;
  if (foldOn) return m % 10 >= 4 ? 10 - (m % 10) : 0;
  return m >= 5 && m < 10 ? 10 - m : 0;
}

/* The dry run's question (tools/ledger-fold.local.mjs), one row: what hr_ledger_fold would do from here, read and not done
   (hr_ledger_fold_plan is STABLE: it cannot write), with the journal's size beside it. `days`: an integer or nothing. */
export const planSql = (days) => `select public.hr_ledger_fold_plan(1000000, null, ${Number.isInteger(days) ? days : 'null'}) as plan,
       (select count(*) from public.player_ledger) as ledger_rows,
       pg_total_relation_size('public.player_ledger') as ledger_bytes,
       pg_database_size(current_database()) as db_bytes`;

/**
 * The dry run as a screen. PURE.
 * @param {{plan: object, ledger_rows: number|string, ledger_bytes: number|string, db_bytes: number|string}} r one planSql row
 * @returns {string[]}
 */
export function planLines(r) {
  const p = r && r.plan;
  if (!p || p.ok !== true) return ['Ledger fold, dry run: the plan did not answer: ' + JSON.stringify(p)];
  if (p.off) return ['Ledger fold, dry run: the tier is off and no days were named (pass --days 3).'];
  const n = (v) => Number(v) || 0;
  const mb = (v) => (n(v) / 1048576).toFixed(0) + ' MB';
  const rows = n(r.ledger_rows), seen = n(p.seen), fold = n(p.folded), win = n(p.windows), left = n(p.left);
  const out = [
    `Ledger fold, dry run at ${p.detail_days} days of detail, ${p.window_minutes}-minute windows. Nothing was changed.`,
    `  The journal now: ${rows.toLocaleString('en-US')} rows, ${mb(r.ledger_bytes)} of a ${mb(r.db_bytes)} database.`,
    `  Waiting (accrue and hunt supply rows older than ${p.detail_days} days, from ${p.from || 'the first row'} to ${p.to}): ${seen.toLocaleString('en-US')} rows.`,
    `  Would fold: ${fold.toLocaleString('en-US')} rows into ${win.toLocaleString('en-US')} windows`
      + (win ? ` (${(fold / win).toFixed(1)} rows a window); the journal would hold ${(rows - fold).toLocaleString('en-US')} rows and ${win.toLocaleString('en-US')} windows.` : '.'),
  ];
  for (const b of p.by || []) out.push(`    ${String(b.kind).padEnd(8)} ${String(b.intent).padEnd(11)} ${n(b.rows).toLocaleString('en-US').padStart(9)} rows -> ${n(b.windows).toLocaleString('en-US').padStart(7)} windows`);
  out.push(`  Would stay as detail (a key or a type the model does not list): ${left.toLocaleString('en-US')} rows`
    + (seen ? `, ${(1000 * fold / seen).toFixed(0)} in 1,000 fit (the arm file refuses under 900).` : '.'));
  for (const l of p.left_by || []) out.push(`    ${String(l.kind).padEnd(8)} ${String(l.intent).padEnd(11)} ${n(l.rows).toLocaleString('en-US').padStart(9)} rows  ${l.why}`);
  if (p.more) out.push('  More than a million rows wait: this is the first million.');
  return out;
}
