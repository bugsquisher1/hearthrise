// ============================================================================
// src/net/hunt.js — THE HUNT SESSION WIRE (lane B1, ruling HR-2026-10-14).
//
// Server half: supabase/migrations/2026-10-21-hunt-sessions.sql (C1: the
// session, bag, tally, timeline and action-set RPCs) and
// 2026-10-22-hunt-sessions-settle.sql (C2: the settle, the stamina pool, the
// shop paid per use). The screen that draws all of this lives in src/world/**
// (hunt-chrome.js, hunt-bar.js, hunt-config.js, hunt-pack.js) and reaches the
// server only through `window.HearthriseHunt`, published here: src/world may
// not fetch (tests/world-no-authority.mjs W-CALL).
//
// ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
//   READS   hr_hunt_analyzer(slot, null) — the newest session (open or ended):
//           its row, bag lines with "lasts ~Xh", tally, Gold / Waste / Balance,
//           per-hour figures and the last 50 timeline events — and the
//           character's own player_action_sets rows (RLS: own rows only).
//   WRITES  two `_`-prefixed SCRATCH fields, each REPLACED whole by every read
//           and never merged, persisted or sent (CLAUDE.md §6):
//             G._huntSession  { at, view }   view = the analyzer's answer, or
//                                            null when the server holds no hunt
//             G._actionSets   { at, rows }   rows = the saved presets
//   SENDS   intents, each a SECURITY DEFINER RPC that re-validates everything:
//           enter, leave, restock, use (a press), set_preset, action_set_put,
//           action_set_delete, mark_seen. The client sends ids and small whole
//           numbers only — a hunt id, an item id with the quantity to pack, a
//           bar index, a preset index, a condition value. Never a time, HP,
//           count of anything it holds, price or loot.
//
// ── NOTHING HERE IS A NUMBER THE CLIENT DECIDES ─────────────────────────────
// A forged `G._huntSession` changes nothing the server does and is overwritten
// by the next read; the action bar is re-read after every edit rather than
// patched locally. A put is built from the freshest SERVER rows at send time
// (the caller hands a transform, not a finished bar), so two quick edits never
// overwrite each other with a stale copy.
//
// ── IDEMPOTENCY (the intent contract every net module shares) ───────────────
// One key per verb, kept across an UNANSWERED call (network loss) so the next
// tap is a retry the server replays, retired by any answer. Calls of one verb
// run one after another. A refusal never consumes a key server-side, so the two
// recoveries below retry with the same key:
//   settle_first      → run the accrue settle (it settles a hunter's session),
//                        then retry once — the contract's own recovery.
//   activity_running  → (enter only) declare idle, then retry once: the server
//                        resumed the last gather after an automatic end, and
//                        "Hunt again" means leave it.
//
// TEST SEAM: configureHuntTransport({ rpc, select, settle, idle, record }).
// The in-page suite drives the real module against a fake server; production
// uses PostgREST with the signed-in session, as src/net/vigour.js does.
// ============================================================================

import { resolveActiveSlot } from './accrue.js?v=582';
import { END_CARD_COPY } from '../data/hunt-sessions.js?v=582';
import { DEFAULT_PRESET } from '../data/rule-subjects.js?v=582';

const POLL_MS = 10000;          // the world tick's cadence: a read more often learns nothing
const STALE_MS = 5000;          // a watch that starts on a read older than this re-reads at once

const g = () => (typeof window !== 'undefined' ? window.G : null) || null;

