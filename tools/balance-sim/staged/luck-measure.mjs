#!/usr/bin/env node
// tools/balance-sim/staged/luck-measure.mjs — LUCK v3 (staged/luck.js) MEASURED ON PLAYED LIVES, ON THE REAL ENGINE
// (designer, 2026-11-19; v2 2026-11-20: the Bestiary counts per account, salvaging feeds Luck; v3 the same day for Tyler's "almost
// exactly like gw2's where i dont think there is a cap": one Luck total, ranks that each cost more, no near ceiling).
// A measuring tool for a proposal: it grades nothing and writes nothing under src/.
//
//   node tools/balance-sim/staged/luck-measure.mjs curve
//        the feeds and the curve: what each piece and stage gives, what each rank costs, what a Rare's pace becomes
//   node tools/balance-sim/staged/luck-measure.mjs life --party hammer [--policy rec|dangerous|deadly] [--max 500] [--heroes 1]
//                                                       [--luck off|kills|all] --out file.json
//        (written every 10 chunks; run the same command again after a stop and it carries on from the file)
//        a played life (the loop of tools/balance-sim/life.mjs: the advised ground, the played profile, store supplies), hour by hour.
//        Each chunk records its kills by creature. The ACCOUNT's count is every kill once, whoever of its heroes was there:
//        `--party a,b,c,d` is four of one account's heroes in one hunt (a kill counts once); `--heroes 4` is that many of its heroes
//        hunting apart at once, each living this same life.
//        `--luck kills` applies the Bestiary's Luck IN THE ROLL, `--luck all` the Bestiary's and the salvage of every dropped piece:
//        every Rare and Trophy row's chance on the engine's own monster rows is multiplied for the chunk and put back after it.
//        `--luck off` plays today's game on the same dice. The built game ends at Krell's Hold: past it a life stays there.
//   node tools/balance-sim/staged/luck-measure.mjs table --in file.json [--heroes N] [--salvage 0..1]
//        read off one recorded life at 10 / 50 / 100 / 500 / 1,000 / 2,000 / 5,000 hours a hero: Luck from each feed, the rank selling
//        everything and salvaging `--salvage` of the gear (default all), Rares an hour and so far, and the gold salvaging gives up.
//        No play: the staged numbers can be re-read against the same life. `--extend H` carries a life that stopped early on to H
//        hours by living its last 200 hours again (PROJECTED, and the table says where the measured part ends).
//   node tools/balance-sim/staged/luck-measure.mjs project --in file.json [--heroes N] [--salvage 0..1] [--from 800] [--kept 0.25]
//        ASSUMED, not measured: the PLANNED game past tier 7, where the hourly gear drop ends (plan section 3) and uniques are the
//        only gear. The recorded life to `--from` hours, then the plan's own estimates to 5,000 h. Prints what it assumes.
//   node tools/balance-sim/staged/luck-measure.mjs compare --off a.json --on b.json
//        the rolled check: Rares the settle dropped today against with Luck, and that nothing else moved
//
// TWO READINGS OF A RARE RATE. EXPECTED: the chunk's measured kills by creature x each Rare or Trophy row's chance
// (drops.js effectiveDropChance, the game's own): exact for those kills, no dice noise. ROLLED: the `rare_drop` hints the settle
// answered. For a lone hero the two runs are the same dice (a kill's loot draws don't move with a row's chance), so every Rare the
// `off` life rolled the `on` life rolled too.
// WHAT SALVAGING GIVES UP is the shop's price for the worn gear a hunt dropped (weapons, armor, off-hands, jewelry, any band),
// expected the same way. Salvage's own return (the plan's crafting stock) is not built and is counted as nothing: an upper bound.
//
// Exit 0 when it ran, 2 on a bad argument.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LUCK_STAGES, STAGE_LUCK, LUCK_PER_TIER, RARE_MULT, UNIQUE_LUCK_PER_BAND, RANK_STEP, LUCK_RANK_MAX, TROPHY_RANK_MAX, LUCK_BANDS, bestiaryLuckOf, salvageLuckOf, luckToRank, rankOf, luckMult, stagesAt } from './luck.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const USAGE = 'usage: luck-measure.mjs curve | life --party <styles> [--policy rec|dangerous|deadly] [--max h] [--heroes n] [--luck off|kills|all] [--out f] | table --in f [--heroes n] [--salvage 0..1] | project --in f [--heroes n] [--salvage 0..1] [--from h] [--kept 0..1] | compare --off a.json --on b.json';
if (!['curve', 'life', 'table', 'project', 'compare'].includes(mode)) { console.error(USAGE); process.exit(2); }

