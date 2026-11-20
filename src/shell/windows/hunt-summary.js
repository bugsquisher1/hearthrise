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
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.143';
import { whole, gold } from '../../render/format.js?v=0.2.143';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.143';
import { runIntent } from '../intent-words.js?v=0.2.143';
import { endedSessionOf, sanitizeSummaries, huntAgainOf, againRoute, againWithBag, endWords, reasonWords, groundTitle, goldKeptOf } from '../../hunt-view/summary-model.js?v=0.2.143';
import { callOfHunt } from '../../data/boss-calls.js?v=0.2.143';
import { BOSS_HALL_WORDS, roomOfHunt } from '../../data/boss-halls.js?v=0.2.143';
import { packFor, huntRows, seatsUnder, underWords } from '../hunt-list.js?v=0.2.143';
import { partyMembershipOf, huntName } from '../../session/party-sections.js?v=0.2.143';
import { startPartyHunt, warnPartyGround } from '../../session/party-intents.js?v=0.2.143';
import { observeSessions } from '../../session/character-session.js?v=0.2.143';
import { attach, summariesOf, liveDeaths, liveSummaryOf } from '../../hunt-view/summary-recorder.js?v=0.2.143';
import { nameOf, bagOf, bagExpandOf } from '../../session/item-sections.js?v=0.2.143';
import { staminaOf, goldFloorOf } from '../../session/hunt-sections.js?v=0.2.143';
import { endCardAfter, spanWords } from '../after-hunt.js?v=0.2.143';
import { resultHtml, patchResult, goldFig } from '../result-block.js?v=0.2.143';
import { afterDoneWords } from '../hunt-after.js?v=0.2.143';
import { heldStep, glyphSvg } from '../launcher.js?v=0.2.143';
import { coachWindow, coachTab } from '../../data/hunt-tutorial.js?v=0.2.143';
import { townStepsOf, depositPlanned, alwaysSell } from '../back-in-town.js?v=0.2.143';
import { equipUpgrades } from '../widgets/upgrade-line.js?v=0.2.143';
import { blessAll } from '../bless-all.js?v=0.2.143';
import { blessingsOf } from '../../session/item-sections.js?v=0.2.143';
import { t } from '../../render/player-text.js?v=0.2.143';
import { skillWord } from '../training-words.js?v=0.2.143';
import { trainingOf as trainedBy } from '../../data/training.js?v=0.2.143';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.143';
import { towerOf } from '../../session/tower-sections.js?v=0.2.143';
import { TOWER_RULES, runRulesOf } from '../../data/tower.js?v=0.2.143';
import { climbEnd } from '../tower-words.js?v=0.2.143';
import { climbCardHtml, patchClimbCard } from '../tower-end-card.js?v=0.2.143';
import { targetOf, gotoKey } from '../goto.js?v=0.2.143';
import { sideName, spanWords as standingWords } from '../faction-words.js?v=0.2.143';

/* Why Hunt again has nothing to send: a called room has one door, its paid press (src/data/boss-calls.js), a keyed hall its key on the ground's
   page (src/data/boss-halls.js), and an old hunt that kept no settings. */
const againOffWords = (cur) => {
  /* a run starts only at its own door, the Tower window: the Tower's Climb tab, a Catacombs wing's Catacombs tab */
  const run = runRulesOf(cur.hunt);
  if (run) return run.family === 'catacomb' ? t('catacomb.again_off') : t('tower.again_off');
  const room = roomOfHunt(cur.hunt);
  if (room && room.kind === 'hall') return BOSS_HALL_WORDS.again.replace('{key}', itemName(room.key));
  /* a ground this hero outgrew (its hunt ended `outgrown`): the server refuses it, and the card's Next ground row is the way on */
  if (cur.reason === 'outgrown') return t('summary.again_outgrown');
  return callOfHunt(cur.hunt) ? 'Call him out from the ground\'s page' : 'Hunt settings not saved';
};

/* The tutorial card up now (a card of the guide, never the "What next" line), or null. */
const nextStepOf = (ctx) => heldStep(ctx);

