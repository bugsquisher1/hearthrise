// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/paths/solve.mjs — THE BEST PATH, PLAYED ON PAPER DAY BY DAY (50-standards 10.3).
//
//   makeSolver({ D, P, kits, opts }) -> { levelPath(sc), screenPath(sc), gearPath(sc, goal), sample(run, n, seed) }
//   sc = { party, comp [styles], payer 'free' | 'premium' | 'bought', townH 12 | 4, scale { system: f }, without Set(systems) }
//
// THE STATE a day: Level and XP, gold, what the account owns (expected counts), town skill levels, hunted hours so far (the Luck bar).
// THE MOVES a day: one ground and tier for the 12 hunted hours (the account's own party, every seat the same Level); the rested hours of
// every hero on town jobs (skill first, then the jobs the plan needs); buy what gold allows; open the week's keys; roll the hall; equip.
// THE SEARCH: a beam over the ground each day (width opts.beam), scored by the days the goal still needs (the bill of materials of what is
// missing, each piece by its cheapest route, atlas/cost.mjs). The first two days go by the hour. EXPECTED VALUES: a chance piece is owned
// at its median (an expected count of ln 2); `sample` replays the plan's own daily rates 200 times for the 10th, 50th and 90th percentile.
// Gold, rested hours, hunted hours and the week's opens run side by side: a day spends each at most once.
// PURE apart from the data it is handed. No engine plays here: every rate is atlas/rates.mjs's (MEASURED) or a data row's.
// ════════════════════════════════════════════════════════════════════════

const LN2 = Math.log(2);
export const GEAR_BANDS = Object.freeze([
  { id: 'b1-15', from: 1, to: 15, region: 'greenhaven' }, { id: 'b15-30', from: 15, to: 30, region: 'greenhaven' }, { id: 'b30-45', from: 30, to: 45, region: 'greenhaven' },
  { id: 'b45-60', from: 45, to: 60, region: 'barrow_march' }, { id: 'b60-75', from: 60, to: 75, region: 'barrow_march' }, { id: 'b75-88', from: 75, to: 88, region: 'barrow_march' },
  { id: 'b88-110', from: 88, to: 110, region: 'barrow_march' }, { id: 'b110-185', from: 110, to: 185, region: 'morrow_hills', pastKrell: true },
]);
const TOWN_KINDS = new Set(['recipe', 'gather', 'farm']);

