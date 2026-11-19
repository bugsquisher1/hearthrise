// tools/balance-sim/calibrate.mjs — THE SIMULATOR AGAINST REAL HUNTS (lane/d-balance-audit, Tyler 2026-11-19: "rebuild the audit
// auto hunts to make sure what we are testing is accurate to the game").
//
// A SAMPLE is one recorded party hunt as the server held it: the ground, the tier, and each seat's own Level XP, skill XP, worn set,
// stored bar, hunt options and the stock it spent, beside what the server's tally says happened an hour (kills, Level XP, coin, store
// gold, damage taken, healing done, damage dealt, deaths). `--run` plays every sample's party on the real engine (cell.mjs `seats`:
// nothing dressed, nothing defaulted) and prints sim over real per metric. The fixture is AGGREGATED AND ANONYMOUS: seats by index,
// rates an hour, a date; no user id, hero name, session id or clock time ever leaves the machine the export sits on.
//
//   node tools/balance-sim/calibrate.mjs --build <hunts-export.json> <heroes-now.json> [--instances <instances.json>] [--since <date>] [--out <fixture>]   (local only: raw rows in)
//   node tools/balance-sim/calibrate.mjs --run [--fixture <path>] [--only <id part>] [--since <date>] [--hours 1] [--seeds 2] [--json <out>]
//        [--as harness | --swap kit,bar,skills,options,bag] [--profile played]   (the harness's own hero in the recorded seats; with some recorded fields)
//
// WHAT A SEAT'S START IS: the hero's XP today minus everything its later recorded hunts paid (a death's loss is not in the tally, so a
// hero who died later reads a little low: `approx` names it). Its worn set and bar are TODAY'S (the server keeps no history of either):
// a sample older than the hero's last gear change says `kit: 'assumed'`, and the guard only judges `kit: 'held'` samples.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE = join(ROOT, 'tests', 'fixtures', 'balance-calibration.json');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const r0 = (n) => Math.round(n), r3 = (n) => Math.round(n * 1000) / 1000;
const COMBAT = ['melee', 'ranged', 'magic', 'defense', 'inner_flame', 'prayer'];

/* THE METRICS a sample is judged on: [key, label, real(seat), sim(hero, party)]. Healing is healing DONE by the hero (its food, its own
   spells on itself and on allies), which is what the server's tally `healed` holds. */
export const METRICS = Object.freeze([
  ['killsPerH', 'kills/h', 'party'],
  ['levelXpPerH', 'Level XP/h', 'seat'],
  ['coinPerH', 'coin/h', 'seat'],
  ['dealtPerH', 'dealt/h', 'seat'],
  ['takenPerH', 'taken/h', 'seat'],
  ['healedPerH', 'healed/h', 'seat'],
  ['storePerH', 'store gold/h', 'seat'],
  ['deathsPerH', 'deaths/h', 'seat'],
]);

