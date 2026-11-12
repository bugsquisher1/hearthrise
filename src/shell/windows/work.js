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
//   locked      the next two rows above the level, "Needs Smithing 15"
// A crafting station's rows come in the order its Sort menu picks (Can make, Level, Name;
// src/shell/station-sort.js), remembered per station; locked rows stay in the list under every sort.
// Buttons are off while a press is in flight and when the server's numbers say
// no (a hunt running, the level, the materials); the server re-checks all of it.
// While the work runs, the line and the skill's bar under its title also count
// what the server's engine has certainly done since its last payout
// (src/shell/town-ticker.js), as pending; the rows' numbers stay the server's.
// Farming has no door here: it is grown in plots, which this window does not run.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.124';
import { SKILL_GUIDE } from '../../data/skill-guide.js?v=0.2.124';
import { recipeInputs, burnPct } from '../../core/artisan.js?v=0.2.124';
import { skillsOf, skillLevelsOf, heldOf, drawsOnStorage } from '../../session/item-sections.js?v=0.2.124';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.124';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js?v=0.2.124';
import { whole } from '../../render/format.js?v=0.2.124';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.124';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.124';
import { runIntent } from '../intent-words.js?v=0.2.124';
import { renderTradeSkills, skillBarHtml, patchSkillProgress } from './skills.js?v=0.2.124';
import { GATHER_INDEX, BENCH_INDEX, workRow, workOf, productOf, yieldOf, runsOf, affordable, actionMs, perHourOf, xpEach, workBlock, startWork, stopWork, nowParts, gatherBagWords, tickOf, BENCH_COUNTS, BENCH_MAX, clampCount, defaultCount, leftOf, toolLine, shortInputLine } from '../town-work.js?v=0.2.124';
import { patchParts, placesParts } from '../goto.js?v=0.2.124';
import { saleWords } from '../item-lore.js?v=0.2.124';
import { aheadXp, paintLine } from '../town-ticker.js?v=0.2.124';
import { feeRowWords, feeFullWords, feeHeadWords, benchEndWords } from '../bench-fee.js?v=0.2.124';
import { rollOddsOf } from '../../session/jewelry-sections.js?v=0.2.124';
import { hallmarkPaneHtml, patchHallmarkPane, actHallmarkPane } from './hallmark-pane.js?v=0.2.124';
import { DEFAULT_SORT, stationSortOf, withStationSort, orderStation, sortMenuHtml, patchSortMenu } from '../station-sort.js?v=0.2.124';
import { t } from '../../render/player-text.js?v=0.2.124';

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

/**
 * The rows a skill shows at the server's level: what it can do now, then the next AHEAD above the level, in
 * the station's picked order (src/shell/station-sort.js; by default what the bag covers first, best first,
 * the locked ones last). Pure over (skill, level, bag, sort).
 */
export function rowsFor(skill, level, inv, sort) {
  const all = BY_SKILL.get(skill) || [];
  const lv = Number.isInteger(level) ? level : 1;
  const open = all.filter((w) => (w.row.req || 1) <= lv);
  const ahead = all.filter((w) => (w.row.req || 1) > lv).sort((a, b) => (a.row.req || 1) - (b.row.req || 1)).slice(0, AHEAD);
  return orderStation(open, ahead, sort, (w) => w.kind === 'artisan' && runsOf(w.row, inv) > 0);
}

const secs = (ms) => (Math.round(ms / 100) / 10) + ' s';
/* A bench recipe's own name, for the line about its last run. */
const recipeNameOf = (id) => { const w = workRow('artisan', id); return w ? w.row.name : 'That job'; };

/* "2 Copper Ore → Bronze Bar", "6 Rune Blank → 45 Earth Rune", "Bones" (a rite). */
function recipeWords(w) {
  const ins = Object.entries(recipeInputs(w.row)).map(([id, n]) => whole(n) + ' ' + itemName(id)).join(' + ');
  const out = productOf(w);
  const n = yieldOf(w);
  /* A ROLLED job (src/data/jewelry.js) names the grades it can make; its odds line says how likely each is. */
  if (out && w.row.roll === 'gem') return ins + ' → a Fine or Hallmarked ' + itemName(out);
  return out ? ins + ' → ' + (n > 1 ? whole(n) + ' ' : '') + itemName(out) : ins;
}

/* A rolled job's odds at the server's Crafting level, BEFORE the roll (Tyler 2026-11-05, call 6). No gold moves on a roll. */
function oddsWords(cs, w) {
  const o = rollOddsOf(cs, w.row);
  if (!o) return '';
  const perks = o.perks.length > 1 ? o.perks.slice(0, -1).join(', ') + ' or ' + o.perks[o.perks.length - 1] : o.perks.join('');
  return 'At your Crafting ' + o.level + ': ' + (o.plain ? 'Fine ' + o.fine + ', Hallmarked ' + o.hallmarked + ', otherwise plain'
    : 'Hallmarked ' + o.hallmarked + ', otherwise Fine') + '. Perks: ' + perks + '. No bench fee on a roll.';
}

