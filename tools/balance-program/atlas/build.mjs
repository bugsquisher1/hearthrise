// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/build.mjs — THE ATLAS: every item, every way to get it, what each way costs, and the lists (50-standards 10.1).
//
//   buildAtlas({ D, rates, grid, kits, checkpoints }) -> atlas (the object sources.mjs writes as atlas.json)
//
// atlas = {
//   items:   { id: { n, type, slot, tier, reqLv, state (OPEN | STAGED | PLANNED | NONE), sources [sid], uses [label], best [[checkpoint, sid, days]] } }
//   sources: { sid: { kind, system, item, qty, state, opens, where, label, limit, chance, cost: { '<party>|<tier>': [[cp, hunted, rested, gold, days,
//              p10, p50, p90]] } | null, blank: { '<party>|<tier>': reason } } }   (a Level-free source prices one row at its opening checkpoint;
//              past a ground's band its top's rate holds: `heldPast`)
//   net:     { '<party>|<tier>': [[cp, net gold a 12 h day]] }   the buyer's own net gold a day, for "gold in days"
//   gear:    { '<low|bis>|<party>|<tier>': [[cp, kills x, XP x, net gold a hero-hour +, grid checkpoint read]] }   the progression grid's LOW
//            and BiS against MID (rates.mjs gridScale). Every cost above is MID; a drop's hunted hours in LOW or BiS are its MID hours over
//            the kills ratio, its gold the MID gold plus the net difference x its hours (the full tables would triple the file)
//   modifiers, town (T1 and the town table of 10.2), lists, bands
// }
// The reference seat of every list is a lone MID hero on Normal with 12 rested hours (A3, A6), and the four on its hardest tier beside it.
// ════════════════════════════════════════════════════════════════════════
import { townModel, TOWN_LEVELS, GATHER } from './town.mjs';
import { huntSources } from './sources-hunt.mjs';
import { townSources } from './sources-town.mjs';
import { makePricer } from './cost.mjs';
import { gridScale } from './rates.mjs';

const r3 = (x) => (x === null || x === undefined ? null : !Number.isFinite(x) ? null : Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 1000) / 1000);
const PARTY_SIZES = Object.freeze([1, 2, 3, 4]);
const HUNT_KINDS = new Set(['drop', 'boss', 'task']);
const NOT_A_WAY = (s) => s.kind === 'market' || s.useOnly || s.once || s.premium || s.byproduct;
/* the band a STAGED source is part of: stretch B (50-standards 1.2) opens staged rows past Level 110 */
const STAGED_FROM = 110;