/* ── BUILD (local only) ─────────────────────────────────────────────────────────────────────────────────────────────── */
async function build(exportPath, heroesPath, outPath, instPath, since) {
  /* the tier: the session row's, else the instance's when it still stands on the same ground, else Normal. The row is null only on an OPEN session read
     before 2027-05-24-session-tier-open.sql applied (the end stamp alone, 2027-03-16) or one that ended before 2026-11-06; no row has ever been continued. */
  const INST = Object.fromEntries((instPath ? JSON.parse(readFileSync(instPath, 'utf8')) : []).map((r) => [r.id, r]));
  const tierOf = (r) => r.tier || ((INST[r.instance_id] || {}).hunt_id === r.hunt_id && INST[r.instance_id].tier) || 'normal';
  const d = JSON.parse(readFileSync(exportPath, 'utf8')), H = JSON.parse(readFileSync(heroesPath, 'utf8'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const { wornRoleKey } = await import(u('src/data/hunt-roles.js'));
  const SPAWN = await import(u('src/core/hunt-spawn.js'));
  const G = await import(u('src/data/hunt-grounds.js'));
  const all = new Map();
  for (const r of [...(d.andy || []), ...(d.recent || [])]) all.set(r.session_id, r);
  const rows = [...all.values()].filter((r) => r.kills !== null && r.kills !== undefined);
  const hk = (r) => r.user8 + '/' + r.slot;
  const now = {};
  for (const s of H.state) now[hk(s)] = { levelXp: Number(s.level_xp), skills: {}, equipment: {}, sets: {}, presets: {} };
  for (const s of H.skills) if (now[hk(s)]) now[hk(s)].skills[s.skill_id] = Number(s.xp);
  for (const s of H.equipment) if (now[hk(s)]) now[hk(s)].equipment[s.equip_slot] = s.item_id;
  for (const s of H.actionSets) if (now[hk(s)]) now[hk(s)].sets[s.preset] = s;
  for (const s of H.presets) if (now[hk(s)]) now[hk(s)].presets[s.preset] = s;
  /* a hero's XP at a hunt's start: today's minus what this hunt and every later one paid */
  const later = (r) => rows.filter((o) => hk(o) === hk(r) && o.hunt_from >= r.hunt_from);
  const startOf = (r) => {
    const n = now[hk(r)], ls = later(r);
    const skills = {};
    for (const k of COMBAT) skills[k] = Math.max(0, r0((n.skills[k] || 0) - ls.reduce((s, o) => s + ((o.xp && o.xp[k]) || 0), 0)));
    return { levelXp: Math.max(0, r0(n.levelXp - ls.reduce((s, o) => s + ((o.xp && o.xp.level) || 0), 0))), skills, approx: ls.some((o) => o.deaths > 0) };
  };
  const lastGear = {};
  for (const [k, n] of Object.entries(now)) lastGear[k] = [...Object.values(n.presets), ...Object.values(n.sets)].reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '');
  const bars = [], kits = [];
  const intern = (list, v) => { const j = JSON.stringify(v); let i = list.findIndex((x) => JSON.stringify(x) === j); if (i < 0) { list.push(v); i = list.length - 1; } return i; };
  const cleanBar = (slots) => (slots || []).map((s, i) => (s ? { ...s, id: 's' + i } : null));
  const groups = {};
  for (const r of rows) (groups[r.instance_id + '|' + r.hunt_id + '|' + r.hunt_from.slice(0, 19)] ??= []).push(r);
  const samples = [];
  for (const rs of Object.values(groups)) {
    const r1 = rs[0];
    if (!G.HUNT_GROUNDS[r1.hunt_id] || /^training_|_called$|tower|_hall$|_wing$/.test(r1.hunt_id)) continue;
    if (rs.some((r) => !now[hk(r)]) || new Set(rs.map(hk)).size !== rs.length) continue;
    const hours = Math.max(...rs.map((r) => (r.paid_ms || 0) / 3600000));
    if (hours < 0.5 || rs.some((r) => (r.paid_ms || 0) / 3600000 < hours * 0.9)) continue;
    rs.sort((a, b) => a.seat - b.seat);
    const seats = rs.map((r) => {
      const n = now[hk(r)], hr = (r.paid_ms || 0) / 3600000, per = (x) => r0((x || 0) / hr), st = startOf(r);
      const preset = n.presets[r.preset] || null, set = n.sets[preset ? preset.action_set : r.preset] || n.sets[0] || { slots: [], options: {} };
      const equipment = { ...n.equipment };
      const options = { ...(set.options || {}) };
      const setup = SPAWN.heroSetup({ weaponType: wornRoleKey(equipment, ITEMS), options, bar: set.slots || [] });
      const perMap = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, x]) => [k, r3(x / hr)]));
      return {
        role: setup ? setup.role : 'melee_dps', levelXp: st.levelXp, skills: st.skills, ...(st.approx ? { approx: true } : {}),
        kit: intern(kits, equipment), bar: intern(bars, cleanBar(set.slots)), options,
        ownPerH: perMap(r.supplies),
        real: { hours: r3(hr), levelXpPerH: per(r.xp && r.xp.level), rawXpPerH: per(r.raw_xp && r.raw_xp.level), coinPerH: per(r.coins), storePerH: per(r.supply_gold),
          takenPerH: per(r.taken && r.taken.total), healedPerH: per(r.healed && r.healed.total), dealtPerH: per(r.dealt && r.dealt.total), deathsPerH: r3(r.deaths / hr),
          boughtPerH: perMap(r.bought), dealtShare: Object.fromEntries(Object.entries((r.dealt && r.dealt.byAbility) || {}).map(([k, x]) => [k, r3(x / Math.max(1, r.dealt.total))])) },
        _gearAt: lastGear[hk(r)], _from: r.hunt_from,
      };
    });
    /* the worn set is HELD when the hunt began after the hero's last setup change (the only history the server keeps) */
    const held = seats.every((s) => s._gearAt && s._from >= s._gearAt);
    for (const s of seats) { delete s._gearAt; delete s._from; }
    samples.push({ ground: r1.hunt_id, tier: tierOf(r1), size: seats.length, date: r1.hunt_from.slice(0, 10), hours: r3(hours), kit: held ? 'held' : 'assumed',
      real: { killsPerH: r0(Math.max(...rs.map((r) => r.kills)) / hours) }, seats });
  }
  /* --since: only hunts from that day on are kept (an older build's hunts say nothing about today's engine) */
  for (let i = samples.length - 1; i >= 0; i--) if (since && samples[i].date < since) samples.splice(i, 1);
  samples.sort((a, b) => (a.date + a.ground).localeCompare(b.date + b.ground));
  /* only the kits and bars a kept sample wears */
  const remap = (list, key) => { const used = [...new Set(samples.flatMap((s) => s.seats.map((x) => x[key])))].sort((a, b) => a - b); for (const s of samples) for (const x of s.seats) x[key] = used.indexOf(x[key]); return used.map((i) => list[i]); };
  const keptKits = remap(kits, 'kit'), keptBars = remap(bars, 'bar');
  const seen = {};
  for (const s of samples) { const k = s.ground + ':' + s.tier + ':' + s.size; seen[k] = (seen[k] || 0) + 1; s.id = k + ':' + seen[k]; }
  const out = { note: 'Real hunts, aggregated and anonymous (seats by index, rates an hour, a date). Built by tools/balance-sim/calibrate.mjs --build from a local read-only export; never edit by hand.',
    built: new Date().toISOString().slice(0, 10), kits: keptKits, bars: keptBars, samples };
  writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
  console.log('samples', samples.length, '| held', samples.filter((s) => s.kit === 'held').length, '| kits', keptKits.length, '| bars', keptBars.length, '->', outPath);
  for (const s of samples) console.log(' ', s.id.padEnd(34), s.date, 'h', String(s.hours).padStart(6), s.kit, 'kills/h', s.real.killsPerH, 'xp/h', s.seats.map((x) => x.real.levelXpPerH).join('/'));
}

