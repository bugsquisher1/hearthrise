// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep/setups.js — THE SETUPS COLUMN: PICK ONE, USE ONE, NEW, USE EQUIPPED.
//
// The server's `hunt_presets` rows, one line each: the name (renames in place), "In use" and the
// gear count, a one-press Use (ONE hr_hunt_preset_apply) and, on the picked row, Delete (asks once,
// then ONE hr_hunt_preset_delete). Under them: New (the name field, then ONE hr_hunt_preset_save on
// the first free number), Use equipped (ONE hr_hunt_preset_save over the picked setup, asked once),
// the count line, and past the server's count the Buy line (ONE hr_setup_slot_buy at the quote).
// Picking a row is display only: the builder (builder.js) loads that setup's copy.
// ════════════════════════════════════════════════════════════════════════
import { presetsOf, setupSlotsOf, goldOf } from '../../../session/item-sections.js?v=0.2.125';
import { settingsOf } from '../../../session/hunt-sections.js?v=0.2.125';
import { rows, text, cls, prop, attr, element } from '../../../render/paint.js?v=0.2.125';
import { runIntent } from '../../intent-words.js?v=0.2.125';
import { gold } from '../../../render/format.js?v=0.2.125';
import { ACTION_SET_LIMITS } from '../../../data/rule-subjects.js?v=0.2.125';
import { renameSetup, deleteSetup, buySetupSlot } from '../../../session/preset-intents.js?v=0.2.125';
import { setupBuyWords, setupFullWords } from '../../setup-words.js?v=0.2.125';
import { nameEditorHtml, openNameEditor, nameKey } from '../../inline-name.js?v=0.2.125';
import { settleTownActivity } from '../../../session/party-intents.js?v=0.2.125';
import { t } from '../../../render/player-text.js?v=0.2.125';
import { dropDraft, pickSetup, draftDirty } from './builder.js?v=0.2.125';

const MAX_PRESETS = ACTION_SET_LIMITS.presets;

/* The lowest setup number nothing stands on: a new setup goes there. MAX_PRESETS when all are taken. */
export function firstFree(presets) {
  const used = new Set((presets || []).map((p) => p.preset));
  let free = 0;
  while (used.has(free) && free < MAX_PRESETS) free++;
  return free;
}

/** The column's skeleton. */
export function setupsHtml() {
  return '<h3 class="hw-ledger-head is-on">' + t('prep.setups') + '</h3>'
    + '<ul class="hw-ledger hpb-sets"></ul><p class="hh-empty hw-presets-none"></p>'
    + '<div class="hw-add hpb-add" hidden><input type="text" class="hh-num hw-preset-name" maxlength="24" placeholder="' + t('prep.name_this') + '" aria-label="' + t('prep.setup_name') + '" data-hs-act="preset-name">'
    + '<button type="button" class="hh-tool" data-hs-act="save-new">' + t('prep.save') + '</button></div>'
    + '<div class="hpb-leftrow">'
    + '<button type="button" class="hh-tool hpb-new" data-hs-act="new" data-coach-hook="setup-save">' + t('controls.new_setup') + '</button>'
    + '<button type="button" class="hh-tool hpb-from" data-hs-act="use-equipped"><b>' + t('controls.use_equipped') + '</b><small></small></button>'
    + '<button type="button" class="hh-tool hw-keep hpb-keep" data-hs-act="keep-equipped">' + t('controls.cancel') + '</button>'
    + '<p class="hpb-count"></p></div>'
    + '<p class="hs-note hw-town-only">' + t('prep.town_only') + '</p>'
    + '<button type="button" class="hh-tool hw-slot-buy" data-hs-act="buy-slot" hidden></button>'
    + '<p class="hs-note hw-slot-why" hidden></p>';
}

function setupRow(ctx, p) {
  const at = ' data-preset="' + p.preset + '"';
  return element(ctx.doc, '<li class="hw-line hw-setup hpb-set" data-hs-act="pick"' + at + '><span class="hw-line-name">' + nameEditorHtml('rename', at, t('prep.rename_label')) + '<small></small></span>'
    + '<span class="hpb-set-do"><button type="button" class="hh-tool hw-use" data-hs-act="apply"' + at + '>' + t('controls.use') + '</button>'
    + '<button type="button" class="hh-tool hw-del" data-hs-act="delete"' + at + '>' + t('controls.delete') + '</button>'
    + '<button type="button" class="hh-tool hw-keep" data-hs-act="keep"' + at + '>' + t('controls.cancel') + '</button></span></li>');
}

