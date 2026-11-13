// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tally.js — TAMSIN'S TALLY: HER LEDGER, NOT A CARD GRID.
//
// Tamsin Reeve keeps the Common's tally (src/data/tally-tasks.js). Her window is her
// ledger (the mock lane 2026-11-11; Tyler: "the menu / ui itself sucks"): her name and the
// day's count on top with ONE line she says about where you stand (src/data/text/tally.js,
// first person, picked by keeperSay from the server's section), then YOUR tallies first,
// each an entry with her tally marks (ten strokes in two fives, each a tenth, the cut ones
// gold) beside the exact count, the piece she pays in a pocket, and what you'll get; then
// her board of the tasks you don't hold, two lines a row with the ground as a take-me-there
// link (src/shell/goto.js) and a real Take; then her pick folded to one line, Change opens it.
//   Take        ONE hr_tally_accept (in town only; a first Take names the weight that suits)
//   Abandon     ONE hr_tally_drop (the count is lost; said on the answer's line)
//   Keep        ONE hr_tally_set { task, keep }: taken again the moment it pays
//   Weight      ONE hr_tally_set { weight }; a slot chip ONE hr_tally_set { order } with it first
//   Being paid  automatic in the settle that brings the hero home; when the window opens in
//               town with a done task due, it asks her ONCE (hr_tally_collect)
// Every number is the server's: the tallies from the `tally` section (src/session/tally-sections.js),
// her board and her pick from her answer (hr_tally_view). The day's reset is display only, from
// the server's day_ends_at and clock; nothing can spend it (§6). Every control is off while an
// intent is in flight; the window changes only from the re-read envelope and her next answer.
// ════════════════════════════════════════════════════════════════════════
import { tallyOf, pickWords, countsWords } from '../../session/tally-sections.js?v=0.2.126';
import { tallyBoard, takeTask, dropTask, setTally, collectTally } from '../../session/tally-intents.js?v=0.2.126';
import { huntOf, settingsOf, serverNowOf } from '../../session/hunt-sections.js?v=0.2.126';
import { huntName } from '../../session/party-sections.js?v=0.2.126';
import { equipmentOf } from '../../session/item-sections.js?v=0.2.126';
import { WEIGHT_FOR_ROLE, ROLE_WORDS } from '../../data/hunt-tutorial.js?v=0.2.126';
import { wornWeightOf } from '../hunt-ground-facts.js?v=0.2.126';
import { TALLY_KEEPER, TALLY_RULES, tallyTask } from '../../data/tally-tasks.js?v=0.2.126';
import { weightSentence, WEIGHT_ORDER } from '../../data/armour-weights.js?v=0.2.126';
import { rows, text, cls, attr, prop, element, keyedChild } from '../../render/paint.js?v=0.2.126';
import { whole, gold } from '../../render/format.js?v=0.2.126';
import { t } from '../../render/player-text.js?v=0.2.126';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.126';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.126';
import { headPathFor } from '../../data/monster-art.js?v=0.2.126';
import { targetOf, patchParts } from '../goto.js?v=0.2.126';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.126';

const SCRATCH = new WeakMap();
/* `board` is her last answer (null until it comes), `asking` the read in flight, `stale` asks again, `collected` the done
   set the window already asked her to pay (once per opening), `paidNow` whether that pay landed, `pickOpen` the picker. */
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', board: null, asking: false, stale: true, collected: null, paidNow: false, pickOpen: false }; SCRATCH.set(cs, s); }
  return s;
};
/** Her tally marks: ten strokes, two fives. */
export const MARKS = 10;
/** How long a pay she made stays "just paid" on her line (display only). */
export const PAID_FRESH_MS = 3600000;
const HOUR_MS = 3600000;
const lower = (s) => s.toLowerCase();
const weightWord = (w) => t('tally.weight_' + w);
const slotWord = (s) => (TALLY_RULES.slotOrder.includes(s) ? t('tally.slot_' + s) : s);
const countWord = (n) => (n >= 1 && n <= 3 ? t('tally.count_' + n) : whole(n));
const labelOf = (task) => { const row = tallyTask(task); return row ? row.label.charAt(0).toUpperCase() + row.label.slice(1) : task; };
/* "120 Giant Rats"; one named creature reads "The Rat King, 5 times". */
const titleOf = (task, n) => { const row = tallyTask(task); return row && /^the /.test(row.label) ? labelOf(task) + ', ' + whole(n) + ' times' : whole(n) + ' ' + labelOf(task); };
/* Her pay for a task, named: "a Bronze Platebody", "4 Slime Gel"; the piece alone for a board row's name line. */
const pieceName = (pick) => (pick.kind === 'piece' ? itemName(pick.item) : pickWords(pick, itemName));
const groundLink = (hunt) => ({ words: huntName(hunt), target: targetOf({ kind: 'hunt', hunt }) });

