// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunts.js — HUNTS: WHERE TO GO, AND THE ONE PRESS THAT GOES.
//
// Tyler's first playtest (10-18): "It's not obvious how I go to hunts; clicking
// the cellar does nothing." This window is the answer, one gesture from
// anywhere: its launcher is the first icon, its key is H, and a hunt's door in
// the World (the mill hatch) opens it with that hunt picked
// (src/app/world-pane.js turns the World's `entrance` into pickHunt + open).
//
// MASTER-DETAIL (designer plan 2026-10-22, B #1; Tyler 10-22: "the 'Hunts' page
// could use some work"). The list is one LINE per hunt ground (src/shell/hunt-list.js,
// from the data rows): its name, its band against the hero's Level in words and a
// tone, a solo / party glyph, this hero's best Level XP an hour there (or "No best yet"),
// and "Right for your level" on the recommendation's line. The picked ground gets ONE
// page beside it (src/shell/windows/hunt-detail.js: its theme, who lives there,
// the rare and its carrier, the hero's bests), then the pull size, and the
// window's one primary, Enter. On a phone the list comes first and a pick opens
// the page in its place, with a way back.
// Enter is ONE hr_hunt_enter; the server checks the band, the stamina and the
// stock, and the hunt shows only from the re-read envelope. A hunt above the
// character's level says what it risks (hunt-list.js rangeWords) and asks one
// confirm press; nothing refuses a Level (Tyler 2026-11-04 UTC).
//
// IN A PARTY (PARTY_SPEC.md §1.5, Tyler 10-19) the ground is chosen HERE, at
// Start: the leader's Enter reads "Enter with party" and is ONE
// hr_hunt_party_start naming the picked hunt; everyone walks in together, each
// with their own saved setup, or nobody, and the answer names who was not
// ready. A member's Enter stays off ("the leader starts the hunt"). The party
// size is the server's seat count; the picked ground's party rule (its row's
// forParty pocket and boss) shows on its page.
//
// THE RISK is chosen with the hunt, before Enter (company-pane.js: Careful, Steady or Bold on the picked ground's page, ONE
// hr_hunt_risk_set each, the page changing only from the envelope the answer carries). IN A PARTY THE LEADER CHOOSES (Tyler
// 2026-10-20): a member reads its leader's Risk with the picks off, and the server refuses a member's press (not_leader).
// ════════════════════════════════════════════════════════════════════════
import { huntOf, huntBagOf, settingsOf, huntBestsOf } from '../../session/hunt-sections.js';
import { bagOf, equipmentOf, blessingsOf } from '../../session/item-sections.js';
import { wornWeightOf } from '../hunt-ground-facts.js';
import { levelOf as levelRowOf } from '../../session/character-sections.js';
import { huntName, partyMembershipOf } from '../../session/party-sections.js';
import { startPartyHunt, settleTownActivity, inviteOwn, warnPartyGround } from '../../session/party-intents.js';
import { leaveOrDisband } from '../widgets/party-panel.js';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js';
import { whole, sepHtml, withSeps } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { itemNameFor, revealInWindow } from '../widgets/bits.js';
import { glyphSvg } from '../launcher.js';
import { runIntent } from '../intent-words.js';
import { huntRows, packWords, rangeWords, heroWords, packFor, bestLine, fitWords, ABOVE_LEVEL_WORDS, recommendation, adviceLevels, openingPick, adviceTag, seatsUnder, underWords, shareWords, seatsOutgrown, outgrownWords } from '../hunt-list.js';
import { nextStepUp } from '../../data/hunt-tutorial.js';
import { detailHtml, patchGround, goHtml, patchGo } from './hunt-detail.js';
import { setupsOf, beforeLines, freeHeroes, FOOD_WEAK_ID, partiedHeroes, openOthers } from '../hunt-go.js';
import { tallyOf, heldOn, tallyLine } from '../../session/tally-sections.js';
import { callHtml, patchCall, actCall, callRefusal } from './boss-call-pane.js';
import { callFromGround } from '../../data/boss-calls.js';
import { hallHtml, patchHall, actHall, hallRefusal } from './boss-hall-pane.js';
import { hallFromGround } from '../../data/boss-halls.js';
import { rowLines } from '../live-events-view.js';
import { patchParts } from '../goto.js';
import { t } from '../../render/player-text.js';
import { trainingPhrase } from '../../session/training-sections.js';
import { patchAfter, actAfter } from './hunt-after-pane.js';
import { planHtml, patchPlan, actPlan, PLAN_ACTS, goAsOf, stanceHtml, patchStance } from './company-pane.js';

