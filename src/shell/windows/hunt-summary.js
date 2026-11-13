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
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.125';
import { whole, gold, clock } from '../../render/format.js?v=0.2.125';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.125';
import { runIntent } from '../intent-words.js?v=0.2.125';
import { endedSessionOf, sanitizeSummaries, huntAgainOf, againRoute, againWithBag, endWords, reasonWords, groundTitle } from '../../hunt-view/summary-model.js?v=0.2.125';
import { callOfHunt } from '../../data/boss-calls.js?v=0.2.125';
import { packFor, huntRows, seatsUnder, underWords } from '../hunt-list.js?v=0.2.125';
import { partyMembershipOf, huntName } from '../../session/party-sections.js?v=0.2.125';
import { startPartyHunt, warnPartyGround } from '../../session/party-intents.js?v=0.2.125';
import { observeSessions } from '../../session/character-session.js?v=0.2.125';
import { attach, summariesOf, liveDeaths } from '../../hunt-view/summary-recorder.js?v=0.2.125';
import { nameOf, bagOf, bagExpandOf } from '../../session/item-sections.js?v=0.2.125';
import { staminaOf } from '../../session/hunt-sections.js?v=0.2.125';
import { endCardAfter } from '../after-hunt.js?v=0.2.125';
import { heldStep, glyphSvg } from '../launcher.js?v=0.2.125';
import { coachWindow, coachTab } from '../../data/hunt-tutorial.js?v=0.2.125';
import { townStepsOf, depositPlanned } from '../back-in-town.js?v=0.2.125';
import { equipUpgrades } from '../widgets/upgrade-line.js?v=0.2.125';
import { blessAll } from '../bless-all.js?v=0.2.125';
import { blessingsOf } from '../../session/item-sections.js?v=0.2.125';
import { t } from '../../render/player-text.js?v=0.2.125';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.125';

/* Why Hunt again has nothing to send: a called room has one door, its paid press (src/data/boss-calls.js), and an old hunt that kept no settings. */
const againOffWords = (cur) => (callOfHunt(cur.hunt) ? 'He comes when he is called, from the ground\'s page.' : 'This hunt did not keep its settings.');

/* The tutorial card up now (a card of the guide, never the "What next" line), or null. */
const nextStepOf = (ctx) => heldStep(ctx);

/* Every character the account opens is recorded from its first envelope, so no hunt event is played unseen. */
observeSessions(attach);

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', pick: null, did: new Map() }; SCRATCH.set(cs, s); } return s; };
/* The Back in town steps pressed on this card (by its session id), each with its title as pressed, so a step with nothing left reads
   Done and stays saying what it did. Display only. */
const didOf = (sc, id) => { let d = sc.did.get(id); if (!d) { d = new Map(); sc.did.clear(); sc.did.set(id, d); } return d; };
/* ── The window ── */
/* The hunt's balance shows for everyone; balance per hour once the server rates the hunt (10 minutes of it: a shorter
   hunt showed a bare "–" there, core-loop play 2026-10-30); Level XP per hour before bonuses only when the server sent
   it (premium, the 10-19 analyzer ruling). XP here is LEVEL XP; training XP is the premium analyzer's Training tab
   (Tyler 2026-10-22). */
const STATS = Object.freeze([['ms', 'Time', clock], ['kills', 'Monsters', whole], ['xp', 'Level XP', whole], ['gold', 'Gold', gold], ['lootValue', 'Loot value (unsold)', gold, true],
  ['balance', 'Balance', gold, true], ['balanceH', 'Balance per hour', gold, true], ['rawXpH', 'Level XP per hour before bonuses', whole, true]]);

/** The bag is at the server's cap and the server sells a next rung. */
function bagFull(cs) {
  const g = bagExpandOf(cs), bag = bagOf(cs);
  return !!(g && g.next && bag && bag.length >= g.cap);
}

