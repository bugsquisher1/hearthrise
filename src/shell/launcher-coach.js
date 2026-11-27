// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher-coach.js — THE COACH: ITS CARD, ITS FOLD AND ITS RING (split out of launcher.js, FB-5 2026-11-21).
//
// One card at a time, read from what the server projects (src/session/tutorial-sections.js) and the shell's facts
// (coachFactsOf). It is drawn under the icon row (launcher.js renderLaunchers), under the hunt top bar
// (widgets/hunt-topbar.js) or inside the window its control lives in (shell.js). Its ring marks the one control the
// card names (ringCoach). What the player has read, hidden and folded is the ACCOUNT's (src/session/account-coach.js):
// a lesson taught on one hero is taught for all four. Display only: gates, spends and stores no game state (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js';
import { pointerCardOf } from '../session/tutorial-sections.js';
import { HUNT_TUTORIAL, AUTO_KINDS, coachIcon, coachWindow } from '../data/hunt-tutorial.js';
import { tallyOf } from '../session/tally-sections.js';
import { bagOf, rulesOf, shopOf, equipmentOf, nameOf } from '../session/item-sections.js';
import { levelOf } from '../session/character-sections.js';
import { huntOf, serverNowOf } from '../session/hunt-sections.js';
import { COACH_HID_MAX } from '../session/residue.js';
import { coachOf, taughtElsewhere } from '../session/account-coach.js';
import { TIPS } from '../data/tips.js';
import { switchOn, setSwitch } from '../session/player-switch.js';
import { t } from '../render/player-text.js';
import { keepLastWords } from '../render/format.js';
import { lootSale, upgradeNeeds } from './bag-model.js';
import { homeOf, chestsOf } from '../session/home-sections.js';
import { upgradeOf } from './widgets/upgrade-line.js';
import { revealInWindow } from './widgets/bits.js';
import { draftOf, serverBar } from './bar-draft.js';
import { trackOnce } from '../net/observability.js';
import { SHELL_WINDOWS } from '../data/shell-windows.js';
import { partyGroundFor } from './hunt-list.js';
import { offerCardHtml, actTimeOffer } from './time-offer-card.js';

/**
 * THE TUTORIAL POINTER (Tyler 10-18: "I'm confused right away"). One line under the icon row: the
 * hunt tutorial card the character is on (src/data/hunt-tutorial.js), read from what the server
 * projects (src/session/tutorial-sections.js), so it advances as the server reports each step done
 * and is the same after a reload. Once the guide is done it names the next goal instead ("What next":
 * the next ground and the weapon skill's next unlock, designer 2026-10-22), so a hero is never left
 * with nothing to aim at. It is drawn only while no window that takes its place is open (it would cover the
 * window's title; the card a window's control answers shows INSIDE that window instead, src/shell/shell.js coach).
 * Chat does not take its place (src/data/shell-windows.js `besideCoach`): the card and Chat show together.
 * It is not drawn here during a hunt: the hunt top bar draws it under itself
 * (src/shell/widgets/hunt-topbar.js), so it never covers Leave hunt or the analyzer. Display only.
 */
export function pointerFor(ctx, hunting) {
  const cs = ctx.character;
  if (!cs || coachCovered(ctx.wm)) return '';
  /* a decision the server is waiting on comes before any tip (time-offer-card.js: the block rule's one offer) */
  const offer = offerCardHtml(cs);
  if (offer) return offer;
  const card = heldCard(ctx);
  return card ? coachHtml(cs, card, false, !!hunting && restsNow(ctx, card)) : '';
}

/** Is a window open that takes the card's place? Every window but the ones the catalogue marks `besideCoach` (Chat). */
export function coachCovered(wm) {
  const open = wm.openIds();
  if (!open.length) return false;
  const beside = new Set(wm.rows().filter((r) => r.besideCoach === true).map((r) => r.id));
  return open.some((id) => !beside.has(id));
}

/* THE COACH STANDS ASIDE IN A HUNT (the panel 2026-10-31: What next, Plant your land and the rest sat over the hero for a
   whole hunt): a card open under the hunt bar folds to its title once it has had its reading time, twice over and at least
   COACH_HUNT_OPEN_MS. The player's own press on the tab opens it for good (residue seen = this card, not min). Its ring stays.
   Display scratch per character: gates, spends and stores nothing. */
export const COACH_HUNT_OPEN_MS = 20000;
const OPEN_SINCE = new WeakMap();
export function restsNow(ctx, card) {
  /* A card whose title says nothing alone keeps its words (newcomer panel 2026-11-01: "Cash in", "Your first Level"). */
  if (card.holdOpen) return false;
  const cs = ctx.character;
  const now = typeof ctx.now === 'function' ? ctx.now() : null;
  if (now === null) return false;
  const r = cs.record && cs.record.residue ? cs.record.residue.coach : null;
  if (r && r.seen === card.id && r.min !== true) return false;
  /* BACK FROM AN ABSENCE the away line speaks first (away-recap.js): no card opens over the hunt the player came back to */
  const h = huntOf(cs);
  if (r && r.back && h && h.sessionId === r.back) return true;
  const s = OPEN_SINCE.get(cs);
  if (!s || s.id !== card.id) { OPEN_SINCE.set(cs, { id: card.id, since: now }); return false; }
  return now - s.since >= Math.max(COACH_HUNT_OPEN_MS, 2 * readMs(card));
}

