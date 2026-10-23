// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tally.js — TAMSIN'S TALLY BOARD: KILL TASKS, PAID IN TOWN.
//
// Tamsin Reeve keeps the Common's tally (src/data/tally-tasks.js). Her window is a
// board, not a card grid: the hero's tallies on top, each a notched stick with the
// SERVER's count ("Gray Wolves 112/200"), then her pick (the armour weight she
// gives for, and her slot order), then her board of tasks with what each pays.
//   Take        ONE hr_tally_accept (in town only; the weight is chosen once first)
//   Give up     ONE hr_tally_drop (the count is lost; said on the button's line)
//   Keep        ONE hr_tally_set { task, keep }: taken again the moment it pays
//   Weight      ONE hr_tally_set { weight }; Earlier ONE hr_tally_set { order }
//   Being paid  automatic in the settle that brings the hero home; when the window
//               opens in town with a done task due, it asks her ONCE (hr_tally_collect)
// Every number is the server's: the tallies from the `tally` section
// (src/session/tally-sections.js), the board and her pick from her answer
// (hr_tally_view). Every control is off while an intent is in flight; the window
// changes only from the re-read envelope and her next answer.
// ════════════════════════════════════════════════════════════════════════
import { tallyOf, tallyLine, waitWords, pickWords } from '../../session/tally-sections.js?v=0.2.36';
import { tallyBoard, takeTask, dropTask, setTally, collectTally } from '../../session/tally-intents.js?v=0.2.36';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.36';
import { huntName } from '../../session/party-sections.js?v=0.2.36';
import { goldOf } from '../../session/item-sections.js?v=0.2.36';
import { TALLY_KEEPER, TALLY_RULES, tallyTask } from '../../data/tally-tasks.js?v=0.2.36';
import { rows, text, cls, attr, prop, style, element } from '../../render/paint.js?v=0.2.36';
import { whole, gold } from '../../render/format.js?v=0.2.36';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.36';
import { itemName } from '../widgets/bits.js?v=0.2.36';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.36';

const SCRATCH = new WeakMap();
/* `board` is her last answer (null until it comes), `asking` the read in flight, `stale` asks again,
   `collected` the done set the window already asked her to pay (once per opening). */
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', board: null, asking: false, stale: true, collected: null }; SCRATCH.set(cs, s); }
  return s;
};
const WEIGHT_WORDS = Object.freeze({ heavy: 'Heavy', medium: 'Medium', light: 'Light' });
const SLOT_WORDS = Object.freeze({ helmet: 'Head', body: 'Body', pants: 'Legs', boots: 'Feet', gloves: 'Hands', belt: 'Waist' });
const labelOf = (task) => { const t = tallyTask(task); return t ? t.label.charAt(0).toUpperCase() + t.label.slice(1) : task; };
/* "120 Giant Rats"; one named creature reads "The Rat King, 5 times". */
const titleOf = (task, n) => { const t = tallyTask(task); return t && /^the /.test(t.label) ? labelOf(task) + ', ' + whole(n) + ' times' : whole(n) + ' ' + labelOf(task); };

/** The skeleton (built once per opening): her board is asked for afresh. */
export function renderTally(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.stale = true; sc.collected = null; sc.msg = ''; }
  return '<div class="hw-tally">'
    + '<header class="ht-keeper"><b>' + esc(TALLY_KEEPER.name) + '</b><small>' + esc(TALLY_KEEPER.title) + '</small>'
    + '<p class="hs-note">' + esc(TALLY_KEEPER.greeting) + '</p></header>'
    + '<p class="hw-cap"><span class="ht-today"></span><span class="hw-gold"></span></p>'
    + '<h3 class="hw-ledger-head is-on">Your tallies</h3><ul class="hw-ledger ht-held"></ul>'
    + '<p class="hh-empty ht-none">You hold no tally. Take one from her board.</p>'
    + '<h3 class="hw-ledger-head is-on">Her pick for you</h3>'
    + '<p class="hs-note ht-pick-note"></p>'
    + '<div class="ht-weights" role="group" aria-label="The armour weight she picks for">'
    + TALLY_RULES.weights.map((w) => '<button type="button" class="hh-seg" data-hs-act="weight" data-weight="' + w + '" aria-pressed="false">' + WEIGHT_WORDS[w] + '</button>').join('')
    + '</div><ol class="ht-order" aria-label="The order she picks slots in"></ol>'
    + '<h3 class="hw-ledger-head is-on">Her board</h3><ul class="hw-ledger ht-board"></ul>'
    + '<p class="hh-empty ht-wait">Her board loads from the server.</p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* A tally stick: one notch a tenth of the count, the server's kills as the cut part. */
