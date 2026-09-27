#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/skill-guide-coverage.mjs — EVERY SKILL SAYS WHAT IT IS FOR, AND
// EVERY "NEXT" IT PROMISES IS ONE THE SERVER WILL HONOUR
//
// The Skill Primer content pack gives each of the SKILLS_DEF skills a flavour
// line and a "Good for" phrase (src/data/skill-guide.js), and derives the
// "Next: X at Lv N" ladder from the catalogues (src/render/skill-guide.js).
// This guard pins both halves:
//
//   SKG-1   exactly one guide entry per SKILLS_DEF id
//   SKG-2   no orphan guide keys
//   SKG-3   line is 60-150 characters, use is 12-70
//   SKG-4   no emoji (\p{Extended_Pictographic})
//   SKG-5   no digits
//   SKG-6   no < > & (the text is painted into HTML)
//   SKG-7   no trailing full stop
//   SKG-8   every line is unique
//   SKG-9   the ten catalogue-backed skills derive at least one rung (integer
//           level 1-99, non-empty name); strength, hitpoints and bountyHunter
//           derive none
//   SKG-10  no `gated` recipe (needs a recipe scroll, gateOk in
//           src/core/artisan.js) appears in any ladder — a level alone never
//           opens it, so naming it would be "client says X, server refuses"
//   SKG-11  every farming rung whose crop needs plot tier > 1 names
//           "plot tier N" (the server refuses 'plot_tier_locked'); turnip
//           does not
//   SKG-12  neither new file is in the hr-accrue payload (client-only text
//           must never move the edge hash)
//   SKG-13  source text: legacy buildHead calls headHtml; legacy
//           hrSkillUnlocksAt derives nothing itself (no TREES / ROCKS /
//           FISH_SPOTS / CROPS / ARTISAN_RECIPES); levelup-celebration.js
//           does not reference HearthriseSkillGuide
//   SKG-14  src/features/activities-grid.js does not exist (block 27 is the only tile renderer)
//   SKG-15  every guide entry carries a unique `title` (3-20 letters/spaces);
//           heroClass (src/render/skill-guide.js) is exported and, for EVERY
//           SKILLS_DEF id leading at 50,000 XP, names that skill's title
//           ("Master <title>", never 'Adventurer'); all-unknown XP -> null
//           (the caller paints the pending mark)
//
// Gear rungs need window.gearWieldReq (the monolith), so in node the combat
// ladders are gear-less; the in-page SKILLGUIDE-1 test covers gear.
//
//   node tests/skill-guide-coverage.mjs             gate
//   node tests/skill-guide-coverage.mjs --selftest  mutation proof
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const read = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; } };

const NEW_FILES = ['src/data/skill-guide.js', 'src/render/skill-guide.js'];
const LADDER_SKILLS = ['woodcutting', 'mining', 'fishing', 'farming', 'cooking', 'smithing',
  'crafting', 'prayer', 'runecrafting', 'stonemason'];
const RUNGLESS_SKILLS = ['strength', 'hitpoints', 'bountyHunter'];
const EMOJI = /\p{Extended_Pictographic}/u;

/** Body of the first `function NAME(` in src, up to the next column-0 line
    that closes it (`}` at column 0). '' when absent. */
export function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const end = src.indexOf('\n}', at);
  return end < 0 ? src.slice(at) : src.slice(at, end + 2);
}

/**
 * ctx = { skillIds, guide, ladders:{skill:[{lv,name}]}, recipes, crops,
 *         plotTier(cropId), origins:[path], src:{activities, legacy, levelup} }
 * Returns [{id, msg}].
 */
