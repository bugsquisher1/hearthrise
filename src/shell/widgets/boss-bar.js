// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/boss-bar.js — A BOSS ROOM'S BAR (Tyler 2026-11-05: "phases"): a called room's boss (src/data/boss-calls.js) and a keyed
// hall's (src/data/boss-halls.js; the Krell's Hold design: "Krell's health with lines drawn at 50 and 25, the phase words under it, and one
// more line for the next flare").
//
// His name, his HP at the instant the world shows (the timeline's, as his sprite's own bar reads it), and a mark on each of his two lines.
// Past a line it says what that line brought. Under it, while one stands, a NAMED ADD's name and his HP or his enrage (piece 6), and, for a
// boss whose row hastens a spell under his enrage line (phases.hasten, piece 7), that spell's COUNTDOWN: the wait the browser's live
// prediction holds (live-engine.js spellWait), moved back to the instant shown. Display only: nothing reads it, and each envelope and
// each server commit replace the prediction it comes from. Quiet on any other hunt, so the widget takes no room. Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALL_WORDS, isGuarded } from '../../data/boss-calls.js?v=0.2.130';
import { BOSS_HALL_WORDS, roomOfHunt, isNamedAdd } from '../../data/boss-halls.js?v=0.2.130';
import { MONSTERS } from '../../data/monsters.js?v=0.2.130';
import { spellRow } from '../../data/monster-spells.js?v=0.2.130';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.130';
import { text, cls, style, prop } from '../../render/paint.js?v=0.2.130';

/** The skeleton (built once). */
export function renderBossBar() {
  return '<section class="hs-boss" role="group" aria-label="The boss"><div class="hs-boss-head"><b class="hs-boss-name"></b><span class="hs-boss-state"></span></div>'
    + '<div class="hs-boss-track" role="img"><i class="hs-boss-fill"></i><i class="hs-boss-mark is-adds"></i><i class="hs-boss-mark is-enrage"></i></div>'
    + '<div class="hs-boss-add" hidden><b class="hs-boss-add-name"></b><span class="hs-boss-add-state"></span></div>'
    + '<div class="hs-boss-flare" hidden><span class="hs-boss-flare-words"></span><div class="hs-boss-flare-track" role="img"><i class="hs-boss-flare-fill"></i></div></div></section>';
}

/* Unit `u`'s HP in permille at the instant shown, from the timeline's book, else the pose's row `x`; null before either has it. */
function pmOf(cs, u, x) {
  const played = cs.timeline && typeof cs.timeline.hpAt === 'function' ? cs.timeline.hpAt(u, cs.now()) : null;
  const hp = played ? played.hp : x ? x.hp : NaN, max = played ? played.maxHp : x ? x.hpMax : 0;
  return Number.isFinite(hp) && max > 0 ? Math.max(0, Math.min(1000, Math.round((hp * 1000) / max))) : null;
}

/* His HP in permille at the instant shown, or null before the world has shown him. */
function bossPmOf(cs, h, monster) {
  for (const [u, x] of h.units) if (x.kind === monster) return pmOf(cs, u, x);
  return null;
}

/* A NAMED ADD standing at the instant shown (the timeline's units: one the live view placed may not be in the pose yet): { name, pm, row }. */
function namedAddOf(cs, h) {
  const ids = cs.timeline && typeof cs.timeline.units === 'function' ? cs.timeline.units() : [...h.units.keys()];
  for (const u of ids) {
    const kind = (h.units.get(u) || {}).kind || (cs.timeline && cs.timeline.kindOf ? cs.timeline.kindOf(u) : null);
    const row = kind ? MONSTERS[kind] : null;
    if (!isNamedAdd(row)) continue;
    const pm = pmOf(cs, u, h.units.get(u));
    if (pm !== null && pm > 0) return { name: row.name, pm, row };
  }
  return null;
}