const SCRATCH = new WeakMap();
/* `paged`: on a phone, the picked ground's page is open in place of the list. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, auto: false, pending: false, msg: '', paged: false }; SCRATCH.set(cs, s); } return s; };

/** Pick a hunt in this character's Hunts window (the World's door does, before it opens the window). */
export function pickHunt(cs, hunt) {
  if (!cs) return;
  const sc = scratchOf(cs);
  if (huntRows().some((r) => r.hunt === hunt)) { sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; }
}

/** The ground this character's Hunts window has picked, or null before the window has picked one (the bar's First target in town). */
export function pickedHuntOf(cs) {
  const sc = cs ? SCRATCH.get(cs) : null;
  return sc && sc.pick ? sc.pick : null;
}

/* The character's Level as the server states it (the envelope's `level` block), or null. */
function levelOf(cs) {
  const lv = levelRowOf(cs);
  return lv ? lv.level : null;
}

/**
 * WHY THIS HERO'S ENTER IS OFF, or '' when it is live: a party member's belongs to its leader (the server refuses it: not_party_leader). No Level ever turns it off. Pure.
 */
export function enterOffWords(party) {
  if (party && !party.isLeader) return t('hunts.off_follower', { leader: party.leaderName || t('hunts.your_leader') });
  return '';
}

/* What a warning covered: this ground and these seats (none, for a hero alone or a leader who alone stands under it). Someone who sits down under the floor afterwards has not been told. */
const warnKey = (hunt, seats) => hunt + ':' + seats.map((s) => s.seat).join();

/* The setup Enter goes as: the one picked under Go as while the server still lists it, else the ground's own (the server's pointer,
   company-pane.js), else the one in use. */
function chosenOf(sc, setups, pointer) {
  if (!setups || !setups.length) return null;
  const p = setups.find((x) => x.preset === sc.goAs) || setups.find((x) => x.preset === pointer) || setups.find((x) => x.inUse) || setups[0];
  return p.preset;
}

/**
 * ENTER AS THE CHOSEN SETUP (A #1): ONE press. A town activity is settled first (what it earned is paid);
 * when the chosen setup is not the one on, ONE hr_hunt_preset_apply puts it on (the server wears its gear
 * and switches the bar) and a refusal stops there, in words; then `go()` (hr_hunt_enter, or the leader's start).
 */
async function asChosen(cs, sc, go) {
  await settleTownActivity(cs);
  const s = settingsOf(cs);
  const want = chosenOf(sc, setupsOf(cs), goAsOf(cs, sc.pick));
  if (s && Number.isInteger(want) && want !== s.preset) {
    const a = await cs.applyPreset(want);
    if (!a || !a.ok) return a || { ok: false, error: 'network' };
  }
  sc.goAs = null;
  return go(Number.isInteger(want) ? want : (s ? s.preset : 0));
}

/* The hunt under way: what its hunt bag holds now (the server's; Enter moved it out of the bag, Brannoc 10-22). */
function carriedWords(lines) {
  if (!lines.length) return t('hunts.bag_empty');
  return t('hunts.bag_holds', { items: lines.map((l) => whole(l.qty) + ' ' + itemNameFor(l.id, l.qty)).join(', ') });
}

/** The skeleton (built once per opening): the notes, then the list beside the picked ground's page. A fresh opening
 *  forgets an Enter the player pressed in an earlier one (its close is spent or moot). */
