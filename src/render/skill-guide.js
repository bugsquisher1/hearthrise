// ════════════════════════════════════════════════════════════════════════
// src/render/skill-guide.js — WHAT A SKILL IS FOR, AND WHAT IT OPENS NEXT
//
// The one derivation of "what does level N of skill S open". The Skills
// header (both buildHead twins), the Character tile, the level-up banner
// (legacy hrSkillUnlocksAt is a delegate) and the welcome-back card all read
// it, so no two surfaces can name the same unlock differently.
//
// Every rung is a static CATALOGUE fact, never a read of client state:
//   · gathering nodes at node.req; crops at crop.req, and a crop that also
//     needs a plot tier above 1 says so ("Carrot (plot tier 2)") — the server
//     refuses a plant on either gate (hr_crop_plot_tier, 'plot_tier_locked');
//   · artisan recipes at recipe.req, SKIPPING every `gated` row: those need a
//     recipe scroll the server checks (gateOk, src/core/artisan.js), so a
//     level alone never opens them;
//   · gear at window.gearWieldReq(item).lv, read at CALL time (absent in node,
//     where the ladder simply has no gear rungs).
// The level is always the CALLER's (getLevel); this module never reads G.
//
// opensAt / nextUnlock / nextLine / awayLevelsLine return PLAIN TEXT — every
// consumer already escapes on paint. headHtml returns HTML and escapes itself.
// Nothing touches `window` at import time, so the node guard can load it.
// ════════════════════════════════════════════════════════════════════════

import { SKILLS_DEF } from '../data/skills.js?v=559';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../data/gathering.js?v=559';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=559';
import { ITEMS } from '../data/items.js?v=559';
import { requiredPlotLevel } from '../core/farm.js?v=559';
import { SKILL_GUIDE } from '../data/skill-guide.js?v=559';

const GATHER_NODES = { woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS };
const GEAR_SKILLS = new Set(['attack', 'defense', 'ranged', 'magic', 'prayer']);

const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const validLv = (lv) => Number.isInteger(lv) && lv >= 1 && lv <= 99;

function gearReqFn() {
  return (typeof window !== 'undefined' && typeof window.gearWieldReq === 'function')
    ? window.gearWieldReq : null;
}

/* Catalogue rows are static, so a ladder is built once per skill — but only
   memoised once gear can be read, or a node-time (gear-less) ladder would
   stick after the monolith publishes gearWieldReq. */
const _ladders = new Map();

/** [{lv, name}] for `skill`, ordered by level then catalogue order, names
    deduped within a level. */
export function ladderOf(skill) {
  if (_ladders.has(skill)) return _ladders.get(skill);
  const rows = [];
  const add = (lv, name) => { if (validLv(lv) && name) rows.push({ lv, name: String(name) }); };
  if (GATHER_NODES[skill]) GATHER_NODES[skill].forEach((n) => add(n.req, n.name));
  if (skill === 'farming') {
    Object.keys(CROPS).forEach((id) => {
      const tier = requiredPlotLevel(id);
      add(CROPS[id].req, tier > 1 ? `${CROPS[id].name} (plot tier ${tier})` : CROPS[id].name);
    });
  }
  const recipes = ARTISAN_RECIPES[skill];
  if (Array.isArray(recipes)) recipes.forEach((r) => { if (!r.gated) add(r.req, r.name); });
  const gearReq = GEAR_SKILLS.has(skill) ? gearReqFn() : null;
  if (gearReq) {
    Object.keys(ITEMS).forEach((id) => {
      const r = gearReq(ITEMS[id]);
      if (r && r.skill === skill) add(r.lv, ITEMS[id].n);
    });
  }
  const seen = new Set();
  const ladder = rows
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => a.lv - b.lv || a.i - b.i)
    .filter((r) => { const k = r.lv + '|' + r.name; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ lv, name }) => Object.freeze({ lv, name }));
  if (gearReq || !GEAR_SKILLS.has(skill)) _ladders.set(skill, ladder);
  return ladder;
}

