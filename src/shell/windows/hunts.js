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
// tone, a solo / party glyph, this hero's best Level XP an hour there (or "New"),
// and "Fits your level" on the recommendation's line. The picked ground gets ONE
// page beside it (src/shell/windows/hunt-detail.js: its theme, who lives there,
// the rare and its carrier, the hero's bests), then the pull size, and the
// window's one primary, Enter. On a phone the list comes first and a pick opens
// the page in its place, with a way back.
// Enter is ONE hr_hunt_enter; the server checks the band, the stamina and the
// stock, and the hunt shows only from the re-read envelope. A hunt above the
// character's level says so ("expect losses"); the floor is a warning, and
// only the server refuses (Tyler 10-18: 15 or more levels under it).
//
// IN A PARTY (PARTY_SPEC.md §1.5, Tyler 10-19) the ground is chosen HERE, at
// Start: the leader's Enter reads "Start with party" and is ONE
// hr_hunt_party_start naming the picked hunt; everyone walks in together, each
// with their own saved setup, or nobody, and the answer names who was not
// ready. A member's Enter stays off ("the leader starts the hunt"). The party
// size is the server's seat count; the picked ground's party rule (its row's
// minParty pocket and boss) shows on its page.
//
// DENSITY is chosen with the hunt, before Enter (Tyler 10-18): how many monsters
// each spawn holds (the engine's pack size, pull-cycle.js spawnPack), a −/+
// stepper on the picked ground's page from "as built" up to the ground's most for
// the party's size (hunt-grounds.js densityFor). A press moves the number AT ONCE,
// marked "Saving..." (Tyler 10-20: the round trip per press was "incredibly
// laggy"): presses inside DENSITY_SAVE_MS coalesce into ONE hr_hunt_density_set
// carrying the last value, and the server's answer (the re-read hunt_density)
// replaces the draft; a refusal shows the server's value again and why. Nothing
// spends the draft (CLAUDE.md §6): Enter / Start with party first waits for the
// save. The pick is the hero's own PER GROUND (rulings H4: remembered per hunt,
// never part of a setup), so each page says the pull size the server spawns at
// THAT ground's pick.
// IN A PARTY THE LEADER CHOOSES (Tyler 2026-10-20): the leader's pick is the pull
// for everyone; a member sees it read-only ("Set by <leader>: 7 each", the
// server's `leader_densities`) with no step, and the server refuses a member's
// pick (hr_hunt_density_set `not_leader`).
// ════════════════════════════════════════════════════════════════════════
import { huntOf, huntBagOf, settingsOf, huntBestsOf, huntDensityOf } from '../../session/hunt-sections.js?v=0.2.34';
import { bagOf } from '../../session/item-sections.js?v=0.2.34';
import { levelOf as levelRowOf } from '../../session/character-sections.js?v=0.2.34';
import { huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.34';
import { startPartyHunt, settleTownActivity } from '../../session/party-intents.js?v=0.2.34';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.34';
import { whole } from '../../render/format.js?v=0.2.34';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.34';
import { itemName } from '../widgets/bits.js?v=0.2.34';
import { glyphSvg } from '../launcher.js?v=0.2.34';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.34';
import { HUNT_GROUNDS, densityFor, DENSITY_PICK } from '../../data/hunt-grounds.js?v=0.2.34';
import { huntRows, densityWords, rangeWords, groupWords, heroWords, packFor, bestLine, fitWords, ABOVE_LEVEL_WORDS, recommendation } from '../hunt-list.js?v=0.2.34';
import { detailHtml, patchGround, goHtml, patchGo } from './hunt-detail.js?v=0.2.34';
import { setupsOf, beforeLines, freeHeroes } from '../hunt-go.js?v=0.2.34';
import { inviteOwn } from '../../session/party-intents.js?v=0.2.34';
import { openFinderOn } from './party-finder.js?v=0.2.34';

const SCRATCH = new WeakMap();
/* `draft` is the density shown before the server has it ({ hunt, n }), `timer` its coalescing
   wait, `saving` the save in flight (its promise: Enter waits on it). `paged`: on a phone, the
   picked ground's page is open in place of the list. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '', draft: null, timer: null, saving: null, paged: false }; SCRATCH.set(cs, s); } return s; };
/* How long the step waits for the next press before it saves (one intent for a run of presses). */
const DENSITY_SAVE_MS = 300;

/** Pick a hunt in this character's Hunts window (the World's door does, before it opens the window). */
export function pickHunt(cs, hunt) {
  if (!cs) return;
  const sc = scratchOf(cs);
  if (huntRows().some((r) => r.hunt === hunt)) { sc.pick = hunt; sc.msg = ''; sc.paged = true; }
}

/* The character's Level (the server's Level XP on the shared curve), or null. */
function levelOf(cs) {
  const lv = levelRowOf(cs);
  return lv ? lv.level : null;
}

const groundOf = (hunt) => Object.values(HUNT_GROUNDS).find((x) => x.hunt === hunt) || null;

/* The server's pick on this ground (`picks`: { [hunt]: n }, no key = 0, as built) as the ground would spawn it,
   and the most the ground allows for `size`; null = unknown (no section, or no ground). */
function densityOf(picks, hunt, size) {
  const g = groundOf(hunt);
  if (!picks || !g) return null;
  const pick = Number.isInteger(picks[hunt]) ? picks[hunt] : 0;
  return { now: densityFor(g, size, pick), max: densityFor(g, size, DENSITY_PICK.max) };
}

/* The density on screen: this ground's unsaved draft while there is one, else the server's (both clamped to
   the ground). A party member's is its leader's (the party section's leader_densities), never its own. */
function shownDensity(sc, picks, hunt, size, party) {
  if (party && !party.isLeader) return densityOf(party.densities, hunt, size);
  const dn = densityOf(picks, hunt, size);
  if (!dn || !sc.draft || sc.draft.hunt !== hunt) return dn;
  return { now: densityFor(groundOf(hunt), size, sc.draft.n), max: dn.max };
}

/**
 * SAVE THE DENSITY DRAFT NOW: ONE hr_hunt_density_set with its ground and value, queued behind any save in
 * flight. The answer clears the draft only if no later press replaced it; a refusal says why (the
 * server's value shows again). Answers the save's result ({ ok: true } when nothing was waiting).
 */
function saveDensity(cs, sc, repaint) {
  clearTimeout(sc.timer);
  sc.timer = null;
  const d = sc.draft;
  if (!d) return sc.saving || Promise.resolve({ ok: true });
  const p = (sc.saving || Promise.resolve()).then(async () => {
    let r;
    try { r = await cs.setHuntDensity(d.hunt, d.n); } catch (e) { r = null; }
    if (!r) r = { ok: false, error: 'network' };
    if (sc.draft === d) { sc.draft = null; sc.msg = r.ok ? '' : refusalText(r); }
    if (sc.saving === p) sc.saving = null;
    repaint();
    return r;
  });
  sc.saving = p;
  return p;
}

/* Enter / Start with party never goes on an unsaved density: the draft is saved first, and a refused save refuses the start. */
function afterDensity(cs, sc, repaint, go) {
  if (!sc.draft && !sc.saving) return go();
  return saveDensity(cs, sc, repaint).then((r) => (r && r.ok === false ? r : go()));
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

/** The skeleton (built once per opening): the notes, then the list beside the picked ground's page. */
export function renderHunts() {
  return '<div class="hw-hunts">'
    + '<p class="hs-note hw-hunts-now"></p><p class="hs-note hw-hunts-reco" hidden></p>'
    + '<div class="hw-hunts-cols"><ul class="hw-hunt-list" role="listbox" aria-label="Hunts"></ul>'
    + '<section class="hw-hunt-detail" aria-label="The picked hunt">' + detailHtml()
    + '<h4 class="hw-hd-h">Each pull</h4><div class="hw-pull"><p class="hw-hunt-facts"></p>'
    + '<span class="hw-density" role="group" aria-label="Monsters each pull">'
    + '<span class="hh-step"><button type="button" class="hh-seg" data-hs-act="density" data-by="-1" aria-label="Fewer monsters">−</button>'
    + '<output class="hh-step-val"></output>'
    + '<button type="button" class="hh-seg" data-hs-act="density" data-by="1" aria-label="More monsters">+</button></span></span></div>'
    + '<p class="hw-density-note"></p>'
    + '<p class="hw-hunt-pack"></p>' + goHtml()
    + '<div class="hw-hd-foot"><p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<button type="button" class="hw-primary is-on hw-hunt-enter" data-hs-act="enter">Enter</button></div>'
    + '</section></div></div>';
}

/* One ground's line: the solo / party glyph, the name, the band in words, the advice and the best. */
function lineHtml(r, glyphs) {
  const party = r.groupFit === 'party';
  return '<li class="hw-hunt" role="option" data-hs-act="pick" data-hunt="' + esc(r.hunt) + '" tabindex="-1">'
    + '<span class="hw-hunt-glyph" title="' + (party ? 'Built for a party' : 'Built for one hero') + '">' + glyphSvg(glyphs, party ? 'uiPeople' : 'navProfile') + '</span>'
    + '<span class="hw-hunt-main"><b class="hw-hunt-name">' + esc(r.name) + '</b>'
    + '<small class="hw-hunt-band"><span class="hw-hunt-lv">Level ' + r.band[0] + '–' + r.band[1] + '</span><span class="hw-hunt-fit"></span></small>'
    + '<small class="hw-hunt-sub"><span class="hw-hunt-fits"></span><span class="hw-hunt-bestline"></span></small></span></li>';
}

renderHunts.patch = function patchHunts(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-hunts');
  const list = huntRows();
  const h = huntOf(cs);
  const now = h && !h.ended ? h : null;
  const level = levelOf(cs);
  const party = partyMembershipOf(cs);
  const size = party ? party.seats.length : 1;
  const follower = !!party && !party.isLeader;
  /* The advice reads the server's levels: this hero's, or every seat's in its party (the party's levels pick). */
  const rec = recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list);
  if (!sc.pick && list.length) sc.pick = rec.row ? rec.row.hunt : list[0].hunt;
  /* This hero's personal bests, the server's (hunt_bests); null = the server sent none, the lines stay empty. */
  const bests = huntBestsOf(cs);
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  text(nowEl, now ? 'You are hunting in ' + huntName(now.huntId) + '. Leave that hunt to go somewhere else.'
    : follower ? 'Your party leader picks the hunt and starts it. You walk in with everyone, with your own setup.'
    : party ? 'Pick a hunt, then Start with party. Everyone walks in together, each with their own setup.'
    : 'Pick a hunt, then Enter. Your hero walks there and fights on its own.');
  /* The how-to (not a running hunt) gives its room to the ground's page on the phone sheet. */
  cls(nowEl, 'is-hint', !now);
  /* No ground built for this group holds its level: said plainly (the pick is the nearest below). */
  const reco = root.querySelector('.hw-hunts-reco');
  const advice = !now && !follower && rec.note ? rec.note : '';
  text(reco, advice);
  prop(reco, 'hidden', !advice);
  /* "Fits your level" marks the recommendation's line only when its band truly holds the group (no note). */
  const fits = rec.row && !rec.note ? rec.row.hunt : null;
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
      text(li.querySelector('.hw-hunt-fits'), fits === r.hunt ? (party ? 'Fits your party' : 'Fits your level') : '');
      text(li.querySelector('.hw-hunt-bestline'), bestLine(bests, r.hunt) || '');
    },
  });
  const r = list.find((x) => x.hunt === sc.pick) || null;
  cls(root, 'is-paged', sc.paged && !!r);
  const det = root.querySelector('.hw-hunt-detail');
  prop(det, 'hidden', !r);
  if (r) patchPage(det, ctx, sc, { r, level, size, party, follower, now, bests });
  /* An unsaved density is marked on the status line until the server answers. */
  const saving = !sc.pending && !!(sc.draft || sc.saving);
  cls(root, 'is-pending', sc.pending || saving);
  text(root.querySelector('.hh-intent-msg'), saving ? 'Saving…' : sc.msg);
};

