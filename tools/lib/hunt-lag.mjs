// tools/lib/hunt-lag.mjs — what an open hunt's settle lag MEANS, for the local read-only tools
// (tools/hunt-health.local.mjs, tools/char-state.local.mjs; the session-brief hook greps their lines).
//
// Measured 2026-10-21 (lane a-settle-lag): an UNWATCHED hunt is settled only by the world tick, which
// rosters a session once it is hr_tick_config.flush_seconds (90 s) behind, so its lag is a sawtooth
// 0 -> flush + cadence (~100 s) by design (7529fc8e: 0 -> 95 s every 100 s, world_swing +50 per settle,
// no backlog, fire cost flat ~1.0 s over 6 h). THE FLUSH (lane/c-settle-flush, 30-plan L12): a WATCHED hunt's browser
// CONFIRMS every huntPollMs (16 s) and the edge answers its seeds without saving, so the hunt is saved at the flush like
// an unwatched one (by its own door or the tick) and its lag is the same sawtooth. Its screen freezes only when the door
// stops answering, which leaves the hunt past the flush by more than a poll (once the lag passed the 32 s look-ahead).
//   FREEZING  watched and lag > flush + one poll + slack: neither the confirm door nor the tick saved at the flush
//   STALLED   lag > flush + 2 x cadence + slack: the tick itself is not keeping up (unwatched)
//   ok        anything else, labelled watched / unwatched
//
//   node tools/lib/hunt-lag.mjs --selftest   the verdict table, each alarm proved to fire and to stay quiet
const POLL_S = 16;   // src/session/config.js huntPollMs
const STALL_SLACK_S = 15;

/** @returns {{ code: 'ok'|'FREEZING'|'STALLED', note: string }} */
export function lagVerdict({ lagS, watched, flushS = 90, cadenceS = 10 }) {
  const lag = Number(lagS);
  const stallAt = Number(flushS) + 2 * Number(cadenceS) + STALL_SLACK_S;
  const freezeAt = Number(flushS) + POLL_S + STALL_SLACK_S;
  if (watched && lag > freezeAt) return { code: 'FREEZING', note: `FREEZING: watched, server ${lag}s behind (its door saves at the ${flushS}s flush)` };
  if (lag > stallAt) return { code: 'STALLED', note: `STALLED: server ${lag}s behind, the tick should flush by ${stallAt}s` };
  return { code: 'ok', note: watched ? `watched (saved at the ${flushS}s flush)` : `unwatched (tick flushes every ${flushS}s)` };
}

/* A hunt is WATCHED when a browser asked the `accrue` bucket for one of its heroes in the last 2 minutes (a viewed
   hunt asks every 16 s). The bucket names the viewed slot (`accrue:3`), so it is per hero: per user, an account
   viewing one of its two parties flagged the other's 0-100 s tick sawtooth FREEZING (report #69 triage, 2026-10-29).
   A bare `accrue` row (no slot) watches every hero of the user. */
export const WATCHED_SQL = `select distinct user_id::text u, nullif(split_part(bucket, ':', 2), '') s from public.hr_rate_counters
  where (bucket = 'accrue' or bucket like 'accrue:%') and window_start > now() - interval '2 minutes'`;

/** WATCHED_SQL's rows -> a predicate over a hunt's heroes [[user, slot], ...]: true when any of them is viewed. */
export function watchedOf(rows) {
  const keys = new Set((rows || []).map((r) => String(r.u) + ':' + (r.s === null || r.s === undefined ? '*' : String(r.s))));
  return (heroes) => (heroes || []).some(([u, s]) => keys.has(String(u) + ':' + String(s)) || keys.has(String(u) + ':*'));
}

function selftest() {
  const cases = [
    [{ lagS: 57, watched: false }, 'ok'],        // 7529fc8e 2026-10-21: the flush sawtooth, not a freeze
    [{ lagS: 95, watched: false }, 'ok'],
    [{ lagS: 12, watched: true }, 'ok'],         // a viewed solo hunt between polls
    [{ lagS: 95, watched: true }, 'ok'],         // the flush: a viewed hunt saved at 90 s, its confirms between
    [{ lagS: 122, watched: true }, 'FREEZING'],  // past the flush by more than a poll: its door is not saving
    [{ lagS: 122, watched: false }, 'ok'],
    [{ lagS: 126, watched: false }, 'STALLED'],
    [{ lagS: 126, watched: true }, 'FREEZING'],
    [{ lagS: 200, watched: false, flushS: 180 }, 'ok'],
  ];
  let bad = 0;
  for (const [inp, want] of cases) {
    const got = lagVerdict(inp).code;
    if (got !== want) { bad++; console.log(`  ✗ ${JSON.stringify(inp)} -> ${got}, want ${want}`); }
  }
  /* report #69: account 0d959747 viewing slot 3 (party 29cabe67, slots 2 and 3); its other party (slots 0 and 1) is not watched */
  const w = watchedOf([{ u: '0d959747', s: '3' }, { u: 'f765aea0', s: null }]);
  const seen = [[w([['0d959747', 2], ['0d959747', 3]]), true], [w([['0d959747', 0], ['0d959747', 1]]), false], [w([['f765aea0', 2]]), true], [w([['abc', 3]]), false]];
  seen.forEach(([got, want], i) => { if (got !== want) { bad++; console.log(`  ✗ watchedOf case ${i}: ${got}, want ${want}`); } });
  console.log(bad ? `hunt-lag --selftest: ${bad} RED` : `hunt-lag --selftest: ${cases.length}/${cases.length} verdicts, ${seen.length}/${seen.length} watched heroes`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && /hunt-lag\.mjs$/.test(process.argv[1]) && process.argv.includes('--selftest')) selftest();
