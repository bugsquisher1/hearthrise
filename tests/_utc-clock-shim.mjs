// ════════════════════════════════════════════════════════════════════════
// THE CLOCK SHIM — preload only. Used by tests/utc-midnight-replay.mjs.
//
// PGlite is PostgreSQL compiled to WASM, and emscripten serves gettimeofday
// from the host's JS clock. MEASURED 2026-09-16: with Date.now patched to
// 2026-09-17T23:59:52Z, `select now()` inside PGlite returned
// 2026-09-17T23:59:53.191Z — the database follows this patch to the
// millisecond. That is what makes a UTC-day-boundary replay testable at all
// on a machine whose real clock nobody may move.
//
// AN INJECTED CLOCK, NOT AN OFFSET OF THE REAL ONE (2026-10-11, lane
// fix-utc-midnight-flake). The first two versions parked the clock at an offset
// from PROCESS START and let it run at real speed, so the second at which any
// migration's transaction began was "offset + however long the machine took to
// get there". On a loaded box that is tens of seconds of drift (measured: the
// same replay reached kill-daily-credit's §4 block at 12.9 s idle and later
// under load), so a sweep arm labelled "midnight −2 s" ran its files somewhere
// else entirely, and an arm's verdict was a function of the machine's load —
// the flake two Security reviews hit on 2026-10-10/11. Nothing here reads the
// real clock any more:
//
//   * HR_FAKE_UTC_OFFSET_S = k. Migration file i of the chain begins its
//     transaction at EXACTLY  midnight + k s + i ms  — pinned by
//     tests/schema-replay.mjs, which calls globalThis.__HR_CLOCK_PIN__(i, name)
//     immediately before it applies each file. The +i ms keeps now() strictly
//     increasing from file to file, as it is in production.
//   * Between pins the clock ADVANCES — never a freeze, because a frozen clock
//     would hide interval arithmetic (clock_timestamp() durations) — but by a
//     fixed STEP per read, not by wall time. The same SQL makes the same reads,
//     so the same arm sees the same timestamps on an idle laptop and on a
//     saturated CI runner.
//   * A pin is EXACT, never "the next tick": if a file read the clock past the
//     next file's nominal start, the next file still begins on its own pin. A
//     max() here would make every later pin a function of how many reads (and,
//     below, how many timer firings) came before it — the very drift this
//     replaces. now() still rises file to file (pins are 1 ms apart); only a
//     clock_timestamp() taken late inside a file can exceed the next pin, and
//     the chain uses clock_timestamp() for durations and a hash salt only.
//   * Timers advance VIRTUAL time. Postgres arms its timeouts through
//     setitimer → setTimeout and, when one fires, compares its deadline with
//     GetCurrentTimestamp(); on a read-counted clock the deadline is never
//     reached, the timer re-arms forever and the process never exits (measured
//     on the first draft: the replay finished and was still alive 10 min
//     later). So a firing timer first moves the clock to the virtual instant it
//     was due — what a fake-timer library does. Which file a timer fires next to
//     is load-dependent, but a firing can only move the clock BETWEEN pins, and
//     the next pin resets it exactly, so no file's now() can see it.
//   * Before the first pin (the fixture and scaffold) the clock sits 1 ms
//     before the chain's first file.
//
// On exit the shim prints ONE line to stderr, `HRCLOCK pins=<n> first=<iso>
// last=<iso> target=<name>#<index>@<iso>`, so the harness can prove the clock was
// injected into every file it applied (a refactor of schema-replay.mjs that
// drops the pin call must turn the guard into a HARNESS failure, never into
// a silently real-time replay). HR_FAKE_UTC_DEBUG=1 adds one line per pin.
// ════════════════════════════════════════════════════════════════════════
const NativeDate = Date;
const realNow = NativeDate.now.bind(NativeDate);   // DEBUG output only — never served
const MIDNIGHT = NativeDate.parse('2026-09-18T00:00:00.000Z');
const raw = process.env.HR_FAKE_UTC_OFFSET_S;
const offset = Number(raw);
if (raw === undefined || raw === '' || !Number.isFinite(offset)) {
  // A clock shim with no clock is a harness defect, never "midnight + 0".
  process.stderr.write(`HRCLOCK-ERROR HR_FAKE_UTC_OFFSET_S is not a finite number: ${JSON.stringify(raw)}
`);
  process.exit(2);
}
const TARGET = process.env.HR_FAKE_UTC_TARGET || '';
const DEBUG = !!process.env.HR_FAKE_UTC_DEBUG;
const STEP_MS = 0.001;           // one microsecond of database time per clock read
const BASE = MIDNIGHT + offset * 1000;

let cur = BASE - 1;              // the fixture/scaffold run 1 ms before the chain
let reads = 0;
let pins = 0;
let firstPin = null;
let lastPin = null;
let targetPin = null;
let targetIndex = -1;
const real0 = realNow();
const iso = (ms) => new NativeDate(ms).toISOString();
const now = () => { reads++; cur += STEP_MS; return cur; };

/* HR_FAKE_UTC_DROP_PINS=1 exists for ONE caller: utc-midnight-replay --selftest,
   which proves that a replay whose pins never land is classified as a HARNESS
   failure rather than read as a green arm. */
const DROP_PINS = process.env.HR_FAKE_UTC_DROP_PINS === '1';
globalThis.__HR_CLOCK_PIN__ = (index, name) => {
  if (DROP_PINS) return;
  if (!Number.isInteger(index) || index < 0) {
    process.stderr.write(`HRCLOCK-ERROR pin for ${name} has no chain index (${index})
`);
    process.exit(2);
  }
  const at = BASE + index;       // + i ms
  cur = at - STEP_MS;            // the next read returns exactly the pin
  pins++;
  if (firstPin === null) firstPin = at;
  lastPin = at;
  if (name === TARGET) { targetPin = at; targetIndex = index; }
  if (DEBUG) process.stderr.write(`HRCLOCK-PIN ${index} ${name} ${iso(at)} reads=${reads} real=+${realNow() - real0}ms
`);
};

const wrapTimer = (orig) => function (fn, ms, ...rest) {
  if (typeof fn !== 'function') return orig.call(this, fn, ms, ...rest);
  const due = cur + Math.max(0, Number(ms) || 0);
  return orig.call(this, function (...args) {
    if (cur < due) cur = due;
    return fn.apply(this, args);
  }, ms, ...rest);
};
globalThis.setTimeout = wrapTimer(globalThis.setTimeout);

Date.now = now;
globalThis.Date = new Proxy(NativeDate, {
  construct(T, args) { return args.length === 0 ? new T(now()) : new T(...args); },
});
globalThis.Date.now = now;

process.on('exit', () => {
  process.stderr.write(`
HRCLOCK pins=${pins}`
    + ` first=${firstPin === null ? '-' : iso(firstPin)}`
    + ` last=${lastPin === null ? '-' : iso(lastPin)}`
    + ` target=${TARGET || '-'}#${targetIndex}@${targetPin === null ? '-' : iso(targetPin)}
`);
});