/* THE PICKED GROUND'S PAGE: its facts (hunt-detail.js), the warning, the pull size, what it carries, Enter. */
function patchPage(det, ctx, sc, v) {
  const { r, level, size, party, follower, now } = v;
  const cs = ctx.character;
  patchGround(det, ctx, r, { level, size, bests: v.bests, repaint: () => ctx.refresh('hunts') });
  /* the floor is a warning (Tyler 10-18): words only, Enter stays the server's to refuse */
  text(det.querySelector('.hw-hunt-warn'), rangeWords(r, level) || '');
  /* While a hunt runs, its own page says what its hunt bag holds (in town, Before you go says what the bar spends). */
  const carried = now ? huntBagOf(cs) : null;
  text(det.querySelector('.hw-hunt-pack'), now && now.huntId === r.hunt && carried ? carriedWords(carried) : '');
  /* GO AS, BEFORE YOU GO, WITH A PARTY: the server's setups, bar, stamina and gold, and this account's open heroes. */
  const setups = setupsOf(cs);
  const chosen = chosenOf(sc, setups);
  const other = (setups || []).find((p) => p.preset === chosen && !p.inUse);
  patchGo(det, ctx, {
    setups, chosen, off: sc.pending || !!now || follower,
    before: now ? [] : beforeLines(cs, other ? { other: other.name } : null),
    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {
      why: party ? 'You lead a party of ' + party.seats.length + '.' : (groupWords(r, size) || heroWords(r)) + '.',
      find: party ? 'Open the party finder' : 'Find a party',
      bring: freeHeroes(cs, ctx.peers()), full: !!party && party.full,
    } : null,
  });
  const enter = det.querySelector('.hw-hunt-enter');
  attr(enter, 'data-hunt', r.hunt);
  text(enter, party && !follower ? 'Start with party' : 'Enter');
  /* Enter and the pull step (Go as, Find a party and Bring are patchGo's: off for a member too). */
  for (const b of det.querySelectorAll('.hw-hd-foot button, .hw-density button')) prop(b, 'disabled', sc.pending || !!now);
  if (follower) prop(enter, 'disabled', true);
  /* This hero's density pick per ground (hunt_density); null = the server sent none, no number shows. */
  const dn = shownDensity(sc, huntDensityOf(cs), r.hunt, size, party);
  /* The pull size the server spawns at the shown pick (this ground's own pick). */
  text(det.querySelector('.hw-hunt-facts'), densityWords(r, dn ? dn.now : null));
  cls(det.querySelector('.hw-density'), 'is-on', !!dn);
  for (const b of det.querySelectorAll('.hw-density [data-by]')) { prop(b, 'hidden', follower); attr(b, 'data-hunt', r.hunt); }
  if (!dn) text(det.querySelector('.hw-density-note'), '');
  if (dn) {
    const val = det.querySelector('.hw-density .hh-step-val');
    const words = dn.now ? dn.now + ' each' : 'As built';
    text(val, follower ? 'Set by ' + (party.leaderName || 'your leader') + ': ' + words : words);
    attr(val, 'data-pending', String(!follower && !!(sc.draft || sc.saving)));
    /* The size it clamps for, named: alone, or this party's seat count (the settle's clamp). */
    text(det.querySelector('.hw-density-note'), follower ? 'Your party leader sets how many monsters each pull brings.'
      : 'Up to ' + dn.max + ' a pull'
      + (size === 1 ? ' when you hunt alone.' : ' for your party of ' + size + '. As the leader, your pick is the pull for everyone.')
      + ' Kept for this ground.');
    prop(det.querySelector('[data-by="-1"]'), 'disabled', follower || sc.pending || !!now || dn.now <= DENSITY_PICK.min);
    prop(det.querySelector('[data-by="1"]'), 'disabled', follower || sc.pending || !!now || dn.now >= dn.max);
  }
}

