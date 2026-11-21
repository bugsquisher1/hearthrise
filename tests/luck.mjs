#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/luck.mjs — LUCK v3.1 HOLDS ITS RULES ON THE ENGINE AND ON THE SERVER (docs/design/itemization-plan.md §15; src/data/luck.js,
// src/core/luck.js, src/core/drops.js, src/core/hunt-rewards.js, supabase/migrations/1040-luck.sql).
//
//   L1  THE CURVE IS THE DESIGNER'S, ON THE SERVER: hr_luck_to_rank(n) = 100 x (1^2 + ... + n^2) for n = 0..100 (38,500 at 10, 149,600 at
//       16, 33.84M at the far stop); hr_luck_rank reads n at that Luck and n - 1 a Luck short; past the far stop it stays at 100.
//   L2  A TROPHY NEVER COMES FASTER THAN EVERY 100 H: at every Magic Find up to the most a hero holds (104), a Trophy row's factor stays
//       under the band's boostMax (1.25), so the 125 h floor drop-tables holds for its base is never under 100 h.
//   L3  ONE PLACE, THE RIGHT BANDS: at Magic Find 0 every monster row's chance is today's, bit for bit; at 104 a Rare or Very Rare row is
//       x2.04 (capped 0.95), a Trophy row on its curve, and every other band and every guaranteed row unchanged.
//   L4  ONE DRAW A ROLL (seeded replays match): every monster's table draws the same numbers at Magic Find 0 and at 104, unscaled and at a
//       scaled hour's lootPm; at 0 it answers exactly what the call without Magic Find answers; at 104 at most the rolls a row (k) of its
//       item land (the settle's item bound, settle-drop-bounds, holds at any Magic Find).
//   L5  "LUCKY FIND": a draw between the chance without Magic Find and the raised one lands and says lucky; under it lands plain; over it misses.
//   L6  THE PARTY ROLLS ON ITS HIGHEST (whole-game audit 2026-11-20 §5): partyMagicFind is the highest, order-free; and on the engine
//       (hunt-rewards.js rewardSwing) the same kill pays the same whoever of the party landed it, at the highest member's Magic Find.
//   L7  THE RARE CUT PAST KRELL: 0 on every open ground (each Level floor through Krell's Hold), 15% at the Morrow door (110), +1% a band, 25%
//       at most; it moves Rare rows only.
//   L8  BOTH PATHS: a party at Magic Find 100 on the real settle pays the same drops cut into 30 s windows (the hunt viewed: the live poll's
//       short settles) and in one 2 h window (the browser closed: the tick's long settle), and more Rares than at Magic Find 0 on the same dice.
//   L10 NO OTHER DROP LEVER: no item carries a drop-rate buff (the four foods' were cut, Tyler 2026-11-20).
//   L9  THE SERVER, LIVE ON THE REPLAYED CHAIN: dark (switch off) every member of a settle reads magic_find 0 whatever its Luck; on, the
//       account's rank plus the LARGEST Lucky ring worn (two rings count once).
//
//   node tests/luck.mjs            the guard
//   node tests/luck.mjs --pure     L2-L8 only (no database)
//   node tests/luck.mjs --mutate   each claim driven red by a planted defect in a copy of the tree
//
// ci-step: db-replay-7 | Luck v3.1 - the catalogue, the curve, Magic Find on the engine and the server, both paths
// ci-run: node tools/gen-luck.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-luck.mjs --selftest
// ci-run: node tests/luck.mjs
// ci-run: node tools/mutant-gate.mjs node tests/luck.mjs --mutate
//
// mutant-anchors: src/core/luck.js src/core/drops.js src/core/hunt-rewards.js src/data/luck.js src/core/member.js
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { isMain } from './_is-main.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
const PURE = process.argv.includes('--pure');

async function load(root) {
  const imp = (p, v = V) => import(pathToFileURL(join(root, p)).href + v);
  return {
    root,
    LD: await imp('src/data/luck.js'), LC: await imp('src/core/luck.js'), D: await imp('src/core/drops.js'), LB: await imp('src/data/loot-bands.js'),
    HR: await imp('src/core/hunt-rewards.js'), R: await imp('src/core/rng.js'), MON: (await imp('src/data/monsters.js')).MONSTERS,
    G: await imp('src/data/hunt-grounds.js'), H: await imp('src/data/hunts.js'), ITEMS: (await imp('src/data/items.js')).ITEMS,
  };
}

