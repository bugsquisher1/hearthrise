#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/slot-price-guard.mjs — THE FIRST HERO SLOT STAYS WITHIN WHAT ONE LONE HERO HAS BANKED, PLAYED (Tyler 2026-11-20, balance call 24-9:
//   "i think hero slots should cost even more"; the designer's guard, docs/design/balance-program/24-economy.md "Q9 after Tyler's ruling";
//   the balance gate G9 in 30-plan.md §E, red in L06; the plan audit's M4: the bank comes from a PLAYED life, never a typed table).
//
// The second hero is the door from the lone game to the party game, so its price may rise only as far as one hero alone has banked when
// it reaches the Level the party grounds open (src/data/hunts.js `coppercap_warrens` band[0], 32 today). THE BANK IS PLAYED: the net gold
// (coin + loot sold - store bill) of a lone hammer on the advised grounds, every supply bought, on the real engine:
//   node tools/balance-sim/life.mjs --party hammer --policy rec --to <floor + 2> --max 110        (about 30 s; 445,371 at Level 32 today)
// THE CACHE AND ITS REFRESH: tests/slot-price-guard.played.json holds the last measure, keyed by a digest of everything the life reads
// (src/core, src/data, tools/balance-sim, the Hunts window's advice; version stamps left out). When the digest moves, the plain run plays the
// life again on the spot and judges that (so a re-cut income, a moved ground or a new engine is never judged on an old bank); `--write` stores
// the new measure. The later slots climb freely.
//   SP-1  src/data/shops.js sells the three slots (character_slot.1-.3), each for gold alone, each dearer than the one before
//   SP-2  the first (the second hero) costs at most the played bank at the party grounds' floor
//
//   node tests/slot-price-guard.mjs              the guard
//   node tests/slot-price-guard.mjs --write      play the life and store it (the refresh)
//   node tests/slot-price-guard.mjs --selftest   every planted defect must turn it red ([mutants] protocol; HR_MUTANT_CONTROL=1 plants nothing)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { HUNTS } from '../src/data/hunts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tests', 'slot-price-guard.played.json');
/** The ground whose floor opens the party game (24-economy.md Q9: "the Level the party grounds open (Coppercap Warrens, 32)"). */
export const PARTY_GROUND = 'coppercap_warrens';
const floorOf = (hunts) => {
  const g = hunts.find((h) => h && h.id === PARTY_GROUND);
  return g && Array.isArray(g.band) && Number.isInteger(g.band[0]) && g.band[0] >= 1 ? g.band[0] : null;
};
const lifeArgs = (floor) => ['tools/balance-sim/life.mjs', '--party', 'hammer', '--policy', 'rec', '--to', String(floor + 2), '--max', '110'];

/** A digest of everything the played life reads, version stamps left out (a bump moves no gold). */
export function inputsDigest(root = ROOT) {
  const files = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isFile()) { files.push(rel); return; }
    for (const n of readdirSync(abs).sort()) walk(rel + '/' + n);
  };
  for (const d of ['src/core', 'src/data', 'tools/balance-sim', 'src/shell/hunt-list.js']) walk(d);
  const h = createHash('sha256');
  for (const f of files.filter((x) => /\.(m?js|json)$/.test(x))) h.update(f + '\0' + readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n').replace(/\?v=\d+\.\d+\.\d+/g, '') + '\0');
  return h.digest('hex');
}

