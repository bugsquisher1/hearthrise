// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/boss-bar.js — A BOSS'S BAR (Tyler 2026-11-05: "phases"): a called boss's (src/data/boss-calls.js), and a
// ground's boss with the same two lines (Captain Hask, src/data/grounds/muster_barrows; src/core/hunt/boss-phases.js).
//
// His name, his HP at the instant the world shows (the timeline's, as his sprite's own bar reads it), and a mark on each of
// his two lines. Past a line it says what that line brought. Display only: nothing reads it. Quiet when no boss is being
// fought, so the widget takes no room. Built once, patched in place.
// WHICH BOSS: in a called room, the room's boss for the whole fight (the room is the fight). On a ground, a boss with lines who
// stands hurt at the instant shown: the party is on him. Before the first blow, and once a reset heals him, the bar steps aside.
// ════════════════════════════════════════════════════════════════════════
import { callOfHunt, BOSS_CALL_WORDS, isGuarded } from '../../data/boss-calls.js?v=0.2.116';
import { MONSTERS } from '../../data/monsters.js?v=0.2.116';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.116';
import { text, cls, style } from '../../render/paint.js?v=0.2.116';

/** The skeleton (built once). */
export function renderBossBar() {
  return '<section class="hs-boss" role="group" aria-label="The boss"><div class="hs-boss-head"><b class="hs-boss-name"></b><span class="hs-boss-state"></span></div>'
    + '<div class="hs-boss-track" role="img"><i class="hs-boss-fill"></i><i class="hs-boss-mark is-adds"></i><i class="hs-boss-mark is-enrage"></i></div></section>';
}

/* Unit `u`'s HP in permille at the instant shown, or null before the world has shown it. */
function unitPmOf(cs, u, x) {
  const played = cs.timeline && typeof cs.timeline.hpAt === 'function' ? cs.timeline.hpAt(u, cs.now()) : null;
  const hp = played ? played.hp : x.hp, max = played ? played.maxHp : x.hpMax;
  return Number.isFinite(hp) && max > 0 ? Math.max(0, Math.min(1000, Math.round((hp * 1000) / max))) : null;
}

/* His HP in permille at the instant shown, or null before the world has shown him. */
function bossPmOf(cs, h, monster) {
  for (const [u, x] of h.units) if (x.kind === monster) return unitPmOf(cs, u, x);
  return null;
}

/* A GROUND'S BOSS BEING FOUGHT: the standing boss with lines (monsters.js `phases`) the instant shown has hurt, the lowest if two. */
function groundBossOf(cs, h) {
  let best = null;
  for (const [u, x] of h.units) {
    const row = x.side === 'monster' && x.alive !== false ? MONSTERS[x.kind] : null;
    if (!row || row.boss !== true || !row.phases) continue;
    const pm = unitPmOf(cs, u, x);
    if (pm === null || pm <= 0 || pm >= 1000) continue;
    if (!best || pm < best.pm) best = { monster: x.kind, name: row.name, pm };
  }
  return best;
}

/* The boss the bar follows now, { monster, name, pm }, or null. */
function bossOf(cs, h) {
  if (!h || h.ended) return null;
  const call = callOfHunt(h.huntId);
  if (call) return { monster: call.monster, name: call.Boss, pm: bossPmOf(cs, h, call.monster) };
  return groundBossOf(cs, h);
}

renderBossBar.patch = function patchBossBar(el, ctx) {
  const boss = bossOf(ctx.character, huntOf(ctx.character));
  const ph = boss ? (MONSTERS[boss.monster] || {}).phases : null;
  cls(el, 'is-quiet', !ph);
  if (!ph) return;
  const now = boss.pm === null ? 1000 : boss.pm;
  const raging = now <= ph.enragePm, wave = now <= ph.addsPm;
  text(el.querySelector('.hs-boss-name'), boss.name);
  text(el.querySelector('.hs-boss-state'), raging ? BOSS_CALL_WORDS.bar.enrage : wave ? BOSS_CALL_WORDS.bar[isGuarded(MONSTERS[boss.monster]) ? 'guarded' : 'adds'] : Math.ceil(now / 10) + '%');
  const box = el.querySelector('.hs-boss');
  cls(box, 'is-wave', wave && !raging);
  cls(box, 'is-raging', raging);
  style(el.querySelector('.hs-boss-fill'), 'width', (now / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-adds'), 'left', (ph.addsPm / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-enrage'), 'left', (ph.enragePm / 10) + '%');
};
