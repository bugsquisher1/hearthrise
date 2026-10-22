// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-scene.js — THE HUNT, AS ONE FRAME'S DRAW STATE.
//
// Glue between the fight and the renderer: the fight snapshot (the one swing
// observer's snapshot(), src/render/combat-observer.js) and its beats go into
// the choreography (choreo.js); out comes the state compose.js draws — the
// hero, the engaged foe with its name, HP bar and target square, the
// bystanders by name only, the fallen, the generic loot bags, the floats.
//
// What it shows is the client's display of the fight, nothing more: the
// numbers a player acts on (kills, XP/h, profit) are not here at all — they
// are the settled Analyzer's, painted by hunt-chrome.js. No item is ever named
// here: a predicted kill leaves a bag, and the bag says nothing.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { createChoreo, hash32 } from './choreo.js?v=0.2.29';

/**
 * @param {object} map  compileMap() output for a hunt map
 * @param {{huntId: string, since?: string|number, spawns: object[], nameOf: (id: string) => string}} o
 */
export function createHuntScene(map, o) {
  const ch = createChoreo(map, { seed: hash32(String(o.huntId) + ':' + String(o.since || '')), spawns: o.spawns });
  const name = (id) => (o.nameOf && o.nameOf(id)) || id;
  return {
    beat(b) { ch.beat(b, b.at); },
    /**
     * @param {{foe, foeHp, foeMaxHp, heroHp, heroMaxHp, tickMs, down}} snap  the fight now
     * @param {number} t  ms clock (the beats' clock)
     * @param {string|null} heroName
     */
    state(snap, t, heroName) {
      const down = !!(snap.down && (snap.down.phase === 'pending' || snap.down.until > t));
      ch.sync({ foe: snap.foe, tickMs: snap.tickMs, down }, t);
      const f = ch.frame(t);
      const pct = (a, b) => (b > 0 ? a / b : null);
      const units = [];
      for (const a of f.ambient) units.push(Object.assign({ plate: { text: name(a.id), kind: 'ambient' } }, a));
      for (const c of f.corpses) units.push(c);
      for (const g of f.bags) units.push({ id: 'loot_bag', x: g.x, y: g.y, alpha: g.alpha, anim: 'idle', dir: 's', age: 0 });
      for (const l of f.leaving) units.push(Object.assign({ plate: { text: name(l.id), kind: 'ambient' } }, l));
      if (f.foe) {
        units.push(Object.assign({ plate: { text: name(f.foe.id), kind: 'foe' }, bar: snap.foe === f.foe.id ? pct(snap.foeHp, snap.foeMaxHp) : null, target: true }, f.foe));
      }
      return {
        hero: Object.assign({}, f.hero, { plate: heroName ? { text: heroName, kind: 'self' } : null, bar: down ? null : pct(snap.heroHp, snap.heroMaxHp) }),
        units, floats: f.floats, down: f.down, foe: f.foe ? f.foe.id : null,
      };
    },
  };
}
