#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/endgame.mjs — THE ENDGAME DIVE'S MEASURES (balance program 22, lane/d-balance-endgame, 2026-11-20).
// A measuring tool: it grades nothing and writes nothing under src/. Words: docs/design/balance-program/22-endgame.md.
//
//   node tools/balance-program/endgame.mjs rows
//        NO PLAY. The chest's gear as the catalogue holds it: every Tower weapon and Catacomb piece beside its tier's standard twin.
//   node tools/balance-program/endgame.mjs chest [--weeks 26]
//        NO PLAY. The Hearth Chest's odds as arithmetic on src/data/chests.js: the chance a key finds gear with the warmth, weeks to
//        the first piece, to THE piece of your own family, and to every piece of a key, at 6 opens a week (one hero) and 24 (four
//        heroes feeding one), with and without the three stokes. Monte Carlo, 20,000 lives a row, seeded.
//   node tools/balance-program/endgame.mjs climb [--levels 10,30,50,60,80,105] [--who four,hammer,mage] [--seeds 2] [--minutes 90] [--from 1|level|best]
//        PLAY (the real settle, tools/balance-sim/tower-curve.mjs measure). A played party at each Level climbs the Tower: top floor,
//        minutes, Level XP an hour a head, keys a climb by metal. --from level starts on the landing at or under the Level;
//        --ground unmarked_bone_wing | unmarked_flooded_wing plays a Catacomb wing instead.
//   node tools/balance-program/endgame.mjs scaled [--levels 50,80,110]
//        NO PLAY. A scaled hour's price and what a scaled kill pays against the right-Level ground, from src/data/scaled-hunts.js.
//
// Exit 0 when it ran, 2 on a bad argument.
// ════════════════════════════════════════════════════════════════════════
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];

/* a small seeded generator (mulberry32): the chest table is the same on every run */
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

