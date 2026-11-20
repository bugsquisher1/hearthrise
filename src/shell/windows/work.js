// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/work.js — GATHERING AND CRAFTING: THE LEDGER, AND THE DOOR TO WORK.
//
// Designer ruling 2026-10-22 (lane/b-town-skills): the town skills had a
// ledger and no door, so Woodcutting, Mining, Fishing, Smithing, Crafting and
// Runecrafting sat at zero. The door is THIS window (G), not a new one: press
// a skill in the ledger and the window shows what that skill can do, each row
// with Start. One press starts it (or switches to it from whatever runs: the
// server collects the old one first); Stop ends it. The intents are
// src/shell/town-work.js's, the one path the bag's Bury all / Cook all use too.
//
// What a row says, all from the server's envelope and the shared catalogues:
//   gathering   what it yields, the seconds per action for the tool the hero
//               holds, the XP each, and how many the bag holds now
//   a bench     what goes in and what comes out, the seconds and XP each, and
//               how many the bag and the account's Storage cover ("Makes up to
//               62"; the server spends the bag first, Tyler 2026-10-25) or what is missing
//   locked      the next two rows above the level, "Needs Smithing 15"; past them the station's whole
//               ladder, one rung a Level, each thing it opens with its card on the pointer
//   a piece     what it is against what the hero wears: its stats, each with its change against the
//               worn piece (src/shell/bench-output.js); a bench row's fee says what the picked count
//               takes in all before Start (src/shell/bench-fee.js; itemization audit 2026-11-18)
// A crafting station's rows come in the order its Sort menu picks (Can make, Level, Name;
// src/shell/station-sort.js), remembered per station; locked rows stay in the list under every sort.
// Buttons are off while a press is in flight and when the server's numbers say
// no (a hunt running, the level, the materials); the server re-checks all of it.
// While the work runs, the line and the skill's bar under its title also count
// what the server's engine has certainly done since its last payout
// (src/shell/town-ticker.js), as pending; the rows' numbers stay the server's.
// Farming has no rows here: it is grown in plots, which this window does not run, so its
// ledger line is a link to the window that does (skill-guide.js `window`: the Farm), the
// same arrow and press as every other skill (audit 2026-11-18 A4: the one line that went nowhere).
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.143';
import { SKILL_GUIDE } from '../../data/skill-guide.js?v=0.2.143';
import { recipeInputs, burnPct } from '../../core/artisan.js?v=0.2.143';
import { skillsOf, skillLevelsOf, heldOf, drawsOnStorage, equipmentOf } from '../../session/item-sections.js?v=0.2.143';
import { levelOf } from '../../session/character-sections.js?v=0.2.143';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.143';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js?v=0.2.143';
import { whole } from '../../render/format.js?v=0.2.143';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.143';
import { itemName, itemNameFor, itemIconHtml } from '../widgets/bits.js?v=0.2.143';
import { runIntent } from '../intent-words.js?v=0.2.143';
import { renderTradeSkills, skillBarHtml, patchSkillProgress } from './skills.js?v=0.2.143';
import { GATHER_INDEX, BENCH_INDEX, workRow, workOf, productOf, yieldOf, runsOf, affordable, actionMs, perHourOf, xpEach, workBlock, startWork, stopWork, nowParts, gatherBagWords, tickOf, BENCH_COUNTS, BENCH_MAX, clampCount, defaultCount, leftOf, toolLine, shortInputLine } from '../town-work.js?v=0.2.143';
import { patchParts, placesParts, gotoKey, followGoto } from '../goto.js?v=0.2.143';
import { saleWords } from '../item-lore.js?v=0.2.143';
import { aheadXp, paintLine } from '../town-ticker.js?v=0.2.143';
import { feeLineWords, feeFullWords, feeHeadWords, benchEndWords } from '../bench-fee.js?v=0.2.143';
import { outputVsWorn, ladderOf } from '../bench-output.js?v=0.2.143';
import { showTip, hideTip } from './item-tip.js?v=0.2.143';
import { kindOf, equipSlotFor } from '../bag-model.js?v=0.2.143';
import { rollOddsOf, jobShown } from '../../session/jewelry-sections.js?v=0.2.143';
import { JEWEL_STEP_BENCHES } from '../../data/jewelry.js?v=0.2.143';
import { hallmarkPaneHtml, patchHallmarkPane, actHallmarkPane } from './hallmark-pane.js?v=0.2.143';
import { DEFAULT_SORT, stationSortOf, withStationSort, orderStation, sortMenuHtml, patchSortMenu } from '../station-sort.js?v=0.2.143';
import { t } from '../../render/player-text.js?v=0.2.143';
import { heroGroundOf } from '../widgets/first-target.js?v=0.2.143';