/** The pieces more than one task on her board offers (she gives a piece once, so the first paid gets it and the other
    then shows her next pick): a Set of item ids. Her answer's rows carry `pick.kind` (tally-intents.js boardRow). Pure. */
export function sharedPieces(board) {
  const seen = new Set(), both = new Set();
  for (const r of board) {
    if (!r.pick || r.pick.kind !== 'piece') continue;
    if (seen.has(r.pick.item)) both.add(r.pick.item);
    seen.add(r.pick.item);
  }
  return both;
}

/** How many of her ten strokes are cut for a count: a tenth each, all ten once done. Pure. */
export function cutMarks(kills, target, done) {
  return done ? MARKS : Math.max(0, Math.min(MARKS, Math.floor((kills / target) * MARKS)));
}

/** "6 h" or "20 m" until the server's day ends, or '' once it has (the next envelope brings the new day). Pure. */
export function resetWords(dayEndsAt, nowMs) {
  const end = dayEndsAt ? Date.parse(dayEndsAt) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(nowMs) || end <= nowMs) return '';
  const left = end - nowMs;
  return left >= HOUR_MS ? Math.ceil(left / HOUR_MS) + ' h' : Math.max(1, Math.ceil(left / 60000)) + ' m';
}

/** The weight a first Take asks for, and why, from the server's worn set and role: { weight, words }, or null when it has said neither. Pure. */
export function suggestedWeight(worn, role) {
  const wears = wornWeightOf(worn);
  const weight = wears || WEIGHT_FOR_ROLE[role] || null;
  return weight ? { weight, words: wears ? t('tally.first_take_worn', { weight }) : t('tally.first_take_role', { weight, role: ROLE_WORDS[role] }) } : null;
}

/** The line over her board, or '': what holds every Take off, or what a first Take will ask for (`suggest`: suggestedWeight). Hunting has its own line. Pure. */
export function takeWhyOf(tally, hunting, suggest) {
  if (!tally || hunting) return '';
  return !tally.weight ? (suggest ? suggest.words : t('tally.no_weight')) : tally.held.length >= tally.heldMax ? t('tally.board_full', { n: countWord(tally.heldMax) }) : '';
}

/**
 * What Tamsin says, from the server's section alone: a done task first (the cap, the bag, the way home), then the held
 * task nearest done (counting, or just taken), then with nothing held a pay she just made (`justPaid`), the cap, her
 * story on a first visit, or her board. '' with no section. Pure.
 */
export function keeperSay(tally, hunting, justPaid) {
  if (!tally) return '';
  const capped = tally.paidToday >= tally.perDay;
  const done = tally.held.find((h) => h.done);
  if (done && capped) return t('tally.say_capped', { n: countWord(tally.perDay), label: labelOf(done.task) });
  if (done) return t(hunting ? 'tally.say_done_hunting' : done.wait === 'bag_full' ? 'tally.say_done_bag' : 'tally.say_done_town', { count: whole(done.target) });
  const open = tally.held.filter((h) => !h.done).sort((a, b) => b.kills / b.target - a.kills / a.target)[0];
  if (open && open.kills > 0) return t('tally.say_counting', { down: whole(open.kills), left: whole(open.target - open.kills) });
  if (open) return t('tally.say_taken', { task: titleOf(open.task, open.target), ground: huntName(open.hunt) });
  /* nothing held: a pay she just made invites the next take (played 11-12: once a task is taken, that task speaks) */
  const paid = tally.recent[0];
  if (justPaid && paid) return t('tally.say_paid', { gold: whole(paid.gold), pick: pickWords(paid, itemName) });
  if (capped) return t('tally.say_capped_none', { n: countWord(tally.perDay) });
  return t(!tally.weight && !tally.recent.length ? 'tally.say_first' : 'tally.say_none');
}