const MARKS = [10, 50, 100, 500, 1000, 2000, 5000];
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));
const sum = (rows, f) => rows.reduce((s, t) => s + f(t), 0);

if (mode === 'compare') {
  const off = JSON.parse(readFileSync(resolve(arg('off')), 'utf8')), on = JSON.parse(readFileSync(resolve(arg('on')), 'utf8'));
  const n = on.party.length;
  console.log(`${on.party.join('+')} (${on.policy}), a hero's share, Luck ${on.luck} in the roll against today`);
  for (const at of MARKS) {
    if (on.hours < at - 1 || off.hours < at - 1) continue;
    const upTo = (tr, f) => sum(tr.filter((t) => t.hours <= at + 1e-9), f) / n;
    console.log(`  by ${at} h: rolled Rares ${upTo(off.trace, (t) => t.rolled).toFixed(1)} -> ${upTo(on.trace, (t) => t.rolled).toFixed(1)}, expected ${upTo(on.trace, (t) => t.expBase).toFixed(1)} -> ${upTo(on.trace, (t) => t.expLuck).toFixed(1)}`);
  }
  const H = Math.min(on.hours, off.hours), cut = (tr) => tr.filter((t) => t.hours <= H + 1e-9);
  console.log(`  to ${H.toFixed(0)} h, a hero: income ${Math.round(sum(cut(off.trace), (t) => t.income) / n)} today, ${Math.round(sum(cut(on.trace), (t) => t.income) / n)} with Luck (coin and every band but Rare and Trophy); Rares' shop value ${Math.round(sum(cut(off.trace), (t) => t.rareGold) / n)} -> ${Math.round(sum(cut(on.trace), (t) => t.rareGold) / n)}; Level there ${cut(off.trace).at(-1).levels.join('/')} -> ${cut(on.trace).at(-1).levels.join('/')}`);
  process.exit(0);
}

/* the game's own rows and prices, no engine: enough for `curve`, `table` and `project` */
const { effectiveDropChance } = await import(u('src/core/drops.js'));
const MON = (await import(u('src/data/monsters.js'))).MONSTERS;
const PLAY = await (await import(u('tests/hunt-core/fixtures/play-ground.mjs'))).loadPlay(ROOT);
const GEAR_TYPES = ['weapon', 'armor', 'offhand', 'jewelry'];
const isGear = (id) => !!PLAY.ITEMS[id] && GEAR_TYPES.includes(PLAY.ITEMS[id].type);
const shopOf = (id) => PLAY.vendorPriceOf(PLAY.ITEMS, id) || 0;
const tierOf = (id) => Math.max(1, Math.floor(Number(PLAY.ITEMS[id].tier) || 1));
const revealRows = (id) => ((MON[id] || {}).drops || []).filter((d) => LUCK_BANDS.includes(d.band));
const dropMultOf = (id) => (Number((MON[id] || {}).dropBonus) > 0 ? Number(MON[id].dropBonus) : 1);
/* the expected Rare / Trophy drops of `kills` { creature: n } at today's chances, apart: Luck moves the two differently */
function expectedBy(kills) {
  const e = { rare: 0, trophy: 0 };
  for (const [id, n] of Object.entries(kills)) for (const d of revealRows(id)) e[d.band] += n * effectiveDropChance(d, { dropMult: dropMultOf(id) });
  return e;
}
const raresAt = (e, rank) => e.rare * (1 + rank / 100) + e.trophy * (1 + Math.min(rank, TROPHY_RANK_MAX) / 100);
/* the worn gear `kills` drop at today's chances: pieces, the shop's gold for them, and the Luck salvaging them gives, the Rare ones apart */
function gearOf(kills) {
  const g = { pieces: 0, gold: 0, luck: 0, rarePieces: 0, rareLuck: 0, byTier: {} };
  for (const [id, n] of Object.entries(kills)) for (const d of (MON[id] || {}).drops || []) {
    if (!isGear(d.id)) continue;
    const reveal = LUCK_BANDS.includes(d.band), e = n * effectiveDropChance(d, { dropMult: dropMultOf(id) }), L = salvageLuckOf(tierOf(d.id), d.band), key = 'T' + tierOf(d.id) + (reveal ? ' Rare' : '');
    g.pieces += e; g.gold += e * shopOf(d.id); g.byTier[key] = (g.byTier[key] || 0) + e;
    if (reveal) { g.rarePieces += e; g.rareLuck += e * L; } else g.luck += e * L;
  }
  return g;
}

