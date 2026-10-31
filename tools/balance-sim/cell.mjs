// tools/balance-sim/cell.mjs — ONE SCENARIO ("cell") PLAYED ON THE REAL ENGINE, measured.
//
// A cell is a ground, a party of styles at a Level, a density, a gear rule, a bar and a supply policy. It is played
// through the settle the world tick runs (tests/hunt-core/fixtures/play-ground.mjs `run` -> hr-accrue accrual.js
// accrueHunt -> src/core/combat-sim.js), in short settle windows (any cut walks the same swings: TICK-1), for
// `hours` of hunting per seed. A death ends the hunt as it does live; the next segment is a NEW hunt on a new seed,
// so the cell's hours are real hunting hours and its deaths are deaths per hunting hour. Nothing here computes a
// combat number: every value is read off the events, members and deltas the engine answers.
//
// HP between settles: the engine emits every blow and every heal (food, spells), but not regeneration. Inside a
// window the tracked HP is the window-start HP (the settle's own `delta.hp`) minus blows plus heals plus a constant
// regeneration rate, the one that lands the window on the engine's own HP at its end (never past max); every window
// end re-anchors on the engine. Regeneration is not constant inside a window (it stops at max), so a dip can read a
// little deeper than it was: close calls are counted conservatively (never hidden).
//
// ENCOUNTER (the ruling's "one continuous encounter = one close call"): from one `pull` to the next. Its minimum
// HP% is the encounter's dip; a dip under 25% is a close call; time-to-death at that minimum is the HP left over the
// damage the hero took in the 4 s before it (the incoming rate at that moment).
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadGear, STYLES } from './gear.mjs';
import { rateCI, quantile, round, gini } from './stats.mjs';

/* the settle's cut: 10 s alone, 30 s for a party (the tracked HP is re-anchored on the engine's at every cut; a
   party pays for every cut: about +40% an hour at 10 s, measured) */
const windowOf = (cell) => cell.windowMs || (cell.party.length > 1 ? 30000 : 10000);
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const BURST_MS = 4000;
const CLOSE_PCT = 25;
const DIP_PCT = 40;

/* One deterministic hunt secret per (seed, segment): the same dice for the same seed in every cell (paired A/B). */
function secretOf(seed, seg) {
  let h = 2166136261 >>> 0;
  for (const c of 'bal:' + seed + ':' + seg) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
}