/** Play the life on the real engine: { L: { h, net } } for every Level it reached. */
export function playLife(floor) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-slot-life-'));
  try {
    const out = join(dir, 'life.json');
    const r = spawnSync(process.execPath, [...lifeArgs(floor), '--out', out], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0 || !existsSync(out)) throw Object.assign(new Error('the played life did not run: ' + (r.stderr || r.stdout || '').slice(-400)), { harness: true });
    const j = JSON.parse(readFileSync(out, 'utf8'));
    const banks = {};
    for (const [k, m] of Object.entries(j.miles || {})) {
      const [seat, L] = k.split(':').map(Number);
      if (seat === 0 && m && m.bank) banks[L] = { h: m.h, net: m.bank.coin + m.bank.loot - m.bank.store };
    }
    return { hours: j.hours, banks };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The played banks to judge by, from the cache when nothing it read has moved, else played on the spot. */
export function playedBanks(floor) {
  const digest = inputsDigest();
  const c = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
  if (c && c.digest === digest && c.floor === floor && c.banks) return { banks: c.banks, how: `the cache (measured ${c.measured})`, fresh: false, digest };
  const p = playLife(floor);
  return { banks: p.banks, how: c ? `played now: the inputs moved since the cache (${c.measured}); --write stores it` : 'played now: no cache; --write stores it', fresh: true, digest, hours: p.hours };
}

/** The problems with a slot ladder against the played bank, as sentences. Empty = green. Pure. */
export function problemsOf({ offers = SHOP_OFFERS, hunts = HUNTS, banks }) {
  const out = [];
  const slots = offers.filter((o) => o && o.table === 'character_slot');
  const ids = slots.map((o) => o.id).sort();
  if (ids.join() !== 'character_slot.1,character_slot.2,character_slot.3') out.push(`SP-1: src/data/shops.js sells hero slots ${ids.join(', ') || 'none'}, not character_slot.1-.3`);
  const gold = (id) => {
    const o = slots.find((x) => x.id === id);
    const c = o && Array.isArray(o.cost) ? o.cost : [];
    return c.length === 1 && c[0].kind === 'currency' && c[0].id === 'gold' && Number.isSafeInteger(c[0].amount) && c[0].amount > 0 ? c[0].amount : null;
  };
  const prices = [1, 2, 3].map((i) => gold('character_slot.' + i));
  prices.forEach((p, i) => { if (p === null) out.push(`SP-1: character_slot.${i + 1} is not priced in gold alone`); });
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] !== null && prices[i - 1] !== null && !(prices[i] > prices[i - 1])) out.push(`SP-1: character_slot.${i + 1} (${prices[i]}) is not dearer than character_slot.${i} (${prices[i - 1]})`);
  }
  const floor = floorOf(hunts);
  if (floor === null) { out.push(`SP-2: src/data/hunts.js has no ${PARTY_GROUND} with a Level floor: the guard has no line to hold`); return out; }
  const at = banks && banks[floor];
  const line = at && Number.isSafeInteger(at.net) ? at.net : null;
  if (!(line > 0)) { out.push(`SP-2: the played life has no bank at Level ${floor} (${JSON.stringify(at)}): play it again with --write`); return out; }
  if (prices[0] !== null && prices[0] > line) {
    out.push(`SP-2: the second hero costs ${prices[0].toLocaleString('en-US')} gold, over the ${line.toLocaleString('en-US')} one lone hero has banked, played, `
      + `on reaching Level ${floor} (the ${PARTY_GROUND} floor, ${at.h} h): the lone game would end in the price, not the party (Tyler 2026-11-20, call 24-9)`);
  }
  return out;
}

const slotAt = (offers, id, amount) => offers.map((o) => (o.id === id ? { ...o, cost: [{ kind: 'currency', id: 'gold', amount }] } : o));
const floorNow = floorOf(HUNTS);
/** Each planted defect, as an input to problemsOf on the played banks `b`. */
export const MUTANTS = Object.freeze({
  first_slot_over_played: { why: 'the second hero one gold over what the played lone hero has banked at the party floor', in: (b) => ({ banks: b, offers: slotAt(SHOP_OFFERS, 'character_slot.1', b[floorNow].net + 1) }) },
  first_slot_ladder_b: { why: 'the second hero at ladder B (600,000)', in: (b) => ({ banks: b, offers: slotAt(SHOP_OFFERS, 'character_slot.1', 600000) }) },
  income_recut: { why: 'income re-cut by a third, the price left where it was', in: (b) => ({ banks: Object.fromEntries(Object.entries(b).map(([L, x]) => [L, { ...x, net: Math.floor(x.net * 2 / 3) }])) }) },
  party_ground_earlier: { why: 'the Warrens open at Level 25, under the bank the slot was sized on', in: (b) => ({ banks: b, hunts: HUNTS.map((h) => (h.id === PARTY_GROUND ? { ...h, band: [25, h.band[1]] } : h)) }) },
  party_ground_gone: { why: 'the Warrens leave the data: no line to hold', in: (b) => ({ banks: b, hunts: HUNTS.filter((h) => h.id !== PARTY_GROUND) }) },
  no_played_bank: { why: 'the played life stops short of the party floor', in: (b) => ({ banks: Object.fromEntries(Object.entries(b).filter(([L]) => Number(L) < floorNow)) }) },
  ladder_falls: { why: 'the fourth hero cheaper than the third', in: (b) => ({ banks: b, offers: slotAt(SHOP_OFFERS, 'character_slot.3', 1000000) }) },
  slot_in_crowns: { why: 'a slot priced in something other than gold', in: (b) => ({ banks: b, offers: SHOP_OFFERS.map((o) => (o.id === 'character_slot.2' ? { ...o, cost: [{ kind: 'currency', id: 'gems', amount: 500 }] } : o)) }) },
  slot_missing: { why: 'the third hero is no longer sold', in: (b) => ({ banks: b, offers: SHOP_OFFERS.filter((o) => o.id !== 'character_slot.2') }) },
});

