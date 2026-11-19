// ════════════════════════════════════════════════════════════════════════
// src/shell/result-block.js — THE RESULT, FIRST: ONE BLOCK THE END CARD AND THE AWAY CARD SHARE.
//
// UI audit 2026-11-18 #1: the end card opened on three chores while Time, Monsters, Level XP and Gold sat
// under the fold, and a 6 h hunt never said "Level 5 → 8". #2: the away return was a seven-line paragraph.
// Both now lead with the same block: the Level line ("Level 9 → 10", the skills raised beside it), then ONE
// row of three figures, a genre label over the server's number and one small line under it. No box: a rule
// above and below the row is all the containment it earns (ART_DIRECTION §9, §12).
//
// Display only. Every number the caller hands in is the server's (CLAUDE.md §6): the summary's, the away
// line's two stamps; nothing here counts, rounds or derives a level. Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { text, cls, prop, attr } from '../render/paint.js?v=0.2.141';
import { t } from '../render/player-text.js?v=0.2.141';
import { gold } from '../render/format.js?v=0.2.141';

const FIGS = 3;

/**
 * THE GOLD FIGURE, ONE READING FOR BOTH CARDS (post-patch audit 2026-11-18 A6 and B3: a card read "Gold +615 gp" beside a hunt whose store
 * food took the purse down 485). `net` is what the purse kept, the coins less what the store's supplies cost, with both under it: "+130 gp"
 * over "615 gp in coins, 485 gp on supplies" (a minus sign when the supplies cost more). Every number is the caller's, the server's tally;
 * with no spend to set against the coins (an older record that sent none) the cell says Coins, so it never calls the coins Gold.
 * `yard`: what a yard that took over from the hunt billed (the away card's, post-140 audit C3), already out of `net`, said beside the rest.
 * @param {{net: number, coins: number, spent: number, yard?: number|null}|null} kept  what the purse kept, or null
 * @param {number|null} coins  the coins alone, the fallback
 */
export function goldFig(kept, coins) {
  if (kept && Number.isFinite(kept.net) && Number.isFinite(kept.coins) && Number.isFinite(kept.spent)) {
    const looted = gold(kept.coins), paid = gold(kept.spent), yard = Number.isFinite(kept.yard) && kept.yard > 0 ? gold(kept.yard) : null;
    const sub = yard ? t(kept.spent > 0 ? 'away.card_gold_yard_both' : 'away.card_gold_yard', { looted, paid, yard })
      : kept.spent > 0 ? t('away.card_gold_both', { looted, paid }) : t('away.card_gold_looted', { looted });
    return { key: 'gold', label: t('summary.fig_gold'), value: (kept.net < 0 ? '−' : '+') + gold(Math.abs(kept.net)), sub };
  }
  return Number.isFinite(coins) ? { key: 'gold', label: t('summary.fig_coins'), value: '+' + gold(coins), sub: '' } : null;
}

/** The skeleton (built once, inside the card that owns it). */
export function resultHtml() {
  return '<div class="hres">'
    + '<p class="hres-level"><b class="hres-lv"><span class="hres-was"></span> <span class="hres-to"></span> <span class="hres-now"></span></b><span class="hres-ups"></span></p>'
    + '<dl class="hres-figs">' + Array.from({ length: FIGS }, () => '<div class="hres-fig"><dt></dt><dd></dd><small></small></div>').join('') + '</dl>'
    + '</div>';
}

/**
 * Patch the block. `r`:
 *   level  { name, from, to } or null: "Level 9 → 10" when from is known and differs, else "Level 10"; a drop reads in the cost's red
 *   ups    the skills raised, each already in words ("Melee 12 → 13")
 *   figs   up to three { key, label, value, sub }; a missing one hides its cell
 * @param {Element} el  the block (.hres) or an element holding it
 */
export function patchResult(el, r) {
  const root = el.classList && el.classList.contains('hres') ? el : el.querySelector('.hres');
  const lv = r && r.level && Number.isSafeInteger(r.level.to) ? r.level : null;
  const moved = !!lv && Number.isSafeInteger(lv.from) && lv.from !== lv.to;
  const ups = r && Array.isArray(r.ups) ? r.ups : [];
  const line = root.querySelector('.hres-level');
  prop(line, 'hidden', !lv && !ups.length);
  const b = root.querySelector('.hres-lv');
  cls(b, 'is-up', moved && lv.to > lv.from);
  cls(b, 'is-down', moved && lv.to < lv.from);
  text(root.querySelector('.hres-was'), moved ? t('summary.lv_at', { name: lv.name, level: lv.from }) : '');
  text(root.querySelector('.hres-to'), moved ? t('summary.lv_arrow') : '');
  text(root.querySelector('.hres-now'), !lv ? '' : moved ? String(lv.to) : t('summary.lv_at', { name: lv.name, level: lv.to }));
  text(root.querySelector('.hres-ups'), ups.join(', '));
  const figs = r && Array.isArray(r.figs) ? r.figs : [];
  const cells = root.querySelectorAll('.hres-fig');
  for (let i = 0; i < cells.length; i++) {
    const f = figs[i] || null;
    const cell = cells[i];
    prop(cell, 'hidden', !f);
    attr(cell, 'data-fig', f ? f.key : null);
    text(cell.querySelector('dt'), f ? f.label : '');
    text(cell.querySelector('dd'), f ? f.value : '');
    text(cell.querySelector('small'), f && f.sub ? f.sub : '');
  }
  cls(root.querySelector('.hres-figs'), 'is-empty', !figs.length);
}
