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
// THE TIER is chosen with the hunt, before Enter (Tyler 2026-11-04; hunt-tiers.js): Normal, Dangerous or
// Deadly, three buttons on the picked ground's page where it offers more than Normal. It sets how many monsters
// a pull brings and how hard they hit; there is no other dial. A press moves the choice AT ONCE, marked
// "Saving..." (Tyler 10-20: the round trip per press was "incredibly laggy"): presses inside TIER_SAVE_MS coalesce
// into ONE hr_hunt_tier_set carrying the last value, and the server's answer (the re-read hunt_tier) replaces the
// draft; a refusal shows the server's value again and why. Nothing spends the draft (CLAUDE.md §6): Enter / Start
// with party first waits for the save. The pick is the hero's own PER GROUND (remembered per hunt, never part of a
// setup), so each page says what THAT ground's pick spawns.
// IN A PARTY THE LEADER CHOOSES (Tyler 2026-10-20): the leader's pick holds for everyone; a member sees it
// read-only ("Set by <leader>: Dangerous", the server's `leader_tiers`) with no buttons, and the server refuses a
// member's pick (hr_hunt_tier_set `not_leader`).
// ════════════════════════════════════════════════════════════════════════
import { huntOf, huntBagOf, settingsOf, huntBestsOf, huntTierOf } from '../../session/hunt-sections.js?v=0.2.129';
import { bagOf, equipmentOf, blessingsOf } from '../../session/item-sections.js?v=0.2.129';
import { wornWeightOf } from '../hunt-ground-facts.js?v=0.2.129';
import { levelOf as levelRowOf } from '../../session/character-sections.js?v=0.2.129';
import { huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.129';
import { startPartyHunt, settleTownActivity } from '../../session/party-intents.js?v=0.2.129';
import { leaveOrDisband } from '../widgets/party-panel.js?v=0.2.129';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.129';
import { whole } from '../../render/format.js?v=0.2.129';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.129';
import { itemName, revealInWindow } from '../widgets/bits.js?v=0.2.129';
import { glyphSvg } from '../launcher.js?v=0.2.129';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.129';
import { HUNT_GROUNDS } from '../../data/hunt-grounds.js?v=0.2.129';
import { TIER_IDS, TIER_NAME, TIER_LINES, DEFAULT_TIER, tiersOf } from '../../data/hunt-tiers.js?v=0.2.129';
import { huntRows, packWords, tierPull, tierWords, tierChoiceWords, rangeWords, heroWords, packFor, bestLine, fitWords, ABOVE_LEVEL_WORDS, recommendation, openingPick, adviceTag, seatsUnder, underWords, shareWords } from '../hunt-list.js?v=0.2.129';
import { nextStepUp } from '../../data/hunt-tutorial.js?v=0.2.129';
import { detailHtml, patchGround, goHtml, patchGo } from './hunt-detail.js?v=0.2.129';
import { setupsOf, beforeLines, freeHeroes } from '../hunt-go.js?v=0.2.129';
import { inviteOwn, warnPartyGround } from '../../session/party-intents.js?v=0.2.129';
import { openFinderOn } from './party-finder.js?v=0.2.129';
import { tallyOf, heldOn, tallyLine } from '../../session/tally-sections.js?v=0.2.129';
import { callHtml, patchCall, actCall, callRefusal } from './boss-call-pane.js?v=0.2.129';
import { callFromGround } from '../../data/boss-calls.js?v=0.2.129';
import { rowLines } from '../live-events-view.js?v=0.2.129';
import { t } from '../../render/player-text.js?v=0.2.129';

const SCRATCH = new WeakMap();
/* `draft` is the tier shown before the server has it ({ hunt, tier }), `timer` its coalescing
   wait, `saving` the save in flight (its promise: Enter waits on it). `paged`: on a phone, the
   picked ground's page is open in place of the list. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, auto: false, pending: false, msg: '', draft: null, timer: null, saving: null, paged: false }; SCRATCH.set(cs, s); } return s; };
/* How long a tier press waits for the next press before it saves (one intent for a run of presses). */
const TIER_SAVE_MS = 300;

/** Pick a hunt in this character's Hunts window (the World's door does, before it opens the window). */
export function pickHunt(cs, hunt) {
  if (!cs) return;
  const sc = scratchOf(cs);
  if (huntRows().some((r) => r.hunt === hunt)) { sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; }
}

/* The character's Level as the server states it (the envelope's `level` block), or null. */
function levelOf(cs) {
  const lv = levelRowOf(cs);
  return lv ? lv.level : null;
}

const groundOf = (hunt) => Object.values(HUNT_GROUNDS).find((x) => x.hunt === hunt) || null;

/**
 * WHY THIS HERO'S ENTER IS OFF, or '' when it is live: a party member's belongs to its leader (the server refuses it: not_party_leader). No Level ever turns it off. Pure.
 */
export function enterOffWords(party) {
  if (party && !party.isLeader) return 'You\'re in ' + (party.leaderName || 'your leader') + '\'s party, and they pick the hunt. Leave the party to pick your own.';
  return '';
}

/* What a warning covered: this ground and these seats (none, for a hero alone or a leader who alone stands under it). Someone who sits down under the floor afterwards has not been told. */
const warnKey = (hunt, seats) => hunt + ':' + seats.map((s) => s.seat).join();

/* The server's pick on this ground (`picks`: { [hunt]: tier }, no key = Normal), Normal if the ground no longer offers it; null = unknown (no section, or no ground). */
function tierOf(picks, hunt) {
  const g = groundOf(hunt);
  if (!picks || !g) return null;
  return g && tiersOf(g.id).includes(picks[hunt]) ? picks[hunt] : DEFAULT_TIER;
}

/* The tier on screen: this ground's unsaved draft while there is one, else the server's. A party member's is its leader's (the party section's leader_tiers), never its own. */
function shownTier(sc, picks, hunt, party) {
  if (party && !party.isLeader) return tierOf(party.tiers, hunt);
  const tier = tierOf(picks, hunt);
  return tier && sc.draft && sc.draft.hunt === hunt ? sc.draft.tier : tier;
}

/**
 * SAVE THE TIER DRAFT NOW: ONE hr_hunt_tier_set with its ground and value, queued behind any save in
 * flight. The answer clears the draft only if no later press replaced it; a refusal says why (the
 * server's value shows again). Answers the save's result ({ ok: true } when nothing was waiting).
 */
function saveTier(cs, sc, repaint) {
  clearTimeout(sc.timer);
  sc.timer = null;
  const d = sc.draft;
  if (!d) return sc.saving || Promise.resolve({ ok: true });
  const p = (sc.saving || Promise.resolve()).then(async () => {
    let r;
    try { r = await cs.setHuntTier(d.hunt, d.tier); } catch (e) { r = null; }
    if (!r) r = { ok: false, error: 'network' };
    if (sc.draft === d) { sc.draft = null; sc.msg = r.ok ? '' : refusalText(r); }
    if (sc.saving === p) sc.saving = null;
    repaint();
    return r;
  });
  sc.saving = p;
  return p;
}

/* Enter / Enter with party never goes on an unsaved tier: the draft is saved first, and a refused save refuses the start. */
function afterTier(cs, sc, repaint, go) {
  if (!sc.draft && !sc.saving) return go();
  return saveTier(cs, sc, repaint).then((r) => (r && r.ok === false ? r : go()));
}

/* The setup Enter goes as: the one picked under Go as while the server still lists it, else the one in use. */
function chosenOf(sc, setups) {
  if (!setups || !setups.length) return null;
  const p = setups.find((x) => x.preset === sc.goAs) || setups.find((x) => x.inUse) || setups[0];
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
  const want = chosenOf(sc, setupsOf(cs));
  if (s && Number.isInteger(want) && want !== s.preset) {
    const a = await cs.applyPreset(want);
    if (!a || !a.ok) return a || { ok: false, error: 'network' };
  }
  sc.goAs = null;
  return go(Number.isInteger(want) ? want : (s ? s.preset : 0));
}

/* The hunt under way: what its hunt bag holds now (the server's; Enter moved it out of the bag, Brannoc 10-22). */
function carriedWords(lines) {
  if (!lines.length) return 'Your hunt bag is empty.';
  return 'Your hunt bag holds ' + lines.map((l) => whole(l.qty) + ' ' + itemName(l.id)).join(', ') + '.';
}

/** The skeleton (built once per opening): the notes, then the list beside the picked ground's page. A fresh opening
 *  forgets an Enter the player pressed in an earlier one (its close is spent or moot). */
export function renderHunts(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.closeOnHunt = false; sc.shown = null; }
  return '<div class="hw-hunts">'
    + '<p class="hs-note hw-hunts-now"></p><p class="hs-note hw-hunts-reco" hidden></p>'
    + '<div class="hw-hunts-cols"><ul class="hw-hunt-list" role="listbox" aria-label="Hunts"></ul>'
    /* The page scrolls in its own box and Enter stands below it (windows.css), never over the lineup or the drops. */
    + '<section class="hw-hunt-detail" aria-label="The picked hunt"><div class="hw-hd-page">' + detailHtml()
    + '<h4 class="hw-hd-h">The packs</h4><div class="hw-pull"><p class="hw-hunt-facts"></p>'
    + '<span class="hw-tiers" role="group" aria-label="Tiers"><span class="hh-segs">'
    + TIER_IDS.map((id) => '<button type="button" class="hh-seg" data-hs-act="tier" data-tier="' + id + '">' + TIER_NAME[id] + '</button>').join('')
    + '</span><output class="hw-tier-read"></output></span></div>'
    + '<p class="hw-tier-note"></p>'
    + '<p class="hw-hunt-pack"></p>' + goHtml() + callHtml() + '</div>'
    + '<div class="hw-hd-foot"><p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<p class="hw-enter-why"></p><button type="button" class="hh-tool" data-hs-act="leave-party" hidden>' + t('controls.leave_party') + '</button>'
    + '<button type="button" class="hw-primary is-on hw-hunt-enter" data-hs-act="enter">' + t('controls.enter') + '</button></div>'
    + '</section></div></div>';
}