/* THE ACCOUNT'S LUCK along a recorded life: `heroes` of its heroes living it apart at once (1: as recorded), salvaging `share` of the
   gear its hunts drop. Rare pieces come as often as the Luck held at the time makes them. Answers one row a chunk. */
function accountOf(run, heroes, share) {
  const counters = {}, rows = [];
  let salvaged = 0;
  for (const t of run.trace) {
    const b = bestiaryLuckOf(counters, run.roster), g = gearOf(t.killsBy), e = expectedBy(t.killsBy);
    const rK = rankOf(b), rA = rankOf(b + salvaged);
    rows.push({ ...t, g, bLuck: b, sLuck: salvaged, rK, rA, e0: e.rare + e.trophy, eK: raresAt(e, rK), eA: raresAt(e, rA) });
    for (const [id, n] of Object.entries(t.killsBy)) counters[id] = (counters[id] || 0) + n * heroes;
    salvaged += share * heroes * (g.luck + g.rareLuck * (1 + rA / 100));
  }
  return { rows, counters, salvaged };
}

if (mode === 'table' || mode === 'project') {
  if (!arg('in')) { console.error(USAGE); process.exit(2); }
  const run = JSON.parse(readFileSync(resolve(arg('in')), 'utf8')), measuredTo = run.hours, extend = Number(arg('extend', 0));
  /* --extend H: PROJECTED past the life's end by living its last 200 chunks again and again (the built game's last ground, where a long life stays) */
  if (extend > measuredTo) { const loop = run.trace.slice(-200); let h = measuredTo, i = 0; while (h < extend) { const t = loop[i++ % loop.length]; h += t.h; run.trace.push({ ...t, hours: Math.round(h * 100) / 100 }); } }
  const heroes = Math.max(1, Number(arg('heroes', run.heroes || 1)) || 1), share = Math.min(1, Math.max(0, Number(arg('salvage', 1))));
  const n = run.party.length, acct = accountOf(run, heroes, share), rows = acct.rows;
  const who = n > 1 ? `one account's ${n} heroes in one hunt (${run.party.join('+')}, ${run.policy})` : heroes > 1 ? `one account's ${heroes} heroes hunting apart, each a lone ${run.party[0]} (${run.policy})` : `a one-hero account, a lone ${run.party[0]} (${run.policy})`;
  if (mode === 'table') {
    console.log(`${who}, salvaging ${Math.round(share * 100)}% of the gear its hunts drop. Hours are hours EACH hero has hunted. Rares and gold are one hero's share.`);
    console.log('hours | Level | ground | Luck: Bestiary + salvage | rank (= +% on Rares): selling everything / salvaging | Rares an hour: today / selling / salvaging | Rares so far: today / selling / salvaging | gear pieces an hour | shop gold for them, an hour (share of coin + sold loot) | given up so far | Luck an hour: Bestiary / salvage | next rank costs');
    const win = (at) => rows.filter((t) => t.hours > at - Math.max(5, at / 10) && t.hours <= at + 1e-9);
    for (const at of MARKS) {
      const b = win(at);
      if (!b.length || b[b.length - 1].hours < at - 1) { console.log(`${at} | not reached`); continue; }
      if (at > measuredTo + 1) console.log(`  PROJECTED (the life was played to ${measuredTo.toFixed(0)} h; its last 200 h lived again):`);
      const H = sum(b, (t) => t.h), last = b[b.length - 1], upTo = rows.filter((t) => t.hours <= at + 1e-9);
      const per = (f) => sum(b, f) / H / n, tot = (f) => sum(upTo, f) / n;
      const gear = per((t) => t.g.gold), inc = per((t) => t.income);
      const after = rows.find((t) => t.hours > at + 1e-9) || last, first = b[0];
      console.log(`${at} | ${Math.min(...last.levels)} | ${last.ground}${last.tier === 'normal' ? '' : ' (' + last.tier + ')'} | ${k(last.bLuck)} + ${k(last.sLuck)} | ${last.rK} / ${last.rA} | ${per((t) => t.e0).toFixed(2)} / ${per((t) => t.eK).toFixed(2)} / ${per((t) => t.eA).toFixed(2)} | ${tot((t) => t.e0).toFixed(0)} / ${tot((t) => t.eK).toFixed(0)} / ${tot((t) => t.eA).toFixed(0)} | ${per((t) => t.g.pieces).toFixed(1)} | ${Math.round(gear)} (${(100 * gear / inc).toFixed(0)}% of ${Math.round(inc)}) | ${k(tot((t) => share * t.g.gold))} | ${Math.round((after.bLuck - first.bLuck) / H)} / ${Math.round((after.sLuck - first.sLuck) / H)} | ${k(RANK_STEP * (last.rA + 1) ** 2)}`);
    }
    const firstAt = (f) => { const t = rows.find(f); return t ? t.hours.toFixed(0) + ' h' : 'not reached'; };
    console.log('rank reached at, salvaging: ' + [1, 5, 10, 15, 20, 25, 30, 40, 50].map((L) => `${L}: ${firstAt((t) => t.rA >= L)}`).join(' · '));
    console.log('rank reached at, selling everything: ' + [1, 5, 10, 15, 20, 25].map((L) => `${L}: ${firstAt((t) => t.rK >= L)}`).join(' · '));
    const T = rows[rows.length - 1], held = run.roster.reduce((s, id) => s + stagesAt(acct.counters[id] || 0), 0);
    console.log(`at the end (${T.hours.toFixed(0)} h a hero): the Bestiary holds ${held} of ${run.roster.length * LUCK_STAGES.length} stages, ${k(bestiaryLuckOf(acct.counters, run.roster))} of ${k(run.roster.length * sum(STAGE_LUCK, (x) => x))} Luck; creatures at the last stage: ${run.roster.filter((id) => stagesAt(acct.counters[id] || 0) === LUCK_STAGES.length).length} of ${run.roster.length}`);
    const byTier = {}; for (const t of rows) for (const [key, e] of Object.entries(t.g.byTier)) byTier[key] = (byTier[key] || 0) + e / n;
    console.log('gear pieces a hero found, whole life: ' + Object.keys(byTier).sort().map((key) => `${key} ${k(byTier[key])}`).join(' · '));
    console.log(`whole life, a hero: coin + sold loot ${k(sum(rows, (t) => t.income) / n)}, of it worn gear ${k(sum(rows, (t) => t.g.gold) / n)}, Rares' shop value ${k(sum(rows, (t) => t.rareGold) / n)}; store bill ${k(sum(rows, (t) => t.store) / n)}`);
    process.exit(0);
  }
  /* ---- project: the PLANNED game past tier 7 (ASSUMED) ---- */
  const from = Number(arg('from', 800)), kept = Math.min(1, Math.max(0, Number(arg('kept', 0.25))));
  const base = rows.filter((t) => t.hours <= from + 1e-9), last = base[base.length - 1];
  if (!last || last.hours < from - 1) { console.error(`the life stops before ${from} h`); process.exit(2); }
  const tail = base.filter((t) => t.hours > from - 100), TH = sum(tail, (t) => t.h);
  const UNIQUES_H = 0.5, BAND_H = 364, STAGE_H = (last.bLuck - tail[0].bLuck) / TH;
  console.log(`ASSUMED, the planned game past tier 7. ${who}, salvaging ${Math.round(share * 100)}% of what it doesn't keep.`);
  console.log(`  to ${from} h: the recorded life. After it: no hourly gear (plan section 3); a unique every ${1 / UNIQUES_H} h a hero at Luck 0 (the plan's estimate), ${Math.round(kept * 100)}% of them worn or kept; band 8 at ${from} h and one more every ${BAND_H} h (bands 8 to 18 over Levels 128 to 400, the plan's hours); a unique gives ${UNIQUE_LUCK_PER_BAND} x band; the Bestiary pays what it paid over the life's last 100 h (${STAGE_H.toFixed(0)} Luck an hour for the account).`);
  let b = last.bLuck, s = last.sLuck, uniq0 = 0, uniqL = 0;
  console.log('hours | band | Luck: Bestiary + salvage | rank | uniques an hour a hero: today / with Luck | Luck an hour');
  for (let h = from; h <= 5000; h++) {
    const band = Math.min(18, 8 + Math.floor((h - from) / BAND_H)), r = rankOf(b + s);
    const perH = UNIQUES_H * (1 + r / 100), gain = share * (1 - kept) * heroes * perH * UNIQUE_LUCK_PER_BAND * band;
    if ([from, 1000, 2000, 3000, 5000].includes(h)) console.log(`${h} | ${band} | ${k(b)} + ${k(s)} | ${r} | ${UNIQUES_H.toFixed(2)} / ${perH.toFixed(2)} | ${Math.round(STAGE_H + gain)}`);
    b += STAGE_H; s += gain; uniq0 += UNIQUES_H; uniqL += perH;
  }
  console.log(`  uniques a hero, ${from} to 5,000 h: ${uniq0.toFixed(0)} today, ${uniqL.toFixed(0)} with Luck. The far stop (rank ${LUCK_RANK_MAX}, ${k(luckToRank(LUCK_RANK_MAX))} Luck) is ${k(luckToRank(LUCK_RANK_MAX) - b - s)} Luck away at 5,000 h.`);
  process.exit(0);
}

