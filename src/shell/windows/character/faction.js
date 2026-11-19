// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/faction.js — THE FACTION TAB: THIS HERO'S SIDE, ITS STANDING, ITS SWAP AND WHAT STANDING BUYS.
//
// Tyler 2026-11-14 (the board's "2026-11-14 The Morrow Hills" §6): two sides, joined after the hero's first Krell kill, no
// restrictions, standing buys looks only, a swap takes hunting time on the new side's grounds and has a cooldown. Shown only while the
// server sends the `factions` section (its switch is on for the account): the tab's button is hidden otherwise.
// Every number is the server's (src/session/faction-sections.js): the standing per side, the swap's credited time and its need, the
// next-swap instant, each piece's need and whether it is held. A Claim, Swap or Finish press is ONE intent (src/session/faction-
// intents.js) and stays off until the server's own numbers allow it; the row changes only from the re-read envelope.
// THE ART: a side shows its mark and a piece its own icon (assets/icons-bundle/pixel/factions/, bits.js factionIconHtml); the worn
// outfits themselves are still to be drawn, so a claim is a record until they land (factions.pieces_note).
// ════════════════════════════════════════════════════════════════════════
import { factionOf, standingOn, claimable, otherSide } from '../../../session/faction-sections.js?v=0.2.140';
import { claimPiece, startSwap, finishSwap } from '../../../session/faction-intents.js?v=0.2.140';
import { rows, text, cls, prop, attr, element } from '../../../render/paint.js?v=0.2.140';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.140';
import { runIntent } from '../../intent-words.js?v=0.2.140';
import { t } from '../../../render/player-text.js?v=0.2.140';
import { factionIconHtml } from '../../widgets/bits.js?v=0.2.140';
import { people, sideName, sideMotto, faceOf, said, pieceName, spanWords, nextSwapWords, swapReady, swapLeftWords, serverNowOf } from '../../faction-words.js?v=0.2.140';

/** The tab's name. */
export const FACTION_TAB = t('factions.tab');

/** Is the tab offered for this hero (the server sends the section)? */
export const factionShown = (cs) => factionOf(cs) !== null;

/** The Faction tab's skeleton. */
export function factionHtml() {
  return '<section class="hw-cs-faction">'
    + '<div class="hw-fx-who"><span class="hw-fx-mark" aria-hidden="true"></span><span class="hw-fx-id"><b class="hw-fx-side"></b><small class="hw-fx-motto"></small></span></div>'
    + '<p class="hs-note hw-fx-neutral"></p>'
    + '<div class="hw-fx-acts"><button type="button" class="hh-tool is-primary hw-fx-choose" data-hs-act="fx-choose">' + esc(t('factions.press_choose')) + '</button></div>'
    + '<h3 class="hw-cs-head is-on">' + esc(t('factions.standing_head')) + '</h3><ul class="hw-ledger hw-fx-standing"></ul>'
    + '<p class="hs-note">' + esc(t('factions.standing_note')) + '</p>'
    + '<div class="hw-fx-swap"><h3 class="hw-cs-head">' + esc(t('factions.swap_head')) + '</h3>'
    + '<p class="hw-fx-line hw-fx-swap-state"></p><p class="hs-note hw-fx-swap-to"></p>'
    + '<blockquote class="hw-fx-said"><p></p><cite></cite></blockquote>'
    + '<p class="hw-fx-line hw-fx-swap-cost"></p>'
    + '<div class="hw-fx-acts"><button type="button" class="hh-tool hw-fx-swap-go" data-hs-act="fx-swap"></button>'
    + '<button type="button" class="hh-tool is-primary hw-fx-finish" data-hs-act="fx-finish">' + esc(t('factions.press_finish')) + '</button></div></div>'
    + '<h3 class="hw-cs-head is-on">' + esc(t('factions.pieces_head')) + '</h3><ul class="hw-ledger hw-fx-pieces"></ul>'
    + '<p class="hs-note">' + esc(t('factions.pieces_note')) + '</p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></section>';
}

/* The mark beside the side's name: redrawn only when the side changes. */
function patchMark(el, glyphs, side) {
  const key = side || '-';
  if (el.getAttribute('data-for') === key) return;
  el.innerHTML = side ? factionIconHtml(glyphs, side) : '';
  attr(el, 'data-for', key);
}