export function buildAtlas({ D, rates, grid, kits, checkpoints, styles }) {
  const T = townModel(D);
  const hunt = huntSources(D);
  const sources = [...hunt.sources, ...townSources(D, T)];
  /* the staged gear rows (gear.mjs STAGED_GEAR): the design lanes' hidden pieces, priced at the Rare band's promise on their ground (PROJECTED) */
  const rare = D.BAND_TARGETS.rare.hours;
  for (const [id, s] of kits ? kits.staged : []) {
    if (!D.ITEMS[id]) D.ITEMS[id] = s.row;
    const g = D.HUNT_INDEX[s.ground];
    sources.push({ sid: 'planned:' + s.ground + ':' + id, kind: 'planned', system: 'uniques', item: id, qty: 1, state: g ? 'STAGED' : 'PLANNED', opens: g ? Math.max(1, g.band[0]) : 999,
      where: s.ground + ' (staged row, ' + s.from + ')', chance: true, label: 'PROJECTED: no drop row yet; the Rare band\'s promise ' + rare[0] + ' to ' + rare[1] + ' h a hero',
      gold: 0, promise: { hours: (rare[0] + rare[1]) / 2 } });
  }
  const P = makePricer({ D, sources, rates, grid });
  const SRC = new Map(sources.map((s) => [s.sid, s]));
  const groundTiers = (g) => ['normal', ...D.tiersOf(g).filter((t) => t !== 'normal')];
  /* a 'party' ground stays enterable alone (hunt-grounds.js groupFit): its lone cells are priced like any other */
  const lone = () => true;
  const cps = checkpoints;
  const ctxOf = (cp, party, tier) => ({ level: cp, party, tier, gear: 'mid', townH: 12, luckHours: 0 });

  /* ── prices ── */
  const out = {};
  const blanks = [];
  for (const s of sources) {
    const groundOf = s.hunt ? s.hunt.ground : s.fight ? s.fight.ground : s.task ? s.task.ground : s.hall ? 'krells_hold' : null;
    const h = groundOf && D.HUNT_INDEX[groundOf];
    const top = h ? h.band[1] : null;
    const atCps = s.state === 'PLANNED' && !s.promise ? [] : HUNT_KINDS.has(s.kind) || s.hall
      ? cps.filter((c) => c >= s.opens && (top === null || c <= Math.max(top, s.opens))).concat(cps.filter((c) => c >= s.opens).slice(0, 1))
      : cps.filter((c) => c >= s.opens);
    const cpsHere = [...new Set(atCps)].sort((a, b) => a - b);
    /* a Level-free source (a bench, the Shop, a chest) prices ONE row: the first checkpoint its inputs can all be had */
    const levelFree = !(HUNT_KINDS.has(s.kind) || s.hall);
    const cost = {}, blank = {};
    const tiers = groundOf && D.HUNT_GROUNDS[groundOf] && (s.hunt || s.task) ? groundTiers(groundOf) : ['normal'];
    for (const party of PARTY_SIZES) for (const tier of tiers) {
      if (party === 1 && groundOf && !lone(groundOf)) continue;
      const key = party + '|' + tier;
      const rows = [];
      for (const c of cpsHere) {
        const r = s.promise ? promiseCost(s, party) : P.route(s, ctxOf(c, party, tier));
        if (r.blank) { blank[key] = r.blank; continue; }
        rows.push([c, r3(r.hunted), r3(r.rested), r3(r.gold), r3(r.days), r3(r.p10), r3(r.p50), r3(r.p90)]);
        if (levelFree) { delete blank[key]; break; }
      }
      if (rows.length) cost[key] = rows;
    }
    if (s.state !== 'PLANNED' && !Object.keys(cost).length && cpsHere.length) blanks.push({ sid: s.sid, item: s.item, state: s.state, why: Object.values(blank)[0] || 'no context' });
    out[s.sid] = { kind: s.kind, system: s.system, item: s.item, qty: s.qty, state: s.state, opens: s.opens, where: s.where, label: s.label,
      limit: s.limit || null, chance: !!s.chance, heldPast: top, cost: Object.keys(cost).length ? cost : null, blank: Object.keys(blank).length ? blank : null };
  }
  function promiseCost(s, party) { const h = s.promise.hours / party; return { hunted: h, rested: 0, gold: 0, days: h / 12, p10: h / 12 * 0.105, p50: h / 12 * 0.693, p90: h / 12 * 2.303 }; }

  /* ── the buyer's own net gold a day ── */
  const net = {};
  for (const party of PARTY_SIZES) for (const tier of ['normal', 'dangerous', 'deadly']) {
    net[party + '|' + tier] = cps.map((c) => [c, r3(P.netPerDay(ctxOf(c, party, tier)))]).filter((x) => x[1] !== null && Number.isFinite(x[1]));
  }
  /* ── LOW and BiS against MID (the progression grid) ── */
  const gear = {};
  if (grid) for (const g of ['low', 'bis']) for (const party of PARTY_SIZES) for (const tier of ['normal', 'dangerous', 'deadly']) {
    const rows = cps.map((c) => { const s = gridScale(grid, { level: c, party, tier, gear: g }); return s.from === null ? null : [c, r3(s.kills), r3(s.xp), Math.round(s.netDelta), s.from]; }).filter(Boolean);
    if (rows.length) gear[g + '|' + party + '|' + tier] = rows;
  }

  /* ── items ── */
  /* the catalogue's uses (catalogue-coherence itemUses), plus two it does not list: a staged gear row is worn, a hall's key opens its hall */
  const uses = new Map(D.uses);
  const addUse = (id, label) => { const l = uses.get(id) || []; if (!l.includes(label)) uses.set(id, [...l, label]); };
  for (const id of Object.keys(D.ITEMS)) if (D.ITEMS[id] && D.ITEMS[id].slot && !uses.has(id)) addUse(id, 'worn');
  for (const h of Object.values(D.BOSS_HALLS)) addUse(h.key, 'opens ' + h.id + ' (a keyed hall)');
  const ids = new Set([...Object.keys(D.ITEMS), ...sources.map((s) => s.item)]);
  const items = {};
  const ref = (c) => ctxOf(c, 1, 'normal');
  for (const id of [...ids].sort()) {
    const it = D.ITEMS[id] || {};
    const mine = sources.filter((s) => s.item === id);
    const states = new Set(mine.filter((s) => s.kind !== 'market' && !s.useOnly).map((s) => s.state));
    const state = states.has('OPEN') ? 'OPEN' : states.has('STAGED') ? 'STAGED' : states.has('PLANNED') ? 'PLANNED' : 'NONE';
    const best = [];
    for (const c of cps) {
      const b = P.best(id, ref(c));
      if (b.best) best.push([c, b.best.sid, r3(b.best.days)]);
    }
    items[id] = { n: it.n || id, type: it.type || (id.startsWith('temper:') ? 'upgrade' : id.startsWith('lining:') ? 'upgrade' : null), slot: it.slot || null, tier: it.tier || null,
      reqLv: it.reqLv || null, state, sources: mine.map((s) => s.sid), uses: uses.get(id) || (id.startsWith('temper:') || id.startsWith('lining:') ? ['worn power (an upgrade)'] : []), best: compress(best) };
  }

  /* ── the lists ── */
  const declared = new Map();
  for (const id of D.AWAITING_ROSTER) declared.set(id, 'AWAITING_ROSTER');
  for (const [fate, list] of Object.entries(D.UNREACHABLE)) for (const id of list) declared.set(id, 'UNREACHABLE.' + fate);
  const realItem = (id) => !!D.ITEMS[id] && !id.includes(':');
  const noSource = Object.keys(items).filter((id) => realItem(id) && items[id].state !== 'OPEN')
    .map((id) => ({ id, n: items[id].n, state: items[id].state, declared: declared.get(id) || (items[id].state === 'STAGED' ? 'STAGED content (behind its switch or its staged ground)' : items[id].state === 'PLANNED' ? 'PLANNED (not built)' : null) }));
  const noUse = Object.keys(items).filter((id) => items[id].state !== 'NONE' && !(items[id].uses || []).length).map((id) => ({ id, n: items[id].n, sources: items[id].sources.length }));
  const ways = (id) => items[id].sources.filter((sid) => { const s = out[sid]; return s && s.state === 'OPEN' && !NOT_A_WAY(SRC.get(sid) || {}); });
  const oneWay = Object.keys(items).filter((id) => realItem(id) && ways(id).length === 1).map((id) => ({ id, n: items[id].n, via: ways(id)[0] }));
  const unmakeable = sources.filter((s) => s.kind === 'recipe' && out[s.sid].cost === null && s.state === 'OPEN')
    .map((s) => ({ sid: s.sid, item: s.item, why: (out[s.sid].blank && Object.values(out[s.sid].blank)[0]) || 'unpriced' }));
  const sourcesUnused = sources.filter((s) => !NOT_A_WAY(s) && items[s.item] && !(items[s.item].uses || []).length).map((s) => s.sid);
  /* A6: each piece with two or more priced ways, slowest over fastest at the first checkpoint both are priced (the reference seat; `a6bis`
     the same seat in BiS, where the grid's kill ratio speeds every drop and nothing else) */
  const a6Of = (gearState) => {
    const list = [];
    for (const id of Object.keys(items)) {
      if (!realItem(id)) continue;
      /* at the Level the piece is worn from (a ring made at Level 1 is no way to a ring nobody can wear) */
      for (const c of cps.filter((x) => x >= (Number(items[id].reqLv) || 1))) {
        const b = P.best(id, { ...ref(c), gear: gearState });
        const priced = b.all.filter((x) => !NOT_A_WAY(SRC.get(x.sid) || {}) && x.days > 0);
        if (priced.length < 2) continue;
        list.push({ id, cp: c, ratio: r3(priced[priced.length - 1].days / priced[0].days), fastest: priced[0].sid, slowest: priced[priced.length - 1].sid });
        break;
      }
    }
    return list.sort((a, b) => b.ratio - a.ratio);
  };
  const a6 = a6Of('mid'), a6bis = grid ? a6Of('bis') : [];

  /* ── A4, A5: the kits ── */
  const a4 = [], a5 = [];
  if (kits) for (const style of styles) for (const c of cps.filter((x) => x <= 185)) {
    const mid = kits.kitFor(c, 'mid', style);
    for (const [slot, id] of Object.entries(mid.slots)) {
      const inside = (items[id] ? items[id].sources : []).some((sid) => {
        const s = out[sid]; if (!s || (s.state !== 'OPEN' && !(s.state === 'STAGED' && c >= STAGED_FROM))) return false;
        const src = SRC.get(sid) || {};
        if (src.once) return true;   // the start kit
        if (['recipe', 'shop', 'gather', 'farm', 'hallmark', 'temper', 'chest'].includes(s.kind) && !NOT_A_WAY(src)) return true;
        const g = sid.split(':')[1];
        const h = D.HUNT_INDEX[g] || D.HUNT_INDEX[(D.BOSS_HALLS[g] || {}).hunt];
        return !!h && h.band[0] <= c && c <= h.band[1];
      });
      if (!inside) a4.push({ cp: c, style, slot, id });
    }
    if (c >= 30) {
      const bis = kits.kitFor(c, 'bis', style);
      const kinds = new Set();
      for (const id of Object.values(bis.slots)) {
        const b = P.best(id, ref(c));
        const k = b.best ? b.best.kind : null;
        kinds.add(k === 'drop' || k === 'planned' ? 'dropped' : k === 'recipe' || k === 'hallmark' ? 'crafted' : k === 'chest' || k === 'boss' ? 'won' : k === 'shop' ? 'bought' : 'none');
      }
      const missing = ['dropped', 'crafted', 'won'].filter((k) => !kinds.has(k));
      if (missing.length) a5.push({ cp: c, style, missing });
    }
  }

  /* ── the town on the 12 hour day (10.2), T1 ── */
  const townSkills = [...Object.keys(GATHER), ...Object.keys(D.RECIPES)];
  const town = {};
  for (const skill of townSkills) {
    let bench = null, chain = null;
    try { bench = T.hoursTo99(skill); chain = GATHER[skill] ? null : T.hoursTo99(skill, { chain: true }); } catch { /* a skill the XP table does not know (a selftest's planted bench) */ }
    town[skill] = { hoursTo: bench ? Object.fromEntries(Object.entries(bench.to).map(([k, v]) => [k, r3(v)])) : null,
      chainHoursTo: chain ? Object.fromEntries(Object.entries(chain.to).map(([k, v]) => [k, r3(v)])) : null,
      daysTo99: { at12: bench ? r3(bench.to[99] / 12) : null, at4: bench ? r3(bench.to[99] / 4) : null },
      chainDaysTo99: { at12: chain ? r3(chain.to[99] / 12) : null, at4: chain ? r3(chain.to[99] / 4) : null },
      atLevels: TOWN_LEVELS.map((lv) => {
        const n = GATHER[skill] ? T.nodes.filter((x) => x.skill === skill && x.req <= lv).sort((a, b) => b.xpPerHour - a.xpPerHour)[0] : T.recipes.filter((x) => x.skill === skill && x.req <= lv).sort((a, b) => b.xpPerHour - a.xpPerHour)[0];
        return n ? { level: lv, row: n.id, xpPerHour: r3(n.xpPerHour), unitsPerHour: r3(n.perHour || (3600 / n.benchSec) * (n.outQty || 1)), inputs: n.inputs || null } : { level: lv, row: null };
      }) };
  }

  const reachable = sources.filter((s) => s.state === 'OPEN');
  const bands = {
    A1: { measured: noSource.length, undeclared: noSource.filter((x) => !x.declared).length, note: 'items with no OPEN source; declared = on AWAITING_ROSTER or UNREACHABLE (the data allows ' + D.UNREACHABLE_CEILING + ' outside staged)' },
    A2: { measured: noUse.length, sources: sourcesUnused.length },
    A3: { measured: blanks.filter((b) => b.state === 'OPEN').length, of: reachable.length },
    A4: { measured: kits ? a4.length : null, note: 'MID slots (checkpoint x style x slot, Levels 1 to 185) with no source inside the band\'s own grounds or the town' },
    A5: { measured: kits ? a5.length : null, note: 'BiS kits from Level 30 missing a dropped, a crafted or a won piece (by each piece\'s cheapest route)' },
    A6: { over3: a6.filter((x) => x.ratio > 3).length, over5: a6.filter((x) => x.ratio > 5).length, of: a6.length,
      bis: grid ? { over3: a6bis.filter((x) => x.ratio > 3).length, over5: a6bis.filter((x) => x.ratio > 5).length, of: a6bis.length } : null },
    A7: { measured: null, note: 'read by paths.mjs (a skill\'s products on the best paths by level)' },
    T1: Object.fromEntries(Object.entries(town).map(([k, v]) => [k, v.chainDaysTo99.at12 ?? v.daysTo99.at12])),
    T1at4: Object.fromEntries(Object.entries(town).map(([k, v]) => [k, v.chainDaysTo99.at4 ?? v.daysTo99.at4])),
    T1benchOnly: Object.fromEntries(Object.entries(town).map(([k, v]) => [k, v.daysTo99.at12])),
    T7: { measured: null, note: 'read by paths.mjs (rested hours the best path wants a day)' },
  };
  return { items, sources: out, net, gear, modifiers: hunt.modifiers, town, lists: { noSource, noUse, sourcesUnused, noCost: blanks, oneWay, unmakeable, a4, a5, a6, a6bis }, bands,
    counts: { items: Object.keys(items).length, realItems: Object.keys(items).filter(realItem).length, sources: sources.length, open: reachable.length,
      byKind: countBy(sources, (s) => s.kind), byState: countBy(sources, (s) => s.state) }, _pricer: P, _sources: sources };
}

const countBy = (list, f) => list.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
/* [[cp, sid, days]...] -> runs of one sid kept as [fromCp, sid, days at fromCp] */
function compress(best) {
  const out = [];
  for (const row of best) if (!out.length || out[out.length - 1][1] !== row[1]) out.push(row);
  return out;
}
