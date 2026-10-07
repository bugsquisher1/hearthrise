// ============================================================================
// services/world-tick/parity-bar.js — THE PROBE ACCEPTANCE BAR, ONE DEFINITION.
//
// Security ruling 1, docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md, section
// "Acceptance bar (per character, per channel, every number read per probe AND
// in aggregate — never across characters)". Transcribed rule by rule; each
// constant below names the sentence it comes from.
//
// Two callers, one comparator, so the bar that is calibrated is the bar that
// is read:
//   tools/world-tick-parity.mjs        production rows (read-only)
//   tests/world-tick-probe-bar.mjs     the 4 h fixture calibration + mutants
//
// COMBAT, REVISED by SEC_VIGOUR_LINE_SPLIT_2026-10-06.md "Bar ruling": the
// ±10 % is applied to each probe's SEEDED REPLAY EXPECTATION in aggregate
// (services/world-tick/parity-replay.js), with the aggregate's standard error
// ≤ bar/3 — above that the read is INSUFFICIENT ("add probes, never widen").
// The LIVE realised pair is judged by z against its own replay distribution
// (|z| ≤ 3.29 on the read's summed pair; |z| ≤ 4.3 on every probe,
// SEC_PROBE_RETAIN_2026-10-06 B2). The realised-pair ±10 % aggregates and the per-probe |Δ| ≤ 1
// count rule are retired: on death-dominated and food-exhausted probes they
// false-fail correct engines — and those probes are where the vigour-line
// defect lived, so they stay in. Gather is exact and unchanged.
//
// Pure: no I/O, no clock, no randomness. Node + Deno.
// ============================================================================