const G = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const huntOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt || g];
const OPEN = (Array.isArray(G.OPEN_GROUNDS) ? G.OPEN_GROUNDS : Object.keys(G.OPEN_GROUNDS)).filter((g) => !huntOf(g).staged);
const monstersOf = (g) => { const s = new Set(); for (const p of G.HUNT_GROUNDS[g].pockets) for (const x of (p.pack || []).concat(p.spawns)) s.add(x.monster); return [...s]; };
const ROSTER = [...new Set(OPEN.flatMap(monstersOf))];

if (mode === 'curve') {
  console.log(`SALVAGE (worn gear the account's own hunts dropped): a standard piece gives ${LUCK_PER_TIER} x its tier, a Rare piece ${RARE_MULT} times that, a unique past tier 7 gives ${UNIQUE_LUCK_PER_BAND} x its band`);
  console.log('  tier: standard / Rare: ' + [1, 2, 3, 4, 5, 6, 7].map((t) => `${t}: ${salvageLuckOf(t, 'scarce')} / ${salvageLuckOf(t, 'rare')}`).join(' · ') + ' · a unique of band 8 / 12 / 18: ' + [8, 12, 18].map((t) => salvageLuckOf(t, 'rare')).join(' / '));
  console.log(`THE BESTIARY (one count a creature for the whole account): at ${LUCK_STAGES.join(' / ')} kills it pays ${STAGE_LUCK.join(' / ')} Luck (${sum(STAGE_LUCK, (x) => x)} a creature in all)`);
  console.log(`RANKS: rank n costs ${RANK_STEP} x n^2 Luck. +1% on Rare rows a rank, to rank ${LUCK_RANK_MAX}; Trophy rows stop at rank ${TROPHY_RANK_MAX}`);
  console.log('rank | this rank costs | Luck in all | a 10 h Rare comes every | a 125 h Trophy comes every');
  for (const r of [0, 1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100]) console.log(`${r} | ${k(RANK_STEP * r * r)} | ${k(luckToRank(r))} | ${(10 / luckMult(luckToRank(r))).toFixed(1)} h | ${(125 / luckMult(luckToRank(r), 'trophy')).toFixed(0)} h`);
  const gearRows = ROSTER.flatMap((id) => ((MON[id] || {}).drops || []).filter((d) => isGear(d.id)));
  console.log(`open grounds: ${OPEN.length}, creatures on them: ${ROSTER.length}; every stage of every one pays ${k(ROSTER.length * sum(STAGE_LUCK, (x) => x))} Luck, rank ${rankOf(ROSTER.length * sum(STAGE_LUCK, (x) => x))} alone`);
  console.log(`creatures with a Rare or Trophy row: ${ROSTER.filter((id) => revealRows(id).length).length} of ${ROSTER.length} (${ROSTER.reduce((s, id) => s + revealRows(id).length, 0)} rows); worn-gear rows: ${gearRows.length}, by band ${JSON.stringify(gearRows.reduce((m, d) => { m[d.band || '?'] = (m[d.band || '?'] || 0) + 1; return m; }, {}))}`);
  process.exit(0);
}