export function renderHunts(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.closeOnHunt = false; sc.shown = null; }
  return '<div class="hw-hunts">'
    + '<p class="hs-note hw-hunts-now"></p><p class="hs-note hw-hunts-reco" hidden></p>'
    + '<div class="hw-hunts-cols"><ul class="hw-hunt-list" role="listbox" aria-label="' + t('hunts.win_list') + '"></ul>'
    /* The page scrolls in its own box and Enter stands below it (windows.css), never over the lineup or the drops. */
    + '<section class="hw-hunt-detail" aria-label="' + t('hunts.win_page') + '"><div class="hw-hd-page">' + detailHtml()
    + '<h4 class="hw-hd-h">' + t('hunts.head_packs') + '</h4><div class="hw-pull"><p class="hw-hunt-facts"></p></div>' + stanceHtml()
    + '<p class="hw-hunt-pack"></p>' + goHtml() + callHtml() + hallHtml() + '</div>'
    + '<div class="hw-hd-foot"><p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<p class="hw-enter-why"></p>' + planHtml() + '<button type="button" class="hh-tool" data-hs-act="leave-party" hidden>' + t('controls.leave_party') + '</button>'
    + '<button type="button" class="hw-primary is-on hw-hunt-enter" data-hs-act="enter">' + t('controls.enter') + '</button></div>'
    + '</section></div></div>';
}

/* One ground's line: who may come, the name, the band in words, the advice and the best. Every ground takes one hero or a group
   (Tyler 2026-11-08: no ground is solo or party), so the glyph is the same on every line. */
function lineHtml(r, glyphs) {
  return '<li class="hw-hunt" role="option" data-hs-act="pick" data-hunt="' + esc(r.hunt) + '" tabindex="-1">'
    + '<span class="hw-hunt-glyph" title="' + esc(heroWords(r)) + '">' + glyphSvg(glyphs, 'uiPeople') + '</span>'
    + '<span class="hw-hunt-main"><b class="hw-hunt-name">' + esc(r.name) + '</b>'
    + '<small class="hw-hunt-band"><span class="hw-hunt-lv">' + t('hunts.level_band', { lo: r.band[0], hi: r.band[1] }) + '</span>' + sepHtml('hw-hunt-sep', true) + '<span class="hw-hunt-fit"></span></small>'
    /* a reader gets a space between the parts (it got "Level 1–8In range"); the dot never starts or ends a line (format.js sepHtml) */
    + '<small class="hw-hunt-sub"><span class="hw-hunt-fits"></span>' + sepHtml('hw-hunt-sep', true) + '<span class="hw-hunt-bestline"></span></small>'
    + '<small class="hw-hunt-tally"></small><span class="hw-hunt-events"></span></span></li>';
}

