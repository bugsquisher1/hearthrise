// ════════════════════════════════════════════════════════════════════════
// src/shell/window-head.js — ONE HEADER FOR EVERY WINDOW, ITS WAY BACK, ITS PAGES, AND ONE GOLD BUTTON.
//
// The UX flow audit (2026-11-11, lane/d-ux-flow-audit AUDIT.md "The way back", "Header", "Gold buttons") found three
// wordings of back in three places, key chips on some heads and not others, and up to three gold buttons in one
// window. Every window now wears the same band, built from its row in src/data/shell-windows.js:
//   glyph · Back · title · ? · key · Close
//   Back     the glossary's word (src/data/text/controls.js). It shows only when there is somewhere to go: the window's
//            own inner page (a renderer's `inner(ctx, body)` names the act that leaves it: a skill's rows, a phone's
//            hunt page, a Settings page, a Market listing), else the page it shows (Monster facts in Hunts), else the
//            window it was opened from (window-manager.js back). Its tooltip names where it goes.
//   ?        only on a row with `help`: the window's one help line, folded under the band until pressed.
//   key      the row's shortcut, as before; a touch screen hides it (shell.css).
// A PAGE (window-manager.js pageOf) is drawn in its host's frame: a second body, marked with the page's own
// [data-hs-win], so its renderer's acts, its refresh and the coach's hooks find it as they found the window.
// THE ONE GOLD (ART_DIRECTION §9, one primary per view): oneGold keeps one gold plate per window, a pending
// confirmation's first, then the window's own, then the coach card's; any other plate showing is drawn steel
// (.is-second). It runs on the display tick while the page is still laid out, so it forces no layout.
//
// The shell (src/shell/shell.js) calls these; the pure parts (pickGold, helpLine) are tests/shell-core.mjs's.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.127';
import { t } from '../render/player-text.js?v=0.2.127';
import { attr, text, cls } from '../render/paint.js?v=0.2.127';
import { keyLabel, glyphSvg } from './launcher.js?v=0.2.127';

/** The gold plates (shell.css THE ONE PRIMARY). */
export const GOLD = '.hw-primary, .hh-tool.is-primary';
/* A pending confirmation outranks the window's own primary: it is the question the player was just asked. */
const CONFIRM = '.hw-confirm, [role="alertdialog"], .is-confirm';
const ZONE_RANK = Object.freeze({ confirm: 0, body: 1, coach: 2 });

/** A window's help line: its row's sentence, then "H opens this window." when there is a key to press. Pure. */
export function helpLine(row, touch) {
  if (!row || !row.help) return '';
  const key = row.key && !row.noShortcut && !touch ? ' ' + t('windows.key_line', { key: keyLabel(row.key) }) : '';
  return t(row.help) + key;
}

/** The band every window wears, then its folded help line. */
export function headHtml(row, glyphs, touch) {
  const id = esc(row.id);
  const help = helpLine(row, touch);
  return '<header class="hs-win-head" data-hs-drag="' + id + '">' + glyphSvg(glyphs, row.glyph)
    + '<button type="button" class="hs-back" data-hs-back="' + id + '" hidden>&lsaquo; ' + esc(t('controls.back')) + '</button>'
    + '<h2 class="hs-win-title"><span class="hs-win-crumb" hidden></span><span class="hs-win-name">' + esc(row.title || row.label) + '</span></h2>'
    + (help ? '<button type="button" class="hs-help" data-hs-help="' + id + '" aria-expanded="false" aria-label="' + esc(t('windows.help')) + '">?</button>' : '')
    + (row.key ? '<kbd class="hs-key">' + esc(keyLabel(row.key)) + '</kbd>' : '')
    + '<button type="button" class="hs-close" data-hs-close="' + id + '" aria-label="' + esc(t('controls.close') + ' ' + row.label) + '">' + glyphSvg(glyphs, 'uiClose') + '</button></header>'
    + (help ? '<p class="hs-win-help" hidden>' + esc(help) + '</p>' : '');
}