/* THE COUNTDOWN of the boss's hasted spell at the instant shown, or null: { name, s, casting, fill (permille of its wait gone) }. */
function flareOf(cs, monster, ph, raging) {
  const h = ph && ph.hasten;
  const sp = h ? spellRow(h.spell) : null;
  const live = cs.live && typeof cs.live.spellWait === 'function' ? cs.live.spellWait(monster, h ? h.spell : '') : null;
  const shown = cs.timeline && typeof cs.timeline.serverNowAt === 'function' ? cs.timeline.serverNowAt(cs.now()) : null;
  if (!sp || !live || !Number.isFinite(shown)) return null;
  const cd = raging ? Math.floor((sp.cdMs * h.cdPm) / 1000) : sp.cdMs;
  if (live.casting !== null) return { name: sp.n, s: 0, casting: true, fill: 1000 };
  /* the prediction runs ahead of the instant shown: the wait then was longer by the gap, and a start inside the gap reads as the cast coming */
  const left = live.leftMs + Math.max(0, live.atMs - shown);
  if (left > cd) return { name: sp.n, s: 0, casting: true, fill: 1000 };
  return { name: sp.n, s: Math.ceil(left / 1000), casting: false, fill: Math.round(((cd - left) * 1000) / cd) };
}

renderBossBar.patch = function patchBossBar(el, ctx) {
  const cs = ctx.character;
  const h = huntOf(cs);
  const room = h && !h.ended ? roomOfHunt(h.huntId) : null;
  const ph = room ? (MONSTERS[room.monster] || {}).phases : null;
  cls(el, 'is-quiet', !ph);
  if (!ph) return;
  const pm = bossPmOf(cs, h, room.monster);
  const now = pm === null ? 1000 : pm;
  const raging = now <= ph.enragePm, wave = now <= ph.addsPm;
  text(el.querySelector('.hs-boss-name'), room.Boss);
  text(el.querySelector('.hs-boss-state'), raging ? BOSS_CALL_WORDS.bar.enrage : wave ? BOSS_CALL_WORDS.bar[isGuarded(MONSTERS[room.monster]) ? 'guarded' : 'adds'] : Math.ceil(now / 10) + '%');
  const box = el.querySelector('.hs-boss');
  cls(box, 'is-wave', wave && !raging);
  cls(box, 'is-raging', raging);
  style(el.querySelector('.hs-boss-fill'), 'width', (now / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-adds'), 'left', (ph.addsPm / 10) + '%');
  style(el.querySelector('.hs-boss-mark.is-enrage'), 'left', (ph.enragePm / 10) + '%');
  /* the named add while he stands */
  const add = wave ? namedAddOf(cs, h) : null;
  const addBox = el.querySelector('.hs-boss-add');
  prop(addBox, 'hidden', !add);
  if (add) {
    const addRaging = !!(add.row.phases && add.pm <= add.row.phases.enragePm);
    text(addBox.querySelector('.hs-boss-add-name'), add.name);
    text(addBox.querySelector('.hs-boss-add-state'), addRaging ? BOSS_HALL_WORDS.bar.namedRage : BOSS_HALL_WORDS.bar.named.replace('{pct}', String(Math.ceil(add.pm / 10))));
    cls(addBox, 'is-raging', addRaging);
  }
  /* the hasted spell's countdown */
  const flare = flareOf(cs, room.monster, ph, raging);
  const flareBox = el.querySelector('.hs-boss-flare');
  prop(flareBox, 'hidden', !flare);
  if (flare) {
    text(flareBox.querySelector('.hs-boss-flare-words'), (flare.casting ? BOSS_HALL_WORDS.bar.casting : BOSS_HALL_WORDS.bar.soon).replace('{spell}', flare.name).replace('{s}', String(flare.s)));
    cls(flareBox, 'is-casting', flare.casting);
    style(flareBox.querySelector('.hs-boss-flare-fill'), 'width', (flare.fill / 10) + '%');
  }
};
