// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-report.js — THE HUNT REPORT ON THE END CARD (GR-66, free to every player; build plan FB-7).
//
// Two blocks on the hunt summary (./windows/hunt-summary.js), each a few plain lines over the server's counters as the card keeps
// them (src/hunt-view/hunt-report.js reportFacts, in the summary's `report`):
//   THE RISK BLOCK   the one word (Safe, Close, Near death), the lowest health with the monster and the blow, the close calls under a
//                    quarter, what ran out and when, and each death with its Level XP, the hunting time that is, and what Blessings
//                    saved.
//   THE RULES BLOCK  each bar slot that fired, how often and its share of the damage or healing; each that never fired and why; and
//                    the change line when the bar changed since the last hunt on this ground.
// The cause line (package 9: why the party fell back, and the one change most likely to help) has its slot here (CAUSE_SLOT) and
// fills once the server stores the sustain counters. Nothing here counts, prices or predicts: the lines say what the server counted.
//
//   riskLines(r, xpH)          the risk block's lines (strings), the word first. Pure but for the words.
//   rulesLines(r, prev)        the rules block's lines, the change line last. Pure but for the words.
//   riskHtml() / rulesHtml()   each block (built once)
//   patchReport(root, doc, cur, prev)  both blocks for the card `cur` (a summary), `prev` the hunt before it on the same ground
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, element } from '../render/paint.js';
import { whole } from '../render/format.js';
import { t } from '../render/player-text.js';
import { itemName, monsterName, abilityName } from './widgets/bits.js';
import { spanWords } from './after-hunt.js';
import { ABILITIES } from '../data/abilities.js';
import { HUNT_REPORT } from '../data/hunt-report.js';
import { changedSlot, CAUSE_SLOT } from '../hunt-view/hunt-report.js';

/* A share in permille as a whole percent; a hero still standing never reads 0% (6 permille is "1%"). */
const pct = (pm) => (pm > 0 ? Math.max(1, Math.floor(pm / 10)) : 0);
const what = (uses) => (ABILITIES[uses] ? abilityName(uses) : itemName(uses));
/** The lowest-health words in the house's voice: "from a Rat" for a swing (`swing`, a text key), "from Barn Spider's Venom Spray" for a
    spell (`spell`); `low` { pm, by, blow }, `o` the line's other values. */
export function blowLine(swing, spell, low, o) {
  const v = Object.assign({ pct: pct(low.pm), monster: monsterName(low.by) }, o);
  return low.blow === 'basic' ? t(swing, v) : t(spell, Object.assign(v, { blow: abilityName(low.blow) }));
}

/** The risk block's lines, the word first. `xpH`: the hunt's Level XP an hour (the server's), for a death's hunting time. */
export function riskLines(r, xpH) {
  if (!r) return [];
  /** @type {{ word?: boolean, text: string }[]} */
  const out = [{ word: true, text: t('report.word_' + r.word) }];
  out.push({ text: r.low ? blowLine('report.low', 'report.low_spell', { pm: r.low[0], by: r.low[1], blow: r.low[2] }) : t('report.low_none') });
  out.push({ text: r.close > 0 ? t('report.close', { count: r.close }) : t('report.close_none') });
  for (const [item, ms] of r.dry) out.push({ text: ms >= 0 ? t('report.dry', { item: itemName(item), time: spanWords(ms) }) : t('report.dry_some', { item: itemName(item) }) });
  if (r.ranOut) out.push({ text: t('report.ran_' + r.ranOut) });
  for (const [xp, saved, blessings] of r.deaths) {
    const hours = Number.isFinite(xpH) && xpH > 0 && xp > 0 ? (xp / xpH) * 3600000 : null;
    out.push({ text: hours !== null ? t('report.death_hours', { xp: whole(xp), time: spanWords(hours) }) : t('report.death', { xp: whole(xp) }) });
    if (saved > 0) out.push({ text: t('report.death_saved', { xp: whole(saved) }) });
    else if (blessings === 0) out.push({ text: t('report.death_unblessed') });
  }
  if (CAUSE_SLOT) out.push({ text: CAUSE_SLOT });
  return out;
}

/** The rules block's lines: slots that fired (bar order), then those that never fired, at most HUNT_REPORT.rulesShown, the change line last. */
export function rulesLines(r, prev) {
  if (!r) return [];
  const bar = r.rules.slice().sort((a, b) => a[2] - b[2]);
  const fired = bar.filter((x) => x[3] > 0).map(([, uses, , n, , kind, pm]) => (kind && pm >= 0
    ? t(kind === 'd' ? 'report.fired_dealt' : 'report.fired_healed', { count: n, what: what(uses), pct: pct(pm) }) : t('report.fired', { count: n, what: what(uses) })));
  const never = bar.filter((x) => x[3] === 0).map(([, uses, , , why]) => t('report.never', { what: what(uses), why: t('report.why_' + why) }));
  const out = fired.concat(never).slice(0, HUNT_REPORT.rulesShown).map((s) => ({ text: s }));
  const ch = changedSlot(r, prev);
  if (ch && ch.kind && ch.nowPm >= 0) {
    const o = { n: ch.place + 1, what: what(ch.uses), pct: pct(ch.nowPm), kind: t('report.kind_' + ch.kind) };
    out.push({ text: ch.wasPm >= 0 ? t('report.changed_was', Object.assign(o, { was: pct(ch.wasPm) })) : t('report.changed', o) });
  }
  return out;
}

/** The risk block (built once): its head and lines. */
export function riskHtml() {
  return '<section class="hsum-report-risk"><h4 class="hw-ledger-head">' + t('report.risk_head') + '</h4><ul class="hsum-falls hsum-risk"></ul></section>';
}
/** The rules block (built once). */
export function rulesHtml() {
  return '<section class="hsum-report-rules"><h4 class="hw-ledger-head">' + t('report.rules_head') + '</h4><ul class="hsum-falls hsum-rules"></ul></section>';
}

function lineRows(host, doc, lines) {
  rows(host, lines.map((l, i) => Object.assign({ i }, l)), {
    key: (l) => String(l.i) + (l.word ? 'w' : ''),
    build: (l) => element(doc, l.word ? '<li><b></b></li>' : '<li></li>'),
    patch: (el, l) => text(l.word ? el.querySelector('b') : el, l.text),
  });
}

/** Both blocks for the card `cur` (a stored or live summary), `prev` the hunt before it on the same ground (the change line), or null. */
export function patchReport(root, doc, cur, prev) {
  const r = cur && !cur.train ? cur.report || null : null;
  const risk = riskLines(r, cur ? cur.xpH : null), rules = rulesLines(r, prev ? prev.report : null);
  cls(root.querySelector('.hsum-report-risk .hw-ledger-head'), 'is-on', risk.length > 0);
  lineRows(root.querySelector('.hsum-risk'), doc, risk);
  cls(root.querySelector('.hsum-report-rules .hw-ledger-head'), 'is-on', rules.length > 0);
  lineRows(root.querySelector('.hsum-rules'), doc, rules);
}