/** Patch the column from the server's sections. */
export function patchSetups(root, ctx, sc, hunting) {
  const cs = ctx.character;
  const presets = presetsOf(cs);
  const set = settingsOf(cs);
  const inUse = set ? set.preset : null;
  /* The picked setup: the one the player pressed, else the one in use. A deleted pick falls back to the one in use. */
  if (sc.picked === null || (presets && sc.picked !== inUse && !presets.some((p) => p.preset === sc.picked))) sc.picked = inUse;
  const dirty = draftDirty(sc);
  rows(root.querySelector('.hpb-sets'), presets || [], {
    key: (p) => String(p.preset),
    build: (p) => setupRow(ctx, p),
    patch: (li, p) => {
      text(li.querySelector('.hs-name-t'), p.name);
      const gearN = Object.keys(p.gear).length;
      /* The setup the hero is on (the server's hunt_settings.preset) is marked and has no Delete. */
      const current = p.preset === inUse;
      const picked = p.preset === sc.picked;
      cls(li, 'is-current', current);
      cls(li, 'is-picked', picked);
      attr(li, 'aria-current', picked ? 'true' : null);
      text(li.querySelector('small'), (current ? t('prep.in_use') + ' · ' : '') + t('prep.gear_count', { count: gearN }) + (picked && dirty ? ' · ' + t('prep.not_saved') : ''));
      cls(li, 'is-naming', sc.naming === p.preset);
      /* Delete asks once on the same button ("Delete it?", with Keep beside it); the second press sends. */
      const armed = sc.arming === p.preset;
      cls(li, 'is-arming', armed);
      text(li.querySelector('.hw-del'), armed ? t('controls.delete_confirm') : t('controls.delete'));
      for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', sc.pending);
      /* Use stays on the setup in use too: it puts that setup's saved gear back on (the server wears it). */
      prop(li.querySelector('.hw-use'), 'disabled', sc.pending || hunting);
    },
  });
  const none = root.querySelector('.hw-presets-none');
  cls(none, 'is-on', !presets || !presets.length);
  /* None saved: say what the bar's own name is (the server's set in use), so "Preset 1" under the bar and this line agree
     (first-30 play 2026-11-12: the bar said Preset 1 while this said no setups existed). */
  const barName = set && (set.presets.find((p) => p.preset === set.preset) || {}).name;
  text(none, !presets ? t('prep.setups_reading') : barName ? t('prep.setups_none_named', { name: barName }) : t('prep.setups_none'));
  /* The server says how many this hero may open (`setup_slots`). Until it has, none is free (§6: fail safe to not unlocked),
     and never more than the data's limit: past it New stays off and says so, as the press would send nothing. */
  const slots = setupSlotsOf(cs);
  const count = Math.min(slots ? slots.count : 0, MAX_PRESETS);
  const full = presets && firstFree(presets) >= count;
  const noNew = sc.pending || !presets || full || hunting;
  prop(root.querySelector('.hpb-new'), 'disabled', noNew);
  for (const el of root.querySelectorAll('.hpb-add input, .hpb-add button')) prop(el, 'disabled', noNew);
  prop(root.querySelector('.hpb-add'), 'hidden', !sc.adding || noNew);
  /* Use equipped: the picked setup takes what the hero has on. Asked once ("Replace Boss nights with what you have on?"). */
  const pickedRow = (presets || []).find((p) => p.preset === sc.picked);
  const from = root.querySelector('.hpb-from');
  text(from.querySelector('b'), sc.armingEquipped && pickedRow ? t('prep.use_equipped_ask', { name: pickedRow.name }) : t('controls.use_equipped'));
  text(from.querySelector('small'), pickedRow ? t('prep.use_equipped_hint', { name: pickedRow.name }) : '');
  cls(from, 'is-arming', sc.armingEquipped);
  prop(from, 'disabled', sc.pending || hunting || !pickedRow);
  prop(root.querySelector('.hpb-keep'), 'hidden', !sc.armingEquipped);
  text(root.querySelector('.hpb-count'), presets ? t('prep.count_line', { n: presets.length, max: count || MAX_PRESETS }) : '');
  cls(root.querySelector('.hw-town-only'), 'is-on', hunting);
  /* Past the count the next slot is for sale (a hunting hero may buy it too: nothing about the hunt moves). */
  const price = full && slots ? slots.price : null;
  const purse = goldOf(cs);
  const short = price !== null && purse !== null && purse < price ? price - purse : 0;
  const buy = root.querySelector('.hw-slot-buy');
  prop(buy, 'hidden', price === null);
  text(buy, price === null ? '' : setupBuyWords(count, price));
  prop(buy, 'disabled', sc.pending || short > 0);
  /* Saving a new setup is off when every slot is used: said, not only greyed (say-why), on a line of its own so an answer's news never hides it. */
  const why = hunting || !presets ? '' : !slots ? t('prep.slots_reading')
    : full ? setupFullWords(count, price) + (short ? ' ' + t('prep.need_more', { gold: gold(short) }) : '') : '';
  const whyEl = root.querySelector('.hw-slot-why');
  prop(whyEl, 'hidden', !why);
  text(whyEl, why);
}

