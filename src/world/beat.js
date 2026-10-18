// ════════════════════════════════════════════════════════════════════════
// src/world/beat.js — A SWING, AS THE HUNT SCENE DRAWS IT.
//
// The World's hunt (hunt-scene.js) is staged from BEATS: one per swing, the
// difference between the fight before it and the fight after it. This module
// is that difference and nothing else — pure, DOM-free, writes nothing. It
// moved here from the old client's src/render/combat-observer.js when that
// client was deleted (2026-10-17); its tick wrapper did not (the new client
// runs no tick: fights are the server's, and a view diffs the server's states).
//
// A BEAT DESCRIBES A SWING; IT DECIDES NOTHING. A kill is read off the fight's
// own counter (`combatKillsThisFoe`, which the envelope's `state.fight`
// carries) or a foe change, never off a lifetime tally.
// ════════════════════════════════════════════════════════════════════════

/** The fight as a view holds it: { foe, foeHp, foeMaxHp, heroHp, heroMaxHp, kills }. */
export function fightOf(G) {
  const g = G || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    foe: g.activeMonster || null,
    foeHp: n(g.monsterHp), foeMaxHp: n(g.monsterMaxHp),
    heroHp: n(g.playerHp), heroMaxHp: n(g.playerMaxHp),
    kills: n(g.combatKillsThisFoe),
  };
}

/**
 * One swing, from the fight before and after. Null when no swing was taken (no
 * foe, or the hero was down — a downed hero does not swing).
 * @param {object} b  fightOf() before
 * @param {object} a  fightOf() after
 * @param {{at:number, tickMs:number, crit:boolean, wasDown:boolean, downAfter:boolean}} o
 */
export function beatOf(b, a, o) {
  if (!b || !a || !b.foe || o.wasDown) return null;
  /* A kill is the fight's own counter moving, or the hunt rolling the next foe
     inside this swing (resolveKill resets the counter when the foe changes). */
  const killed = a.kills > b.kills || (!!a.foe && a.foe !== b.foe);
  const foeDmg = killed ? Math.max(1, b.foeHp) : Math.max(0, b.foeHp - a.foeHp);
  return {
    at: o.at, tickMs: o.tickMs,
    foe: b.foe, next: a.foe,
    killed, foeDmg, crit: !!o.crit && foeDmg > 0,
    miss: !killed && foeDmg === 0,
    heroDmg: killed ? 0 : Math.max(0, b.heroHp - a.heroHp),
    downAfter: !!o.downAfter,
  };
}
