// ════════════════════════════════════════════════════════════════════════
// src/shell/jewel-words.js — WHAT A ROLLED CRAFTING JOB SAYS AT THE BENCH (src/shell/windows/work.js; the words: src/data/text/work.js).
//
// A rolled job (src/data/jewelry.js) names the grades it can make, and before the roll its odds, its guarantee and the perks it may
// still roll, every number from the server's `jewel_jobs` section (src/session/jewelry-sections.js rollOddsOf). The work window's act
// names its clicked element `t`, so these sentences live here, where t() is the text table's.
//
//   rolledMakes(row, name)   "→ a Fine or Hallmarked Banded Signet", "→ a Hallmarked Banded Signet", or null for a job that doesn't roll so
//   oddsSentence(o)          "Always Follow-through. At your Crafting 37: Hallmarked 15.4%, otherwise Fine. Second perk: Keen or Surge. ..."
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.132';

/** What a gem roll or a minimum-quality job makes, in words; null for any other job (its product is named as ever). */
export function rolledMakes(row, name) {
  if (row && row.roll === 'gem') return t('work.makes_graded', { name });
  if (row && row.roll === 'seal') return t('work.makes_hallmarked', { name });
  return null;
}

/* "Keen", "Keen or Surge", "Keen, Surge or Follow-through" */
function orList(names) {
  return names.length > 1 ? t('work.odds_or', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names.join('');
}

/** The odds line for rollOddsOf's answer (the server's numbers as words); '' when the server has said none. */
export function oddsSentence(o) {
  if (!o) return '';
  const grade = o.plain ? t('work.odds_plain', { fine: o.fine, hallmarked: o.hallmarked })
    : o.fine === '0%' ? t('work.odds_sealed') : t('work.odds_fine', { hallmarked: o.hallmarked });
  const perks = t(o.perk ? 'work.odds_second' : 'work.odds_perks', { perks: orList(o.perks) });
  const line = t('work.odds_at', { level: o.level, grade, perks });
  return o.perk ? t('work.odds_always', { perk: o.perk, rest: line }) : line;
}