renderHunts.act = function actHunts(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const hunt = t.getAttribute('data-hunt');
  const repaint = () => renderHunts.patch(body, ctx);
  if (action === 'density') {
    /* The number moves on the press; the save waits DENSITY_SAVE_MS for the next press (saveDensity). */
    const picks = huntDensityOf(cs);
    const party = partyMembershipOf(cs);
    /* A member's density is its leader's: there is nothing to press (the server refuses it too). */
    if (party && !party.isLeader) return true;
    const size = party ? party.seats.length : 1;
    const dn = shownDensity(sc, picks, hunt, size, party);
    const n = dn ? dn.now + Number(t.getAttribute('data-by')) : NaN;
    if (!dn || sc.pending || !(n >= DENSITY_PICK.min && n <= dn.max)) return true;
    sc.msg = '';
    /* Another ground's draft still waiting goes now (each ground keeps its own pick). */
    if (sc.draft && sc.draft.hunt !== hunt) saveDensity(cs, sc, repaint);
    clearTimeout(sc.timer);
    sc.timer = null;
    /* Back on the server's value with nothing in flight: nothing to save. */
    if (n === densityOf(picks, hunt, size).now && !sc.saving) sc.draft = null;
    else {
      sc.draft = { hunt, n };
      sc.timer = setTimeout(() => saveDensity(cs, sc, repaint), DENSITY_SAVE_MS);
    }
    repaint();
    return true;
  }
  if (action === 'pick') {
    /* Another ground's page opens at its top, not where the last one was scrolled to. */
    if (sc.pick !== hunt && body.scrollTop) body.scrollTop = 0;
    sc.pick = hunt; sc.msg = ''; sc.paged = true; repaint();
    return true;
  }
  if (action === 'back') { sc.paged = false; repaint(); return true; }
  /* Go as: display scratch only, until Enter sends it (nothing else reads or spends it). */
  if (action === 'go-as') { if (!sc.pending) { sc.goAs = Number(t.getAttribute('data-preset')); sc.msg = ''; repaint(); } return true; }
  /* Find a party: the Party window's finder, on this ground and this hero's weapon (B #3). */
  if (action === 'find-party') { if (sc.pick) openFinderOn(ctx, cs, sc.pick); return true; }
  if (action === 'bring') {
    const slot = Number(t.getAttribute('data-slot'));
    const who = freeHeroes(cs, ctx.peers()).find((x) => x.slot === slot);
    if (who) runIntent(sc, repaint, () => inviteOwn(ctx.account, cs, slot), 'Bringing ' + who.name + '…', () => who.name + ' joined your party.', cs);
    return true;
  }
  if (action === 'enter' && partyMembershipOf(cs)) {
    sc.pick = hunt;
    if (!partyMembershipOf(cs).isLeader) return true;
    runIntent(sc, repaint, () => afterDensity(cs, sc, repaint, () => asChosen(cs, sc, () => startPartyHunt(ctx.account, cs, hunt))), 'Gathering the party for ' + huntName(hunt) + '…',
      () => 'Your party is on its way to ' + huntName(hunt) + '.', cs);
    return true;
  }
  if (action === 'enter') {
    sc.pick = hunt;
    /* What the hunt carries is the bag's own supplies, read after any setup change has landed. */
    runIntent(sc, repaint, () => afterDensity(cs, sc, repaint, () => asChosen(cs, sc, (preset) => cs.enterHunt(hunt, packFor(bagOf(cs)), preset))), 'Setting off for ' + huntName(hunt) + '…', (res) => { sc.enterMsg = 'On the way to ' + huntName(hunt) + '.' + (res && res.belowRange ? ' ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; }, cs);
    return true;
  }
  return false;
};