renderHunts.patch = function patchHunts(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  /* a link that named a ground (src/shell/goto.js: "Dropped by Rat at Mill Cellar") picks it */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('hunts') : null;
  if (want) pickHunt(cs, want);
  const root = body.querySelector('.hw-hunts');
  const list = huntRows();
  const h = huntOf(cs);
  const now = h && !h.ended ? h : null;
  /* THE WAY IN, CLEARED (designer playtest 2026-10-24: after Enter this window stayed over the hunt, on the phone the
     whole sheet, and the two cards that explain the fight were never seen): once the SERVER's hunt section says the
     hero is hunting after an Enter pressed here, the window closes and the hunt is in view. Opening it again while
     hunting keeps it open (it says where the hero is). */
  /* ...AND THE WINDOW WHOSE LINK OPENED IT (QA audit 2026-11-18 N12: the Tally stayed over the hunt after Enter from its link): its work is done once the hunt runs. */
  if (sc.closeOnHunt && now) {
    sc.closeOnHunt = false;
    const by = typeof ctx.wm.backTo === 'function' ? ctx.wm.backTo('hunts') : null;
    /* never Chat at its home (a crier's link): it is the player's corner, not a step on the way, and its close would be their pick */
    queueMicrotask(() => { ctx.wm.close('hunts'); if (by && by !== 'hunts' && !(ctx.wm.row(by) || {}).home) ctx.wm.close(by); });
  }
  const level = levelOf(cs);
  const party = partyMembershipOf(cs);
  const size = party ? party.seats.length : 1;
  const follower = !!party && !party.isLeader;
  /* The advice reads the server's levels: this hero's, or every seat's in its party (the party's levels pick). */
  /* This hero's personal bests, the server's (hunt_bests); null = the server sent none, the lines stay empty. */
  const bests = huntBestsOf(cs);
  const rec = recommendation(adviceLevels(level, party), size, list, bests);
  /* Until the player picks a line by hand the pick FOLLOWS the advice (lane/b-first-hour: the Cellar, picked for a
     Level 1 hero, stayed picked at Level 5 for the rest of the session while the coach sent the hero to the Thicket). */
  if ((!sc.pick || sc.auto) && list.length) { sc.pick = openingPick(rec, list, h ? { huntId: h.huntId, endReason: h.ended ? h.endReason : null } : null).hunt; sc.auto = true; }
  const tally = tallyOf(cs);
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  /* a hero at the yard is training, not hunting there (post-140 audit C7: "Hunting in Training Yard. Leave to switch hunts"): its press is Stop */
  const trains = now ? trainingPhrase(now.huntId) : null;
  text(nowEl, trains ? t('training.busy_hunts', trains) : now ? t('hunts.lead_hunting', { ground: huntName(now.huntId) })
    : follower ? t('hunts.lead_follower') : party ? t('hunts.lead_party') : t('hunts.lead_solo'));
  /* The how-to (not a running hunt) gives its room to the ground's page on the phone sheet. */
  cls(nowEl, 'is-hint', !now);
  /* No ground built for this group holds its level: said plainly (the pick is the nearest below). */
  const reco = root.querySelector('.hw-hunts-reco');
  const advice = !now && !follower && rec.note ? rec.note : '';
  text(reco, advice);
  prop(reco, 'hidden', !advice);
  /* The advice speaks for the how-to while it shows (a hero past its first grounds): its line goes to the page, so the first
     row of creatures stands whole on a short screen (Tyler 2026-11-11, 1014x652). */
  cls(nowEl, 'is-advised', !now && !follower && !party && !!advice);
  /* The advice's two tags: the safe ground, and the harder one above it (the lowest Level in a party, who the warning is for). */
  const step = nextStepUp(list, party ? Math.min(...party.seats.map((s) => (s.seat === party.me ? level : s.level)).filter(Number.isInteger)) : level, !party);
  rows(root.querySelector('.hw-hunt-list'), list, {
    key: (r) => r.hunt,
    build: (r) => element(ctx.doc, lineHtml(r, ctx.glyphs)),
    patch: (li, r) => {
      const on = sc.pick === r.hunt;
      cls(li, 'is-picked', on);
      attr(li, 'aria-selected', String(on));
      const fit = fitWords(r, level);
      const band = li.querySelector('.hw-hunt-fit');
      text(band, fit ? fit.words : '');
      attr(band, 'data-tone', fit ? fit.tone : null);
      prop(band.previousElementSibling, 'hidden', !fit || !fit.words);
      const tag = adviceTag(r, rec, step), best = bestLine(bests, r.hunt) || '';
      text(li.querySelector('.hw-hunt-fits'), tag);
      text(li.querySelector('.hw-hunt-bestline'), best);
      prop(li.querySelector('.hw-hunt-sub .hw-hunt-sep'), 'hidden', !tag || !best);
      /* Tamsin's tallies held on this ground, the server's count ("Gray Wolves 112/200"). */
      patchParts(li.querySelector('.hw-hunt-tally'), withSeps(heldOn(tally, r.hunt).map(tallyLine)));
      /* A live event on this ground or its boss, the server's (live-events-view.js rowLines): Open Halls frees its call out. */
      rows(li.querySelector('.hw-hunt-events'), rowLines(cs, r.hunt), {
        key: (l) => l.id,
        build: () => element(ctx.doc, '<small class="hw-hunt-event"><b></b></small>'),
        patch: (s, l) => text(s.querySelector('b'), l.words),
      });
    },
  });
  /* The line the window opens on stands in view: it can be the last on the list (openingPick). */
  if (sc.shown !== sc.pick) { sc.shown = sc.pick; revealInWindow(root.querySelector('.hw-hunt[data-hunt="' + sc.pick + '"]')); }
  const r = list.find((x) => x.hunt === sc.pick) || null;
  cls(root, 'is-paged', sc.paged && !!r);
  const det = root.querySelector('.hw-hunt-detail');
  prop(det, 'hidden', !r);
  if (r) patchPage(det, ctx, sc, { r, level, size, party, follower, now, bests });
  cls(root, 'is-pending', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

/* THE PICKED GROUND'S PAGE: its facts (hunt-detail.js), the warning, the pull size, what it carries, Enter. */
function patchPage(det, ctx, sc, v) {
  const { r, level, size, party, follower, now } = v;
  const cs = ctx.character;
  patchGround(det, ctx, r, { level, size, bests: v.bests, worn: wornWeightOf(equipmentOf(cs) || {}), allLoot: sc.allLoot === r.hunt, repaint: () => ctx.refresh('hunts') });
  /* the floor is a warning (Tyler 2026-11-04 UTC): this hero's own gap, and a leader's every seat's too. The first press of Enter arms the one confirm (renderHunts.act). */
  const under = party && !follower ? seatsUnder(r, party).under : [];
  /* the death line says the share a death would really take with the Blessings the server says are on (designer re-read 2026-11-11) */
  const blessed = blessingsOf(cs);
  text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level, blessed ? blessed.permille : 0), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join('\n'));
  /* While a hunt runs, its own page says what its hunt bag holds (in town, Before you go says what the bar spends). */
  const carried = now ? huntBagOf(cs) : null;
  text(det.querySelector('.hw-hunt-pack'), now && now.huntId === r.hunt && carried ? carriedWords(carried) : '');
  /* GO AS, BEFORE YOU GO, WITH A PARTY: the server's setups, bar, stamina and gold, and this account's open heroes. */
  const setups = setupsOf(cs);
  const chosen = chosenOf(sc, setups, goAsOf(cs, r.hunt));
  const other = (setups || []).find((p) => p.preset === chosen && !p.inUse);
  const before = now ? [] : beforeLines(cs, { hunt: r.hunt, other: other ? other.name : null });
  patchGo(det, ctx, {
    setups, chosen, off: sc.pending || !!now || follower,
    before,
    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {
      why: party ? t('hunts.party_lead', { n: party.seats.length }) : heroWords(r),
      invite: t('hunts.party_invite'),
      bring: freeHeroes(cs, ctx.peers()), away: partiedHeroes(cs, ctx.peers()), others: openOthers(cs, ctx.peers()), full: !!party && party.full,
    } : null,
  });
  /* WHEN THE HUNT ENDS: each hero's own choice, a party member's too (the leader picks the hunt, never where a friend goes after it). */
  patchAfter(det, ctx, { off: sc.pending, now: !!now });
  patchPlan(det, ctx, { hunt: r.hunt, pending: sc.pending });
  /* THE RISK on a ground of the Danger scale, and the depth this hero last held there (company-pane.js). */
  patchStance(det, ctx, { hunt: r.hunt, follower, pending: sc.pending });
  patchCall(det, ctx, { hunt: r.hunt, party, now, pending: sc.pending });
  patchHall(det, ctx, { hunt: r.hunt, party, now, pending: sc.pending, other: !!other });
  const enter = det.querySelector('.hw-hunt-enter');
  attr(enter, 'data-hunt', r.hunt);
  const armed = sc.warned === warnKey(r.hunt, under) && (under.length > 0 || !!rangeWords(r, level));
  text(enter, party && !follower ? (armed ? t('controls.enter_anyway') : t('controls.enter_with_party')) : armed ? t('controls.enter_anyway') : t('controls.enter'));
  /* Enter (Go as, Find a party and Bring are patchGo's: off for a member too). */
  for (const b of det.querySelectorAll('.hw-hd-foot button')) prop(b, 'disabled', sc.pending || !!now);
  /* ENTER OFF SAYS WHY, BESIDE IT (midgame panel 2026-11-01: a hero sent home by a friend's death, left in the party, read "the game is broken"), with the way out. */
  /* ...and a ground this hero or a seat has outgrown (blind playthrough 2026-11-19, P1: a Level 5 leader's Enter with party stayed on for the
     Cellar and the refusal blamed the friend), by the server's Levels */
  const grown = follower ? [] : seatsOutgrown(r, party, level);
  const off = now ? '' : enterOffWords(party) || outgrownWords(r, grown, party);
  if (off) prop(enter, 'disabled', true);
  text(det.querySelector('.hw-enter-why'), off);
  prop(det.querySelector('[data-hs-act="leave-party"]'), 'hidden', now || !follower);
  /* The packs as the ground is built (on the Danger scale a pull grows with the depth the party holds: the Risk's lines say it). */
  text(det.querySelector('.hw-hunt-facts'), packWords(r, null));
}

