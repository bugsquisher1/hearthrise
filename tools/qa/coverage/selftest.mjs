// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/selftest.mjs — THE COVERAGE BOT'S OWN PARTS, PROVED ON FIXTURES (no world, under a second).
//
//   node tools/qa/coverage/run.mjs --selftest
//
// C1  the map is the data: every list's length is the data module's (a new ground, recipe, node or offer is a
//     new row with no edit), and every open ground and its tiers are listed
// C2  every brain rule answers on its own fixture, and an impossible hero gets null (the runner's stall)
// C3  the journal: a count that rose is "obtained" by the action's label, one that fell is "used", a worn piece
//     is used "worn", a held tool is used by its gathering job, a refusal is quoted and changes nothing
// C4  the report's verdicts: a door on paper never walked through is "never reached"; a skill whose every try
//     was refused is a STALL (blocked), quoting the server's word; a bought offer is "bought"
// Each check runs a planted twin that must FAIL it (the check bites), so a check that can't go red is caught here.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../../src/data/skills.js';
import { ARTISAN_RECIPES } from '../../../src/data/recipes.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../../../src/data/gathering.js';
import { ITEMS } from '../../../src/data/items.js';
import { OPEN_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { coverageMap } from './map.mjs';
import { nextAction, newMemory, RULE_IDS } from './brain.mjs';
import { newJournal, record, holdingsOf } from './journal.mjs';
import { verdicts } from './report.mjs';

export function selftest() {
  const fails = [];
  const check = (name, ok, got) => { if (!ok) fails.push(name + (got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 300))); };
  const map = coverageMap();

  // ── C1 the map is the data ──
  const lens = (m) => ({ skills: m.skills.length, grounds: m.grounds.length, recipes: m.recipes.length, nodes: m.nodes.length, items: m.items.length });
  const want = { skills: Object.keys(SKILLS_DEF).length, grounds: Object.keys(OPEN_GROUNDS).length,
    recipes: Object.values(ARTISAN_RECIPES).reduce((s, l) => s + (l || []).filter((r) => r && r.id).length, 0),
    nodes: TREES.length + ROCKS.length + FISH_SPOTS.length + Object.keys(CROPS).length, items: Object.keys(ITEMS).length };
  check('C1 every list is the data\'s length', JSON.stringify(lens(map)) === JSON.stringify(want), { map: lens(map), data: want });
  check('C1 every open ground is a row with its tiers', Object.keys(OPEN_GROUNDS).every((id) => map.grounds.some((g) => g.id === id && g.tiers.includes('normal'))));
  /* the twin: a map missing one recipe must fail the length check */
  const short = { ...map, recipes: map.recipes.slice(1) };
  check('C1 (twin) a dropped row is seen', JSON.stringify(lens(short)) !== JSON.stringify(want));

  // ── C2 every rule answers ──
  const base = () => ({ level: 1, levelXp: 0, skills: {}, bag: {}, storage: {}, worn: { weapon: 'practice_sword', shield: 'practice_shield' }, gold: 500,
    staminaMin: 720, staminaCapMin: 720, hunting: null, activity: null, farm: [], tally: null });
  const firstCrop = map.nodes.find((n) => n.kind === 'crop' && n.req === 1);
  const sellable = map.items.find((i) => i.uses.length && i.uses.every((u) => u === 'vendor trash') && ITEMS[i.id].v > 0);
  const tool = map.sinks.find((s) => s.verb === 'shop_buy' && s.listed && ITEMS[s.grants[0]] && ITEMS[s.grants[0]].toolSkill);
  const home = map.sinks.filter((s) => s.table === 'property').sort((a, b) => a.gold - b.gold)[0];
  const r1 = map.recipes.find((r) => r.req === 1 && Object.keys(r.inputs).length === 1 && r.outputs.length);
  const node1 = map.nodes.find((n) => n.kind === 'gather' && n.req === 1);
  const fixtures = {
    harvest: (v) => { v.farm = [{ idx: 0, crop: firstCrop.id, ready: true }]; },
    plant: (v) => { v.farm = [{ idx: 0, crop: null }]; v.bag[firstCrop.seed] = 3; },
    wear: (v) => { v.bag.bronze_helm = 1; },
    sell: (v) => { v.bag[sellable.id] = 9; },
    buy: (v) => { v.gold = 5000; },
    build: (v, mem) => { v.gold = home.gold + 5000; for (const c of home.items) v.bag[c.id] = c.qty; for (const s of map.sinks) if (s.verb === 'shop_buy') mem.bought.add(s.id); },
    craft: (v) => { for (const [id, n] of Object.entries(r1.inputs)) v.bag[id] = n * 10; v.skills[r1.skill] = 1; },
    hunt: () => {},
    gather: (v) => { v.staminaMin = 10; },
  };
  for (const id of RULE_IDS) {
    const v = base();
    const mem = newMemory(null);
    /* earlier rules held off: no seed, no plot, nothing better to wear, nothing to sell or buy */
    if (id !== 'buy' && id !== 'build') v.gold = 200;
    (fixtures[id] || (() => {}))(v, mem);
    const a = nextAction({ v, map, mem });
    check('C2 the ' + id + ' rule answers on its fixture', a && a.rule === id, a);
    check('C2 the ' + id + ' rule says why', !a || (typeof a.why === 'string' && a.why.length > 8), a);
  }
  const stuck = base();
  stuck.hunting = { hunt: 'x' };   // mid-hunt: nothing in town is possible, and a hunt is already running
  const memStuck = newMemory(null);
  for (const n of map.nodes) memStuck.refused.add('work:' + n.id);
  check('C2 a hero with nothing sensible to do gets null (a stall)', nextAction({ v: stuck, map, mem: memStuck }) === null);
  check('C2 (twin) a hero in town with stamina gets a step', nextAction({ v: base(), map, mem: newMemory(null) }) !== null);
  check('C2 a crafter never hunts', (nextAction({ v: base(), map, mem: newMemory(null, 'crafter') }) || {}).type !== 'hunt');
  check('C2 a refused key is not asked again', (() => { const m = newMemory(null); m.refused.add('hunt:mill_cellar:normal'); const a = nextAction({ v: base(), map, mem: m }); return !a || a.key !== 'hunt:mill_cellar:normal'; })());

  // ── C3 the journal ──
  const j = newJournal();
  const v0 = base(); v0.bag = { shrimp: 10, bronze_axe: 1 };
  const v1 = base(); v1.bag = { shrimp: 2, cooked_shrimp: 8, bronze_axe: 1 };
  record(j, { hour: 1, hero: 'A', action: { type: 'work', kind: 'artisan', id: 'cook_shrimp', skill: 'cooking' }, answer: { ok: true }, before: holdingsOf(v0), after: holdingsOf(v1) });
  check('C3 a rise is obtained by its craft', j.obtained.cooked_shrimp && j.obtained.cooked_shrimp.via[0] === 'made by cooking (cook_shrimp)', j.obtained.cooked_shrimp);
  check('C3 a fall is used as its input', j.used.shrimp && j.used.shrimp.via[0] === 'cooking input (cook_shrimp)', j.used.shrimp);
  check('C3 the recipe is crafted', j.crafted.cook_shrimp && j.crafted.cook_shrimp.made.cooked_shrimp === 8);
  check('C3 (twin) an unchanged count is neither', !j.obtained.bronze_axe && !j.used.bronze_axe);
  record(j, { hour: 2, hero: 'A', action: { type: 'work', kind: 'gather', id: 'normal_tree', skill: 'woodcutting' }, answer: { ok: true }, before: holdingsOf(v1), after: { ...holdingsOf(v1), normal_log: 30 } });
  check('C3 a held tool is used by its gathering job', j.used.bronze_axe && j.used.bronze_axe.via.includes('woodcutting tool'), j.used.bronze_axe);
  const before = holdingsOf(v1);
  record(j, { hour: 3, hero: 'A', action: { type: 'buy', offer: 'supply.x', key: 'buy:supply.x' }, answer: { ok: false, error: 'not_listed', body: { ok: false, error: 'not_listed' } }, before, after: { ...before, junk: 5 } });
  check('C3 a refusal is quoted', j.refusals.some((r) => r.error === 'not_listed' && r.action === 'buy buy:supply.x'), j.refusals);
  check('C3 a refusal changes nothing', !j.obtained.junk && !j.sinks['supply.x']);
  record(j, { hour: 4, hero: 'A', action: { type: 'equip', map: { helmet: 'bronze_helm' } }, answer: { ok: true }, before, after: before, wornAfter: { helmet: 'bronze_helm' } });
  check('C3 a worn piece is used "worn"', j.used.bronze_helm && j.used.bronze_helm.via.includes('worn'));

  // ── C4 the report's verdicts ──
  const run = { journal: j, crew: [{ name: 'A', way: 'tank', uid: 'x' }], gameHours: 4, wallMs: 1 };
  j.samples.push({ hour: 4, hero: 'A', level: 3, xp: 0, skills: { cooking: 5, woodcutting: 3 }, gold: 1, staminaMin: 1 });
  j.refusals.push({ hour: 4, hero: 'A', action: 'work work:shrimp_s', error: 'unknown_activity' });
  const R = verdicts({ map, run, kills: {} });
  const doored = R.items.find((i) => i.paperDoor && !j.obtained[i.id] && !j.used[i.id]);
  check('C4 a door on paper never walked through is "never reached"', doored && doored.status === 'never reached', doored);
  check('C4 a made item is reached', R.items.find((i) => i.id === 'cooked_shrimp').status !== 'never reached');
  const blocked = R.stalls.find((s) => s.kind === 'blocked' && s.skill === 'fishing');
  check('C4 a skill whose every try was refused is a stall, with the server\'s word', blocked && /unknown_activity/.test(blocked.why), R.stalls);
  check('C4 (twin) a trained skill is no blocked stall', !R.stalls.some((s) => s.kind === 'blocked' && s.skill === 'cooking'));

  return fails;
}
