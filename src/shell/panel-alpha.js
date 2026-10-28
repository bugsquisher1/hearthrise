// ════════════════════════════════════════════════════════════════════════
// src/shell/panel-alpha.js — THE WINDOW OPACITY SETTING, WRITTEN (Tyler 2026-10-24).
//
// The shown character's residue `panelAlpha` (a whole percent, src/data/panel-alpha.js;
// sanitized in src/session/residue.js) becomes --panel-alpha on <html>, 0.6 to 1. Every
// --fill-N token (src/styles/tokens.css §8) mixes a panel's fill with it, so windows
// and HUD panels let the World show through while their frames, rules, gold and text
// stay solid. One World pane is mounted at a time (src/app/boot.js), so its shell is
// the one writer. A display preference: nothing gates or spends on it.
// ════════════════════════════════════════════════════════════════════════
import { PANEL_ALPHA } from '../data/panel-alpha.js?v=0.2.62';

/** The character's window opacity in percent (its residue, else solid). */
function panelAlphaOf(character) {
  const r = character && character.record && character.record.residue;
  const v = r ? r.panelAlpha : undefined;
  return Number.isInteger(v) ? v : PANEL_ALPHA.initial;
}

/** Write the character's setting on <html> (a repaint calls this; it writes only a change). */
export function applyPanelAlpha(doc, character) {
  const want = String(panelAlphaOf(character) / 100);
  const root = doc.documentElement;
  if (root.style.getPropertyValue('--panel-alpha') !== want) root.style.setProperty('--panel-alpha', want);
}

/** Back to solid (the pane is going: the next one writes its own). */
export function clearPanelAlpha(doc) {
  doc.documentElement.style.removeProperty('--panel-alpha');
}