/* ── RUN ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The cell a sample plays: its seats as recorded, the tier's own pull, the stock each seat spent (scaled to the hours played). */
export function cellOfSample(fx, s, o, tierRowOf) {
  const hours = o.hours, row = tierRowOf(s.ground, s.tier), pull = row.pull[s.size - 1];
  return {
    id: s.id, ground: s.ground, hours, seeds: o.seeds, segmentH: Math.min(hours, 2), seedBase: o.seedBase || 0,
    ...(pull ? { density: pull } : {}), ...(s.tier !== 'normal' ? { options: { tier: s.tier } } : {}),
    ...(o.windowMs ? { windowMs: o.windowMs } : {}), ...(o.profile ? { profile: o.profile, supply: 'own' } : {}),
    /* o.use: which of the recorded hero's fields are played (default: all of them). A field left out is the HARNESS'S OWN (cell.mjs: the
       ladder kit of the seat's style, skills at the Level, the reference bar and the role's default rules, no hunt options, store supplies):
       `--as harness` plays none, `--swap kit` plays the harness's hero in the recorded kit, and so on (which assumption moves the numbers). */
    seats: s.seats.map((x) => {
      const use = o.use || USE_ALL, kit = fx.kits[x.kit];
      return { role: x.role, style: styleOf(x.role, kit, o.items), levelXp: x.levelXp,
        ...(use.skills ? { skills: x.skills } : {}), ...(use.kit ? { equipment: kit } : {}), ...(use.bar ? { bar: fx.bars[x.bar] } : {}),
        ...(use.options ? { options: x.options } : {}),
        /* own stock: what the hero spent an hour, for every hour of a segment (a new segment is a new hunt with a fresh bag) */
        ...(use.bag ? { bag: Object.fromEntries(Object.entries(x.ownPerH || {}).map(([id, n]) => [id, { loaded: Math.max(1, Math.round(n * Math.min(hours, 2))) }])) } : {}) };
    }),
  };
}
export const FIELDS = Object.freeze(['kit', 'bar', 'skills', 'options', 'bag']);
const USE_ALL = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f, true])));
/* The harness style (styles.mjs) that stands in a recorded seat: its role, and for Melee the weapon it holds. */
function styleOf(role, kit, items) {
  const w = (items && items[kit && kit.weapon]) || {};
  if (role === 'tank' || role === 'mage' || role === 'healer') return role;
  if (role === 'ranger') return kit && kit.shield ? 'crossbow' : 'bow';
  return w.weaponType === 'hammer' ? 'hammer' : w.weaponType === 'axes' || w.weaponType === 'axe' ? 'axes' : 'sword';
}
/** Sim rates per seat, in the tally's own terms. */
export function simRates(res) {
  return { killsPerH: res.party.killsPerH, seats: res.heroes.map((h) => ({ levelXpPerH: h.levelXpPerH, coinPerH: h.coinPerH, dealtPerH: h.dealtPerH, takenPerH: h.takenPerH,
    healedPerH: h.healInPerH.food + h.healInPerH.self + h.healOutPerH, storePerH: h.storePerH, incomePerH: h.incomePerH, raresPerH: h.raresPerH, encMinHpPct: h.encMinHpPct, closeCallsPer12h: h.closeCallsPer12h.rate, deathsPerH: r3(h.deaths / Math.max(1e-9, h.hours)),
    level: h.level, usesPerH: h.buysPerH, dealtBy: h.dealtBy, ended: h.ended })) };
}
/** One sample's comparison: per metric { real, sim, ratio } for the party (kills) and the party's summed seats. */
export function compare(s, sim) {
  const out = {};
  for (const [key, , scope] of METRICS) {
    const real = scope === 'party' ? s.real[key] : s.seats.reduce((a, x) => a + (x.real[key] || 0), 0);
    const got = scope === 'party' ? sim[key] : sim.seats.reduce((a, x) => a + (x[key] || 0), 0);
    out[key] = { real: r3(real), sim: r3(got), ratio: real > 0 ? r3(got / real) : null };
  }
  return out;
}

