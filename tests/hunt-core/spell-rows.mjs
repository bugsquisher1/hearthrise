// tests/hunt-core/spell-rows.mjs — THE AREA SPELLS' DATA ROWS (lane/b-area-data; Tyler 2026-11-08: "start giving some monsters
// some aoe spells and our heros some more aoe spells", "a party heal with a long cooldown", "and expensive, and make sure the
// conditions are available that make sense"; design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells"). Run by
// run-all.mjs. `--only a,b` runs just those cases and their mutants. The engine's own cases are monster-spells.mjs and
// abilities.mjs; this file holds the ROWS: every number is the designer's, so the cases read shapes and links, never a value.
//
//   rows-validate      every monster spell row is valid (src/data/monster-spells.js validate: bounds, the fair warning, its
//                      shape's one parameter), every monster's `spells` names real rows, and every row is cast by a monster
//   every-caster-plays every monster that lists a spell spawns where a hero meets it: an open ground's pocket (its spawns, its
//                      full pack, a boss room's adds) or a called room. A spell on a monster nobody meets is content nothing plays. A STAGED pack ground counts (lane/b-pack-fields): it is graded as it ships and its casters play when it opens
//   boss-kits          a boss carries his marked heavy hit FIRST and his whole-group pulse second (Tyler 2026-11-08: "the tank
//                      absorbing the boss hits and the casters dodging it", plus "so the whole party takes damage"; the engine
//                      starts the first spell of the list that is ready, so the heavy hit leads); a called boss casts exactly
//                      what his open row casts (boss-calls.js `of`); every other caster carries one spell
//   hero-area-rows     the hero area rows strike a shape (area, line, ring), each new slot's rule is one the server's slot check
//                      takes, and the party heal: on the heal lane, its own rule holding "the fight is on" (never spent between
//                      pulls) and "allies under X% at or above 2", dearer in mana and slower to come back than the top-up beside it
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';

const V = (root) => '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V(root));
  M.MS = await imp('src/data/monster-spells.js');
  M.AD = await imp('src/data/abilities.js');
  M.BC = await imp('src/data/boss-calls.js');
  return M;
}

/* The heroes' area targets and the party heal (abilities.js AREA_TARGETS, target 'party'). */
const PARTY_HEAL = 'party';

