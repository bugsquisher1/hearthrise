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
// HR_FAKE_UTC_OFFSET_S seconds past a UTC midnight; negative parks the clock
// BEFORE it so the run straddles the boundary. The clock still ADVANCES at
// real speed — this is an offset, never a freeze, because a frozen clock
// would hide exactly the interval arithmetic the guard is looking for.
// ════════════════════════════════════════════════════════════════════════
const REAL = Date.now.bind(Date);
const MIDNIGHT = Date.parse('2026-09-18T00:00:00.000Z');
const offset = Number(process.env.HR_FAKE_UTC_OFFSET_S || '0');
const target = MIDNIGHT + offset * 1000;
const t0 = REAL();
const NativeDate = Date;
Date.now = () => target + (REAL() - t0);
globalThis.Date = new Proxy(NativeDate, {
  construct(T, args) { return args.length === 0 ? new T(Date.now()) : new T(...args); },
});
globalThis.Date.now = Date.now;
