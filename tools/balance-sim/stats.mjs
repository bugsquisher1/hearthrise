// tools/balance-sim/stats.mjs — the few statistics the simulator reports (pure, no game code).
//
// Rates of rare events (deaths, close calls) are Poisson counts over measured hours; their interval is the exact
// (Garwood) 95% interval, so "0 deaths in 1,000 h" reads as "fewer than 3.7 per 1,000 h at 95%", never as zero.

/* ln Γ (Lanczos), for the Poisson / chi-square quantiles below. */
function lnGamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/* The regularised lower incomplete gamma P(a, x). */
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, del = sum;
    for (let n = 1; n < 500; n++) { del *= x / (a + n); sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/* x such that P(a, x) = p (bisection: robust, plenty fast for a report). */
function gammaQuantile(a, p) {
  let lo = 0, hi = Math.max(10, a * 10 + 50);
  while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The exact 95% interval of a Poisson count `k`: [lo, hi] expected counts. */
export function poissonCI(k, conf = 0.95) {
  const a = (1 - conf) / 2;
  const lo = k === 0 ? 0 : gammaQuantile(k, a);
  const hi = gammaQuantile(k + 1, 1 - a);
  return [lo, hi];
}

/** A rate per `per` hours of `k` events over `hours`, with its 95% interval: { rate, lo, hi, k, hours }. */
export function rateCI(k, hours, per) {
  if (!(hours > 0)) return { rate: null, lo: null, hi: null, k, hours: 0 };
  const [lo, hi] = poissonCI(k);
  const f = per / hours;
  return { rate: round(k * f, 3), lo: round(lo * f, 3), hi: round(hi * f, 3), k, hours: round(hours, 2) };
}

/** The p-quantile of a list of numbers (nearest rank), null for an empty list. */
export function quantile(xs, p) {
  if (!xs || !xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

/** Mean and the standard error of the mean of per-seed values: { mean, se, n }. */
export function meanSe(xs) {
  const v = (xs || []).filter((x) => Number.isFinite(x));
  if (!v.length) return { mean: null, se: null, n: 0 };
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1)) : 0;
  return { mean: round(m, 2), se: round(sd / Math.sqrt(v.length), 2), n: v.length };
}

/** Round to `d` decimals (null stays null). */
export function round(x, d = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Gini coefficient of a list of non-negative counts (0 = perfectly even). */
export function gini(xs) {
  const v = (xs || []).slice().sort((a, b) => a - b);
  const n = v.length, tot = v.reduce((s, x) => s + x, 0);
  if (!n || !tot) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return round((2 * cum) / (n * tot) - (n + 1) / n, 3);
}