/* Every character the account opens is recorded from its first envelope, so no hunt event is played unseen. */
observeSessions(attach);

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', pick: null, did: new Map(), sold: { id: null, items: [] } }; SCRATCH.set(cs, s); } return s; };
/* The Back in town steps pressed on this card (by its session id), each with its title as pressed, so a step with nothing left reads
   Done and stays saying what it did. Display only. */
const didOf = (sc, id) => { let d = sc.did.get(id); if (!d) { d = new Map(); sc.did.clear(); sc.did.set(id, d); } return d; };
/* The junk this card's Sell took with no plan (its step's `fresh`), what "Always sell these" offers. Display only: a reload forgets the offer,
   never a plan (the plans are the server's). */
const soldOf = (sc, id) => (sc.sold.id === id ? sc.sold.items : []);
const townOf = (cs, sc, id) => townStepsOf(cs, didOf(sc, id), soldOf(sc, id));
/* ── The window ── */
/* THE DETAILS, under the presses: the hunt's balance for everyone, balance per hour once the server rates the hunt (10 minutes of it: a
   shorter hunt showed a bare "–" there, core-loop play 2026-10-30), Level XP per hour with no party or solo bonus (the analyzer's own
   row, hud.an_raw_xp_h) only when the server sent it (premium, the 10-19 analyzer ruling). The headline figures (Level XP, Gold, Kills)
   lead the card in the result block. */
/* the loot's unsold value is its own row here (the Gold figure is what the purse kept, coins less supplies; loot is not gold until it is sold) */
const STATS = Object.freeze([['lootValue', t('hud.an_loot_value'), gold], ['balance', 'Balance', gold], ['balanceH', 'Balance per hour', gold], ['rawXpH', t('hud.an_raw_xp_h'), whole]]);

const plus = (n, fmt) => (Number.isFinite(n) && n > 0 ? '+' + fmt(n) : fmt(n));
/* A time the server measured, in the away card's words ("45 min", "6 h 2 min"), or '' when it sent none. */
const took = (ms) => (Number.isFinite(ms) && ms >= 0 ? spanWords(ms) : '');

/**
 * THE RESULT, FIRST (UI audit 2026-11-18 #1): what the card leads with, every figure the stored summary's (the server's, summary-model.js).
 * A hunt: its Level line and the skills it raised, then Level XP (an hour under it), Gold (what the purse kept, its coins and supplies under it) and Kills (the time
 * under it; a called boss counts none, so Time stands there). A TRAINING SESSION (summary-model.js trainingCard): the skill's line from
 * the server's last stop, its XP, what the yard took (the house dummy charges none) and the time, never the hunt's zeros.
 */
export function resultOf(cur) {
  const tr = cur.train;
  if (tr) {
    const skill = skillWord(tr.skill), where = trainedBy(cur.hunt);
    const fee = tr.fee !== null && !(where && where.place !== 'yard');
    return { level: tr.to !== null ? { name: skill, from: tr.from, to: tr.to } : null, ups: [],
      figs: [tr.xp !== null ? { key: 'xp', label: t('training.card_xp', { skill }), value: plus(tr.xp, whole) } : null,
        fee ? { key: 'fee', label: t('training.card_fee'), value: gold(tr.fee) } : null,
        { key: 'ms', label: t('summary.fig_time'), value: took(cur.ms) || whole(null) }].filter(Boolean) };
  }
  const called = !!callOfHunt(cur.hunt);
  return {
    level: cur.lvTo !== null ? { name: t('summary.lv_name'), from: cur.lvFrom, to: cur.lvTo } : null,
    ups: (cur.ups || []).map(([sk, from, to]) => t('summary.skill_up', { skill: skillWord(sk), from, to }))
      /* the standing the hunt earned, per side (the server's standing at its start and end: summary-model.js standingLine) */
      .concat((cur.standing || []).map(([side, ms]) => t('factions.summary_standing', { side: sideName(side), time: standingWords(ms) }))),
    figs: [
      { key: 'xp', label: t('summary.fig_xp'), value: plus(cur.xp, whole), sub: Number.isFinite(cur.xpH) && cur.xpH > 0 ? t('summary.fig_per_hour', { amount: whole(cur.xpH) }) : '' },
      /* GOLD IS WHAT THE PURSE KEPT (post-patch audit 2026-11-18: "Gold +615 gp" beside a hunt whose store food took the purse down): the
         coins less the store's supplies, both under it, the away card's own reading (../result-block.js goldFig); a record with no spend, Coins */
      goldFig(goldKeptOf(cur), cur.gold),
      /* A called boss counts no kill (src/data/boss-calls.js): the reason line says he's down, and "Kills 0" would say he isn't. */
      called ? { key: 'ms', label: t('summary.fig_time'), value: took(cur.ms) || whole(null) }
        : { key: 'kills', label: t('summary.fig_kills'), value: whole(cur.kills), sub: took(cur.ms) ? t('summary.fig_in', { time: took(cur.ms) }) : '' },
    ],
  };
}