/** The skeleton (built once per opening): her board is asked for afresh. */
export function renderTally(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.stale = true; sc.collected = null; sc.paidNow = false; sc.pickOpen = false; sc.msg = ''; }
  return '<div class="hw-tally">'
    + '<header class="ht-say"><b class="ht-who"></b><span class="ht-day"><span class="ht-day-paid"></span><span class="ht-day-new"></span></span><p class="ht-voice"></p></header>'
    + '<h3 class="hw-ledger-head ht-head ht-mine-head"><span></span><small></small></h3><ul class="ht-mine"></ul>'
    + '<h3 class="hw-ledger-head is-on ht-head ht-board-head"><span></span></h3>'
    + '<p class="ht-board-why"><span></span><button type="button" class="hh-tool" data-hs-act="to-weight" hidden></button></p>'
    + '<p class="hh-empty ht-wait"></p><ul class="ht-list"></ul>'
    + '<div class="ht-pick"><span class="ht-pick-line"></span><button type="button" class="hh-tool" data-hs-act="pick-toggle"></button></div>'
    + '<div class="ht-pick-open" hidden><div class="ht-weights" role="group">'
    + TALLY_RULES.weights.map((w) => '<button type="button" class="hh-seg" data-hs-act="weight" data-weight="' + w + '" aria-pressed="false" title="' + esc(weightSentence(w)) + '"></button>').join('')
    + '</div><p class="ht-weight-words"></p><p class="ht-order-how"></p><ol class="ht-slots"></ol><p class="ht-rule"></p></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

const marksHtml = () => '<span class="ht-marks" aria-hidden="true">' + ('<span class="ht-five">' + '<i></i>'.repeat(MARKS / 2) + '</span>').repeat(2) + '</span>';

function entryHtml(h) {
  const task = esc(h.task);
  return '<li class="ht-entry" data-task="' + task + '"><span class="ht-face"></span><span class="ht-entry-top"><b></b><span class="ht-count"><b></b><small></small></span></span>'
    + marksHtml() + '<span class="ht-pocket"></span><p class="ht-get"></p><p class="ht-once"></p>'
    + '<span class="ht-foot"><span class="ht-where"></span><span class="ht-tools"><label class="ht-keep"><input type="checkbox" data-hs-act="keep" data-task="' + task + '"><span></span></label>'
    + '<button type="button" class="hh-tool" data-hs-act="drop" data-task="' + task + '"></button></span></span></li>';
}

function rowHtml(r) {
  const task = esc(r.task);
  return '<li class="ht-row" data-task="' + task + '" data-hs-find="' + task + '"><span class="ht-row-name"><b></b><small><span class="ht-row-go"></span><span class="ht-row-lvl"></span></small></span>'
    + '<span class="ht-pocket"></span><span class="ht-pay"><b></b><small class="ht-pay-name"></small></span>'
    + '<button type="button" class="hh-tool ht-take" data-hs-act="take" data-task="' + task + '"></button><small class="ht-once"></small></li>';
}

/* The piece in its pocket: the icon node kept per item, so a repaint with the same pick writes nothing. */
function patchPocket(el, pick, st) {
  keyedChild(el, pick ? pick.item : '', () => element(st.doc, itemIconHtml(st.glyphs, pick.item)));
}

/* The creature's head in its well (art brief 15): a 32 px bust, kept per creature so a repaint with the same one writes nothing.
   A creature the head set has none for draws no well and the entry keeps its two columns. */
export function faceOf(monster) {
  const src = headPathFor(monster);
  return src ? { monster, src } : null;
}
function patchFace(li, monster, st) {
  const face = faceOf(monster);
  cls(li, 'has-face', !!face);
  keyedChild(li.querySelector('.ht-face'), face ? face.monster : '', () => element(st.doc, '<img class="hh-icon ht-head-img" src="' + esc(face.src) + '" alt="" width="32" height="32" decoding="async">'));
}

/* What she pays for a task, from her answer's row ('' until it comes). */
const getWords = (offer) => (offer ? t('tally.get', { gold: gold(offer.gold), pick: offer.pick ? pickWords(offer.pick, itemName) : '' }) : '');
const onceWords = (offer, st) => (offer && offer.pick && st.shared.has(offer.pick.item) ? t('tally.once') : '');

