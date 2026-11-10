// ════════════════════════════════════════════════════════════════════════
// tools/qa/coverage/mutate.mjs — THE BOT AS A GUARD: THREE PLANTED FAULTS, EACH MUST SHOW IN ITS REPORT.
//
//   node tools/qa/coverage/run.mjs --mutate [--hours 1]
//
// Each plant runs in its own process (one world per process: local-world's engine is module state), on a short
// run of the tank and the crafter, page checks off. The plant is made in THAT process only, after the coverage
// map is read (so the map keeps the paper door) and before the world opens (so the engine loads it):
//   control          nothing planted: every probe below must read clean, or a plant proves nothing
//   no-source        an item whose ONLY door is a listed Shop row loses the row (the engine refuses `not_listed`):
//                    the report must say the item was NEVER REACHED
//   blocked-skill    every gathering node needs Level 1000 in the server's own activity catalogue (hr_activities,
//                    this world's memory only), so whichever node the crafter goes to first is refused: the report
//                    must carry a BLOCKED stall for an untrained gathering skill, quoting the server's refusal
//                    (one skill alone was a coin toss on the brain's order: the 'stock' rule went to copper first)
//   refused-buy      a listed Shop row costs 1000x in the engine's catalogue: the report must quote the refusal
// Every pick is read from data (the first row that fits), so the plants follow the content.
// Exit 0: the control is clean and every plant shows; 1: a plant escaped (named); 2: harness.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../../../src/data/items.js';
import { SHOP_OFFERS } from '../../../src/data/shops.js';
import { SHOP_LISTED_OFFER_IDS } from '../../../src/data/supply-basics.js';

const RUN = join(dirname(fileURLToPath(import.meta.url)), 'run.mjs');

/** The rows each plant touches, picked from data (the brain's own first buys and first gathering skill). */
export function picks(map) {
  const listed = map.sinks.filter((s) => s.verb === 'shop_buy' && s.listed && s.grants[0] && ITEMS[s.grants[0]]);
  /* a piece to wear whose ONLY door is the Shop; and the first tool on the list (every hero's first buy, brain.mjs `buy`) */
  const onlyShop = listed.find((s) => { const it = map.itemIndex.get(s.grants[0]); return ITEMS[s.grants[0]].slot && it && it.sources.length === 1 && it.sources[0] === 'shop'; });
  const priced = listed.find((s) => ITEMS[s.grants[0]].toolSkill);
  /* every gathering skill (a crafter's first job is always one, whichever the brain picks first) */
  const gathering = [...new Set(map.nodes.filter((n) => n.kind === 'gather').map((n) => n.skill))];
  return { noSource: onlyShop, refusedBuy: priced, blockedSkills: gathering };
}

/** The plant, in THIS process. `phase` 'data' runs before the world opens; 'world' after (it gets the world). */
export async function plant(name, map, phase, world) {
  const p = picks(map);
  if (name === 'no-source' && phase === 'data') SHOP_LISTED_OFFER_IDS.delete(p.noSource.id);
  if (name === 'refused-buy' && phase === 'data') {
    const i = SHOP_OFFERS.findIndex((o) => o && o.id === p.refusedBuy.id);
    const o = SHOP_OFFERS[i];
    SHOP_OFFERS[i] = { ...o, cost: o.cost.map((c, k) => (k === 0 ? { ...c, amount: c.amount * 1000 } : c)) };
  }
  if (name === 'blocked-skill' && phase === 'world') {
    await world.db.query(`update public.hr_activities set req_lv = 1000 where kind = 'gather' and req_skill = any($1)`, [p.blockedSkills]);
  }
  return p;
}

/** Run every plant and judge its report. */
export async function mutate({ out, opt }) {
  const { coverageMap } = await import('./map.mjs');
  const map = coverageMap();
  const p = picks(map);
  if (!p.noSource || !p.refusedBuy || !p.blockedSkills.length) { console.error('coverage --mutate: HARNESS: no data row fits a plant ' + JSON.stringify({ noSource: !!p.noSource, refusedBuy: !!p.refusedBuy, blockedSkills: p.blockedSkills })); return 2; }
  const hours = String(opt('--hours', 1));
  const fails = [];
  const reports = {};
  for (const name of ['control', 'no-source', 'blocked-skill', 'refused-buy']) {
    const dir = join(out, 'mutate-' + name);
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [RUN, '--ways', 'tank', '--hours', hours, '--no-page', '--out', dir, ...(name === 'control' ? [] : ['--plant', name])], { encoding: 'utf8', timeout: 30 * 60000 });
    if (r.status !== 0) { console.error('coverage --mutate: HARNESS: ' + name + ' exited ' + r.status + '\n' + String(r.stderr || r.stdout).slice(-1500)); return 2; }
    reports[name] = JSON.parse(readFileSync(join(dir, 'coverage.json'), 'utf8'));
    console.log('  ran ' + name + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  }
  /* the three probes, read the same way on every report */
  const item = (R, id) => R.items.find((i) => i.id === id) || {};
  /* a gathering skill the server refused every try at and that never trained: the stall the report must carry */
  const blocked = (R) => R.stalls.find((s) => s.kind === 'blocked' && p.blockedSkills.includes(s.skill) && (R.skills.find((k) => k.id === s.skill) || {}).level === 1);
  const refusedBuy = (R) => R.refusals.find((x) => x.what === 'buy buy:' + p.refusedBuy.id);
  const C = reports.control;
  const control = [
    [item(C, p.noSource.grants[0]).status !== 'never reached', 'control: ' + p.noSource.grants[0] + ' is reached (' + item(C, p.noSource.grants[0]).status + ')'],
    [!blocked(C), 'control: no blocked stall for ' + p.blockedSkills.join('/')],
    [!refusedBuy(C) && (C.sinks.find((s) => s.id === p.refusedBuy.id) || {}).bought === true, 'control: ' + p.refusedBuy.id + ' is bought, not refused'],
  ];
  for (const [ok, why] of control) if (!ok) fails.push(why);
  const nr = item(reports['no-source'], p.noSource.grants[0]);
  if (nr.status !== 'never reached') fails.push('no-source: ' + p.noSource.grants[0] + ' read "' + nr.status + '", not "never reached"');
  const bs = blocked(reports['blocked-skill']);
  if (!bs) fails.push('blocked-skill: no blocked stall for ' + p.blockedSkills.join('/') + ' (stalls: ' + JSON.stringify(reports['blocked-skill'].stalls).slice(0, 300) + ')');
  const rb = refusedBuy(reports['refused-buy']);
  if (!rb || !rb.error) fails.push('refused-buy: no quoted refusal for ' + p.refusedBuy.id);
  for (const f of fails) console.log('  RED  ' + f);
  if (!fails.length) {
    console.log('  caught no-source: ' + p.noSource.grants[0] + ' never reached');
    console.log('  caught blocked-skill: ' + bs.why);
    console.log('  caught refused-buy: ' + rb.what + ' -> "' + rb.error + '"');
  }
  console.log(fails.length ? 'coverage --mutate: RED (' + fails.length + ')' : 'coverage --mutate: green (control clean; a lost source, a blocked skill and a refused buy each show)');
  return fails.length ? 1 : 0;
}
