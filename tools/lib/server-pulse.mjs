// tools/lib/server-pulse.mjs — what "healthy" is for the server as a whole, numerically (tools/hunt-health.local.mjs prints it).
// lane/r-beta-load, 2026-11-01: the beta's failure modes that neither tools/vitals.mjs nor the per-hunt list showed: the tick
// going silent, the edge answering 5xx to the tick, the pool filling, retention stopping, the disk's horizon.
//
//   node tools/lib/server-pulse.mjs --selftest   every alarm proved to fire and to stay quiet
//
// Pure: a row of read-only numbers in, one line each out. An alarm line carries `<<`; a quiet one never does.
import { isMain } from '../../tests/_is-main.mjs';

export const PULSE_LIMITS = Object.freeze({
  diskDaysMin: 14,         // under two weeks of runway is a decision, not a surprise
  diskShareMax: 0.7,       // Supabase auto-grows the disk at 90 %, billed; say so well before
  connShareMax: 0.8,       // of max_connections
  engineMax: 15,           // Supavisor's pool to hr_engine_login (Small's default; its role limit is 20): past it requests queue
  tickSilentS: 30,         // hr-tick-run fires every 10 s
  firesMin10: 50,          // of 60 in ten minutes
  frameAgeH: 2,            // hr-realtime-frame-prune keeps 1 h; 2 h means it stopped
  frameKBsMax: 80,         // of Realtime's configured 100 KB/s (whether Supabase enforces it is unverified: watch it anyway)
  /* Open hunts past the tick's own flush. A body that spends its engine budget defers its last selector until the 30 s lease
     ends, so one or two unwatched hunts touch 125-130 s in normal running (replay 11-02: 20 x 4, 6 of 118 selectors; every
     one settled the next fire). More than this share is the tick not keeping up. */
  stalledShareMax: 0.1,
  dbBusyMax: 1400,         // ms a second of database execution: 70 % of Small's 2 shared cores. Replay 11-02: 20 x 4 worst hour ~300, 100 x 4 ~1,450
  /* One ledger kind whose rows move no value (no gold, XP, quantity, gems or item) as a share of the day's rows. Measured
     2026-11-10: renown_ratchet was 14.6 % of a week's rows and read by nothing (2027-03-30-dead-writes.sql stops it); the
     next such kind was 0.4 % (set_activity). A journal row a settle is the 229 MB game_events again, a kind at a time. */
  idleJournalShareMax: 0.05,
  /* The ledger alone, at its retention line (the week's rows a day x retain_days x bytes a row), as a share of the disk.
     The Disk line cannot see it: the journal only fills until its first row is retain_days old, so 24 h of growth says
     "full in 800 days" while the line is already owed. Measured 2026-11-15, 6 accounts: 14.6k rows a day x 90 days x
     621 B = 0.8 GB, 10 % of the 8.4 GB disk; ten times that play is the whole disk. Half leaves room for WAL and the rest. */
  ledgerHorizonShareMax: 0.5,
});

const mb = (b) => `${Math.round(Number(b) / 1e6)} MB`;

