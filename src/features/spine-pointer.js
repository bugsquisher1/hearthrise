// ════════════════════════════════════════════════════════════════════════
// src/features/spine-pointer.js — THE ONE POINTER (window.HearthriseSpine).
//
// One bar in the topbar on every tab names the step the player is on, what
// it still needs and one button: Go to the first thing missing, then Build,
// Hire or Wear, then Claim when the step's server reward is waiting. Home
// leads with the same step as its top card (src/features/home-dashboard.js
// asks `cardHtml()`), so the bar steps aside there. Today's daily quests ride
// the bar as a "Daily 1/3" chip.
//
// THE FACTS ARE THE REVEAL'S (window.HearthriseReveal.facts(): the envelope's
// counters, property rung, crew, bag and claimed quests, plus the record's
// skills, gold and worn set). Nothing reads G.quests to judge a step. The one
// client memo is the claim RPC's own answer, so a Claim the server has just
// paid does not ask again before the next envelope lands.
//
// THE UNLOCK MOMENT follows src/features/climb-marks.js: the first reading per
// account and slot is a silent baseline, then each newly finished step shows
// its `opens` line once.
// ════════════════════════════════════════════════════════════════════════

import { POINTER_STEPS, ROUTES, CHAPTER_END } from '../data/spine-pointer.js?v=567';
import { QUEST_REWARDS } from '../data/goal-catalogue.js?v=567';
import { pointerModel, newlyDone, momentsKnown } from '../core/spine-pointer.js?v=567';
import { barHtml, cardHtml } from '../render/spine-pointer.js?v=567';
import { isRecordPending } from '../net/record.js?v=567';

const BAR_ID = 'hr-spine-bar';
const answered = Object.create(null);     // quest id → the claim RPC confirmed it is paid
let seen = null;
let seenKey = null;
let parked = false;
let lastBar = null;

function reveal() { return typeof window !== 'undefined' ? window.HearthriseReveal : null; }

/** The facts the pointer judges from, with the claim RPC's answers folded in. */
export function facts() {
  const R = reveal();
  const f = R && typeof R.facts === 'function' ? R.facts() : null;
  if (!f) return null;
  if (!f.claimed || !Object.keys(answered).length) return f;
  return Object.assign({}, f, { claimed: Object.assign({}, f.claimed, answered) });
}

export function model() {
  const f = facts();
  return f ? pointerModel(f, POINTER_STEPS, QUEST_REWARDS, CHAPTER_END) : null;
}

function pendingRecord() {
  try { return isRecordPending(); } catch (e) { return true; }
}

function daily() {
  const DQ = window.HearthriseDailyQuests;
  if (!DQ || typeof DQ.summary !== 'function') return null;
  const d = DQ.summary();
  const R = reveal();
  if (!d || !(d.claim || !R || R.shows('card:quests-chip'))) return null;
  return d;
}

function lookups() {
  const HR = window.HR;
  const B = window.HearthriseBalance;
  return {
    routes: ROUTES,
    icon: (key, px, color) => (HR && HR.icon ? (HR.icon(key, px, color) || '') : ''),
    itemName: (id) => (window.ITEMS && window.ITEMS[id] && window.ITEMS[id].n) || String(id).replace(/_/g, ' '),
    skillName: (id) => (window.SKILLS_DEF && window.SKILLS_DEF[id] && window.SKILLS_DEF[id].name) || id,
    dash: (B && typeof B.countMarkup === 'function') ? B.countMarkup(null, { label: 'Not counted yet' }) : '<span class="bal-pending">—</span>',
    daily: daily(),
    pending: pendingRecord(),
  };
}

/** Home's top card (empty while the record is pending). */
export function homeCard() { return cardHtml(model(), lookups()); }

/* ── ACTIONS ─────────────────────────────────────────────────────────── */

function claim(questId) {
  const G = window.G;
  const q = (G && Array.isArray(G.quests) && G.quests.find((x) => x && x.id === questId)) || { id: questId };
  const fire = window.hrFireQuestClaim;
  const p = typeof fire === 'function' ? fire(q) : null;
  if (!p || typeof p.then !== 'function') return null;
  return p.then((res) => {
    if (res && (res.ok === true || res.error === 'already_claimed')) answered[questId] = true;
    else if (typeof window.notify === 'function') window.notify('That claim did not go through. Your progress is safe, try again in a moment.', 'kill');
    render();
    return res;
  });
}

/** The button: claim the step's reward, or go where the first missing part is made. */
export function go() {
  const m = model();
  if (!m || m.finished || !m.go) return null;
  if (m.go.kind === 'claim') return claim(m.go.quest);
  const r = ROUTES[m.go.route];
  if (!r) return null;
  if (typeof window.showTab === 'function') window.showTab(r.tab);
  if (r.skill && typeof window.openSkillDetail === 'function') window.openSkillDetail(r.skill);
  return r;
}

/** A pointer button by kind: 'go' (Go, Build, Claim…) or 'daily' (the chip). */
export function act(kind) {
  if (kind === 'go') return go();
  if (kind === 'daily' && typeof window.openQuestsModal === 'function') return window.openQuestsModal();
  return null;
}

function onClick(e) {
  const hit = e.target && e.target.closest && e.target.closest('[data-sp]');
  if (!hit) return;
  e.preventDefault();
  act(hit.getAttribute('data-sp'));
}

