// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/havora/index.js — THE HAVORA WINDOW: WHAT GOLD BUYS IN TOWN.
//
// Three tabs:
//   Hearth   a powder on the Great Hearth (the designer's gold sinks section). The window opens on the color this account threw last, from the server.
//   Round    a round at the Tavern: fireworks over Hearth Square.
//   Works    what the whole server is building (./works.js, which keeps its own reads and answers).
// While it's open the window reads the server's quotes (hr_town_sinks_view: never in the envelope, so an idle hero costs no read), on opening, after each press
// and every ASK_MS. Every price, count and word about the queue is the server's; a stale price only earns quote_changed, and the answer is said and re-read.
// Every control is off while an intent is in flight. Nothing here ever computes a price (CLAUDE.md §1, §6). A price the purse can't pay is off before the press and the
// line under it says by how much: the purse is the envelope's, the price the server's read, and the server still judges (v0.2.97 gate, the Works tab's same class).
// ════════════════════════════════════════════════════════════════════════
import { readSinks, throwPowder, standRound } from '../../../session/town-intents.js?v=0.2.116';
import { goldOf } from '../../../session/item-sections.js?v=0.2.116';
import { SHOW_FLAMES, SINK_RULES } from '../../../data/gold-sinks.js?v=0.2.116';
import { TOWN_NAME } from '../../../data/world/town/plan.js?v=0.2.116';
import { ITEMS } from '../../../data/items.js?v=0.2.116';
import { text, cls, attr, prop } from '../../../render/paint.js?v=0.2.116';
import { whole, gold } from '../../../render/format.js?v=0.2.116';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.116';
import { runIntent, refusalText } from '../../intent-words.js?v=0.2.116';
import { WORKS_TAB, worksHtml, patchWorks, actWorks } from './works.js?v=0.2.116';

const ASK_MS = 15000;
const RETRY_MS = 5000;
const TABS = Object.freeze([{ id: 'hearth', label: 'Hearth' }, { id: 'round', label: 'Round' }].concat(WORKS_TAB.shown ? [WORKS_TAB] : []));
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the tab, the server's last read, the powder picked (null: the server's last), the read in flight. */
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { tab: 'hearth', sinks: null, pick: null, asking: false, askedAt: -Infinity, stale: true, pending: false, msg: '' }; SCRATCH.set(cs, s); }
  return s;
};

/** The powder on the button: the one picked here, else the one the server says this account threw last, else the catalogue's first. */
const pickedOf = (sc) => {
  const offers = SINK_RULES.powder.offers;
  const last = sc.sinks && sc.sinks.powder.last;
  return sc.pick || (last && offers.includes(last) ? last : offers[0]);
};

/** "Throw Cinnabar: 2,000 gp". Pure. */
export function throwWords(show, price) {
  return 'Throw ' + SHOW_FLAMES[show].label + (Number.isSafeInteger(price) ? ': ' + gold(price) : '');
}
/** What the purse the envelope states is short of a price: 0 when it covers it, or when either isn't known (the server judges). Pure. */
export const shortOf = (price, purse) => (Number.isSafeInteger(price) && Number.isSafeInteger(purse) && purse < price ? price - purse : 0);
const needWords = (short) => (short ? 'You need ' + gold(short) + ' more.' : '');

/** "Stand a round: 5,000 gp". Pure. */
export function roundWords(price) {
  return 'Stand a round' + (Number.isSafeInteger(price) ? ': ' + gold(price) : '');
}

const countLine = (q, noun) => (q.perDay === null ? '' : whole(q.n) + ' of ' + whole(q.perDay) + ' ' + noun + ' today from this account. More after midnight UTC.');