/* How many rows above the level a skill shows: the next things to aim at. */
const AHEAD = 2;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { skill: null, pending: false, msg: '', n: {} }; SCRATCH.set(cs, s); } return s; };
/* The display state this hero keeps on the server (the residue allowlist, src/session/residue.js). */
const residueOf = (cs) => (cs && cs.record && cs.record.residue) || {};
/* The amount a bench row will make on its next Start (1, 5 or 'all'): the player's pick, else the row's default. */
const countOf = (sc, w) => (Object.prototype.hasOwnProperty.call(sc.n, w.id) ? sc.n[w.id] : defaultCount(w));

/* skill -> its work rows in catalogue order ({ kind, id, skill, row }), built once. */
const BY_SKILL = new Map();
for (const id of Object.keys(GATHER_INDEX)) push(workRow('gather', id));
for (const id of Object.keys(BENCH_INDEX)) push(workRow('artisan', id));
function push(w) { if (!BY_SKILL.has(w.skill)) BY_SKILL.set(w.skill, []); BY_SKILL.get(w.skill).push(w); }

/** Does this skill have a door here? (Its category is gathering or crafting and it has rows the engine runs.) */
function hasWork(skill) {
  const d = SKILLS_DEF[skill];
  return !!d && (d.cat === 'gather' || d.cat === 'artisan') && BY_SKILL.has(skill);
}

/** The window a skill with no rows here is trained in (skill-guide.js `window`), as a link target, or null. */
export function elsewhereOf(skill) {
  const g = hasWork(skill) ? null : SKILL_GUIDE[skill];
  return g && g.window ? { win: g.window, tab: null, find: null } : null;
}

/**
 * The rows a skill shows at the server's level: what it can do now, then the next AHEAD above the level, in
 * the station's picked order (src/shell/station-sort.js; by default what the bag covers first, best first,
 * the locked ones last). Pure over (skill, level, bag, sort, shown). `shown` keeps a row the server offers this hero (a job behind a
 * server switch only where its `features` list it: jewelry-sections.js jobShown); none keeps every row.
 */
export function rowsFor(skill, level, inv, sort, shown) {
  const lv = Number.isInteger(level) ? level : 1;
  const open = rowsOf(skill, shown).filter((w) => (w.row.req || 1) <= lv);
  return orderStation(open, lockedOf(skill, lv, shown).slice(0, AHEAD), sort, (w) => w.kind === 'artisan' && runsOf(w.row, inv) > 0);
}

/* A skill's rows this hero is offered (`shown`, rowsFor), and those above the level, lowest first: the next AHEAD in full (rowsFor), the
   rest its ladder (bench-output.js ladderOf). */
const rowsOf = (skill, shown) => (BY_SKILL.get(skill) || []).filter((w) => !shown || shown(w));
const lockedOf = (skill, lv, shown) => rowsOf(skill, shown).filter((w) => (w.row.req || 1) > lv).sort((a, b) => (a.row.req || 1) - (b.row.req || 1));

/* THE WHOLE LADDER (itemization audit 2026-11-18 #1): every rung past the rows in full, one line a Level, each thing it opens an icon and a
   name whose card (the item tooltip, against what the hero wears) shows on the pointer. Built once a skill and level. */