/* One ground's line: who may come, the name, the band in words, the advice and the best. Every ground takes one hero or a group
   (Tyler 2026-11-08: no ground is solo or party), so the glyph is the same on every line. */
function lineHtml(r, glyphs) {
  return '<li class="hw-hunt" role="option" data-hs-act="pick" data-hunt="' + esc(r.hunt) + '" tabindex="-1">'
    + '<span class="hw-hunt-glyph" title="' + esc(heroWords(r)) + '">' + glyphSvg(glyphs, 'uiPeople') + '</span>'
    + '<span class="hw-hunt-main"><b class="hw-hunt-name">' + esc(r.name) + '</b>'
    + '<small class="hw-hunt-band"><span class="hw-hunt-lv">Level ' + r.band[0] + '–' + r.band[1] + '</span><span class="hw-hunt-sep" hidden> · </span><span class="hw-hunt-fit"></span></small>'
    /* the separators are text (a reader got "Level 1–8In range"); the second keeps to the line it ends: a wrapped line never starts with a dot */
    + '<small class="hw-hunt-sub"><span class="hw-hunt-fits"></span><span class="hw-hunt-sep" hidden> · </span><span class="hw-hunt-bestline"></span></small>'
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
  if (sc.closeOnHunt && now) { sc.closeOnHunt = false; queueMicrotask(() => ctx.wm.close('hunts')); }
  const level = levelOf(cs);
  const party = partyMembershipOf(cs);
  const size = party ? party.seats.length : 1;
  const follower = !!party && !party.isLeader;
  /* The advice reads the server's levels: this hero's, or every seat's in its party (the party's levels pick). */
  /* This hero's personal bests, the server's (hunt_bests); null = the server sent none, the lines stay empty. */
  const bests = huntBestsOf(cs);
  const rec = recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list, bests);
  /* Until the player picks a line by hand the pick FOLLOWS the advice (lane/b-first-hour: the Cellar, picked for a
     Level 1 hero, stayed picked at Level 5 for the rest of the session while the coach sent the hero to the Thicket). */
  if ((!sc.pick || sc.auto) && list.length) { sc.pick = openingPick(rec, list, h ? { huntId: h.huntId, endReason: h.ended ? h.endReason : null } : null).hunt; sc.auto = true; }
  const tally = tallyOf(cs);
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  text(nowEl, now ? 'You are hunting in ' + huntName(now.huntId) + '. Leave that hunt to go somewhere else.'
    : follower ? 'Your party leader picks the hunt and starts it. You walk in with everyone, with your own setup.'
    : party ? 'Pick a hunt, then Enter with party. Everyone walks in together, each with their own setup.'
    : 'Pick a hunt, then Enter. Your hero walks there and fights on its own.');
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
      const tag = adviceTag(r, rec, step, !!party), best = bestLine(bests, r.hunt) || '';
      text(li.querySelector('.hw-hunt-fits'), tag);
      text(li.querySelector('.hw-hunt-bestline'), best);
      prop(li.querySelector('.hw-hunt-sub .hw-hunt-sep'), 'hidden', !tag || !best);
      /* Tamsin's tallies held on this ground, the server's count ("Gray Wolves 112/200"). */
      text(li.querySelector('.hw-hunt-tally'), heldOn(tally, r.hunt).map(tallyLine).join(' · '));
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
  /* An unsaved tier is marked on the status line until the server answers. */
  const saving = !sc.pending && !!(sc.draft || sc.saving);
  cls(root, 'is-pending', sc.pending || saving);
  text(root.querySelector('.hh-intent-msg'), saving ? 'Saving…' : sc.msg);
};