export async function loadCellRunner(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  const play = await loadPlay(root);
  const gear = await loadGear(root);
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  const XP = await import(u('src/core/xp.js') + v);
  const MIT = await import(u('src/core/mitigation.js') + v);
  const VIT = await import(u('src/core/vitals.js') + v);
  /* every combat skill (src/data/skills.js: Inner Flame since lane/b-inner-flame), the ones a career records */
  const { COMBAT_SKILLS } = await import(u('src/data/skills.js') + v);
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const { START_BAR } = await import(u('src/data/start-kit.js'));
  const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js'));
  const SB = await import(u('src/data/supply-basics.js'));
  const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
  const ITEMS = play.ITEMS, MONSTERS = play.MONSTERS, vendor = (id) => play.vendorPriceOf(ITEMS, id), basics = play.basics;

  /* THE BAR a cell names: the reference bar (the start bar's three slots naming the ground's guide food and drink,
     play-ground.mjs refBar) with its HP threshold moved (`eatPct`) and/or its drink threshold (`drinkPct`). */
  const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
  const guideOf = (huntId) => BAG_GUIDE_BY_HUNT[huntId] || null;
  const barFor = (huntId, bar) => {
    const g = guideOf(huntId);
    const item = g ? { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
    return START_BAR.map((x) => {
      const y = JSON.parse(JSON.stringify(x));
      if (item[y.id]) y.action.id = item[y.id];
      const c = y.conditions[0];
      if (c.metric === 'self_hp_pct' && Number.isInteger(bar.eatPct)) c.value = bar.eatPct;
      if (c.metric === 'self_mana_pct' && Number.isInteger(bar.drinkPct)) c.value = bar.drinkPct;
      return y;
    });
  };
  /* THE BAG: 'store' = empty (every heal and drink bought per use: the store bill is the whole supply cost);
     'own' = the ground's guide food and drink carried (crafted, own stock first, then the store). A Ranger on the
     kit's Bronze Arrow carries one, then buys the store's shot like any arrow. */
  const bagFor = (huntId, supply, kit) => {
    const bag = {};
    if (kit.ammo === 'bronze_arrows') bag.bronze_arrows = { loaded: 1 };
    if (supply === 'own') {
      const g = guideOf(huntId);
      if (g) { bag[g.melee.heal.id] = { loaded: 100000 }; if (g.magic.mana) bag[g.magic.mana.id] = { loaded: 100000 }; }
    }
    return bag;
  };
  const bandOf = (huntId) => {
    const m = {};
    for (const p of G.HUNT_GROUNDS[huntId].pockets) for (const s of (p.pack || []).concat(p.spawns)) {
      for (const d of (MONSTERS[s.monster] || {}).drops || []) if (!m[d.id]) m[d.id] = d.band || (d.ch >= 0.05 ? 'common' : 'rare');
    }
    return m;
  };

  /** Play one cell; answers its measured metrics (per hero and per party). */
  function runCell(cell) {
    const ground = G.HUNT_GROUNDS[cell.ground];
    if (!ground) throw new Error('balance-sim: no ground ' + cell.ground);
    const party = cell.party;
    const roles = party.map((s) => STYLES[s].role);
    /* cell.startBySeat [{ levelXp, skills: { skill: xp } }]: a hero's exact XP (a career run's carry); its Level is the curve's */
    const levels = party.map((_, i) => (cell.startBySeat ? XP.charLevelFromXp(cell.startBySeat[i].levelXp)
      : Array.isArray(cell.level) ? cell.level[i] : cell.level));
    const kits = party.map((s, i) => gear.kitOf(s, levels[i], (cell.gearBySeat && cell.gearBySeat[i]) || cell.gear || {}));
    const keys = roles.map((r, i) => r + i);
    const band = bandOf(cell.ground);
    /* skills: 'level' = every combat skill at the hero's Level (the harness default); or per seat { skill: level } */
    const startFor = (role, seat) => {
      if (cell.startBySeat) return { levelXp: cell.startBySeat[seat].levelXp, skills: { ...cell.startBySeat[seat].skills } };
      const sk = cell.skillsBySeat ? cell.skillsBySeat[seat] : null;
      if (!sk) return null;
      return { skills: Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, sk[k] || 1)])) };
    };
    const H = keys.map((k, i) => ({ key: k, style: party[i], level: levels[i], kit: kits[i],
      mit: MIT.mitigationFor(kits[i], ITEMS, levels[i]),
      vit: VIT.vitalsOf({ levelXp: XP.charXpForLevel(levels[i]), skills: {}, equipment: kits[i], items: ITEMS }),
      hours: 0, levelXp: 0, skillXp: {}, coin: 0, loot: { common: 0, uncommon: 0, scarce: 0, rare: 0, trophy: 0, other: 0 }, lootN: 0,
      rareItems: [], store: 0, buys: {}, uses: {}, deaths: 0, killers: {}, xpLostLevel: 0, deathLevelXpLost: [],
      xpLostSkill: {}, dealt: 0, dealtBy: {}, taken: 0, takenBy: {}, healIn: { food: 0, self: 0, ally: 0 }, healOut: 0, shieldIn: 0,
      blowsLanded: 0, blowsMissed: 0, dodged: 0, eats: { own: 0, store: 0 }, drinks: { own: 0, store: 0 }, casts: {}, castGold: 0,
      manaShots: 0, enc: [], close: 0, dips: 0, ttdClose: [], ended: {} }));
    const P = { kills: 0, ttk: [], hours: 0, segments: 0, rareRolls: 0, rareWins: {}, pulls: 0 };
    const byKey = Object.fromEntries(H.map((h) => [h.key, h]));
    for (let seed = 0; seed < cell.seeds; seed++) {
      let left = cell.hours * 3600000, seg = 0;
      while (left > 60000) {
        const span = Math.min(left, (cell.segmentH || 2) * 3600000);
        /* the live tracking of one hunt (one segment) */
        const live = {};
        for (const h of H) live[h.key] = { unit: null, cur: null, max: null, enc: null, recent: [], at: T0, rate: 0 };
        let winFrom = T0;
        const unitKey = {};
        const firstHit = {};
        const close = (h, x) => {
          if (!x.enc || x.max === null) return;
          const pct = (100 * x.enc.min) / x.max;
          h.enc.push(Math.round(pct * 10) / 10);
          if (pct < CLOSE_PCT) { h.close++; h.ttdClose.push(x.enc.ttd); }
          if (pct < DIP_PCT) h.dips++;
          x.enc = null;
        };
        const open = (x) => { x.enc = { min: x.cur, ttd: Infinity }; };
        const lower = (x, at) => {
          if (!x.enc) open(x);
          if (x.cur < x.enc.min) {
            x.enc.min = x.cur;
            const recent = x.recent.filter((r) => r[0] > at - BURST_MS).reduce((s, r) => s + r[1], 0);
            x.enc.ttd = recent > 0 ? Math.round((x.cur / (recent / BURST_MS)) / 100) / 10 : Infinity;
          }
        };
        const onWindow = (out) => {
          for (const p of out.members) {
            const x = live[p.key];
            const uid = p.summary && Number.isInteger(p.summary.unitIdEver) ? p.summary.unitIdEver : p.hunt && p.hunt.unit_id;
            if (Number.isInteger(uid)) { x.unit = uid; unitKey[uid] = p.key; }
            x.max = p.maxHp;
            if (x.cur === null) x.cur = p.maxHp;
          }
          /* HP moves: blows and heals at a hero, the pulls, and each hero's death, in time order */
          const hp = [];
          for (const e of out.events || []) {
            if (e.type === 'pull') { P.pulls++; hp.push([e.atMs, null, 0]); continue; }
            const tk = unitKey[e.t], uk = unitKey[e.u];
            switch (e.type) {
              case 'dmg': {
                const n = e.amount || 0;
                if (tk) {
                  const h = byKey[tk];
                  h.taken += n;
                  const kind = (out.units && out.units[e.u] && out.units[e.u][0]) || (e.dot ? 'status' : '?');
                  h.takenBy[kind] = (h.takenBy[kind] || 0) + n;
                  if (!e.dot && !uk) h.blowsLanded++;
                  hp.push([e.atMs, tk, -n]);
                } else if (uk) {
                  const h = byKey[uk];
                  h.dealt += n; const a = e.ability || 'basic'; h.dealtBy[a] = (h.dealtBy[a] || 0) + n;
                  if (firstHit[e.t] === undefined) firstHit[e.t] = e.atMs;
                }
                break;
              }
              case 'miss':
                if (tk && !uk) { const h = byKey[tk]; h.blowsMissed++; if (e.dodge) h.dodged++; }
                break;
              case 'heal':
                if (tk) {
                  const h = byKey[tk], n = e.amount || 0;
                  if (e.item) h.healIn.food += n; else if (e.u === e.t) h.healIn.self += n; else h.healIn.ally += n;
                  hp.push([e.atMs, tk, n]);
                }
                if (uk && e.u !== e.t && !e.item) byKey[uk].healOut += e.amount || 0;
                break;
              case 'shield':
                if (tk) byKey[tk].shieldIn += e.amount || 0;
                break;
              case 'kill':
                if (!tk) { P.kills++; if (firstHit[e.t] !== undefined) { P.ttk.push(e.atMs - firstHit[e.t]); delete firstHit[e.t]; } }
                break;
              case 'eat': case 'drink':
                if (uk) { const h = byKey[uk]; (e.type === 'eat' ? h.eats : h.drinks)[e.source === 'store' ? 'store' : 'own']++; }
                break;
              case 'cast':
                if (uk) { const h = byKey[uk]; h.casts[e.ability] = (h.casts[e.ability] || 0) + 1; h.castGold += e.gold || 0; }
                break;
              case 'shot':
                if (uk && e.mana) byKey[uk].manaShots++;
                break;
              case 'rare_roll':
                P.rareRolls++; if (unitKey[e.u]) P.rareWins[unitKey[e.u]] = (P.rareWins[unitKey[e.u]] || 0) + 1;
                break;
              default: break;
            }
          }
          /* REGENERATION has no event: each hero's rate this window is what makes its blows and heals end on the
             engine's own HP at the window's end (spread evenly over the window, never past max). Pass one finds it. */
          const winTo = Number.isInteger(out.settledTo) ? out.settledTo : winFrom + windowOf(cell);
          const endHp = {};
          for (const p of out.members) {
            const d = p.delta || {}, hu = p.hunt || {};
            for (const dl of (p.summary && p.summary.deathLog) || []) hp.push([dl.atMs || winTo, p.key, -Infinity]);
            if (Number.isInteger(d.hp) && !hu.ended) endHp[p.key] = d.hp;
          }
          hp.sort((a, b) => a[0] - b[0]);
          for (const h of H) {
            const x = live[h.key];
            x.rate = 0; x.at = winFrom;
            if (x.cur === null || x.max === null || endHp[h.key] === undefined) continue;
            let c = x.cur;
            for (const [, k, n] of hp) if (k === h.key) c = Math.min(x.max, c + n);
            const gap = endHp[h.key] - c;
            if (gap > 0 && winTo > winFrom) x.rate = gap / (winTo - winFrom);
          }
          /* pass two: the HP each hero stood at through the window */
          const step = (x, at) => { if (x.rate > 0 && at > x.at) x.cur = Math.min(x.max, x.cur + x.rate * (at - x.at)); x.at = Math.max(x.at, at); };
          for (const [at, k, n] of hp) {
            if (k === null) {
              for (const h of H) { const x = live[h.key]; if (x.unit !== null && x.cur !== null) { step(x, at); close(h, x); open(x); } }
              continue;
            }
            const x = live[k];
            if (x.cur === null) continue;
            step(x, at);
            if (n === -Infinity) { x.cur = 0; lower(x, at); continue; }
            if (n < 0) { x.cur += n; x.recent.push([at, -n]); if (x.recent.length > 64) x.recent.splice(0, 32); lower(x, at); }
            else x.cur = Math.min(x.max, x.cur + n);
          }
          winFrom = winTo;
          for (const p of out.members) {
            const h = byKey[p.key], x = live[p.key], d = p.delta || {}, hu = p.hunt || {};
            h.hours += (hu.paid_ms || 0) / 3600000;
            h.levelXp += d.level_xp || 0;
            for (const [k, n] of Object.entries(d.xp || {})) h.skillXp[k] = (h.skillXp[k] || 0) + n;
            h.coin += d.gold || 0;
            for (const [id, n] of Object.entries(d.items || {})) {
              const b = band[id] || 'other';
              h.loot[b in h.loot ? b : 'other'] += n * vendor(id); h.lootN += n;
            }
            for (const rd of (hu.hints && hu.hints.rare_drop) || []) h.rareItems.push(rd.item);
            for (const [id, n] of Object.entries(hu.buys || {})) { h.buys[id] = (h.buys[id] || 0) + n; h.store += n * ((basics[id] || {}).price || 0); }
            for (const [id, n] of Object.entries(hu.uses || {})) h.uses[id] = (h.uses[id] || 0) + n;
            for (const dl of (p.summary && p.summary.deathLog) || []) {
              h.deaths++; h.killers[dl.monster] = (h.killers[dl.monster] || 0) + 1;
              const lost = (dl.xpLost && dl.xpLost.level) || 0;
              h.xpLostLevel += lost; h.deathLevelXpLost.push(lost);
              for (const [k, n] of Object.entries(dl.xpLost || {})) if (k !== 'level') h.xpLostSkill[k] = (h.xpLostSkill[k] || 0) + n;
            }
            if (hu.ended) h.ended[hu.ended.reason] = (h.ended[hu.ended.reason] || 0) + 1;
            /* the engine's HP at the window's end: the anchor for the next window */
            if (Number.isInteger(d.hp) && !hu.ended) { x.cur = d.hp; if (x.enc) x.enc.min = Math.min(x.enc.min, x.cur); }
          }
        };
        const opts = {
          spanMs: span, secret: secretOf((cell.seedBase || 0) + seed, seg), windowMs: windowOf(cell), onWindow,
          equipment: (role, i) => kits[i],
          bar: cell.bar ? () => barFor(cell.ground, cell.bar) : undefined,
          bag: (role, i) => bagFor(cell.ground, cell.supply || 'store', kits[i]),
          start: cell.skillsBySeat || cell.startBySeat ? startFor : undefined,
          leaveTogether: party.length > 1 && cell.leaveTogether !== false,
          options: cell.options ? (role, i) => (Array.isArray(cell.options) ? cell.options[i] : cell.options) : undefined,
        };
        if (!opts.bar) delete opts.bar;
        if (!opts.start) delete opts.start;
        if (!opts.options) delete opts.options;
        if (Number.isInteger(cell.density)) opts.density = cell.density;
        /* a what-if on the ground's own row (respawnMs, partyScale ...): a copy, never the frozen table */
        if (cell.groundPatch) opts.ground = { ...ground, ...cell.groundPatch };
        const res = play.run(cell.ground, levels.length > 1 ? levels : levels[0], roles, opts);
        for (const h of H) close(h, live[h.key]);
        const played = Math.max(res.playedMs, 60000);
        P.hours += played / 3600000; P.segments++;
        left -= played; seg++;
      }
    }
    return summarise(cell, H, P, ground);
  }

  /* THE CELL'S METRICS (the ruling's §11 list), per hero and per party, compact enough to keep thousands of cells. */
  function summarise(cell, H, P, ground) {
    const hunt = HUNT_INDEX[ground.hunt] || {};
    const heroes = H.map((h) => {
      const hr = h.hours || 1e-9, per = (n) => round(n / hr, 0);
      const income = h.coin + h.loot.common + h.loot.uncommon + h.loot.scarce + h.loot.other;
      const rares = h.loot.rare + h.loot.trophy;
      const swings = h.blowsLanded + h.blowsMissed;
      const healTotal = h.healIn.food + h.healIn.self + h.healIn.ally;
      const lostMean = h.deaths ? h.xpLostLevel / h.deaths : null;
      const xph = h.levelXp / hr;
      const deaths = rateCI(h.deaths, h.hours, 1000);
      const closeCalls = rateCI(h.close, h.hours, 12);
      const minMed = quantile(h.enc, 0.5);
      return {
        key: h.key, style: h.style, level: h.level, kit: h.kit, maxHp: h.vit.maxHp, maxMana: h.vit.maxMana, mit: h.mit,
        hours: round(h.hours, 2),
        levelXpPerH: round(xph, 0), skillXpPerH: Object.fromEntries(Object.entries(h.skillXp).map(([k, n]) => [k, per(n)])),
        coinPerH: per(h.coin), lootPerH: Object.fromEntries(Object.entries(h.loot).map(([k, n]) => [k, per(n)])),
        incomePerH: per(income), raresPerH: per(rares), storePerH: per(h.store), profitPerH: per(income - h.store),
        netWithRaresPerH: per(income + rares - h.store), margin: h.store > 0 ? round(income / h.store - 1, 3) : null,
        buysPerH: Object.fromEntries(Object.entries(h.buys).map(([k, n]) => [k, round(n / hr, 1)])),
        rareItems: h.rareItems.length, rareEveryH: h.rareItems.length ? round(h.hours / h.rareItems.length, 1) : null,
        deaths: h.deaths, deathsPer1000h: deaths, killers: h.killers,
        levelXpLostPerDeath: round(lostMean, 0), deathCostHours: lostMean !== null && xph > 0 ? round(lostMean / xph, 2) : null,
        dealtPerH: per(h.dealt), dps: round(h.dealt / (hr * 3600), 2), dealtBy: h.dealtBy,
        takenPerH: per(h.taken), takenBy: Object.fromEntries(Object.entries(h.takenBy).sort((a, b) => b[1] - a[1]).slice(0, 6)),
        monsterSwingsPerH: per(swings), landedPct: swings ? round((100 * h.blowsLanded) / swings, 1) : null,
        dodgedPct: swings ? round((100 * h.dodged) / swings, 1) : null, dmgPerMonsterSwing: swings ? round(h.taken / swings, 3) : null,
        healInPerH: { food: per(h.healIn.food), self: per(h.healIn.self), ally: per(h.healIn.ally), total: per(healTotal) },
        healOutPerH: per(h.healOut), shieldInPerH: per(h.shieldIn), sustainRatio: h.taken ? round(healTotal / h.taken, 3) : null,
        eatsPerH: { own: round(h.eats.own / hr, 1), store: round(h.eats.store / hr, 1) },
        drinksPerH: { own: round(h.drinks.own / hr, 1), store: round(h.drinks.store / hr, 1) },
        castsPerH: Object.fromEntries(Object.entries(h.casts).map(([k, n]) => [k, round(n / hr, 1)])), manaShotsPerH: round(h.manaShots / hr, 1),
        encounters: h.enc.length, encMinHpPct: { p50: minMed, p10: quantile(h.enc, 0.1), p01: quantile(h.enc, 0.01) },
        closeCallsPer12h: closeCalls, dipsUnder40Per12h: rateCI(h.dips, h.hours, 12),
        ttdAtCloseS: quantile(h.ttdClose.filter(Number.isFinite), 0.5),
        band: bandOfCell(minMed, deaths.rate), ended: h.ended,
        /* the raw totals a career run carries into its next chunk (gains, and what deaths took back) */
        raw: { levelXp: h.levelXp, skillXp: h.skillXp, xpLostLevel: h.xpLostLevel, xpLostSkill: h.xpLostSkill, coin: h.coin,
          income, store: h.store, rares },
      };
    });
    const hours = P.hours || 1e-9;
    const wins = heroes.map((h) => P.rareWins[h.key] || 0);
    return {
      id: cell.id, cell, ground: cell.ground, hunt: { band: hunt.band || null, groupFit: ground.groupFit || null },
      party: { size: heroes.length, hours: round(P.hours, 2), segments: P.segments, killsPerH: round(P.kills / hours, 0),
        pullsPerH: round(P.pulls / hours, 1), ttkS: { p50: msS(quantile(P.ttk, 0.5)), p90: msS(quantile(P.ttk, 0.9)) },
        rareRolls: P.rareRolls, rareWins: P.rareWins, rareGini: gini(wins),
        levelXpPerHeroPerH: round(heroes.reduce((s, h) => s + (h.levelXpPerH || 0), 0) / heroes.length, 0),
        createdPerH: round(heroes.reduce((s, h) => s + h.incomePerH + h.raresPerH, 0), 0),
        destroyedPerH: round(heroes.reduce((s, h) => s + h.storePerH, 0), 0) },
      heroes,
    };
  }
  const msS = (ms) => (ms === null ? null : round(ms / 1000, 1));

  return { runCell, STYLES, gear, XP, COMBAT_SKILLS };
}

/* THE RULING'S DIFFICULTY BANDS (§3): a cell's band by its typical encounter minimum HP and by its deaths per
   1,000 h. 'normal' needs both (minimum 60-80% and at most 1 death per 1,000 h); a cell whose two readings
   disagree says so ('easy|normal'). */
export const BANDS = Object.freeze([
  Object.freeze({ id: 'easy', minHp: [80, 100], deaths: [0, 0.1] }),
  Object.freeze({ id: 'normal', minHp: [60, 80], deaths: [0, 1] }),
  Object.freeze({ id: 'hard', minHp: [35, 60], deaths: [10, 30] }),
  Object.freeze({ id: 'extreme', minHp: [15, 40], deaths: [50, 100] }),
]);
function bandOfCell(minHp, deathRate) {
  const byHp = minHp === null ? null : (BANDS.find((b) => minHp >= b.minHp[0]) || { id: 'lethal' }).id;
  const d = deathRate === null ? null : deathRate;
  const byDeath = d === null ? null : d <= 0.1 ? 'easy' : d <= 1 ? 'normal' : d <= 30 ? 'hard' : d <= 100 ? 'extreme' : 'lethal';
  return byHp === byDeath ? byHp : byHp + '|' + byDeath;
}