export const BAR = Object.freeze({
  /* "If more than 20 % of probes in the read are discarded, the read is not
     readable — report, do not average." */
  maxDiscardFrac: 0.20,
  gather: Object.freeze({
    /* "≥ 6 eligible probes totalling ≥ 24 h" */
    minProbes: 6,
    minSpanMs: 24 * 3600 * 1000,
    /* "|Δticks| ≤ 1" */
    maxTickDelta: 1,
    /* "qty, gold, xp within ±0.5 %" (aggregate) */
    aggregateFrac: 0.005,
    /* "Any RNG-bearing gather drop: band ±10 % aggregate" */
    rngItemFrac: 0.10,
  }),
  combat: Object.freeze({
    /* "≥ 12 eligible probes totalling ≥ 48 h" */
    minProbes: 12,
    minSpanMs: 48 * 3600 * 1000,
    /* "the probe set must contain ≥ 2 probes with ate > 0 and ≥ 2 with deaths > 0" */
    minAteProbes: 2,
    minDeathProbes: 2,
    /* SEC_VIGOUR_LINE_SPLIT "Bar ruling": "|Δ| ≤ 10 % and ≤ 3 se" on the
       aggregate replay expectation of ticks (death-bearing probes), kills,
       gold, xp, deaths, ate — and "if the aggregate replay se is above bar/3,
       add probes rather than widening the bar". */
    replayFrac: 0.10,
    replaySeMax: 0.10 / 3,
    replaySeK: 3,
    replayFields: Object.freeze(['ticks', 'kills', 'gold', 'xp', 'deaths', 'ate']),
    /* A replay needs a spread to be a distribution. */
    minReplicas: 2,
    /* "the live realised pair is judged by z against its own replay
       distribution (|z| ≤ 3.29)". The pair is the READ's realised pair —
       Σ chain − Σ one over the probes, the very quantity the retired
       "aggregate within ±10 %" rule read — against the replay distribution
       of that sum (means add, variances add: the probes' seeds are
       independent). Per field, four tests at two-sided p = 0.001.
       Per-probe z at 3.29 is REPORTED (stats.replay.zWorst), not barred:
       scored on 12 probes x 4 fields at 3.29 a correct engine false-fails
       ~5 % of reads, and the C6 calibration set holds exactly such a draw
       (the "NINE inputs" probe's own one-span seed is a 1-in-~1000 tail,
       per-probe z −3.0 at 80 replicas, −3.5 at the probe-bar's 12). */
    zMax: 3.29,
    /* SEC_PROBE_RETAIN_2026-10-06 B2 hardening: ANY per-probe |z| > 4.3 is a
       FAIL as well — Bonferroni over 48 tests (12 probes x 4 fields) at
       family p 0.001 — so two offsetting probe defects cannot cancel inside
       the summed pair. The C6 probe at −3.5 stays inside. */
    zProbeMax: 4.3,
    zFields: Object.freeze(['ticks', 'kills', 'gold', 'xp']),
    /* "red if either side has ≤ 2 of ≥ 12" */
    directionMinSide: 2,
    /* SEC_WORLD_TICK_PROBE_2026-10-05.md (a): "score a direction field only
       when it has ≥ 12 non-tied probes; below that it reads INSUFFICIENT,
       never FAIL." Zero-death probes MUST tie on ticks (the bar above demands
       it exact), so a correct engine on a low-death character has few
       non-tied ticks probes, and scoring them would read it red. */
    directionMinNonTied: 12,
    directionFields: Object.freeze(['ticks', 'kills', 'gold', 'xp']),
  }),
  /* "a row reached ≥ 2× by the one-span set and 0× by the windows set" */
  starveOneMin: 2,
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sumBy = (xs, f) => xs.reduce((a, x) => a + num(f(x)), 0);

/* A summary, normalised: ticks, qty, gold, kills, ate, deaths, xp (a TOTAL over
   skills), items {id: signed n}, recoverOk (every death-bearing row's
   recovering_until parses). */
export function normSummary(s) {
  const o = s || {};
  const xp = (o.xp && typeof o.xp === 'object')
    ? Object.values(o.xp).reduce((a, v) => a + num(v), 0) : num(o.xp);
  const items = {};
  for (const k of Object.keys(o.items || {})) items[k] = num(o.items[k]);
  return {
    ticks: num(o.ticks), qty: num(o.qty), gold: num(o.gold), kills: num(o.kills),
    ate: num(o.ate), deaths: num(o.deaths), xp, items,
    recoverOk: o.recoverOk !== false,
  };
}

/* Within ±frac of the one-span total. A zero reference admits only a zero. */
function withinFrac(one, chain, frac) {
  if (one === 0) return chain === 0;
  return Math.abs(chain - one) <= frac * Math.abs(one);
}

/* "one action's yield": the larger side's total over the larger tick count,
   rounded up. Gather's tool double roll makes it fractional; the bar is ONE
   action, so it is a ceiling, never a multiple. */
function perAction(one, chain, tOne, tChain) {
  const t = Math.max(1, tOne, tChain);
  return Math.ceil(Math.max(Math.abs(one), Math.abs(chain)) / t);
}

/**
 * Judge ONE character's ONE channel.
 * @param channel 'gather' | 'combat'
 * @param probes  [{ id, spanMs, discard: null|string, one, chain, replay? }]  (replay: combat, parity-replay.js)
 * @param opts    { rareIds: Set<string> } — LUCKY_IDS for combat starvation
 * @returns { verdict, reasons[], stats }
 */
export function judgeGroup(channel, probes, opts) {
  const rareIds = (opts && opts.rareIds) || new Set();
  const reasons = [];
  const all = probes || [];
  const discarded = all.filter((p) => p.discard);
  const live = all.filter((p) => !p.discard).map((p) => ({
    id: p.id, spanMs: num(p.spanMs), one: normSummary(p.one), chain: normSummary(p.chain), replay: p.replay,
  }));
  const spanMs = sumBy(live, (p) => p.spanMs);
  const stats = {
    probes: live.length, discarded: discarded.length, hours: +(spanMs / 3600000).toFixed(2),
    discardReasons: discarded.reduce((m, p) => { m[p.discard] = (m[p.discard] || 0) + 1; return m; }, {}),
  };
  if (all.length === 0) return { verdict: 'INSUFFICIENT', reasons: ['no probes'], stats };
  if (discarded.length / all.length > BAR.maxDiscardFrac) {
    return {
      verdict: 'UNREADABLE',
      reasons: [`${discarded.length}/${all.length} probes discarded (> ${BAR.maxDiscardFrac * 100}%): `
        + JSON.stringify(stats.discardReasons)],
      stats,
    };
  }
  const bar = BAR[channel];
  if (!bar) return { verdict: 'FAIL', reasons: [`no bar for channel ${channel}`], stats };

  const agg = (f) => ({ one: sumBy(live, (p) => p.one[f]), chain: sumBy(live, (p) => p.chain[f]) });
  const fails = [];
  const insufficient = [];

  if (channel === 'gather') {
    for (const p of live) {
      const a = p.one; const b = p.chain;
      const dt = Math.abs(b.ticks - a.ticks);
      if (dt > bar.maxTickDelta) fails.push(`probe ${p.id}: |Δticks| ${dt} > ${bar.maxTickDelta}`);
      for (const f of ['qty', 'xp', 'gold']) {
        const lim = perAction(a[f], b[f], a.ticks, b.ticks);
        const d = Math.abs(b[f] - a[f]);
        if (d > lim) fails.push(`probe ${p.id}: |Δ${f}| ${d} > one action (${lim})`);
      }
    }
    const perProbeDefect = fails.length > 0;
    if (!perProbeDefect && (live.length < bar.minProbes || spanMs < bar.minSpanMs)) {
      return { verdict: 'INSUFFICIENT',
        reasons: [`${live.length} probes / ${stats.hours} h; the bar needs ≥ ${bar.minProbes} / ≥ ${bar.minSpanMs / 3600000} h`],
        stats };
    }
    for (const f of ['qty', 'gold', 'xp']) {
      const { one, chain } = agg(f);
      stats[f] = { one, chain };
      if (!withinFrac(one, chain, bar.aggregateFrac)) {
        fails.push(`aggregate ${f}: ${chain} vs ${one} (${pct(one, chain)}) outside ±${bar.aggregateFrac * 100}%`);
      }
    }
    itemBands(live, bar.rngItemFrac, fails, null);
  } else {
    for (const p of live) {
      const a = p.one; const b = p.chain;
      if (a.deaths === 0 && b.deaths === 0 && a.ticks !== b.ticks) {
        fails.push(`probe ${p.id}: no deaths on either side and ticks ${b.ticks} ≠ ${a.ticks} (must be EXACT)`);
      }
      if ((a.deaths > 0 || b.deaths > 0) && !(a.recoverOk && b.recoverOk)) {
        fails.push(`probe ${p.id}: a death-bearing row has an unparseable recovering_until`);
      }
    }
    const perProbeDefect = fails.length > 0;
    if (!perProbeDefect && (live.length < bar.minProbes || spanMs < bar.minSpanMs)) {
      /* Say now what the replay half will need too, so a short read does not
         hide that it could not be judged at any length. */
      const noReplay = live.filter((p) => !p.replay || p.replay.unavailable).reduce((m, p) => {
        const k = (p.replay && p.replay.unavailable) || 'no_replay'; m[k] = (m[k] || 0) + 1; return m;
      }, {});
      return { verdict: 'INSUFFICIENT',
        reasons: [`${live.length} probes / ${stats.hours} h; the bar needs ≥ ${bar.minProbes} / ≥ ${bar.minSpanMs / 3600000} h`]
          .concat(Object.keys(noReplay).length ? [`replay unavailable: ${JSON.stringify(noReplay)}`] : []),
        stats };
    }
    const ateN = live.filter((p) => Math.max(p.one.ate, p.chain.ate) > 0).length;
    const deathN = live.filter((p) => Math.max(p.one.deaths, p.chain.deaths) > 0).length;
    stats.ateProbes = ateN; stats.deathProbes = deathN;
    if (ateN < bar.minAteProbes) fails.push(`non-vacuity: ${ateN} probes ate (need ≥ ${bar.minAteProbes})`);
    if (deathN < bar.minDeathProbes) fails.push(`non-vacuity: ${deathN} probes died (need ≥ ${bar.minDeathProbes})`);
    /* Realised totals are REPORTED, never barred (the ruling). Ticks over the
       death-bearing probes, as before (a deathless probe ties exactly). */
    for (const f of ['kills', 'gold', 'xp', 'deaths', 'ate']) stats[f] = agg(f);
    const deathBearing = live.filter((p) => p.one.deaths > 0 || p.chain.deaths > 0);
    stats.ticks = { one: sumBy(deathBearing, (p) => p.one.ticks), chain: sumBy(deathBearing, (p) => p.chain.ticks),
      over: 'death-bearing probes' };
    replayBar(live, bar, fails, insufficient, stats);
    /* THE DIRECTION TEST — "the real bar". Δ = windows − one-span; ties
       excluded; red if either sign has ≤ 2 probes. SCORED ONLY on a field
       with ≥ directionMinNonTied non-tied probes (Security (a)); a field below
       that is INSUFFICIENT and holds the group at INSUFFICIENT, so an
       unscored real bar can never read as a PASS either. */
    stats.direction = {};
    for (const f of bar.directionFields) {
      const neg = live.filter((p) => p.chain[f] < p.one[f]).length;
      const pos = live.filter((p) => p.chain[f] > p.one[f]).length;
      const scored = neg + pos >= bar.directionMinNonTied;
      stats.direction[f] = { neg, pos, ties: live.length - neg - pos, verdict: scored ? 'SCORED' : 'INSUFFICIENT' };
      if (!scored) {
        insufficient.push(`direction ${f}: ${neg + pos} non-tied probes (${neg} below / ${pos} above); `
          + `scored only at ≥ ${bar.directionMinNonTied}`);
      } else if (Math.min(neg, pos) <= bar.directionMinSide) {
        fails.push(`direction ${f}: ${neg} probes below / ${pos} above — one-signed (either side ≤ ${bar.directionMinSide})`);
      }
    }
    itemBands(live, null, fails, rareIds);
  }

  if (fails.length) return { verdict: 'FAIL', reasons: fails, stats };
  if (insufficient.length) return { verdict: 'INSUFFICIENT', reasons: insufficient, stats };
  return { verdict: 'PASS', reasons: [], stats };
}

/* ── THE REPLAY BAR (combat) ─────────────────────────────────────────────────
   Each live probe carries `replay` (parity-replay.js replayStats) or
   `{ unavailable: reason }`. Without a replay on EVERY probe nothing is
   averaged: the read is INSUFFICIENT and names why. */
function replayBar(live, bar, fails, insufficient, stats) {
  const missing = live.filter((p) => !p.replay || p.replay.unavailable
    || !(Number(p.replay.replicas) >= bar.minReplicas));
  if (missing.length) {
    const why = missing.reduce((m, p) => {
      const k = (p.replay && p.replay.unavailable) || (p.replay ? `replicas<${bar.minReplicas}` : 'no_replay');
      m[k] = (m[k] || 0) + 1; return m;
    }, {});
    insufficient.push(`replay unavailable on ${missing.length}/${live.length} probes ${JSON.stringify(why)} — `
      + 'the combat bar is read on the seeded replay expectation, never on the realised pair alone');
    return;
  }
  /* The replay must BE the probe's engine: the one span re-run on the probe's
     own seed reproduces the stored result, or the read means nothing. */
  for (const p of live) {
    if (p.replay.reproduced === false) {
      fails.push(`probe ${p.id}: the stored one-span result does not reproduce from its input + seed on the replay engine`
        + (p.replay.reproduceDetail ? ` (${p.replay.reproduceDetail})` : ''));
    }
  }
  const unproven = live.filter((p) => p.replay.reproduced !== true && p.replay.reproduced !== false).length;
  if (unproven) {
    insufficient.push(`${unproven}/${live.length} probes could not be reproduced from input + seed `
      + '(the seed is not known to this reader), so the replay is not proven to be the probe engine');
  }

  /* AGGREGATE EXPECTATION: Σ E[chain − one] over Σ E[one]; its se from the
     per-replica spread. Ticks over death-bearing probes only (a probe with no
     death in expectation ties on ticks exactly and would dilute the read). */
  stats.replay = {};
  for (const f of bar.replayFields) {
    const set = f === 'ticks'
      ? live.filter((p) => p.replay.one.deaths.mean > 0 || p.replay.chain.deaths.mean > 0)
      : live;
    if (set.length === 0) continue;
    const one = sumBy(set, (p) => p.replay.one[f].mean);
    const d = sumBy(set, (p) => p.replay.delta[f].mean);
    const v = sumBy(set, (p) => (p.replay.delta[f].sd ** 2) / p.replay.replicas);
    if (one === 0) {
      stats.replay[f] = { one, chain: d, rel: null, se: null };
      if (d !== 0) fails.push(`replay ${f}: chain expects ${d.toFixed(2)} against a one-span expectation of zero`);
      continue;
    }
    const rel = d / Math.abs(one);
    const se = Math.sqrt(v) / Math.abs(one);
    stats.replay[f] = { one: +one.toFixed(2), chain: +(one + d).toFixed(2), rel: +rel.toFixed(4), se: +se.toFixed(4), probes: set.length };
    /* "|Δ| ≤ 10 % AND ≤ 3 se": the expectation must be inside the bar AND
       consistent with zero. With se ≤ bar/3 the second is the tighter one,
       and it sees a bias the bar alone would not: a +12 % defect on a read
       whose noise sits at −3 % reads +8 % — inside ±10 %, at 5 se. */
    const where = `chain vs one-span expectation ${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(2)}% (se ${(se * 100).toFixed(2)}%)`;
    /* Too imprecise to PASS — but an expectation past the bar by more than
       3 se is a breach at any precision, so imprecision never hides it. */
    if (se > bar.replaySeMax && Math.abs(rel) - bar.replayFrac > bar.replaySeK * se) {
      fails.push(`replay ${f}: ${where} outside ±${bar.replayFrac * 100}% by more than ${bar.replaySeK} se`);
    } else if (se > bar.replaySeMax) {
      insufficient.push(`replay ${f}: ${where}; se > bar/3 (${(bar.replaySeMax * 100).toFixed(2)}%) — `
        + 'add probes or replicas; the bar is never widened');
    } else if (Math.abs(rel) > bar.replayFrac) {
      fails.push(`replay ${f}: ${where} outside ±${bar.replayFrac * 100}%`);
    } else if (Math.abs(rel) > bar.replaySeK * se) {
      fails.push(`replay ${f}: ${where} is ${(Math.abs(rel) / se).toFixed(1)} se from zero (> ${bar.replaySeK}) — a bias, not noise`);
    }
  }

  /* LIVE z, on the read: the realised Σ(chain − one) against the replay
     distribution of that sum. A field with no spread anywhere is
     deterministic for these inputs and must match exactly. */
  stats.replay.z = {};
  for (const f of bar.zFields) {
    const dl = sumBy(live, (p) => p.chain[f] - p.one[f]);
    const mean = sumBy(live, (p) => p.replay.delta[f].mean);
    const sd = Math.sqrt(sumBy(live, (p) => p.replay.delta[f].sd ** 2));
    if (!(sd > 0)) {
      stats.replay.z[f] = null;
      if (Math.abs(dl - mean) > 1e-9) fails.push(`live ${f}: Σ Δ ${dl} but every replay gives ${mean} (no spread)`);
      continue;
    }
    const z = (dl - mean) / sd;
    stats.replay.z[f] = +z.toFixed(2);
    if (Math.abs(z) > bar.zMax) {
      fails.push(`live ${f}: realised Σ Δ ${dl} is z ${z.toFixed(2)} against its replay `
        + `(${mean.toFixed(1)} ± ${sd.toFixed(1)}), |z| > ${bar.zMax}`);
    }
  }
  /* Per probe: the worst |z| is reported; past BAR.combat.zProbeMax it is a
     FAIL (Bonferroni over the read's probe x field tests), so a +5 sd probe
     and a −5 sd probe cannot cancel in the summed pair above. */
  let zWorst = 0;
  for (const p of live) {
    for (const f of bar.zFields) {
      const { mean, sd } = p.replay.delta[f];
      if (!(sd > 0)) continue;
      const z = (p.chain[f] - p.one[f] - mean) / sd;
      if (Math.abs(z) > Math.abs(zWorst)) zWorst = z;
      if (Math.abs(z) > bar.zProbeMax) {
        fails.push(`probe ${p.id}: live ${f} Δ ${p.chain[f] - p.one[f]} is z ${z.toFixed(2)} against its own replay `
          + `(${mean.toFixed(1)} ± ${sd.toFixed(1)}), |z| > ${bar.zProbeMax} (Bonferroni over the read)`);
      }
    }
  }
  stats.replay.zWorst = +zWorst.toFixed(2);
}

/* Starvation (both channels) and, for gather, the ±10 % band on any item row
   whose per-probe difference exceeds one action (i.e. RNG-bearing). For combat
   the starvation scan is over `rareIds` only, as the ruling names it. */
function itemBands(live, rngFrac, fails, rareIds) {
  const keys = new Set();
  for (const p of live) {
    for (const k of Object.keys(p.one.items)) keys.add(k);
    for (const k of Object.keys(p.chain.items)) keys.add(k);
  }
  for (const k of [...keys].sort()) {
    const one = sumBy(live, (p) => Math.max(0, p.one.items[k] || 0));
    const chain = sumBy(live, (p) => Math.max(0, p.chain.items[k] || 0));
    const scanned = rareIds ? rareIds.has(k) : true;
    if (scanned && one >= BAR.starveOneMin && chain === 0) {
      fails.push(`starvation: ${k} reached ${one}× by the one-span set and 0× by the windows`);
    }
    if (rngFrac !== null) {
      const rng = live.some((p) => Math.abs((p.chain.items[k] || 0) - (p.one.items[k] || 0))
        > perAction(p.one.items[k] || 0, p.chain.items[k] || 0, p.one.ticks, p.chain.ticks));
      if (rng && !withinFrac(one, chain, rngFrac)) {
        fails.push(`RNG item ${k}: ${chain} vs ${one} (${pct(one, chain)}) outside ±${rngFrac * 100}%`);
      }
    }
  }
}

function pct(one, chain) {
  if (one === 0) return chain === 0 ? '±0%' : 'from zero';
  const v = ((chain - one) / Math.abs(one)) * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/**
 * Judge a whole read: group by (user, slot, channel) — never across
 * characters — and fold each channel to one line.
 * @param records [{ user, slot, channel, ...probe }]
 * @returns { groups: [{ key, channel, verdict, reasons, stats }], channels: {gather, combat} }
 */
export function judgeRead(records, opts) {
  const byKey = new Map();
  for (const r of records || []) {
    const key = `${r.user}:${r.slot}:${r.channel}`;
    if (!byKey.has(key)) byKey.set(key, { channel: r.channel, probes: [] });
    byKey.get(key).probes.push(r);
  }
  const groups = [];
  for (const [key, g] of [...byKey.entries()].sort()) {
    groups.push(Object.assign({ key, channel: g.channel }, judgeGroup(g.channel, g.probes, opts)));
  }
  const channels = {};
  for (const ch of ['gather', 'combat']) {
    const gs = groups.filter((g) => g.channel === ch);
    channels[ch] = gs.some((g) => g.verdict === 'FAIL') ? 'FAIL'
      : gs.some((g) => g.verdict === 'UNREADABLE') ? 'UNREADABLE'
        : gs.some((g) => g.verdict === 'PASS') ? 'PASS' : 'INSUFFICIENT';
  }
  return { groups, channels };
}
