// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-summary.js — THE HUNT SUMMARY AND WHY A HERO FELL (QoL 8).
//
// Tyler 10-18: "players should spend their time making interesting decisions,
// not repeating decisions they've already made". When a hunt ends the player
// sees ONE card with what it came to and the next move at hand:
//   duration, kills, XP, gold (coin received), loot value (unsold, its own line), balance per hour (raw XP per hour: premium), top loot, supplies used (bag vs store), the end
//   reason in plain words, and the death explanation (death-explain.js);
//   Hunt again   ONE hr_hunt_enter with the same ground, action set, limits and
//                bag. The party is the server's, the checks are the server's.
//   Open bag     opens the Bag
// The last HISTORY_MAX hunts are kept per character in the display-only
// residue (`huntSummaries`) and listed under the card.
//
// The recorder (src/hunt-view/summary-recorder.js, attached when the session is
// made) keeps the newest events of the current hunt and stores the summary once
// when the session ends. Numbers come from the server's sections only.
// Built once, patched in place (src/render/paint.js).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.27';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.27';
import { whole, gold, clock } from '../../render/format.js?v=0.2.27';
import { itemName } from '../widgets/bits.js?v=0.2.27';
import { runIntent } from '../intent-words.js?v=0.2.27';
import { endedSessionOf, sanitizeSummaries, huntAgainOf, endWords } from '../../hunt-view/summary-model.js?v=0.2.27';
import { observeSessions } from '../../session/character-session.js?v=0.2.27';
import { attach, summariesOf, liveDeaths } from '../../hunt-view/summary-recorder.js?v=0.2.27';

/* Every character the account opens is recorded from its first envelope, so no hunt event is played unseen. */
observeSessions(attach);

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', pick: null }; SCRATCH.set(cs, s); } return s; };
/* ── The window ── */
/* Balance per hour shows for everyone; Level XP per hour before bonuses only when the server sent it (premium, the
   10-19 analyzer ruling). XP here is LEVEL XP; training XP is the premium analyzer's Training tab (Tyler 2026-10-22). */
const STATS = Object.freeze([['ms', 'Time', clock], ['kills', 'Monsters', whole], ['xp', 'Level XP', whole], ['gold', 'Gold', gold], ['lootValue', 'Loot value (unsold)', gold, true],
  ['balanceH', 'Balance per hour', gold], ['rawXpH', 'Level XP per hour before bonuses', whole, true]]);

/** The skeleton (built once). */
export function renderHuntSummary() {
  return '<div class="hsum">'
    + '<p class="hs-note hsum-none">No hunts have ended yet. When one does, what it came to lands here.</p>'
    + '<section class="hsum-live"><h3 class="hw-ledger-head is-on">Just now</h3><ul class="hsum-falls hsum-live-falls"></ul></section>'
    + '<section class="hsum-card">'
    + '<h3 class="hsum-title"></h3><p class="hsum-reason"></p>'
    + '<dl class="hsum-stats">' + STATS.map(([k, label]) => '<div class="hsum-stat"><dt>' + label + '</dt><dd data-stat="' + k + '"></dd></div>').join('') + '</dl>'
    + '<div class="hsum-actions">'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="again">Hunt again</button>'
    + '<button type="button" class="hh-tool" data-hs-act="bag">Open bag</button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<h4 class="hw-ledger-head hsum-h-loot">Top loot</h4><ul class="hsum-list hsum-loot"></ul>'
    + '<h4 class="hw-ledger-head hsum-h-sup">Supplies used</h4><ul class="hsum-list hsum-sup"></ul>'
    + '<h4 class="hw-ledger-head hsum-h-deaths">What happened</h4><ul class="hsum-falls hsum-deaths"></ul>'
    + '</section>'
    + '<h4 class="hw-ledger-head hsum-h-past">Earlier hunts</h4><ul class="hw-ledger hsum-past"></ul></div>';
}

const li = (doc, markup) => element(doc, markup);
const groundName = (s) => (s.hunt && HUNT_INDEX[s.hunt] ? HUNT_INDEX[s.hunt].name : 'Hunt');
const dayTime = (at) => (at === null ? '' : new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));

function lines(host, doc, items) {
  rows(host, items.map((t, i) => ({ t, i })), {
    key: (x) => String(x.i), build: () => li(doc, '<li></li>'), patch: (el, x) => text(el, x.t),
  });
}

