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
// The Join press ASKS FIRST (the faction QA 2026-11-19 #2): "Join the First Flame?", the side lock that starts now and a swap's cost,
// Confirm or Back. Confirm is ONE intent (src/session/faction-intents.js); the side shows only from the re-read envelope, and the prompt
// stays with the answer ("Joined the First Flame") until its Close. The terms stand above the presses, so a phone reads them first.
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SEEN_MAX } from '../../session/residue.js?v=0.2.141';
import { factionOf } from '../../session/faction-sections.js?v=0.2.141';
import { joinFaction } from '../../session/faction-intents.js?v=0.2.141';
import { rows, text, prop, element } from '../../render/paint.js?v=0.2.141';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.141';
import { runIntent } from '../intent-words.js?v=0.2.141';
import { t } from '../../render/player-text.js?v=0.2.141';
import { factionIconHtml } from '../widgets/bits.js?v=0.2.141';
import { sideName, sideMotto, faceOf, said, waitWords, spanWords } from '../faction-words.js?v=0.2.141';

/** The dismissal id in the residue's alerts.seen. */
const JOIN_SEEN = 'faction:join';
const SCRATCH = new WeakMap();
/* pending/msg: the one Join in flight and its answer; ask: the side whose Join is asking for a Confirm, else null */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', ask: /** @type {string|null} */ (null) }; SCRATCH.set(cs, s); } return s; };
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

/* THE TERMS, as labels, ABOVE the Join presses (on a phone they were below both, off the screen): the cost, the limits, what standing
   unlocks, then in the order they happen the side lock (it starts at the join) and a swap's cost. */
const TERMS = Object.freeze(['cost', 'limits', 'rewards', 'lock', 'swap']);

/** The skeleton (built once per opening). */
export function renderFactionJoin() {
  return '<div class="hfx-join"><p class="hfx-lead">' + esc(t('factions.join_lead')) + '</p>'
    + '<p class="hfx-terms">' + TERMS.map((k) => '<span data-term="' + k + '"></span>').join('<br>') + '</p>'
    + '<div class="hfx-confirm" hidden><p class="hfx-name hfx-confirm-q"></p><p class="hfx-terms"><span class="hfx-confirm-a"></span><br><span class="hfx-confirm-b"></span></p>'
    + '<div class="hsum-actions"><button type="button" class="hh-tool is-primary" data-hs-act="fx-join-confirm">' + esc(t('factions.press_confirm')) + '</button>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="fx-join-back">' + esc(t('factions.press_back')) + '</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<ul class="hfx-sides"></ul>'
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
      + '<div class="hfx-head"><span class="hw-fx-mark" aria-hidden="true">' + factionIconHtml(ctx.glyphs, s) + '</span>'
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
      /* no offer (the server's section gone, or a side already joined): no Join press at all, never an off one with no reason; none
         either while a side's confirm is asking */
      prop(b, 'hidden', !f || !f.canJoin || !!sc.ask);
      prop(b, 'disabled', sc.pending);
    },
  });
  const known = !!f && f.swapNeedMs !== null && f.cooldownMs !== null;
  const term = { cost: t('factions.term_cost'), limits: t('factions.term_limits'), rewards: t('factions.term_rewards'),
    lock: known ? t('factions.term_lock', { days: waitWords(f.cooldownMs) }) : '', swap: known ? t('factions.term_swap', { time: spanWords(f.swapNeedMs) }) : '' };
  for (const el of root.querySelectorAll('.hfx-terms [data-term]')) text(el, term[el.getAttribute('data-term')] || '');
  /* THE CONFIRM: a Join press asks first, with what joining starts (the side lock runs from now) */
  if (sc.ask && !(f && f.canJoin && f.sides.includes(sc.ask))) sc.ask = null;
  const ask = root.querySelector('.hfx-confirm');
  prop(ask, 'hidden', !sc.ask);
  text(root.querySelector('.hfx-confirm-q'), sc.ask ? t('factions.confirm_join', { side: sideName(sc.ask) }) : '');
  text(root.querySelector('.hfx-confirm-a'), sc.ask && known ? t('factions.confirm_lock', { days: waitWords(f.cooldownMs) }) : '');
  text(root.querySelector('.hfx-confirm-b'), sc.ask && known ? t('factions.term_swap', { time: spanWords(f.swapNeedMs) }) : '');
  for (const b of ask.querySelectorAll('button')) prop(b, 'disabled', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  /* joined: the prompt stays with its answer, and its last press closes it */
  text(root.querySelector('[data-hs-act="fx-not-now"]'), f && f.side ? t('factions.close') : t('factions.not_now'));
};

renderFactionJoin.act = function actFactionJoin(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (action === 'fx-not-now') {
    const f0 = factionOf(cs);
    if (!f0 || !f0.side) dismiss(cs);
    sc.ask = null; sc.msg = '';
    ctx.wm.close('faction-join');
    return true;
  }
  if (!['fx-join', 'fx-join-confirm', 'fx-join-back'].includes(action)) return false;
  const f = factionOf(cs);
  const repaint = () => renderFactionJoin.patch(body, ctx);
  if (action === 'fx-join-back') { sc.ask = null; repaint(); return true; }
  /* a Join press asks first; only Confirm sends, and the prompt then stays with the answer ("Joined the First Flame") */
  const side = action === 'fx-join' ? el.getAttribute('data-side') : sc.ask;
  if (!f || !f.canJoin || !f.sides.includes(side) || sc.pending) return true;
  if (action === 'fx-join') { sc.ask = side; sc.msg = ''; repaint(); return true; }
  sc.ask = null;
  runIntent(sc, repaint, () => joinFaction(ctx.account, cs, side), t('factions.busy_join'), () => t('factions.joined', { side: sideName(side) }), cs);
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