function ladderHtml(g, rungs) {
  if (!rungs.length) return '';
  return '<h4 class="hw-hd-h">' + esc(t('work.ladder_head')) + '</h4><ul class="hw-ladder">' + rungs.map((r) => '<li class="hw-ladder-rung"><b class="hw-ladder-lv">'
    + esc(t('work.row_level', { level: r.level })) + '</b><span class="hw-ladder-items">' + r.items.map((w) => {
      const out = productOf(w);
      return '<span class="hw-ladder-item"' + (out ? ' data-hs-act="work-tip" data-item="' + esc(out) + '"' : '') + '>'
        + itemIconHtml(g, out || Object.keys(recipeInputs(w.row))[0]) + '<span>' + esc(out ? itemName(out) : w.row.name) + '</span></span>';
    }).join('') + '</span></li>').join('') + '</ul>';
}

/* What a row makes against what the hero wears (bench-output.js), as a comparison reads in any RPG: each stat with its change against the
   worn piece after it in gain or loss ("+16 Melee damage (+13)"), then what it is set against ("vs Practice Sword", "Empty ammo slot"). */
const keep = (s) => esc(s).replace(/ /g, NBSP);   /* the line breaks only between its parts, never inside "+16 Melee damage (+13)" */
const changeHtml = (c) => '<span class="' + (c.gain ? 'is-gain' : 'is-loss') + '">' + keep(c.text) + '</span>';
function isHtml(o) {
  if (!o) return '';
  const stats = o.stats.map((s) => (s.stat ? keep(s.stat) + (s.change ? NBSP + '(' + changeHtml(s.change) + ')' : '') : changeHtml(s.change))).join(', ');
  const vs = o.same ? t('work.is_worn') : o.worn ? t(o.stats.some((s) => s.change) ? 'work.is_vs' : 'work.is_same', { worn: itemName(o.worn) })
    : o.slot ? t('work.is_empty', { slot: o.slot }) : '';
  return [stats, vs ? '<span class="hw-work-vs">' + keep(vs) + '</span>' : ''].filter(Boolean).join(' · ');
}

const NBSP = String.fromCharCode(160);
const secs = (ms) => String(Math.round(ms / 100) / 10);
/* A bench recipe's own name, for the line about its last run. */
const recipeNameOf = (id) => { const w = workRow('artisan', id); return w ? w.row.name : 'That job'; };

/* A RECIPE IS A GENRE ROW (UI audit 2026-11-18: "a recipe row is a paragraph"): what it makes is the row's icon (its count in
   the corner when one run makes more than one), what goes in is a chip per input with its own icon and count, then one line of
   numbers (seconds, XP, the burn, who buys it) and one of status; the required Level sits at the right by Start. */
function inputsHtml(g, w) {
  if (w.kind === 'gather') return '<span class="hw-work-in">' + esc(itemName(productOf(w))) + '</span>';
  return Object.entries(recipeInputs(w.row)).map(([id, n]) => '<span class="hw-work-in" title="' + esc(itemNameFor(id, n)) + '">'
    + itemIconHtml(g, id) + esc(whole(n) + ' ' + itemNameFor(id, n)) + '</span>').join('');
}
/* Who won't buy what it makes, said before it is made (panel 2026-11-01: 12,000 runes, no buyer, no word): a short tag, the sentence on the pointer. */
function saleTag(out) {
  const s = out ? saleWords(out) : '';
  return !s ? '' : s === t('item.own_use') ? t('work.sale_none') : t('work.sale_shop');
}

/* A rolled job's odds at the server's level in the job's own bench, BEFORE the roll (Tyler 2026-11-05, call 6), and what a guarantee
   fixes (a boss drop set in place of the gem: src/data/jewelry.js JEWEL_GUARANTEES). No gold moves on a roll. */