/* ── LONG ENOUGH TO READ (designer playtest 2026-10-24: "Your hero fights alone" and "That's a level" were never on
   screen; the first kill lands 3 s in) ── A card the SERVER finishes on its own (AUTO_KINDS: the first kill, a level)
   stays up for its reading time before the next replaces it, and a card of that kind the server passed while an
   earlier one was being read gets its turn too, in order. A card the PLAYER finishes (Enter, Save, Plant) gives way at
   once: they did what it asked. Display scratch per CharacterSession (a reload shows the server's card at once);
   it gates and spends nothing. No clock in the context (a test, a pure render): the server's card as it is. */
const HELD = new WeakMap();
const ORDER = new Map(HUNT_TUTORIAL.map((r, i) => [r.id, i]));
const auto = (r) => !!r && !!r.done && AUTO_KINDS.includes(r.done.kind);

/** How long a card stays up before a later one replaces it: about 4 words a second, 4 to 9 s. */
export function readMs(card) {
  const words = String(card.title + ' ' + card.text).split(/\s+/).filter(Boolean).length;
  return Math.max(4000, Math.min(9000, 1500 + words * 250));
}

/* ── THE SHELL'S FACTS (the lane 1 / lane 2 interface, src/session/tutorial-sections.js header) ──
   What only the shell knows, computed with the SAME function its control uses, so a card and its button never
   disagree: the reads and the cards taught on another hero (the ACCOUNT's, src/session/account-coach.js), the account's heroes (the roster the server last read plus the open
   CharacterSessions, which are fresher), the slots owned and the play-at-once limit (the server's, never a fallback),
   what Sell all loot would sell (bag-model.js lootSale) and what Equip upgrades would put on (upgrade-line.js). A
   field the shell cannot know is null, and the card that needs it is passed by (never a wall). Kept per character
   while the records it read are the same objects (every envelope and residue write replaces a record) and the account's coach is unchanged. */
const FACTS = new WeakMap();
/** The cards this ACCOUNT has read (Got it, or on screen long enough, on any of its heroes), or null when this client cannot record one. */
export function coachReadOf(cs) {
  const c = coachOf(cs);
  return c ? new Set(c.read) : null;
}
/* what the account's coach holds, so a fact read on one hero is read again when another hero is taught or reads a card */
const coachKey = (cs) => { const c = coachOf(cs); return c ? c.v + ':' + c.read.size + ':' + c.taught.size : ''; };
const huntOpenOf = (c) => { const h = huntOf(c); return !!h && !h.ended; };
/** The shell's facts for `cs` (pointerCardOf's second argument). `account`: the AccountSession, or null. */
export function coachFactsOf(cs, account) {
  if (!cs) return {};
  const open = account && typeof account.characters === 'function' ? account.characters() : [];
  const memo = FACTS.get(cs);
  if (memo && cs.record && memo.record === cs.record && memo.account === account && memo.coach === coachKey(cs) && memo.open.length === open.length
    && memo.open.every((x, i) => x.cs === open[i] && x.record === open[i].record)) return memo.sh;
  const rows = account && typeof account.lastRoster === 'function' ? account.lastRoster() : null;
  let roster = null;
  if (rows || open.length) {
    const by = new Map();
    for (const r of rows || []) if (r.exists) by.set(r.slot, { slot: r.slot, level: r.level, name: r.name, open: false, hunting: null });
    for (const c of open) {
      const lv = levelOf(c);
      by.set(c.slot, { slot: c.slot, level: lv ? lv.level : (by.get(c.slot) || {}).level ?? null, name: nameOf(c) || (by.get(c.slot) || {}).name || null,
        open: true, hunting: huntOpenOf(c) });
    }
    roster = Array.from(by.values()).sort((a, b) => a.slot - b.slot);
  }
  const bag = bagOf(cs), shop = shopOf(cs), eq = equipmentOf(cs);
  const sh = {
    read: coachReadOf(cs),
    /* the cards hidden with Got it are passed by in the chain, so the next card shows (hunt-tutorial.js currentCard) */
    hid: coachHidOf(cs),
    /* the cards another hero of this account was taught: passed by too (an account lesson is taught once, chapter 08 section 2.6) */
    taught: taughtElsewhere(cs, HUNT_TUTORIAL),
    roster,
    slotsOwned: rows ? rows.length : null,
    playLimit: account && typeof account.statedLimit === 'function' ? account.statedLimit() : null,
    sellable: bag && shop ? lootSale(bag, rulesOf(cs), shop, upgradeNeeds(homeOf(cs), chestsOf(cs))).lines.length : null,
    upgrades: bag && eq ? upgradeOf(cs).picks.map((p) => p.id) : null,
    back: (cs.record && cs.record.residue && cs.record.residue.coach && cs.record.residue.coach.back) || null,
    /* the party pitch's ground: where the Hunts window's party advice sends a party of this hero's Level (the server's), null when none suits */
    partyGround: partyGroundFor((levelOf(cs) || {}).level),
  };
  if (cs.record) FACTS.set(cs, { record: cs.record, account, coach: coachKey(cs), open: open.map((c) => ({ cs: c, record: c.record })), sh });
  return sh;
}