const MF_MAX = 104;   // the ruled budget (itemization plan §15 "One Magic Find budget"): the far stop 100 + the best Lucky ring 4
const rows = (M) => Object.values(M.MON).flatMap((m) => (Array.isArray(m && m.drops) ? m.drops : []));
/* an rng that hands out `us` in turn (0.5 after), counting every draw */
function scripted(us) {
  let i = 0;
  const next = () => (i < us.length ? us[i++] : (i++, 0.5));
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => (p <= 0 ? false : p >= 1 ? true : next() < p), get n() { return i; } };
}
function counting(seed, R) {
  const r = R.createRng(seed);
  let n = 0;
  return { next: () => { n++; return r.next(); }, int: (lo, hi) => { n++; return r.int(lo, hi); }, chance: (p) => { if (p > 0 && p < 1) n++; return r.chance(p); }, get n() { return n; } };
}

const claims = {
  L2(M) {
    const T = M.LB.BAND_TARGETS.trophy;
    if (!(T.boostMax > 1) || T.hours[0] * T.boostMax < 125 - 1e-9) return 'CONTROL: the Trophy band no longer holds its 125 h base';
    for (let mf = 0; mf <= MF_MAX; mf++) {
      const f = (1000 + M.LC.luckPm(mf, 'trophy')) / 1000;
      if (!(f < T.boostMax)) return `a Trophy row is x${f} at Magic Find ${mf}, not under ${T.boostMax}: a 125 h Trophy would come in ${(125 / f).toFixed(1)} h`;
    }
    if (M.LC.luckPm(25, 'trophy') !== 125) return `at Magic Find 25 a Trophy row is +${M.LC.luckPm(25, 'trophy') / 10}%, not the plan's +12.5%`;
    return null;
  },
  L3(M) {
    const all = rows(M);
    if (!all.some((d) => d.band === 'rare') || !all.some((d) => d.band === 'trophy')) return 'CONTROL: no Rare or Trophy row to read';
    for (const d of all) {
      const was = d.ch >= 1 ? Math.min(1, d.ch) : Math.min(0.95, d.ch * 1.1);
      const at0 = M.D.effectiveDropChance(d, { dropMult: 1.1, magicFind: 0 });
      if (at0 !== was) return `${d.id} (${d.band}) reads ${at0} at Magic Find 0, today ${was}`;
      const hi = M.D.effectiveDropChance(d, { dropMult: 1.1, magicFind: MF_MAX });
      const band = M.D.bandOf(d);
      const want = d.ch >= 1 ? was
        : band === 'rare' || band === 'very_rare' ? Math.min(0.95, d.ch * 1.1 * 2.04)
        : band === 'trophy' ? Math.min(0.95, d.ch * 1.1 * (1 + Math.floor((250 * MF_MAX) / (MF_MAX + 25)) / 1000)) : was;
      if (Math.abs(hi - want) > 1e-15) return `${d.id} (${band}) reads ${hi} at Magic Find ${MF_MAX}, want ${want}`;
    }
    const vr = { id: 'x', ch: 0.002, band: 'very_rare' };
    if (Math.abs(M.D.effectiveDropChance(vr, { magicFind: 50 }) - 0.003) > 1e-15) return 'a Very Rare row is not moved in full';
    if (M.D.effectiveDropChance({ id: 'x', ch: 0.002, band: 'rare' }, { magicFind: 1000 }) !== 0.002 * 2.04) return 'a forged Magic Find passes the far stop';
    return null;
  },
  L4(M) {
    for (const [mid, m] of Object.entries(M.MON)) {
      const drops = (m && m.drops) || [];
      if (!drops.length) continue;
      for (const lootPm of [undefined, 2500]) {
        const a = counting('l4:' + mid, M.R), b = counting('l4:' + mid, M.R), c = counting('l4:' + mid, M.R);
        const base = { dropMult: 1, ...(lootPm ? { lootPm } : {}) };
        const x = M.D.rollDropTable(drops, { ...base, magicFind: 0 }, a);
        const y = M.D.rollDropTable(drops, { ...base, magicFind: MF_MAX }, b);
        const z = M.D.rollDropTable(drops, base, c);
        if (a.n !== b.n) return `${mid} (lootPm ${lootPm || 'none'}) draws ${a.n} at Magic Find 0 and ${b.n} at ${MF_MAX}`;
        if (JSON.stringify(x) !== JSON.stringify(z)) return `${mid}: Magic Find 0 answers ${JSON.stringify(x.dropped)}, the call without it ${JSON.stringify(z.dropped)}`;
      }
      const k = M.D.rollsOf(2500);
      const hit = M.D.rollDropTable(drops, { dropMult: 1, magicFind: MF_MAX, lootPm: 2500 }, scripted(new Array(500).fill(0)));
      for (const [id, n] of Object.entries(hit.dropped)) if (n > k * drops.filter((d) => d.id === id).length) return `${mid}: ${n} ${id} on one kill at Magic Find ${MF_MAX}, the bound is ${k} a row`;
    }
    return null;
  },
  L5(M) {
    const t = [{ id: 'r', ch: 0.01, band: 'rare' }];
    const roll = (u) => M.D.rollDropTable(t, { magicFind: 100 }, scripted([u]));
    const l = roll(0.015), p = roll(0.005), x = roll(0.025);
    if (!l.events[0] || l.events[0].lucky !== true) return 'a draw between 1% and 2% at Magic Find 100 is not a lucky find: ' + JSON.stringify(l.events);
    if (!p.events[0] || p.events[0].lucky) return 'a draw under the base chance says lucky: ' + JSON.stringify(p.events);
    if (x.events.length) return 'a draw over the raised chance landed';
    const s = M.D.rollDropTable([{ id: 's', ch: 0.01, band: 'scarce' }], { magicFind: 100 }, scripted([0.005]));
    if (s.events[0] && s.events[0].lucky) return 'a Scarce row is flagged lucky';
    return null;
  },
  L6(M) {
    const P = M.LC.partyMagicFind;
    if (P([0, 16, 9]) !== 16 || P([16, 9, 0]) !== 16 || P([9, 0, 16]) !== 16 || P([]) !== 0 || P([999]) !== MF_MAX) return 'partyMagicFind is not the highest, order-free and clamped';
    if (M.LD.LUCK_RULES.party !== 'highest') return 'the party rule is ' + M.LD.LUCK_RULES.party + ', not the audit\'s highest';
    if (P([0, 16, 9], 'average') !== 8) return 'the average rule is not the floor of the mean';
    /* on the engine: one kill of a one-row monster by A (Magic Find 0) and by B (Magic Find 100), the draw between 1% and 2% */
    const run = (killer) => {
      const items = { 1: [], 2: [] };
      const mk = (u, mf) => ({ state: { stats: {}, gold: 0 }, hs: { tally: { kills: 0 }, _events: [] }, fx: { addItem: (id) => items[u].push(id) },
        bonus: () => 0, weakness: () => ({ dropMult: 1 }), magicFind: mf });
      const members = new Map([[1, mk(1, 0)], [2, mk(2, 100)]]);
      const world = { swing: 0, rareWon: {}, units: [{ id: 1, side: 'hero', alive: true }, { id: 2, side: 'hero', alive: true }, { id: 9, side: 'mon', kind: 'l6_mon', alive: false }] };
      const monsters = { l6_mon: { gp: null, drops: [{ id: 'l6_piece', ch: 0.01, band: 'rare' }] } };
      /* the draw for the row, then the rare roll's (two heroes), then the Hearthfind's: 0.015 lands only on the raised chance */
      M.HR.rewardSwing(members, [{ type: 'kill', u: killer, t: 9, atMs: 0 }], world, { rng: scripted([0.015, 0.1, 0.9, 0.9]), monsters, hearthfind: [], pay: { xpPm: 1000, coin: true, drops: true, bestiary: false } });
      return items[1].length + items[2].length;
    };
    const a = run(1), b = run(2);
    if (a !== 1 || b !== 1) return `a party of Magic Find 0 and 100 paid ${a} (A landed it) and ${b} (B landed it) pieces at a draw only the highest's chance covers, want 1 and 1`;
    return null;
  },
  L10(M) {
    /* NO OTHER DROP LEVER (itemization plan §15 'One Magic Find budget'; the audit 2026-11-20): no item carries a drop-rate buff (the four
       foods' were cut), so the engine's one drop factor beside Luck is the element weakness (drops.js DROP-BONUS). */
    const bad = Object.entries(M.ITEMS).filter(([, it]) => it && it.buff && (it.buff.type === 'drop_rate' || it.buff.type === 'magic_find')).map(([id]) => id);
    return bad.length ? 'a drop-rate buff on ' + bad.join(', ') : null;
  },
  L7(M) {
    const open = Object.values(M.G.OPEN_GROUNDS).concat(Object.values(M.G.OPEN_HALL_GROUNDS || {}));
    for (const g of open) {
      const floor = ((M.H.HUNT_INDEX[g.hunt] || {}).band || [0])[0];
      if (M.LC.rareCutPm(floor) !== 0) return `the open ground ${g.hunt} (floor ${floor}) cuts its Rares ${M.LC.rareCutPm(floor)} permille`;
    }
    const want = [[109, 0], [110, 150], [136, 150], [137, 160], [165, 170], [375, 250], [999, 250]];
    for (const [f, pm] of want) if (M.LC.rareCutPm(f) !== pm) return `a ground at Level ${f} cuts ${M.LC.rareCutPm(f)} permille, want ${pm}`;
    const at = (band) => M.D.effectiveDropChance({ id: 'x', ch: 0.01, band }, { rareCutPm: 150 });
    if (Math.abs(at('rare') - 0.0085) > 1e-15 || at('trophy') !== 0.01 || at('very_rare') !== 0.01 || at('scarce') !== 0.01) return 'the cut moves a band it must not, or misses the Rare: ' + ['rare', 'trophy', 'very_rare', 'scarce'].map(at).join(' ');
    return null;
  },
};

