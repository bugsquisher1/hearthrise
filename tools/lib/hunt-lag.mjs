// tools/lib/hunt-lag.mjs — what an open hunt's settle lag MEANS, for the local read-only tools
// (tools/hunt-health.local.mjs, tools/char-state.local.mjs; the session-brief hook greps their lines).
//
// Measured 2026-10-21 (lane a-settle-lag): an UNWATCHED hunt is settled only by the world tick, which
// rosters a session once it is hr_tick_config.flush_seconds (90 s) behind, so its lag is a sawtooth
// 0 -> flush + cadence (~100 s) by design (7529fc8e: 0 -> 95 s every 100 s, world_swing +50 per settle,
// no backlog, fire cost flat ~1.0 s over 6 h). A WATCHED hunt's browser settles it every huntPollMs
// (16 s); only there does a lag past the look-ahead (liveSeeds x 2 s = 32 s) freeze a screen.
//   FREEZING  watched and lag > look-ahead: the viewer's prediction runs out of seeds
//   STALLED   lag > flush + 2 x cadence + slack: the tick itself is not keeping up (watched or not)
//   ok        anything else, labelled watched / unwatched
//
//   node tools/lib/hunt-lag.mjs --selftest   the verdict table, each alarm proved to fire and to stay quiet
const LOOK_AHEAD_S = 32;
const STALL_SLACK_S = 15;

/** @returns {{ code: 'ok'|'FREEZING'|'STALLED', note: string }} */
export function lagVerdict({ lagS, watched, flushS = 90, cadenceS = 10 }) {
  const lag = Number(lagS);
  const stallAt = Number(flushS) + 2 * Number(cadenceS) + STALL_SLACK_S;
  if (lag > stallAt) return { code: 'STALLED', note: `STALLED: server ${lag}s behind, the tick should flush by ${stallAt}s` };
  if (watched && lag > LOOK_AHEAD_S) return { code: 'FREEZING', note: `FREEZING: watched, server ${lag}s behind (look-ahead ${LOOK_AHEAD_S}s)` };
  return { code: 'ok', note: watched ? 'watched' : `unwatched (tick flushes every ${flushS}s)` };
}

/* A user is WATCHING when its browser asked the `accrue` bucket in the last 2 minutes (a viewed hunt asks
   every 16 s). Per user, not per slot: hr_rate_counters keys no slot. */
export const WATCHED_SQL = `select distinct user_id::text u from public.hr_rate_counters
  where (bucket = 'accrue' or bucket like 'accrue:%') and window_start > now() - interval '2 minutes'`;

function selftest() {
  const cases = [
    [{ lagS: 57, watched: false }, 'ok'],        // 7529fc8e 2026-10-21: the flush sawtooth, not a freeze
    [{ lagS: 95, watched: false }, 'ok'],
    [{ lagS: 12, watched: true }, 'ok'],         // a viewed solo hunt between polls
    [{ lagS: 40, watched: true }, 'FREEZING'],
    [{ lagS: 126, watched: false }, 'STALLED'],
    [{ lagS: 126, watched: true }, 'STALLED'],
    [{ lagS: 200, watched: false, flushS: 180 }, 'ok'],
  ];
  let bad = 0;
  for (const [inp, want] of cases) {
    const got = lagVerdict(inp).code;
    if (got !== want) { bad++; console.log(`  ✗ ${JSON.stringify(inp)} -> ${got}, want ${want}`); }
  }
  console.log(bad ? `hunt-lag --selftest: ${bad} RED` : `hunt-lag --selftest: ${cases.length}/${cases.length} verdicts`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && /hunt-lag\.mjs$/.test(process.argv[1]) && process.argv.includes('--selftest')) selftest();