/** Record `card` as read for the ACCOUNT (src/session/account-coach.js, display state): its Got it press, or a card the
    player only has to read once it has been on screen its reading time. True when written. */
export function markCoachRead(cs, card) {
  const c = coachOf(cs);
  return !!c && !!card && c.mark('read', [card.id]);
}

/* ── NO TIP IS MANDATORY (Tyler 2026-11-11) ── The player's "Show tips" switch (src/data/tips.js: one pick for every open
   hero, the newest wins, src/session/player-switch.js) and, per character, the cards a server fact finishes that the player
   pressed Got it on (residue `coach.hid`). Both display state: the tutorial's own progress is the server's. A card hidden here
   is passed by in the chain (coachFactsOf hands `hid` to hunt-tutorial.js currentCard), so the next card whose conditions hold
   shows at once (2026-11-18). A HIDE HOLDS FOR ITS VISIT (visitOf: the hunt session, in it or home; retention dive 2026-11-20 R5, Got it means later). */
const heroesOf = (ctx) => {
  const all = ctx.account && typeof ctx.account.characters === 'function' ? ctx.account.characters() : [];
  return !ctx.character || all.includes(ctx.character) ? all : all.concat(ctx.character);
};
/** Are the tips on for this player (the coach's cards here, the town criers in chat)? */
export function tipsOn(ctx) { return switchOn(heroesOf(ctx), TIPS); }
const visitOf = (cs) => { const h = huntOf(cs); return (h && h.sessionId ? String(h.sessionId).slice(0, 56) : 'none') + (h && h.huntId && !h.ended ? ':in' : ':town'); };
/** The cards this character hid with Got it on this visit (ids), or null when this client cannot record one. */
export function coachHidOf(cs) {
  if (!cs || !cs.record || typeof cs.setResidue !== 'function') return null;
  const r = cs.record.residue && cs.record.residue.coach;
  return new Set(r && Array.isArray(r.hid) && r.hidIn === visitOf(cs) ? r.hid : []);
}
/** Record `card` as hidden for this character on this visit (residue `coach.hid` and `coach.hidIn`, display state). True when written. */
export function markCoachHid(cs, card) {
  const hid = coachHidOf(cs);
  if (!hid || !card || hid.has(card.id)) return false;
  const r = (cs.record.residue && cs.record.residue.coach) || {};
  return cs.setResidue('coach', Object.assign({}, r, { hid: Array.from(hid).concat(card.id).slice(-COACH_HID_MAX), hidIn: visitOf(cs) }));
}

/* A card a read finishes (read on sight, or its Got it): the player may close it, which records the read. A card that
   finishes on a server fact cannot be closed by a click (CLAUDE.md §6: its done is the server's); it only folds. */
const readable = (card) => !!card && !!card.done && (card.done.kind === 'read'
  || (card.done.kind === 'any' && card.done.of.some((d) => d.kind === 'read')));
/* A card read on sight: it finishes on its read and has no Got it (you ate, you drank, stamina is low). */
const readOnSight = (card) => readable(card) && !card.gotIt;
const SIGHT = new WeakMap();
/** Whether `card` is on screen in any of `roots`, open OR folded to its tab: a folded read-on-sight card is read on
 *  its tab too, or it would sit there forever (Tyler 2026-10-28, "Your hero just drank" stuck folded). */
export function coachOnScreen(roots, card) {
  return !!card && roots.some((r) => !!r && !!r.querySelector('.hs-pointer[data-tutorial="' + card.id + '"]'));
}
/**
 * The display tick's read-on-sight clock: `onScreen` = the card is on screen now, open or folded (coachOnScreen). A
 * read-on-sight card that has stayed on screen its reading time is recorded read (markCoachRead) and gives way.
 * True when written.
 */
export function noteCoachSight(ctx, card, onScreen) {
  const cs = ctx.character;
  const now = typeof ctx.now === 'function' ? ctx.now() : null;
  if (!cs || now === null || !readOnSight(card) || !onScreen) { if (cs) SIGHT.delete(cs); return false; }
  const s = SIGHT.get(cs);
  if (!s || s.id !== card.id) { SIGHT.set(cs, { id: card.id, since: now }); return false; }
  if (now - s.since < readMs(card)) return false;
  SIGHT.delete(cs);
  return markCoachRead(cs, card);
}