/**
 * A WHAT-IF ON EVERY MONSTER ROW (the engine's own module instances, as worker.mjs whatIf): `mult` { hp, atk, xp, gp } scales that field on
 * every row; answers the undo. "+10% HP and damage" is { hp: 1.1, atk: 1.1 } (atk is the row's blow AND its to-hit, as STAT_FORMULA writes it).
 */
export async function scaleMonsters(mult) {
  const { BUILD } = await import(u('src/build-info.js'));
  const tables = [(await import(u('src/data/monsters.js') + '?v=' + BUILD.version)).MONSTERS, (await import(u('src/data/monsters.js'))).MONSTERS];
  const undo = [];
  for (const T of new Set(tables)) for (const row of Object.values(T)) for (const [k, m] of Object.entries(mult || {})) {
    if (!(m > 0) || m === 1 || row[k] === undefined) continue;
    const was = row[k], now = Array.isArray(was) ? was.map((x) => Math.round(x * m)) : Math.max(1, Math.round(was * m));
    try { row[k] = now; undo.push(() => { row[k] = was; }); } catch (e) { throw new Error('calibrate: a monster row is frozen, the what-if cannot reach it (' + k + ')'); }
  }
  return () => { for (const f of undo.reverse()) f(); };
}

export async function run(args) {
  const fx = args.fx || JSON.parse(readFileSync(args.fixture || FIXTURE, 'utf8'));
  const { loadCellRunner } = await import('./cell.mjs');
  const { tierRowOf } = await import(u('src/data/hunt-tiers.js'));
  const R = args.runner || await loadCellRunner(ROOT);
  const picked = fx.samples.filter((s) => (!args.only || s.id.includes(args.only)) && (!args.since || s.date >= args.since) && (!args.pick || args.pick(s)));
  const results = [];
  const say = args.quiet ? () => {} : console.log;
  const undo = args.monsters ? await scaleMonsters(args.monsters) : null;
  try {
    for (const s of picked) results.push(one(s));
  } finally { if (undo) undo(); }
  if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 1));
  return results;
  function one(s) {
    const console = { log: say };
    const t0 = Date.now();
    const res = R.runCell(cellOfSample(fx, s, { hours: args.hours, seeds: args.seeds, windowMs: args.windowMs, use: args.use, profile: args.profile, seedBase: args.seedBase, items: R.gear.ITEMS }, tierRowOf));
    const sim = simRates(res), cmp = compare(s, sim);
    const row = { id: s.id, date: s.date, kit: s.kit, size: s.size, realHours: s.hours, cmp, sim, real: s.seats.map((x) => x.real), secs: Math.round((Date.now() - t0) / 1000) };
    console.log(`\n${s.id}  ${s.date}  real ${s.hours} h  kit ${s.kit}  levels ${sim.seats.map((x) => x.level).join('/')}  (${row.secs}s)`);
    for (const [key, label] of METRICS) { const c = cmp[key]; console.log(`  ${label.padEnd(13)} real ${String(c.real).padStart(9)}  sim ${String(c.sim).padStart(9)}  ${c.ratio === null ? '' : 'x' + c.ratio.toFixed(2)}`); }
    if (args.verbose) s.seats.forEach((x, i) => { const m = sim.seats[i]; console.log(`   seat${i} ${x.role.padEnd(9)} xp ${x.real.levelXpPerH}/${m.levelXpPerH} dealt ${x.real.dealtPerH}/${m.dealtPerH} taken ${x.real.takenPerH}/${m.takenPerH} healed ${x.real.healedPerH}/${m.healedPerH} store ${x.real.storePerH}/${m.storePerH} ended ${JSON.stringify(m.ended)}`); });
    return row;
  }
}

const MAIN = isMain(import.meta.url);
if (MAIN) {
  const a = process.argv.slice(2), val = (f, dv) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : dv; };
  if (a[0] === '--build') await build(a[1], a[2], val('--out', FIXTURE), val('--instances', null), val('--since', null));
  else await run({ fixture: val('--fixture', null), only: val('--only', null), since: val('--since', null), hours: Number(val('--hours', 1)), seeds: Number(val('--seeds', 2)), json: val('--json', null),
    windowMs: val('--window', null) ? Number(val('--window')) : null, verbose: a.includes('--verbose'), profile: val('--profile', null), seedBase: Number(val('--seed-base', 0)),
    /* --monsters hp=1.1,atk=1.1: every monster row scaled for this run (a what-if; no file is written) */
    monsters: val('--monsters', null) ? Object.fromEntries(val('--monsters').split(',').map((p) => p.split('=')).map(([k, x]) => [k, Number(x)])) : null,
    /* --as harness: the harness's own hero in every seat; --swap kit,bar: the harness's hero with those recorded fields */
    use: val('--as', 'real') === 'harness' || val('--swap', null) !== null ? Object.fromEntries((val('--swap', '') || '').split(',').filter(Boolean).map((f) => [f, true])) : null });
}
