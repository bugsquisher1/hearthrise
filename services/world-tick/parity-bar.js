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
    /* "deaths, ate: per probe |Δ| ≤ 1; aggregate within ±10 %" */
    maxCountDelta: 1,
    countAggFrac: 0.10,
    /* "ticks (death-bearing probes), kills, gold, xp: aggregate within ±10 %" */
    valueAggFrac: 0.10,
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
 * @param probes  [{ id, spanMs, discard: null|string, one, chain }]
 * @param opts    { rareIds: Set<string> } — LUCKY_IDS for combat starvation
 * @returns { verdict, reasons[], stats }
 */
export function judgeGroup(channel, probes, opts) {
  const rareIds = (opts && opts.rareIds) || new Set();
  const reasons = [];
  const all = probes || [];
  const discarded = all.filter((p) => p.discard);
  const live = all.filter((p) => !p.discard).map((p) => ({
    id: p.id, spanMs: num(p.spanMs), one: normSummary(p.one), chain: normSummary(p.chain),
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
      for (const f of ['deaths', 'ate']) {
        const d = Math.abs(b[f] - a[f]);
        if (d > bar.maxCountDelta) fails.push(`probe ${p.id}: |Δ${f}| ${d} > ${bar.maxCountDelta}`);
        if ((a[f] === 0) !== (b[f] === 0)) fails.push(`probe ${p.id}: ${f} ${a[f]} vs ${b[f]} — zero against non-zero`);
      }
      if (a.deaths === 0 && b.deaths === 0 && a.ticks !== b.ticks) {
        fails.push(`probe ${p.id}: no deaths on either side and ticks ${b.ticks} ≠ ${a.ticks} (must be EXACT)`);
      }
      if ((a.deaths > 0 || b.deaths > 0) && !(a.recoverOk && b.recoverOk)) {
        fails.push(`probe ${p.id}: a death-bearing row has an unparseable recovering_until`);
      }
    }
    const perProbeDefect = fails.length > 0;
    if (!perProbeDefect && (live.length < bar.minProbes || spanMs < bar.minSpanMs)) {
      return { verdict: 'INSUFFICIENT',
        reasons: [`${live.length} probes / ${stats.hours} h; the bar needs ≥ ${bar.minProbes} / ≥ ${bar.minSpanMs / 3600000} h`],
        stats };
    }
    const ateN = live.filter((p) => Math.max(p.one.ate, p.chain.ate) > 0).length;
    const deathN = live.filter((p) => Math.max(p.one.deaths, p.chain.deaths) > 0).length;
    stats.ateProbes = ateN; stats.deathProbes = deathN;
    if (ateN < bar.minAteProbes) fails.push(`non-vacuity: ${ateN} probes ate (need ≥ ${bar.minAteProbes})`);
    if (deathN < bar.minDeathProbes) fails.push(`non-vacuity: ${deathN} probes died (need ≥ ${bar.minDeathProbes})`);
    for (const f of ['deaths', 'ate']) {
      const { one, chain } = agg(f);
      stats[f] = { one, chain };
      if (!withinFrac(one, chain, bar.countAggFrac)) {
        fails.push(`aggregate ${f}: ${chain} vs ${one} (${pct(one, chain)}) outside ±${bar.countAggFrac * 100}%`);
      }
    }
    const deathBearing = live.filter((p) => p.one.deaths > 0 || p.chain.deaths > 0);
    const tOne = sumBy(deathBearing, (p) => p.one.ticks);
    const tChain = sumBy(deathBearing, (p) => p.chain.ticks);
    stats.ticks = { one: tOne, chain: tChain, over: 'death-bearing probes' };
    if (!withinFrac(tOne, tChain, bar.valueAggFrac)) {
      fails.push(`aggregate ticks (death-bearing): ${tChain} vs ${tOne} (${pct(tOne, tChain)}) outside ±${bar.valueAggFrac * 100}%`);
    }
    for (const f of ['kills', 'gold', 'xp']) {
      const { one, chain } = agg(f);
      stats[f] = { one, chain };
      if (!withinFrac(one, chain, bar.valueAggFrac)) {
        fails.push(`aggregate ${f}: ${chain} vs ${one} (${pct(one, chain)}) outside ±${bar.valueAggFrac * 100}%`);
      }
    }
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
