// ════════════════════════════════════════════════════════════════════════
// src/features/night-plan.js — THE NIGHT PLAN: tonight's falls, before you go
//
// Four surfaces speak the Set the Night forecast (set-the-night.js) and offer
// the one-tap doors out of a night on the floor: the Fight rail's "Tonight"
// block, the activity bar's away chip, and the doors row on the welcome card
// and on Home's away card.
//
// ── NOTHING HERE COMPUTES OR SPENDS A NUMBER (CLAUDE.md §6) ─────────────────
// Every count is the forecast's: one seeded engine run on a clone seeded with
// the server's counters, worded "about", re-derived per server bag stamp at
// most once every 30 s (HearthriseSetTheNight.memo). No gate, intent or
// purchase reads it. The doors read the server's own switch, trait mirror and
// bag; the only write is the existing ownership-gated hr_set_auto_eat, through
// HearthriseAuto.setEat. The poll below repaints; it never runs the engine
// except through the memo's key.
// ════════════════════════════════════════════════════════════════════════

import { fill } from './signposts.js?v=561';
import { SIGNPOSTS } from '../data/signposts.js?v=561';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (key) => SIGNPOSTS.labels[key] || '';
const STN = () => window.HearthriseSetTheNight || null;
const AC = () => window.HearthriseAccrual || null;

function falls(f) { return !!f && ((Number(f.deaths) || 0) >= 1 || f.stoppedBy === 'retreat'); }

function button(act, text) {
  return `<button type="button" class="btn btn-sm np-door" data-night-act="${esc(act)}">${esc(text)}</button>`;
}

/** The doors row. Pure: ctx = {owned, serverEatOn, foodQty, cookable:{qty,name}|null}. */
function doorsHtml(ctx) {
  const c = ctx || {};
  const cook = c.cookable && c.cookable.qty > 0
    ? fill('night.cookable', { raw: c.cookable.qty + ' ' + c.cookable.name }) : '';
  const lines = [cook, fill('night.gatherInstead')].filter(Boolean)
    .map((t) => `<p class="np-line">${esc(t)}</p>`).join('');
  const doors = [button('foodshop', label('night.buyFood'))];
  if (c.owned && c.serverEatOn === false && Number(c.foodQty) > 0) doors.push(button('autoeat', label('night.autoEat')));
  if (cook) doors.push(button('cook', SIGNPOSTS.lines['night.cookable'].door.label));
  doors.push(button('gather', SIGNPOSTS.lines['night.gatherInstead'].door.label));
  return `<div class="np-doors">${lines}<div class="np-door-row">${doors.join('')}</div></div>`;
}

/** The Fight rail block body: the sentence, and the doors when the night has falls. Pure. */
function fightBlockHtml(f, ctx) {
  const S = STN();
  const txt = f && S ? S.sentence(f) : null;
  if (!txt) return '';
  const doors = falls(f) ? doorsHtml(Object.assign({}, ctx, { foodQty: f.foodQty })) : '';
  return `<p class="np-sentence">${esc(txt)}</p>${doors}`;
}

/** The activity bar's away chip, from the stored forecast only. */
function chipHtml(f) {
  const B = window.HearthriseBalance || {};
  /* THE SHORT FORM'S HANDLE (art-direction.css, the bar's fit tiers): "away: "
     is the chip's word, so a crowded bar trades it for the bed glyph and keeps
     the verdict ("you fall"), as Lifetime and Bounty keep their numbers. A
     label without the prefix ("pays away") prints whole. */
  const body = (text) => {
    const m = /^(away:\s+)(\S[\s\S]*)$/.exec(text);
    if (!m) return esc(text);
    const g = (window.HR && typeof window.HR.icon === 'function') ? (window.HR.icon('uiBed', 13, 'currentColor') || '') : '';
    return `${g}<span class="ab-chip-word">${esc(m[1])}</span>${esc(m[2])}`;
  };
  const span = (cls, title, text) => `<span class="ab-xph ab-away${cls}"${title}>${body(text)}</span>`;
  if (!f) {
    return span(' ' + (B.PENDING_CLASS || ''), ` aria-label="${esc(label('night.chipPending'))}"`, label('night.chipCounting'));
  }
  const S = STN();
  const said = (S && S.sentence(f)) || '';
  if (!falls(f)) {
    const t = (Number(f.foodEaten) || 0) > 0 ? SIGNPOSTS.lines['night.chipFed'].text : said;
    return span('', ` title="${esc(t)}"`, label('night.chipAway'));
  }
  if (!(Number(f.foodQty) > 0)) return span('', ` title="${esc(SIGNPOSTS.lines['night.chipNoFood'].text)}"`, label('night.chipNoFoodLabel'));
  return span('', ` title="${esc(said)}"`, label('night.chipDown'));
}

