// ════════════════════════════════════════════════════════════════════════
// src/data/settings.js — THE SETTINGS REGISTRY: ONE ROW PER SETTING.
//
// Tyler 10-18: "organize the settings so it doesn't get to be a long annoying
// list." The Settings window (src/shell/windows/settings.js) is built once from
// these rows and holds no setting of its own. A feature adds its settings by
// ADDING ROWS to a section below (or a new section array spread into SETTINGS);
// it never edits the window. tests/settings-registry.mjs holds the contract.
//
// A row:
//   id           stable, unique ('float.dealt.regular')
//   category     an id from SETTING_CATEGORIES
//   label        the line the player reads
//   help         one plain sentence, shown under the label and searched
//   type         toggle | choice | slider | hotkey | action
//   default      the value when nothing is saved (toggle: boolean; choice: an
//                option value; slider: a number; hotkey/action: null)
//   scope        'residue'  display only, kept in this character's residue
//                           (RESIDUE_FIELDS, src/session/residue.js)
//                'server'   saved by the server through the row's existing
//                           `intent` (a CharacterSession method); never residue
//   bind         where the value lives: { store: 'float', type, target }
//                | { store: 'hud', id } | { store: 'residue', field }
//                | { store: 'none' } (hotkeys, actions)
//   options      choice: [{ value, label }];  slider: { min, max, step }
//   key          hotkey rows: the key;  action rows: `run` names a
//                CharacterSession method, or `open` names the window it opens
//                (a panel that owns its own reads and intents, e.g. Blocked players)
//   visibleWhen  optional (ctx) => boolean; a row that is not visible, and a
//                category with no visible row, is not drawn
//
// Categories are data too, in the order the window lists them. Gameplay,
// Chat & Social and Account stay hidden until a feature registers a row there.
// ════════════════════════════════════════════════════════════════════════
import { FLOAT_TYPES, FLOAT_TARGETS } from './combat-text.js?v=0.2.14';
import { HUD_WIDGETS } from './hud-widgets.js?v=0.2.14';
import { SHELL_WINDOWS } from './shell-windows.js?v=0.2.14';
import { HOTKEYS } from './hunt-hud.js?v=0.2.14';
import { SOCIAL_SETTINGS } from './social-settings.js?v=0.2.14';

export const SETTING_TYPES = Object.freeze(['toggle', 'choice', 'slider', 'hotkey', 'action']);
export const SETTING_SCOPES = Object.freeze(['residue', 'server']);

const cat = (id, label, blurb) => Object.freeze({ id, label, blurb });
export const SETTING_CATEGORIES = Object.freeze([
  cat('gameplay', 'Gameplay', 'Hunt defaults and alerts.'),
  cat('interface', 'Interface', 'Which panels show and how windows behave.'),
  cat('combat_text', 'Combat text', 'What pops up over monsters and heroes.'),
  cat('chat_social', 'Chat & Social', 'Chat filters, blocked players and friend requests.'),
  cat('controls', 'Controls', 'Keys.'),
  cat('account', 'Account', 'Your name, password and signing out.'),
]);

const NO_BIND = Object.freeze({ store: 'none' });
const row = (r) => Object.freeze(Object.assign({ scope: 'residue', bind: NO_BIND, default: null }, r));

/* ── Combat text: one toggle per floating-number type, over monsters and over bosses ── */
const TARGET_WORDS = Object.freeze({ regular: 'monsters', boss: 'bosses' });
const FLOAT_ROWS = FLOAT_TYPES.flatMap((f) => FLOAT_TARGETS.map((target) => row({
  id: 'float.' + f.id + '.' + target,
  category: 'combat_text',
  label: f.label + ' - ' + TARGET_WORDS[target],
  help: 'Show ' + f.label.toLowerCase() + ' over ' + TARGET_WORDS[target] + ' during a hunt.',
  type: 'toggle',
  default: f.on[target],
  bind: Object.freeze({ store: 'float', type: f.id, target }),
})));

/* ── Interface: show or hide each HUD panel ── */
const PANEL_ROWS = HUD_WIDGETS.filter((w) => w.removable).map((w) => row({
  id: 'panel.' + w.id,
  category: 'interface',
  label: w.label,
  help: w.when === 'hunt'
    ? 'Show the ' + w.label.toLowerCase() + ' panel while you are in a hunt.'
    : 'Show the ' + w.label.toLowerCase() + ' panel on the screen.',
  type: 'toggle',
  default: w.visible,
  bind: Object.freeze({ store: 'hud', id: w.id }),
}));

/* ── Controls: every window's key, then the shell's own (display only: hunts play themselves) ── */
const HOTKEY_ROWS = SHELL_WINDOWS.filter((w) => !w.escape).map((w) => row({
  id: 'key.' + w.id, category: 'controls', label: 'Open ' + w.label,
  help: 'Press this key to open or close the ' + w.label.toLowerCase() + ' window.',
  type: 'hotkey', key: w.key,
})).concat(HOTKEYS.map((k, i) => row({
  id: 'key.shell' + i, category: 'controls', label: k.does,
  help: 'Hunts play themselves; keys only open windows.', type: 'hotkey', key: k.key,
})));

export const SETTINGS = Object.freeze([...PANEL_ROWS, ...FLOAT_ROWS, ...HOTKEY_ROWS, ...SOCIAL_SETTINGS.map(row)]);

/** Throws on the first broken row; the guard and the window both rely on it. */
export function validateSettings(rows = SETTINGS, cats = SETTING_CATEGORIES) {
  const ids = new Set(), catIds = new Set(cats.map((c) => c.id));
  for (const r of rows) {
    const where = 'setting `' + r.id + '`';
    if (!r.id || ids.has(r.id)) throw new Error(where + ': id missing or duplicated');
    ids.add(r.id);
    if (!catIds.has(r.category)) throw new Error(where + ': unknown category ' + r.category);
    if (!r.label || !r.help) throw new Error(where + ': needs a label and a help line');
    if (!SETTING_TYPES.includes(r.type)) throw new Error(where + ': unknown type ' + r.type);
    if (!SETTING_SCOPES.includes(r.scope)) throw new Error(where + ': unknown scope ' + r.scope);
    if (r.scope === 'server' && !r.intent) throw new Error(where + ': a server setting names its existing intent');
    if (r.scope === 'server' && r.bind && r.bind.store === 'residue') throw new Error(where + ': a server setting is never kept in residue');
    if (r.type === 'toggle' && typeof r.default !== 'boolean') throw new Error(where + ': a toggle defaults to a boolean');
    if (r.type === 'choice' && !(Array.isArray(r.options) && r.options.some((o) => o.value === r.default))) throw new Error(where + ': a choice default must be one of its options');
    if (r.type === 'slider' && !(r.options && r.options.min < r.options.max && typeof r.default === 'number')) throw new Error(where + ': a slider needs min < max and a numeric default');
    if (r.type === 'hotkey' && !r.key) throw new Error(where + ': a hotkey row names its key');
    if (r.type === 'action' && !r.run && !r.open) throw new Error(where + ': an action row names what it runs or opens');
  }
  return true;
}