export function oddsWords(cs, w) {
  const o = rollOddsOf(cs, w.row);
  if (!o) return '';
  const n = o.perks.length;
  const perks = n > 1 ? t('work.odds_or', { list: o.perks.slice(0, -1).join(', '), last: o.perks[n - 1] }) : o.perks.join('');
  const grade = o.plain ? t('work.odds_plain', { fine: o.fine, hallmarked: o.hallmarked })
    : o.fine === '0%' ? t('work.odds_sealed') : t('work.odds_fine', { hallmarked: o.hallmarked });
  const line = t('work.odds_at', { skill: SKILLS_DEF[o.skill].name, level: o.level, grade,
    perks: t(o.perk ? 'work.odds_second' : 'work.odds_perks', { perks }) });
  return o.perk ? t('work.odds_always', { perk: o.perk, rest: line }) : line;
}
/* The rows the server offers this hero: a dark job only where its switch is on (jewelry-sections.js jobShown). */
const shownBy = (cs) => (w) => jobShown(cs, w.row);

function rowHtml(g, w) {
  const icon = productOf(w) || Object.keys(recipeInputs(w.row))[0];
  const n = w.kind === 'artisan' ? yieldOf(w) : 1;
  /* what it makes, named on the pointer (a rite makes nothing: its icon is what it takes) */
  const made = productOf(w) ? ' title="' + esc(itemName(productOf(w))) + '"' : '';
  return '<li class="hw-line hw-work-row" data-id="' + esc(w.id) + '" data-hs-find="' + esc(w.id) + '"><span class="hw-ico"' + made
    + (w.kind === 'artisan' && productOf(w) ? ' data-hs-act="work-tip" data-item="' + esc(productOf(w)) + '"' : '') + '>' + itemIconHtml(g, icon)
    + (n > 1 ? '<small class="hw-work-yield">' + esc(whole(n)) + '</small>' : '') + '</span>'
    + '<span class="hw-line-name"><span class="hw-work-top"><b>' + esc(w.row.name) + '</b><small class="hw-work-lv">' + esc(t('work.row_level', { level: w.row.req || 1 })) + '</small></span>'
    + '<small class="hw-work-is"></small>'
    + '<span class="hw-work-ins"><span class="hw-work-what">' + inputsHtml(g, w) + '</span><small class="hw-work-stat"></small></span>'
    + '<small class="hw-work-odds"></small><small class="hw-work-fee"></small><small class="hw-work-why"></small>'
    /* "Make N" (a bench row only), under the row's words: how many the next Start makes; the server stops the bench there. */
    + (w.kind === 'artisan' ? '<span class="hh-segs hw-work-n" role="group" aria-label="How many to make">'
      + BENCH_COUNTS.map((n) => '<button type="button" class="hh-seg" data-hs-act="work-n" data-id="' + esc(w.id) + '" data-n="' + n + '">'
        + (n === 'all' ? 'All' : n) + '</button>').join('')
      + '<button type="button" class="hh-seg hw-work-xb" data-hs-act="work-x" data-id="' + esc(w.id) + '" data-n="x">X</button>'
      + '<span class="hw-work-x" hidden><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" enterkeyhint="done"'
      + ' class="hw-work-xf" data-hs-act="work-x-field" data-id="' + esc(w.id) + '" aria-label="How many, 1 to ' + BENCH_MAX + '">'
      + '<button type="button" class="hh-seg" data-hs-act="work-x-set" data-id="' + esc(w.id) + '">Set</button></span></span>' : '')
    + '</span><button type="button" class="hh-tool hw-work-go" data-hs-act="work-go" data-kind="' + w.kind + '" data-id="' + esc(w.id) + '"></button></li>';
}

