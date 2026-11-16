// ════════════════════════════════════════════════════════════════════════
// src/world/idle-banner.js — THE WORLD'S ONE SLIM LINE WHEN THE FIGHT ISN'T ON SCREEN (src/world/world-boot.js).
//
// PURE: a function of the view's state and the scene showing; the markup it returns is painted once per change by world-boot.
//   a fight on a hunt the World has no map for (Ridge Camp, say): the town or home stays on screen as the viewer picked, and
//     the line names where the hero really is and offers the hunt that IS in the World (its button names that hunt's entrance).
//   a TRAINING SESSION (src/data/training.js; audit F25 and the designer's coherence pass 2026-11-15, walk row 5: "Training Yard
//     isn't in the World yet. The Mill Cellar is." while the yard stood in the town): the yard is in the World, so the line says
//     where the hero trains and its button opens the Training window.
// ════════════════════════════════════════════════════════════════════════
import { WORLD_MAPS } from '../data/world/maps/index.js?v=0.2.132';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.132';
import { trainingOf } from '../data/training.js?v=0.2.132';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.132';
import { t } from '../render/player-text.js?v=0.2.132';
import { huntOfMap } from './hunt-maps.js?v=0.2.132';

/** The hunt the World can show today — the first hunt map's — named from the data. */
export const OPEN_HUNT = huntOfMap(WORLD_MAPS.find((m) => m.kind === 'hunt'));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

/**
 * The line's markup, or null when the scene speaks for itself. Its button carries `data-world-go`: "training" opens the Training
 * window, "hunt" the open hunt's entrance (world-boot.js onGo).
 * @param {object} G  read only
 * @param {{kind: string}} sc  the scene showing
 * @param {(id: string) => string} monsterName
 * @returns {string|null}
 */
export function unmappedBanner(G, sc, monsterName) {
  if (!G.activeMonster || sc.kind === 'hunt' || !OPEN_HUNT) return null;
  const train = G._huntId ? trainingOf(G._huntId) : null;
  if (train) {
    const o = { name: G.playerName || t('training.your_hero'), skill: (SKILLS_DEF[train.skill] && SKILLS_DEF[train.skill].name) || train.skill };
    return '<p class="world-idle-line">' + esc(t(train.place === 'house' ? 'training.world_line_house' : 'training.world_line', o)) + '</p>'
      + '<button type="button" class="world-idle-go" data-world-go="training">' + esc(t('training.world_open')) + '</button>';
  }
  const hunt = G._huntId && HUNT_INDEX[G._huntId];
  const where = hunt ? hunt.name : 'Your fight with the ' + monsterName(G.activeMonster);
  return '<p class="world-idle-line"><b>' + esc(where) + '</b> isn’t in the World yet. The ' + esc(OPEN_HUNT.name) + ' is.</p>'
    + '<button type="button" class="world-idle-go" data-world-go="hunt">' + esc('Hunt in the ' + OPEN_HUNT.name) + '</button>';
}
