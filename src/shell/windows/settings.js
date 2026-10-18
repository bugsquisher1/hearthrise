// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/settings.js — SETTINGS: WHAT THE SCREEN SHOWS (parity FX-13, SH-03, SH-10).
//
// Three display-only sections, each kept in this character's residue:
//   Floating numbers  one toggle per type (src/data/combat-text.js), over
//                     regular monsters and over bosses (residue `combatText`)
//   Panels            show or hide each HUD widget (the HUD layout, residue
//                     `hudLayout`, through the shell's own [data-hs-wshow])
//   Hotkeys           every window's key from src/data/shell-windows.js, plus
//                     the shell's own (src/data/hunt-hud.js HOTKEYS). Hunts are
//                     idle: no key casts anything.
// ════════════════════════════════════════════════════════════════════════
import { FLOAT_TYPES } from '../../data/combat-text.js?v=0.1.0';
import { SHELL_WINDOWS } from '../../data/shell-windows.js?v=0.1.0';
import { HOTKEYS } from '../../data/hunt-hud.js?v=0.1.0';
import { floatShown, withFloat } from '../../hunt-view/float-prefs.js?v=0.1.0';
import { keyLabel } from '../launcher.js?v=0.1.0';
import { prop } from '../../render/paint.js?v=0.1.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.1.0';

const TARGETS = Object.freeze([['regular', 'Monsters'], ['boss', 'Bosses']]);

/** The skeleton (built once). */
export function renderSettings(ctx) {
  const floats = '<table class="hs-floats"><thead><tr><th scope="col">Floating numbers</th>'
    + TARGETS.map(([, l]) => '<th scope="col">' + l + '</th>').join('') + '</tr></thead><tbody>'
    + FLOAT_TYPES.map((r) => '<tr><th scope="row">' + esc(r.label) + '</th>'
      + TARGETS.map(([t, l]) => '<td><input type="checkbox" data-hs-act="float" data-float="' + esc(r.id) + '" data-target="' + t + '" aria-label="' + esc(r.label + ' over ' + l.toLowerCase()) + '"></td>').join('')
      + '</tr>').join('') + '</tbody></table>';
  const panels = '<ul class="hs-hudset">' + ctx.hud.rows().map((row) => '<li class="hs-hudset-row"><label class="hs-hudset-show">'
    + '<input type="checkbox" data-hs-wshow="' + esc(row.id) + '"' + (row.removable ? '' : ' disabled') + '> ' + esc(row.label)
    + (row.when === 'hunt' ? ' <small>in a hunt</small>' : '') + '</label></li>').join('') + '</ul>';
  const keys = SHELL_WINDOWS.filter((w) => !w.escape).map((w) => ({ key: keyLabel(w.key), does: 'Open ' + w.label })).concat(HOTKEYS);
  const hotkeys = '<dl class="hs-keys">' + keys.map((k) => '<dt><kbd class="hs-key">' + esc(k.key) + '</kbd></dt><dd>' + esc(k.does) + '</dd>').join('') + '</dl>';
  return '<h3 class="hs-sub">Floating numbers</h3><p class="hs-note">Choose what pops up over monsters and heroes during a hunt.</p>' + floats
    + '<h3 class="hs-sub">Panels</h3>' + panels
    + '<h3 class="hs-sub">Hotkeys</h3><p class="hs-note">Hunts play themselves; keys only open windows.</p>' + hotkeys;
}

renderSettings.patch = function patchSettings(body, ctx) {
  for (const c of body.querySelectorAll('input[data-float]')) prop(c, 'checked', floatShown(ctx.character, c.getAttribute('data-float'), c.getAttribute('data-target')));
  for (const c of body.querySelectorAll('input[data-hs-wshow]')) prop(c, 'checked', ctx.hud.layoutOf(c.getAttribute('data-hs-wshow')).visible);
};

renderSettings.act = function actSettings(ctx, body, action, ev, t) {
  if (action !== 'float' || ev.type !== 'change') return;
  ctx.character.setResidue('combatText', withFloat(ctx.character, t.getAttribute('data-float'), t.getAttribute('data-target'), t.checked));
  renderSettings.patch(body, ctx);
};