function opensAt(skill, lv) {
  return ladderOf(skill).filter((r) => r.lv === lv).map((r) => r.name);
}

function nextUnlock(skill, lv) {
  const next = ladderOf(skill).find((r) => r.lv > lv);
  return next ? { lv: next.lv, names: opensAt(skill, next.lv) } : null;
}

function nextLine(skill, lv) {
  const n = nextUnlock(skill, lv);
  if (!n) return '';
  const more = n.names.length > 2 ? ` +${n.names.length - 2} more` : '';
  return `Next: ${n.names.slice(0, 2).join(', ')}${more} at Lv ${n.lv}`;
}

function headHtml(skill, lv) {
  const g = SKILL_GUIDE[skill];
  if (!g) return '';
  let tail = '';
  if (ladderOf(skill).length) {
    const next = nextLine(skill, lv);
    tail = next ? ' · ' + next : ` · Every ${SKILLS_DEF[skill].name} unlock is yours`;
  }
  return `<div class="ah-guide">${escHtml(g.line)}</div>`
    + `<div class="ah-next">Good for: ${escHtml(g.use)}${escHtml(tail)}</div>`;
}

/* The away receipt's levelUps are SERVER-STATED ({skill, from?, to}); the
   unlock names are derived here from that (from, to] range. Older receipts
   carry no `from` — those print "reached N" and claim no unlock. */
function awayLevelsLine(levelUps) {
  if (!Array.isArray(levelUps)) return '';
  const span = new Map();
  levelUps.forEach((e) => {
    if (!e || !SKILLS_DEF[e.skill] || !Number.isFinite(e.to)) return;
    const s = span.get(e.skill) || { from: Infinity, to: -Infinity };
    if (Number.isFinite(e.from)) s.from = Math.min(s.from, e.from);
    s.to = Math.max(s.to, e.to);
    span.set(e.skill, s);
  });
  const parts = [];
  const opened = [];
  Object.keys(SKILLS_DEF).forEach((id) => {
    const s = span.get(id);
    if (!s) return;
    const name = SKILLS_DEF[id].name;
    if (!Number.isFinite(s.from)) { parts.push(`${name} reached ${s.to}`); return; }
    parts.push(`${name} ${s.from} → ${s.to}`);
    ladderOf(id).forEach((r) => { if (r.lv > s.from && r.lv <= s.to) opened.push(r.name); });
  });
  if (!parts.length) return '';
  const first = opened.slice(0, 2);
  const tail = first.length === 2 ? ` — ${first[0]} and ${first[1]} are open.`
    : first.length === 1 ? ` — ${first[0]} is open.` : '.';
  return 'Levels while you were away: ' + parts.join(', ') + tail;
}

/** The Hero class: the title (SKILL_GUIDE[id].title) of the skill with the
    most XP, tiered at 100 / 1,000 / 10,000. Iterates the ROSTER, so a new
    skill is named the day its guide row lands. xpOf(id) returns a number or
    null (unknown); all-unknown returns null and the caller paints the pending
    mark. Ties keep roster order. */
export function heroClass(xpOf, defs = SKILLS_DEF) {
  let top = null, topXp = -1;
  Object.keys(defs).forEach((id) => {
    const xp = xpOf(id);
    if (typeof xp === 'number' && Number.isFinite(xp) && xp > topXp) { top = id; topXp = xp; }
  });
  if (top === null) return null;
  const name = SKILL_GUIDE[top] ? SKILL_GUIDE[top].title : defs[top].name;
  const tier = topXp < 100 ? 'Path: ' : topXp < 1000 ? 'Aspiring ' : topXp < 10000 ? 'Skilled ' : 'Master ';
  return { name, tagline: tier + name };
}

if (typeof window !== 'undefined') {
  window.HearthriseSkillGuide = { opensAt, nextUnlock, nextLine, headHtml, awayLevelsLine, heroClass };
}

export { headHtml };