/* ── THE TRANSPORT ─────────────────────────────────────────────────────── */
function cfg() {
  const S = window.HearthriseSupabase;
  return (S && typeof S.getConfig === 'function' && S.getConfig()) || null;
}
function token() {
  const A = window.HearthriseAuth;
  const s = A && typeof A.getSession === 'function' ? A.getSession() : null;
  return (s && s.access_token) || null;
}
function headers(c, t) {
  return { apikey: c.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
}
const missing = (json, status) => status === 404 || !!(json && (json.code === 'PGRST202'
  || (typeof json.message === 'string' && /could not find the function/i.test(json.message))));

async function liveRpc(name, args) {
  const c = cfg(), t = token();
  if (!c) return { ok: false, error: 'no_config' };
  if (!t) return { ok: false, error: 'not_signed_in' };
  try {
    const r = await fetch(c.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers(c, t), body: JSON.stringify(args) });
    let json = null;
    try { json = await r.json(); } catch (e) { json = null; }
    if (missing(json, r.status)) return { ok: false, error: 'rpc_missing' };
    return (json && typeof json === 'object' && !Array.isArray(json)) ? json : { ok: false, error: 'bad_response', status: r.status };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}
async function liveSelect(slot) {
  const c = cfg(), t = token();
  if (!c || !t) return null;
  try {
    const r = await fetch(c.url + '/rest/v1/player_action_sets?select=preset,name,slots,target_mode,pull_count&slot=eq.'
      + slot + '&order=preset.asc', { headers: headers(c, t) });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows : null;
  } catch (e) { return null; }
}
const LIVE = Object.freeze({
  rpc: liveRpc,
  select: liveSelect,
  /* "Bring my hunt up to date": the accrue settle prices a hunter's session. */
  settle: () => { const A = window.HearthriseAccrual; return A && A.requestAccrual ? A.requestAccrual({ force: true }) : null; },
  /* Stop what the server resumed (a gather) so a hunt may open. */
  idle: () => { const A = window.HearthriseActivity; return A && A.declareActivity ? A.declareActivity('idle', null) : null; },
  /* Items, gold and the pointer moved: the record re-reads them all. */
  record: () => { const R = window.HearthriseRecord; return R && R.requestRecord ? R.requestRecord() : null; },
});
let T = LIVE;
function configureHuntTransport(t) { T = t ? Object.assign({}, LIVE, t) : LIVE; }

const slot = () => resolveActiveSlot(undefined);
function newIdem() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ── THE READ ──────────────────────────────────────────────────────────── */
let reading = null;
async function refresh() {
  if (reading) return reading;
  reading = (async () => {
    const s = slot();
    const [a, rows] = await Promise.all([
      Promise.resolve(T.rpc('hr_hunt_analyzer', { p_slot: s, p_session: null })).catch(() => ({ ok: false, error: 'network' })),
      Promise.resolve(T.select(s)).catch(() => null),
    ]);
    const G = g();
    if (!G) return null;
    /* ABSOLUTE: an answer replaces the scratch whole. `no_hunt` is an answer
       ("this character has never hunted"); a transport failure is not, and
       leaves the last answer standing with its own age. */
    if (a && a.ok === true) G._huntSession = { at: Date.now(), view: a };
    else if (a && a.error === 'no_hunt') G._huntSession = { at: Date.now(), view: null };
    if (Array.isArray(rows)) G._actionSets = { at: Date.now(), rows };
    return G._huntSession || null;
  })();
  try { return await reading; } finally { reading = null; }
}

/* ── THE WATCH: one read every world tick while the hunt screen is in front ── */
let timer = 0, watching = false;
function tick() {
  timer = 0;
  if (!watching) return;
  refresh().catch(() => {}).then(() => { if (watching && !timer) timer = setTimeout(tick, POLL_MS); });
}
function watch(on) {
  const want = !!on && !(typeof document !== 'undefined' && document.hidden);
  if (want === watching) return;
  watching = want;
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!want) return;
  const hs = g() && g()._huntSession;
  if (!hs || Date.now() - hs.at > STALE_MS) tick();
  else timer = setTimeout(tick, POLL_MS);
}

/* ── THE INTENTS ───────────────────────────────────────────────────────── */
const keys = Object.create(null);
const chains = Object.create(null);
let busyCount = 0;

/* What a refusal means to a person. A code this build has never heard of is
   still quoted, so a bug report can name it. */
