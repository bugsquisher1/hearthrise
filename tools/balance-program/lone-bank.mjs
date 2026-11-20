// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/lone-bank.mjs — WHAT ONE LONE HERO HAS BANKED BY A LEVEL (the balance program's gold model, one table).
//
// BANK: gold one lone hero has banked by a Level, every drop sold (CITED: the board's "2026-11-18 Gold by band", 226k / 715k / 679k / 1.29M
// in Levels 15-30 / 30-45 / 45-60 / 60-75; about 50k before 15, ASSUMED). HOURS: the lone pace table (docs/design/balance-program/
// 10-real-players.md section 2, "Lone table"; 60 ASSUMED on its slope). Read by tools/balance-program/gold-model.mjs --slots and by the
// standing guard tests/slot-price-guard.mjs (the first hero slot stays within one lone hero's bank, Tyler 2026-11-20, call 24-9). If income
// is re-cut, this table moves with it and the guard re-judges the slot. PURE: no I/O.
// ════════════════════════════════════════════════════════════════════════

export const BANK = Object.freeze([[1, 0], [15, 50000], [30, 276000], [45, 991000], [60, 1670000], [75, 2960000]].map((r) => Object.freeze(r)));
export const HOURS = Object.freeze([[1, 0], [5, 0.32], [10, 6.3], [15, 17.9], [20, 26.6], [25, 37.0], [30, 52.5], [40, 103.1], [50, 165.4], [60, 240]].map((r) => Object.freeze(r)));

/** Piecewise-linear read of a [[x, y], ...] table; past its end, its last y. */
export const lerp = (t, x) => {
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
  return t.at(-1)[1];
};

/** The Level (in half Levels) at which one lone hero has banked `gold`, at most 75. */
export const levelAtBank = (gold, bank = BANK) => { for (let L = 1; L <= 75; L += 0.5) if (lerp(bank, L) >= gold) return L; return 75; };

/** Gold one lone hero has banked by the time it FINISHES Level `level` (it stands at Level level + 1). */
export const bankThrough = (level, bank = BANK) => Math.floor(lerp(bank, level + 1));