function rowHtml(g, w) {
  const icon = productOf(w) || Object.keys(recipeInputs(w.row))[0];
  return '<li class="hw-line hw-work-row" data-id="' + esc(w.id) + '" data-hs-find="' + esc(w.id) + '"><span class="hw-ico">' + itemIconHtml(g, icon) + '</span>'
    + '<span class="hw-line-name"><b>' + esc(w.row.name) + '</b><small class="hw-work-what"></small><small class="hw-work-odds"></small><small class="hw-work-fee"></small><small class="hw-work-why"></small>'
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

function patchRow(li, w, cs, sc, on, hunting, lv) {
  const each = secs(actionMs(cs, w)) + ' · ' + whole(xpEach(w)) + ' XP each';
  const out = productOf(w);
  const gather = w.kind === 'gather';
  /* Who won't buy it is said before it is made (panel 2026-11-01: 12,000 runes, no buyer, no word). */
  const sale = !gather && out ? saleWords(out) : '';
  text(li.querySelector('.hw-work-what'), gather ? itemName(out) + ' · about ' + whole(perHourOf(w, actionMs(cs, w))) + ' an hour · ' + each : recipeWords(w) + (sale ? '. ' + sale + '.' : ''));
  const running = !!on && on.id === w.id;
  const why = running ? '' : workBlock(cs, w, hunting);
  /* The status line: running, why not, or what the server's bag holds / covers. A dish says its burn chance at the
     server's Cooking level ("up to": a Kitchen rung the server holds burns less). */
  const burn = w.skill === 'cooking' && out ? burnPct(w.row, lv, 0) : 0;
  const pick = gather ? 'all' : countOf(sc, w);
  /* The bench's count reads what it draws on: the server's bag + Storage (heldOf), the server's own order. */
  const runs = gather ? 0 : affordable(cs, w, runsOf(w.row, heldOf(cs)));
  const odds = li.querySelector('.hw-work-odds'), oddsSaid = gather ? '' : oddsWords(cs, w);
  text(odds, oddsSaid);
  prop(odds, 'hidden', !oddsSaid);
  /* What the public bench takes, before the press (bench-fee.js): the whole sentence on the pointer, the number on the row. */
  const fee = li.querySelector('.hw-work-fee');
  text(fee, feeRowWords(cs, w));
  attr(fee, 'title', feeFullWords(cs, w) || null);
  const makes = (pick === 'all' ? 'Makes up to ' + whole(runs * yieldOf(w))
    : 'Makes ' + whole(Math.min(pick, runs) * yieldOf(w)) + ' of up to ' + whole(runs * yieldOf(w)));
  const have = gather ? gatherBagWords(cs, w, running)
    : makes + ' · ' + each + (burn ? ' · burns up to ' + burn + '%' : '');
  /* Running: the server's count left on this run ("3 left"), or nothing when it runs until the bag is out. */
  const left = running && !gather ? leftOf(cs) : null;
  /* Short of an input: where to get it, each place a link to its window (src/shell/goto.js) */
  const short = why ? shortInputLine(cs, w, hunting) : null;
  patchParts(li.querySelector('.hw-work-why'), short ? [short.head].concat(short.places.length ? [' '] : [], placesParts(short.places))
    : [why || (running ? 'Working on it now · ' + (left !== null ? whole(left) + ' left · ' : '') : '') + have]);
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
    + '<p class="hs-note hw-work-use"></p><p class="hs-note hw-work-tool"></p>' + hallmarkPaneHtml() + sortMenuHtml() + '<ul class="hw-ledger hw-work-rows"></ul></section>'
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
    attr(li, 'data-hs-act', door ? 'open-skill' : null);
    attr(li, 'data-skill', door ? id : null);
    attr(li, 'role', door ? 'button' : null);
    attr(li, 'tabindex', door ? '0' : null);
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
      ? 'Pick what to gather. Your hero keeps at it while you are away, until you stop it or start a hunt.'
      : 'Pick what to make. It uses the materials in your bag' + (drawsOnStorage(cs) ? ', then your Storage,' : '') + ' and stops when they run out.';
    text(view.querySelector('.hw-work-use'), (guide ? guide.use + ' ' : '') + how + (feeHeadWords(cs, skill) ? ' ' + feeHeadWords(cs, skill) : ''));
    const tool = view.querySelector('.hw-work-tool'), toolSaid = toolLine(cs, skill);
    text(tool, toolSaid);
    prop(tool, 'hidden', !toolSaid);
    /* A crafting station's recipes come in the order this hero picked there (residue, display only); gathering keeps its one order. */
    const bench = SKILLS_DEF[skill].cat === 'artisan';
    const sort = bench ? stationSortOf(residueOf(cs), skill) : DEFAULT_SORT;
    patchSortMenu(view.querySelector('.hw-work-sort'), bench && lv !== null, sort);
    rows(view.querySelector('.hw-work-rows'), lv === null ? [] : rowsFor(skill, lv, heldOf(cs), sort), {
      key: (w) => w.id,
      build: (w) => element(ctx.doc, rowHtml(ctx.glyphs, w)),
      patch: (li, w) => patchRow(li, w, cs, sc, on, hunting, lv),
    });
  }
  /* The Hallmark step belongs to Crafting (src/data/jewelry.js JEWEL_SKILL): above its rows, one line until the hero holds a Fine piece. */
  const hall = view.querySelector('.hw-hallmark');
  prop(hall, 'hidden', skill !== 'crafting');
  if (skill === 'crafting') patchHallmarkPane(hall, ctx, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

/* Enter or Space on a focused skill opens it, like a press. */
renderWork.events = Object.freeze(['keydown']);

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
  if (action === 'work-x-field') {
    if (ev.type !== 'keydown') return false;
    if (ev.key === 'Escape') { sc.xOpen = null; repaint(); return true; }
    return ev.key === 'Enter' ? setX(sc, el, repaint) : false;
  }
  if (ev.type === 'keydown') {
    if (action !== 'open-skill' || (ev.key !== 'Enter' && ev.key !== ' ')) return false;
  } else if (ev.type !== 'click') return false;
  if (action === 'open-skill') { sc.skill = el.getAttribute('data-skill'); sc.msg = ''; repaint(); return true; }
  if (action === 'work-back') { sc.skill = null; sc.msg = ''; repaint(); return true; }
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
