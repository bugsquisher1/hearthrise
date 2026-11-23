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
// THE CAUSE LINE (lane R5, package 9) closes the risk block on a Danger scale ground: where the hunt held and on which Risk, the deepest
// it went, and why it fell back ("Held Depth 12 of 20 on Steady. Fell back once: Bran at 23% to a Brute."), from the server's report
// (`deep`, `falls`, 1057-danger-falls.sql) and the session's end stance; the return card (./windows/away.js) shows the same line.
// Nothing here counts, prices or predicts: the lines say what the server counted.
//   causeLine(d)               the cause line from the report's depth facts, '' off the scale
// THE EARNED LINE (lane/gold-per-hour, Tyler 2026-11-22) follows the cause line on a Danger scale ground, beside the Hunts window's "About N
// gold an hour, before supplies": "Earned 4,800 gold an hour. Supplies used 900 gold an hour.", the server's per-hour counters (the analyzer's
// per_hour.gold, coins and loot, and per_hour.waste, store supplies) as the card stored them; the return card shows the same line.
//   earnedLine(rates)          { goldH, wasteH } in words, '' when the server rated no hour
// THE LEDGER LINES (19-power-ledger L7) close the risk block on a Danger scale ground, after the earned line, and the return card shows them
// too: "Healing: Mend 41% · Greater Mend 38% · Shelter 21%", "Damage taken: Bran 64% · Ivo 20%", "Supplies/hr at Depth 12: 4,180", the
// server's report counters (the depth facts' `heal`, `took`, `sup`, src/hunt-view/hunt-report.js ledgerFacts).
//   ledgerLines(d)             the ledger's lines (strings), none off the scale or with nothing counted
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
import { changedSlot } from '../hunt-view/hunt-report.js';
import { STANCE_IDS } from '../session/danger-sections.js';

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
export function riskLines(r, xpH, rates) {
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
  const cause = causeLine(r.depth);
  if (cause) out.push({ text: cause });
  const earned = cause ? earnedLine(rates) : '';
  if (earned) out.push({ text: earned });
  if (cause) for (const l of ledgerLines(r.depth)) out.push({ text: l });
  return out;
}

/** THE LEDGER LINES (see the header) from the depth facts: healing by source, damage taken by seat (two or more seats), supplies an hour by depth. */
export function ledgerLines(d) {
  if (!d) return [];
  const out = [];
  const list = (parts) => parts.join(' · ');
  if (Array.isArray(d.heal) && d.heal.length) out.push(t('report.ledger_heal', { list: list(d.heal.map(([src, pm]) => t('report.ledger_part', { what: what(src), pct: pct(pm) }))) }));
  if (Array.isArray(d.took) && d.took.length > 1) {
    out.push(t('report.ledger_took', { list: list(d.took.map(([name, seat, pm]) => t('report.ledger_part', { what: name || t('report.ledger_seat', { n: seat + 1 }), pct: pct(pm) }))) }));
  }
  for (const [depth, g] of Array.isArray(d.sup) ? d.sup : []) out.push(t('report.ledger_sup', { depth, gold: whole(g) }));
  return out;
}

/** THE CAUSE LINE (lane R5) from the report's depth facts (src/hunt-view/hunt-report.js depthFacts): where the hunt held and on which Risk,
    the deepest it went, and why it fell back: "Held Depth 12 of 20 on Steady. Fell back once: Bran at 23% to a Brute." Depths only, never a
    step. '' off the scale. */
export function causeLine(d) {
  if (!d) return '';
  const parts = [];
  const stance = d.risk && STANCE_IDS.includes(d.risk) ? t('hunts.stance_' + d.risk) : null;
  if (d.held !== null && stance) parts.push(t(d.deep !== null && d.deep <= d.held ?'report.depth_held_top' : 'report.depth_held', { depth: d.held, of: d.of, stance }));
  if (d.deep !== null && (d.held === null || !stance || d.deep > d.held)) parts.push(t('report.depth_deep', { deep: d.deep, of: d.of }));
  if (!d.n || !d.last) parts.push(t('report.fell_none'));
  else {
    const [name, pm, monster] = d.last;
    const v = { count: d.n, name: name || t('report.fell_hero'), pct: pct(pm), monster: monster === 'unknown' ? t('report.fell_monster') : monsterName(monster) };
    /* [hurt, died]: a fall at some health, and one where the hero died (pm 0) */
    const keys = d.n === 1 ? ['report.fell_one', 'report.fell_one_died'] : d.n >= HUNT_REPORT.fallsMax ? ['report.fell_many_more', 'report.fell_many_more_died']
      : ['report.fell_many', 'report.fell_many_died'];
    parts.push(t(keys[pm === 0 ? 1 : 0], v));
  }
  return parts.join(' · ');
}

/** THE EARNED LINE: the server's gold an hour (coins and loot) and its store supplies an hour, in words; '' when it rated no hour. */
export function earnedLine(rates) {
  if (!rates || !Number.isFinite(rates.goldH) || rates.goldH < 0) return '';
  const g = { gold: whole(rates.goldH) };
  return Number.isFinite(rates.wasteH) && rates.wasteH >= 0 ? t('report.earned', Object.assign(g, { supplies: whole(rates.wasteH) })) : t('report.earned_only', g);
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
  const risk = riskLines(r, cur ? cur.xpH : null, cur), rules = rulesLines(r, prev ? prev.report : null);
  cls(root.querySelector('.hsum-report-risk .hw-ledger-head'), 'is-on', risk.length > 0);
  lineRows(root.querySelector('.hsum-risk'), doc, risk);
  cls(root.querySelector('.hsum-report-rules .hw-ledger-head'), 'is-on', rules.length > 0);
  lineRows(root.querySelector('.hsum-rules'), doc, rules);
}