/* THE PICKED GROUND'S PAGE: its facts (hunt-detail.js), the warning, the pull size, what it carries, Enter. */
function patchPage(det, ctx, sc, v) {
  const { r, level, size, party, follower, now } = v;
  const cs = ctx.character;
  patchGround(det, ctx, r, { level, size, bests: v.bests, worn: wornWeightOf(equipmentOf(cs) || {}), repaint: () => ctx.refresh('hunts') });
  /* the floor is a warning (Tyler 2026-11-04 UTC): this hero's own gap, and a leader's every seat's too. The first press of Enter arms the one confirm (renderHunts.act). */
  const under = party && !follower ? seatsUnder(r, party).under : [];
  /* the death line says the share a death would really take with the Blessings the server says are on (designer re-read 2026-11-11) */
  const blessed = blessingsOf(cs);
  text(det.querySelector('.hw-hunt-warn'), [rangeWords(r, level, blessed ? blessed.permille : 0), underWords(r, under), shareWords(r, party, level)].filter(Boolean).join(' '));
  /* While a hunt runs, its own page says what its hunt bag holds (in town, Before you go says what the bar spends). */
  const carried = now ? huntBagOf(cs) : null;
  text(det.querySelector('.hw-hunt-pack'), now && now.huntId === r.hunt && carried ? carriedWords(carried) : '');
  /* GO AS, BEFORE YOU GO, WITH A PARTY: the server's setups, bar, stamina and gold, and this account's open heroes. */
  const setups = setupsOf(cs);
  const chosen = chosenOf(sc, setups);
  const other = (setups || []).find((p) => p.preset === chosen && !p.inUse);
  patchGo(det, ctx, {
    setups, chosen, off: sc.pending || !!now || follower,
    before: now ? [] : beforeLines(cs, { hunt: r.hunt, other: other ? other.name : null }),
    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {
      why: party ? 'You lead a party of ' + party.seats.length + '.' : heroWords(r) + '.',
      find: party ? 'Open the party finder' : 'Find a party',
      bring: freeHeroes(cs, ctx.peers()), full: !!party && party.full,
    } : null,
  });
  patchCall(det, ctx, { hunt: r.hunt, party, now, pending: sc.pending });
  const enter = det.querySelector('.hw-hunt-enter');
  attr(enter, 'data-hunt', r.hunt);
  const armed = sc.warned === warnKey(r.hunt, under) && (under.length > 0 || !!rangeWords(r, level));
  text(enter, party && !follower ? (armed ? t('controls.enter_anyway') : t('controls.enter_with_party')) : armed ? t('controls.enter_anyway') : t('controls.enter'));
  /* Enter and the tier buttons (Go as, Find a party and Bring are patchGo's: off for a member too). */
  for (const b of det.querySelectorAll('.hw-hd-foot button, .hw-tiers button')) prop(b, 'disabled', sc.pending || !!now);
  /* ENTER OFF SAYS WHY, BESIDE IT (midgame panel 2026-11-01: a hero sent home by a friend's death, left in the party, read "the game is broken"), with the way out. */
  const off = now ? '' : enterOffWords(party);
  if (off) prop(enter, 'disabled', true);
  /* A HARDER HUNT SAYS SO AT THE PRESS: a pick kept from last time isn't on screen above a scrolled page. */
  const pressing = huntTierOf(cs);
  const choosing = now || off || follower ? '' : tierChoiceWords(r, shownTier(sc, pressing ? pressing.picks : null, r.hunt, party) || DEFAULT_TIER, size);
  text(det.querySelector('.hw-enter-why'), off || choosing);
  prop(det.querySelector('[data-hs-act="leave-party"]'), 'hidden', now || !follower);
  /* This hero's tier picked per ground (hunt_tier); null = the server sent none, no choice shows. */
  const tiers = huntTierOf(cs);
  const tier = shownTier(sc, tiers ? tiers.picks : null, r.hunt, party);
  /* The packs the server spawns on the shown tier (this ground's own pick). */
  text(det.querySelector('.hw-hunt-facts'), packWords(r, tier ? tierPull(r, tier, size) : null));
  const offered = tiersOf(groundOf(r.hunt).id);
  /* A ground that offers only Normal has no choice to show. */
  const choice = !!tier && offered.length > 1;
  cls(det.querySelector('.hw-tiers'), 'is-on', choice);
  for (const b of det.querySelectorAll('.hw-tiers [data-tier]')) {
    const id = b.getAttribute('data-tier');
    prop(b, 'hidden', follower || !offered.includes(id));
    attr(b, 'data-hunt', r.hunt);
    attr(b, 'aria-pressed', String(id === tier));
    attr(b, 'data-pending', String(id === tier && !!(sc.draft || sc.saving)));
  }
  text(det.querySelector('.hw-tier-read'), follower && tier ? 'Set by ' + (party.leaderName || 'your leader') + ': ' + TIER_NAME[tier] : '');
  /* Normal says it is safe only where it is: under the ground's floor the warning above says what the hero risks. */
  const safe = rangeWords(r, level) ? '' : TIER_LINES.normal + ' ';
  text(det.querySelector('.hw-tier-note'), !choice ? '' : tierWords(r, tier, size) || (follower ? 'Your party leader picks the tier.'
    : size > 1 ? safe + 'As the leader, your pick holds for everyone, and it\'s kept for this ground.' : safe + 'Your pick is kept for this ground.'));
}