/** Patch the Faction tab. */
export function patchFaction(body, ctx, sc) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-faction');
  const f = factionOf(cs);
  if (!root) return;
  const now = serverNowOf(cs);
  const side = f ? f.side : null;
  patchMark(root.querySelector('.hw-fx-mark'), ctx.glyphs, side);
  text(root.querySelector('.hw-fx-side'), side ? t('factions.side', { side: sideName(side) }) : t('factions.side_none'));
  text(root.querySelector('.hw-fx-motto'), side ? sideMotto(side) : '');
  const neutral = root.querySelector('.hw-fx-neutral');
  cls(neutral, 'is-on', !!f && !side);
  text(neutral, !f || side ? '' : t(f.canJoin ? 'factions.neutral_open' : 'factions.neutral_locked', people()));
  const choose = root.querySelector('.hw-fx-choose');
  prop(choose, 'hidden', !f || !f.canJoin);
  prop(choose, 'disabled', sc.pending);

  rows(root.querySelector('.hw-fx-standing'), f ? f.sides : [], {
    key: (s) => s,
    build: (s) => element(ctx.doc, '<li class="hw-line hw-fx-stand"><span class="hw-ico hw-fx-mark" aria-hidden="true">' + factionIconHtml(ctx.glyphs, s) + '</span>'
      + '<span class="hw-line-name"><b></b><small></small></span></li>'),
    patch: (li, s) => {
      cls(li, 'is-current', s === side);
      text(li.querySelector('b'), sideName(s));
      text(li.querySelector('small'), t('factions.standing', { time: spanWords(standingOn(f, s)) }));
    },
  });

  /* THE SWAP: a member only. An open swap shows its credited time; else the cooldown, the cost and the other side's face. */
  const swapBox = root.querySelector('.hw-fx-swap');
  cls(swapBox, 'is-on', !!side);
  const to = f && f.swap ? f.swap.to : otherSide(f);
  text(root.querySelector('.hw-fx-swap-state'), !side ? '' : f.swap ? swapLeftWords(f) : nextSwapWords(f, now));
  const toLine = root.querySelector('.hw-fx-swap-to');
  cls(toLine, 'is-on', !!(f && f.swap));
  text(toLine, f && f.swap ? t('factions.swap_to', { side: sideName(f.swap.to) }) : '');
  const face = to ? faceOf(to) : null;
  const quote = root.querySelector('.hw-fx-said');
  cls(quote, 'is-on', !!side && !!face);
  text(quote.querySelector('p'), side && face ? said(to, 'swap') : '');
  text(quote.querySelector('cite'), side && face ? face.name : '');
  const cost = root.querySelector('.hw-fx-swap-cost');
  const costMs = f && f.swap ? f.swap.needMs : f ? f.swapNeedMs : null;
  cls(cost, 'is-on', !!side && !(f && f.swap) && costMs !== null && !!to);
  text(cost, side && to && costMs !== null ? t('factions.swap_cost', { time: spanWords(costMs), side: sideName(to) }) : '');
  const go = root.querySelector('.hw-fx-swap-go');
  prop(go, 'hidden', !side || !!f.swap || !to);
  text(go, to ? t('factions.press_swap', { side: sideName(to) }) : '');
  prop(go, 'disabled', sc.pending || !swapReady(f, now));
  const fin = root.querySelector('.hw-fx-finish');
  prop(fin, 'hidden', !(f && f.swap));
  prop(fin, 'disabled', sc.pending || !(f && f.swap && f.swap.ms >= f.swap.needMs));

  /* THE PIECES: each side's, its need in hours of that side's standing; Claim on only when the server's standing covers it. */
  rows(root.querySelector('.hw-fx-pieces'), f ? f.pieces : [], {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hw-line hw-fx-piece"><span class="hw-ico hw-fx-mark" aria-hidden="true">' + factionIconHtml(ctx.glyphs, p.id) + '</span>'
      + '<span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="fx-claim" data-piece="' + esc(p.id) + '"></button></li>'),
    patch: (li, p) => {
      cls(li, 'is-current', p.held);
      text(li.querySelector('b'), pieceName(p.id));
      text(li.querySelector('small'), p.held ? t('factions.piece_held') : t('factions.piece_needs', { time: spanWords(p.needMs), side: sideName(p.side) }));
      const b = li.querySelector('button');
      prop(b, 'hidden', p.held);
      text(b, p.held ? '' : t('factions.press_claim'));
      attr(b, 'aria-label', p.held ? '' : t('factions.press_claim') + ': ' + pieceName(p.id));
      prop(b, 'disabled', sc.pending || !claimable(f, p));
    },
  });
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

/** One press on the Faction tab; true when it was the tab's. */
export function actFaction(ctx, sc, action, ev, el, repaint) {
  if (ev.type !== 'click' || !['fx-choose', 'fx-claim', 'fx-swap', 'fx-finish'].includes(action)) return false;
  const cs = ctx.character;
  const f = factionOf(cs);
  if (!f || sc.pending) return true;
  if (action === 'fx-choose') { if (f.canJoin) ctx.wm.open('faction-join'); return true; }
  if (action === 'fx-claim') {
    const p = f.pieces.find((x) => x.id === el.getAttribute('data-piece'));
    if (!p || !claimable(f, p)) return true;
    runIntent(sc, repaint, () => claimPiece(ctx.account, cs, p.id), t('factions.busy_claim'), () => t('factions.claimed', { piece: pieceName(p.id) }), cs);
    return true;
  }
  if (action === 'fx-swap') {
    const to = otherSide(f);
    if (!to || !swapReady(f, serverNowOf(cs))) return true;
    runIntent(sc, repaint, () => startSwap(ctx.account, cs, to), t('factions.busy_swap'), () => t('factions.swap_started', { side: sideName(to) }), cs);
    return true;
  }
  if (!f.swap || f.swap.ms < f.swap.needMs) return true;
  const to = f.swap.to;
  runIntent(sc, repaint, () => finishSwap(ctx.account, cs), t('factions.busy_finish'), () => t('factions.swapped', { side: sideName(to) }), cs);
  return true;
}