renderHuntSummary.patch = function patchHuntSummary(body, ctx) {
  const cs = ctx.character;
  const a = attach(cs);
  const sc = scratchOf(cs);
  const root = body.querySelector('.hsum');
  const list = sanitizeSummaries(summariesOf(cs));
  const cur = list.find((s) => s.id === sc.pick) || list[0] || null;
  const open = endedSessionOf(cs);
  const huntOpen = !!open && !open.ended;
  cls(root, 'is-empty', !cur);

  const live = huntOpen ? liveDeaths(a).deaths.slice(-2) : [];
  const liveHost = root.querySelector('.hsum-live');
  cls(liveHost, 'is-on', live.length > 0);
  lines(root.querySelector('.hsum-live-falls'), ctx.doc, live.flatMap((f) => f.lines));

  const card = root.querySelector('.hsum-card');
  cls(card, 'is-on', !!cur);
  if (cur) {
    text(root.querySelector('.hsum-title'), groundName(cur) + (cur.at ? ' · ' + dayTime(cur.at) : ''));
    text(root.querySelector('.hsum-reason'), cur.reason ? endWords(cur.reason) : 'The hunt ended.');
    for (const [k, , fmt, onlySent] of STATS) {
      const dd = root.querySelector('[data-stat="' + k + '"]');
      text(dd, fmt(cur[k]));
      prop(dd.parentNode, 'hidden', !!onlySent && (cur[k] === null || cur[k] === undefined));
    }
    const loot = cur.loot.map(([it, n]) => whole(n) + ' × ' + itemName(it));
    cls(root.querySelector('.hsum-h-loot'), 'is-on', loot.length > 0);
    lines(root.querySelector('.hsum-loot'), ctx.doc, loot);
    const sup = cur.supplies.map(([it, src, n]) => whole(n) + ' × ' + itemName(it) + (src === 'store' ? ' (from the store)' : ' (from your bag)'));
    cls(root.querySelector('.hsum-h-sup'), 'is-on', sup.length > 0);
    lines(root.querySelector('.hsum-sup'), ctx.doc, sup);
    cls(root.querySelector('.hsum-h-deaths'), 'is-on', cur.deaths.length > 0);
    lines(root.querySelector('.hsum-deaths'), ctx.doc, cur.deaths);
    const again = huntAgainOf(cur);
    const go = root.querySelector('[data-hs-act="again"]');
    prop(go, 'disabled', sc.pending || huntOpen || !again);
    attr(go, 'title', huntOpen ? 'A hunt is already running.' : again ? 'Same ground, action set, limits and bag.' : 'This hunt did not keep its settings.');
    for (const b of root.querySelectorAll('.hsum-actions button:not(.is-primary)')) prop(b, 'disabled', sc.pending);
  }
  text(root.querySelector('.hh-intent-msg'), sc.msg);

  const past = list.filter((s) => s !== cur);
  cls(root.querySelector('.hsum-h-past'), 'is-on', past.length > 0);
  rows(root.querySelector('.hsum-past'), past, {
    key: (s) => s.id,
    build: (s) => li(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="pick" data-id="' + s.id.replace(/[^a-z0-9-]/gi, '') + '">Show</button></li>'),
    patch: (el, s) => {
      text(el.querySelector('b'), groundName(s));
      text(el.querySelector('small'), [dayTime(s.at), s.kills !== null ? whole(s.kills) + ' kills' : '', s.reason ? endWords(s.reason).replace(/\.$/, '') : ''].filter(Boolean).join(' · '));
    },
  });
};

renderHuntSummary.act = function actHuntSummary(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntSummary.patch(body, ctx);
  if (action === 'pick') { sc.pick = t.getAttribute('data-id'); sc.msg = ''; repaint(); return true; }
  if (action === 'bag') { ctx.show('inventory'); return true; }
  if (action === 'again') {
    const list = summariesOf(cs);
    const cur = list.find((s) => s.id === sc.pick) || list[0];
    const args = huntAgainOf(cur);
    if (args) runIntent(sc, repaint, () => cs.huntAgain(args), 'Setting out…', () => 'Setting out.');
    return true;
  }
  return false;
};
