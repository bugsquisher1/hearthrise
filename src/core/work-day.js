// ════════════════════════════════════════════════════════════════════════
// src/core/work-day.js — THE HERO'S WORK DAY: WHEN TOWN WORK MUST STOP, AND WHAT A WINDOW OF IT SPENT
//   (FB-10 slice 1; Tyler 2026-11-22 CR-Q3 b; the numbers are src/data/work-day.js).
//
// ONE RULE, TWO RUNTIMES. The edge (supabase/functions/hr-accrue/accrual.js) stops a gathering job or a bench run at
// workStopMs, and the world tick carries the counter between its polls with foldWork (tick-shadow.js). Postgres re-checks
// every window with the SQL twin hr_work_fold (1059-company-trades.sql) and refuses `work_cap` past the day; the twin is
// pinned to this file by tests/company-trades.mjs CT-TWIN. Day arithmetic is whole UTC days on the server clock.
//
// THE STATE (player_state.work_day, work_ms; the envelope's `work_day` section): the last UTC day the hero worked and the
// ms of town work it did that day. A window [from, to] of work spends, day by day, its overlap with each UTC day; a day's
// spend may not pass that day's cap. The cap is the hero's base day (free, or free + Premium's extra) plus, on the server's
// today only, the work blocks bought today and those the hero's standing rule may still buy today (`extraMs`, the server's
// hr_work_extra_ms, 1071-work-blocks.sql: a rule's block is charged at the settle whose work enters it, so the engine works on into it).
//
// THE STOP. From a window's start the hero works until the day's work is used up. If midnight comes first, the new UTC day
// opens a fresh cap and the hero works on until that cap is used up (the day is under 24 h, src/data/work-day.js validate,
// so a stop crosses at most one midnight).
//
// PURE ESM, Node + Deno. Integers in, integers out. No clock: every instant is an argument.
// ════════════════════════════════════════════════════════════════════════

import { WORK_KINDS } from '../data/work-day.js';

export const DAY_MS = 86400000;

/** The UTC day an instant falls in, as its first ms. */
export function utcDayStart(ms) { return Math.floor(ms / DAY_MS) * DAY_MS; }

/* 'YYYY-MM-DD' (the server's date) as its first ms, or null. */
function dayMsOf(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Number.isFinite(ms) ? ms : null;
}

/** Is this pointer kind town work? */
export function isWorkKind(kind) { return WORK_KINDS.includes(kind); }

const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);

/* The cap of the UTC day `dayMs` for a hero whose state is `w` ({ baseMs, extraMs, todayMs }): the base day (the server's
   hr_work_base_ms: the free day, or with Premium's extra), plus the work bought today on the server's today only. */
function capOfDay(w, dayMs) {
  return nat(w.baseMs) + (dayMs === w.todayMs ? nat(w.extraMs) : 0);
}

/** The instant work that starts at `fromMs` must stop (>= fromMs). `w`: { dayMs, usedMs, baseMs, extraMs, todayMs }. */
export function workStopMs(w, fromMs) {
  const d0 = utcDayStart(fromMs);
  const used0 = d0 === w.dayMs ? nat(w.usedMs) : 0;
  const left0 = Math.max(0, capOfDay(w, d0) - used0);
  const mid = d0 + DAY_MS;
  if (fromMs + left0 < mid) return fromMs + left0;
  return mid + Math.max(0, capOfDay(w, mid) - (mid === w.dayMs ? nat(w.usedMs) : 0));
}

/**
 * What a window of work [fromMs, toMs] spends: { ok, dayMs, usedMs, overMs, leftMs }. `ok` false when the window takes any UTC day it
 * touches past that day's cap (overMs: by how much, the largest). A day already past its cap (a cap that fell: Premium ran out) may
 * not grow, but a window that adds nothing to it passes, so a job can always be ended. dayMs/usedMs: the state after it (the day
 * `toMs` falls in); leftMs: what that day has left.
 */
export function foldWork(w, fromMs, toMs) {
  const to = Math.max(fromMs, toMs);
  let over = 0;
  let dayMs = utcDayStart(fromMs);
  let usedMs = 0;
  let capMs = 0;
  /* at most a few days: a window longer than that is over the cap on its middle days anyway */
  for (let d = dayMs, i = 0; d <= utcDayStart(to) && i < 8; d += DAY_MS, i++) {
    const overlap = Math.max(0, Math.min(to, d + DAY_MS) - Math.max(fromMs, d));
    const before = d === w.dayMs ? nat(w.usedMs) : 0;
    const used = before + overlap;
    const cap = capOfDay(w, d);
    over = Math.max(over, used - Math.max(cap, before));
    dayMs = d; usedMs = used; capMs = cap;
  }
  if (utcDayStart(to) - utcDayStart(fromMs) >= 8 * DAY_MS) over = Math.max(over, DAY_MS);
  return { ok: over <= 0, dayMs, usedMs, overMs: Math.max(0, over), leftMs: Math.max(0, capMs - usedMs) };
}

/** The work state the engine reads, from the envelope's `work_day` section, or null (a database without the work day). */
export function workStateOf(section) {
  const s = section;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const todayMs = dayMsOf(s.today);
  if (todayMs === null || !Number.isSafeInteger(s.base_ms) || s.base_ms < 0) return null;
  const dayMs = dayMsOf(s.day);
  return { dayMs: dayMs === null ? todayMs : dayMs, usedMs: dayMs === null ? 0 : nat(s.used_ms), baseMs: s.base_ms,
    extraMs: nat(s.extra_ms), todayMs };
}
