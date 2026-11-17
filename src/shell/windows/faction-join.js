// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/faction-join.js — THE JOIN PROMPT: BOTH SIDES, SHOWN THE SAME WAY, AND "NOT NOW" (the `faction-join` modal row).
//
// Tyler 2026-11-14: after a hero's first Krell kill, Holly (the First Flame) and Venn (the Last Ember) each ask it to join. The two
// sides stand side by side in the server's order, each with its face's own words, its motto and one Join press; neither is
// preselected, bigger or first by design. "Not now" is always there and costs nothing: the hero hunts every ground the same, and the
// Faction tab in Character offers the choice again.
// WHEN: the server's `factions` section says can_join (it counted the Krell kill, the hero has no side, the switch is on), and the
// prompt was not answered "Not now" for this hero. That answer is display state: `faction:join` in the residue's `alerts.seen` (the
// death popup's own dismissal list), so a reload or another device doesn't ask again; the tab still does.
// The Join press is ONE intent (src/session/faction-intents.js); the side shows only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SEEN_MAX } from '../../session/residue.js?v=0.2.137';
import { factionOf } from '../../session/faction-sections.js?v=0.2.137';
import { joinFaction } from '../../session/faction-intents.js?v=0.2.137';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.137';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.137';
import { runIntent } from '../intent-words.js?v=0.2.137';
import { t } from '../../render/player-text.js?v=0.2.137';
import { glyphSvg } from '../widgets/bits.js?v=0.2.137';
import { sideName, sideMotto, faceOf, said, waitWords, spanWords } from '../faction-words.js?v=0.2.137';
import { MARK_GLYPH } from './character/faction.js?v=0.2.137';

/** The dismissal id in the residue's alerts.seen. */
const JOIN_SEEN = 'faction:join';
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };
const alertsOf = (cs) => { const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts; return r && typeof r === 'object' ? r : {}; };
/* "Not now" on this page: an envelope that lands before the residue put can't bring the prompt back. */
const DISMISSED = new WeakSet();

/** Was the prompt answered "Not now" for this hero (this page, or the residue)? */
function joinDismissed(cs) {
  const seen = alertsOf(cs).seen;
  return DISMISSED.has(cs) || (Array.isArray(seen) && seen.includes(JOIN_SEEN));
}

/** Should the prompt open by itself for this hero now? */
const joinDue = (cs) => { const f = factionOf(cs); return !!f && f.canJoin && !joinDismissed(cs); };

/* Record "Not now" (display state only), sent at once so a reload right after doesn't ask again. */
function dismiss(cs) {
  if (!cs || joinDismissed(cs)) return;
  DISMISSED.add(cs);
  const r = alertsOf(cs);
  const seen = Array.isArray(r.seen) ? r.seen : [];
  const ok = typeof cs.setResidue === 'function' && cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: seen.concat(JOIN_SEEN).slice(-ALERTS_SEEN_MAX) });
  if (ok && typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});
}

/** The skeleton (built once per opening). */
export function renderFactionJoin() {
  return '<div class="hfx-join"><p class="hfx-lead">' + esc(t('factions.join_lead')) + '</p>'
    + '<ul class="hfx-sides"></ul>'
    + '<p class="hfx-terms">' + esc(t('factions.join_terms')) + '</p><p class="hfx-terms hfx-swap-terms"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<div class="hsum-actions hdeath-actions hfx-foot"><small class="hfx-later">' + esc(t('factions.later')) + '</small>'
    + '<button type="button" class="hh-tool" data-hs-act="fx-not-now">' + esc(t('factions.not_now')) + '</button></div></div>';
}

renderFactionJoin.patch = function patchFactionJoin(body, ctx) {
  const cs = ctx.character;
  const f = factionOf(cs);
  const sc = scratchOf(cs);
  const root = body.querySelector('.hfx-join');
  rows(root.querySelector('.hfx-sides'), f ? f.sides : [], {
    key: (s) => s,
    build: (s) => element(ctx.doc, '<li class="hfx-side is-' + esc(s) + '">'
      + '<div class="hfx-head"><span class="hw-fx-mark is-' + esc(s) + '" aria-hidden="true">' + glyphSvg(ctx.glyphs, MARK_GLYPH[s] || 'uiFlame', 'hs-glyph hw-fx-glyph') + '</span>'
      + '<span><b class="hfx-name"></b><small class="hfx-motto"></small></span></div>'
      + '<blockquote class="hw-fx-said is-on"><p></p><cite></cite></blockquote>'
      + '<button type="button" class="hh-tool" data-hs-act="fx-join" data-side="' + esc(s) + '"></button></li>'),
    patch: (li, s) => {
      const face = faceOf(s);
      text(li.querySelector('.hfx-name'), t('factions.card_title', { side: sideName(s) }));
      text(li.querySelector('.hfx-motto'), sideMotto(s));
      text(li.querySelector('blockquote p'), said(s, 'join'));
      text(li.querySelector('cite'), face ? face.name : '');
      const b = li.querySelector('button');
      text(b, t('factions.join_press', { side: sideName(s) }));
      /* no offer (the server's section gone, or a side already joined): no Join press at all, never an off one with no reason */
      prop(b, 'hidden', !f || !f.canJoin);
      prop(b, 'disabled', sc.pending);
    },
  });
  const swapTerms = root.querySelector('.hfx-swap-terms');
  const known = !!f && f.swapNeedMs !== null && f.cooldownMs !== null;
  cls(swapTerms, 'is-on', known);
  text(swapTerms, known ? t('factions.join_swap_terms', { time: spanWords(f.swapNeedMs), days: waitWords(f.cooldownMs) }) : '');
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderFactionJoin.act = function actFactionJoin(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  if (action === 'fx-not-now') { dismiss(cs); ctx.wm.close('faction-join'); return true; }
  if (action !== 'fx-join') return false;
  const f = factionOf(cs);
  const side = el.getAttribute('data-side');
  const sc = scratchOf(cs);
  if (!f || !f.canJoin || !f.sides.includes(side) || sc.pending) return true;
  const repaint = () => renderFactionJoin.patch(body, ctx);
  runIntent(sc, repaint, () => joinFaction(ctx.account, cs, side), t('factions.busy_join'), () => t('factions.joined', { side: sideName(side) }), cs)
    .then((r) => { if (r && r.ok) ctx.wm.close('faction-join'); });
  return true;
};

/* The shell's mount: open the prompt when the server first offers the choice (on mount too: a Krell kill while away asks on return).
   Closing it any way but Join counts as "Not now". Returns the unsubscribe. */
renderFactionJoin.follow = function followFactionJoin(ctx) {
  const cs = ctx.character;
  if (!cs || typeof cs.subscribe !== 'function') return () => {};
  let showing = false;
  const check = () => {
    if (!joinDue(cs) || ctx.wm.isOpen('faction-join')) return;
    showing = true;
    ctx.wm.open('faction-join');
  };
  const offWm = ctx.wm.subscribe(() => {
    if (showing && !ctx.wm.isOpen('faction-join')) { showing = false; const f = factionOf(cs); if (f && f.canJoin) dismiss(cs); }
  });
  const offCs = cs.subscribe((s, why) => { if (why !== 'closed') check(); });
  check();
  return () => { offWm(); offCs(); };
};
