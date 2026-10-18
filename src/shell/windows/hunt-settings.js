// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-settings.js — THE PER-HERO HUNT SETTINGS EDITOR (parity HS-01..HS-09).
//
// The viewed character's settings for its active action set: target, stance,
// chase, distance, when to eat and drink, and where supplies come from. Every
// control shows the server's `hunt_settings` section; every change is ONE
// intent (settings-intent.js) and the editor's controls stay off until the
// server has answered and the re-read envelope replaced the section (HS-07).
// A desktop window; on a phone the shell shows it as the one full-height sheet
// with big touch targets (HS-08). Below the options, the bar's slot editor
// (bar-editor.js): "IF [test] THEN [action]" per slot, in priority order.
// ════════════════════════════════════════════════════════════════════════
import { SUPPLY_SOURCE, ON_EMPTY } from '../../data/hunt-sessions.js?v=0.1.0';
import { settingsOf } from '../../session/hunt-sections.js?v=0.1.0';
import { text, cls } from '../../render/paint.js?v=0.1.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.1.0';
import { barEditorHtml, patchBarEditor, actBarEditor } from './bar-editor.js?v=0.1.0';
import { targetOptionsHtml, stanceButtonsHtml, distanceHtml, patchControls, sendOption, SUPPLY_LABEL, ON_EMPTY_LABEL } from '../widgets/settings-intent.js?v=0.1.0';

const opts = (modes, labels) => modes.map((m) => '<option value="' + esc(m) + '">' + esc(labels[m] || m) + '</option>').join('');
const row = (label, control, hint) => '<div class="he-row"><span class="he-label">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span>' + control + '</div>';

/** The skeleton (built once). */
export function renderHuntSettings() {
  const pctInput = (key, label) => '<input type="number" class="hh-num" min="1" max="99" step="1" inputmode="numeric" data-opt="' + key + '" data-hs-act="opt" aria-label="' + label + '"><span class="he-unit">%</span>';
  return '<div class="he-editor">'
    + '<p class="hh-empty he-none">Start a hunt to set how this hero fights.</p>'
    + '<div class="he-form">'
    + row('Action set', '<b class="he-set"></b>')
    + row('Target', '<select class="hh-select" data-opt="target_mode" data-hs-act="opt">' + targetOptionsHtml() + '</select>', 'Which monster to attack first')
    + row('Stance', '<span class="hh-segs" role="group" aria-label="Stance">' + stanceButtonsHtml() + '</span>', 'Offensive deals and takes more damage')
    + row('Chase', '<button type="button" class="hh-seg" data-opt="chase" data-hs-act="opt" aria-pressed="false">Chase</button>', 'With chase off, the hero keeps its distance')
    + row('Distance', distanceHtml(), 'Tiles from your target')
    + row('Eat at', pctInput('food_pct', 'Eat when health is at or below this percent'), 'Food restores health')
    + row('Drink at', pctInput('drink_pct', 'Drink when mana is at or below this percent'), 'Drink restores mana')
    + row('Supplies', '<select class="hh-select" data-opt="supply_source" data-hs-act="opt">' + opts(SUPPLY_SOURCE.modes, SUPPLY_LABEL) + '</select>')
    + row('When my bag runs out', '<select class="hh-select" data-opt="on_empty" data-hs-act="opt">' + opts(ON_EMPTY.modes, ON_EMPTY_LABEL) + '</select>')
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '</div>' + barEditorHtml() + '</div>';
}

renderHuntSettings.patch = function patchHuntSettings(body, ctx) {
  const s = settingsOf(ctx.character);
  const ed = body.querySelector('.he-editor');
  cls(ed, 'is-empty', !s);
  const set = s && s.presets.find((p) => p.preset === s.preset);
  text(body.querySelector('.he-set'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '');
  patchControls(ed.querySelector('.he-form'), ctx.character);
  patchBarEditor(body, ctx);
};

renderHuntSettings.act = function actHuntSettings(ctx, body, action, ev, t) {
  if (action === 'bar' || action === 'bar-f') { actBarEditor(ctx, body, action, ev, t, () => renderHuntSettings.patch(body, ctx)); return; }
  if (action !== 'opt') return;
  const isField = t.tagName === 'SELECT' || t.tagName === 'INPUT';
  if (isField !== (ev.type === 'change')) return;
  sendOption(ctx, body.querySelector('.he-form'), t, () => renderHuntSettings.patch(body, ctx));
};