/* ── THE BAR ─────────────────────────────────────────────────────────── */

function onHome() {
  const p = document.getElementById('panel-profile');
  return !!(p && p.classList.contains('active'));
}

function ensureBar() {
  let bar = document.getElementById(BAR_ID);
  if (bar) return bar;
  /* IN the topbar, between the player and the stats: the one row every tab
     already has, so the pointer costs a landscape phone no height at all. */
  const topbar = document.querySelector('main .topbar') || document.querySelector('.topbar');
  if (!topbar) return null;
  bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.className = 'sp-bar';
  bar.setAttribute('role', 'navigation');
  bar.setAttribute('aria-label', 'Your next step');
  bar.addEventListener('click', onClick);
  topbar.insertBefore(bar, topbar.querySelector('.top-stats'));
  return bar;
}

export function render() {
  const P = window.HearthrisePresence;
  if (P && typeof P.inOfflineReplay === 'function' && P.inOfflineReplay()) return;
  const bar = ensureBar();
  if (!bar) return;
  const DQ = window.HearthriseDailyQuests;
  if (DQ && typeof DQ.ambient === 'function') DQ.ambient((fresh) => { if (fresh) render(); });
  const home = onHome();
  if (bar.hidden !== home) bar.hidden = home;
  if (home) return;
  const html = barHtml(model(), lookups());
  if (html !== lastBar) { bar.innerHTML = html; lastBar = html; }
  fitRoom(bar);
}

/* On a landscape phone the pane strip (src/styles/menu-journal.css) also rides
   the topbar's middle: the bar takes only the room right of it, and its title
   gives way (ellipsis) before the button does. */
function fitRoom(bar) {
  const top = bar.parentElement, strip = bar.ownerDocument.getElementById('hub-tabs');
  if (!top || !top.getBoundingClientRect) return;
  const t = top.getBoundingClientRect(), b = bar.getBoundingClientRect();
  let pad = 0;
  if (strip && !strip.hidden) {
    const r = strip.getBoundingClientRect();
    if (r.width > 0 && r.top < t.bottom && r.bottom > t.top) pad = Math.max(0, Math.ceil(r.right - b.left + 8));
  }
  const want = pad + 'px';
  if (bar.style.paddingLeft !== want) bar.style.paddingLeft = want;
}

/* ── THE UNLOCK MOMENT ───────────────────────────────────────────────── */

function host() {
  let h = document.getElementById('hr-levelup-host');
  if (!h) { h = document.createElement('div'); h.id = 'hr-levelup-host'; document.body.appendChild(h); }
  return h;
}

/** Paint one step's `opens` line in the level banner's slot. */
export function showMoment(id) {
  const row = POINTER_STEPS.find((r) => r.id === id);
  if (!row || !row.opens) return null;
  const el = document.createElement('div');
  el.className = 'hr-levelup-pop is-mark is-unlock';
  el.setAttribute('role', 'status');
  const body = document.createElement('div');
  body.className = 'lu-body';
  [['lu-kicker', 'Step ' + row.step + ' done'], ['lu-title', row.opens.title], ['lu-lore', row.opens.line]].forEach(([cls, text]) => {
    const p = document.createElement('div');
    p.className = cls;
    p.textContent = text;
    body.appendChild(p);
  });
  el.appendChild(body);
  el.onclick = () => el.remove();
  host().appendChild(el);
  setTimeout(() => el.classList.add('leaving'), 6000);
  setTimeout(() => el.remove(), 6500);
  return el;
}

/** One reading: baseline on the first, announce what finished since. */
export function observe(key, doneIds) {
  if (key !== seenKey) { seenKey = key; seen = null; }
  const r = newlyDone(seen, doneIds);
  seen = r.seen;
  return r.fresh;
}

function liveTick() {
  if (parked) return;
  const f = facts();
  if (!f || !momentsKnown(f) || pendingRecord()) return;
  const A = window.HearthriseAuth, P = window.HearthriseProfile;
  const uid = A && typeof A.currentUserId === 'function' ? A.currentUserId() : null;
  if (!uid) return;
  const key = uid + ':' + (P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0);
  const fresh = observe(key, pointerModel(f, POINTER_STEPS, QUEST_REWARDS, CHAPTER_END).doneIds);
  /* After an absence several steps can land at once: the furthest one speaks. */
  if (fresh.length) showMoment(fresh[fresh.length - 1]);
}

if (typeof window !== 'undefined') {
  window.HearthriseSpine = Object.freeze({
    model, facts, go, act, render, homeCard, showMoment, observe, steps: POINTER_STEPS,
    __fit: fitRoom,
    __park(on) { const was = parked; parked = !!on; return was; },
    __forget() { Object.keys(answered).forEach((k) => delete answered[k]); seen = null; seenKey = null; lastBar = null; },
  });
  const S = window.HearthriseShowTab;
  if (S && typeof S.wrapShowTab === 'function') S.wrapShowTab('spine-pointer', () => render());
  window.addEventListener('hearthrise:reveal', render);
  setInterval(() => { try { render(); } catch (e) {} }, 1500);
  setInterval(() => { try { liveTick(); } catch (e) {} }, 3000);
  if (document.readyState !== 'loading') setTimeout(render, 300);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(render, 300));
}
