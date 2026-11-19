// Exposure model for the 1k/2k/3k tiers. Scores are the audit's per-surface reads of the screenshots (0-100, 85 = the bar).
// A place's screen = its map plus what moves on it: a hunt 0.60 map + 0.25 hero combat animation + 0.15 effects;
// the town 0.85 map + 0.15 town life; other screens their map. Icons (bag, bar, shop, hunts list) are a 10% overlay slice.
const BAR = 85;
const A = { cellar: 1.5, thicket: 9, sewer: 10, wickstead: 8, glade: 18, warrens: 24, ford: 2, slake: 0, muster: 0, pyre: 0, krell: 0, tower: 2.5,
  hearth: 9, gate: 4, districts: 7, home: 2.5, charscreen: 1, sandbox: 0.5, catacombs: 0 };            // a new player's first 100 hours
const B = { cellar: 0, thicket: 0, sewer: 0, wickstead: 0, glade: 0, warrens: 0, ford: 6, slake: 8, muster: 12, pyre: 18, krell: 16, tower: 15,
  hearth: 9, gate: 4, districts: 5, home: 4, charscreen: 1, sandbox: 0, catacombs: 2 };               // today's lead heroes (Level 90-110)
const HUNT = new Set(['cellar', 'thicket', 'sewer', 'wickstead', 'glade', 'warrens', 'ford', 'slake', 'muster', 'pyre', 'krell', 'tower', 'catacombs']);
const TOWN = new Set(['hearth', 'gate', 'districts']);
const now = { m: { cellar: 60, thicket: 65, sewer: 45, wickstead: 50, glade: 55, warrens: 50, ford: 60, slake: 50, muster: 55, pyre: 75, krell: 50, tower: 70,
  hearth: 55, gate: 85, districts: 55, home: 40, charscreen: 35, sandbox: 0, catacombs: 55 }, H: 50, V: 65, L: 65, I: 78, hFrac: 0 };
const t1 = { m: { ...now.m, cellar: 85, thicket: 85, sewer: 85, wickstead: 85, glade: 85, warrens: 85, hearth: 88, districts: 62, charscreen: 75, sandbox: null },
  H: 0.7 * 90 + 0.3 * 50, V: 85, L: 65, I: 86, hFrac: 0.7 };
const t2 = { m: { ...t1.m, ford: 85, slake: 85, home: 85, districts: 85 }, H: 90, V: 85, L: 80, I: 89, hFrac: 1 };
const t3 = { m: { ...t2.m, muster: 85, pyre: 88, krell: 85, tower: 85, catacombs: 85, charscreen: 85 }, H: 90, V: 90, L: 85, I: 92, hFrac: 1 };
function score(w, s) {
  let tot = 0, q = 0, atBar = 0;
  const sb = s.m.sandbox === null;
  for (const [k, e0] of Object.entries(w)) {
    let e = e0;
    if (k === 'sandbox' && sb) continue;
    if (k === 'hearth' && sb) e += w.sandbox;       // the sandbox's minutes go back to the square once it is shut
    const m = s.m[k];
    const v = HUNT.has(k) ? 0.6 * m + 0.25 * s.H + 0.15 * s.V : TOWN.has(k) ? 0.85 * m + 0.15 * s.L : m;
    const ok = HUNT.has(k) ? (m >= BAR && s.V >= BAR ? s.hFrac : 0) : TOWN.has(k) ? (m >= BAR && s.L >= 75 ? 1 : 0) : (m >= BAR ? 1 : 0);
    tot += e; q += e * v; atBar += e * ok;
  }
  const world = q / tot, share = atBar / tot;
  return { Q: Math.round(0.9 * world + 0.1 * s.I), share: Math.round(100 * (0.9 * share + 0.1 * (s.I >= BAR ? 1 : 0))) };
}
for (const [n, s] of Object.entries({ now, t1, t2, t3 })) console.log(n, 'new-player', JSON.stringify(score(A, s)), 'lead-heroes', JSON.stringify(score(B, s)));