function patchEntry(li, h, st) {
  const tally = st.tally;
  text(li.querySelector('.ht-entry-top > b'), labelOf(h.task));
  text(li.querySelector('.ht-count b'), whole(h.kills));
  text(li.querySelector('.ht-count small'), '/ ' + whole(h.target));
  const cut = cutMarks(h.kills, h.target, h.done);
  li.querySelectorAll('.ht-five i').forEach((s, i) => cls(s, 'is-cut', i < cut));
  cls(li, 'is-done', h.done);
  const offer = st.board.find((r) => r.task === h.task) || null;
  patchPocket(li.querySelector('.ht-pocket'), offer && offer.pick, st);
  patchFace(li, h.monster, st);
  const next = !h.done ? '' : tally.paidToday >= tally.perDay ? t('tally.done_tomorrow') : h.wait === 'bag_full' ? t('tally.done_bag') : st.hunting ? t('tally.done_hunting') : t('tally.done_town');
  text(li.querySelector('.ht-get'), [next, getWords(offer)].filter(Boolean).join(' '));
  text(li.querySelector('.ht-once'), onceWords(offer, st));
  const here = st.hunting && st.huntId === h.hunt;
  patchParts(li.querySelector('.ht-where'), here ? [t('tally.counting_here', { ground: huntName(h.hunt) })] : st.hunting ? [groundLink(h.hunt), ' · ', t('tally.not_here')] : [groundLink(h.hunt)]);
  const keep = li.querySelector('[data-hs-act="keep"]');
  text(keep.nextElementSibling, t('controls.keep'));
  prop(keep, 'checked', h.keep);
  prop(keep, 'disabled', st.sc.pending);
  const drop = li.querySelector('[data-hs-act="drop"]');
  text(drop, t('controls.abandon'));
  prop(drop, 'disabled', st.sc.pending);
}

function patchRow(li, r, st) {
  const row = tallyTask(r.task);
  text(li.querySelector('.ht-row-name b'), titleOf(r.task, r.target));
  patchParts(li.querySelector('.ht-row-go'), [groundLink(r.hunt)]);
  text(li.querySelector('.ht-row-lvl'), r.bandMin ? t(row && row.party ? 'tally.board_level_party' : 'tally.board_level', { level: r.bandMin }) : row && row.party ? t('tally.board_party') : '');
  patchPocket(li.querySelector('.ht-pocket'), r.pick, st);
  text(li.querySelector('.ht-pay b'), gold(r.gold));
  text(li.querySelector('.ht-pay-name'), r.pick ? pieceName(r.pick) : '');
  text(li.querySelector('.ht-once'), onceWords(r, st));
  const btn = li.querySelector('.ht-take');
  text(btn, t('controls.take'));
  const tally = st.tally;
  const full = !!tally && tally.held.length >= tally.heldMax;
  prop(btn, 'disabled', r.held || full || st.sc.pending || st.hunting || !tally || (!tally.weight && !st.suggest));
  /* What a press on the grey button says (src/shell/off-why.js). */
  attr(btn, 'data-off-why', r.held ? t('tally.take_held_why') : st.hunting ? t('tally.board_hunting') : full ? t('tally.board_full', { n: countWord(tally.heldMax) })
    : tally && !tally.weight && !st.suggest ? t('tally.no_weight') : null);
}

