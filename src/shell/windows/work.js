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
//               how many the bag covers ("Makes up to 62") or what is missing
//   locked      the next two rows above the level, "Needs Smithing 15"
// Buttons are off while a press is in flight and when the server's numbers say
// no (a hunt running, the level, the materials); the server re-checks all of it.
// Farming has no door here: it is grown in plots, which this window does not run.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../data/skills.js?v=0.2.28';
import { SKILL_GUIDE } from '../../data/skill-guide.js?v=0.2.28';
import { recipeInputs, burnPct } from '../../core/artisan.js?v=0.2.28';
import { skillsOf } from '../../session/item-sections.js?v=0.2.28';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.28';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js?v=0.2.28';
import { whole } from '../../render/format.js?v=0.2.28';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.28';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.28';
import { runIntent } from '../intent-words.js?v=0.2.28';
import { renderTradeSkills } from './skills.js?v=0.2.28';
import { GATHER_INDEX, BENCH_INDEX, workRow, workOf, productOf, yieldOf, runsOf, actionMs, xpEach, workBlock, startWork, stopWork, nowLine } from '../town-work.js?v=0.2.28';

/* How many rows above the level a skill shows: the next things to aim at. */
const AHEAD = 2;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { skill: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

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
 * The rows a skill shows at the server's level: what it can do now (a bench: what the bag covers first),
 * best first, then the next AHEAD above the level. Pure over (skill, level, bag).
 */
export function rowsFor(skill, level, inv) {
  const all = BY_SKILL.get(skill) || [];
  const lv = Number.isInteger(level) ? level : 1;
  const open = all.filter((w) => (w.row.req || 1) <= lv);
  const ahead = all.filter((w) => (w.row.req || 1) > lv).sort((a, b) => (a.row.req || 1) - (b.row.req || 1)).slice(0, AHEAD);
  const can = (w) => (w.kind === 'artisan' && runsOf(w.row, inv) > 0 ? 1 : 0);
  open.sort((a, b) => can(b) - can(a) || (b.row.req || 1) - (a.row.req || 1));
  return open.concat(ahead);
}

const secs = (ms) => (Math.round(ms / 100) / 10) + ' s';

/* "2 Copper Ore → Bronze Bar", "6 Rune Blank → 45 Earth Rune", "Bones" (a rite). */
function recipeWords(w) {
  const ins = Object.entries(recipeInputs(w.row)).map(([id, n]) => whole(n) + ' ' + itemName(id)).join(' + ');
  const out = productOf(w);
  const n = yieldOf(w);
  return out ? ins + ' → ' + (n > 1 ? whole(n) + ' ' : '') + itemName(out) : ins;
}

function rowHtml(g, w) {
  const icon = productOf(w) || Object.keys(recipeInputs(w.row))[0];
  return '<li class="hw-line hw-work-row" data-id="' + esc(w.id) + '"><span class="hw-ico">' + itemIconHtml(g, icon) + '</span>'
    + '<span class="hw-line-name"><b>' + esc(w.row.name) + '</b><small class="hw-work-what"></small><small class="hw-work-why"></small></span>'
    + '<button type="button" class="hh-tool" data-hs-act="work-go" data-kind="' + w.kind + '" data-id="' + esc(w.id) + '"></button></li>';
}

function patchRow(li, w, cs, sc, on, hunting, lv) {
  const inv = (cs.read('inventory')) || {};
  const each = secs(actionMs(cs, w)) + ' · ' + whole(xpEach(w)) + ' XP each';
  const out = productOf(w);
  const gather = w.kind === 'gather';
  text(li.querySelector('.hw-work-what'), gather ? itemName(out) + ' · ' + each : recipeWords(w));
  const running = !!on && on.id === w.id;
  const why = running ? '' : workBlock(cs, w, hunting);
  /* The status line: running, why not, or what the server's bag holds / covers. A dish says its burn chance at the
     server's Cooking level ("up to": a Kitchen rung the server holds burns less). */
  const burn = w.skill === 'cooking' && out ? burnPct(w.row, lv, 0) : 0;
  const have = gather ? whole(inv[out] || 0) + ' in your bag'
    : 'Makes up to ' + whole(runsOf(w.row, inv) * yieldOf(w)) + ' · ' + each + (burn ? ' · burns up to ' + burn + '%' : '');
  text(li.querySelector('.hw-work-why'), why || (running ? 'Working on it now · ' : '') + have);
  cls(li, 'is-on', running);
  cls(li, 'is-locked', !running && !!why);
  const b = li.querySelector('button');
  text(b, running ? 'Stop' : 'Start');
  attr(b, 'data-hs-act', running ? 'work-stop' : 'work-go');
  attr(b, 'title', why || null);
  prop(b, 'disabled', sc.pending || (!running && !!why));
}

/** The skeleton: the work line, the ledger (skills.js), one skill's rows, the press's answer. */
export function renderWork() {
  return '<div class="hw-trade">'
    + '<div class="hw-burying hw-work-now" role="status"><span class="hw-burying-q"></span><button type="button" class="hh-tool" data-hs-act="work-stop">Stop</button></div>'
    + '<div class="hw-trade-ledger"><p class="hs-note hw-work-hint">Press a skill to gather or make something with it.</p>' + renderTradeSkills() + '</div>'
    + '<section class="hw-work"><div class="hw-work-head"><button type="button" class="hh-tool" data-hs-act="work-back">‹ All skills</button>'
    + '<b class="hw-work-title"></b><b class="hw-skill-lv"></b></div>'
    + '<p class="hs-note hw-work-use"></p><ul class="hw-ledger hw-work-rows"></ul></section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderWork.patch = function patchWork(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-trade');
  const on = workOf(cs);
  const h = huntOf(cs);
  const hunting = !!(h && !h.ended);
  /* The line: what runs now, from the server's pointer, with its Stop. */
  const line = nowLine(cs);
  const now = root.querySelector('.hw-work-now');
  cls(now, 'is-on', !!line);
  text(now.querySelector('.hw-burying-q'), line);
  prop(now.querySelector('button'), 'disabled', sc.pending);
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
    text(view.querySelector('.hw-work-title'), SKILLS_DEF[skill].name);
    text(view.querySelector('.hw-skill-lv'), lv === null ? '' : String(lv));
    const guide = SKILL_GUIDE[skill];
    const how = SKILLS_DEF[skill].cat === 'gather'
      ? 'Pick what to gather. Your hero keeps at it while you are away, until you stop it or start a hunt.'
      : 'Pick what to make. It uses the materials in your bag and stops when they run out.';
    text(view.querySelector('.hw-work-use'), (guide ? guide.use + ' ' : '') + how);
    const inv = (cs.read('inventory')) || {};
    rows(view.querySelector('.hw-work-rows'), lv === null ? [] : rowsFor(skill, lv, inv), {
      key: (w) => w.id,
      build: (w) => element(ctx.doc, rowHtml(ctx.glyphs, w)),
      patch: (li, w) => patchRow(li, w, cs, sc, on, hunting, lv),
    });
  }
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

/* Enter or Space on a focused skill opens it, like a press. */
renderWork.events = Object.freeze(['keydown']);

renderWork.act = function actWork(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderWork.patch(body, ctx);
  const send = (fn, busy, done) => runIntent(sc, repaint, fn, busy, done);
  if (ev.type === 'keydown') {
    if (action !== 'open-skill' || (ev.key !== 'Enter' && ev.key !== ' ')) return false;
  } else if (ev.type !== 'click') return false;
  if (action === 'open-skill') { sc.skill = t.getAttribute('data-skill'); sc.msg = ''; repaint(); return true; }
  if (action === 'work-back') { sc.skill = null; sc.msg = ''; repaint(); return true; }
  if (action === 'work-stop') { if (workOf(cs)) stopWork(cs, send); return true; }
  if (action === 'work-go') {
    const w = workRow(t.getAttribute('data-kind'), t.getAttribute('data-id'));
    if (!w) return true;
    const h = huntOf(cs);
    const why = workBlock(cs, w, !!(h && !h.ended));
    if (why) { sc.msg = why; repaint(); return true; }
    startWork(cs, w, send, repaint);
    return true;
  }
  return false;
};
