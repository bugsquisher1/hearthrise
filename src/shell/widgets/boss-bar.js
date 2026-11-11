// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/boss-bar.js — A CALLED BOSS'S BAR (Tyler 2026-11-05: "phases"; src/data/boss-calls.js).
//
// His name, his HP at the instant the world shows (the timeline's, as his sprite's own bar reads it), and a mark on each of
// his two lines. Past a line it says what that line brought. Display only: nothing reads it. Quiet on any other hunt, so
// the widget takes no room. Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { callOfHunt, BOSS_CALL_WORDS, isGuarded } from '../../data/boss-calls.js?v=0.2.123';
import { MONSTERS } from '../../data/monsters.js?v=0.2.123';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.123';
import { text, cls, style } from '../../render/paint.js?v=0.2.123';

/** The skeleton (built once). */
export function renderBossBar() {
  return '<section class="hs-boss" role="group" aria-label="The boss"><div class="hs-boss-head"><b class="hs-boss-name"></b><span class="hs-boss-state"></span></div>'
    + '<div class="hs-boss-track" role="img"><i class="hs-boss-fill"></i><i class="hs-boss-mark is-adds"></i><i class="hs-boss-mark is-enrage"></i></div></section>';
}

/* His HP in permille at the instant shown, or null before the world has shown him. */
function bossPmOf(cs, h, monster) {
  for (const [u, x] of h.units) {
    if (x.kind !== monster) continue;
    const played = cs.timeline && typeof cs.timeline.hpAt === 'function' ? cs.timeline.hpAt(u, cs.now()) : null;
    const hp = played ? played.hp : x.hp, max = played ? played.maxHp : x.hpMax;
    return Number.isFinite(hp) && max > 0 ? Math.max(0, Math.min(1000, Math.round((hp * 1000) / max))) : null;
  }
  return null;
}

renderBossBar.patch = function patchBossBar(el, ctx) {
  const h = huntOf(ctx.character);
  const call = h && !h.ended ? callOfHunt(h.huntId) : null;
  const ph = call ? (MONSTERS[call.monster] || {}).phases : null;
  cls(el, 'is-quiet', !ph);
  if (!ph) return;
  const pm = bossPmOf(ctx.character, h, call.monster);
  const now = pm === null ? 1000 : pm;
  const raging = now <= ph.enragePm, wave = now <= ph.addsPm;
  text(el.querySelector('.hs-boss-name'), call.Boss);
  text(el.querySelector('.hs-boss-state'), raging ? BOSS_CALL_WORDS.bar.enrage : wave ? BOSS_CALL_WORDS.bar[isGuarded(MONSTERS[call.monster]) ? 'guarded' : 'adds'] : Math.ceil(now / 10) + '%');
  const box = el.querySelector('.hs-boss');
  cls(box, 'is-wave', wave && !raging);
  cls(box, 'is-raging', raging);
  style(el.querySelector('.hs-boss-fill'), 'width', (now / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-adds'), 'left', (ph.addsPm / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-enrage'), 'left', (ph.enragePm / 10) + '%');
};