/* Her pick: one line, and the picker behind Change (the weights, the chosen weight's sentence, her slot order as chips). */
function patchPick(root, st) {
  const tally = st.tally, sc = st.sc;
  const order = tally ? tally.order : [];
  text(root.querySelector('.ht-pick-line'), !tally ? '' : tally.weight
    ? t('tally.pick_line', { weight: lower(weightWord(tally.weight)), first: lower(slotWord(order[0] || '')), second: lower(slotWord(order[1] || '')), third: lower(slotWord(order[2] || '')) })
    : st.suggest ? t('tally.pick_none_suggest') : t('tally.pick_none'));
  const toggle = root.querySelector('[data-hs-act="pick-toggle"]');
  text(toggle, sc.pickOpen ? t('controls.close') : t('tally.change'));
  prop(toggle, 'disabled', !tally);
  attr(toggle, 'aria-expanded', String(sc.pickOpen));
  prop(root.querySelector('.ht-pick-open'), 'hidden', !sc.pickOpen);
  attr(root.querySelector('.ht-weights'), 'aria-label', t('tally.pick_label'));
  for (const b of root.querySelectorAll('[data-hs-act="weight"]')) {
    text(b, weightWord(b.getAttribute('data-weight')));
    attr(b, 'aria-pressed', String(!!tally && tally.weight === b.getAttribute('data-weight')));
    prop(b, 'disabled', sc.pending || !tally);
  }
  /* What each weight gives: the chosen one's sentence, or all three before a weight is picked. */
  text(root.querySelector('.ht-weight-words'), !tally ? '' : tally.weight ? weightSentence(tally.weight) : WEIGHT_ORDER.map(weightSentence).join(' '));
  text(root.querySelector('.ht-order-how'), t('tally.order_how'));
  attr(root.querySelector('.ht-slots'), 'aria-label', t('tally.order_label'));
  rows(root.querySelector('.ht-slots'), order, {
    key: String,
    build: (s) => element(st.doc, '<li><button type="button" data-hs-act="first" data-slot-name="' + esc(s) + '"><small></small><span></span></button></li>'),
    patch: (li, s) => {
      const b = li.querySelector('button');
      text(b.querySelector('small'), String(order.indexOf(s) + 1));
      text(b.querySelector('span'), slotWord(s));
      /* the first slot has nothing to go before (its chip says so on a press) */
      prop(b, 'disabled', sc.pending || order.indexOf(s) === 0);
      attr(b, 'data-off-why', order.indexOf(s) === 0 ? t('tally.slot_first_why') : null);
    },
  });
  text(root.querySelector('.ht-rule'), t('tally.rule_worn'));
}

