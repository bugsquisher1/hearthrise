// ════════════════════════════════════════════════════════════════════════
// src/shell/readiness.js — IS THIS CHARACTER READY TO HUNT? (QoL 2, Tyler 10-18)
//
// PURE. The readiness checklist the hunt prep window shows for every open
// character before a hunt starts ("Ranger: 0 ammo"). It reads only what the
// server projected into that character's envelope — the worn set, the action
// bar, what the hero carries, stamina and gold — and
// says what is missing. Display only: it gates nothing (the server decides
// whether a hunt may start) and spends nothing.
//
//   readinessOf(cs, ground) → { name, ready, checks: [{ id, ok, text }], short: [words] }
//
// STORE FOOD TOO WEAK FOR THE HERO'S GROUND (post-140 audit C5, the warning behind the 137 Krell's Hold death): the
// checklist says the ONE weak-food line (hunt-go.js weakFoodLine, src/shell/weak-food.js) against `ground`, the hero's
// ground by default (widgets/first-target.js heroGroundOf: the open hunt's, else the Hunts window's pick, else the last
// hunt's). Hunt prep is where a slot is changed, so it is the page that must not say "ready" under a ground's "Pick
// Salted Trout". Where the ground's floor is measured safe on the bar's store food it says nothing, as the page does.
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf, analyzerOf, huntOf } from '../session/hunt-sections.js';
import { carriedOf, equipmentOf, goldOf, nameOf } from '../session/item-sections.js';
import { heroVitalsOf } from '../session/character-sections.js';
import { itemName } from './widgets/bits.js';
import { whole, hoursWords } from '../render/format.js';
import { supplyWords, weakFoodLine } from './hunt-go.js';
import { heroGroundOf } from './widgets/first-target.js';
import { t } from '../render/player-text.js';

/**
 * @param {object} cs a CharacterSession
 * @param {string|null} [ground] the hunt id the bar is judged against (default: the hero's ground, heroGroundOf)
 */
export function readinessOf(cs, ground = heroGroundOf(cs)) {
  const name = nameOf(cs) || t('prep.ready_character', { n: (cs && Number.isInteger(cs.slot) ? cs.slot : 0) + 1 });
  /* In a hunt the supplies are in the hunt bag, not the bag (Enter moves them: Andy #74, 2,000 Swordfish read as "the store"). */
  const carried = carriedOf(cs);
  const checks = [];
  const short = [];
  if (!carried) return { name, ready: false, checks: [{ id: 'loading', ok: false, text: t('prep.ready_loading') }], short: [t('prep.ready_short_loading')] };
  const eq = equipmentOf(cs) || {};
  checks.push({ id: 'weapon', ok: !!eq.weapon, text: eq.weapon ? t('prep.ready_weapon', { item: itemName(eq.weapon) }) : t('prep.ready_no_weapon') });
  if (!eq.weapon) short.push(t('prep.ready_short_weapon'));

  /* What the bar spends, the same words as Before you go (hunt-go.js supplyWords). Nobody has to buy first (Tyler 10-18), and
     an empty food or drink slot is a heads-up, never a blocker (designer 2026-10-29, Tyler's "0 food" report). */
  const s = settingsOf(cs);
  if (s) {
    for (const l of supplyWords(s, cs, carried).lines) {
      checks.push({ id: l.id, ok: !l.short, text: l.text });
      if (l.short) short.push('0 ' + l.id);
    }
    const v = heroVitalsOf(cs);
    const weak = weakFoodLine(s, ground || null, v.level, v.hpMax);
    if (weak) { checks.push({ id: weak.id, ok: false, text: weak.text }); short.push(t('prep.ready_short_food_weak')); }
  } else checks.push({ id: 'bar', ok: true, text: t('prep.ready_bar_later') });

  const st = staminaOf(cs);
  if (st) {
    /* How much, never a bare "Stamina left" (core-loop play 2026-10-30): the server's stamina, in hours and minutes. */
    checks.push({ id: 'stamina', ok: st.msLeft > 0, text: st.msLeft > 0 ? t('prep.ready_stamina', { left: hoursWords(st.msLeft) }) : t('prep.ready_no_stamina') });
    if (!(st.msLeft > 0)) short.push(t('prep.ready_short_stamina'));
  }
  const gp = goldOf(cs);
  /* How long the gold lasts: the gold and, while a hunt runs, the server's supply spend an hour (the analyzer's waste). */
  if (gp !== null) {
    const an = analyzerOf(cs);
    const spend = an && an.hero.perHour.waste > 0 ? an.hero.perHour.waste : null;
    /* The analyzer stays on the LAST hunt once it ends: in town it is "your last hunt", never "this hunt" (core-loop
       play 2026-10-30: Corliss in Havora read "on this hunt"). */
    const h = huntOf(cs);
    const vars = { gold: whole(gp), spend: whole(spend), hours: Math.floor((gp / spend) * 10) / 10 };
    checks.push({ id: 'gold-now', ok: true, text: !spend ? t('prep.gold_only', vars) : t(h && !h.ended ? 'prep.gold_spend_now' : 'prep.gold_spend_last', vars) });
  }
  return { name, ready: short.length === 0, checks, short };
}

/** "Ranger: 0 ammo, no stamina" or "Tyler: ready" (an empty food or drink slot is a heads-up, never short). */
export function readinessLine(r) {
  return r.name + ': ' + (r.ready ? 'ready' : r.short.join(', '));
}