const SENTENCES = Object.freeze({
  hunts_paused: 'Hunts are paused for maintenance. Nothing was packed.',
  unknown_hunt: 'That hunt is not open yet.',
  hunt_open: 'You are already on a hunt.',
  party_hunt_running: 'You are on a party hunt. Leave it first.',
  no_stamina: 'You are out of stamina. It rests back while you are not hunting.',
  no_vigour: 'You are out of stamina. It rests back while you are not hunting.',
  activity_running: 'Stop what you are doing in town first, then set out.',
  activity_locked: 'That hunt opens at a higher combat level.',
  hunt_locked: 'That hunt opens at a higher combat level.',
  too_many_lines: 'A hunt bag holds 10 different supplies.',
  duplicate_line: 'That bag could not be packed. Check the amounts.',
  bad_bag: 'That bag could not be packed. Check the amounts.',
  bad_qty: 'That bag could not be packed. Check the amounts.',
  unknown_supply: 'That item cannot go in a hunt bag.',
  no_hunt: 'No hunt is running.',
  hunt_leaving: 'You are already heading home.',
  settle_first: 'The hunt is catching up. Try again in a few seconds.',
  bag_empty: 'That supply has run out.',
  press_queued: 'That slot already fires on the next swing.',
  bad_bar_slot: 'That slot is empty.',
  bad_slots: 'That action could not be saved.',
  bad_name: 'Names are 32 letters at most.',
  preset_in_use: 'This set is running your hunt. Switch sets before deleting it.',
  unknown_preset: 'That action set no longer exists.',
  bad_preset: 'You can keep 5 action sets.',
  rate_limited: 'Slow down a moment, then try again.',
  version_conflict: 'The realm was busy for a moment. Try that again.',
  network: 'No connection. Nothing changed.',
  rpc_missing: 'Hunts are not open on this server yet.',
  no_config: 'Not connected to the realm. Nothing changed.',
  not_signed_in: 'Sign in to hunt.',
  no_character: 'Your hero is still loading. Try again in a moment.',
});
function itemName(id) {
  const I = window.ITEMS;
  return (I && I[id] && I[id].name) || String(id || '').replace(/_/g, ' ');
}
function refusalSentence(res) {
  const code = String((res && res.error) || '');
  if (code === 'insufficient_item' && res.item) {
    return END_CARD_COPY.againShort.replace('{item}', itemName(res.item))
      .replace('{have}', Number(res.have || 0).toLocaleString('en-US')).replace('{need}', Number(res.need || 0).toLocaleString('en-US'));
  }
  return SENTENCES[code] || (code ? 'The realm refused that (' + code + '). Nothing changed.' : 'That did not go through. Nothing changed.');
}

/**
 * One gesture of one verb. `args(key)` builds the RPC arguments AT SEND TIME
 * (after any earlier call of the same verb has been answered and re-read).
 * Resolves with the server's verdict, never rejects.
 */
function intent(verb, rpc, args, o) {
  const opt = o || {};
  const run = async () => {
    busyCount++;
    try {
      if (!keys[verb]) keys[verb] = newIdem();
      const key = keys[verb];
      const ask = () => Promise.resolve(T.rpc(rpc, args(key))).catch(() => ({ ok: false, error: 'network' }));
      let res = await ask();
      if (res && res.error === 'settle_first') { try { await T.settle(); } catch (e) { /* the retry answers */ } res = await ask(); }
      if (res && res.error === 'activity_running' && opt.idleFirst) { try { await T.idle(); } catch (e) { /* the retry answers */ } res = await ask(); }
      if (!res || res.error !== 'network') delete keys[verb];
      if (res && res.ok === true) {
        if (opt.moves) { try { await T.record(); } catch (e) { /* the record re-reads on its own cadence */ } }
        await refresh().catch(() => {});
      }
      return res || { ok: false, error: 'bad_response' };
    } finally { busyCount--; }
  };
  const p = (chains[verb] || Promise.resolve()).then(run, run);
  chains[verb] = p.then(() => {}, () => {});
  return p;
}

/* The freshest SERVER bar of a preset: the saved row, else the catalogue
   default for preset 0 (hr_hunt_preset_slots answers the same). */
function rowOf(p) {
  const G = g(), rows = (G && G._actionSets && G._actionSets.rows) || [];
  return rows.find((r) => Number(r.preset) === p) || null;
}

let nextPreset = null;
let pendingPack = null;