export function check(ctx) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });
  const { skillIds, guide } = ctx;

  // SKG-1 / SKG-2
  for (const id of skillIds) if (!guide || !guide[id]) add('SKG-1', `skill "${id}" has no SKILL_GUIDE entry`);
  for (const k of Object.keys(guide || {})) if (!skillIds.includes(k)) add('SKG-2', `SKILL_GUIDE key "${k}" is not a SKILLS_DEF id`);

  // SKG-3..8
  const seenLines = new Map();
  for (const [k, v] of Object.entries(guide || {})) {
    const line = String(v && v.line || ''); const use = String(v && v.use || '');
    if (line.length < 60 || line.length > 150) add('SKG-3', `${k}.line is ${line.length} chars (60-150)`);
    if (use.length < 12 || use.length > 70) add('SKG-3', `${k}.use is ${use.length} chars (12-70)`);
    for (const [f, t] of [['line', line], ['use', use]]) {
      if (EMOJI.test(t)) add('SKG-4', `${k}.${f} carries an emoji`);
      if (/\d/.test(t)) add('SKG-5', `${k}.${f} carries a digit`);
      if (/[<>&]/.test(t)) add('SKG-6', `${k}.${f} carries < > or &`);
      if (/\.\s*$/.test(t)) add('SKG-7', `${k}.${f} ends in a full stop`);
    }
    if (seenLines.has(line)) add('SKG-8', `${k}.line duplicates ${seenLines.get(line)}.line`);
    else seenLines.set(line, k);
  }

  // SKG-9
  const ladders = ctx.ladders || {};
  for (const s of LADDER_SKILLS) {
    const l = ladders[s] || [];
    if (!l.length) add('SKG-9', `${s} derives no rung`);
    for (const r of l) {
      if (!Number.isInteger(r.lv) || r.lv < 1 || r.lv > 99 || !r.name) add('SKG-9', `${s} rung ${JSON.stringify(r)} is malformed`);
    }
  }
  for (const s of RUNGLESS_SKILLS) if ((ladders[s] || []).length) add('SKG-9', `${s} must derive no rung, got ${ladders[s].length}`);

  // SKG-10
  for (const [s, rows] of Object.entries(ctx.recipes || {})) {
    const gated = new Set((rows || []).filter((r) => r.gated).map((r) => r.name));
    for (const r of ladders[s] || []) if (gated.has(r.name)) add('SKG-10', `${s} ladder names the scroll-gated recipe "${r.name}" at Lv ${r.lv}`);
  }

  // SKG-11
  const farm = ladders.farming || [];
  for (const [id, c] of Object.entries(ctx.crops || {})) {
    const tier = ctx.plotTier(id);
    const rung = farm.find((r) => r.name === c.name || r.name.startsWith(c.name + ' ('));
    if (!rung) { add('SKG-11', `crop ${id} has no farming rung`); continue; }
    if (tier > 1 && !rung.name.includes(`(plot tier ${tier})`)) add('SKG-11', `farming rung "${rung.name}" hides plot tier ${tier}`);
    if (tier <= 1 && /plot tier/.test(rung.name)) add('SKG-11', `farming rung "${rung.name}" names a plot tier it does not need`);
  }
  if (farm.some((r) => /^Turnip/.test(r.name) && /plot tier/.test(r.name))) add('SKG-11', 'turnip names a plot tier');

  // SKG-12
  for (const f of NEW_FILES) if ((ctx.origins || []).includes(f)) add('SKG-12', `${f} is in the hr-accrue payload`);

  // SKG-13
  const src = ctx.src || {};
  if (!/headHtml\(/.test(fnBody(src.legacy || '', 'buildHead'))) add('SKG-13', 'legacy.js buildHead does not call headHtml');
  const unl = fnBody(src.legacy || '', 'hrSkillUnlocksAt');
  if (!unl) add('SKG-13', 'legacy.js hrSkillUnlocksAt not found');
  for (const t of ['TREES', 'ROCKS', 'FISH_SPOTS', 'CROPS', 'ARTISAN_RECIPES']) {
    if (new RegExp('\\b' + t + '\\b').test(unl)) add('SKG-13', `legacy hrSkillUnlocksAt derives from ${t} — it must delegate`);
  }
  if (/HearthriseSkillGuide/.test(src.levelup || '')) add('SKG-13', 'levelup-celebration.js references HearthriseSkillGuide');

  // SKG-14
  if (ctx.twinExists) add('SKG-14', 'src/features/activities-grid.js exists: legacy.js block 27 is the only tile renderer');

  // SKG-15
  const titles = new Map();
  for (const [k, v] of Object.entries(guide || {})) {
    const t = v && v.title;
    if (typeof t !== 'string' || t.length < 3 || t.length > 20 || !/^[A-Za-z][A-Za-z ]*$/.test(t)) {
      add('SKG-15', `${k}.title ${JSON.stringify(t)} is not 3-20 letters/spaces`);
    } else if (titles.has(t)) add('SKG-15', `${k}.title duplicates ${titles.get(t)}.title`);
    else titles.set(t, k);
  }
  const hc = ctx.heroClass;
  if (typeof hc !== 'function') add('SKG-15', 'heroClass is not exported from src/render/skill-guide.js');
  else {
    const title = (id) => guide && guide[id] && guide[id].title;
    for (const id of skillIds) {
      const c = hc((k) => (k === id ? 50000 : k === 'hitpoints' ? 1154 : 0));
      if (!c || c.name !== title(id) || c.tagline !== 'Master ' + title(id) || c.name === 'Adventurer') {
        add('SKG-15', `${id} leading at 50,000 XP reads ${JSON.stringify(c)}, not "Master ${title(id)}"`);
      }
    }
    const none = hc(() => null);
    if (none !== null) add('SKG-15', `all-unknown XP must return null (pending), got ${JSON.stringify(none)}`);
    const fresh = hc((k) => (k === 'hitpoints' ? 1154 : null));
    if (!fresh || fresh.tagline !== 'Skilled ' + title('hitpoints')) add('SKG-15', `a fresh hero reads ${JSON.stringify(fresh)}, not "Skilled ${title('hitpoints')}"`);
  }

  return problems;
}