renderHunts.act = function actHunts(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const hunt = el.getAttribute('data-hunt');
  const repaint = () => renderHunts.patch(body, ctx);
  if (action === 'tier') {
    /* The choice moves on the press; the save waits TIER_SAVE_MS for the next press (saveTier). */
    const tiers = huntTierOf(cs);
    const party = partyMembershipOf(cs);
    /* A member's tier is its leader's: there is nothing to press (the server refuses it too). */
    if (party && !party.isLeader) return true;
    const want = el.getAttribute('data-tier');
    const server = tierOf(tiers ? tiers.picks : null, hunt);
    if (sc.pending || server === null || !tiersOf(groundOf(hunt).id).includes(want)) return true;
    sc.msg = '';
    /* Another ground's draft still waiting goes now (each ground keeps its own pick). */
    if (sc.draft && sc.draft.hunt !== hunt) saveTier(cs, sc, repaint);
    clearTimeout(sc.timer);
    sc.timer = null;
    /* Back on the server's value with nothing in flight: nothing to save. */
    if (want === server && !sc.saving) sc.draft = null;
    else {
      sc.draft = { hunt, tier: want };
      sc.timer = setTimeout(() => saveTier(cs, sc, repaint), TIER_SAVE_MS);
    }
    repaint();
    return true;
  }
  if (action === 'pick') {
    /* Another ground's page opens at its top, not where the last one was scrolled to. */
    const page = body.querySelector('.hw-hd-page');
    if (sc.pick !== hunt && page && page.scrollTop) page.scrollTop = 0;
    sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; repaint();
    return true;
  }
  if (action === 'back') { sc.paged = false; repaint(); return true; }
  /* Go as: display scratch only, until Enter sends it (nothing else reads or spends it). */
  if (action === 'go-as') { if (!sc.pending) { sc.goAs = Number(el.getAttribute('data-preset')); sc.msg = ''; repaint(); } return true; }
  /* Find a party: the Party window's finder, on this ground and this hero's weapon (B #3). */
  if (action === 'find-party') { if (sc.pick) openFinderOn(ctx, cs, sc.pick); return true; }
  if (action === 'bring') {
    const slot = Number(el.getAttribute('data-slot'));
    const who = freeHeroes(cs, ctx.peers()).find((x) => x.slot === slot);
    if (who) runIntent(sc, repaint, () => inviteOwn(ctx.account, cs, slot), 'Bringing ' + who.name + '…', () => who.name + ' joined your party.', cs);
    return true;
  }
  /* An Enter the server took closes this window once its hunt section shows the hunt (patchHunts). */
  const thenClose = (r) => { if (r && r.ok) { sc.closeOnHunt = true; repaint(); } };
  /* Call out: its section's presses, run as the setup Go as chose; its refusals read the designer's words. */
  const called = callFromGround(sc.pick);
  if (actCall(ctx, action, repaint, (send, busy, done) => runIntent(sc, repaint, () => asChosen(cs, sc, send), busy, done, cs).then((r) => {
    const said = r && !r.ok && called ? callRefusal(r, called) : null;
    if (said) { sc.msg = said; repaint(); }
    thenClose(r);
    return r;
  }))) return true;
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
      runIntent(sc, repaint, () => warnPartyGround(ctx.account, cs, hunt), 'Telling your party…',
        () => underWords(row, low.under) + ' They have been told. Press Enter anyway to go.', cs).then(() => { sc.warned = warnKey(hunt, low.under); repaint(); });
      return true;
    }
    if (!low.under.length && row && rangeWords(row, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {
      sc.warned = warnKey(hunt, []);
      sc.msg = 'Press Enter anyway to go.';
      repaint();
      return true;
    }
    sc.warned = null;
    runIntent(sc, repaint, () => afterTier(cs, sc, repaint, () => asChosen(cs, sc, () => startPartyHunt(ctx.account, cs, hunt))), 'Gathering the party for ' + huntName(hunt) + '…',
      () => 'Your party is on its way to ' + huntName(hunt) + '.', cs).then(thenClose);
    return true;
  }
  if (action === 'enter') {
    sc.pick = hunt;
    /* A ground above this hero asks once: the first press arms "Enter anyway" under the words that say what it risks, the second goes. */
    const above = huntRows().find((x) => x.hunt === hunt);
    if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {
      sc.warned = warnKey(hunt, []);
      sc.msg = 'Press Enter anyway to go.';
      repaint();
      return true;
    }
    sc.warned = null;
    /* What the hunt carries is the bag's own supplies, read after any setup change has landed. */
    runIntent(sc, repaint, () => afterTier(cs, sc, repaint, () => asChosen(cs, sc, (preset) => cs.enterHunt(hunt, packFor(bagOf(cs)), preset))), 'Setting off for ' + huntName(hunt) + '…', (res) => { sc.enterMsg = 'On the way to ' + huntName(hunt) + '.' + (res && res.belowRange ? ' ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; }, cs)
      .then(thenClose);
    return true;
  }
  return false;
};

/* The header's Back (src/shell/window-head.js): on a phone, a ground's page goes back to the list. */
renderHunts.inner = (ctx, body) => (ctx.isPhone() && body.querySelector('.is-paged') ? 'back' : null);