/* a "What next" goal comes after every card */
const rankOf = (c) => (ORDER.has(c.id) ? ORDER.get(c.id) : HUNT_TUTORIAL.length);
/* TELEMETRY (display only, each once per hero and card in a page load): the coach moved to `to`. A card of the tutorial is
   `shown` as it appears; the one it gave way to is `done` when `to` comes AFTER it (going back is not progress). */
function noteCard(cs, from, to) {
  const slot = cs.slot;
  /* a card this hero moved past is taught for the account: every other hero passes it by (account-coach.js taughtElsewhere) */
  if (from && ORDER.has(from.id) && rankOf(to) > rankOf(from) && coachOf(cs)) coachOf(cs).mark('taught', [from.id]);
  if (from && ORDER.has(from.id) && rankOf(to) > rankOf(from)) trackOnce('tutorial_card', { slot, card: from.id, state: 'done' }, slot + ':' + from.id + ':done');
  if (ORDER.has(to.id)) trackOnce('tutorial_card', { slot, card: to.id, state: 'shown' }, slot + ':' + to.id + ':shown');
}

/** The card the coach shows now: the server's (pointerCardOf, with the shell's facts: ctx.account), or one still
 *  being read (above). */
/** The held card when it is a STEP to take (the summary's Next press), null for a tip: a knowledge card only teaches, and
    "Next: Every weapon is a style" named nothing to do (first-30 play 2026-11-12). */
export function heldStep(ctx) {
  const c = ctx.character ? heldCard(ctx) : null;
  return c && c.done && !c.knowledge ? c : null;
}

export function heldCard(ctx) {
  const cs = ctx.character;
  /* tips off: nothing shown and nothing rung (the server's chain still moves on its own facts) */
  if (cs && !tipsOn(ctx)) { HELD.delete(cs); return null; }
  /* a card hidden with Got it is never the pointer's, nor HELD for its reading time: a press always acts ("Fights on its own" ignored Got it, 2026-11-20) */
  const sh = cs ? coachFactsOf(cs, ctx.account || null) : undefined, card = pointerCardOf(cs, sh), gone = (c) => !!(sh && sh.hid && sh.hid.has(c.id));
  const now = typeof ctx.now === 'function' ? ctx.now() : null;
  if (!cs || now === null) return card;
  const had = HELD.get(cs);
  const show = (c, since) => { if (!had || had.card.id !== c.id) noteCard(cs, had ? had.card : null, c); HELD.set(cs, { card: c, since }); return c; };
  if (!card) { HELD.delete(cs); return null; }
  if (!had || had.card.id === card.id) return show(card, had ? had.since : now);
  const from = rankOf(had.card), to = rankOf(card);
  /* back, or a goal line after a goal line: the server's at once */
  if (to <= from) return show(card, now);
  if (auto(had.card) && !gone(had.card) && now - had.since < readMs(had.card)) return had.card;
  const passed = HUNT_TUTORIAL.slice(from + 1, to).find((r) => auto(r) && !gone(r));
  return passed ? show(passed, now) : show(card, now);
}

/* GOT IT GIVES THE SHEET BACK (panel 2026-11-01: the Shop's next card landed at once, 40 px of list left): on a phone, after a
   Got it in a window, the next card there stays folded to its tab until the window closes (renderLaunchers) or the tab is
   pressed (actCoach). Display only. */
const RESTED = new WeakMap();
/* The card whose other goals are showing, per character (display only): the row repaints from its html, so the open state can't live in the DOM alone. */
const ALSO_OPEN = new WeakMap();

/** The coach box for `card` (folded to its title, or open), the same wherever it is drawn. Open, its words are their
 *  own box (.hs-coach-text): on a phone a long card scrolls there, under its title and its dash (shell.css). `inWin`:
 *  drawn inside the window the card points into, where it says its words for there (card.textIn: "Press Enter",
 *  never "Open Hunts" over the open Hunts, board 2026-10-25 #20). */
