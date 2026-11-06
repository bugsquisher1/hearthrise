// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/havora/works.js — THE HAVORA WINDOW'S WORKS TAB: WHAT THE WHOLE SERVER IS BUILDING.
//
// ./index.js lists the tab, draws worksHtml() into its pane once per opening, calls patchWorks(pane, ctx) on every patch while the tab is on show, and offers every press to
// actWorks first (true: it was the Works'). Opening the window on this tab is the shell's: wm.openTab('havora', 'works'), from a tap on the plaque or the site.
// While it's on show the tab reads the server (hr_town_works_view: never in the envelope), on opening, after each gift and every ASK_MS. Every number here is the server's: the total,
// what's left today, the most this account can give, its place, the plaque. The gift is the one number the client names, and the server refuses it under its own clock before any
// charge. Every control is off while a gift is in flight. The field opens on the last gift, from the server (CLAUDE.md §1, §6). Display scratch per CharacterSession: nothing persists.
// What the day leaves and the answer to a press stand in the window's foot (.hv-count[data-of="works"], .hh-intent-msg), so a short window never cuts them off: patchWorks writes both.
// A GIFT THE PURSE CAN'T PAY IS OFF BEFORE THE PRESS, AND SAYS WHY (the house style; v0.2.97 gate: a 500 gp purse saw three live buttons that only said "Not enough gold."
// after the press): the purse is the envelope's (goldOf), the room today the server's read, and the last button gives the smaller of the two. The server still judges.
// ════════════════════════════════════════════════════════════════════════
import { readWorks, giveToWorks } from '../../../session/town-intents.js?v=0.2.98';
import { goldOf } from '../../../session/item-sections.js?v=0.2.98';
import { TOWN_WORKS } from '../../../data/town-works.js?v=0.2.98';
import { text, cls, attr, prop, style, rows, element } from '../../../render/paint.js?v=0.2.98';
import { whole, gold } from '../../../render/format.js?v=0.2.98';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.98';
import { runIntent, refusalText } from '../../intent-words.js?v=0.2.98';

const ASK_MS = 15000;
const RETRY_MS = 5000;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pane: null, works: null, asking: false, askedAt: -Infinity, stale: true, pending: false, msg: '', filled: false }; SCRATCH.set(cs, s); }
  return s;
};

/* The catalogue's own row for the one the server has on show: a label and the buttons. The server's answer names the project. The first row's the one on the map today. */
const FIRST = Object.keys(TOWN_WORKS)[0];
const rowOf = (w) => TOWN_WORKS[w ? w.project : FIRST] || TOWN_WORKS[FIRST];

/** "1st", "2nd", "23rd". Pure. */
export function placeWords(n) {
  const t = n % 100, u = n % 10;
  return whole(n) + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
}

/** "Give 1,000 gp". Pure. */
export function giveWords(amount) { return 'Give ' + gold(amount); }

/** The most one press can give: the server's room today, or the purse the envelope states when it holds less (null: not stated, the server's room). Pure. */
export function giftRoom(w, purse) {
  return Number.isSafeInteger(purse) ? Math.max(0, Math.min(w.maxGift, purse)) : w.maxGift;
}

/** The button for all that can go today: "Give the 18,000 gp left today", what the project still needs when that's less, or "Give the 500 gp you have". Pure. */
export function maxWords(w, purse = null) {
  const room = giftRoom(w, purse);
  if (room < w.maxGift) return 'Give the ' + gold(room) + ' you have';
  return w.left < w.leftToday ? 'Give the ' + gold(w.maxGift) + ' it still needs' : 'Give the ' + gold(w.maxGift) + ' left today';
}

/** Why a gift is off for gold, under the buttons, before any press; '' when the purse covers them, isn't stated, or the last button already says it ("Give the
    500 gp you have": a line more pushed the custom gift under a 1366x768 window's foot, v0.2.97 gate). Pure. */
export function purseWords(w, purse, gifts) {
  if (!Number.isSafeInteger(purse) || !w || w.maxGift === 0) return '';
  const least = w.minGift || 1;
  if (purse < least) return purse ? 'You have ' + gold(purse) + ', and the smallest gift is ' + gold(least) + '.' : 'Your purse is empty.';
  if (purse < w.maxGift) return '';
  return gifts.some((g) => g > purse) ? 'You have ' + gold(purse) + '. A gift can\'t be more than your purse.' : '';
}

/** Where it stands: "Framed: 412,300 of 1,000,000 gp". Pure. */
export function stageWords(w, row) {
  const s = row.stages[w.stage];
  return (s ? s.label + ': ' : '') + whole(w.total) + ' of ' + gold(w.goal);
}