export function makeSolver({ D, P, kits, opts = {} }) {
  const beamW = opts.beam || 4;
  const topLevel = opts.topLevel || 185;
  const eventShare = opts.eventShare || 0;
  const luckOn = opts.luck !== false;
  const levelAt = (xp) => { let lv = 1; while (lv < 400 && D.charXpForLevel(lv + 1) <= xp) lv++; return lv; };
  const luckBucket = (h) => (!luckOn ? 0 : [0, 100, 250, 500, 1000, 2000, 5000].filter((b) => b <= h).pop());

  /* the hunting options at a Level: every ground a party may stand on (its band's floor at or under the Level), every tier it holds */
  function options(level, sc) {
    const out = options0(level, sc);
    if (out.length || sc.party === 1) return out;
    /* a party under its sizes' first Level (the Sewer opens at 5): each hero hunts alone, the account earns n heroes' gold */
    return options0(level, { ...sc, party: 1 }).map((o) => ({ ...o, netH: o.netH * sc.party, alone: true }));
  }
  function options0(level, sc) {
    const out = [];
    for (const g of Object.keys(D.HUNT_GROUNDS)) {
      const h = D.HUNT_INDEX[g];
      if (!h || h.band[0] > level) continue;
      if (!D.OPEN_GROUNDS[g] && (opts.openOnly || level < 110)) continue;
      for (const tier of sc.tiers || ['normal', ...D.tiersOf(g).filter((t) => t !== 'normal')]) {
        const r = P.rate(g, { level, party: sc.party, tier, gear: 'mid' }, Math.min(level, h.band[1]));
        /* a tier it does not hold (a death in the sample), or a ground it has outgrown (no kills: the Cellar sends a hero home at 5) */
        if (!r || r.deaths > 0 || !(r.killsPerH > 0) || !(r.xpPerHeroH > 0)) continue;
        out.push({ ground: g, tier, r, xpH: r.xpPerHeroH * (1 + eventShare), netH: r.netPerHeroH * sc.party });
      }
    }
    return out;
  }
  /* a route is chosen at the checkpoint at or under the Level (the atlas's own grid of Levels): a route never opens early, and the memo holds */
  const cps = opts.checkpoints || [1, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 88, 100, 110, 125, 145, 165, 185, 200];
  const cpAt = (L) => cps.filter((c) => c <= L).pop() || 1;
  const ctxOf = (st, sc) => ({ level: cpAt(st.level), party: sc.party, tier: 'normal', gear: 'mid', townH: sc.townH, luckHours: luckBucket(st.hunted),
    market: sc.payer === 'bought' || sc.market === true, scale: sc.scale || null, scaleKey: sc.scale ? JSON.stringify(sc.scale) : '' });

  /* ── THE FASTEST LEVEL: the best XP an hour every step (myopic is optimal: XP adds, and a rate reads only the Level) ── */
  function levelPath(sc, pick = null) {
    let xp = D.charXpForLevel(1), level = 1, day = 0;
    const at = {}, grounds = [];
    while (level < topLevel && day < 2000) {
      const step = day < 2 ? 1 / 12 : 0.25;   // by the hour for the first two days, then four steps a day
      const opt = pick ? pick(level, sc, options(level, sc)) : options(level, sc).sort((a, b) => b.xpH - a.xpH)[0];
      if (!opt || !(opt.xpH > 0)) break;
      xp += opt.xpH * 12 * step; day += step;
      const was = level; level = levelAt(xp);
      if (!grounds.length || grounds[grounds.length - 1].ground !== opt.ground || grounds[grounds.length - 1].tier !== opt.tier) grounds.push({ ground: opt.ground, tier: opt.tier, fromLevel: was, fromDay: day - step });
      for (let L = was + 1; L <= level; L++) if (!(L in at)) at[L] = Math.round(day * 100) / 100;
    }
    for (const g of grounds) g.toLevel = level;
    for (let i = 0; i < grounds.length - 1; i++) grounds[i].toLevel = grounds[i + 1].fromLevel;
    return { at, grounds, topLevel: level, days: day };
  }
  /* the game's own advice (src/shell/hunt-list.js recommendedHunt), Normal: band B3 */
  function screenPath(sc, recommend) {
    return levelPath(sc, (level, s, opts2) => {
      const row = recommend(Array(s.party).fill(level), s.party);
      const g = row && (row.hunt || row.id);
      return opts2.find((o) => o.ground === g && o.tier === 'normal') || null;
    });
  }

  /* ── THE BILL OF MATERIALS of the missing targets, each piece by its cheapest route at this state ── */
  function bom(st, sc, targets) {
    const ctx = ctxOf(st, sc);
    const reserved = new Map();
    const acc = { hunt: new Map(), town: [], gold: 0, chest: new Map(), hall: new Map(), call: new Map(), wall: 0, fills: [], blocked: [], used: new Set() };
    const want = (item, n, depth, top) => {
      if (n <= 1e-9) return;
      /* what the account holds and no earlier line of this bill has claimed */
      const have = Math.max(0, (st.owned.get(item) || 0) - (reserved.get(item) || 0));
      const short = Math.max(0, n - have);
      reserved.set(item, (reserved.get(item) || 0) + Math.min(n, have));
      if (short <= 1e-9) return;
      if (depth > 8) { acc.blocked.push(item); return; }
      const b = P.best(item, ctx, sc.without ? { without: sc.without } : {});
      if (!b.best) { acc.blocked.push(item); return; }
      const src = P.byItem.get(item).find((s) => s.sid === b.best.sid);
      /* the systems within reach of this piece (a route within 25% of the best: VERDICT_RULES.neglected.nearBest) and each system's own best days */
      const bySys = {};
      for (const x of b.all) if (!(x.system in bySys)) bySys[x.system] = x.days;
      if (top) acc.fills.push({ item, sid: src.sid, system: src.system, kind: src.kind, days: b.best.days, next: b.next ? { sid: b.next.sid, system: b.next.system, days: b.next.days } : null, bySys });
      acc.used.add(src.sid);
      if (sc.payer === 'bought' && src.kind === 'market') { acc.gold += 0; return; }
      if (src.hunt || src.kind === 'planned') acc.hunt.set(item, (acc.hunt.get(item) || 0) + short);
      else if (src.fight) acc.call.set(item, { n: (acc.call.get(item) || { n: 0 }).n + short, src });
      else if (src.hall) { acc.hall.set(item, { n: short, src }); want(src.hall.key, 1, depth + 1, false); }
      else if (src.chest) { acc.chest.set(item, { n: short, src, opensEach: b.best.limitDays > 0 ? b.best.limitDays * src.chest.opensPerWeek / 7 : 1 }); if (src.chest.key) acc.used.add('key:' + src.chest.key); }
      else if (src.job) {
        const per = (src.job.outQty || 1) * (src.job.p || 1);
        acc.town.push({ item, sid: src.sid, skill: src.job.skill, req: src.job.req, hours: short * src.job.benchSec / 3600 / per });
        acc.gold += short * (src.job.fee || 0) / per;
        for (const [id, q] of Object.entries(src.job.inputs)) want(id, q * short / per + (st.owned.get(id) || 0), depth + 1, false);
      } else if (src.node) acc.town.push({ item, sid: src.sid, skill: src.node.skill || 'gathering', req: src.node.req || 1, hours: src.node.hoursAFind ? short * src.node.hoursAFind : short / src.node.perHour });
      else if (src.crop) acc.wall = Math.max(acc.wall, short / (D.START_PLOTS * (24 / src.crop.hours) * src.crop.yield));
      else if (src.upgrade || src.step) {
        const u = src.upgrade || src.step;
        acc.gold += short * (u.gold || 0);
        for (const [id, q] of Object.entries(u.inputs || {})) if (q > 0) want(id, q * short, depth + 1, false);
        if (src.upgrade && src.upgrade.after) want(src.upgrade.after, n, depth + 1, false);
      } else if (typeof src.gold === 'number' || src.market) acc.gold += short * (src.gold ?? (src.market ? src.market.floor : 0));
      else acc.blocked.push(item);
    };
    for (const [item, n] of targets) want(item, n, 0, true);
    return acc;
  }

  /* the days the bill still needs if the hunted hours went to `opt` (the beam's score) */
  function daysLeft(st, sc, acc, opt) {
    let hunt = 0, huntSum = 0;
    for (const [item, n] of acc.hunt) {
      const per = opt ? dropRate(opt, item, st, sc) : 0;
      const bestAny = bestHuntRate(st, sc, item);
      const d = per > 0 ? n * LN2 / (per * 12) : bestAny > 0 ? n * LN2 / (bestAny * 12) + 1 : 999;
      hunt = Math.max(hunt, d); huntSum += Math.min(d, 999);
    }
    const restH = sc.party * sc.townH;
    const town = acc.town.reduce((s, j) => s + j.hours + skillHours(st, j.skill, j.req), 0) / Math.max(1e-9, restH);
    const netDay = opt ? opt.netH * 12 : 0;
    const gold = sc.payer === 'bought' ? 0 : Math.max(0, acc.gold - st.gold) / Math.max(1e-9, netDay > 0 ? netDay : 1e-9);
    let chest = 0; const fam = {};
    for (const [, c] of acc.chest) { const k = c.src.chest.family; fam[k] = fam[k] || { opens: 0, perWeek: c.src.chest.opensPerWeek }; fam[k].opens += c.n * c.opensEach; }
    for (const x of Object.values(fam)) chest = Math.max(chest, x.opens / (x.perWeek / 7) / sc.party);
    let hall = 0; for (const [, h] of acc.hall) hall = Math.max(hall, h.n / Math.max(1e-9, sc.party * h.src.hall.slice));
    let call = 0; for (const [, c] of acc.call) call = Math.max(call, c.n * c.src.fight.hours / Math.max(1e-9, c.src.fight.perFight) / 12);
    /* the makespan, and a tenth of the hunting still owed so a tie moves on every need */
    return Math.max(hunt, town, Math.min(gold, 999), chest, hall, call, acc.wall) + 0.1 * huntSum + (acc.blocked.length ? 999 : 0);
  }
  const rateMemo = new Map();
  function dropRate(opt, item, st, sc) {
    const k = opt.ground + opt.tier + (opt.alone ? 'a' : '') + item + st.level + luckBucket(st.hunted);
    if (rateMemo.has(k)) return rateMemo.get(k);
    let per = 0;
    for (const s of P.byItem.get(item) || []) {
      if (s.kind === 'planned' && s.where && s.where.startsWith(opt.ground) && s.promise) per += sc.party / s.promise.hours;
      if (!s.hunt || s.hunt.ground !== opt.ground || s.hunt.scaled) continue;
      const luck = s.hunt.luck && luckOn ? 1 + luckOf(st.hunted) : 1;
      for (const [m, ch] of Object.entries(s.hunt.perKill)) per += (opt.r.killsByPerH[m] || 0) * ch * luck;
    }
    if (opt.alone) per *= sc.party;   // n heroes each hunting alone
    const f = sc.scale && (P.byItem.get(item) || []).find((s) => s.hunt && s.hunt.ground === opt.ground);
    if (f && sc.scale[f.system]) per /= sc.scale[f.system];
    rateMemo.set(k, per);
    return per;
  }
  const luckOf = (h) => opts.luckAt ? opts.luckAt(h) : 0;
  function bestHuntRate(st, sc, item) { return Math.max(0, ...options(st.level, sc).map((o) => dropRate(o, item, st, sc))); }
  /* rested hours to take a town skill from its level now to `req` on its best XP row */
  function skillHours(st, skill, req) {
    const lv = st.town[skill] || 1;
    if (lv >= req || !opts.T) return 0;
    let h = 0;
    for (let L = lv; L < req; L++) h += (D.skillXpForLevel(skill, L + 1) - D.skillXpForLevel(skill, L)) / Math.max(1, xpRowAt(skill, L));
    return h;
  }
  const xpRowMemo = new Map();
  function xpRowAt(skill, L) {
    const k = skill + L; if (xpRowMemo.has(k)) return xpRowMemo.get(k);
    const rows = opts.T.nodes.filter((n) => n.skill === skill && n.req <= L).concat(opts.T.recipes.filter((x) => x.skill === skill && x.req <= L));
    const v = Math.max(0, ...rows.map((x) => x.xpPerHour)); xpRowMemo.set(k, v); return v;
  }

  /* ── ONE DAY: hunt `opt`, then the town, the purse, the keys, the hall ── */
  function playDay(st0, sc, acc, opt, step = 1) {
    const st = { ...st0, owned: new Map(st0.owned), town: { ...st0.town }, rates: st0.rates, day: st0.day + step };
    const h = 12 * step;
    st.usedSids = new Set([...(st0.usedSids || []), ...acc.used]);
    if (opt) {
      st.xp += opt.xpH * h; st.level = Math.min(400, levelAt(st.xp)); st.hunted += h;
      if (st.bandTo && st.level >= st.bandTo && st.goldAtTop === undefined) st.goldAtTop = st.gold;
      st.gold += opt.netH * h;
      for (const item of acc.hunt.keys()) {
        const per = dropRate(opt, item, st0, sc);
        if (per > 0) { st.owned.set(item, (st.owned.get(item) || 0) + per * h / LN2); if (st.rates) st.rates.push([st.day, item, per * h]); }
      }
      if (!st.groundLog.length || st.groundLog[st.groundLog.length - 1][1] !== opt.ground + ':' + opt.tier) st.groundLog = [...st.groundLog, [st0.day, opt.ground + ':' + opt.tier]];
    }
    /* calls: their stamina comes out of the day's hunted hours (a fight is minutes) */
    for (const [item, c] of acc.call) {
      const fights = Math.min(c.n / c.src.fight.perFight, h / c.src.fight.hours * 0.25);
      st.owned.set(item, (st.owned.get(item) || 0) + fights * c.src.fight.perFight / LN2);
    }
    /* the town: skill to the job's level first, then the job */
    let rest = sc.party * sc.townH * step;
    for (const j of acc.town) {
      if (rest <= 0) break;
      const need = skillHours(st, j.skill, j.req);
      if (need > 0) {
        const use = Math.min(rest, need); rest -= use;
        let xpGain = use * xpRowAt(j.skill, st.town[j.skill] || 1), L = st.town[j.skill] || 1;
        while (L < 99 && xpGain >= D.skillXpForLevel(j.skill, L + 1) - D.skillXpForLevel(j.skill, L)) { xpGain -= D.skillXpForLevel(j.skill, L + 1) - D.skillXpForLevel(j.skill, L); L++; }
        st.town[j.skill] = L;
        st.restUsed = (st.restUsed || 0) + use;
        if (L < j.req) continue;
      }
      const use = Math.min(rest, j.hours); rest -= use;
      if (use > 0) st.usedTown = new Set([...(st.usedTown || []), j.sid]);
      st.restUsed = (st.restUsed || 0) + use;
      const made = j.hours > 0 ? use / j.hours : 1;
      const src = P.byItem.get(j.item).find((s) => s.sid === j.sid);
      const unitsEach = src && src.job ? (src.job.outQty || 1) * (src.job.p || 1) : 1;
      const want = j.hours * (src && src.job ? unitsEach / (src.job.benchSec / 3600) : src && src.node && !src.node.hoursAFind ? src.node.perHour : 1);
      st.owned.set(j.item, (st.owned.get(j.item) || 0) + made * want / (src && src.chance ? LN2 : 1) * (src && src.chance ? 1 : 1));
      if (src && src.job) for (const [id, q] of Object.entries(src.job.inputs)) st.owned.set(id, Math.max(0, (st.owned.get(id) || 0) - q * made * want / unitsEach));
    }
    /* the farm (wall clock) */
    if (acc.wall > 0) for (const [item] of acc.hunt) void item;
    /* the purse: buy what the bill buys, cheapest first */
    const ctx = ctxOf(st, sc);
    for (const [item, n] of st.targets) {
      const short = n - (st.owned.get(item) || 0);
      if (short <= 1e-9) continue;
      buyChain(st, sc, ctx, item, short, 0);
    }
    /* the week's opens (each hero's six a family), a piece by its mean opens; the climb a week's half hour comes off the hunt */
    /* each key FAMILY has its own six a hero a week (chests.js KEY_FAMILIES): the Tower's opens never pay a Catacomb piece */
    const perFamily = {};
    for (const [, c] of acc.chest) perFamily[c.src.chest.family] = (perFamily[c.src.chest.family] || 0) + 1;
    for (const [item, c] of acc.chest) {
      const opensToday = (c.src.chest.opensPerWeek / 7) * step * sc.party / Math.max(1, perFamily[c.src.chest.family]);
      st.owned.set(item, (st.owned.get(item) || 0) + opensToday / c.opensEach / LN2);
      if (st.rates) st.rates.push([st.day, item, opensToday / c.opensEach, 'chest']);
    }
    for (const [item, hh] of acc.hall) {
      if ((st.owned.get(hh.src.hall.key) || 0) < 1) continue;
      st.owned.set(hh.src.hall.key, (st.owned.get(hh.src.hall.key) || 0) - 1);
      const first = !st.hallRolled ? 1 - Math.pow(1 - hh.src.hall.firstShare, sc.party) : 0;
      const p = first || (1 - Math.pow(1 - hh.src.hall.slice, sc.party));
      st.hallRolled = true;
      st.owned.set(item, (st.owned.get(item) || 0) + p / LN2);
    }
    /* the day each target was first owned (the band's bottleneck is the last of them) */
    st.got = st0.got || {};
    for (const [item, n] of st.targets) if (!(item in st.got) && (st.owned.get(item) || 0) >= n - 1e-6) st.got = { ...st.got, [item]: Math.round(st.day * 100) / 100 };
    return st;
  }
  function buyChain(st, sc, ctx, item, short, depth) {
    if (depth > 6) return;
    const b = P.best(item, ctx, sc.without ? { without: sc.without } : {});
    if (!b.best) return;
    const src = P.byItem.get(item).find((s) => s.sid === b.best.sid);
    let gold = null, inputs = {};
    if (typeof src.gold === 'number' && !src.useOnly) gold = src.gold;
    else if (src.market) gold = sc.payer === 'bought' ? 0 : (P.route(src, ctx).ceiling ?? src.market.floor);   /* a free buyer pays the maker's time (the ceiling) */
    else if (src.upgrade || src.step) { const u = src.upgrade || src.step; gold = u.gold || 0; inputs = { ...(u.inputs || {}) }; }
    if (gold === null) return;
    /* a rung stands on the one under it (held, never spent); an input the purse can buy is bought first */
    const prereq = src.upgrade && src.upgrade.after;
    const lack = (id, n) => n - (st.owned.get(id) || 0);
    if (prereq && lack(prereq, short) > 1e-9) { buyChain(st, sc, ctx, prereq, lack(prereq, short), depth + 1); if (lack(prereq, short) > 1e-9) return; }
    for (const [id, q] of Object.entries(inputs)) if (q > 0 && lack(id, q * short) > 1e-9) { buyChain(st, sc, ctx, id, lack(id, q * short), depth + 1); if (lack(id, q * short) > 1e-9) return; }
    const cost = gold * short;
    if (sc.payer !== 'bought' && st.gold < cost) return;
    if (sc.payer !== 'bought') st.gold -= cost; else st.boughtGold = (st.boughtGold || 0) + cost;
    for (const [id, q] of Object.entries(inputs)) if (q > 0) st.owned.set(id, (st.owned.get(id) || 0) - q * short);
    st.owned.set(item, (st.owned.get(item) || 0) + short);
  }

  const doneOf = (st) => [...st.targets].every(([item, n]) => (st.owned.get(item) || 0) >= n - 1e-6);
  const missingOf = (st) => [...st.targets].filter(([item, n]) => (st.owned.get(item) || 0) < n - 1e-6).map(([i]) => i);

  /* the account's targets for a band and a goal: every seat's kit at the band's last Level, counted (two of a ring) */
  function targetsFor(band, goal, sc) {
    const m = new Map();
    const level = Math.max(band.from, band.to - 1);
    for (const style of sc.comp) {
      const k = kits.kitFor(level, goal, style);
      for (const id of Object.values(k.slots)) m.set(id, (m.get(id) || 0) + 1);
      for (const id of k.upgrades) m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }

  /* ── A GEAR GOAL, BAND BY BAND: enter the band at its floor with nothing of its kit, play days until the kit is owned ── */
  function gearPath(sc, goal, bands = GEAR_BANDS, recordRates = false) {
    const out = [];
    let carryTown = {}, carryGold = 0;   // town skills and the purse persist from band to band, as a player's do
    for (const band of bands) {
      if (band.from >= topLevel) break;
      const targets = targetsFor(band, goal, sc);
      let beam = [{ day: 0, xp: D.charXpForLevel(band.from), level: band.from, gold: carryGold, hunted: opts.huntedAt ? opts.huntedAt(band.from) : band.from * 10,
        owned: new Map(), town: { ...carryTown }, targets, bandTo: band.to, groundLog: [], rates: recordRates ? [] : null, restUsed: 0, score: 0 }];
      let done = null, fills = null, guard = 0;
      const maxDays = opts.maxDays || 400;
      while (guard++ < maxDays * 2) {
        const next = [];
        for (const st of beam) {
          if (doneOf(st)) { done = st; break; }
          const acc = bom(st, sc, st.targets);
          if (!fills) fills = acc.fills;
          /* a hunt that loses gold is open only to a purse that can pay its day (a hunt ends when the gold for its supplies runs out) */
          const opts2 = options(st.level, sc).filter((o) => o.netH >= 0 || sc.payer === 'bought' || st.gold + o.netH * 12 >= 0);
          const scored = opts2.map((o) => ({ o, s: daysLeft(st, sc, acc, o) - o.xpH * 1e-9 })).sort((a, b) => a.s - b.s).slice(0, Math.max(1, beamW));
          for (const { o } of scored) {
            const st2 = playDay(st, sc, acc, o, st.day < 2 ? 1 / 12 : 1);
            st2.score = st2.day + daysLeft(st2, sc, bom(st2, sc, st2.targets), o);
            next.push(st2);
          }
          if (!scored.length) next.push(playDay(st, sc, acc, null, 1));
        }
        if (done) break;
        next.sort((a, b) => a.score - b.score);
        beam = next.slice(0, beamW);
        if (opts.debug && beam[0]) opts.debug(band, beam[0], bom(beam[0], sc, beam[0].targets));
        if (!beam.length || beam[0].day > maxDays) break;
      }
      const best = done || beam[0];
      /* the purse the next band opens with: what this one held the day the hero walked past its top Level (not what a long chase after
         leaving it piled up), else what it holds now */
      carryTown = { ...best.town }; carryGold = Math.max(0, best.goldAtTop ?? best.gold);
      out.push({ band: band.id, from: band.from, to: band.to, region: band.region, pastKrell: !!band.pastKrell, goal,
        days: done ? Math.round(done.day * 100) / 100 : null, missing: done ? [] : missingOf(best).slice(0, 12),
        fills: (fills || []).map((f) => ({ ...f, day: (best.got || {})[f.item] ?? null })), restPerDay: best.day > 0 ? Math.round((best.restUsed || 0) / best.day / sc.party * 100) / 100 : 0,
        grounds: best.groundLog, used: [...new Set([...(best.usedSids || []), ...(best.usedTown || [])])], hunted: Math.round(best.hunted - (opts.huntedAt ? opts.huntedAt(band.from) : band.from * 10)), boughtGold: best.boughtGold || 0, rates: recordRates ? best.rates : undefined, targets: [...targets].map(([i, n]) => [i, n]) });
    }
    return out;
  }

  /* ── 200 SEEDED RUNS of one band's plan: each target's time from the plan's own daily rates (an inhomogeneous Poisson clock) ── */
  function sample(bandRun, n = 200, seed = 1) {
    if (!bandRun || !bandRun.rates || bandRun.days === null) return null;
    let s = seed >>> 0 || 1;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
    const byItem = new Map();
    for (const [day, item, units] of bandRun.rates) { if (!byItem.has(item)) byItem.set(item, []); byItem.get(item).push([day, units]); }
    const need = new Map(bandRun.targets);
    const spans = [];
    for (let k = 0; k < n; k++) {
      let worst = 0;
      for (const [item, list] of byItem) {
        const want = need.get(item) || 1;
        let e = 0; for (let i = 0; i < Math.ceil(want); i++) e += -Math.log(1 - rnd());
        let cum = 0, t = null;
        for (const [day, units] of list) { cum += units; if (cum >= e) { t = day; break; } }
        if (t === null) { const last = list[list.length - 1]; const perDay = list.length ? list.reduce((x, y) => x + y[1], 0) / Math.max(1, last[0]) : 0; t = last[0] + (perDay > 0 ? (e - cum) / perDay : 9999); }
        worst = Math.max(worst, t);
      }
      spans.push(Math.max(worst, bandRun.days * 0));
    }
    spans.sort((a, b) => a - b);
    const q = (p) => Math.round(spans[Math.min(spans.length - 1, Math.floor(p * spans.length))] * 100) / 100;
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), runs: n };
  }

  return { levelPath, screenPath, gearPath, sample, options, targetsFor };
}