async function rows() {
  const { ITEMS } = await import(u('src/data/items.js'));
  const { CHEST_KEYS, CATACOMB_KEYS } = await import(u('src/data/chests.js'));
  const { CATACOMB_ARMOR } = await import(u('src/data/catacomb-armor.js'));
  const pick = (it) => it && Object.fromEntries(['tier', 'reqLv', 'atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'defB', 'meleePlus', 'rangedPlus', 'magicPlus', 'defensePlus', 'resistPm', 'steadyPm', 'v']
    .filter((k) => it[k] !== undefined).map((k) => [k, it[k]]));
  console.log('TOWER WEAPONS (key | family | id | row):');
  for (const k of CHEST_KEYS) for (const [fam, id] of Object.entries(k.weapons)) console.log([k.id, fam, id, JSON.stringify(pick(ITEMS[id]))].join(' | '));
  console.log('\nCATACOMB ARMOR (key | slot:weight | id | row | twin row):');
  for (const p of CATACOMB_ARMOR) console.log([p.key, p.slot + ':' + p.weight, p.id, JSON.stringify(pick(ITEMS[p.id])), p.twin + ' ' + JSON.stringify(pick(ITEMS[p.twin]))].join(' | '));
  console.log('\nKEYS (id | family | from | gear ‰ | tier | +skill | cinders | salts | food):');
  for (const k of [...CHEST_KEYS, ...CATACOMB_KEYS]) console.log([k.id, k.family, k.from, k.weaponPm, k.weaponTier, k.skillPlus, k.cinders, k.saltsQty, k.foodQty + ' ' + k.food].join(' | '));
}

async function chest() {
  const { CHEST_KEYS, CHEST_LUCK, chestChancePpm, stokeCost } = await import(u('src/data/chests.js'));
  const weeks = Number(arg('weeks', 26)), LIVES = 20000;
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  console.log(`THE HEARTH CHEST, one key tier opened every week (src/data/chests.js; ${LIVES} lives a row, seeded). Weeks: median / 90th.`);
  console.log('| Key | Opens a week | Stoke | First piece | Your own family\'s piece | All seven of the key | Pieces in ' + weeks + ' weeks (mean) | Cinders a week in / stoke cost a week |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const k of CHEST_KEYS) for (const opens of [6, 24]) for (const stoke of [0, 3]) {
    const r = rng(1000 + k.from * 7 + opens * 3 + stoke);
    const fams = Object.keys(k.weapons);
    const first = [], own = [], all = [], got = [];
    for (let life = 0; life < LIVES; life++) {
      let dry = 0, n = 0, tFirst = null, tOwn = null, tAll = null, within = 0;
      const have = new Set();
      for (let i = 1; i <= 6000 && tAll === null; i++) {
        const p = chestChancePpm(k, dry, stoke, CHEST_LUCK) / 1e6;
        if (r() < p) {
          dry = 0; n++;
          /* own family half the time, the rest spread evenly over the others (CHEST_LUCK.ownPm) */
          const f = r() < CHEST_LUCK.ownPm / 1000 ? fams[0] : fams[1 + Math.floor(r() * (fams.length - 1))];
          have.add(f);
          const wk = i / opens;
          if (tFirst === null) tFirst = wk;
          if (tOwn === null && f === fams[0]) tOwn = wk;
          if (have.size === fams.length) tAll = wk;
          if (wk <= weeks) within++;
        } else dry++;
      }
      first.push(tFirst ?? 9999); own.push(tOwn ?? 9999); all.push(tAll ?? 9999); got.push(within);
    }
    const f1 = (a) => q(a, 0.5).toFixed(1) + ' / ' + q(a, 0.9).toFixed(1);
    const cost = stoke ? stokeCost(k, stoke, CHEST_LUCK) : 0;
    console.log(`| ${k.name} | ${opens} | ${stoke ? 'x' + (CHEST_LUCK.stokes[stoke - 1].pm / 1000) : 'none'} | ${f1(first)} | ${f1(own)} | ${f1(all)} | ${(got.reduce((s, n) => s + n, 0) / LIVES).toFixed(2)} | ${k.cinders * opens} / ${cost * opens} |`);
  }
  console.log('\nA STOKE NEEDS MORE CINDERS THAN ITS OWN KEY PAYS: stoke 1 costs ' + CHEST_LUCK.stokes.map((s) => s.keys).join(' / ') + ' keys\' worth of Cinders (x' + CHEST_LUCK.stokes.map((s) => s.pm / 1000).join(' / x') + ').');
  console.log('So one in ' + (CHEST_LUCK.stokes[0].keys + 1) + ' keys can be stoked once from the chest\'s own Cinders, one in ' + (CHEST_LUCK.stokes[2].keys + 1) + ' three times.');
}

async function climb() {
  const { measure, keysOf } = await import(u('tools/balance-sim/tower-curve.mjs'));
  const { keyForLanding, HEARTH_CHEST_KEYS } = await import(u('src/data/chests.js'));
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const BS = await import(u('src/data/balance-sheet.js'));
  const R = await loadCellRunner(ROOT);
  const ground = arg('ground', 'the_burning_tower');
  const levels = arg('levels', '10,30,50,60,80,105').split(',').map(Number);
  const who = arg('who', 'four,hammer,mage').split(',');
  const seeds = Number(arg('seeds', 2)), minutes = Number(arg('minutes', 90)), fromArg = arg('from', '1');
  const PARTY = { four: ['tank', 'healer', 'bow', 'mage'], hammer: ['hammer'], mage: ['mage'], healer: ['healer'], bow: ['bow'], tank: ['tank'] };
  console.log(`CLIMB on ${ground}: a played party from ${fromArg}, ${seeds} seed(s), ${minutes} min at most.`);
  console.log('| Level | Who | From | Top floor (each) | Past its Level | Ended | Minutes | Level XP an hour a head | x the pace contract | Keys a climb, a hero |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const L of levels) for (const w of who) {
    const from = fromArg === 'level' ? Math.max(0, Math.floor(L / 10) * 10) + 1 : Number(fromArg);
    let climbs;
    try {
      climbs = [];
      for (let s = 0; s < seeds; s++) {
        const cell = { id: 'EG:' + ground + ':' + L + ':' + w + ':' + s, ground, tower: { floor: from }, hours: minutes / 60, seeds: 1, seedBase: s, windowMs: 30000,
          party: PARTY[w], level: L, profile: 'played', supply: 'own', gear: { uniques: true } };
        const res = R.runCell(cell);
        const t = res.party.tower;
        const ended = res.heroes.map((h) => Object.keys(h.ended || {})[0] || 'time');
        climbs.push({ top: t.top === null ? t.from - 1 : t.top, from: t.from, cleared: t.cleared, ended: ended.includes('died') ? 'died' : ended[0], minutes: Math.round(res.party.hours * 600) / 10,
          xp: res.heroes.reduce((n, h) => n + h.levelXpPerH, 0) / res.heroes.length });
      }
    } catch (e) { console.log(`| ${L} | ${w} | ${from} | ERROR ${String(e.message).slice(0, 120)} |`); continue; }
    const keyOf = (f) => keyForLanding(f, HEARTH_CHEST_KEYS, ground);
    const xp = climbs.reduce((n, c) => n + c.xp, 0) / climbs.length;
    console.log(`| ${L} | ${w} | ${from} | ${climbs.map((c) => c.top).join(' / ')} | ${climbs.map((c) => (c.top - L >= 0 ? '+' : '') + (c.top - L)).join(' / ')} | ${climbs.map((c) => c.ended).join(' / ')} | ${climbs.map((c) => c.minutes).join(' / ')} | ${Math.round(xp).toLocaleString('en-US')} | ${(xp / BS.contractXpPerH(L)).toFixed(2)} | ${climbs.map((c) => Object.entries(keysOf(c, keyOf)).map(([k, n]) => n + ' ' + k).join(' + ') || 'none').join(' / ')} |`);
  }
  void measure;
}

async function account() {
  const { CHEST_KEYS, CHEST_LUCK, chestChancePpm } = await import(u('src/data/chests.js'));
  const LIVES = Number(arg('lives', 8000));
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const FAMS = ['sword', 'warhammer', 'bow', 'staff', 'wand', 'hatchets', 'crossbow'], WEIGHTS = ['heavy', 'medium', 'light'];
  const PARTY = [{ fam: 'sword', w: 'heavy' }, { fam: 'staff', w: 'light' }, { fam: 'bow', w: 'medium' }, { fam: 'wand', w: 'light' }];
  console.log(`WEEKS TO FINISH A KEY TIER (${LIVES} lives a row; median / 90th), 6 opens a family a hero a week, no stoke, pieces shared inside the account.`);
  console.log('| Key | Who | Own weapon each (Tower) | Own helmet and boots each (Catacombs) | Both |');
  console.log('|---|---|---|---|---|');
  for (const k of CHEST_KEYS) for (const who of [PARTY, PARTY.slice(0, 1)]) {
    const r = rng(77 + k.from + who.length);
    const tW = [], tA = [], tB = [];
    for (let life = 0; life < LIVES; life++) {
      const needW = {}; for (const h of who) needW[h.fam] = (needW[h.fam] || 0) + 1;
      const needA = {}; for (const h of who) for (const s of ['helmet', 'boots']) needA[s + ':' + h.w] = (needA[s + ':' + h.w] || 0) + 1;
      const dryT = who.map(() => 0), dryC = who.map(() => 0);
      let wk = 0, doneW = null, doneA = null;
      const left = (o) => Object.values(o).reduce((s, n) => s + n, 0);
      while ((doneW === null || doneA === null) && wk < 2000) {
        wk++;
        who.forEach((h, i) => {
          for (let o = 0; o < 6; o++) {
            if (doneW === null) {
              if (r() < chestChancePpm(k, dryT[i], 0, CHEST_LUCK) / 1e6) {
                dryT[i] = 0;
                const others = FAMS.filter((f) => f !== h.fam);
                const f = r() < CHEST_LUCK.ownPm / 1000 ? h.fam : others[Math.floor(r() * others.length)];
                if (needW[f] > 0) needW[f]--;
              } else dryT[i]++;
            }
            if (doneA === null) {
              /* the wing whose lean is the slot this hero's own weight still lacks, helmets first */
              const wantHelm = needA['helmet:' + h.w] > 0 || !(needA['boots:' + h.w] > 0) && Object.keys(needA).some((x) => x.startsWith('helmet') && needA[x] > 0);
              if (r() < chestChancePpm(k, dryC[i], 0, CHEST_LUCK) / 1e6) {
                dryC[i] = 0;
                const slot = r() < (wantHelm ? 0.7 : 0.3) ? 'helmet' : 'boots';
                const others = WEIGHTS.filter((x) => x !== h.w);
                const w = r() < CHEST_LUCK.ownPm / 1000 ? h.w : others[Math.floor(r() * others.length)];
                if (needA[slot + ':' + w] > 0) needA[slot + ':' + w]--;
              } else dryC[i]++;
            }
          }
        });
        if (doneW === null && left(needW) === 0) doneW = wk;
        if (doneA === null && left(needA) === 0) doneA = wk;
      }
      tW.push(doneW ?? 2000); tA.push(doneA ?? 2000); tB.push(Math.max(doneW ?? 2000, doneA ?? 2000));
    }
    const f = (a) => q(a, 0.5) + ' / ' + q(a, 0.9);
    console.log(`| ${k.name.replace(' Key', '')} | ${who.length === 4 ? 'the own four' : 'one hero'} | ${f(tW)} | ${f(tA)} | ${f(tB)} |`);
  }
}

const run = { rows, chest, climb, account }[mode];
if (!run) { console.error('usage: endgame.mjs rows | chest | climb | scaled   (see this file\'s header)'); process.exit(2); }
await run();