/** @param {object} p the row hunt-health reads; a missing number reads "unknown", never healthy. @returns {string[]} */
export function pulseLines(p) {
  const L = PULSE_LIMITS;
  const out = [];
  const n = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));

  /* The filesystem is the truth (WAL and the replication slot's reserve share it); the database's own growth is the trend. */
  const db = n(p.dbBytes), was = n(p.dbBytes24h), cap = n(p.diskBytes), used = n(p.fsUsedBytes);
  const grew = db - was;
  const days = grew > 0 ? (cap - used) / grew : Infinity;
  const diskBad = !Number.isFinite(used) || !Number.isFinite(cap) || used / cap > L.diskShareMax || days < L.diskDaysMin;
  out.push(`Disk: ${mb(used)} used of ${mb(cap)} (database ${mb(db)}, ${Number.isFinite(grew) ? (grew >= 0 ? '+' : '') + mb(grew) : 'unknown'}/24 h), `
    + `${Number.isFinite(days) ? `full in ${Math.round(days)} days` : 'not growing'}${diskBad ? ` << DISK: want under ${L.diskShareMax * 100} % and ${L.diskDaysMin}+ days` : ''}`);

  const conns = n(p.conns), max = n(p.maxConns), eng = n(p.engineConns);
  const connBad = !Number.isFinite(conns) || conns / max > L.connShareMax || eng >= L.engineMax;
  out.push(`Connections: ${conns}/${max}, engine ${eng}/${p.engineCap ?? '?'}, ${p.active ?? '?'} active, peak 24 h ${p.peakConns ?? '?'}`
    + `${connBad ? ` << CONNECTIONS: want under ${L.connShareMax * 100} %, engine under ${L.engineMax}` : ''}`);

  const last = n(p.tickLastS), fires = n(p.fires10m), bad5 = n(p.edge5xx10m), out9 = n(p.edgeTimedOut10m), posts = n(p.edgePosts10m);
  const silent = !Number.isFinite(last) || last > L.tickSilentS || !(fires >= L.firesMin10);
  const edgeBad = !(bad5 === 0) || !(out9 === 0);
  out.push(`Tick: last fire ${Number.isFinite(last) ? Math.round(last) : '?'} s ago, ${fires}/60 fires in 10 min, ${posts} edge posts, ${bad5} 5xx, ${out9} timed out`
    + `${silent ? ` << TICK SILENT: want a fire within ${L.tickSilentS} s and ${L.firesMin10}+ in 10 min` : ''}${edgeBad ? ' << EDGE FAILING THE TICK: want 0 5xx, 0 timeouts' : ''}`);

  const busy = n(p.dbMsPerS), all = n(p.edgeAll10m), all5 = n(p.edgeAll5xx10m);
  out.push(`Load: database ${Number.isFinite(busy) ? Math.round(busy) : '?'} ms/s of 2,000 (2 shared cores; sustained baseline ASSUMED 400), edge ${Number.isFinite(all) ? all : '?'} calls in 10 min, ${Number.isFinite(all5) ? all5 : '?'} 5xx`
    + `${busy > L.dbBusyMax ? ` << CPU: over ${L.dbBusyMax} ms/s, the first thing the beta's load reaches` : ''}${all5 > 0 ? ' << EDGE 5XX: browsers or the tick' : ''}`);

  const open = n(p.openHunts), stalled = n(p.stalledHunts), worst = n(p.worstLagS);
  out.push(`Hunts: ${open} open, ${stalled} past the flush, worst lag ${Math.round(worst)} s${stalled > Math.max(1, L.stalledShareMax * open) ? ' << BACKLOG: the tick is not keeping up (lag, never lost)' : ''}`);

  const age = n(p.oldestFrameH), failed = n(p.cronFailed1h), kbs = n(p.frameKBs);
  const retBad = age > L.frameAgeH || !(failed === 0);
  out.push(`Retention: oldest frame ${Number.isFinite(age) ? age.toFixed(1) + ' h' : 'none'}, ${failed} cron failures in 1 h, ledger +${p.ledgerRows24h ?? '?'} rows/24 h`
    + `${retBad ? ` << RETENTION: want frames under ${L.frameAgeH} h, 0 cron failures` : ''}`);

  out.push(`Realtime: ${p.frames1m ?? '?'} frames last minute, ${Number.isFinite(kbs) ? kbs.toFixed(1) : '?'} KB/s of 100${kbs > L.frameKBsMax ? ` << FRAMES: over ${L.frameKBsMax} KB/s` : ''}`);

  /* The journal's own waste: the kind that wrote the most rows moving no value in the day (hunt-health reads `kind:rows`). */
  const day = n(p.ledgerRows24h), idle = n(p.idleKindRows24h);
  const share = day > 0 && Number.isFinite(idle) ? idle / day : NaN;
  out.push(`Journal: ${!Number.isFinite(idle) ? 'rows that move no value unknown' : idle > 0 ? `${p.idleKind} wrote ${idle} of the day's ${day} ledger rows and moved no value (${(share * 100).toFixed(1)} %)` : 'every ledger row of the day moved value'}`
    + `${share > L.idleJournalShareMax ? ` << DEAD JOURNAL: one kind over ${L.idleJournalShareMax * 100} % of the day's rows with no gold, XP, items or gems. Who reads it?` : ''}`);

  /* The journal's horizon: what the ledger weighs once retain_days of this week's play are on disk (never under what it weighs
     now). The week's rows are the ids between its first row (`id:age in s`, null = no row this week) and the newest: two index
     probes, where a count would walk a week of rows on every --watch (2026-11-15: 90,771 by ids, 90,535 counted). A ledger
     under a day old counts as one day. */
  /* A row's weight: the newest rows' own bytes with the table's index share on top (ledgerRowBytes), when hunt-health read it.
     The file over its rows is the same number only while the table is compact: the first fold deletes most of its rows and
     PostgreSQL keeps the pages (they are reused, never handed back), so that ratio then reads several rows' weight as one. */
  const led = n(p.ledgerBytes), keep = n(p.ledgerRetainDays), rowB = n(p.ledgerRowBytes) > 0 ? n(p.ledgerRowBytes) : led / n(p.ledgerEstRows);
  const [id0, ageS] = typeof p.ledgerWeekFirst === 'string' ? p.ledgerWeekFirst.split(':').map(Number) : [NaN, NaN];
  const perDay = p.ledgerWeekFirst === null ? 0 : (n(p.ledgerLastId) - id0 + 1) / Math.max(1, ageS / 86400);
  /* THE FOLD TIER (2027-04-27-ledger-fold.sql; ledgerDetailDays is hr_ledger_config.detail_days, null or absent = off). On, a
     row keeps its detail for detail_days and most are then summed into player_ledger_windows, so the line is three parts:
     detail_days of everything; the rows the fold does not take, for the rest (the ledger's rows past detail_days over the days
     they span); and the windows at their own measured weight a day. Until the fold has a day of windows behind it there is
     nothing to measure, and the line is the whole ledger's (an upper bound, said so). All of it from index probes. */
  const detail = n(p.ledgerDetailDays), winB = n(p.windowBytes) || 0;
  const foldOn = Number.isFinite(detail) && detail > 0 && detail < keep;
  const winDays = Math.min(n(p.windowFirstAgeS) / 86400, keep) - detail;
  const measured = foldOn && winDays >= 1 && Number.isFinite(n(p.ledgerFirstAgeS));
  let owed = Math.max(led, perDay * keep * rowB), how = `${Math.round(perDay).toLocaleString('en-US')} rows/day this week x ${Math.round(rowB)} B`;
  if (measured) {
    const span = Math.max(1, Math.min(n(p.ledgerFirstAgeS) / 86400, keep) - detail);
    const kept = Math.min(perDay, Math.max(0, (n(p.ledgerEstRows) - detail * perDay) / span));
    /* each table is never under what its file weighs now: the ledger's file does not shrink when its rows are folded */
    owed = Math.max(led, (detail * perDay + (keep - detail) * kept) * rowB) + Math.max(winB, (winB / winDays) * (keep - detail));
    how += `; folded past ${detail} days: ${Math.round(kept).toLocaleString('en-US')} rows/day keep their detail, the windows weigh ${mb(winB / winDays)} a day`;
  } else if (foldOn) how += `; the fold is on with under a day of windows to measure: an upper bound`;
  const hShare = owed / cap;
  out.push(`Horizon: ${!Number.isFinite(hShare) ? 'the ledger at its retention line unknown'
    : `ledger ${mb(led)}${winB ? ` + windows ${mb(winB)}` : ''} now, ${(owed / 1e9).toFixed(1)} GB at the ${keep}-day line (${how}), ${(hShare * 100).toFixed(0)} % of the disk`}`
    + `${hShare > L.ledgerHorizonShareMax ? ` << JOURNAL HORIZON: the ledger alone is over ${L.ledgerHorizonShareMax * 100} % of the disk at its retention line. `
      + (foldOn ? 'The fold is on: read node tools/ledger-fold.local.mjs for the rows it leaves as detail before shortening retain_days'
        : 'Turn the fold tier on (2027-04-28-ledger-fold-arm.sql, after its dry run) or shorten retain_days') : ''}`);
  return out;
}

function selftest() {
  const ok = { dbBytes: 3e8, dbBytes24h: 2.9e8, fsUsedBytes: 9e8, diskBytes: 8e9, conns: 21, maxConns: 90, engineConns: 2, engineCap: 20, active: 2, peakConns: 22,
    tickLastS: 4, fires10m: 60, edge5xx10m: 0, edgeTimedOut10m: 0, edgePosts10m: 40, openHunts: 50, stalledHunts: 0, worstLagS: 96,
    oldestFrameH: 0.8, cronFailed1h: 0, ledgerRows24h: 1300, frames1m: 12, frameKBs: 13, dbMsPerS: 350, edgeAll10m: 1200, edgeAll5xx10m: 0,
    idleKind: 'admin', idleKindRows24h: 40,
    /* 2026-11-15: 250 MB over 402,576 rows is 621 B a row; 102,200 ids in the week's 7 days is 14,600 rows a day */
    ledgerBytes: 2.5e8, ledgerEstRows: 402576, ledgerRetainDays: 90, ledgerLastId: 500000, ledgerWeekFirst: '397801:604800' };
  const cases = [
    ['quiet', {}, null],
    ['disk over 70 %', { fsUsedBytes: 6e9 }, 'DISK'],
    ['disk under 14 days', { dbBytes: 3e9, dbBytes24h: 2.4e9 }, 'DISK'],
    ['no disk number', { fsUsedBytes: null }, 'DISK'],
    ['connections over 80 %', { conns: 80 }, 'CONNECTIONS'],
    ['the engine pool full', { engineConns: 15 }, 'CONNECTIONS'],
    ['the tick silent', { tickLastS: 45 }, 'TICK SILENT'],
    ['no tick row', { tickLastS: null }, 'TICK SILENT'],
    ['fires missing', { fires10m: 30 }, 'TICK SILENT'],
    ['edge 5xx', { edge5xx10m: 3 }, 'EDGE FAILING'],
    ['edge timeouts', { edgeTimedOut10m: 1 }, 'EDGE FAILING'],
    ['unknown edge outcome', { edge5xx10m: null }, 'EDGE FAILING'],
    ['one deferred hunt, normal running', { stalledHunts: 1 }, null],
    ['a tenth of the hunts stalled and more', { stalledHunts: 6 }, 'BACKLOG'],
    ['two of a few hunts stalled', { openHunts: 3, stalledHunts: 2 }, 'BACKLOG'],
    ['retention stopped', { oldestFrameH: 3 }, 'RETENTION'],
    ['a cron job failing', { cronFailed1h: 2 }, 'RETENTION'],
    ['frames near the cap', { frameKBs: 90 }, 'FRAMES'],
    ['the database past 70 % of its cores', { dbMsPerS: 1500 }, 'CPU'],
    ['browsers getting 5xx', { edgeAll5xx10m: 4 }, 'EDGE 5XX'],
    ['no logs answer is not an alarm by itself', { edgeAll10m: null, edgeAll5xx10m: null }, null],
    ['a journal kind that moves no value past 5 % of the day (renown_ratchet, 2026-11-10)', { idleKind: 'renown', idleKindRows24h: 190 }, 'DEAD JOURNAL'],
    ['the same kind at 5 % exactly stays quiet', { idleKind: 'renown', idleKindRows24h: 65 }, null],
    ['a day nobody played', { ledgerRows24h: 0, idleKind: null, idleKindRows24h: 0 }, null],
    ['no idle-rows answer is not an alarm by itself', { idleKind: null, idleKindRows24h: null }, null],
    ['ten times the play: the ledger at its 90-day line is the whole disk (2026-11-15)', { ledgerLastId: 1419800 }, 'JOURNAL HORIZON'],
    ['the same play kept 500 days', { ledgerRetainDays: 500 }, 'JOURNAL HORIZON'],
    ['a ledger already past half the disk in a week nobody played', { ledgerBytes: 4.5e9, ledgerEstRows: 7.2e6, ledgerWeekFirst: null }, 'JOURNAL HORIZON'],
    ['a launch day: 60,000 rows in the ledger\'s first six hours count as one day, not four', { ledgerLastId: 60000, ledgerWeekFirst: '1:21600' }, null],
    ['a line just under half the disk stays quiet', { ledgerLastId: 887800 }, null],
    ['a week nobody played is not an alarm', { ledgerWeekFirst: null }, null],
    ['no horizon answer is not an alarm by itself', { ledgerWeekFirst: undefined, ledgerLastId: undefined }, null],
    /* THE FOLD TIER ON (2027-04-27-ledger-fold.sql). Ten times the play, a month in: 146,000 rows a day, 3 days of them whole
       (438,000) and 27 days of the 31,244 a day the fold does not take: 1,281,588 rows x 621 B; 114,756 folded rows a day
       are about 6,750 windows, 6.1 MB a day. The line: 1.96 GB of ledger and 0.53 GB of windows, 31 % of the disk. */
    ['ten times the play, the fold tier off: the advice is to turn it on', { ledgerLastId: 1419800 }, 'Turn the fold tier on'],
    ['ten times the play, the fold on a month: a third of the disk, quiet', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerEstRows: 1281588, ledgerBytes: 7.96e8,
      ledgerFirstAgeS: 2592000, windowBytes: 1.64e8, windowFirstAgeS: 2592000 }, null],
    ['today\'s play, the fold on a month', { ledgerDetailDays: 3, ledgerEstRows: 128159, ledgerBytes: 7.96e7, ledgerFirstAgeS: 2592000, windowBytes: 1.64e7, windowFirstAgeS: 2592000 }, null],
    ['the fold on, but most rows keep their detail (120,000 a day the model does not take)', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerEstRows: 3678000, ledgerBytes: 2.284e9,
      ledgerFirstAgeS: 2592000, windowBytes: 3e7, windowFirstAgeS: 2592000 }, 'The fold is on'],
    ['the fold on, its windows as heavy as the rows they replaced', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerEstRows: 1281588, ledgerBytes: 7.96e8,
      ledgerFirstAgeS: 2592000, windowBytes: 2.2e9, windowFirstAgeS: 2592000 }, 'JOURNAL HORIZON'],
    ['the fold just turned on, no window a day old: the whole ledger\'s line, an upper bound', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerFirstAgeS: 2592000,
      windowBytes: 0, windowFirstAgeS: null }, 'The fold is on'],
    /* The day after the first fold at ten times the play, 27 days in: the file is still its 2.5 GB, 1.19M rows are left in it
       (2,100 B of file a row), and a row weighs 621 B. The line is the file plus 87 days of windows, 38 % of the disk. */
    ['the day after the first fold: the file is mostly free pages, and a row is weighed by itself', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerBytes: 2.5e9, ledgerEstRows: 1188000,
      ledgerRowBytes: 621, ledgerFirstAgeS: 2332800, windowBytes: 1.46e8, windowFirstAgeS: 2332800 }, null],
    ['the same day, weighed by the file over its rows: a false alarm, which is why hunt-health reads the row', { ledgerLastId: 1419800, ledgerDetailDays: 3, ledgerBytes: 2.5e9, ledgerEstRows: 1188000,
      ledgerFirstAgeS: 2332800, windowBytes: 1.46e8, windowFirstAgeS: 2332800 }, 'JOURNAL HORIZON'],
    ['the fold on over a ledger whose file is already past half the disk: folding its rows does not hand the pages back', { ledgerDetailDays: 3, ledgerBytes: 4.5e9, ledgerEstRows: 300000,
      ledgerRowBytes: 621, ledgerFirstAgeS: 2592000, windowBytes: 1e7, windowFirstAgeS: 2592000 }, 'The fold is on'],
  ];
  let bad = 0;
  for (const [name, patch, want] of cases) {
    const lines = pulseLines({ ...ok, ...patch });
    const alarms = lines.filter((l) => l.includes('<<'));
    const pass = want === null ? alarms.length === 0 : alarms.length === 1 && alarms[0].includes(want);
    if (!pass) { bad++; console.log(`  x ${name}: ${JSON.stringify(alarms)}`); }
  }
  console.log(bad ? `server-pulse --selftest: ${bad} RED` : `server-pulse --selftest: ${cases.length}/${cases.length} alarms fire and stay quiet`);
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url) && process.argv.includes('--selftest')) selftest();
