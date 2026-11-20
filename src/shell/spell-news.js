// ════════════════════════════════════════════════════════════════════════
// src/shell/spell-news.js — THE NEW SPELL PROMPT: A LEVEL-UP THAT UNLOCKED A MOVE, SAID ONCE, SMALL.
//
// Tyler 2026-11-16: when a level-up unlocks a spell, a small prompt asks whether to add it to the bar, "just dont
// overwhelm the screen with it". The alert centre (src/shell/alerts.js) asks news(cs) on every change of a character's
// record and raises what it answers as ONE corner line (kind 'spell', src/data/alerts.js) with Add to bar.
//
// FROM THE SERVER'S PROJECTION, NEVER A CLIENT COUNTER. The baseline is the first `skills` section this page read for
// the character, so a load (a reload, a sign-in, a slow first read) never prompts for a move the hero already had. A
// later record whose skill level crossed a row's `unlock` (abilities.js) raises the moves it opened that the worn
// weapon plays (hunt_settings.discipline, or every list's), that the bar does not hold yet, and that were never shown
// (`seen`: the centre's ids, kept in the residue's `alerts.seen`, so a reload never repeats one). Several in one read are
// ONE prompt. A read with no `skills` or no discipline judges nothing and keeps the baseline. Display state only.
//   unlockedBetween(was, now, d)  the moves a skill change opened for discipline `d`, data order (pure)
//   spellWatch()                  { news(cs, seen), forget(slot) } per alert centre
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES, abilitySkill } from '../data/abilities.js';
import { skillsOf } from '../session/item-sections.js';
import { settingsOf } from '../session/hunt-sections.js';
import { t } from '../render/player-text.js';

/** The prompt id of move `id`: one per move, so a move shown once (alone or with others) is never shown again. */
export const spellNewsId = (id) => 'spell:' + id;

/** The moves discipline `d` casts (its own or every list's) whose `unlock` the skill levels crossed from `was` to `now`. */
export function unlockedBetween(was, now, d) {
  if (!was || !now || !d) return [];
  return Object.values(ABILITIES).filter((r) => {
    if (!r.unlock || r.active === false || !(r.universal || r.disciplines.includes(d))) return false;
    const a = was[abilitySkill(r)], b = now[abilitySkill(r)];
    return !!a && !!b && a.level < r.unlock && b.level >= r.unlock;
  }).map((r) => r.id);
}

/** The moves the bar holds now (the server's slots), by id. */
export function movesOnBar(set) {
  return new Set((set ? set.slots : []).filter((s) => !s.empty && s.action.type === 'ability').map((s) => s.action.id));
}

/** One watcher per alert centre: each character's baseline, by slot. */
export function spellWatch() {
  const base = new Map();
  return {
    /** The prompt this record raises, or null. `seen(id)`: has the centre shown that id already; `hero`: the hero's name as the centre says it. */
    news(cs, seen, hero) {
      const now = skillsOf(cs);
      if (!now) return null;
      const was = base.get(cs.slot);
      if (!was) { base.set(cs.slot, now); return null; }
      const set = settingsOf(cs);
      if (!set || !set.discipline) return null;
      base.set(cs.slot, now);
      const held = movesOnBar(set);
      const ids = unlockedBetween(was, now, set.discipline).filter((id) => !held.has(id) && !seen(spellNewsId(id)));
      if (!ids.length) return null;
      return { id: spellNewsId(ids[0]), also: ids.slice(1).map(spellNewsId), kind: 'spell', session: null, spells: ids,
        text: t('bar.new_spell', { count: ids.length, hero, names: ids.map((id) => ABILITIES[id].n).join(', ') }) };
    },
    forget(slot) { base.delete(slot); },
  };
}