function stickHtml() { return '<span class="ht-stick" role="meter" aria-valuemin="0" aria-valuemax="100"><i></i></span>'; }

function heldHtml(h) {
  return '<li class="hw-line ht-tally" data-task="' + esc(h.task) + '"><span class="hw-line-name"><b></b>' + stickHtml() + '<small></small></span>'
    + '<label class="ht-keep"><input type="checkbox" data-hs-act="keep" data-task="' + esc(h.task) + '"> Keep this task</label>'
    + '<button type="button" class="hh-tool" data-hs-act="drop" data-task="' + esc(h.task) + '">Give up</button></li>';
}

function boardHtml(r) {
  return '<li class="hw-line ht-offer" data-task="' + esc(r.task) + '"><span class="hw-line-name"><b></b><small></small></span>'
    + '<button type="button" class="hh-tool" data-hs-act="take" data-task="' + esc(r.task) + '">Take</button></li>';
}

function patchHeld(li, h, st) {
  text(li.querySelector('b'), tallyLine(h));
  const pct = Math.round(Math.min(1, h.kills / h.target) * 100);
  style(li.querySelector('.ht-stick i'), 'width', pct + '%');
  attr(li.querySelector('.ht-stick'), 'aria-valuenow', pct);
  cls(li, 'is-done', h.done);
  text(li.querySelector('small'), h.done ? waitWords(st.t, h, st.hunting) : 'Counts in ' + huntName(h.hunt) + ', even while you are away.');
  const keep = li.querySelector('[data-hs-act="keep"]');
  prop(keep, 'checked', h.keep);
  prop(keep, 'disabled', st.sc.pending);
  prop(li.querySelector('[data-hs-act="drop"]'), 'disabled', st.sc.pending);
}

function patchOffer(li, r, st) {
  const t = tallyTask(r.task);
  text(li.querySelector('b'), titleOf(r.task, r.target));
  const where = huntName(r.hunt) + (r.bandMin ? ' (Level ' + r.bandMin + ' ground)' : '') + (t && t.party ? ', best with a party' : '');
  text(li.querySelector('small'), where + ' · ' + gold(r.gold) + (r.pick ? ' + ' + pickWords(r.pick, itemName) : ''));
  const btn = li.querySelector('button');
  const why = r.held ? 'Held' : st.t && st.t.held.length >= st.t.heldMax ? 'Full' : '';
  text(btn, why || 'Take');
  prop(btn, 'disabled', !!why || st.sc.pending || st.hunting || !st.t || !st.t.weight);
}

/* Her slot order: each slot with an "Earlier" press (the first cannot move up). */
function patchOrder(root, st) {
  const order = st.t ? st.t.order : [];
  rows(root.querySelector('.ht-order'), order, {
    key: String,
    build: (s) => element(st.doc, '<li class="ht-slot"><span>' + esc(SLOT_WORDS[s] || s) + '</span>'
      + '<button type="button" class="hh-tool" data-hs-act="earlier" data-slot-name="' + esc(s) + '" aria-label="Pick ' + esc(SLOT_WORDS[s] || s) + ' earlier">Earlier</button></li>'),
    patch: (li, s) => prop(li.querySelector('button'), 'disabled', st.sc.pending || order.indexOf(s) === 0),
  });
}