/* "Your powder burns after the Rat King's Knot." while a named flame holds the fire; what's booked otherwise. */
function queueLine(sinks) {
  const m = sinks.mine;
  if (m && m.behind) return 'Your powder burns after the ' + ((ITEMS[m.behind] && ITEMS[m.behind].n) || 'named fuel') + '.';
  if (m) return 'Your ' + SHOW_FLAMES[m.show].label + ' is booked on the Hearth.';
  const q = sinks.powder;
  return q.bookedS > 0 ? 'The Hearth\'s powders are booked for ' + whole(Math.ceil(q.bookedS / 60)) + (Math.ceil(q.bookedS / 60) === 1 ? ' minute.' : ' minutes.') : '';
}

/** The skeleton (built once per opening): the quotes are asked for afresh. */
export function renderHavora(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.stale = true; sc.msg = ''; sc.pick = null; }
  const offers = SINK_RULES.powder.offers;
  return '<div class="hw-havora">'
    /* the purse shares the tabs' row: a window's height is the first thing a short screen runs out of */
    + '<div class="hv-top"><div class="hw-tabs" role="tablist">' + TABS.map((t, i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + esc(t.id) + '" aria-selected="' + (i === 0) + '">' + esc(t.label) + '</button>').join('') + '</div>'
    + '<span class="hv-gold"></span></div>'
    + '<section class="hw-pane hv-pane" data-pane="hearth">'
    + '<p class="hv-lead">Throw a powder on the Great Hearth. It burns that color for ' + whole(SINK_RULES.powder.seconds) + ' seconds, and everyone in ' + esc(TOWN_NAME) + ' sees who threw it.</p>'
    + '<div class="hv-powders" role="radiogroup" aria-label="Which powder">' + offers.map((id) => '<button type="button" role="radio" class="hv-powder is-' + esc(id) + '" data-hs-act="pick" data-show="' + esc(id) + '" aria-checked="false"><i class="hv-swatch" aria-hidden="true"></i>' + esc(SHOW_FLAMES[id].label) + '</button>').join('') + '</div>'
    /* why the buy is off stands over it: under it, a phone sheet's foot lay on the line */
    + '<p class="hw-why hv-why" data-of="hearth"></p>'
    + '<button type="button" class="hh-tool is-primary hv-buy" data-hs-act="powder"></button>'
    + '</section>'
    + '<section class="hw-pane hv-pane" data-pane="round">'
    + '<p class="hv-lead">Stand a round at the Tavern. Fireworks go up over Hearth Square for ' + whole(SINK_RULES.round.seconds) + ' seconds, and the whole town hears who paid.</p>'
    + '<p class="hw-why hv-why" data-of="round"></p>'
    + '<button type="button" class="hh-tool is-primary hv-buy" data-hs-act="round"></button>'
    + '</section>'
    + (WORKS_TAB.shown ? '<section class="hw-pane hv-pane" data-pane="works">' + worksHtml() + '</section>' : '')
    /* THE FOOT: what the server says of the day and its answer to a press, stuck to the window's foot, so a short window scrolls the pane under them and never cuts them off */
    + '<div class="hv-foot">' + TABS.map((t) => '<p class="hw-cap hv-count" data-of="' + esc(t.id) + '"></p>').join('') + '<p class="hw-cap hv-queue"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

renderHavora.patch = function patchHavora(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-havora');
  if (!cs || !root) return;
  const sc = scratchOf(cs);
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('havora') : null;
  if (want && TABS.some((t) => t.id === want)) { sc.tab = want; sc.msg = ''; }
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.hv-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  const purse = goldOf(cs);
  text(root.querySelector('.hv-gold'), purse === null ? '' : 'Purse: ' + gold(purse));
  const s = sc.sinks;
  const picked = pickedOf(sc);
  for (const b of root.querySelectorAll('.hv-powder')) attr(b, 'aria-checked', String(b.getAttribute('data-show') === picked));
  const buyPowder = root.querySelector('[data-hs-act="powder"]');
  const buyRound = root.querySelector('[data-hs-act="round"]');
  const pPrice = s ? s.powder.price : null, rPrice = s ? s.round.price : null;
  text(buyPowder, s && pPrice === null ? 'No more powders today' : throwWords(picked, pPrice));
  text(buyRound, s && rPrice === null ? 'No more rounds today' : roundWords(rPrice));
  const pShort = shortOf(pPrice, purse), rShort = shortOf(rPrice, purse);
  prop(buyPowder, 'disabled', sc.pending || pPrice === null || pShort > 0);
  prop(buyRound, 'disabled', sc.pending || rPrice === null || rShort > 0);
  attr(buyPowder, 'data-off-why', needWords(pShort) || null);
  attr(buyRound, 'data-off-why', needWords(rShort) || null);
  text(root.querySelector('.hv-why[data-of="hearth"]'), needWords(pShort));
  text(root.querySelector('.hv-why[data-of="round"]'), needWords(rShort));
  for (const b of root.querySelectorAll('.hv-powder')) prop(b, 'disabled', sc.pending);
  text(root.querySelector('.hv-count[data-of="hearth"]'), s ? countLine(s.powder, 'powders') : '');
  text(root.querySelector('.hv-count[data-of="round"]'), s ? countLine(s.round, 'rounds') : '');
  for (const l of root.querySelectorAll('.hv-count')) cls(l, 'is-on', l.getAttribute('data-of') === sc.tab);
  text(root.querySelector('.hv-queue'), s && sc.tab === 'hearth' ? queueLine(s) : '');
  /* the answer to a press: the Works tab writes its own (./works.js) */
  if (sc.tab !== WORKS_TAB.id) text(root.querySelector('.hh-intent-msg'), sc.msg);
  if (WORKS_TAB.shown && sc.tab === WORKS_TAB.id) patchWorks(root.querySelector('[data-pane="works"]'), ctx);
  /* THE READ: once per opening, after a press, and every ASK_MS while open (a read, never the record). */
  const due = sc.stale || ctx.now() - sc.askedAt >= ASK_MS;
  if (due && !sc.asking && ctx.account) {
    sc.asking = true; sc.stale = false; sc.askedAt = ctx.now();
    readSinks(ctx.account, cs).then((r) => {
      sc.asking = false;
      if (r.ok) sc.sinks = r.sinks;
      else { sc.askedAt = ctx.now() - ASK_MS + RETRY_MS; if (!sc.sinks) sc.msg = refusalText(r, cs); }
      ctx.refresh('havora');
    });
  }
};

renderHavora.act = function actHavora(ctx, body, action, ev, t) {
  if (ev.type !== 'click' || !ctx.character) return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('havora');
  if (action === 'tab') { sc.tab = t.getAttribute('data-tab'); sc.msg = ''; body.scrollTop = 0; repaint(); return true; }
  if (WORKS_TAB.shown && actWorks(ctx, body, action, ev, t)) return true;
  if (action === 'pick') {
    const id = t.getAttribute('data-show');
    if (SINK_RULES.powder.offers.includes(id)) { sc.pick = id; sc.msg = ''; repaint(); }
    return true;
  }
  if (sc.pending || !ctx.account || !sc.sinks) return false;
  const after = (r) => { sc.stale = true; return r; };
  if (action === 'powder' && sc.sinks.powder.price !== null) {
    const show = pickedOf(sc);
    const price = sc.sinks.powder.price;
    runIntent(sc, repaint, () => throwPowder(ctx.account, cs, show, price).then(after), 'Throwing it…',
      (r) => (r.behind ? 'Paid ' + gold(r.price) + '. Your powder burns after the ' + ((ITEMS[r.behind] && ITEMS[r.behind].n) || 'named fuel') + '.' : 'Paid ' + gold(r.price) + '. Your hero heads for the fire.'), cs);
    return true;
  }
  if (action === 'round' && sc.sinks.round.price !== null) {
    const price = sc.sinks.round.price;
    runIntent(sc, repaint, () => standRound(ctx.account, cs, price).then(after), 'Calling for drinks…',
      (r) => 'Paid ' + gold(r.price) + '. Look up over Hearth Square.', cs);
    return true;
  }
  return false;
};
