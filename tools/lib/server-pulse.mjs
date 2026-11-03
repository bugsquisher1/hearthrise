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
  return out;
}

function selftest() {
  const ok = { dbBytes: 3e8, dbBytes24h: 2.9e8, fsUsedBytes: 9e8, diskBytes: 8e9, conns: 21, maxConns: 90, engineConns: 2, engineCap: 20, active: 2, peakConns: 22,
    tickLastS: 4, fires10m: 60, edge5xx10m: 0, edgeTimedOut10m: 0, edgePosts10m: 40, openHunts: 50, stalledHunts: 0, worstLagS: 96,
    oldestFrameH: 0.8, cronFailed1h: 0, ledgerRows24h: 1300, frames1m: 12, frameKBs: 13, dbMsPerS: 350, edgeAll10m: 1200, edgeAll5xx10m: 0 };
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