/* ---- life ---- */
const { loadCellRunner } = await import('../cell.mjs');
const { sourceQuery } = await import('../../lib/version-stamp.mjs');
const R = await loadCellRunner(ROOT), XP = R.XP;
const v = sourceQuery(ROOT);
const T = await import(u('src/data/hunt-tiers.js'));
const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + v);
/* every instance of the monster rows the engine may read (the stamped one and the bare one: worker.mjs ENG.monsters) */
const TABLES = [...new Set([(await import(u('src/data/monsters.js') + v)).MONSTERS, MON])];
const POLICIES = ['rec', 'dangerous', 'deadly'], LUCKS = ['off', 'kills', 'all'];
const policy = arg('policy', 'rec'), party = String(arg('party', '')).split(',').filter(Boolean), maxHours = Number(arg('max', 500)), luck = arg('luck', 'off');
const heroes = Math.max(1, Math.floor(Number(arg('heroes', 1)) || 1));
if (!party.length || !POLICIES.includes(policy) || !LUCKS.includes(luck) || !(maxHours > 0) || (heroes > 1 && party.length > 1)) { console.error(USAGE); process.exit(2); }
const floorOf = (g) => huntOf(g).band[0];

/* THE ROLL: every Rare and Trophy row's chance x its band's multiplier at `held` Luck, on the engine's own rows; answers the undo */
function applyLuck(held) {
  const undo = new Map();
  /* the two instances may share their row objects: each row is multiplied once, and put back to the chance it had */
  for (const M of TABLES) for (const id of Object.keys(M)) for (const d of M[id].drops || []) {
    if (undo.has(d) || !LUCK_BANDS.includes(d.band) || !(d.ch < 1)) continue;
    undo.set(d, d.ch);
    d.ch = d.ch * luckMult(held, d.band);
  }
  return () => { for (const [d, ch] of undo) d.ch = ch; };
}

