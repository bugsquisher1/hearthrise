// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep.js — HUNT PREP: ONE-CLICK SETUPS AND A READINESS CHECK (QoL 2).
//
// Tyler 10-18: "players should spend their time making interesting decisions,
// not repeating decisions they've already made". So a hunt setup is saved
// once and put back with one press:
//   Setups     ONE concept (designer ruling 2026-10-22, CONFLICTS.md): a setup is
//              a whole loadout, its OWN action bar (slots, conditions, fight
//              options) and the gear it wears; at most ACTION_SET_LIMITS.presets.
//              The hero is always on one (hunt_settings.preset, marked "In use":
//              the bar shows it and edits it). Use = ONE hr_hunt_preset_apply
//              (the server wears the gear and switches the bar); Save here /
//              Save current setup = ONE hr_hunt_preset_save (what the hero has on,
//              gear and bar, becomes that setup and the hero is on it). Use and
//              Save are town-only (the server refuses hunt_open): off in a hunt.
//              The name renames in place (inline-name.js: ONE
//              hr_hunt_preset_rename); Delete asks once on the same button,
//              then sends ONE hr_hunt_preset_delete (src/session/preset-intents.js;
//              ruling C4); the setup in use has none (the server: setup_in_use).
//   Ready?     every open character's checklist (src/shell/readiness.js), with
//              what is short in one line. Supplies are never bought here: the
//              action bar pays the store per use (Tyler 2026-10-20).
// Built once, patched in place; every control is off while an intent is in
// flight, and changes show only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { presetsOf } from '../../session/item-sections.js?v=0.2.69';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.69';
import { runIntent } from '../intent-words.js?v=0.2.69';
import { readinessOf, readinessLine } from '../readiness.js?v=0.2.69';
import { settingsOf, huntOf } from '../../session/hunt-sections.js?v=0.2.69';
import { ACTION_SET_LIMITS } from '../../data/rule-subjects.js?v=0.2.69';
import { renameSetup, deleteSetup } from '../../session/preset-intents.js?v=0.2.69';
import { nameEditorHtml, openNameEditor, nameKey } from '../inline-name.js?v=0.2.69';
import { settleTownActivity } from '../../session/party-intents.js?v=0.2.69';

const MAX_PRESETS = ACTION_SET_LIMITS.presets;
const SCRATCH = new WeakMap();
/* `naming`: the setup whose name field is open; `arming`: the setup whose Delete asked "Delete it?". */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', naming: null, arming: null }; SCRATCH.set(cs, s); } return s; };

/** The skeleton (built once per opening). */
export function renderHuntPrep() {
  return '<div class="hw-prep">'
    + '<h3 class="hw-ledger-head is-on">Ready to hunt?</h3><ul class="hw-ready"></ul>'
    + '<h3 class="hw-ledger-head is-on">Saved setups</h3>'
    + '<p class="hs-note">A setup is a whole loadout: its own action bar and the gear it wears. The bar always shows the setup in use, and changing the bar changes that setup. To make another, save what you have on as a new setup, then change it.</p>'
    + '<ul class="hw-ledger hw-presets"></ul><p class="hh-empty hw-presets-none"></p>'
    + '<p class="hs-note hw-town-only">Setups change in town. This hunt keeps the bar it set off with.</p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-preset-name" maxlength="24" placeholder="Name this setup" aria-label="Setup name" data-hs-act="preset-name">'
    + '<button type="button" class="hh-tool" data-hs-act="save-new" data-coach-hook="setup-save">Save current setup</button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function readyRow(ctx) {
  return element(ctx.doc, '<li class="hw-ready-row"><p class="hw-ready-line"><b></b></p><ul class="hw-checks"></ul></li>');
}

function setupRow(ctx, p) {
  const at = ' data-preset="' + p.preset + '"';
  return element(ctx.doc, '<li class="hw-line hw-setup"><span class="hw-line-name">' + nameEditorHtml('rename', at, 'New name for this setup') + '<small></small></span>'
    + '<button type="button" class="hh-tool" data-hs-act="save-over"' + at + '>Save here</button>'
    + '<button type="button" class="hh-tool hw-use" data-hs-act="apply"' + at + '>Use</button>'
    + '<button type="button" class="hh-tool hw-del" data-hs-act="delete"' + at + '>Delete</button>'
    + '<button type="button" class="hh-tool hw-keep" data-hs-act="keep"' + at + '>Keep</button></li>');
}