/** The skeleton (built once). */
export function renderHuntSummary() {
  return '<div class="hsum">'
    + '<p class="hs-note hsum-none">No hunts have ended yet. When one does, what it came to lands here.</p>'
    + '<section class="hsum-live"><h3 class="hw-ledger-head is-on">Just now</h3><ul class="hsum-falls hsum-live-falls"></ul></section>'
    + '<section class="hsum-card">'
    + '<header class="hsum-head"><h3 class="hsum-title"></h3><p class="hsum-when"></p></header><p class="hsum-reason"></p><p class="hsum-loss" hidden></p>'
    /* BACK IN TOWN (UX flow audit 2026-11-11, flow C): the trip home as steps right under the reason, each one press with its count and
       value (../back-in-town.js); the first open one is the card's one gold press, and a done one stays, ticked. Above the numbers, so the
       first step's press is in view as the window opens (under them it sat behind the sticky foot at 1440x900). */
    + '<section class="hsum-town"><h4 class="hw-ledger-head hsum-h-town is-on">' + esc(t('summary.town_head')) + '</h4><ul class="hsum-steps"></ul></section>'
    /* TOP LOOT above the numbers (first-30 play 2026-11-12: the first gear drop sat under the sticky foot, out of sight) */
    + '<h4 class="hw-ledger-head hsum-h-loot">Top loot</h4><ul class="hsum-list hsum-loot"></ul>'
    + '<dl class="hsum-stats">' + STATS.map(([k, label]) => '<div class="hsum-stat"><dt>' + label + '</dt><dd data-stat="' + k + '"></dd></div>').join('') + '</dl>'
    /* The presses and their answer stay in reach: the reason and the numbers pushed them under a 1366x768 window's fold, so a hunt that
       ran out of stamina opened with no press in sight (door panel 2026-11-04). */
    + '<div class="hsum-foot"><div class="hsum-actions">'
    /* a tutorial card's next step is a press here, never the gold one (Tyler 2026-11-11: after 4 h the summary's gold button was still
       the first card); the gold press is the first open Back in town step, else "Hunt again" */
    + '<button type="button" class="hh-tool" data-hs-act="coach-next" hidden></button>'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="again">' + t('controls.hunt_again') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="bag">' + t('controls.open_bag') + '</button>'
    /* a full bag (the server's cap, hr_bag_expand_view) links to Storage's Expand */
    + '<button type="button" class="hh-tool" data-hs-act="expand" hidden>Expand bag</button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>'
    + '<h4 class="hw-ledger-head hsum-h-sup">Supplies used</h4><ul class="hsum-list hsum-sup"></ul>'
    + '<h4 class="hw-ledger-head hsum-h-deaths">What happened</h4><ul class="hsum-falls hsum-deaths"></ul>'
    + '</section>'
    + '<h4 class="hw-ledger-head hsum-h-past">Earlier hunts</h4><ul class="hw-ledger hsum-past"></ul></div>';
}

const li = (doc, markup) => element(doc, markup);
const dayTime = (at) => (at === null ? '' : new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));

function lines(host, doc, items) {
  rows(host, items.map((row, i) => ({ t: row, i })), {
    key: (x) => String(x.i), build: () => li(doc, '<li></li>'), patch: (el, x) => text(el, x.t),
  });
}

/* A loot or supply line, as the Bag and the analyzer show an item: its pixel icon, its name (where a supply came
   from under it), the count at the right. `items`: [{ it, n, from }]; the icon is written once per row. */