const seats = party.map(() => ({ levelXp: 0, skills: {} }));
const lv = (s) => XP.charLevelFromXp(s.levelXp);
const counters = {}, trace = [];
let hours = 0, chunk = 0, salvaged = 0;
/* A LONG LIFE SURVIVES A RESTART: with --out, the life so far is written every 10 chunks, and a run that finds its own unfinished
   file (the same party, policy, heroes and Luck) carries on from it. The dice are the chunk's (seedBase 7000 + chunk), so a resumed
   life is the life an unbroken run plays. `salvaged` is the Luck salvage has paid so far. */
const outFile = arg('out', null) ? resolve(arg('out')) : null;
const save = (done) => { if (outFile) writeFileSync(outFile, JSON.stringify({ policy, party, heroes, luck, hours, done, reached: seats.map(lv), trace, roster: ROSTER, state: { seats, counters, salvaged, chunk } })); };
if (outFile && existsSync(outFile)) {
  const old = JSON.parse(readFileSync(outFile, 'utf8'));
  if (old.state && !old.done && old.policy === policy && old.luck === luck && old.heroes === heroes && old.party.join() === party.join()) {
    old.state.seats.forEach((s, i) => { seats[i] = s; });
    Object.assign(counters, old.state.counters); trace.push(...old.trace);
    hours = old.hours; chunk = old.state.chunk; salvaged = old.state.salvaged;
    console.log(`  resumed at ${hours.toFixed(1)} h`);
  }
}
while (hours < maxHours) {
  const levels = seats.map(lv), L = Math.min(...levels);
  const chunkH = L < 8 ? 0.25 : L < 12 ? 0.5 : 1;
  const ground = recommendedHunt(levels, party.length).hunt;
  let tier = 'normal';
  if (policy === 'deadly') { const ts = T.tiersOf(ground); tier = ts[ts.length - 1]; }
  if (policy === 'dangerous' && T.tiersOf(ground).includes('dangerous') && L >= floorOf(ground)) tier = 'dangerous';
  const pull = tier === 'normal' ? null : T.pullOfTier(T.tierRowOf(ground, tier), party.length);
  const cell = { id: 'luck:' + chunk, ground, party, startBySeat: seats.map((s) => ({ levelXp: s.levelXp, skills: { ...s.skills } })), hours: chunkH, seeds: 1,
    seedBase: 7000 + chunk, segmentH: chunkH, windowMs: 600000, supply: 'store', profile: 'played',
    ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}) };
  const held = luck === 'off' ? 0 : bestiaryLuckOf(counters, ROSTER) + (luck === 'all' ? salvaged : 0), rank = rankOf(held);
  const undo = luck === 'off' ? () => {} : applyLuck(held);
  let m;
  try { m = R.runCell(cell); } finally { undo(); }
  const h = m.party.hours;
  m.heroes.forEach((x, i) => {
    const s = seats[i];
    s.levelXp = Math.max(XP.charXpForLevel(lv(s)), s.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
    for (const key of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) s.skills[key] = Math.max(0, (s.skills[key] || 0) + (x.raw.skillXp[key] || 0) - (x.raw.xpLostSkill[key] || 0));
  });
  /* the chunk's kills by creature (the cell answers them per hour): ONE count a kill for the account, whoever of its heroes was there */
  const killsBy = Object.fromEntries(Object.entries(m.party.killsByPerH).map(([id, perH]) => [id, Math.round(perH * h)]));
  const g = gearOf(killsBy), e = expectedBy(killsBy);
  for (const [id, n] of Object.entries(killsBy)) counters[id] = (counters[id] || 0) + n * heroes;
  salvaged += heroes * (g.luck + g.rareLuck * (1 + rank / 100));
  hours += h;
  trace.push({ chunk, h, hours: Math.round(hours * 100) / 100, ground, tier, levels, held, rank, killsBy, gearGold: g.gold,
    expBase: e.rare + e.trophy, expLuck: raresAt(e, rank), rolled: m.heroes.reduce((s, x) => s + x.rareItems, 0),
    income: m.heroes.reduce((s, x) => s + x.raw.income, 0), coin: m.heroes.reduce((s, x) => s + x.raw.coin, 0), store: m.heroes.reduce((s, x) => s + x.raw.store, 0),
    scarceGold: m.heroes.reduce((s, x) => s + (x.lootPerH.scarce || 0) * x.hours, 0), rareGold: m.heroes.reduce((s, x) => s + x.raw.rares, 0),
    deaths: m.heroes.reduce((s, x) => s + x.deaths, 0) });
  chunk++;
  if (chunk % 10 === 0) save(false);
}

const n = party.length;
console.log(`${party.join('+')} (${policy}, played, ${heroes > 1 ? heroes + ' heroes apart, ' : ''}Luck in the roll: ${luck}): ${hours.toFixed(1)} h -> Level ${seats.map(lv).join('/')}; Luck: the Bestiary ${k(bestiaryLuckOf(counters, ROSTER))}, salvaging everything ${k(salvaged)}, rank ${rankOf(bestiaryLuckOf(counters, ROSTER) + salvaged)}`);
console.log(`  a hero: rolled Rares ${(sum(trace, (t) => t.rolled) / n).toFixed(1)}, expected today ${(sum(trace, (t) => t.expBase) / n).toFixed(1)}, expected at this run's Luck ${(sum(trace, (t) => t.expLuck) / n).toFixed(1)}; income ${Math.round(sum(trace, (t) => t.income) / n)}, store ${Math.round(sum(trace, (t) => t.store) / n)}, deaths ${sum(trace, (t) => t.deaths)}`);
save(true);