function patchRow(li, w, cs, sc, on, hunting, lv, worn) {
  const ms = actionMs(cs, w);
  const out = productOf(w);
  const gather = w.kind === 'gather';
  /* What it makes, against the worn set the server sends: written only when it changes (a key on the line). */
  const is = li.querySelector('.hw-work-is'), isSaid = gather ? '' : isHtml(outputVsWorn(out, worn));
  if (is.getAttribute('data-is') !== isSaid) { is.innerHTML = isSaid; is.setAttribute('data-is', isSaid); }
  prop(is, 'hidden', !isSaid);
  /* The numbers line: the seconds and XP an action at the hero's tool, then a node's hourly yield, or a dish's burn chance at the
     server's Cooking level ("up to": a Kitchen rung the server holds burns less) and who won't buy what it makes. */
  const burn = w.skill === 'cooking' && out ? burnPct(w.row, lv, 0) : 0;
  const sale = gather ? '' : saleTag(out);
  const stat = li.querySelector('.hw-work-stat');
  /* the line breaks only between its parts, never inside one ("3.8 s", "burns up to 25%") */
  text(stat, [t('work.row_time_xp', { secs: secs(ms), xp: whole(xpEach(w)) }), gather ? t('work.row_per_hour', { n: whole(perHourOf(w, ms)) }) : '',
    burn ? t('work.row_burn', { pct: burn }) : '', sale].filter(Boolean).map((s) => s.replace(/ /g, NBSP)).join(' · '));
  attr(stat, 'title', sale ? saleWords(out) : null);
  cls(li.querySelector('.hw-work-lv'), 'is-short', (w.row.req || 1) > (Number.isInteger(lv) ? lv : 1));
  const running = !!on && on.id === w.id;
  const why = running ? '' : workBlock(cs, w, hunting);
  /* The status line: running, why not, or what the server's bag holds / covers. */
  const pick = gather ? 'all' : countOf(sc, w);
  /* The bench's count reads what it draws on: the server's bag + Storage (heldOf), the server's own order. */
  const runs = gather ? 0 : affordable(cs, w, runsOf(w.row, heldOf(cs)));
  const odds = li.querySelector('.hw-work-odds'), oddsSaid = gather ? '' : oddsWords(cs, w);
  text(odds, oddsSaid);
  prop(odds, 'hidden', !oddsSaid);
  /* What the public bench takes, before the press (bench-fee.js): the whole sentence on the pointer, the rate on the row and what the
     picked count takes in all, its share of the purse when that is big (a new hero's All spent 38% unseen, itemization audit 2026-11-18). */
  const fee = li.querySelector('.hw-work-fee');
  text(fee, feeLineWords(cs, w, gather ? 0 : pick === 'all' ? runs : Math.min(pick, runs), pick === 'all'));
  attr(fee, 'title', feeFullWords(cs, w) || null);
  const have = gather ? gatherBagWords(cs, w, running)
    : pick === 'all' ? t('work.row_makes', { n: whole(runs * yieldOf(w)) })
      : t('work.row_makes_of', { n: whole(Math.min(pick, runs) * yieldOf(w)), max: whole(runs * yieldOf(w)) });
  /* Running: the server's count left on this run ("3 left"), or nothing when it runs until the bag is out. */
  const left = running && !gather ? leftOf(cs) : null;
  /* Short of an input: where to get it, each place a link to its window (src/shell/goto.js) */
  const short = why ? shortInputLine(cs, w, hunting) : null;
  patchParts(li.querySelector('.hw-work-why'), short ? [short.head].concat(short.places.length ? [' '] : [], placesParts(short.places))
    : [why || (running ? 'Working on it now' + (left !== null ? ', ' + whole(left) + ' left' : '') + '. ' : '') + have]);
  /* "X": a typed count shows on its button; the field is open only on the row that asked for it. */
  const custom = typeof pick === 'number' && !BENCH_COUNTS.includes(pick);
  const xb = li.querySelector('.hw-work-xb');
  if (xb) text(xb, custom ? whole(pick) : 'X');
  const xs = li.querySelector('.hw-work-x');
  if (xs) attr(xs, 'hidden', sc.xOpen === w.id && !running ? null : '');
  for (const s of li.querySelectorAll('.hw-work-n .hh-seg')) {
    const dn = s.getAttribute('data-n');
    if (dn !== null) attr(s, 'aria-pressed', String(dn === 'x' ? custom : dn === String(pick)));
    prop(s, 'disabled', sc.pending || running);
  }
  cls(li, 'is-on', running);
  cls(li, 'is-locked', !running && !!why);
  const b = li.querySelector('.hw-work-go');
  text(b, running ? 'Stop' : 'Start');
  attr(b, 'data-hs-act', running ? 'work-stop' : 'work-go');
  attr(b, 'title', why || null);
  prop(b, 'disabled', sc.pending || (!running && !!why));
}