export function coachHtml(cs, card, inWin, rest) {
  if (inWin && card.textIn) card = Object.assign({}, card, { text: card.textIn });
  const folded = coachFoldOf(cs, card);
  const fresh = folded.fresh, min = folded.min || !!rest || (!!inWin && RESTED.get(cs) === coachWindow(card));
  /* Close (x): only where a read finishes the card and this client can record it; it records the read. */
  const close = readable(card) && coachReadOf(cs) ? '<button type="button" class="hs-coach-close" data-hs-act="coach-close" aria-label="'
    + esc(t('coach.close_card', { title: card.title })) + '" title="' + esc(t('coach.close')) + '"></button>' : '';
  /* data-coach: what the box shows (the card, folded or not, marked or not); the hunt bar redraws when it changes. */
  /* ONE LINE INSIDE A WINDOW (newcomer panel 2026-11-01: at 1366x768 a window under its card showed 1 to 3 rows): the ring shows the
     control, the words run to the line's end, and More (fitCoachLine: only when they don't fit) opens the whole card for that window's stay. */
  const line = !!inWin && !min;
  const head = '<p class="hs-pointer' + (min ? ' is-min' : '') + (line ? ' is-line' : '') + (close ? ' has-close' : '') + '" role="note" data-tutorial="' + esc(card.id) + '" data-coach="'
    + esc(card.id + (min ? (fresh ? ':new' : ':min') : '')) + '"' + (card.anchor ? ' data-anchor="' + esc(card.anchor) + '"' : '') + '>';
  if (min) {
    return head + '<button type="button" class="hs-coach-tab" data-hs-act="coach-open" aria-expanded="false" aria-label="'
      + esc(t(fresh ? 'coach.show_new' : 'coach.show', { title: card.title })) + '">' + esc(card.title)
      + (fresh ? '<i class="hs-coach-new" aria-hidden="true"></i>' : '') + '</button>' + close + '</p>';
  }
  /* NO TIP IS MANDATORY (Tyler 2026-11-11): every card has a Got it and a "Don't show tips". Got it finishes a card that
     teaches (residue `coach.read`, markCoachRead) and hides one a server fact finishes (residue `coach.hid`, markCoachHid:
     the chain's progress stays the server's). Don't show tips turns the player's switch off (src/data/tips.js). Both are
     offered only where this client can record the press, so neither is ever a button that does nothing. */
  const foot = coachReadOf(cs) ? '<span class="hs-coach-foot"><button type="button" class="hs-coach-off" data-hs-act="coach-off">' + esc(t('coach.no_tips'))
    + '</button><button type="button" class="hs-coach-got" data-hs-act="coach-got">' + esc(t('coach.got_it')) + '</button></span>' : '';
  /* WHAT NEXT IS ONE GOAL: the others stay one press away, under More, and shut again with each new goal. */
  const also = Array.isArray(card.also) && card.also.length ? card.also : null;
  const open = !!also && ALSO_OPEN.get(cs) === card.id;
  return head + '<button type="button" class="hs-coach-min" data-hs-act="coach-min" aria-expanded="true" aria-label="'
    + esc(t('coach.minimize_card', { title: card.title })) + '" title="' + esc(t('coach.minimize')) + '"></button>' + close + '<b>' + esc(keepLastWords(card.title)) + '</b> <span class="hs-coach-text">' + esc(card.text) + '</span>'
    + (line ? ' <button type="button" class="hs-coach-more" data-hs-act="coach-more" aria-expanded="false" hidden>' + esc(t('coach.more')) + '</button>' : '')
    + (also ? ' <button type="button" class="hs-coach-more" data-hs-act="coach-more" aria-expanded="' + open + '">' + esc(t(open ? 'coach.less' : 'coach.more')) + '</button><span class="hs-coach-also"' + (open ? '' : ' hidden') + '>'
      + also.map((g) => '<span class="hs-coach-goal">' + esc(g) + '</span>').join('') + '</span>' : '')
    + foot + '</p>';
}

/* A one-line card shows at least this much of its words (px), or it is no line: the card stands whole. */
const LINE_WORDS_MIN_PX = 120;

/** A window's one-line card offers More only when its words do not fit. Reads one element's width, writes only a change.
    A LINE WITH NO ROOM FOR ITS WORDS IS NO LINE (post-140 audit C12: in the Farm window the title, More and Got it took the whole
    line, "Press Plant on each empty plot" had 0 px, and More opened a card that only said those words): when the line would show
    less than LINE_WORDS_MIN_PX of words it cannot show whole, the card stands whole for this window's stay, with no More. */
export function fitCoachLine(slot) {
  const p = slot.querySelector(':scope > .hs-pointer');
  const more = p && p.querySelector(':scope > .hs-coach-more');
  if (!more) return;
  if (p.getAttribute('data-fit') === 'whole') { if (!more.hidden) more.hidden = true; return; }
  const words = p.querySelector(':scope > .hs-coach-text');
  if (p.classList.contains('is-line') && words.clientWidth < Math.min(words.scrollWidth, LINE_WORDS_MIN_PX)) {
    p.setAttribute('data-fit', 'whole');
    p.classList.remove('is-line');
    more.hidden = true;
    return;
  }
  const off = p.classList.contains('is-line') && words.scrollWidth <= words.clientWidth;
  if (more.hidden !== off) more.hidden = off;
}

/**
 * THE COACH FOLDS (Tyler 2026-10-24: "need an option to minimize"). The residue `coach` (a display preference,
 * per character: src/session/residue.js) holds { min, seen }: folded, the line is its title alone, a tab the player
 * presses to open it again; `seen` is the card the player last had in front of them, so a NEW card (the next
 * tutorial step, a new goal) marks the folded tab without opening it. Gates and spends nothing.
 */
