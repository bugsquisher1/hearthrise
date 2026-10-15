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
//   tools/world-tick-parity.mjs --selftest   the planted-row mutants
//
// GATHER ONLY since lane C2 (closed rebuild): the solo combat channel is retired
// (a fight is a hunt session, settled from the hunts cohort), so the combat bar,
// its seeded-replay half and its direction test were deleted with it. A combat
// probe has no bar and reads FAIL by name.
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
 * @param channel 'gather' (any other channel has no bar)
 * @param probes  [{ id, spanMs, discard: null|string, one, chain }]
 * @returns { verdict, reasons[], stats }
 */
export function judgeGroup(channel, probes) {
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
  const bar = channel === 'gather' ? BAR.gather : null;
  if (!bar) return { verdict: 'FAIL', reasons: [`no bar for channel ${channel}`], stats };

  const agg = (f) => ({ one: sumBy(live, (p) => p.one[f]), chain: sumBy(live, (p) => p.chain[f]) });
  const fails = [];

  {
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
    itemBands(live, bar.rngItemFrac, fails);
  }

  if (fails.length) return { verdict: 'FAIL', reasons: fails, stats };
  return { verdict: 'PASS', reasons: [], stats };
}

/* Starvation, and the ±10 % band on any item row whose per-probe difference
   exceeds one action (i.e. RNG-bearing). */
function itemBands(live, rngFrac, fails) {
  const keys = new Set();
  for (const p of live) {
    for (const k of Object.keys(p.one.items)) keys.add(k);
    for (const k of Object.keys(p.chain.items)) keys.add(k);
  }
  for (const k of [...keys].sort()) {
    const one = sumBy(live, (p) => Math.max(0, p.one.items[k] || 0));
    const chain = sumBy(live, (p) => Math.max(0, p.chain.items[k] || 0));
    if (one >= BAR.starveOneMin && chain === 0) {
      fails.push(`starvation: ${k} reached ${one}× by the one-span set and 0× by the windows`);
    }
    {
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
 * @returns { groups: [{ key, channel, verdict, reasons, stats }], channels: {gather} }
 */
export function judgeRead(records) {
  const byKey = new Map();
  for (const r of records || []) {
    const key = `${r.user}:${r.slot}:${r.channel}`;
    if (!byKey.has(key)) byKey.set(key, { channel: r.channel, probes: [] });
    byKey.get(key).probes.push(r);
  }
  const groups = [];
  for (const [key, g] of [...byKey.entries()].sort()) {
    groups.push(Object.assign({ key, channel: g.channel }, judgeGroup(g.channel, g.probes)));
  }
  const channels = {};
  for (const ch of ['gather']) {
    const gs = groups.filter((g) => g.channel === ch);
    channels[ch] = gs.some((g) => g.verdict === 'FAIL') ? 'FAIL'
      : gs.some((g) => g.verdict === 'UNREADABLE') ? 'UNREADABLE'
        : gs.some((g) => g.verdict === 'PASS') ? 'PASS' : 'INSUFFICIENT';
  }
  return { groups, channels };
}