renderTally.patch = function patchTally(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-tally');
  const tally = tallyOf(cs);
  const h = huntOf(cs);
  const hunting = !!h && !h.ended;
  const board = sc.board ? sc.board.board : [];
  const suggest = tally && !tally.weight ? suggestedWeight(equipmentOf(cs), (settingsOf(cs) || {}).role) : null;
  const nowMs = serverNowOf(cs) ?? Date.now();
  const st = { tally, sc, doc: ctx.doc, glyphs: ctx.glyphs, hunting, huntId: hunting ? h.huntId : null, board, shared: sharedPieces(board), suggest };
  cls(root, 'is-pending', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  /* HER LINE: who she is, the day's count with its reset, and what she says about where you stand. */
  text(root.querySelector('.ht-who'), TALLY_KEEPER.name);
  text(root.querySelector('.ht-day-paid'), tally ? t('tally.day_paid', { paid: whole(tally.paidToday), perDay: whole(tally.perDay) }) : '');
  const left = tally ? resetWords(tally.dayEndsAt, nowMs) : '';
  text(root.querySelector('.ht-day-new'), left ? t('tally.day_resets', { left }) : '');
  cls(root.querySelector('.ht-day'), 'is-full', !!tally && tally.paidToday >= tally.perDay);
  const paid = tally && tally.recent[0];
  const justPaid = sc.paidNow || !!(paid && paid.at && nowMs - Date.parse(paid.at) < PAID_FRESH_MS);
  text(root.querySelector('.ht-voice'), keeperSay(tally, hunting, justPaid));
  /* YOUR TALLIES first; the section goes when nothing is held (her line says so). */
  const held = tally ? tally.held : [];
  cls(root.querySelector('.ht-mine-head'), 'is-on', held.length > 0);
  text(root.querySelector('.ht-mine-head span'), t('tally.head_mine'));
  text(root.querySelector('.ht-mine-head small'), tally ? t('tally.head_mine_count', { held: whole(held.length), max: whole(tally.heldMax) }) : '');
  rows(root.querySelector('.ht-mine'), held, { key: (x) => x.task, build: (x) => element(ctx.doc, entryHtml(x)), patch: (li, x) => patchEntry(li, x, st) });
  /* HER BOARD: the tasks you don't hold; one line says why every Take is off, or what a first Take asks for. */
  text(root.querySelector('.ht-board-head span'), t('tally.head_board'));
  const why = !sc.board ? '' : hunting ? t('tally.board_hunting') : takeWhyOf(tally, hunting, suggest);
  cls(root.querySelector('.ht-board-why'), 'is-on', !!why);
  text(root.querySelector('.ht-board-why span'), why);
  const toWeight = root.querySelector('[data-hs-act="to-weight"]');
  text(toWeight, t('controls.pick_weight'));
  prop(toWeight, 'hidden', !why || hunting || !tally || !!tally.weight);
  rows(root.querySelector('.ht-list'), board.filter((r) => !r.held), { key: (r) => r.task, build: (r) => element(ctx.doc, rowHtml(r)), patch: (li, r) => patchRow(li, r, st) });
  cls(root.querySelector('.ht-wait'), 'is-on', !sc.board);
  text(root.querySelector('.ht-wait'), sc.board ? '' : t('tally.board_loading'));
  patchPick(root, st);
  const repaint = () => ctx.refresh('tally');
  /* HER ANSWER, once per opening and after every intent (a read, never the record). */
  if (sc.stale && !sc.asking && ctx.account) {
    sc.asking = true;
    tallyBoard(ctx.account, cs).then((r) => {
      sc.asking = false; sc.stale = false;
      if (r.ok) sc.board = r; else if (!sc.pending) sc.msg = refusalText(r, cs);
      repaint();
    });
  }
  /* VISITING HER IN TOWN: a done task due today is paid by her answer to ONE ask (the server decides what). */
  const due = tally && !hunting && tally.paidToday < tally.perDay ? tally.held.filter((x) => x.done && x.wait !== 'bag_full') : [];
  const key = due.map((x) => x.task + '@' + x.doneAt).join(',');
  if (due.length && sc.collected !== key && !sc.pending && ctx.account) {
    sc.collected = key;
    runIntent(sc, repaint, () => collectTally(ctx.account, cs), t('tally.checking'),
      (r) => { sc.stale = true; if (r.paid) sc.paidNow = true; return r.paid ? t('tally.paid_for', { count: r.paid }) : ''; }, cs);
  }
};

renderTally.act = function actTally(ctx, body, action, ev, el) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const tally = tallyOf(cs);
  if (!tally || sc.pending || !ctx.account) return false;
  const repaint = () => ctx.refresh('tally');
  const run = (send, busy, done) => runIntent(sc, repaint, send, busy, (r) => { sc.stale = true; return done(r); }, cs);
  const task = el.getAttribute('data-task');
  if (action === 'keep' && ev.type === 'change') {
    const on = !!el.checked;
    run(() => setTally(ctx.account, cs, { task, keep: on }), t('tally.saving'), () => t(on ? 'tally.keep_on' : 'tally.keep_off'));
    return true;
  }
  if (ev.type !== 'click') return false;
  if (action === 'pick-toggle') { sc.pickOpen = !sc.pickOpen; repaint(); return true; }
  if (action === 'to-weight') {
    sc.pickOpen = true;
    prop(body.querySelector('.ht-pick-open'), 'hidden', false);
    body.querySelector('.ht-weights').scrollIntoView({ block: 'start' });
    repaint();
    return true;
  }
  if (action === 'take') {
    const row = tallyTask(task);
    const first = tally.weight ? null : suggestedWeight(equipmentOf(cs), (settingsOf(cs) || {}).role);
    const counts = countsWords(task, huntName(row ? row.hunt : null));
    run(() => takeTask(ctx.account, cs, task, first ? first.weight : null), t('tally.taking'),
      () => (first ? t('tally.taken_weight', { counts, weight: first.weight }) : t('tally.taken', { counts })));
    return true;
  }
  if (action === 'drop') { run(() => dropTask(ctx.account, cs, task), t('tally.giving_up'), () => t('tally.given_up', { label: labelOf(task) })); return true; }
  if (action === 'weight') {
    const w = el.getAttribute('data-weight');
    run(() => setTally(ctx.account, cs, { weight: w }), t('tally.saving'), () => t('tally.weight_set', { weight: lower(weightWord(w)) }));
    return true;
  }
  if (action === 'first') {
    const s = el.getAttribute('data-slot-name');
    const order = tally.order.slice();
    const i = order.indexOf(s);
    if (i <= 0) return true;
    order.splice(i, 1);
    order.unshift(s);
    run(() => setTally(ctx.account, cs, { order }), t('tally.saving'), () => '');
    return true;
  }
  return false;
};