export function coachFoldOf(cs, card) {
  const r = cs && cs.record && cs.record.residue ? cs.record.residue.coach : null;
  const min = !!r && r.min === true;
  return { min, fresh: min && !!card && r.seen !== card.id };
}

/**
 * The coach as a child of a built-once box (the hunt top bar): redrawn only when what it shows changes (data-coach
 * names the card AND its fold, so a fold, an open or a new card redraws it; a display tick never does).
 */
export function placeCoach(el, html) {
  const have = el.querySelector(':scope > .hs-pointer');
  const key = (/data-coach="([a-z0-9_:]+)"/.exec(html) || [])[1] || null;
  if (have && have.getAttribute('data-coach') !== key) have.remove();
  if (key && !(have && have.getAttribute('data-coach') === key)) el.insertAdjacentHTML('beforeend', html);
  else if (key) sameCardWords(have, html);
}

/* The same card on screen keeps its box, and its words follow the server's numbers: "You have 19 left" stood over a bar
   reading 6 for the whole hunt (door panel 2026-11-04). Only a changed card is read, so a display tick does no work. */
const SAID = new WeakMap();
function sameCardWords(have, html) {
  if (SAID.get(have) === html) return;
  SAID.set(have, html);
  const was = have.querySelector(':scope > .hs-coach-text');
  if (!was) return;   // folded to its title: no words to follow
  const tpl = have.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const now = tpl.content.querySelector('.hs-pointer > .hs-coach-text');
  if (now && was.textContent !== now.textContent) was.textContent = now.textContent;
  /* the goals behind More follow the same numbers, open or shut */
  const said = have.querySelectorAll(':scope > .hs-coach-also > .hs-coach-goal'), goals = tpl.content.querySelectorAll('.hs-pointer > .hs-coach-also > .hs-coach-goal');
  if (said.length === goals.length) goals.forEach((g, i) => { if (said[i].textContent !== g.textContent) said[i].textContent = g.textContent; });
}

/** The coach's fold, open, Got it and close presses, from wherever it is drawn (this row, the hunt top bar, a window).
 *  Close records the read of a card a read finishes; any other card it only folds. True when handled. */
export function actCoach(ctx, el, action, ev) {
  if (actTimeOffer(ctx, el, action, ev)) return true;
  if (action !== 'coach-min' && action !== 'coach-open' && action !== 'coach-got' && action !== 'coach-close' && action !== 'coach-more' && action !== 'coach-off') return false;
  if (ev.type !== 'click') return true;
  /* the whole card, or its one line again: this box only (a new card or a new opening starts as one line) */
  if (action === 'coach-more') {
    const p = el.querySelector('.hs-pointer'), b = p && p.querySelector(':scope > .hs-coach-more');
    const also = p && p.querySelector(':scope > .hs-coach-also');
    if (b) {
      const open = also ? (also.hidden = !also.hidden, !also.hidden) : p.classList.toggle('is-line') === false;
      b.textContent = t(open ? 'coach.less' : 'coach.more');
      b.setAttribute('aria-expanded', String(open));
      if (also && ctx.character) { if (open) ALSO_OPEN.set(ctx.character, p.getAttribute('data-tutorial')); else ALSO_OPEN.delete(ctx.character); }
    }
    return true;
  }
  const cs = ctx.character;
  const card = cs && heldCard(ctx);
  if (!card || typeof cs.setResidue !== 'function') return true;
  if (action === 'coach-open') RESTED.delete(cs);
  if (action === 'coach-got') {
    /* THE PRESS ANSWERS THE CARD IT WAS DRAWN ON: the box redraws on a paint or the display tick, so the next card may already be the held one
       under a box still showing the last, and its Got it would finish a card nobody read (a skipped step, QA 2026-11-04). */
    const on = ev.target && ev.target.closest ? ev.target.closest('.hs-pointer') : null;
    if (on && on.getAttribute('data-tutorial') !== card.id) return true;
    if (ctx.isPhone && ctx.isPhone() && coachWindow(card)) RESTED.set(cs, coachWindow(card));
    /* a card that teaches is read; one a server fact finishes is hidden until that fact (Tyler 2026-11-11: never mandatory) */
    if (card.gotIt || readable(card)) markCoachRead(cs, card); else markCoachHid(cs, card);
    return true;
  }
  /* DON'T SHOW TIPS: the player's switch off, into every open hero (src/data/tips.js); Settings > Interface turns it back on */
  if (action === 'coach-off') { setSwitch(heroesOf(ctx), TIPS, false, serverNowOf(cs)); return true; }
  if (action === 'coach-close') { if (readable(card)) { markCoachRead(cs, card); return true; } action = 'coach-min'; }
  const doc = el.ownerDocument;
  const hadFocus = !!doc && !!doc.activeElement && el.contains(doc.activeElement);
  /* Opening clears the mark: the card the player now sees is the one they have seen. The reads are the account's and do not move. */
  /** @type {{ back?: string, backAt?: number, hid?: string[], hidIn?: string }} */
  const keep = {};
  const r = cs.record && cs.record.residue && cs.record.residue.coach;
  if (r && r.back) { keep.back = r.back; if (Number.isSafeInteger(r.backAt)) keep.backAt = r.backAt; }
  if (r && Array.isArray(r.hid) && r.hid.length && typeof r.hidIn === 'string') { keep.hid = r.hid.slice(); keep.hidIn = r.hidIn; } // a fold keeps this visit's hides
  cs.setResidue('coach', Object.assign(action === 'coach-min' ? { min: true, seen: card.id } : { seen: card.id }, keep));
  /* The box is redrawn on the residue change (one repaint per task): keep the keyboard on the coach's control. */
  if (hadFocus) queueMicrotask(() => { const b = el.querySelector('[data-hs-act^="coach-"]'); if (b) b.focus(); });
  return true;
}