function selftest() {
  const p = playedBanks(floorNow);
  const clean = problemsOf({ banks: p.banks });
  if (clean.length) { console.error('slot-price-guard --selftest: the tree is not green:\n  ' + clean.join('\n  ')); return 2; }
  const control = process.env.HR_MUTANT_CONTROL === '1';
  const ids = Object.keys(MUTANTS);
  console.log(`[mutants] ${ids.length}`);
  let missed = 0;
  for (const id of ids) {
    const hit = problemsOf(control ? { banks: p.banks } : MUTANTS[id].in(p.banks)).length > 0;
    console.log(`[mutant] ${id} ${hit ? 'caught' : 'survived'}`);
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${id}: ${MUTANTS[id].why}`);
    if (!hit && !control) missed++;
  }
  if (control) { console.log('slot-price-guard --selftest: control, nothing planted'); return 0; }
  if (missed) { console.error(`slot-price-guard --selftest: ${missed} of ${ids.length} planted defects stayed green`); return 1; }
  console.log(`slot-price-guard --selftest: ${ids.length}/${ids.length} planted defects caught (banks from ${p.how})`);
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.includes('--selftest')) process.exit(selftest());
    if (floorNow === null) { console.error('slot-price-guard RED:\n  SP-2: no ' + PARTY_GROUND + ' floor in src/data/hunts.js'); process.exit(1); }
    if (process.argv.includes('--write')) {
      const live = playLife(floorNow);
      const rec = { measured: new Date().toISOString().slice(0, 10), by: 'node ' + lifeArgs(floorNow).join(' '), digest: inputsDigest(), floor: floorNow, hours: live.hours, banks: live.banks,
        note: 'The played lone hero\'s net gold (coin + loot sold - store bill) on reaching each Level. Refreshed by node tests/slot-price-guard.mjs --write; the guard plays it again whenever the digest moves.' };
      writeFileSync(CACHE, JSON.stringify(rec, null, 1) + '\n');
      console.log(`slot-price-guard --write: ${live.banks[floorNow] ? live.banks[floorNow].net.toLocaleString('en-US') : 'no'} gold at Level ${floorNow} (${live.hours.toFixed(1)} h played) -> tests/slot-price-guard.played.json`);
      process.exit(0);
    }
    const p = playedBanks(floorNow);
    const problems = problemsOf({ banks: p.banks });
    if (problems.length) { console.error('slot-price-guard RED (banks from ' + p.how + '):\n  ' + problems.join('\n  ')); process.exit(1); }
    console.log(`slot-price-guard: green. The second hero costs ${SHOP_OFFERS.find((o) => o.id === 'character_slot.1').cost[0].amount.toLocaleString('en-US')} gold, within the `
      + `${p.banks[floorNow].net.toLocaleString('en-US')} one lone hero has banked, played, on reaching Level ${floorNow} (${p.banks[floorNow].h} h; ${p.how}); the ladder climbs.`);
  } catch (e) {
    console.error('slot-price-guard: HARNESS ' + String(e && e.message || e));
    process.exit(2);
  }
}