/** What the next stage asks: "187,700 gp more and it has its walls." Pure; '' at the finish. */
export function nextWords(w, row) {
  const next = w.stageAt[w.stage + 1];
  const s = row.stages[w.stage + 1];
  return Number.isInteger(next) ? gold(next - w.total) + (s && s.line ? ' more and it ' + s.line : ' more to the next stage.') : '';
}

/** Today's line, in the designer's words where the day is done. Pure. */
export function todayWords(w) {
  if (w.finished) return '';
  if (w.maxGift === 0) return 'Havora takes ' + gold(w.perDay) + ' a day from one account, and you\'ve given yours. More after midnight UTC.';
  return 'You can give ' + gold(w.leftToday) + ' more today. More after midnight UTC.';
}

/** This account's place and total, from the server. Pure. */
export function meWords(w) {
  if (!w.gold) return 'You haven\'t given to ' + (w.name || 'the Works') + ' yet.';
  return w.place === null ? 'You\'ve given ' + gold(w.gold) + '.' : 'You\'re ' + placeWords(w.place) + ', with ' + gold(w.gold) + ' given.';
}

/** The tab as the Havora window lists it. */
export const WORKS_TAB = Object.freeze({ id: 'works', label: 'Works', shown: true });

/** The tab's contents, built once per opening. */
export function worksHtml() {
  const row = rowOf(null);
  return '<p class="hv-lead hv-works-lead">' + esc(row.about) + '</p>'
    + '<p class="hv-works-stage"></p>'
    + '<span class="hv-works-bar" aria-hidden="true"><span class="hv-works-fill"></span></span>'
    + '<p class="hw-cap hv-works-next"></p>'
    + '<div class="hv-works-give">'
    + '<div class="hv-works-gifts">' + row.gifts.map((g) => '<button type="button" class="hh-tool is-primary hv-buy" data-hs-act="works-give" data-amount="' + g + '">' + esc(giveWords(g)) + '</button>').join('')
    /* why a gift is off stands right under the gifts, above the one the purse can pay (a line under the field was below a short window's fold) */
    + '<p class="hw-why hv-works-why"></p>'
    + '<button type="button" class="hh-tool is-primary hv-buy hv-works-max" data-hs-act="works-max"></button></div>'
    + '<div class="hv-works-typed"><span class="hw-cap">Or give</span><input type="number" inputmode="numeric" class="hv-works-amount" aria-label="Gold to give" min="1" step="100"><span class="hw-cap">gp</span>'
    + '<button type="button" class="hh-tool" data-hs-act="works-typed">Give</button></div>'
    + '</div>'
    + '<p class="hw-cap hv-works-me"></p>'
    + '<h3 class="hv-works-head">The plaque</h3>'
    + '<ol class="hv-works-plaque"></ol>';
}

function plaqueRow(doc) {
  return element(doc, '<li class="hr-line"><span class="hr-place"></span><span class="hr-name"><b></b></span><span class="hr-val"><b></b></span></li>');
}
function patchPlaqueRow(el, r) {
  cls(el, 'is-mine', r.mine);
  text(el.querySelector('.hr-place'), whole(r.place));
  text(el.querySelector('.hr-name b'), r.name);
  text(el.querySelector('.hr-val b'), gold(r.gold));
}