/** The icon the coach rings in the icon row (coachIcon of the held card), once a card rested in a window that has shut lets go. */
export function rowRing(ctx, open) {
  if (ctx.character && RESTED.has(ctx.character) && !open.has(RESTED.get(ctx.character))) RESTED.delete(ctx.character);
  return ctx.character ? coachIcon(heldCard(ctx), (id) => open.has(id)) : null;
}

/* The group a window's icon lives in, or null (its icon stands in the row): the ring's way reaches a grouped window through it. */
const groupOfWindow = (id) => { const r = SHELL_WINDOWS.find((w) => w.id === id); return r && 'group' in r && r.group ? r.group : null; };

/* ── THE COACH'S GOLD RING (designer playtest 2026-10-24, 5/10 desktop, 4/10 phone: no card rang a real control) ──
   Huntera's quick start (memory `huntera-tutorial-model`, mechanics only) rings the very control the card names.
   ONE control on screen carries `data-coach-ring` (src/styles/shell.css: a pixel gold ring, no glow): the deepest
   step of the card's way that is on screen now, e.g. Hunts' icon -> the Mill Cellar's line -> Enter. The icon row
   draws its own ring (renderLaunchers, coachIcon). A card whose controls live in a window shows inside it
   (src/shell/shell.js, hunt-tutorial.js coachWindow). Display only: gates, spends and stores nothing (CLAUDE.md §6). */
const inWin = (id, q) => '[data-hs-win="' + id + '"] ' + q;

/**
 * THE RING'S WAY: the selectors of the controls `card` names, deepest first (the first one on screen is ringed).
 * `at`: { open(id) the window is open, configuring: the bar slot Configure action has open (or null), weight: the
 * armor weight Tamsin pays in is chosen (the server's), or null when unknown }. Pure. [] = nothing to ring.
 */
