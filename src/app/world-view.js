// ════════════════════════════════════════════════════════════════════════
// src/app/world-view.js — WHAT THE WORLD PANE READS, FOR ONE CHARACTER.
//
// PURE. The World engine (src/world/**) reads a small view object: the fight
// pointer, the hunt's Analyzer, the hero's name and its own display scratch
// `_world`. This builds that view from ONE CharacterSession's record — the
// server's last word — so the world never reads a global and two characters
// never share a scene. The scratch is the character's own (the pane keeps one
// per character); everything else is re-read from the record every frame.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from '../data/hunts.js?v=590';
import { MONSTERS } from '../data/monsters.js?v=590';

/**
 * @param {{data: object}|null} record   CharacterSession.record
 * @param {object} scratch               the character's world display scratch (mutable, never sent)
 */
export function worldViewOf(record, scratch) {
  const d = (record && record.data) || {};
  const st = d.state && typeof d.state === 'object' ? d.state : {};
  const view = { _world: scratch, activeMonster: null, _huntId: null, _huntAnalyzer: null, playerName: null };
  if (st.active_kind === 'combat' && typeof st.active_id === 'string') {
    const hunt = HUNT_INDEX[st.active_id];
    if (hunt) {
      view._huntId = hunt.id;
      view.activeMonster = (hunt.spawns && hunt.spawns[0] && hunt.spawns[0].monster) || null;
    } else if (MONSTERS[st.active_id]) {
      view.activeMonster = st.active_id;
    }
  }
  const a = d.hunt_analyzer;
  if (a && typeof a === 'object' && !Array.isArray(a)) view._huntAnalyzer = a;
  const name = typeof d.name === 'string' ? d.name : (typeof st.name === 'string' ? st.name : null);
  view.playerName = name;
  return view;
}
