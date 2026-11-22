// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you.js — "NEEDS YOU" ON THE RETURN CARD: AT MOST THREE DECISIONS, RANKED, ONE ROW A KIND.
//
// Designer D-2 section 2.3 (review/05-designer-rulings.md), FB-6: the return card for the account holds, under its totals and above
// Carry on, only what needs a decision. The kinds and their order are rows of src/data/hunt-after.js NEEDS_YOU (eight kinds in three
// bands: stops a hero hunting, costs progress, gains); NEEDS_SHOWN of them show, and one "{n} more" line counts the rest.
//
// LINE PROVIDERS (./needs-you/providers.js): each supplies the row of ONE kind from the server's projection (the heroes' envelopes and the
// server's Carry on plan) and nothing else. A new system adds a provider file and its NEEDS_YOU row; it never edits this card.
//
//   rankNeeds(rows, shown)   the card's rows from what the providers said: one a kind, by the data's rank, at most `shown`; `more`. Pure.
//   needsRowsOf(ctx)         every provider's row for this card ({ peers, plan, wearOn })
//   renderNeeds()            the block (built once)
//   patchNeeds(el, ctx, st)  the block as the providers read now; `st` { pending, msg }: a press out (every row's press off, "Sending…")
//                            and its answer in words; returns how many rows show
//
// Nothing here counts or prices: every row is the server's state in words, and each press opens the window that decides it.
// What Carry on does is never a row, and no row offers a refill, a Crown or a boost (D-2 rules 5 and 6).
// ════════════════════════════════════════════════════════════════════════
import { rows, text, prop, attr, element } from '../render/paint.js';
import { t } from '../render/player-text.js';
import { NEEDS_YOU, NEEDS_SHOWN } from '../data/hunt-after.js';
import { PROVIDERS } from './needs-you/providers.js';

const RANK = new Map(NEEDS_YOU.map((r, i) => [r.kind, i]));

/** The card's rows: one row a kind (the provider's own, which names the worst-off hero first), by NEEDS_YOU's rank, at most `shown`, and
    how many more wait. A row of a kind the data does not list, or with no words, is never shown. Pure. */
export function rankNeeds(list, shown = NEEDS_SHOWN) {
  const byKind = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !RANK.has(r.kind) || typeof r.text !== 'string' || !r.text || byKind.has(r.kind)) continue;
    byKind.set(r.kind, r);
  }
  const all = [...byKind.values()].sort((a, b) => RANK.get(a.kind) - RANK.get(b.kind));
  return { shown: all.slice(0, shown), more: Math.max(0, all.length - shown) };
}

/** Every provider's row for this card, tagged with the provider's kind. */
export function needsRowsOf(ctx) {
  const out = [];
  for (const p of PROVIDERS) {
    const r = p.rowOf(ctx);
    if (r) out.push(Object.assign({}, r, { kind: p.kind }));
  }
  return out;
}

/** The block (built once). */
export function renderNeeds() {
  return '<section class="haway-needs" hidden><p class="haway-needs-head">' + t('away.needs_head') + '</p><ul class="haway-needs-list"></ul>'
    + '<p class="haway-needs-more" hidden></p><p class="hh-intent-msg haway-needs-msg" role="status" aria-live="polite"></p></section>';
}

/** A row's press is already on the card: the card names the same move for the same hero (`held`: 'go:slot' keys, away.js), so the row
    keeps its words and drops its press (R7 art pass: "Go to Meadowbrook Thicket" twice on one card, the row's and the hero's gold one). Pure. */
export function pressHeld(row, held) {
  return !!row && !!row.go && Number.isInteger(row.slot) && Array.isArray(held) && held.includes(row.go + ':' + row.slot);
}

/** The block as the providers read now. Returns how many rows show. */
export function patchNeeds(el, ctx, st) {
  const { shown, more } = rankNeeds(needsRowsOf(ctx));
  const pending = !!(st && st.pending);
  const held = st && Array.isArray(st.held) ? st.held : [];
  prop(el, 'hidden', !shown.length && !pending && !(st && st.msg));
  rows(el.querySelector('.haway-needs-list'), shown, {
    key: (r) => r.kind,
    build: () => element(ctx.doc, '<li class="haway-need"><span class="haway-need-text"></span>'
      + '<button type="button" class="hh-tool" data-hs-act="away-need"></button></li>'),
    patch: (li, r) => {
      text(li.querySelector('.haway-need-text'), r.text);
      const b = li.querySelector('[data-hs-act="away-need"]');
      text(b, pending ? t('heroes.sending') : r.label || '');
      prop(b, 'hidden', !r.label || pressHeld(r, held));
      prop(b, 'disabled', pending);
      attr(b, 'data-go', r.go || null);
      attr(b, 'data-slot', Number.isInteger(r.slot) ? String(r.slot) : null);
      attr(b, 'data-hunt', r.hunt || null);
      attr(b, 'data-slots', Array.isArray(r.slots) ? r.slots.join(',') : null);
    },
  });
  const m = el.querySelector('.haway-needs-more');
  prop(m, 'hidden', !more);
  text(m, more ? t('away.needs_more', { count: more }) : '');
  text(el.querySelector('.haway-needs-msg'), (st && st.msg) || '');
  return shown.length;
}