export function ringPlan(card, at) {
  if (!card) return [];
  const g = card.ring || {};
  const open = (id) => !!at && typeof at.open === 'function' && at.open(id);
  const icon = coachIcon(card, open);
  if (icon) {
    /* A CARD ABOUT THE RETURN RINGS ITS ROW ON THE OPEN HUNT SUMMARY (UX flow audit 2026-11-11, flow C: "Sell what only pays coin" rings the
       summary's Sell step, never the summary's gold press and not the Shop's icon while that row is on screen): of the card's hooks, those
       inside a window that is OPEN come before the icon of the closed window its way starts in, deepest first. */
    const near = (card.hooks || []).filter((q) => { const m = /^\[data-hs-win="([a-z0-9-]+)"\]/.exec(q); return !!m && open(m[1]); }).reverse();
    /* a grouped window's icon is an item of its group's menu: that item while the menu is open, else the group's own icon */
    const group = groupOfWindow(icon);
    return near.concat(['.hs-launchers [data-hs-open="' + icon + '"]'], group ? ['.hs-launchers [data-hs-group="' + group + '"]'] : []);
  }
  switch (card.anchor) {
    case 'hunt_picker': {
      /* the ground the card enters, or the one its words name (ring.hunt: the first Dangerous run); a card naming none rings nothing in the window */
      const hunt = (card.done && card.done.hunt) || g.hunt || null;
      if (!hunt) return [];
      /* a card that names a tier (ring.tier) rings it on that ground's page until it is pressed; then, as every hunt card, Enter while the
         ground is the picked one and on screen; else its line (a phone shows the list first); on a phone showing ANOTHER ground's page, the
         way back to the list */
      const tier = g.tier ? [inWin('hunts', '.hw-tiers.is-on [data-tier="' + g.tier + '"][data-hunt="' + hunt + '"][aria-pressed="false"]:not([hidden])')] : [];
      return [...tier, inWin('hunts', '.hw-hunt-enter[data-hunt="' + hunt + '"]:not([disabled])'),
        inWin('hunts', '.hw-hunt[data-hunt="' + hunt + '"]'), '[data-hs-win="hunts"]:not(:has(.hw-hunt-enter[data-hunt="' + hunt + '"])) .hs-win-head .hs-back'];
    }
    case 'hunt_topbar': return ['[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]:not([disabled])'];
    case 'action_bar': {
      if (!Number.isInteger(card.barSlot)) return [];
      if (!(open('configure-action') && at.configuring === card.barSlot)) return ['[data-hs-widget="action-bar"] .hb-slot[data-slot="' + card.barSlot + '"]'];
      /* Inside Configure action on the card's slot: the control the card names (its hooks: the store rune to pick, the
         HP condition's −) until the player has changed the slot as the words ask (down to the card's goal HP: "press −
         until it reads 50%"), then Save. A card that only teaches rings nothing. */
      const save = inWin('configure-action', '[data-x="save"]:not([disabled])');
      if (at.edited && !(Number.isFinite(card.goal) && Number.isFinite(at.cond0) && at.cond0 > card.goal)) return [save];
      const hooks = card.hooks || [];
      return hooks.length ? hooks.concat(save) : card.gotIt || readOnSight(card) ? [] : [save];
    }
    case 'farm':
      return [inWin('farm', '.hw-seeds .hw-line[data-crop="' + g.crop + '"] [data-hs-act="sow"]:not([disabled])'),
        inWin('farm', '.hw-plot.is-empty [data-hs-act="plant"]')];
    case 'crafting':
      /* its Start (once it runs, nothing: the card moves on with the first XP); the skill in the ledger; from ANOTHER
         skill's page, the way back to the ledger */
      return [inWin('skills-trade', '.hw-work.is-on .hw-work-row[data-id="' + g.work + '"] [data-hs-act="work-go"]:not([disabled])'),
        inWin('skills-trade', '.hw-skill[data-key="' + g.skill + '"]'),
        inWin('skills-trade', '.hw-work.is-on:not(:has(.hw-work-row[data-id="' + g.work + '"])) [data-hs-act="work-back"]')];
    case 'tally':
      /* Her window asks for the weight that suits on a first visit (tally.js suggestedWeight), so Take is rung while it can fire; off (the server has not said the role), the picker,
         or the Change press over her board that opens it while it is folded (the picker sits behind Change since the 11-11 ledger) */
      return [inWin('tally', '[data-hs-act="take"][data-task="' + g.task + '"]:not([disabled])'),
        ...(at.weight === false ? [inWin('tally', '.ht-weights'), inWin('tally', '[data-hs-act="to-weight"]:not([hidden])')] : [])];
    /* Every other anchor rings the card's own hooks (src/data/hunt-tutorial.js, tokens written by cardFor). They are
       written in the order the player meets them, so the deepest that is on screen comes first: the Shop's Sell tab ->
       Sell all loot -> its confirmation's Sell; Characters -> Create hero. */
    default: return (card.hooks || []).slice().reverse();
  }
}

/* On screen: laid out, and not inside anything hidden. */
const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');

/* The bar slot Configure action has open (src/shell/bar-draft.js), and whether the player has changed it from the
   server's slot (its action or conditions): { configuring, edited }. */
function barEditOf(cs) {
  const d = cs ? draftOf(cs) : null;
  if (!d || !Number.isInteger(d.open) || !d.draft) return { configuring: null, edited: false, cond0: null };
  const bar = serverBar(cs);
  const cur = bar ? bar[d.open] : null;
  const say = (s) => JSON.stringify([s.action || null, s.conditions || [], s.store || null]);
  const c0 = Array.isArray(d.draft.conditions) && d.draft.conditions[0] ? d.draft.conditions[0].value : null;
  return { configuring: d.open, edited: cur ? say(cur) !== say(d.draft) : !!(d.draft.action && d.draft.action.id), cond0: Number.isFinite(c0) ? c0 : null };
}

/**
 * Ring `card`'s control in `roots` (the shell's boxes: the World shell, the screen layer, and the screen around them:
 * the character strip): the first selector of its way that is on screen gets `data-coach-ring`, and every other
 * element loses it. Answers the ringed element or null.
 */
export function ringCoach(ctx, card, roots) {
  const cs = ctx.character;
  const tl = cs && tallyOf(cs);
  const bar = barEditOf(cs);
  const plan = ringPlan(card, { open: (id) => ctx.wm.isOpen(id), configuring: bar.configuring, edited: bar.edited, cond0: bar.cond0, weight: tl ? !!tl.weight : null });
  let target = null;
  for (const q of plan) {
    for (const r of roots) { const el = r.querySelector(q); if (el && shown(el)) { target = el; break; } }
    if (target) break;
  }
  for (const r of roots) for (const el of r.querySelectorAll('[data-coach-ring]')) if (el !== target) el.removeAttribute('data-coach-ring');
  /* a ring that lands below a window's fold (Tamsin's Take under her weight row, a ground low in the list) is scrolled
     into view inside its window, once, as it lands: only the window's own scroll box moves, never the page or the World */
  if (target && !target.hasAttribute('data-coach-ring')) { target.setAttribute('data-coach-ring', ''); revealInWindow(target); }
  return target;
}