const cases = {
  'rows-validate': (M) => {
    const bad = M.MS.validate(M.MONSTERS);
    if (bad.length) return bad.join('; ');
    const rows = Object.entries(M.MS.MONSTER_SPELLS);
    if (!rows.length) return 'no monster casts a spell';
    for (const [id, row] of rows) { const p = M.MS.validateSpell(row, id); if (p.length) return p.join('; '); }
    return null;
  },
  'every-caster-plays': (M) => {
    const met = new Set();
    /* (a staged ground's casters count: its pack plays on the grade; a keyed hall's boss and adds are met in his room: src/data/boss-halls.js) */
    for (const g of [...Object.values(M.grounds.HUNT_GROUNDS), ...Object.values(M.grounds.CALLED_GROUNDS), ...Object.values(M.grounds.HALL_GROUNDS || {})]) {
      for (const p of g.pockets) for (const s of [...(p.spawns || []), ...(p.pack || []), ...(p.adds || [])]) met.add(s.monster);
    }
    const lost = Object.keys(M.MONSTERS).filter((k) => M.MS.spellsOf(M.MONSTERS[k]).length && !met.has(k));
    return lost.length ? 'a caster no hero meets: ' + lost.join(', ') : null;
  },
  'boss-kits': (M) => {
    for (const [id, m] of Object.entries(M.MONSTERS)) {
      const list = M.MS.spellsOf(m);
      if (!list.length) continue;
      const kinds = list.map((s) => (M.MS.marked(M.MS.spellRow(s)) ? 'marked' : 'group'));
      if (m.boss && JSON.stringify(kinds) !== '["marked","group"]') return 'boss ' + id + ' casts ' + JSON.stringify(list) + ' (' + kinds + '): want his marked hit, then his group pulse';
      if (!m.boss && list.length !== 1) return id + ' carries ' + list.length + ' spells: a regular carries one';
    }
    for (const c of Object.values(M.BC.BOSS_CALLS)) {
      const open = M.MS.spellsOf(M.MONSTERS[c.of]), called = M.MS.spellsOf(M.MONSTERS[c.monster]);
      if (JSON.stringify(open) !== JSON.stringify(called)) return 'the called ' + c.monster + ' casts ' + JSON.stringify(called) + ', his open row ' + JSON.stringify(open);
    }
    return null;
  },
  'hero-area-rows': (M) => {
    const bad = M.AD.validate();
    if (bad.length) return bad.join('; ');
    const area = Object.values(M.AD.ABILITIES).filter((r) => M.AD.AREA_TARGETS.includes(r.target));
    for (const t of M.AD.AREA_TARGETS) if (!area.some((r) => r.target === t)) return 'no hero ability strikes a ' + t;
    for (const r of area.concat(Object.values(M.AD.ABILITIES).filter((x) => x.target === PARTY_HEAL))) {
      if (!M.AD.areaSpec(r) && r.target !== PARTY_HEAL) return r.id + ' strikes no shape';
      const p = M.conditions.slotProblem({ action: { type: 'ability', id: r.id }, conditions: M.AD.suggestedTrigger(r), join: 'and' });
      if (p) return r.id + "'s new slot rule is refused: " + JSON.stringify(p);
    }
    /* THE LONG PARTY HEAL beside the steady one: a row on the heal lane whose own rule waits for the fight and for two hurt allies */
    const heals = Object.values(M.AD.ABILITIES).filter((r) => r.target === PARTY_HEAL);
    const save = heals.find((r) => Array.isArray(r.trigger));
    if (!save) return 'no party heal carries its own rule (Tyler 2026-11-08: "make sure the conditions are available that make sense")';
    const on = (metric) => save.trigger.find((c) => c.metric === metric);
    if (save.lane !== 'heal' || !on('in_fight') || on('in_fight').value !== true || on('in_fight').op !== 'eq') return save.id + ' may fire between pulls: ' + JSON.stringify(save.trigger);
    /* ITS RULE READS THE WHOLE PARTY AND KEEPS MANA BACK (Tyler 2026-11-08, lane/d-spell-tuning: "two allies under 60%" never fired, and the
       fight alone fired every minute and starved the healer at the Chief). So: the party's pooled HP under a line, and the healer's own mana
       at half or more, with the fight on. At most three conditions a slot (conditions.js). */
    if (!on('party_hp_pct') || on('party_hp_pct').op !== 'lt' || !(on('party_hp_pct').value >= 50 && on('party_hp_pct').value <= 85)) return save.id + ' does not wait for a hurt party: ' + JSON.stringify(save.trigger);
    if (!on('self_mana_pct') || on('self_mana_pct').op !== 'gte' || !(on('self_mana_pct').value >= 50)) return save.id + ' may spend the mana the single heals need: ' + JSON.stringify(save.trigger);
    if (save.trigger.length > 3) return save.id + ' starts with ' + save.trigger.length + ' conditions, and a slot holds three';
    for (const top of heals.filter((r) => r !== save)) {
      if (!(save.mana > top.mana && save.cdMs > top.cdMs)) return save.id + ' (' + save.mana + ' mana, ' + save.cdMs + ' ms) is no dearer and slower than ' + top.id + ' (' + top.mana + ', ' + top.cdMs + '): "expensive" and "a long cooldown"';
    }
    return null;
  },
};

