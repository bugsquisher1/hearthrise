// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/storage.js — STORAGE: THE HOME CHEST, FROM ANYWHERE IN TOWN.
//
// Tyler 10-18: storage must be usable from anywhere in town (at the
// blacksmith, say), not only at home. The server agrees: hr_bank_move has no
// place check (supabase/migrations/2026-08-27-bank-store.sql), only the
// character lock, the settle-first rule and the stack fuses. Its own launcher
// (T) opens it.
//
// Two grids of the same pocket the Inventory uses (inventory/pockets.js):
// what is in storage, and what is in the bag. A press on a stack moves ONE
// across; Shift moves all of it; a right-click (or a long press) asks how many
// (src/shell/widgets/amount.js: Store X / Take X). Tyler 10-18: "it's all or
// nothing." Each is ONE hr_bank_move naming that exact count (the server moves
// exactly it, under its own lock and stack fuses), every control is off
// until the server answers, and both grids change only from the re-read
// envelope (`bank` and `inventory`, replaced, never merged). The search, the
// kind chips and the sort are the Inventory's own (bag-model.js `view`; Tyler
// 10-22: "storage doesn't have a way to sort or filter"): they apply to both
// grids, and the chip and sort are remembered in the residue `storeView`. The
// Newest sort reads `storeSeen` (storage-model.js markStored): when each
// storage stack was last added to, kept by this character. Display only.
// While a hunt runs the chest is at home and the hero is not: the window says
// so and its moves stay off (the server's own rule is in CONFLICTS.md).
// Beside the bag: Dispatch loot (Tyler 2026-10-25, loot-dispatch.js), ONE
// hr_loot_dispatch that stores every stack planned "Deposit in storage" while
// Storage has room and sells every stack planned "Sell"; off with its reason (a
// hunt, nothing planned), and its line is the server's answer. Beside it,
// Deposit all materials (audit 2026-11-18 A8: a full bag took 46 shift-clicks):
// ONE hr_bank_move_many naming the bag's Material stacks that fit
// (storage-model.js materialsToStore), whole, at the server's own counts.
// PRESSES QUEUE (the same audit: two a second met "Too many changes, try
// again"): a press made while another is out waits its turn, merged with a
// queued press on the same stack, and the whole-stack ones go together in ONE
// hr_bank_move_many (storage-model.js queuePress, nextBatch). A refusal stops
// the queue and says why: nothing more is sent on a guess.
// ════════════════════════════════════════════════════════════════════════
import { bagOf, bankOf, depotOf, shopOf, bagExpandOf, goldOf, rulesOf } from '../../session/item-sections.js?v=0.2.140';
import { moveStorageMany } from '../../session/storage-intents.js?v=0.2.140';
import { STORE_SEEN_MAX } from '../../session/residue.js?v=0.2.140';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.140';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.140';
import { whole, gold } from '../../render/format.js?v=0.2.140';
import { glyphSvg } from '../launcher.js?v=0.2.140';
import { itemName, itemNameFor } from '../widgets/bits.js?v=0.2.140';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.140';
import { BAG_CATS, BAG_SORTS, view } from '../bag-model.js?v=0.2.140';
import { storePrefsOf, markStored, materialsToStore, queuePress, nextBatch } from '../storage-model.js?v=0.2.140';
import { runIntent } from '../intent-words.js?v=0.2.140';
import { pocketHtml, patchCount } from './inventory/pockets.js?v=0.2.140';
import { showTip, hideTip } from './item-tip.js?v=0.2.140';
import { openFloatMenu, closeFloatMenu } from './float-menu.js?v=0.2.140';
import { amountHtml, amountOf, stepAmount } from '../widgets/amount.js?v=0.2.140';
import { dispatchBlock, runDispatch } from '../loot-dispatch.js?v=0.2.140';
import { toolLossWords } from '../town-work.js?v=0.2.140';
import { t } from '../../render/player-text.js?v=0.2.140';
import { heroGroundOf } from '../widgets/first-target.js?v=0.2.140';
import { featuresOf } from '../../session/character-sections.js?v=0.2.140';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { query: '', pending: false, msg: '', press: null, pressed: false, queue: [] }; SCRATCH.set(cs, s); } return s; };
const LONG_PRESS_MS = 500;