async function loadReal() {
  const { SKILLS_DEF } = await import('../src/data/skills.js');
  const { ARTISAN_RECIPES } = await import('../src/data/recipes.js');
  const { CROPS } = await import('../src/data/gathering.js');
  const { requiredPlotLevel } = await import('../src/core/farm.js');
  const { pack } = await import('../tools/pack-edge.mjs');
  let guide = {};
  let ladderOf = () => [];
  let heroClass;
  try { ({ SKILL_GUIDE: guide } = await import('../src/data/skill-guide.js')); } catch { /* SKG-1 reports it */ }
  try { ({ ladderOf, heroClass } = await import('../src/render/skill-guide.js')); } catch { /* SKG-9 / SKG-15 report it */ }
  const skillIds = Object.keys(SKILLS_DEF);
  const ladders = Object.fromEntries(skillIds.map((s) => [s, ladderOf(s)]));
  const { files } = await pack('hr-accrue');
  return {
    skillIds, guide, ladders, heroClass, recipes: ARTISAN_RECIPES, crops: CROPS, plotTier: requiredPlotLevel,
    origins: files.map((f) => f.origin),
    twinExists: existsSync(join(ROOT, 'src/features/activities-grid.js')),
    src: {
      legacy: read('src/legacy.js'),
      levelup: read('src/render/levelup-celebration.js'),
    },
  };
}

