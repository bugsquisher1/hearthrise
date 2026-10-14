// ════════════════════════════════════════════════════════════════════════
// src/render/combat-observer.js — ONE OBSERVER OF THE LIVE SWING.
//
// Extracted from legacy.js's arena wrapper (lane W3). Before this, the arena
// stage wrapped `window.combatTick` itself and diffed HP before/after to pop
// damage numbers; a second viewer (the World pane's hunt scene) would have had
// to wrap it again, or sample the fight from requestAnimationFrame — and rAF
// stops on a hidden tab, so three kills while the tab was in the background
// would arrive as ONE change. So there is one post-tap on `combatTick`, it turns
// every swing into one BEAT, and every viewer subscribes:
//   src/render/arena-vs.js        the fight view's portraits (damage pops, death FX)
//   src/world/hunt-scene.js       the World pane's hunt (through world-boot.js)
//
// A BEAT DESCRIBES A SWING; IT DECIDES NOTHING. It is computed from the fight
// as the tick left it — the client's display prediction of the swing, the same
// numbers the arena always popped — and no reader may spend it: nothing here
// writes G, and a kill is read off the fight's own counter
// (`combatKillsThisFoe`, which the envelope's `state.fight` carries) or a foe
// change inside the tick, never off the lifetime `G.stats` residue.
//
// snapshot() is the fight as a viewer should draw it right now, plus whether
// the hero is knocked out by the server's clock (`recovering_until`, read
// through HearthriseAccrual.fallState — a read, never the tick's own gate).
// ════════════════════════════════════════════════════════════════════════

/** The fight as the client holds it: { foe, foeHp, foeMaxHp, heroHp, heroMaxHp, kills }. */
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
 * One swing, from the fight before and after the tick. Null when no swing was
 * taken (no foe, or the hero was down — the tick returns before it swings).
 * @param {object} b  fightOf() before the tick
 * @param {object} a  fightOf() after it
 * @param {{at:number, tickMs:number, crit:boolean, wasDown:boolean, downAfter:boolean}} o
 */
export function beatOf(b, a, o) {
  if (!b || !a || !b.foe || o.wasDown) return null;
  /* A kill is the fight's own counter moving, or the hunt rolling the next foe
     inside this tick (resolveKill resets the counter when the foe changes). */
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

/** The knockout as the server stated it: { phase: 'recovering'|'pending', until } or null. */
function downOf(win) {
  const A = win.HearthriseAccrual;
  if (!A || typeof A.fallState !== 'function') return null;
  let st = null;
  try { st = A.fallState(); } catch (e) { return null; }
  if (!st || (st.phase !== 'recovering' && st.phase !== 'pending')) return null;
  return { phase: st.phase, until: st.phase === 'recovering' ? Number(st.until) || 0 : 0 };
}

/** Wrap `win.combatTick` once and publish `win.HearthriseCombatObserver`. */
export function installCombatObserver(win) {
  if (win.HearthriseCombatObserver) return win.HearthriseCombatObserver;
  const subs = new Set();
  let beats = 0;
  const tickMs = () => {
    try { return typeof win.combatTickMs === 'function' ? Number(win.combatTickMs()) || 0 : 0; } catch (e) { return 0; }
  };
  const peekDown = () => {
    try { return typeof win.hrCombatDownPeek === 'function' && !!win.hrCombatDownPeek(); } catch (e) { return false; }
  };
  const orig = win.combatTick;
  if (typeof orig === 'function') {
    win.combatTick = function () {
      const wasDown = peekDown();
      const before = fightOf(win.G);
      const r = orig.apply(this, arguments);
      const beat = beatOf(before, fightOf(win.G), {
        at: Date.now(), tickMs: tickMs(), crit: !!(win.G && win.G._lastPlayerCrit), wasDown, downAfter: peekDown(),
      });
      if (beat) {
        beats++;
        for (const fn of subs) { try { fn(beat); } catch (e) { console.error('[combat-observer] a subscriber threw', e); } }
      }
      return r;
    };
  }
  const api = Object.freeze({
    /** fn(beat) on every swing; returns the unsubscribe. */
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    snapshot() { return Object.assign(fightOf(win.G), { tickMs: tickMs(), down: downOf(win) }); },
    stats() { return { beats, subscribers: subs.size }; },
  });
  win.HearthriseCombatObserver = api;
  return api;
}