/** The bag is at the server's cap and the server sells a next rung. */
function bagFull(cs) {
  const g = bagExpandOf(cs), bag = bagOf(cs);
  return !!(g && g.next && bag && bag.length >= g.cap);
}

/** The skeleton (built once). */
export function renderHuntSummary() {
  return '<div class="hsum">'
    + '<p class="hs-note hsum-none">No finished hunts yet</p>'
    + '<section class="hsum-live"><h3 class="hw-ledger-head is-on">Just now</h3><ul class="hsum-falls hsum-live-falls"></ul></section>'
    + '<section class="hsum-card">'
    + '<header class="hsum-head"><h3 class="hsum-title"></h3><p class="hsum-when"></p></header>'
    /* THE RESULT, FIRST (UI audit 2026-11-18 #1: three chores led the card and every number sat under the fold): the Level line, the three
       figures, then why it ended (../result-block.js, the away card's block too) */
    + resultHtml() + '<p class="hsum-reason"></p><p class="hsum-series" hidden></p><p class="hsum-loss" hidden></p>'
    + climbCardHtml()
    /* TOP LOOT next (first-30 play 2026-11-12: the first gear drop sat under the sticky foot, out of sight) */
    + '<h4 class="hw-ledger-head hsum-h-loot">Top loot</h4><ul class="hsum-list hsum-loot"></ul>'
    /* BACK IN TOWN (UX flow audit 2026-11-11, flow C): the trip home as steps, each one press with its count and value (../back-in-town.js);
       the first open one is the card's one gold press, and a done one stays, ticked. After the result and the loot (UI audit 2026-11-18 #1);
       the window grows to its content, so they are in view as it opens. */
    + '<section class="hsum-town"><h4 class="hw-ledger-head hsum-h-town is-on">' + esc(t('summary.town_head')) + '</h4><ul class="hsum-steps"></ul></section>'
    /* the details, quiet, right over the presses (under them they peeked from below a sticky foot, AW-66) */
    + '<dl class="hsum-stats">' + STATS.map(([k, label]) => '<div class="hsum-stat"><dt>' + label + '</dt><dd data-stat="' + k + '"></dd></div>').join('') + '</dl>'
    /* The presses and their answer stay in reach: the reason and the numbers pushed them under a 1366x768 window's fold, so a hunt that
       ran out of stamina opened with no press in sight (door panel 2026-11-04). */
    + '<div class="hsum-foot"><div class="hsum-actions">'
    /* a tutorial card's next step is a press here, never the gold one (Tyler 2026-11-11: after 4 h the summary's gold button was still
       the first card); the gold press is the first open Back in town step, else "Hunt again" */
    + '<button type="button" class="hh-tool is-link" data-hs-act="coach-next" hidden></button>'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="again">' + t('controls.hunt_again') + '</button>'
    /* after a ground outgrown, the next ground in Hunt again's place: a link (../goto.js), so it is in view as the window opens (audit 2026-11-19 L2);
       shown only as the window's gold press (is-primary below), so it is never drawn as a text link */
    + '<button type="button" class="hh-tool" data-hs-act="next-ground" hidden></button>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="tower" hidden>' + esc(t('tower.end_open')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="tower-climb" hidden>' + esc(t('tower.climb_again')) + '</button>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="bag">' + t('controls.open_bag') + '</button>'
    /* a full bag (the server's cap, hr_bag_expand_view) links to Storage's Expand */
    + '<button type="button" class="hh-tool" data-hs-act="expand" hidden>' + t('controls.expand_bag') + '</button></div>'
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
      text(el.querySelector('small'), x.from === 'store' ? 'from the store' : x.from ? 'from the bag' : '');
      text(el.querySelector('.hsum-n'), '×' + whole(x.n));
    },
  });
}