/** The skeleton: the work line, the ledger (skills.js), one skill's rows, the press's answer. */
export function renderWork() {
  return '<div class="hw-trade">'
    + '<div class="hw-burying hw-work-now" role="status"><span class="hw-burying-q"></span><button type="button" class="hh-tool" data-hs-act="work-stop">' + t('controls.stop') + '</button></div>'
    + '<p class="hs-note hw-work-end" role="status"></p>'
    + '<div class="hw-trade-ledger"><p class="hs-note hw-work-hint">Press a skill to gather or make.</p>' + renderTradeSkills() + '</div>'
    + '<section class="hw-work"><div class="hw-work-head">'
    + '<b class="hw-work-title"></b>' + skillBarHtml('Skill') + '<small class="hw-skill-xp"></small><b class="hw-skill-lv"></b></div>'
    + '<p class="hs-note hw-work-use"></p><p class="hs-note hw-work-tool"></p>' + hallmarkPaneHtml() + sortMenuHtml() + '<ul class="hw-ledger hw-work-rows"></ul><div class="hw-work-ladder"></div></section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderWork.patch = function patchWork(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  /* a link that named a skill (src/shell/goto.js: "Made with Smithing 15") opens its rows */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('skills-trade') : null;
  if (want && hasWork(want) && want !== sc.skill) { sc.skill = want; sc.msg = ''; }
  const root = body.querySelector('.hw-trade');
  const on = workOf(cs);
  const h = huntOf(cs);
  const hunting = !!(h && !h.ended);
  /* The line: what runs now, from the server's pointer, with its Stop (its pending part marked: town-ticker.js). */
  const line = nowParts(cs);
  const now = root.querySelector('.hw-work-now');
  cls(now, 'is-on', line.length > 0);
  paintLine(now.querySelector('.hw-burying-q'), line, ctx.doc);
  prop(now.querySelector('button'), 'disabled', sc.pending);
  /* The last run's end, with nothing running: why the bench stopped and what it took. */
  text(root.querySelector('.hw-work-end'), line.length ? '' : benchEndWords(cs, recipeNameOf));
  /* The ledger, each skill with a door pressable. */
  const ledger = root.querySelector('.hw-trade-ledger');
  renderTradeSkills.patch(ledger, ctx);
  for (const li of ledger.querySelectorAll('.hw-skill')) {
    const id = li.getAttribute('data-key');
    const door = hasWork(id);
    /* a skill trained in another window (the Farm) is a link to it: the shell follows the press (goto.js), Enter here */
    const away = elsewhereOf(id);
    attr(li, 'data-hs-act', door ? 'open-skill' : away ? 'open-place' : null);
    attr(li, 'data-hs-goto', gotoKey(away));
    attr(li, 'data-skill', door ? id : null);
    attr(li, 'role', door || away ? 'button' : null);
    attr(li, 'tabindex', door || away ? '0' : null);
    cls(li, 'is-working', !!on && on.skill === id);
  }
  /* One skill's rows. */
  const skill = sc.skill && hasWork(sc.skill) ? sc.skill : null;
  cls(ledger, 'is-off', !!skill);
  const view = root.querySelector('.hw-work');
  cls(view, 'is-on', !!skill);
  if (skill) {
    const sk = skillsOf(cs);
    const lv = sk && sk[skill] ? sk[skill].level : null;
    /* the head draws the ledger's cell (skillLevelsOf: the server's level and its two XP marks), the rows gate on `lv` */
    const bar = (skillLevelsOf(cs) || {})[skill] || null;
    const head = view.querySelector('.hw-work-head');
    text(view.querySelector('.hw-work-title'), SKILLS_DEF[skill].name);
    text(head.querySelector('.hw-skill-lv'), bar ? String(bar.level) : '');
    /* The skill's own bar beside its title: the server's XP, and what the running work has earned since the payout. */
    cls(head, 'has-xp', !!bar);
    attr(head.querySelector('.hw-skill-bar'), 'aria-label', SKILLS_DEF[skill].name + ' progress');
    if (bar) patchSkillProgress(head, bar, aheadXp(tickOf(cs), skill));
    const guide = SKILL_GUIDE[skill];
    const how = SKILLS_DEF[skill].cat === 'gather'
      ? 'Runs offline until stopped or a hunt starts'
      : 'Uses materials from bag' + (drawsOnStorage(cs) ? ' and Storage' : '') + ' until they run out';
    text(view.querySelector('.hw-work-use'), [guide ? guide.use : '', how, feeHeadWords(cs, skill)].filter(Boolean).join('\n'));
    const tool = view.querySelector('.hw-work-tool'), toolSaid = toolLine(cs, skill);
    text(tool, toolSaid);
    prop(tool, 'hidden', !toolSaid);
    /* A crafting station's recipes come in the order this hero picked there (residue, display only); gathering keeps its one order. */
    const bench = SKILLS_DEF[skill].cat === 'artisan';
    const sort = bench ? stationSortOf(residueOf(cs), skill) : DEFAULT_SORT;
    patchSortMenu(view.querySelector('.hw-work-sort'), bench && lv !== null, sort);
    const worn = equipmentOf(cs);
    rows(view.querySelector('.hw-work-rows'), lv === null ? [] : rowsFor(skill, lv, heldOf(cs), sort, shownBy(cs)), {
      key: (w) => w.id,
      build: (w) => element(ctx.doc, rowHtml(ctx.glyphs, w)),
      patch: (li, w) => patchRow(li, w, cs, sc, on, hunting, lv, worn),
    });
  }
  /* the ladder past those rows, redrawn when the skill or its server level moves */
  const ladder = view.querySelector('.hw-work-ladder');
  const lvNow = skill ? ((skillsOf(cs) || {})[skill] || {}).level : null;
  /* (the rows the server offers join the key, so the ladder redraws the moment a dark job's switch opens) */
  const ladderKey = skill && Number.isInteger(lvNow) ? skill + ':' + lvNow + ':' + rowsOf(skill, shownBy(cs)).length : '';
  if (ladder.getAttribute('data-key') !== ladderKey) {
    ladder.setAttribute('data-key', ladderKey);
    ladder.innerHTML = ladderKey ? ladderHtml(ctx.glyphs, ladderOf(lockedOf(skill, lvNow, shownBy(cs)).slice(AHEAD))) : '';
  }
  /* The Hallmark step and the reforge belong to each crafted piece's own bench (src/data/jewelry.js JEWEL_STEP_BENCHES: Smithing for jewelry; Crafting's
     cloaks join once they roll): above its rows, one line until the hero holds a piece to work on. */
  const hall = view.querySelector('.hw-hallmark');
  const jeweler = JEWEL_STEP_BENCHES.includes(skill);
  prop(hall, 'hidden', !jeweler);
  if (jeweler) patchHallmarkPane(hall, ctx, sc, skill);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

/* Enter or Space on a focused skill opens it, like a press; a made thing's icon shows its card on the pointer. */
renderWork.events = Object.freeze(['keydown', 'mouseover', 'mouseout']);

/* A made thing's card (item-tip.js), against the piece the server says is worn in its slot, as the bag shows it. */
function tipFor(ctx, el) {
  const cs = ctx.character, id = el.getAttribute('data-item'), eq = equipmentOf(cs) || {};
  const slot = kindOf(id) === 'gear' ? equipSlotFor(id, eq) : null;
  const lv = levelOf(cs);
  showTip(ctx.doc, el, id, { worn: slot ? (eq[slot] || null) : undefined, skills: skillsOf(cs), level: lv ? lv.level : null, ground: heroGroundOf(cs) });
}

/* The typed count, clamped to what the server takes, becomes the row's pick (Enter or Set). */
function setX(sc, field, repaint) {
  const n = field ? clampCount(field.value) : null;
  const id = field && field.getAttribute('data-id');
  if (id && n !== null) sc.n[id] = n;
  sc.xOpen = null;
  repaint();
  return true;
}

renderWork.act = function actWork(ctx, body, action, ev, el) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderWork.patch(body, ctx);
  const send = (fn, busy, done) => runIntent(sc, repaint, fn, busy, done);
  /* The station's Sort menu: the pick is remembered for this station (residue, display only) and the rows re-order at once. */
  if (action === 'station-sort') {
    if (ev.type !== 'change' || !sc.skill) return false;
    const next = withStationSort(residueOf(cs), sc.skill, el.value);
    if (next) { cs.setResidue('stationSort', next); repaint(); }
    return false;
  }
  if (action === 'work-tip') {
    if (ev.type === 'mouseover' || ev.type === 'click') tipFor(ctx, el);
    else if (ev.type === 'mouseout' && !el.contains(ev.relatedTarget)) hideTip(ctx.doc);
    return false;
  }
  if (ev.type === 'mouseover' || ev.type === 'mouseout') return false;
  if (action === 'work-x-field') {
    if (ev.type !== 'keydown') return false;
    if (ev.key === 'Escape') { sc.xOpen = null; repaint(); return true; }
    return ev.key === 'Enter' ? setX(sc, el, repaint) : false;
  }
  if (ev.type === 'keydown') {
    if ((action !== 'open-skill' && action !== 'open-place') || (ev.key !== 'Enter' && ev.key !== ' ')) return false;
    if (action === 'open-place') return followGoto(ctx, el);
  } else if (ev.type !== 'click') return false;
  /* To a skill's rows and back: the header's Back follows the page AT ONCE (the shell's refresh paints both, as Hunts does). Painted on a later
     refresh, the Back grew the head under a pressed Start and pushed its row out of the body (IP-7, a 667x375 phone). */
  const repage = () => (typeof ctx.refresh === 'function' ? ctx.refresh('skills-trade') : repaint());
  if (action === 'open-skill') { sc.skill = el.getAttribute('data-skill'); sc.msg = ''; repage(); return true; }
  if (action === 'work-back') { sc.skill = null; sc.msg = ''; repage(); return true; }
  if (action === 'work-stop') { if (workOf(cs)) stopWork(cs, send); return true; }
  if (action.indexOf('hallmark-') === 0) return actHallmarkPane(ctx, action, el, sc, repaint);
  if (action === 'work-n') {
    const id = el.getAttribute('data-id');
    const raw = el.getAttribute('data-n');
    const n = raw === 'all' ? 'all' : Number(raw);
    if (id && BENCH_COUNTS.includes(n)) { sc.n[id] = n; repaint(); }
    return true;
  }
  if (action === 'work-x') {
    const id = el.getAttribute('data-id');
    sc.xOpen = sc.xOpen === id ? null : id;
    repaint();
    const f = sc.xOpen && el.parentNode.querySelector('.hw-work-xf');
    if (f) { f.value = typeof sc.n[id] === 'number' ? String(sc.n[id]) : ''; f.focus(); }
    return true;
  }
  if (action === 'work-x-set') return setX(sc, el.parentNode.querySelector('.hw-work-xf'), repaint);
  if (action === 'work-go') {
    const w = workRow(el.getAttribute('data-kind'), el.getAttribute('data-id'));
    if (!w) return true;
    const h = huntOf(cs);
    const why = workBlock(cs, w, !!(h && !h.ended));
    if (why) { sc.msg = why; repaint(); return true; }
    const n = w.kind === 'artisan' ? countOf(sc, w) : 'all';
    startWork(cs, w, send, repaint, undefined, n === 'all' ? null : n);
    return true;
  }
  return false;
};

/* The header's Back (src/shell/window-head.js): a skill's rows go back to the ledger. */
renderWork.inner = (ctx, body) => (body.querySelector('.hw-work.is-on') ? 'work-back' : null);