/** Patch the pane in place, from what the server said. */
export function patchWorks(pane, ctx) {
  const cs = ctx.character;
  if (!cs || !pane) return;
  const sc = scratchOf(cs);
  /* a new pane is a new opening: the read is asked afresh and the field fills from the server again */
  if (sc.pane !== pane) { sc.pane = pane; sc.stale = true; sc.msg = ''; sc.filled = false; }
  const w = sc.works;
  const row = rowOf(w);
  text(pane.querySelector('.hv-works-lead'), w && w.finished ? row.aboutDone : row.about);
  text(pane.querySelector('.hv-works-stage'), w ? stageWords(w, row) : '');
  style(pane.querySelector('.hv-works-fill'), 'width', w && w.goal > 0 ? Math.min(100, (w.total / w.goal) * 100).toFixed(1) + '%' : '0%');
  text(pane.querySelector('.hv-works-next'), w ? (w.finished ? row.name + ' is finished. Nothing else is being built right now.' : nextWords(w, row)) : '');
  const give = pane.querySelector('.hv-works-give');
  prop(give, 'hidden', !!(w && w.finished));
  const off = sc.pending || !w || w.maxGift === 0;
  const purse = goldOf(cs);
  const room = w ? giftRoom(w, purse) : 0;
  /* the purse can't pay even the smallest gift: nothing to press, and the line under the buttons says so */
  const poor = !!w && room < (w.minGift || 1);
  for (const b of pane.querySelectorAll('[data-hs-act="works-give"]')) {
    const short = Number.isSafeInteger(purse) ? Math.max(0, Number(b.getAttribute('data-amount')) - purse) : 0;
    prop(b, 'disabled', off || short > 0);
    attr(b, 'data-off-why', short && !off ? 'You need ' + gold(short) + ' more.' : null);
  }
  prop(pane.querySelector('[data-hs-act="works-typed"]'), 'disabled', off || poor);
  const max = pane.querySelector('.hv-works-max');
  prop(max, 'hidden', !w || w.maxGift === 0 || poor);
  text(max, w && w.maxGift && !poor ? maxWords(w, purse) : '');
  prop(max, 'disabled', off || poor);
  text(pane.querySelector('.hv-works-why'), purseWords(w, purse, row.gifts));
  const field = pane.querySelector('.hv-works-amount');
  if (field) {
    prop(field, 'disabled', off || poor);
    if (w) attr(field, 'max', String(room));
    /* the field opens on the last gift, once per opening, and never over what the player is typing or the purse holds */
    if (w && !sc.filled) { sc.filled = true; if (!field.value && w.lastGift) field.value = String(Math.min(w.lastGift, room || w.lastGift)); }
  }
  /* THE WINDOW'S FOOT: the day's line and the answer stand whole wherever the pane is scrolled to */
  const root = pane.closest('.hw-havora');
  text(root.querySelector('.hv-count[data-of="works"]'), w ? todayWords(w) : '');
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  text(pane.querySelector('.hv-works-me'), w ? meWords(w) : '');
  rows(pane.querySelector('.hv-works-plaque'), w ? w.plaque : [], { key: (r) => String(r.place), build: () => plaqueRow(pane.ownerDocument), patch: patchPlaqueRow });
  /* THE READ: once per opening, after a gift, and every ASK_MS while on show (a read, never the record) */
  const due = sc.stale || ctx.now() - sc.askedAt >= ASK_MS;
  if (due && !sc.asking && ctx.account) {
    sc.asking = true; sc.stale = false; sc.askedAt = ctx.now();
    readWorks(ctx.account, cs).then((r) => {
      sc.asking = false;
      if (r.ok) sc.works = r.works;
      else { sc.askedAt = ctx.now() - ASK_MS + RETRY_MS; if (!sc.works) sc.msg = refusalText(r, cs); }
      ctx.refresh('havora');
    });
  }
}

/* The server's answer, in the giver's words. A gift that finishes it says so. */
function thanks(r, row) {
  const name = row.name;
  if (r.total !== null && r.total === r.goal) return 'Gave ' + gold(r.amount) + '. That finished ' + name.replace(/^The /, 'the ') + '.';
  return 'Gave ' + gold(r.amount) + '. ' + name + ' stands at ' + whole(r.total) + ' of ' + gold(r.goal) + '.';
}

/** One press in the window: true when it was the Works'. */
export function actWorks(ctx, body, action, ev, t) {
  if (action !== 'works-give' && action !== 'works-max' && action !== 'works-typed') return false;
  const cs = ctx.character;
  if (!cs || !ctx.account) return true;
  const sc = scratchOf(cs);
  const w = sc.works;
  if (sc.pending || !w) return true;
  const repaint = () => ctx.refresh('havora');
  const typed = action === 'works-typed' ? Number((body.querySelector('.hv-works-amount') || {}).value) : null;
  const purse = goldOf(cs);
  const amount = action === 'works-give' ? Number(t.getAttribute('data-amount')) : action === 'works-max' ? giftRoom(w, purse) : typed;
  /* a field holding no whole number never reaches the server: it says the rule it would have said */
  if (!Number.isSafeInteger(amount) || amount < 1) { sc.msg = refusalText({ ok: false, error: 'works_small', verb: 'town_works', project: w.project, min: w.minGift }, cs); repaint(); return true; }
  /* nor does a typed gift over the purse the envelope states: the line under the buttons, said at the press */
  if (Number.isSafeInteger(purse) && amount > purse) { sc.msg = 'You have ' + gold(purse) + '. A gift can\'t be more than your purse.'; repaint(); return true; }
  const row = rowOf(w);
  runIntent(sc, repaint, () => giveToWorks(ctx.account, cs, w.project, amount).then((r) => { sc.stale = true; return r; }), 'Giving it…', (r) => thanks(r, row), cs);
  return true;
}