function itemLines(host, ctx, items) {
  rows(host, items, {
    key: (x) => x.it + '|' + (x.from || ''),
    build: (x) => li(ctx.doc, '<li class="hsum-item"><span class="hsum-ico">' + itemIconHtml(ctx.glyphs, x.it) + '</span>'
      + '<span class="hsum-name"><b></b><small></small></span><span class="hsum-n"></span></li>'),
    patch: (el, x) => {
      text(el.querySelector('b'), itemName(x.it));
      text(el.querySelector('small'), x.from === 'store' ? 'from the store' : x.from ? 'from your bag' : '');
      text(el.querySelector('.hsum-n'), '×' + whole(x.n));
    },
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
  let againWhy = '';
  cls(root, 'is-empty', !cur);

  const live = huntOpen ? liveDeaths(a).deaths.slice(-2) : [];
  const liveHost = root.querySelector('.hsum-live');
  cls(liveHost, 'is-on', live.length > 0);
  lines(root.querySelector('.hsum-live-falls'), ctx.doc, live.flatMap((f) => f.lines));

  const card = root.querySelector('.hsum-card');
  cls(card, 'is-on', !!cur);
  if (cur) {
    text(root.querySelector('.hsum-title'), groundTitle(cur));
    text(root.querySelector('.hsum-when'), cur.at ? dayTime(cur.at) : '');
    const st = cur === list[0] && !huntOpen ? staminaOf(cs) : null;
    /* the newest hunt, none open: what the hero did after it, from the server's pointer (../after-hunt.js) */
    const after = cur === list[0] && !huntOpen ? endCardAfter(cs, cur.id) : '';
    text(root.querySelector('.hsum-reason'), reasonWords(cur, nameOf(cs), st ? st.msLeft : null) + (after ? ' ' + after : ''));
    /* A lost called fight: where it was lost and what answers it (hunt-view/boss-loss.js). */
    text(root.querySelector('.hsum-loss'), cur.loss || '');
    prop(root.querySelector('.hsum-loss'), 'hidden', !cur.loss);
    for (const [k, , fmt, onlySent] of STATS) {
      const dd = root.querySelector('[data-stat="' + k + '"]');
      text(dd, fmt(cur[k]));
      prop(dd.parentNode, 'hidden', !!onlySent && (cur[k] === null || cur[k] === undefined));
      /* A called boss counts no kill (src/data/boss-calls.js): the reason line says he's down, and "Monsters 0" would say he isn't. */
      if (k === 'kills' && callOfHunt(cur.hunt)) prop(dd.parentNode, 'hidden', true);
    }
    const loot = cur.loot.map(([it, n]) => ({ it, n }));
    cls(root.querySelector('.hsum-h-loot'), 'is-on', loot.length > 0);
    itemLines(root.querySelector('.hsum-loot'), ctx, loot);
    const sup = cur.supplies.map(([it, src, n]) => ({ it, n, from: src === 'store' ? 'store' : 'bag' }));
    cls(root.querySelector('.hsum-h-sup'), 'is-on', sup.length > 0);
    itemLines(root.querySelector('.hsum-sup'), ctx, sup);
    cls(root.querySelector('.hsum-h-deaths'), 'is-on', cur.deaths.length > 0);
    lines(root.querySelector('.hsum-deaths'), ctx.doc, cur.deaths);
    const again = huntAgainOf(cur);
    const route = again ? againRoute(partyMembershipOf(cs), again.hunt) : null;
    const go = root.querySelector('[data-hs-act="again"]');
    prop(go, 'disabled', sc.pending || huntOpen || !again || !route.how);
    attr(go, 'title', huntOpen ? 'A hunt is already running.' : !again ? againOffWords(cur) : route.why || 'Same ground, action set and limits, with what your bag holds now.');
    /* Hunt again off says why on the line under it, not only in a title (say-why). */
    againWhy = huntOpen ? 'Hunt again is off. A hunt is already running.' : !again ? 'Hunt again is off. ' + againOffWords(cur) : route.why ? 'Hunt again is off. ' + route.why : '';
    const card = huntOpen ? null : nextStepOf(ctx);
    const next = root.querySelector('[data-hs-act="coach-next"]');
    prop(next, 'hidden', !card);
    text(next, card ? 'Next: ' + card.title : '');
    /* the steps are about the bag NOW: the newest hunt's card only, with no hunt running */
    const town = cur === list[0] && !huntOpen ? townStepsOf(cs, didOf(sc, cur.id)) : { steps: [], primary: 'again' };
    patchTown(root, ctx, sc, town);
    cls(go, 'is-primary', town.primary === 'again');
    for (const b of root.querySelectorAll('.hsum-actions button:not([data-hs-act="again"])')) prop(b, 'disabled', sc.pending);
    prop(root.querySelector('[data-hs-act="expand"]'), 'hidden', !bagFull(cs));
  }
  /* THE ANSWER IS THE PRESS'S (party panel 2026-11-03: "Setting out." still up with the hero home from that hunt): a hunt that opens or ends makes it old. */
  const huntNow = open ? open.id + (open.ended ? ':over' : '') : '';
  if (sc.huntNow !== huntNow) { if (!sc.pending) sc.msg = ''; sc.huntNow = huntNow; }
  text(root.querySelector('.hh-intent-msg'), sc.msg || againWhy);

  const past = list.filter((s) => s !== cur);
  cls(root.querySelector('.hsum-h-past'), 'is-on', past.length > 0);
  rows(root.querySelector('.hsum-past'), past, {
    key: (s) => s.id,
    build: (s) => li(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="pick" data-id="' + s.id.replace(/[^a-z0-9-]/gi, '') + '">' + t('controls.show') + '</button></li>'),
    patch: (el, s) => {
      text(el.querySelector('b'), groundTitle(s));
      text(el.querySelector('small'), [dayTime(s.at), s.kills !== null ? whole(s.kills) + ' kills' : '', s.reason ? endWords(s.reason, s.forfeit, s.by, nameOf(cs), s.why).split('. ')[0].replace(/\.$/, '') : ''].filter(Boolean).join(' · '));
    },
  });
};

/* The Back in town rows, patched in place: the icon is the first stack's (a tick once done), the count and value its title, the plan's
   words under it, its one press at the right (gold when it is the first open step). */
function patchTown(root, ctx, sc, town) {
  cls(root.querySelector('.hsum-town'), 'is-on', town.steps.length > 0);
  rows(root.querySelector('.hsum-steps'), town.steps, {
    key: (s) => s.id,
    build: (s) => li(ctx.doc, '<li class="hsum-step" data-step="' + s.id + '"><span class="hsum-ico"></span><span class="hsum-step-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="town" data-step="' + s.id + '"></button><span class="hsum-done" hidden></span></li>'),
    patch: (el, s) => {
      cls(el, 'is-done', s.done);
      const ico = el.querySelector('.hsum-ico');
      const want = s.done ? 'done' : s.icon ? 'item:' + s.icon : 'shield';
      if (ico.getAttribute('data-ico') !== want) { ico.setAttribute('data-ico', want); ico.innerHTML = s.done ? glyphSvg(ctx.glyphs, 'uiCheck') : s.icon ? itemIconHtml(ctx.glyphs, s.icon) : glyphSvg(ctx.glyphs, 'uiShield'); }
      text(el.querySelector('b'), s.title);
      text(el.querySelector('small'), s.words);
      const btn = el.querySelector('button');
      prop(btn, 'hidden', s.done);
      prop(btn, 'disabled', sc.pending);
      text(btn, s.verb);
      cls(btn, 'is-primary', town.primary === s.id);
      const done = el.querySelector('.hsum-done');
      prop(done, 'hidden', !s.done);
      text(done, t('summary.done'));
    },
  });
}

/* ONE press per step, the existing intent each: the plan's `equip` (upgrade-line.js), the loot plan's sale as ONE vendor_sell_many, the
   Deposit stacks as ONE hr_bank_move_many (back-in-town.js depositPlanned), the Services tab's Bless all. An answer that went marks the step pressed
   on this card, so a step with nothing left reads Done; the answer's words land on the summary's own line. */
function doTown(ctx, cs, sc, repaint, cur, step) {
  const town = townStepsOf(cs, didOf(sc, cur.id));
  const s = town.steps.find((x) => x.id === step && !x.done);
  if (!s || sc.pending) return;
  const mark = (r) => { if (r && (r.ok || r.moved > 0)) { didOf(sc, cur.id).set(step, s.title); repaint(); } };
  if (step === 'equip') { equipUpgrades(cs, sc, repaint, { ops: s.ops }).then(mark); return; }
  if (step === 'sell') {
    const lines = s.lines;
    runIntent(sc, repaint, () => cs.edgeIntent('vendor_sell_many', { lines }), t('summary.selling'),
      (r) => (r && Number.isSafeInteger(r.paid) ? t('summary.sold', { gold: gold(r.paid) }) : t('summary.sold_plain')), cs).then(mark);
    return;
  }
  if (step === 'deposit') {
    const lines = s.lines;
    runIntent(sc, repaint, () => depositPlanned(ctx.account, cs, lines), t('summary.depositing'), (r) => t('summary.deposited', { count: r && Number.isSafeInteger(r.moved) ? r.moved : lines.length }), cs).then(mark);
    return;
  }
  if (step === 'bless') {
    runIntent(sc, repaint, () => blessAll(cs), t('shop.bless_all_busy'), () => { const b = blessingsOf(cs); return b ? t('shop.bless_all_done', { of: b.tiers.length }) : ''; }, cs).then(mark);
  }
}

renderHuntSummary.act = function actHuntSummary(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntSummary.patch(body, ctx);
  if (action === 'pick') { sc.pick = el.getAttribute('data-id'); sc.msg = ''; repaint(); return true; }
  if (action === 'town') {
    const list = sanitizeSummaries(summariesOf(cs));
    const cur = list.find((s) => s.id === sc.pick) || list[0];
    if (cur && cur === list[0]) doTown(ctx, cs, sc, repaint, cur, el.getAttribute('data-step'));
    return true;
  }
  /* the card's next step: the summary closes and the card's window opens on its tab (its card and ring are there),
     or, for a card on the bar or the town, the summary closes and the card stands under the icon row */
  if (action === 'coach-next') {
    const card = nextStepOf(ctx);
    ctx.wm.close('hunt-summary');
    const win = card ? coachWindow(card) : null;
    if (win && ctx.wm.row(win) && ctx.wm.row(win).launcher !== false) {
      if (coachTab(card)) ctx.wm.openTab(win, coachTab(card)); else ctx.show(win);
    }
    return true;
  }
  if (action === 'bag') { ctx.show('inventory'); return true; }
  if (action === 'expand') { ctx.show('storage'); return true; }
  if (action === 'again') {
    const list = summariesOf(cs);
    const cur = list.find((s) => s.id === sc.pick) || list[0];
    const args = huntAgainOf(cur);
    const how = args ? againRoute(partyMembershipOf(cs), args.hunt).how : null;
    if (how === 'party') leadAgain(ctx, cs, sc, repaint, args.hunt);
    else if (how === 'enter') runIntent(sc, repaint, () => cs.huntAgain(againWithBag(args, packFor(bagOf(cs)))), 'Setting out…', () => 'Setting out.', cs);
    return true;
  }
  return false;
};

/* THE LEADER'S HUNT AGAIN is the party's Start, as Enter's is (hunts.js): a seat under the ground's floor hears it on the first press, the second goes. */
function leadAgain(ctx, cs, sc, repaint, hunt) {
  const party = partyMembershipOf(cs);
  const row = huntRows().find((x) => x.hunt === hunt);
  const low = row ? seatsUnder(row, party) : { under: [] };
  const warned = hunt + ':' + low.under.map((s) => s.seat).join();
  if (low.under.length && sc.warned !== warned) {
    runIntent(sc, repaint, () => warnPartyGround(ctx.account, cs, hunt), 'Telling your party…',
      () => underWords(row, low.under) + ' They have been told. Press Hunt again to go.', cs).then(() => { sc.warned = warned; repaint(); });
    return;
  }
  sc.warned = null;
  runIntent(sc, repaint, () => startPartyHunt(ctx.account, cs, hunt), 'Gathering the party for ' + huntName(hunt) + '…', () => 'Your party is on its way to ' + huntName(hunt) + '.', cs);
}