const api = {
  refresh, watch,
  /** Pack and set out. `bag` is [{item, qty}] — quantities the player chose, re-checked server-side. */
  enter(hunt, bag, preset) {
    return intent('enter', 'hr_hunt_enter', (k) => ({ p_slot: slot(), p_hunt: String(hunt), p_preset: preset | 0,
      p_bag: (bag || []).map((l) => ({ item: String(l.item), qty: Math.floor(Number(l.qty)) })),
      p_falls: null, p_hours: null, p_idem: k }), { moves: true, idleFirst: true });
  },
  leave() { return intent('leave', 'hr_hunt_leave', (k) => ({ p_slot: slot(), p_idem: k }), { moves: true }); },
  restock(item, qty) {
    return intent('restock', 'hr_hunt_restock', (k) => ({ p_slot: slot(), p_item: String(item), p_qty: Math.floor(Number(qty)), p_idem: k }), { moves: true });
  },
  /** Fire one bar slot at the next swing (the rules' own limits still apply). */
  use(barSlot) { return intent('use', 'hr_hunt_use', (k) => ({ p_slot: slot(), p_bar_slot: barSlot | 0, p_idem: k })); },
  /** Switch action set: the running hunt's (a server write) or the next hunt's (a choice). */
  setPreset(p) {
    const G = g(), v = G && G._huntSession && G._huntSession.view;
    const open = v && v.session && !v.session.ended_at;
    nextPreset = p | 0;
    if (!open) return Promise.resolve({ ok: true, local: true });
    return intent('preset', 'hr_hunt_set_preset', (k) => ({ p_slot: slot(), p_preset: p | 0, p_idem: k }));
  },
  /**
   * Save a preset. `edit(slots, row)` returns the new slot list from the
   * freshest server copy; `name` (optional) renames. Built at send time.
   */
  putSet(p, edit, name) {
    return intent('put', 'hr_action_set_put', (k) => {
      const row = rowOf(p | 0);
      const fallback = (p | 0) === 0 ? DEFAULT_PRESET.slots : [];
      const base = row ? row.slots : fallback;
      const slots = typeof edit === 'function' ? edit(JSON.parse(JSON.stringify(base || [])), row) : base;
      return { p_slot: slot(), p_preset: p | 0, p_name: name != null ? String(name) : (row ? row.name : ((p | 0) === 0 ? DEFAULT_PRESET.name : null)), p_slots: slots, p_idem: k };
    });
  },
  deleteSet(p) { return intent('delete', 'hr_action_set_delete', (k) => ({ p_slot: slot(), p_preset: p | 0, p_idem: k })); },
  /** Move the timeline's read cursor (never backwards: the server clamps). */
  markSeen(session, eventId) {
    return intent('seen', 'hr_mark_seen', () => ({ p_slot: slot(), p_session: String(session), p_event_id: Math.floor(Number(eventId)) }));
  },
  /** The War Table's Hunt button: open the World on the packing sheet for `hunt`. */
  openPack(hunt) {
    pendingPack = { hunt: String(hunt), at: Date.now() };
    if (typeof window.showTab === 'function') window.showTab('world');
    return true;
  },
  takePack() { const p = pendingPack; pendingPack = null; return p; },
  /** What the hunt screen reads: server scratch plus this module's own gesture state. */
  snapshot() {
    const G = g() || {};
    const hs = G._huntSession || null, sets = G._actionSets || null;
    const v = hs && hs.view;
    return {
      known: !!hs, at: hs ? hs.at : 0, view: v || null,
      sets: sets ? sets.rows : null,
      nextPreset: nextPreset != null ? nextPreset : (v && v.session ? Number(v.session.preset) || 0 : 0),
      busy: busyCount > 0,
    };
  },
  refusalSentence,
  configureHuntTransport,
  __reset() {
    for (const k of Object.keys(keys)) delete keys[k];
    for (const k of Object.keys(chains)) delete chains[k];
    nextPreset = null; pendingPack = null; busyCount = 0; reading = null;
    watch(false);
  },
};

if (typeof window !== 'undefined') {
  window.HearthriseHunt = api;
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) watch(false); });
}