const residueOf = (cs) => (cs && cs.record && cs.record.residue) || {};
/* The bag's own "new" marks (the Inventory writes them); none yet reads as all seen, as the Inventory does. */
const bagSeenOf = (cs, bag) => residueOf(cs).bagSeen || Object.fromEntries(bag.map((r) => [r.id, [r.qty, 0]]));

/** The skeleton (built once per opening). */
export function renderStorage(ctx) {
  const g = ctx.glyphs;
  return '<div class="hw-store">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="search" placeholder="' + t('bag.store_search') + '" aria-label="' + t('bag.store_search') + '" autocomplete="off"></span>'
    + '<label class="hw-sort"><span>' + t('controls.sort') + '</span><select class="hh-select" data-hs-act="sort">' + BAG_SORTS.map(([id, l]) => '<option value="' + id + '">' + esc(l) + '</option>').join('') + '</select></label></div>'
    + '<div class="hw-cats" role="group" aria-label="Show">' + BAG_CATS.map(([id, l]) => '<button type="button" class="hw-cat" data-hs-act="cat" data-cat="' + id + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>'
    + '<p class="hs-note hw-store-note"></p>'
    + '<h3 class="hw-ledger-head is-on">' + t('bag.store_in_storage') + ' <small class="hw-store-n" data-n="bank"></small></h3>'
    + '<ul class="hw-pockets" data-side="bank" role="listbox" aria-label="' + t('bag.store_in_storage') + '"></ul><p class="hh-empty hw-store-none" data-none="bank"></p>'
    + '<p class="hs-note hw-store-room"></p>'
    + '<h3 class="hw-ledger-head is-on hw-store-baghead">' + t('bag.store_in_bag') + ' <small class="hw-store-n" data-n="bag"></small></h3>'
    /* Expand: the bag's next rung, at the server's price (hr_bag_expand_view); one unlock_buy naming the offer and no number. */
    + '<div class="hw-tools hw-store-grow"><button type="button" class="hh-tool" data-hs-act="expand"></button><p class="hw-why"></p></div>'
    + '<div class="hw-tools hw-store-do"><button type="button" class="hh-tool" data-hs-act="dispatch">' + t('controls.dispatch_loot') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="deposit-materials"></button><p class="hw-why"></p><p class="hw-why hw-store-mats-why"></p></div>'
    + '<ul class="hw-pockets" data-side="bag" role="listbox" aria-label="In bag"></ul><p class="hh-empty hw-store-none" data-none="bag"></p>'
    /* The press's answer: "Putting it away…", then the result or the refusal. At the foot, it stands in view however the window is scrolled
       (windows.css, sticky), and its coming moves no stack from under the hand. Above the grids, a bag scrolled into reach left it out of sight, and a
       press read as nothing at all (Andy 10-26, a refused 12k-arrow press; 11-02, 14 presses in 25 s). */
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* The one sentence the bag's Deposit says too (src/data/text/bag.js). */
const STORE_AWAY = t('bag.storage_away');

/* SAY WHY: a press on a stack with the hero out hunting moves nothing, and the note that says so has scrolled away by the time the bag is in reach. */
function sayAway(cs, sc, repaint) {
  const h = huntOf(cs);
  if (h && !h.ended && !sc.pending) { sc.msg = STORE_AWAY; repaint(); }
}

/* Why Expand is off, in words, or '' when it can be pressed. Every number is the server's: the cap, the offer, the price and the purse. */
export function expandBlock(grow, purse) {
  if (!grow) return t('bag.store_grow_reading');
  if (!grow.next) return t('bag.store_grow_top');
  if (purse === null) return t('bag.store_gold_reading');
  return purse < grow.next.gold ? t('bag.store_grow_short', { gold: gold(grow.next.gold - purse) }) : '';
}

function patchSide(root, ctx, side, list, shown, off, depot, grow) {
  rows(root.querySelector('.hw-pockets[data-side="' + side + '"]'), shown, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs, side === 'bank' ? 'withdraw' : 'deposit')),
    patch: (li, r) => {
      patchCount(li, r.qty);
      attr(li, 'aria-label', t(side === 'bank' ? 'bag.store_aria_take' : 'bag.store_aria_put', { item: itemName(r.id) + (r.qty > 1 ? ', ' + whole(r.qty) : '') }));
      attr(li, 'aria-disabled', String(off));
      attr(li, 'draggable', 'false');
    },
  });
  /* The storage's space is the ACCOUNT's (the server's used / cap); the bag counts its own stacks. */
  text(root.querySelector('[data-n="' + side + '"]'), side === 'bank' && depot ? whole(depot.used) + ' of ' + whole(depot.cap) + ' stacks'
    : grow ? t('bag.store_bag_of', { n: whole(list.length), cap: whole(grow.cap) }) : whole(list.length) + (list.length === 1 ? ' stack' : ' stacks'));
  const none = root.querySelector('[data-none="' + side + '"]');
  cls(none, 'is-on', !shown.length);
  text(none, list.length ? t('bag.store_no_match') : side === 'bank' ? t('bag.store_empty') : t('bag.store_bag_empty'));
}