renderHunts.act = function actHunts(ctx, body, action, ev, el) {
  /* When the hunt ends: the one select on the page (its change, not a click). */
  if (action === 'after') {
    const sc0 = scratchOf(ctx.character);
    const again = () => renderHunts.patch(body, ctx);
    return actAfter(ctx, action, ev, el, (send) => runIntent(sc0, again, send, t('away.saving'), () => '', ctx.character));
  }
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHunts.patch(body, ctx);
  /* Presses; and the Call out slider, which answers as it moves (an `input` a step, a `change` on release: boss-call-pane.js). */
  if (ev.type !== 'click' && !(action === 'call-fights' && (ev.type === 'input' || ev.type === 'change'))) return false;
  const hunt = el.getAttribute('data-hunt');
  /* To a ground's page and back: the header's Back follows the page AT ONCE (the shell's refresh paints both), not on its next display tick. */
  const repage = () => (typeof ctx.refresh === 'function' ? ctx.refresh('hunts') : repaint());
  if (action === 'pick') {
    /* Another ground's page opens at its top, not where the last one was scrolled to. */
    const page = body.querySelector('.hw-hd-page');
    if (sc.pick !== hunt && page && page.scrollTop) page.scrollTop = 0;
    sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; repage();
    return true;
  }
  if (action === 'back') { sc.paged = false; repage(); return true; }
  /* "+N more" under a ground's loot: the rest of its rows (display scratch, this ground's only) */
  if (action === 'loot-more') { sc.allLoot = sc.pick; repaint(); return true; }
  /* Go as is the ground's Setup, "Go here at the next Start" the plan's ground, and the Risk on a Danger scale ground (company-pane.js): one intent each. */
  if (PLAN_ACTS.includes(action)) return actPlan(ctx, sc, repaint, action, el);
  /* Invite a player: the Party window, whose name box sends the invite (there is no party finder: GR-69, FB-12). */
  if (action === 'party-invite') { ctx.show('hunt-party'); return true; }
  /* Hunt prep (the door under Go as), opened from here so its Back comes back to this ground (window-manager.js from) */
  if (action === 'go-prep') { ctx.wm.open('hunt-prep'); return true; }
  if (action === 'bring') {
    const slot = Number(el.getAttribute('data-slot'));
    const who = freeHeroes(cs, ctx.peers()).find((x) => x.slot === slot);
    if (who) runIntent(sc, repaint, () => inviteOwn(ctx.account, cs, slot), t('hunts.bringing', { name: who.name }), () => t('hunts.joined', { name: who.name }), cs);
    return true;
  }
  /* An Enter the server took closes this window once its hunt section shows the hunt (patchHunts). */
  const thenClose = (r) => { if (r && r.ok) { sc.closeOnHunt = true; repaint(); } };
  /* A CONFIRM OPENS IN VIEW (QA audit 2026-11-18 N3: the call-out's warning opened under the press, below the page's fold and cut by the
     Enter foot, so "Call him out once" had to be found): once drawn, the page scrolls to it, its buttons at least. */
  const inView = () => { const w = action === 'call-warn' || action === 'hall-warn' ? el.closest('.hw-hd-call').querySelector('.hw-call-warn.is-on') : null; if (w) revealInWindow(w); return true; };
  /* Call out: its section's presses, run as the setup Go as chose; its refusals read the designer's words. */
  const called = callFromGround(sc.pick);
  if (actCall(ctx, action, repaint, (send, busy, done) => runIntent(sc, repaint, () => asChosen(cs, sc, send), busy, done, cs).then((r) => {
    const said = r && !r.ok && called ? callRefusal(r, called) : null;
    if (said) { sc.msg = said; repaint(); }
    thenClose(r);
    return r;
  }), el)) return inView();
  /* A keyed hall: its section's presses, the same way; its refusals read its own words, with the key's name. */
  const hall = hallFromGround(sc.pick);
  if (actHall(ctx, action, repaint, (send, busy, done) => runIntent(sc, repaint, () => asChosen(cs, sc, send), busy, done, cs).then((r) => {
    const said = r && !r.ok && hall ? hallRefusal(r, hall) : null;
    if (said) { sc.msg = said; repaint(); }
    thenClose(r);
    return r;
  }))) return inView();
  if (action === 'leave-party') { leaveOrDisband(ctx, cs, sc, repaint, 'leave'); return true; }
  if (action === 'enter' && partyMembershipOf(cs)) {
    sc.pick = hunt;
    const lead = partyMembershipOf(cs);
    if (!lead.isLeader) return true;
    /* A seat under this ground's floor hears it first: the first press tells them and arms "Enter anyway", the second goes (panel 2026-11-01, designer's list).
       A leader alone under it has already read the words on this page: the press only arms. */
    const row = huntRows().find((x) => x.hunt === hunt);
    const low = row ? seatsUnder(row, lead) : { under: [] };
    if (low.under.length && sc.warned !== warnKey(hunt, low.under)) {
      runIntent(sc, repaint, () => warnPartyGround(ctx.account, cs, hunt), t('hunts.telling'),
        () => underWords(row, low.under) + ' · ' + t('hunts.party_warned'), cs).then(() => { sc.warned = warnKey(hunt, low.under); repaint(); });
      return true;
    }
    if (!low.under.length && row && rangeWords(row, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {
      sc.warned = warnKey(hunt, []);
      sc.msg = t('hunts.enter_anyway_hint');
      repaint();
      return true;
    }
    sc.warned = null;
    runIntent(sc, repaint, () => asChosen(cs, sc, () => startPartyHunt(ctx.account, cs, hunt)), t('hunts.gathering', { ground: huntName(hunt) }),
      () => t('hunts.party_on_way', { ground: huntName(hunt) }), cs).then(thenClose);
    return true;
  }
  if (action === 'enter') {
    sc.pick = hunt;
    /* A ground above this hero asks once: the first press arms "Enter anyway" under the words that say what it risks, the second goes. */
    const above = huntRows().find((x) => x.hunt === hunt);
    if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {
      sc.warned = warnKey(hunt, []);
      sc.msg = t('hunts.enter_anyway_hint');
      repaint();
      return true;
    }
    sc.warned = null;
    /* What the hunt carries is the bag's own supplies, read after any setup change has landed. */
    runIntent(sc, repaint, () => asChosen(cs, sc, (preset) => cs.enterHunt(hunt, packFor(bagOf(cs)), preset)), t('hunts.setting_off', { ground: huntName(hunt) }), (res) => { sc.enterMsg = t('hunts.on_way', { ground: huntName(hunt) }) + (res && res.belowRange ? '. ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; }, cs)
      .then(thenClose);
    return true;
  }
  return false;
};

/* The DOM events beyond click and change: the Call out series' slider follows the thumb (boss-call-pane.js; shell.js onExtra routes only
   the types a renderer names). */
renderHunts.events = Object.freeze(['input']);

/* The header's Back (src/shell/window-head.js): on a phone, a ground's page goes back to the list. */
renderHunts.inner = (ctx, body) => (ctx.isPhone() && body.querySelector('.is-paged') ? 'back' : null);