async function run() {
  const ctx = await loadReal();
  const problems = check(ctx);
  if (problems.length) {
    console.error(`  ✗ skill-guide-coverage: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
    return 1;
  }
  const rungs = LADDER_SKILLS.reduce((n, s) => n + ctx.ladders[s].length, 0);
  console.log(`✓ skill-guide-coverage: ${ctx.skillIds.length}/${ctx.skillIds.length} skills guided, ${rungs} rungs, none scroll- or tier-hidden`);
  return 0;
}

/* ── MUTATION PROOF (CLAUDE.md §4) ──────────────────────────────────────────
   The REAL context, deep-copied, then one planted defect per SKG id; each
   must be caught under its OWN id, and the clean copy must be green. */
async function selftest() {
  const real = await loadReal();
  const clone = () => ({
    ...real,
    skillIds: real.skillIds.slice(),
    guide: Object.fromEntries(Object.entries(real.guide).map(([k, v]) => [k, { ...v }])),
    ladders: Object.fromEntries(Object.entries(real.ladders).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    origins: real.origins.slice(),
    src: { ...real.src },
  });
  const gatedCook = real.recipes.cooking.find((r) => r.gated);
  const MUTATIONS = [
    ['SKG-1', (c) => { delete c.guide.mining; }],
    ['SKG-2', (c) => { c.guide.fletching = { ...c.guide.mining, line: c.guide.mining.line + ' too' }; }],
    ['SKG-3', (c) => { c.guide.attack.line = 'Too short to say anything'; }],
    ['SKG-4', (c) => { c.guide.fishing.use += ' \u{1F3A3}'; }],
    ['SKG-5', (c) => { c.guide.farming.use = 'Cooking stews, pies and 3 breads'; }],
    ['SKG-6', (c) => { c.guide.smithing.use = 'weapons & armour for the homestead'; }],
    ['SKG-7', (c) => { c.guide.cooking.line += '.'; }],
    ['SKG-8', (c) => { c.guide.attack.line = c.guide.strength.line; }],
    ['SKG-9', (c) => { c.ladders.mining = []; }],
    ['SKG-10', (c) => { c.ladders.cooking.push({ lv: gatedCook.req, name: gatedCook.name }); }],
    ['SKG-11', (c) => { c.ladders.farming = c.ladders.farming.map((r) => (/^Carrot/.test(r.name) ? { ...r, name: 'Carrot' } : r)); }],
    ['SKG-12', (c) => { c.origins.push('src/data/skill-guide.js'); }],
    ['SKG-13', (c) => { c.src.legacy = c.src.legacy.replace(/HearthriseSkillGuide\.headHtml\(skillId,lv\)/, "''"); }],
    ['SKG-14', (c) => { c.twinExists = true; }],
    ['SKG-15', (c) => { delete c.guide.stonemason.title; }],
    ['SKG-15', (c) => { c.heroClass = (xpOf) => { // the pre-fix 15-key literal
      const top = c.skillIds.reduce((a, b) => (xpOf(b) > xpOf(a) ? b : a));
      const cn = { attack: 'Warrior', strength: 'Berserker', defense: 'Guardian', hitpoints: 'Brawler',
        prayer: 'Devotee', magic: 'Mage', ranged: 'Ranger', bountyHunter: 'Bounty Hunter',
        woodcutting: 'Lumberjack', mining: 'Miner', fishing: 'Angler', farming: 'Farmhand',
        cooking: 'Chef', crafting: 'Artificer', smithing: 'Smith' }[top] || 'Adventurer';
      return { name: cn, tagline: 'Master ' + cn };
    }; }],
    [['SKG-1', 'SKG-15'], (c) => { c.skillIds.push('fletching'); }],
    ['SKG-15', (c) => { c.heroClass = () => ({ name: 'Warrior', tagline: 'Path: Warrior' }); }],
  ];
  let bad = 0;
  console.log('skill-guide-coverage --selftest');
  const clean = check(clone());
  if (clean.length) { bad++; console.error(`  ✗ clean arm is red: ${clean.map((p) => p.id + ' ' + p.msg).join('; ')}`); }
  else console.log('  ✓ clean arm green');
  for (const [want, plant] of MUTATIONS) {
    const c = clone(); plant(c);
    const ids = new Set(check(c).map((p) => p.id));
    const id = [].concat(want).join(' + ');
    if ([].concat(want).every((w) => ids.has(w))) console.log(`  ✓ ${id} planted -> red under ${id}`);
    else { bad++; console.error(`  ✗ ${id} planted -> NOT caught (got ${[...ids].join(', ') || 'green'})`); }
  }
  console.log(bad ? `✗ selftest: ${bad} arm(s) failed` : `✓ selftest: clean green, ${MUTATIONS.length}/${MUTATIONS.length} defects caught`);
  return bad ? 1 : 0;
}

(process.argv.includes('--selftest') ? selftest() : run())
  .then((code) => process.exit(code))
  .catch((e) => { console.error('skill-guide-coverage: harness error', e); process.exit(2); });
