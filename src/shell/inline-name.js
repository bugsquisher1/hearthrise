// ════════════════════════════════════════════════════════════════════════
// src/shell/inline-name.js — RENAME IN PLACE (ruling C4: saved setups and the action set).
//
// The name is a button; a press turns it into a text field holding the name,
// selected. Enter sends ONE rename intent (the caller's), Escape or leaving the
// field puts the name back. The shown name changes only when the server's
// re-read says so: the field closes on Enter and the old name stays until then.
// The box that holds both carries `is-naming` while the field is open (CSS
// swaps them); a patch never writes the field's value, so a display tick
// cannot wipe what the player is typing.
// ════════════════════════════════════════════════════════════════════════
import { cls } from '../render/paint.js?v=0.2.31';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.31';

const NAME_MAX = 24;

/** The name button and its field. `act` names the press; `attrs` is extra markup (e.g. a data-preset) on both. */
export function nameEditorHtml(act, attrs, label) {
  const a = attrs || '';
  return '<button type="button" class="hs-name" data-hs-act="' + act + '"' + a + ' title="Rename"><b class="hs-name-t"></b></button>'
    + '<input type="text" class="hh-num hs-name-edit" maxlength="' + NAME_MAX + '" aria-label="' + esc(label || 'New name') + '"'
    + ' data-hs-act="' + act + '-key"' + a + '>';
}

/** Open the field in `box` with `name`, selected; `onLeave` runs once when the field loses focus. */
export function openNameEditor(box, name, onLeave) {
  const input = box.querySelector('.hs-name-edit');
  if (!input) return;
  cls(box, 'is-naming', true);
  input.value = name;
  input.focus();
  input.select();
  input.addEventListener('blur', () => onLeave(), { once: true });
}

/** What a key in the field means: 'commit' (Enter), 'cancel' (Escape) or null (typing). */
export function nameKey(ev) {
  if (!ev || ev.type !== 'keydown') return null;
  return ev.key === 'Enter' ? 'commit' : ev.key === 'Escape' ? 'cancel' : null;
}