renderStorage.patch = function patchStorage(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-store');
  const bank = bankOf(cs), bag = bagOf(cs);
  const h = huntOf(cs);
  const away = !!(h && !h.ended);
  /* a press while another is out is queued, never dropped: the stacks stay pressable then (the window is is-pending) */
  const off = away || !bank || !bag;
  const prefs = storePrefsOf(residueOf(cs));
  /* "Recently added": mark the stacks in storage now; one residue put only when a mark changed. */
  const marks = bank ? markStored(residueOf(cs).storeSeen || null, bank, STORE_SEEN_MAX) : null;
  if (marks) queueMicrotask(() => cs.setResidue('storeSeen', marks));
  const o = { cat: prefs.cat, query: sc.query, sort: prefs.sort, bids: (shopOf(cs) || {}).bids };
  const input = root.querySelector('.hw-q');
  if (ctx.doc.activeElement !== input) prop(input, 'value', sc.query);
  prop(root.querySelector('[data-hs-act="sort"]'), 'value', prefs.sort);
  for (const b of root.querySelectorAll('.hw-cat')) attr(b, 'aria-pressed', String(b.getAttribute('data-cat') === prefs.cat));
  text(root.querySelector('.hw-store-note'), away ? STORE_AWAY
    : !bank ? t('bag.store_reading') : (ctx.isPhone && ctx.isPhone() ? t('bag.store_help_touch') : t('bag.store_help_mouse')));
  const depot = depotOf(cs);
  patchSide(root, ctx, 'bank', bank || [], view(bank || [], Object.assign({ seen: marks || residueOf(cs).storeSeen || {} }, o)), off, depot);
  /* "73 of 100 stacks. 2 more are kept free for your market listings." (a listing's return always has its place) */
  const kept = depot && depot.reserved ? t('bag.store_kept', { count: depot.reserved }) + '. ' : '';
  text(root.querySelector('.hw-store-room'), !depot ? '' : kept + (depot.next
    ? t('bag.store_more_room', { name: depot.next.name, n: whole(depot.next.stacks) })
    : t('bag.store_all_built')));
  const grow = bagExpandOf(cs);
  patchSide(root, ctx, 'bag', bag || [], view(bag || [], Object.assign({ seen: bagSeenOf(cs, bag || []) }, o)), off, null, grow);
  const gWhy = expandBlock(grow, goldOf(cs));
  const gb = root.querySelector('[data-hs-act="expand"]');
  text(gb, grow && grow.next ? t('bag.store_expand_at', { n: whole(grow.next.adds), gold: gold(grow.next.gold) }) : t('controls.expand'));
  prop(gb, 'disabled', sc.pending || !!gWhy);
  attr(gb, 'title', gWhy || t('bag.store_expand_tip', { n: whole(grow.next.adds) }));
  text(root.querySelector('.hw-store-grow .hw-why'), gWhy);
  /* Dispatch loot: off with the server-sections' reason; a hunt's reason is the note above, any other is said here. */
  const dWhy = dispatchBlock(cs);
  const db = root.querySelector('[data-hs-act="dispatch"]');
  prop(db, 'disabled', sc.pending || !!dWhy);
  attr(db, 'title', dWhy || t('bag.store_dispatch_tip'));
  text(root.querySelector('.hw-store-do .hw-why'), away ? '' : dWhy);
  /* Deposit all materials: the bag's Material stacks that fit, counted on the press, and no press with none; what does not fit is said under it.
     Off only while a press is out, a hunt runs or Storage is loading: the note above says those. */
  const mats = materialsOf(cs);
  const mb = root.querySelector('[data-hs-act="deposit-materials"]');
  text(mb, t('bag.store_mats_n', { n: whole(mats.ids.length) }));
  prop(mb, 'hidden', !mats.ids.length);
  prop(mb, 'disabled', sc.pending || off);
  attr(mb, 'title', t('bag.store_mats_tip'));
  text(root.querySelector('.hw-store-mats-why'), away || !mats.left ? '' : t('bag.store_mats_left', { count: mats.left }));
  cls(root, 'is-pending', sc.pending);
  cls(root, 'is-off', off);
  if (!away && sc.msg === STORE_AWAY) sc.msg = '';   // back in town, it no longer holds
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderStorage.events = Object.freeze(['input', 'mouseover', 'mouseout', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel']);

/* The chip or the sort, remembered (residue `storeView`, display only). */
function setPref(cs, key, value) {
  const p = storePrefsOf(residueOf(cs));
  p[key] = value;
  cs.setResidue('storeView', p);
}

/* What Deposit all materials names now (storage-model.js materialsToStore over the server's bag, Storage, room and locks). */
const materialsOf = (cs) => materialsToStore(bagOf(cs) || [], bankOf(cs), depotOf(cs), (rulesOf(cs) || {}).locked || null);

/* ONE hr_bank_move_many naming whole stacks (the server's counts, all or nothing); both grids change only from the re-read envelope. */
function moveMany(account, cs, sc, repaint, ids, dir) {
  return runIntent(sc, repaint, () => moveStorageMany(account, cs, ids, dir), dir === 'withdraw' ? t('bag.store_taking') : t('bag.putting_away'),
    (r) => t(dir === 'withdraw' ? 'bag.store_took_stacks' : 'bag.put_away', { count: r.count }), cs);
}

/* A press: queued (merged with a queued press on the same stack), then the queue is sent in turn. While one is out the line says how many wait. */
function press(account, cs, sc, repaint, p) {
  sc.queue = queuePress(sc.queue, p);
  if (sc.pending) { sc.msg = t('bag.store_queued', { count: sc.queue.length }); repaint(); return; }
  pump(account, cs, sc, repaint);
}

/* SEND THE QUEUE, ONE ASK AT A TIME: every whole-stack press of a direction together (ONE hr_bank_move_many), a counted press alone (ONE hr_bank_move)
   at its count, never more than the server's last stack (a stack gone since is passed by). A refusal stops it: its words stand, the rest is dropped. */
async function pump(account, cs, sc, repaint) {
  while (!sc.pending && sc.queue.length) {
    const { take, rest } = nextBatch(sc.queue);
    sc.queue = rest;
    const rows = (take[0].dir === 'withdraw' ? bankOf(cs) : bagOf(cs)) || [];
    const live = take.map((p) => ({ p, row: rows.find((r) => r.id === p.id) })).filter((x) => x.row);
    if (!live.length) continue;
    /* no account to ask in bulk with: the head goes alone, the rest wait their turn (never dropped) */
    if (live.length > 1 && !account) sc.queue = live.slice(1).map((x) => x.p).concat(sc.queue);
    const r = live.length > 1 && account ? await moveMany(account, cs, sc, repaint, live.map((x) => x.p.id), take[0].dir)
      : await move(cs, sc, repaint, live[0].p.id, live[0].p.qty === 'all' ? live[0].row.qty : Math.min(live[0].p.qty, live[0].row.qty), live[0].p.dir);
    if (!r || !r.ok) { sc.queue = []; return; }
  }
}

/* ONE hr_bank_move naming exactly `qty`; both grids change only from the re-read envelope. */
function move(cs, sc, repaint, id, qty, dir) {
  /* Read from the bag before the move: a tool put away slows its skill, and that is not a silent change (panel 2026-11-01). */
  const slower = dir === 'deposit' ? toolLossWords(cs, id, qty) : '';
  return runIntent(sc, repaint, () => cs.moveStorage(id, qty, dir), dir === 'withdraw' ? t('bag.store_taking') : t('bag.store_putting'),
    () => t(dir === 'withdraw' ? 'bag.store_took' : 'bag.store_put', { n: whole(qty), item: itemNameFor(id, qty) }) + (slower ? '. ' + slower : ''));
}

/* ONE unlock_buy naming the server's offer id; the cap and the next price change only from the answer's envelope. */
function expand(cs, sc, repaint) {
  const grow = bagExpandOf(cs);
  if (!grow || !grow.next || expandBlock(grow, goldOf(cs))) return;
  const offer = grow.next.offer;
  return runIntent(sc, repaint, () => cs.edgeIntent('unlock_buy', { offer }),
    t('bag.store_expanding'), () => { const g = bagExpandOf(cs); return g ? t('bag.store_expanded', { n: whole(g.cap) }) : t('bag.store_expanded_plain'); }, cs);
}

/* "How many?" beside the stack: Deposit X / Withdraw X, up to the stack the server last sent. */
function askAmount(ctx, body, cs, sc, repaint, row, dir, at) {
  hideTip(ctx.doc);
  const verb = dir === 'withdraw' ? t('controls.withdraw') : t('controls.deposit');
  openFloatMenu(ctx.doc, amountHtml({ title: t('bag.store_how_many', { verb, item: itemName(row.id) }), verb, max: row.qty, value: row.qty, act: 'amt-go' }), at, {
    label: t('bag.store_how_many_label', { verb }),
    onAct: (action) => {
      const menu = ctx.doc.querySelector('.hw-menu');
      if (stepAmount(menu, action) || action !== 'amt-go') return;
      const n = amountOf(menu);
      closeFloatMenu(ctx.doc);
      press(ctx.account, cs, sc, repaint, { id: row.id, dir, qty: n });
    },
    onClose: () => {},
    alive: () => body.isConnected,
  });
}

renderStorage.act = function actStorage(ctx, body, action, ev, el) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderStorage.patch(body, ctx);
  if (action === 'search' && ev.type === 'input') { sc.query = el.value.slice(0, 40); repaint(); return false; }
  if (action === 'sort' && ev.type === 'change') { setPref(cs, 'sort', el.value); repaint(); return false; }
  if (action === 'cat' && ev.type === 'click') { setPref(cs, 'cat', el.getAttribute('data-cat')); repaint(); return true; }
  /* a stack pressed while one of these is out waits in the queue: sent once its answer is in */
  const then = (p) => Promise.resolve(p).then(() => pump(ctx.account, cs, sc, repaint));
  if (action === 'expand') { if (ev.type === 'click' && !sc.pending && !el.disabled) then(expand(cs, sc, repaint)); return ev.type === 'click'; }
  if (action === 'dispatch') { if (ev.type === 'click' && !sc.pending && !el.disabled) then(runDispatch(ctx.account, cs, sc, repaint)); return ev.type === 'click'; }
  if (action === 'deposit-materials') {
    const ids = materialsOf(cs).ids;
    if (ev.type === 'click' && !sc.pending && !el.disabled && ids.length && ctx.account) then(moveMany(ctx.account, cs, sc, repaint, ids, 'deposit'));
    return ev.type === 'click';
  }
  if (action !== 'withdraw' && action !== 'deposit') return false;
  const id = el.getAttribute('data-item');
  const type = ev.type;
  if (type === 'mouseover') { showTip(ctx.doc, el, id, { ground: heroGroundOf(cs), features: featuresOf(cs) }); return false; }
  if (type === 'mouseout') { if (!el.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
  if (type === 'pointerup' || type === 'pointercancel') { clearTimeout(sc.press); return false; }
  const off = el.getAttribute('aria-disabled') === 'true';
  const row = ((action === 'withdraw' ? bankOf(cs) : bagOf(cs)) || []).find((r) => r.id === id);
  if (type === 'pointerdown') {
    if (!ev.pointerType || ev.pointerType === 'mouse' || off || !row) return false;
    sc.pressed = false;
    clearTimeout(sc.press);
    sc.press = setTimeout(() => { sc.pressed = true; const r = el.getBoundingClientRect(); askAmount(ctx, body, cs, sc, repaint, row, action, { x: r.left, y: r.bottom }); }, LONG_PRESS_MS);
    return false;
  }
  if (type === 'contextmenu') {
    ev.preventDefault();
    if (!off && row) askAmount(ctx, body, cs, sc, repaint, row, action, { x: ev.clientX, y: ev.clientY });
    else sayAway(cs, sc, repaint);
    return true;
  }
  if (type !== 'click') return false;
  if (sc.pressed) { sc.pressed = false; return true; }
  if (off || !row) { sayAway(cs, sc, repaint); return true; }
  hideTip(ctx.doc);
  press(ctx.account, cs, sc, repaint, { id, dir: action, qty: ev.shiftKey ? 'all' : 1 });
  return true;
};