/** The column's presses. Returns true/false when it handled the action, undefined when it is not the column's. */
export function actSetups(ctx, body, sc, repaint, action, ev, el) {
  const cs = ctx.character;
  if (action === 'rename-key') return renameKey(ctx, ev, el, sc, repaint);
  if (action === 'preset-name') return nameFieldKey(ctx, body, ev, sc, repaint);
  if (ev.type !== 'click') return undefined;
  const preset = Number(el.getAttribute('data-preset'));
  const setup = (presetsOf(cs) || []).find((x) => x.preset === preset);
  /* A press on anything else backs out of an asked Delete or Replace. */
  if (action !== 'delete' && sc.arming !== null) { sc.arming = null; repaint(); }
  if (action !== 'use-equipped' && sc.armingEquipped) { sc.armingEquipped = false; repaint(); }
  if (action === 'pick') {
    if (setup) pickSetup(sc, setup.preset);
    repaint();
    return true;
  }
  if (action === 'rename') {
    if (!setup || sc.pending) return true;
    pickSetup(sc, setup.preset);
    sc.naming = setup.preset;
    repaint();
    openNameEditor(el.closest('.hw-setup'), setup.name, () => { if (sc.naming === setup.preset) { sc.naming = null; repaint(); } });
    return true;
  }
  if (action === 'keep' || action === 'keep-equipped') return true;
  if (action === 'delete') {
    const s = settingsOf(cs);
    if (!setup || (s && s.preset === setup.preset)) return true;
    if (sc.arming !== setup.preset) { sc.arming = setup.preset; repaint(); return true; }
    sc.arming = null;
    runIntent(sc, repaint, () => deleteSetup(ctx.account, cs, setup.preset), t('prep.deleting'), () => t('prep.deleted', { name: setup.name }), cs);
    return true;
  }
  /* A town activity yields to the hunt setup (Andy live 10-21: "burying locks an action"): the engine collects
     it first (set_activity idle, as Enter does in hunts.js), so the server's apply never answers activity_running. */
  if (action === 'apply') {
    if (!setup) return true;
    pickSetup(sc, setup.preset);
    runIntent(sc, repaint, () => settleTownActivity(cs).then(() => cs.applyPreset(preset)), t('prep.putting_on'), () => { dropDraft(sc); return t('prep.put_on'); }, cs);
    return true;
  }
  if (action === 'use-equipped') {
    const picked = (presetsOf(cs) || []).find((x) => x.preset === sc.picked);
    if (!picked || sc.pending) return true;
    if (!sc.armingEquipped) { sc.armingEquipped = true; repaint(); return true; }
    sc.armingEquipped = false;
    runIntent(sc, repaint, () => cs.savePreset(picked.preset, picked.name), t('prep.saving'), () => { dropDraft(sc); return t('prep.replaced', { name: picked.name }); }, cs);
    return true;
  }
  if (action === 'buy-slot') {
    const q = setupSlotsOf(cs);
    if (q && q.price !== null) runIntent(sc, repaint, () => buySetupSlot(ctx.account, cs, q.price), t('prep.buying'), () => t('prep.bought', { n: q.count + 1 }), cs);
    return true;
  }
  if (action === 'new') {
    sc.adding = !sc.adding;
    repaint();
    const input = body.querySelector('.hw-preset-name');
    if (sc.adding && input && !input.disabled) input.focus();
    return true;
  }
  if (action === 'save-new') return saveNew(ctx, body, sc, repaint);
  return undefined;
}

/* New: ONE hr_hunt_preset_save on the first free number, named from the field (else "Setup N"); the new setup is then the one picked. */
function saveNew(ctx, body, sc, repaint) {
  const cs = ctx.character;
  const free = firstFree(presetsOf(cs));
  const input = body.querySelector('.hw-preset-name');
  const name = input.value.trim() || t('prep.setup_n', { n: free + 1 });
  if (free >= MAX_PRESETS || sc.pending) return true;
  runIntent(sc, repaint, () => cs.savePreset(free, name), t('prep.saving'), () => { input.value = ''; sc.adding = false; pickSetup(sc, free); return t('prep.saved', { name }); }, cs);
  return true;
}

/* A key in the New row's name field: Enter saves, Escape closes the row. Any other key is the player typing. */
function nameFieldKey(ctx, body, ev, sc, repaint) {
  const k = nameKey(ev);
  if (!k) return false;
  if (k === 'cancel') { sc.adding = false; repaint(); return true; }
  return saveNew(ctx, body, sc, repaint);
}

/* A key in a setup's name field: Enter sends ONE rename (the field closes; the new name shows from the
   re-read), Escape puts the name back. Any other key is the player typing. */
function renameKey(ctx, ev, el, sc, repaint) {
  const k = nameKey(ev);
  if (!k) return false;
  const preset = Number(el.getAttribute('data-preset'));
  const name = el.value;
  sc.naming = null;
  repaint();
  el.blur();
  const setup = (presetsOf(ctx.character) || []).find((x) => x.preset === preset);
  if (k === 'commit' && setup && name.trim() && name.trim() !== setup.name) {
    runIntent(sc, repaint, () => renameSetup(ctx.account, ctx.character, preset, name), t('prep.renaming'), () => t('prep.renamed', { name: name.trim() }), ctx.character);
  }
  return true;
}
