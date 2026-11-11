// ════════════════════════════════════════════════════════════════════════
// src/shell/goto.js — TAKE ME THERE: A LINK FROM A LINE THAT SAYS WHERE TO GET SOMETHING TO THE WINDOW THAT DOES IT.
//
// Tyler 2026-11-08, on the Farm's "No seeds" row: "there should be a direct line to click from here and get to the
// shop." Every line that names a place (the Farm's seed rows, the Tempering note, a bench row short of an input, the
// bag's picked item) says it with a link built here, and every link takes ONE door, window-manager.js goTo: the window
// opens (or is raised) on its tab, and the row the link names is brought into view and ringed a moment (the window
// marks its rows data-hs-find; shell.js calls seekRow after each repaint). A link is a real button: Tab reaches it,
// Enter and Space press it, a phone taps it, and on a phone the sheet it opens takes the place of the one it was in.
//   targetOf(place)          a place (item-lore.js wherePlaces / usePlaces) -> { win, tab?, find? }, or null when it has
//                            no window (a ground no one can walk, a skill with no bench door)
//   linkHtml(words, target)  the link's markup; plain words when there is no target
//   gotoAttr(target)         the same link as an attribute, for a row pressed whole (a creature on a hunt's page)
//   placesParts(places)      places as sentences, each a link: "Made with Crafting 21. Sold at the shop."
//   patchParts(el, parts)    a line of words and links (strings, and { words, target } pieces), rewritten only when it changed
//   followGoto(ctx, el)      a pressed link: goTo, then repaint that window
//   seekRow(wm, id, body)    after a repaint: the row a link asked for, once it is drawn and shown, into view and ringed
//   ownsKey(ev)              Enter on a focused link presses it (the shell's Enter opens Chat everywhere else)
// Display only: a link sends nothing; the window it opens reads the server's numbers as it always does.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.119';
import { revealInWindow } from './widgets/bits.js?v=0.2.119';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.119';
import { GATHER_INDEX, BENCH_INDEX } from './town-work.js?v=0.2.119';

const ATTR = 'data-hs-goto';
const FIND = 'data-hs-find';
/** How long the found row stays ringed (windows.css .is-found runs the same 2.4 s). */
export const FOUND_MS = 2400;
const WIN = /^[a-z][a-z0-9_-]*$/;
const KEY = /^[a-z0-9][a-z0-9_.:-]*$/;

/* The skills with a door in the Gathering and crafting window: a gathering or crafting skill with rows the engine runs (work.js hasWork). */
const DOORS = new Set([...Object.values(GATHER_INDEX), ...Object.values(BENCH_INDEX)].map((r) => r.skill)
  .filter((s) => SKILLS_DEF[s] && (SKILLS_DEF[s].cat === 'gather' || SKILLS_DEF[s].cat === 'artisan')));

/** The window a place opens: { win, tab, find } (tab and find may be null), or null when no window does it. */
export function targetOf(place) {
  if (!place) return null;
  if (place.kind === 'work') return DOORS.has(place.skill) ? { win: 'skills-trade', tab: place.skill, find: place.row || null } : null;
  if (place.kind === 'shop') return { win: 'shop', tab: 'buy', find: place.item };
  if (place.kind === 'temper') return { win: 'shop', tab: 'services', find: null };
  if (place.kind === 'market') return { win: 'market', tab: 'browse', find: null };
  if (place.kind === 'hunt') return place.hunt ? { win: 'hunts', tab: place.hunt, find: null } : null;
  if (place.kind === 'farm' || place.kind === 'house') return { win: place.kind, tab: null, find: null };
  return null;
}

const keyOf = (g) => [g.win, g.tab || '', g.find || ''].join('|');
/** The attribute value back into a target, or null when it is not one. */
function parseGoto(v) {
  const [win, tab, find] = String(v || '').split('|');
  if (!WIN.test(win || '') || (tab && !KEY.test(tab)) || (find && !KEY.test(find))) return null;
  return { win, tab: tab || null, find: find || null };
}

/** A link reading `words` to `target`; with no target, just the words. */
export function linkHtml(words, target) {
  if (!target || !WIN.test(target.win)) return esc(words);
  return '<button type="button" class="hs-goto" ' + ATTR + '="' + esc(keyOf(target)) + '">' + esc(words) + '</button>';
}

/** The attribute that makes any element a link to `target` ('' with no target): a row that is pressed whole, around its own real button. */
export const gotoAttr = (target) => (target && WIN.test(target.win) ? ' ' + ATTR + '="' + esc(keyOf(target)) + '"' : '');

/** A place's words as a link to its window (or plain words): the piece patchParts takes. */
export const placeLink = (p) => ({ words: p.words, target: targetOf(p.place) });
/** Places as one run of sentences, each a link: "Made with Crafting 21. Dropped by Rat at Mill Cellar." ([] for none). */
export function placesParts(places) {
  const out = (places || []).flatMap((p, i) => (i ? ['. ', placeLink(p)] : [placeLink(p)]));
  return out.length ? out.concat(['.']) : [];
}

const LAST = new WeakMap();
/** Write a line of words and links into `el`, only when it differs from what it holds (an idle repaint writes nothing). */
export function patchParts(el, parts) {
  if (!el) return;
  const html = (parts || []).map((p) => (typeof p === 'string' ? esc(p) : linkHtml(p.words, p.target))).join('');
  if (LAST.get(el) === html) return;
  LAST.set(el, html);
  el.innerHTML = html;
}

/** Follow a pressed link: the window opens on its tab and is asked for its row. False when `el` is not a link. */
export function followGoto(ctx, el) {
  const g = el && el.getAttribute ? parseGoto(el.getAttribute(ATTR)) : null;
  if (!g || el.disabled || !ctx || !ctx.wm || typeof ctx.wm.goTo !== 'function' || !ctx.wm.goTo(g.win, g)) return false;
  if (typeof ctx.refresh === 'function') ctx.refresh(g.win);
  return true;
}

/** Enter on a focused link is the link's (a button presses on Enter), never the shell's Chat key. */
export const ownsKey = (ev) => !!ev && ev.key === 'Enter' && !!ev.target && typeof ev.target.closest === 'function' && !!ev.target.closest('[' + ATTR + ']');

/** The row a link asked window `id` for, once drawn and shown in `body`: brought into view inside the window and ringed. */
export function seekRow(wm, id, body) {
  const want = wm && typeof wm.wantsFind === 'function' ? wm.wantsFind(id) : null;
  if (!want || !body) return false;
  const row = Array.from(body.querySelectorAll('[' + FIND + ']')).find((el) => el.getAttribute(FIND) === want && el.getClientRects().length > 0);
  if (!row) return false;
  wm.takeFind(id);
  /* after the frame is placed and sized (paintWindows sets the width after the first repaint) */
  queueMicrotask(() => {
    revealInWindow(row);
    row.classList.add('is-found');
    row.ownerDocument.defaultView.setTimeout(() => row.classList.remove('is-found'), FOUND_MS);
  });
  return true;
}