const MS = 'src/data/monster-spells.js';
const MON = 'src/data/monsters.js';
const AB = 'src/data/abilities.js';
const mutants = [
  { name: 'a caster names a row that is not there', case: 'rows-validate', edits: [[MON, "    spells: ['smoke_pot'],\n", "    spells: ['smoke_pots'],\n"]] },
  { name: 'a spell no monster casts', case: 'rows-validate', edits: [[MON, "    spells: ['venom_spray'],\n", '']] },
  { name: 'a mark with no fair warning', case: 'rows-validate', edits: [[MS, "shape: 'ring', r: 1, range: 1, windupMs: 1600,", "shape: 'ring', r: 1, range: 1, windupMs: 1000,"]] },
  { name: 'a cone that reads a radius', case: 'rows-validate', edits: [[MS, "n: 'Tail Lash', shape: 'cone', len: 2, range: 1,", "n: 'Tail Lash', shape: 'cone', len: 2, r: 1, range: 1,"]] },
  { name: 'a spell on a monster no ground spawns', case: 'every-caster-plays',
    edits: [[MON, "  bog_vine: {", "  bog_vine: { spells: ['spore_cloud'],"]] },
  { name: 'the Rat King leads with his pulse', case: 'boss-kits', edits: [[MON, "party takes */\n    spells: ['tail_lash', 'squeal'],", "party takes */\n    spells: ['squeal', 'tail_lash'],"]] },
  { name: 'the called Rat King casts nothing', case: 'boss-kits', edits: [[MON, "    spells: ['tail_lash', 'squeal'],\n    hp: 2000,", '    hp: 2000,']] },
  { name: 'a regular carries two spells', case: 'boss-kits', edits: [[MON, "    spells: ['spore_cloud'],\n", "    spells: ['spore_cloud', 'venom_spray'],\n"]] },
  { name: 'Spring Tide fires between pulls', case: 'hero-area-rows',
    edits: [[AB, ", { metric: 'in_fight', op: 'eq', value: true }, { metric: 'self_mana_pct'", ", { metric: 'self_mana_pct'"]] },
  { name: 'Spring Tide waits for two allies under 60% again (the rule that never fired)', case: 'hero-area-rows',
    edits: [[AB, "trigger: [{ metric: 'party_hp_pct', op: 'lt', value: 85 },", "trigger: [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_60' },"]] },
  { name: 'Spring Tide spends the last of the mana (no mana floor)', case: 'hero-area-rows',
    edits: [[AB, ", { metric: 'self_mana_pct', op: 'gte', value: 50 }],\n    versions: [[120,", "],\n    versions: [[120,"]] },
  { name: 'Spring Tide is as cheap as Circle of Renewal', case: 'hero-area-rows',
    edits: [[AB, "lane: 'heal', cdMs: 60000, mana: 120,", "lane: 'heal', cdMs: 60000, mana: 50,"], [AB, 'versions: [[120, 1000], [144, 1740]', 'versions: [[50, 1000], [144, 1740]']] },
  { name: "Turning Cut's rule names a metric the server does not know", case: 'hero-area-rows',
    edits: [[AB, "    trigger: [{ metric: 'enemies_in_aoe', op: 'gte', value: 3 }] }),", "    trigger: [{ metric: 'enemies_around', op: 'gte', value: 3 }] }),"]] },
];

const R = makeReport('hunt-core/spell-rows');
const M = await load(ROOT);
const at = process.argv.indexOf('--only');
const only = at > 0 ? new Set(String(process.argv[at + 1] || '').split(',')) : null;
for (const [cn, fn] of Object.entries(cases)) {
  if (only && !only.has(cn)) continue;
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of process.argv.includes('--no-mutate') ? [] : mutants) {
  if (only && !only.has(mu.case)) continue;
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
const ran = (n) => !only || only.has(n);
if (!R.fails.length) console.log('  ' + Object.keys(cases).filter(ran).length + ' cases, ' + mutants.filter((mu) => ran(mu.case)).length + ' mutants caught');
R.finish();