/** The frame's own body (never a page's). */
export const ownBody = (frame) => frame.querySelector(':scope > [data-hs-body]:not(.is-page)');
/** The body a [data-hs-win] box draws into: a page is its own body. */
export const bodyOf = (box) => (box.hasAttribute('data-hs-body') ? box : box.querySelector(':scope > [data-hs-body]:not(.is-page)'));

/**
 * Show `pageId` in `frame` instead of its own body (or no page: null). Returns the page's body when one was CREATED
 * (the shell draws it), else null.
 */
export function showPage(frame, pageId) {
  const own = ownBody(frame);
  let page = frame.querySelector(':scope > .hs-win-body.is-page');
  if (page && page.getAttribute('data-hs-win') !== pageId) { page.remove(); page = null; }
  attr(own, 'hidden', !!pageId);
  cls(frame, 'has-page', !!pageId);
  if (!pageId || page) return null;
  page = frame.ownerDocument.createElement('div');
  page.className = 'hs-win-body is-page';
  page.setAttribute('data-hs-body', '');
  page.setAttribute('data-hs-win', pageId);
  own.after(page);
  return page;
}

/** The band's Back, crumb and title as the window stands now (writes nothing when nothing changed). */
export function paintHead(frame, ctx, renderers) {
  const wm = ctx.wm, id = frame.getAttribute('data-hs-win'), row = wm.row(id);
  if (!row) return;
  const pageId = wm.pageIn(id);
  const render = renderers[id];
  /* a window's own inner page first (never while a page covers it), then the window manager's way back */
  const inner = !pageId && render && typeof render.inner === 'function' ? render.inner(ctx, ownBody(frame)) : null;
  const to = inner ? null : wm.backTo(id);
  const back = frame.querySelector(':scope > .hs-win-head .hs-back');
  attr(back, 'hidden', !(inner || to));
  attr(back, 'data-hs-act', inner || null);
  const target = to && wm.row(to);
  attr(back, 'title', target ? t('windows.back_to', { window: target.title || target.label }) : null);
  const page = pageId ? wm.row(pageId) : null;
  const crumb = frame.querySelector(':scope > .hs-win-head .hs-win-crumb');
  attr(crumb, 'hidden', !page);
  text(crumb, page ? (row.title || row.label) : '');
  text(frame.querySelector(':scope > .hs-win-head .hs-win-name'), page ? (page.title || page.label) : (row.title || row.label));
}

/** A press on the band's Back (with no act of a renderer's own) or ?: handled here. False for any other press. */
export function pressHead(ctx, el) {
  if (!el) return false;
  if (el.hasAttribute('data-hs-back')) { ctx.wm.back(el.getAttribute('data-hs-back')); return true; }
  if (el.hasAttribute('data-hs-help')) {
    const open = el.getAttribute('aria-expanded') !== 'true';
    attr(el, 'aria-expanded', String(open));
    attr(el.closest('.hs-win').querySelector(':scope > .hs-win-help'), 'hidden', !open);
    return true;
  }
  return false;
}

/** Which gold plate stays gold: [{ zone: 'confirm' | 'body' | 'coach', shown }] -> its index, or -1 when none shows. Pure. */
export function pickGold(list) {
  let best = -1;
  (list || []).forEach((g, i) => {
    if (!g || !g.shown || !(g.zone in ZONE_RANK)) return;
    if (best < 0 || ZONE_RANK[g.zone] < ZONE_RANK[list[best].zone]) best = i;
  });
  return best;
}

/** One gold plate in `frame`; every other one showing is drawn steel. Read the layout before anything writes to it. */
export function oneGold(frame) {
  const plates = Array.from(frame.querySelectorAll(GOLD));
  if (!plates.length) return;
  const list = plates.map((b) => ({
    zone: b.closest('.hs-win-coach') ? 'coach' : b.closest(CONFIRM) ? 'confirm' : 'body',
    shown: b.getClientRects().length > 0,
  }));
  const keep = pickGold(list);
  plates.forEach((b, i) => cls(b, 'is-second', list[i].shown && i !== keep));
}