renderTally.patch = function patchTally(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-tally');
  const t = tallyOf(cs);
  const h = huntOf(cs);
  const st = { t, sc, doc: ctx.doc, hunting: !!h && !h.ended };
  cls(root, 'is-pending', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  const purse = goldOf(cs);
  text(root.querySelector('.hw-gold'), purse === null ? '' : 'Your gold ' + gold(purse));
  text(root.querySelector('.ht-today'), t ? 'Paid today: ' + t.paidToday + ' of ' + t.perDay : '');
  rows(root.querySelector('.ht-held'), t ? t.held : [], { key: (x) => x.task, build: (x) => element(ctx.doc, heldHtml(x)), patch: (li, x) => patchHeld(li, x, st) });
  cls(root.querySelector('.ht-none'), 'is-on', !!t && !t.held.length);
  text(root.querySelector('.ht-pick-note'), !t ? '' : !t.weight ? 'Choose the armour weight she picks for. You can change it later.'
    : 'Each pays its gold and the next ' + WEIGHT_WORDS[t.weight].toLowerCase() + ' piece of that ground she has not given you, slot by slot in this order. After every piece, its materials.');
  for (const b of root.querySelectorAll('[data-hs-act="weight"]')) {
    attr(b, 'aria-pressed', String(!!t && t.weight === b.getAttribute('data-weight')));
    prop(b, 'disabled', sc.pending || !t);
  }
  patchOrder(root, st);
  const board = sc.board ? sc.board.board : [];
  rows(root.querySelector('.ht-board'), board, { key: (r) => r.task, build: (r) => element(ctx.doc, boardHtml(r)), patch: (li, r) => patchOffer(li, r, st) });
  cls(root.querySelector('.ht-wait'), 'is-on', !sc.board);
  text(root.querySelector('.ht-wait'), st.hunting ? 'Her board is on the Common: take tasks when you are back in town.' : 'Her board loads from the server.');
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
  const due = t && !st.hunting && t.paidToday < t.perDay ? t.held.filter((x) => x.done && x.wait !== 'bag_full') : [];
  const key = due.map((x) => x.task + '@' + x.doneAt).join(',');
  if (due.length && sc.collected !== key && !sc.pending && ctx.account) {
    sc.collected = key;
    runIntent(sc, repaint, () => collectTally(ctx.account, cs), 'Tamsin counts your tally…',
      (r) => { sc.stale = true; return r.paid ? 'Tamsin paid you for ' + r.paid + (r.paid === 1 ? ' tally.' : ' tallies.') : ''; }, cs);
  }
};

renderTally.act = function actTally(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const tally = tallyOf(cs);
  if (!tally || sc.pending || !ctx.account) return false;
  const repaint = () => ctx.refresh('tally');
  const run = (send, busy, done) => runIntent(sc, repaint, send, busy, (r) => { sc.stale = true; return done(r); }, cs);
  const task = t.getAttribute('data-task');
  if (action === 'keep' && ev.type === 'change') {
    const on = !!t.checked;
    run(() => setTally(ctx.account, cs, { task, keep: on }), 'Saving…', () => (on ? 'She will give you this task again the moment it pays.' : 'She will not give it again by itself.'));
    return true;
  }
  if (ev.type !== 'click') return false;
  if (action === 'take') {
    const row = tallyTask(task);
    run(() => takeTask(ctx.account, cs, task, null), 'Taking it…',
      () => 'Taken. Every kill in ' + (row ? huntName(row.hunt) : 'that hunt') + ' counts, even while you are away.');
    return true;
  }
  if (action === 'drop') { run(() => dropTask(ctx.account, cs, task), 'Giving it up…', () => labelOf(task) + ': given up. Its count is gone.'); return true; }
  if (action === 'weight') {
    const w = t.getAttribute('data-weight');
    run(() => setTally(ctx.account, cs, { weight: w }), 'Saving…', () => 'She picks ' + WEIGHT_WORDS[w].toLowerCase() + ' armour for you.');
    return true;
  }
  if (action === 'earlier') {
    const s = t.getAttribute('data-slot-name');
    const order = tally.order.slice();
    const i = order.indexOf(s);
    if (i <= 0) return true;
    order.splice(i - 1, 0, order.splice(i, 1)[0]);
    run(() => setTally(ctx.account, cs, { order }), 'Saving…', () => '');
    return true;
  }
  return false;
};