/* L8, on the real settle (the play fixture: the edge's accrueHunt over the one engine). */
async function L8(root) {
  const { loadPlay } = await import(pathToFileURL(join(root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const X = await loadPlay(root);
  const SPAN = 120 * 60000;
  const opts = (windowMs, mf) => ({ spanMs: SPAN, windowMs, magicFind: mf, secret: '-4611686018427387001' });
  const roles = ['tank', 'melee_dps', 'mage', 'healer'];
  const viewed = X.run('millrace_sewer', 8, roles, opts(30000, 100));
  const closed = X.run('millrace_sewer', 8, roles, opts(SPAN, 100));
  const dark = X.run('millrace_sewer', 8, roles, opts(SPAN, 0));
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  if (!viewed.totals.kills || viewed.totals.kills !== closed.totals.kills) return `the viewed and closed hunts killed ${viewed.totals.kills} and ${closed.totals.kills}`;
  if (sorted(viewed.items) !== sorted(closed.items)) return 'the hunt viewed and the browser closed paid different drops at Magic Find 100';
  if (sorted(viewed.heroRares) !== sorted(closed.heroRares)) return 'the hunt viewed and the browser closed revealed different Rares';
  const rare = (r) => Object.values(r.heroRares).flat().length;
  if (dark.totals.kills !== closed.totals.kills) return 'Magic Find moved the fight (kills ' + dark.totals.kills + ' vs ' + closed.totals.kills + ')';
  if (!(rare(closed) > rare(dark))) return `Magic Find 100 revealed ${rare(closed)} Rares in 2 h, Magic Find 0 ${rare(dark)} on the same dice: the server's number never reached the roll`;
  return null;
}

/* L9, the server: the replayed chain (tests/schema-replay.mjs) with 1040-luck.sql applied. */
async function L9() {
  const { bootReplay, closeReplays } = await import(pathToFileURL(join(ROOT, 'tests/schema-replay.mjs')).href);
  const { db } = await bootReplay();
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const u = '000000c0-0000-4000-a000-00000017c009';
  try {
    for (const [n, want] of [[0, 0], [1, 100], [10, 38500], [16, 149600], [100, 33835000]]) {
      const [r] = await q('select public.hr_luck_to_rank($1) as v', [n]);
      if (Number(r.v) !== want) return `L1 hr_luck_to_rank(${n}) = ${r.v}, want ${want}`;
    }
    for (let n = 1; n <= 100; n++) {
      const at = (100 * n * (n + 1) * (2 * n + 1)) / 6;
      const [r] = await q('select public.hr_luck_to_rank($1) as t, public.hr_luck_rank($2) as a, public.hr_luck_rank($3) as b', [n, at, at - 1]);
      if (Number(r.t) !== at || r.a !== n || r.b !== n - 1) return `L1 rank ${n}: to_rank ${r.t} (want ${at}), rank at it ${r.a}, a Luck short ${r.b}`;
    }
    const [far] = await q('select public.hr_luck_rank(1000000000000) as v');
    if (far.v !== 100) return 'L1 the far stop reads ' + far.v;
    await q("select set_config('request.jwt.claim.sub', $1, false)", [u]);
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q('insert into public.hr_access_allowlist (user_id, note) values ($1, $2) on conflict do nothing', [u, 'tests/luck.mjs']);
    const [c] = await q('select public.hr_create_character(0) as v');
    if (c.v.ok !== true) return 'L9 CONTROL: no hero: ' + JSON.stringify(c.v);
    await q('insert into public.account_luck (user_id, luck, from_kills, from_salvage) values ($1, $2, 0, $2)', [u, 149600]);
    await q("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'ring1', 'banded_signet_lucky'), ($1, 0, 'ring2', 'seam_jasper_band_lucky') on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id", [u]);
    await q("update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'luck'");
    const [off] = await q('select public.hr_magic_find_of($1, 0) as v, public.hr_luck_section($1, 0) as s', [u]);
    if (off.v !== 0 || off.s !== null) return `L9 dark: Magic Find ${off.v}, section ${JSON.stringify(off.s)}`;
    await q("update public.hr_feature_switches set scope = 'accounts', accounts = array[$1::uuid] where switch_id = 'luck'", [u]);
    const [on] = await q('select public.hr_magic_find_of($1, 0) as v', [u]);
    if (on.v !== 16 + 2) return `L9 on: Magic Find ${on.v}, want rank 16 + the larger ring's 2 (two Lucky rings count once)`;
    /* ...and the settle's engine inputs carry the same number (hr_hunt_member_state, the edge's only source of it); dark, 0 */
    const [ms] = await q("select (public.hr_hunt_member_state($1, 0)->>'magic_find')::int as v", [u]);
    if (ms.v !== on.v) return `L9 on: the member state carries Magic Find ${ms.v}, the account ${on.v}`;
    await q("update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'luck'");
    const [ms0] = await q("select (public.hr_hunt_member_state($1, 0)->>'magic_find')::int as v", [u]);
    if (ms0.v !== 0) return `L9 dark: the member state carries Magic Find ${ms0.v}`;
    return null;
  } finally { await closeReplays(); }
}

const MUTANTS = [
  { claim: 'L2', name: 'the Trophy ceiling is +30%', edits: [['src/data/luck.js', '  trophyMaxPm: 250,', '  trophyMaxPm: 300,']] },
  { claim: 'L3', name: 'Magic Find moves the Scarce rows too', edits: [['src/data/luck.js', "export const LUCK_FULL_BANDS = Object.freeze(['rare', 'very_rare']);", "export const LUCK_FULL_BANDS = Object.freeze(['rare', 'very_rare', 'scarce']);"]] },
  { claim: 'L3', name: 'no far stop on a forged Magic Find', edits: [['src/core/luck.js', 'return Number.isInteger(n) && n > 0 ? Math.min(MAGIC_FIND_MAX, n) : 0;', 'return Number.isInteger(n) && n > 0 ? n : 0;']] },
  { claim: 'L3', name: 'a guaranteed row is made more than certain', edits: [['src/core/drops.js', '  if (row.ch >= 1) return Math.min(1, row.ch);\n  const dropMult', '  if (row.ch >= 1 && !m.magicFind) return Math.min(1, row.ch);\n  const dropMult']] },
  { claim: 'L4', name: 'a raised row draws twice', edits: [['src/core/drops.js', '        const u = rng.next();', '        rng.next(); const u = rng.next();']] },
  { claim: 'L5', name: 'every raised hit says lucky', edits: [['src/core/drops.js', '        luckyHit = !(u < base);', '        luckyHit = true;']] },
  { claim: 'L6', name: 'the killer\'s Magic Find decides the roll', edits: [['src/core/hunt-rewards.js', 'magicFind: partyMagicFind(present.map((m) => m.magicFind)),', 'magicFind: partyMagicFind([lead.magicFind]),']] },
  { claim: 'L6', name: 'the party rolls on its average', edits: [['src/data/luck.js', "  party: 'highest',", "  party: 'average',"]] },
  { claim: 'L7', name: 'the cut starts at the Slake', edits: [['src/data/luck.js', 'bands: Object.freeze([[8, 110], [9, 137],', 'bands: Object.freeze([[8, 50], [9, 137],']] },
  { claim: 'L8', name: 'the member drops the server Magic Find', edits: [['src/core/member.js', 'magicFind: clampMagicFind(mi.magicFind),', 'magicFind: 0,']] },
  { claim: 'L10', name: 'Wheat Bread buffs drops again', edits: [['src/data/items.js', "    n:'Wheat Bread', icon:'🍞', v:120, heals:216, foodTier:1, foodClass:'healing',", "    n:'Wheat Bread', icon:'🍞', v:120, heals:216, foodTier:1, foodClass:'healing', buff:{type:'drop_rate', magnitude:1, durationMs:180000},"]] },
  { claim: 'L7', name: 'the cut takes the Trophies too', edits: [['src/core/drops.js', "const cut = band === 'rare' && Number.isInteger", "const cut = (band === 'rare' || band === 'trophy') && Number.isInteger"]] },
];

async function run(M, root) {
  const fails = [];
  for (const [k, fn] of Object.entries(claims)) {
    let why;
    try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    if (why) fails.push(k + ' ' + why);
  }
  const l8 = await L8(root).catch((e) => 'threw ' + (e && e.stack || e));
  if (l8) fails.push('L8 ' + l8);
  if (!PURE) { const l9 = await L9().catch((e) => 'threw ' + (e && e.stack || e)); if (l9) fails.push(l9.startsWith('L') ? l9 : 'L9 ' + l9); }
  return fails;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const mu of MUTANTS) {
      const p = plant(mu.edits, ['src', 'supabase/functions/hr-accrue', 'tests/_is-main.mjs', 'tests/hunt-core/fixtures']);
      try {
        let M;
        try { M = await load(p.root); } catch (e) { console.error('luck --mutate: HARNESS ' + mu.name + ': ' + e.message); process.exit(2); }
        let why;
        try { why = mu.claim === 'L8' ? await L8(p.root) : await claims[mu.claim](M); } catch (e) { why = 'threw ' + e.message; }
        if (why) console.log('  CAUGHT  ' + mu.name + ' -> ' + mu.claim + ': ' + why);
        else { console.error('  MISSED  ' + mu.name + ' (' + mu.claim + ')'); missed++; }
      } finally { p.done(); }
    }
    if (missed) { console.error(`luck --mutate: ${missed} of ${MUTANTS.length} missed`); process.exit(1); }
    console.log(`luck --mutate: ${MUTANTS.length} mutants, 0 missed`);
  } else {
    const fails = await run(await load(ROOT), ROOT);
    if (fails.length) { console.error('luck: RED\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
    console.log('luck: OK — the curve and the far stop on the server, a Trophy never under 100 h, Magic Find in one place on the right bands, one draw a roll, the lucky line, the party\'s highest whoever kills, the cut past Krell only, both paths pay alike' + (PURE ? '' : ', dark is 0 and two Lucky rings count once'));
  }
}