renderHuntPrep.patch = function patchHuntPrep(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-prep');
  const peers = ctx.peers();
  rows(root.querySelector('.hw-ready'), peers.map((p) => ({ cs: p, r: readinessOf(p) })), {
    key: (x) => String(x.cs.slot),
    build: () => readyRow(ctx),
    patch: (li, x) => {
      cls(li, 'is-ready', x.r.ready);
      cls(li, 'is-self', x.cs === cs);
      text(li.querySelector('b'), readinessLine(x.r));
      rows(li.querySelector('.hw-checks'), x.r.checks, {
        key: (c) => c.id,
        build: () => element(ctx.doc, '<li class="hw-check"></li>'),
        patch: (cli, c) => { text(cli, c.text); cls(cli, 'is-short', !c.ok); },
      });
    },
  });
  const presets = presetsOf(cs);
  const set = settingsOf(cs);
  const h = huntOf(cs);
  const hunting = !!h && !h.ended;
  rows(root.querySelector('.hw-presets'), presets || [], {
    key: (p) => String(p.preset),
    build: (p) => setupRow(ctx, p),
    patch: (li, p) => {
      text(li.querySelector('.hs-name-t'), p.name);
      const gearN = Object.keys(p.gear).length;
      /* The setup the hero is on (the server's hunt_settings.preset) is marked and has no Delete. */
      const inUse = !!set && set.preset === p.preset;
      cls(li, 'is-current', inUse);
      text(li.querySelector('small'), (inUse ? 'In use · ' : '') + gearN + (gearN === 1 ? ' piece' : ' pieces') + ' of gear');
      cls(li, 'is-naming', sc.naming === p.preset);
      /* Delete asks once on the same button ("Delete it?", with Keep beside it); the second press sends. */
      const armed = sc.arming === p.preset;
      cls(li, 'is-arming', armed);
      text(li.querySelector('.hw-del'), armed ? 'Delete it?' : 'Delete');
      for (const b of li.querySelectorAll('button, input')) prop(b, 'disabled', sc.pending);
      for (const b of li.querySelectorAll('.hw-use, [data-hs-act="save-over"]')) prop(b, 'disabled', sc.pending || hunting);
    },
  });
  const none = root.querySelector('.hw-presets-none');
  cls(none, 'is-on', !presets || !presets.length);
  text(none, presets ? 'No saved setups yet.' : 'Saved setups switch on when the server starts keeping them.');
  const full = presets && presets.length >= MAX_PRESETS;
  for (const el of root.querySelectorAll('.hw-add input, .hw-add button')) prop(el, 'disabled', sc.pending || !presets || full || hunting);
  cls(root.querySelector('.hw-town-only'), 'is-on', hunting);
  /* Saving a new setup is off when every slot is used: said, not only greyed (say-why). */
  text(root.querySelector('.hh-intent-msg'), sc.msg || (full && !hunting ? 'All ' + MAX_PRESETS + ' setup slots are used. Delete one to save a new setup.' : ''));
};

renderHuntPrep.act = function actHuntPrep(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntPrep.patch(body, ctx);
  if (action === 'rename-key') return renameKey(ctx, ev, t, sc, repaint);
  if (ev.type !== 'click') return false;
  const preset = Number(t.getAttribute('data-preset'));
  const setup = (presetsOf(cs) || []).find((x) => x.preset === preset);
  if (action !== 'delete' && sc.arming !== null) { sc.arming = null; repaint(); }
  if (action === 'rename') {
    if (!setup || sc.pending) return true;
    sc.naming = setup.preset;
    repaint();
    openNameEditor(t.closest('.hw-setup'), setup.name, () => { if (sc.naming === setup.preset) { sc.naming = null; repaint(); } });
    return true;
  }
  if (action === 'keep') return true;
  if (action === 'delete') {
    const s = settingsOf(cs);
    if (!setup || (s && s.preset === setup.preset)) return true;
    if (sc.arming !== setup.preset) { sc.arming = setup.preset; repaint(); return true; }
    sc.arming = null;
    runIntent(sc, repaint, () => deleteSetup(ctx.account, cs, setup.preset), 'Deleting…', () => 'Deleted ' + setup.name + '.');
    return true;
  }
  /* A town activity yields to the hunt setup (Andy live 10-21: "burying locks an action"): the engine collects
     it first (set_activity idle, as Enter does in hunts.js), so the server's apply never answers activity_running. */
  if (action === 'apply') {
    runIntent(sc, repaint, () => settleTownActivity(cs).then(() => cs.applyPreset(preset)), 'Putting the setup on…', () => 'Setup on.');
    return true;
  }
  if (action === 'save-over') {
    if (setup) runIntent(sc, repaint, () => cs.savePreset(setup.preset, setup.name), 'Saving…', () => 'Saved over ' + setup.name + ' with the bar and gear you have on.');
    return true;
  }
  if (action === 'save-new') {
    const used = new Set((presetsOf(cs) || []).map((p) => p.preset));
    let free = 0;
    while (used.has(free) && free < MAX_PRESETS) free++;
    const input = body.querySelector('.hw-preset-name');
    const name = input.value.trim() || 'Setup ' + (free + 1);
    if (free >= MAX_PRESETS) return true;
    runIntent(sc, repaint, () => cs.savePreset(free, name), 'Saving…', () => { input.value = ''; return 'Saved ' + name + '.'; });
    return true;
  }
  return false;
};
renderHuntPrep.events = Object.freeze(['keydown']);

/* A key in a setup's name field: Enter sends ONE rename (the field closes; the new name shows from the
   re-read), Escape puts the name back. Any other key is the player typing. */
function renameKey(ctx, ev, t, sc, repaint) {
  const k = nameKey(ev);
  if (!k) return false;
  const preset = Number(t.getAttribute('data-preset'));
  const name = t.value;
  sc.naming = null;
  repaint();
  t.blur();
  const setup = (presetsOf(ctx.character) || []).find((x) => x.preset === preset);
  if (k === 'commit' && setup && name.trim() && name.trim() !== setup.name) {
    runIntent(sc, repaint, () => renameSetup(ctx.account, ctx.character, preset, name), 'Renaming…', () => 'Renamed to ' + name.trim() + '.');
  }
  return true;
}
