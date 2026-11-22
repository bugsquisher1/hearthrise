// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/hud-ledger.js — WHAT THE LIVE PREDICTION PLAYED FOR THE VIEWER, SWING BY SWING (display only).
//
// The live engine (./live-engine.js) keeps one record a swing: the viewer's Level XP gained since its start point (its member's own
// count) and each monster kind the viewer stood in the world for the kill of, with its share (1 / the heroes there: coin and drops
// are split so). src/shell/hud-predict.js reads what was played after the saved point of the envelope the character holds, so the
// HUD rises between saves (the flush, supabase/functions/hr-accrue/hunt-settle.js). Nothing here is spent, credited or owned.
// PURE (no DOM, no clock).
// ════════════════════════════════════════════════════════════════════════

/* How many swings are kept: past the flush (90 s = 45 swings) and a save that comes late. */
const KEEP_GAINS = 256;

/** After one swing of the prediction `s` (the engine's state, its `gains` ledger) whose simulation answered `sim`: append its record. */
export function noteGains(s, sim, monsters) {
  const me = s.sides.find((x) => x.mi && x.mi.self === true);
  const last = s.gains[s.gains.length - 1];
  const unit = me && me.member ? me.member.unitId : null;
  const heroes = s.world ? s.world.units.filter((u) => u.side === 'hero' && u.alive).length : 0;
  let kills = last.kills, share = last.share;
  if (Number.isSafeInteger(unit) && heroes > 0) {
    for (const ev of sim.events) {
      const row = ev.type === 'kill' && sim.units ? sim.units[ev.t] : null;
      if (!row || !monsters[row[0]]) continue;
      if (kills === last.kills) { kills = { ...kills }; share = { ...share }; }
      kills[row[0]] = (kills[row[0]] || 0) + 1;
      share[row[0]] = (share[row[0]] || 0) + 1 / heroes;
    }
  }
  s.gains.push({ at: s.next, lx: me && typeof me.levelGained === 'function' ? Math.floor(me.levelGained()) : last.lx, kills, share });
  if (s.gains.length > KEEP_GAINS) s.gains.shift();
}

/**
 * THE GAINS AFTER A SAVE: the ledger's last record less the last one at or before `atMs` (a saved point): { lx, kills, share }.
 * A save at or past the prediction's last swing leaves nothing; one before the ledger's first record counts from its start.
 * @param {Array<{at: number, lx: number, kills: Record<string, number>, share: Record<string, number>}>} ledger
 * @param {number} atMs
 */
export function hudGainsSince(ledger, atMs) {
  if (!Array.isArray(ledger) || !ledger.length || !Number.isFinite(atMs)) return null;
  let base = ledger[0];
  for (const r of ledger) { if (r.at <= atMs) base = r; else break; }
  const top = ledger[ledger.length - 1];
  /** @param {Record<string, number>} a @param {Record<string, number>} b */
  const minus = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - (b[k] || 0)]).filter(([, v]) => Number(v) > 0));
  return { lx: Math.max(0, top.lx - base.lx), kills: minus(top.kills, base.kills), share: minus(top.share, base.share) };
}