/* THE DOORS' FACTS, READ NOW: the server's switch, the trait mirror and the
   server bag, never the receipt's snapshot of them (P6e). */
function ctxNow(g) {
  const C = window.HearthriseCore || {};
  const AE = C.autoEat || {};
  const A = AC();
  const cat = window.ITEMS || {};
  let owned = false, serverEatOn, foodQty = 0;
  try { owned = AE.autoEatTier(g.traits || {}) > 0; } catch (e) { owned = false; }
  try { serverEatOn = A.serverAutoEatSettings().enabled; } catch (e) { serverEatOn = undefined; }
  const have = (id) => { try { return Number(A.serverItemCount(g, id)) || 0; } catch (e) { return 0; } };
  for (const id of Object.keys(g._serverBag || {})) {
    try { if (AE.isAutoEatable(cat[id])) foodQty += have(id); } catch (e) { /* not food */ }
  }
  return { owned, serverEatOn, foodQty, cookable: cookable(g, have) };
}

/* The best cooking recipe the server bag can fully feed, at the server-stated
   Cooking level, whose output Auto-Eat will eat. */
function cookable(g, have) {
  const C = window.HearthriseCore || {};
  const list = ((window.ARTISAN_RECIPES || {}).cooking || []).slice().sort((a, b) => (b.req || 0) - (a.req || 0));
  let lv = 0;
  try { lv = Number(window.hrGateLevel('cooking')) || 0; } catch (e) { lv = 0; }
  for (const r of list) {
    if (!((r.req || 0) <= lv) || !C.autoEat.isAutoEatable((window.ITEMS || {})[r.output])) continue;
    const inputs = C.artisan.recipeInputs(r) || {};
    const ids = Object.keys(inputs);
    const n = Math.min(...ids.map((id) => Math.floor(have(id) / Math.max(1, Number(inputs[id]) || 1))));
    if (ids.length && n > 0) return { qty: have(ids[0]), name: ((window.ITEMS || {})[ids[0]] || {}).n || ids[0] };
  }
  return null;
}

function goFoodShop() {
  try { if (typeof window.setShopTab === 'function') window.setShopTab('seeds'); } catch (e) { /* the nav still runs */ }
  if (typeof window.showTab === 'function') window.showTab('shop');
}

function act(name) {
  const SP = window.HearthriseSignposts;
  if (name === 'foodshop') goFoodShop();
  else if (name === 'autoeat') {
    const A = window.HearthriseAuto;
    if (A && typeof A.setEat === 'function') A.setEat({ enabled: true });
    if (typeof window.notify === 'function') window.notify(label('night.autoEat'), 'info');
    refresh();
  } else if (name === 'cook' && SP) SP.go(SIGNPOSTS.lines['night.cookable'].door);
  else if (name === 'gather' && SP) SP.go(SIGNPOSTS.lines['night.gatherInstead'].door);
}

function onClick(e) {
  const b = e.target && e.target.closest && e.target.closest('[data-night-act]');
  if (!b) return;
  const ov = b.closest('#welcome-overlay');
  if (ov) ov.classList.remove('show');
  act(b.getAttribute('data-night-act'));
}

function ensureBlock() {
  let body = document.getElementById('fsm-night-body');
  if (body) return body;
  const food = document.getElementById('fsm-food');
  const after = food && food.closest('section');
  if (!after || !after.parentNode) return null;
  const block = document.createElement('section');
  block.className = 'fsm-block fsm-night';
  block.id = 'fsm-night';
  block.hidden = true;
  block.innerHTML = `<div class="fsm-head"><span>${esc(label('night.heading'))}</span></div><div class="np-body" id="fsm-night-body"></div>`;
  after.parentNode.insertBefore(block, after.nextSibling);
  return document.getElementById('fsm-night-body');
}

/** One repaint of the Fight rail block from the memo. */
function refresh() {
  const g = window.G;
  const body = ensureBlock();
  if (!body) return;
  const A = AC();
  const live = !!(g && g.activeMonster && A && typeof A.bagHydrated === 'function' && A.bagHydrated(g));
  const S = STN();
  const html = live && S ? fightBlockHtml(S.memo(g), ctxNow(g)) : '';
  if (body.__nightSig !== html) { body.__nightSig = html; body.innerHTML = html; }
  const frame = body.parentNode;
  if (frame.hidden === !!html) frame.hidden = !html;
}

export function setupNightPlan() {
  window.HearthriseNightPlan = Object.freeze({ fightBlockHtml, doorsHtml, chipHtml, ctxNow, goFoodShop, refresh });
  document.addEventListener('click', onClick);
  refresh();
  setInterval(refresh, 2000);
}