renderHuntSummary.patch = function patchHuntSummary(body, ctx) {
  const cs = ctx.character;
  const a = attach(cs);
  const sc = scratchOf(cs);
  const root = body.querySelector('.hsum');
  /* THE HUNT ON NOW LEADS (UI audit 2026-11-18: Summary pressed in a hunt showed the hunt before it): its card from the server's analyzer
     (summary-recorder.js liveSummaryOf), the stored ones after it */
  const now = liveSummaryOf(cs);
  /** @type {Array<ReturnType<typeof sanitizeSummaries>[number] & { live?: boolean, since?: number|null }>} */
  const list = [...(now ? [now] : []), ...sanitizeSummaries(summariesOf(cs))];
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
    text(root.querySelector('.hsum-when'), cur.live ? (cur.since ? t('summary.live_when', { time: dayTime(cur.since) }) : t('summary.live_row')) : cur.at ? dayTime(cur.at) : '');
    const st = cur === list[0] && !huntOpen ? staminaOf(cs) : null;
    /* the newest hunt, none open: what the hero did after it, from the server's pointer (../after-hunt.js) */
    /* ...or what came of the choice the hunt carried (a training session it opened is a hunt of its own, so this one is said either way) */
    const after = cur.live ? '' : afterDoneWords(cs, cur.id, nameOf(cs)) || (cur === list[0] && !huntOpen ? endCardAfter(cs, cur.id) : '');
    /* A CLIMB (the Burning Tower) is drawn on the tower with its label rows and keys (../tower-end-card.js, ../tower-words.js climbEnd):
       spat out, never died; the reason line keeps only what the hero did after */
    const tw = towerOf(cs);
    const climb = climbEnd(tw, cur, TOWER_RULES.hunt);
    const why = climb || cur.live ? '' : reasonWords(cur, nameOf(cs), st ? st.msLeft : null, goldFloorOf(cs));
    /* two sentences: the reason may end on a label ("Stamina now: 17 min"), so it takes its full stop before what came after (v0.2.141 gate) */
    text(root.querySelector('.hsum-reason'), [why && after && !/[.!?…]$/.test(why) ? why + '.' : why, after].filter(Boolean).join(' '));
    prop(root.querySelector('.hsum-reason'), 'hidden', !why && !after);
    patchClimbCard(root.querySelector('.hsum-climb'), cs, tw, climb);
    /* its presses: Open chest when it earned keys, Climb again (the Tower window's own door) */
    const toTower = root.querySelector('[data-hs-act="tower"]'), toClimb = root.querySelector('[data-hs-act="tower-climb"]');
    prop(toTower, 'hidden', !climb || !tw || !climb.keys.length);
    prop(toClimb, 'hidden', !climb || !tw);
    /* A Call out series: how many fights the server counted, how many were won, what it charged (hunt-view/boss-loss.js seriesLine). */
    text(root.querySelector('.hsum-series'), cur.series || '');
    prop(root.querySelector('.hsum-series'), 'hidden', !cur.series);
    /* A lost called fight: where it was lost and what answers it (hunt-view/boss-loss.js). */
    text(root.querySelector('.hsum-loss'), cur.loss || '');
    prop(root.querySelector('.hsum-loss'), 'hidden', !cur.loss);
    patchResult(root.querySelector('.hres'), resultOf(cur));
    /* the details: each only when the server sent it, and none on a training card */
    for (const [k, , fmt] of STATS) {
      const dd = root.querySelector('[data-stat="' + k + '"]');
      text(dd, fmt(cur[k]));
      prop(dd.parentNode, 'hidden', !!cur.train || cur[k] === null || cur[k] === undefined);
    }
    cls(root.querySelector('.hsum-stats'), 'is-empty', !!cur.train || STATS.every(([k]) => cur[k] === null || cur[k] === undefined));
    const loot = cur.loot.map(([it, n]) => ({ it, n }));
    cls(root.querySelector('.hsum-h-loot'), 'is-on', loot.length > 0);
    itemLines(root.querySelector('.hsum-loot'), ctx, loot);
    const sup = cur.supplies.map(([it, src, n]) => ({ it, n, from: src === 'store' ? 'store' : 'bag' }));
    cls(root.querySelector('.hsum-h-sup'), 'is-on', sup.length > 0);
    itemLines(root.querySelector('.hsum-sup'), ctx, sup);
    cls(root.querySelector('.hsum-h-deaths'), 'is-on', cur.deaths.length > 0);
    lines(root.querySelector('.hsum-deaths'), ctx.doc, cur.deaths);
    /* a climb or a descent starts only at its own door, the Tower window (hr_tower_start, hr_catacomb_start): Hunt again has nothing to
       send for one */
    const again = runRulesOf(cur.hunt) ? null : huntAgainOf(cur);
    const route = again ? againRoute(partyMembershipOf(cs), again.hunt) : null;
    const go = root.querySelector('[data-hs-act="again"]');
    /* a training card's press opens the Training window on its Start (its own door, hr_training_start) */
    const trainAgain = !!cur.train;
    text(go, trainAgain ? t('training.card_again') : t('controls.hunt_again'));
    prop(go, 'disabled', sc.pending || huntOpen || !again || !route.how);
    /* ...only opens a window, which says itself whether Start can go (a session running, out hunting, the purse): never off for a rule */
    if (trainAgain) prop(go, 'disabled', sc.pending);
    attr(go, 'title', trainAgain ? t('training.card_again_title') : huntOpen ? 'A hunt is already running' : !again ? againOffWords(cur) : route.why || 'Same ground, bar and limits');
    /* Hunt again off says why on the line under it, not only in a title (say-why). */
    againWhy = trainAgain ? '' : huntOpen ? 'Hunt again off: a hunt is already running' : !again ? 'Hunt again off: ' + againOffWords(cur) : route.why ? 'Hunt again off: ' + route.why : '';
    const card = huntOpen ? null : nextStepOf(ctx);
    const next = root.querySelector('[data-hs-act="coach-next"]');
    prop(next, 'hidden', !card);
    text(next, card ? 'Next: ' + card.title : '');
    /* the steps are about the bag NOW: the newest hunt's card only, with no hunt running */
    const town = cur === list[0] && !huntOpen ? townOf(cs, sc, cur.id) : { steps: [], primary: 'again' };
    patchTown(root, ctx, sc, town);
    cls(go, 'is-primary', town.primary === 'again');
    /* A GROUND OUTGROWN (audit 2026-11-19 L2, played at 1440x900: the window led with a greyed Hunt again and "Hunt again off: Ground
       outgrown", the Next ground row under the sticky foot): the foot's gold press is that ground, Show's own link, and Hunt again goes */
    const way = town.primary === 'ground' ? town.steps.find((s) => s.id === 'ground') : null;
    const toGround = root.querySelector('[data-hs-act="next-ground"]');
    text(toGround, way ? t('summary.go_ground', { ground: way.name }) : '');
    attr(toGround, 'data-hs-goto', way ? gotoKey(targetOf(way.place)) : null);
    prop(toGround, 'hidden', !way);
    cls(toGround, 'is-primary', !!way);
    /* a phone's stacked sheet puts the foot above the steps then (summary.css), so the press is in view as it opens */
    cls(root.querySelector('.hsum-card'), 'is-onward', !!way);
    if (way) againWhy = '';
    /* A CLIMB'S CARD: its next move is the Tower window (the chest when it gave keys), so that is the card's press; no Hunt again */
    if (climb) {
      prop(go, 'hidden', true);
      cls(toTower, 'is-primary', town.primary === 'again' && climb.keys.length > 0);
      cls(toClimb, 'is-primary', town.primary === 'again' && !climb.keys.length);
      againWhy = '';
    } else prop(go, 'hidden', !!cur.live || !!way);
    /* the hunt on now has no Hunt again: it is the hunt */
    if (cur.live) againWhy = '';
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
      text(el.querySelector('small'), [s.live ? t('summary.live_row') : dayTime(s.at), s.kills !== null ? whole(s.kills) + ' kills' : ''].filter(Boolean).join(', ') + (s.reason ? '. ' + endWords(s.reason, s.forfeit, s.by, nameOf(cs), s.why, s.hunt).split('. ')[0].replace(/\.$/, '') : ''));
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
      const want = s.done ? 'done' : s.icon ? 'item:' + s.icon : s.glyph || 'shield';
      if (ico.getAttribute('data-ico') !== want) { ico.setAttribute('data-ico', want); ico.innerHTML = s.done ? glyphSvg(ctx.glyphs, 'uiCheck') : s.icon ? itemIconHtml(ctx.glyphs, s.icon) : glyphSvg(ctx.glyphs, s.glyph || 'uiShield'); }
      text(el.querySelector('b'), s.title);
      text(el.querySelector('small'), s.words);
      const btn = el.querySelector('button');
      prop(btn, 'hidden', s.done);
      prop(btn, 'disabled', sc.pending);
      text(btn, s.verb);
      /* THE NEXT BUY's Show is a link (goto.js): it opens the window where the buy is made, on its row, and sends nothing */
      attr(btn, 'data-hs-goto', s.place ? gotoKey(targetOf(s.place)) : null);
      /* ...and a hero slot's opens the Characters screen, where slots are bought (the app's own door, boot.js data-app="characters") */
      attr(btn, 'data-app', s.place && s.place.kind === 'characters' ? 'characters' : null);
      /* ...never the next ground's Show: the foot carries that press (Go to <ground>), so the window keeps one gold press */
      cls(btn, 'is-primary', town.primary === s.id && s.id !== 'ground');
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
  const town = townOf(cs, sc, cur.id);
  const s = town.steps.find((x) => x.id === step && !x.done);
  if (!s || sc.pending) return;
  const mark = (r) => { if (r && (r.ok || r.moved > 0)) { didOf(sc, cur.id).set(step, s.title); repaint(); } };
  if (step === 'equip') { equipUpgrades(cs, sc, repaint, { ops: s.ops }).then(mark); return; }
  if (step === 'sell') {
    const lines = s.lines, fresh = s.fresh || [];
    runIntent(sc, repaint, () => cs.edgeIntent('vendor_sell_many', { lines }), t('summary.selling'),
      (r) => (r && Number.isSafeInteger(r.paid) ? t('summary.sold', { gold: gold(r.paid) }) : t('summary.sold_plain')), cs).then((r) => {
      /* the junk it sold with no plan is what "Always sell these" offers next, once the server has taken the sale */
      if (r && r.ok && fresh.length) sc.sold = { id: cur.id, items: fresh.slice() };
      mark(r);
    });
    return;
  }
  /* ALWAYS SELL THESE: the plan Sell on each, one hr_loot_rule_set an item; the row reads the re-read plans, so it is done when the server says Sell */
  if (step === 'always') {
    const items = s.items || [];
    runIntent(sc, repaint, () => alwaysSell(cs, items), t('summary.always_busy'), (r) => t('summary.always_done', { count: r.set }), cs).then(mark);
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
  /* a climb's card: the Tower window, on the Chest (Open chest) or the Climb (Climb again) */
  if (action === 'tower' || action === 'tower-climb') {
    const list = sanitizeSummaries(summariesOf(cs));
    const cur = list.find((s) => s.id === sc.pick) || list[0];
    if (towerOf(cs) && climbEnd(towerOf(cs), cur, TOWER_RULES.hunt)) ctx.wm.openTab('tower', action === 'tower' ? 'chest' : 'climb');
    return true;
  }
  if (action === 'expand') { ctx.show('storage'); return true; }
  if (action === 'again') {
    const list = summariesOf(cs);
    const cur = list.find((s) => s.id === sc.pick) || list[0];
    if (cur && cur.train) { ctx.show('training'); return true; }
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
    runIntent(sc, repaint, () => warnPartyGround(ctx.account, cs, hunt), 'Telling the party…',
      () => underWords(row, low.under) + ', party warned', cs).then(() => { sc.warned = warned; repaint(); });
    return;
  }
  sc.warned = null;
  runIntent(sc, repaint, () => startPartyHunt(ctx.account, cs, hunt), 'Gathering the party for ' + huntName(hunt) + '…', () => 'Party heading to ' + huntName(hunt), cs);
}
