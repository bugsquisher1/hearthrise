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
//   Slots      how many setups this hero may open is the server's (`setup_slots`): some free, then bought, up to
//              ACTION_SET_LIMITS.presets. Past the count, Buy sends ONE hr_setup_slot_buy with the quoted price. A
//              setup already saved is never blocked: only a NEW number past the count is refused.
//   Ready?     every open character's checklist (src/shell/readiness.js), with
//              what is short in one line. Supplies are never bought here: the
//              action bar pays the store per use (Tyler 2026-10-20).
//   Carry in   while this hero hunts (Tyler 2026-11-02, "Yes, add a press"): every
//              hunt supply in its bag, how many the hunt holds, and "Carry 40":
//              how many (src/shell/carry-in.js), then ONE hr_hunt_restock.
// Built once, patched in place; every control is off while an intent is in
// flight, and changes show only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { presetsOf, setupSlotsOf, goldOf } from '../../session/item-sections.js?v=0.2.110';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.110';
import { runIntent } from '../intent-words.js?v=0.2.110';
import { carryRows, carryWords, askCarry } from '../carry-in.js?v=0.2.110';
import { itemName } from '../widgets/bits.js?v=0.2.110';
import { whole, gold } from '../../render/format.js?v=0.2.110';
import { readinessOf, readinessLine } from '../readiness.js?v=0.2.110';
import { settingsOf, huntOf } from '../../session/hunt-sections.js?v=0.2.110';
import { ACTION_SET_LIMITS } from '../../data/rule-subjects.js?v=0.2.110';
import { renameSetup, deleteSetup, buySetupSlot } from '../../session/preset-intents.js?v=0.2.110';
import { setupBuyWords, setupFullWords } from '../setup-words.js?v=0.2.110';
import { nameEditorHtml, openNameEditor, nameKey } from '../inline-name.js?v=0.2.110';
import { settleTownActivity } from '../../session/party-intents.js?v=0.2.110';

const MAX_PRESETS = ACTION_SET_LIMITS.presets;
const SCRATCH = new WeakMap();
/* The lowest setup number nothing stands on: a new setup goes there. MAX_PRESETS when all are taken. */
function firstFree(presets) {
  const used = new Set((presets || []).map((p) => p.preset));
  let free = 0;
  while (used.has(free) && free < MAX_PRESETS) free++;
  return free;
}
/* `naming`: the setup whose name field is open; `arming`: the setup whose Delete asked "Delete it?". */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', naming: null, arming: null }; SCRATCH.set(cs, s); } return s; };

/** The skeleton (built once per opening). */
export function renderHuntPrep() {
  return '<div class="hw-prep">'
    + '<h3 class="hw-ledger-head is-on">Ready to hunt?</h3><ul class="hw-ready"></ul>'
    + '<h3 class="hw-ledger-head hw-carry-head">Carry into this hunt</h3>'
    + '<p class="hs-note hw-carry-note" hidden>This hunt uses only the supplies it carries, then buys from the store. What you got after you set out waits in your backpack until you carry it in.</p>'
    + '<ul class="hw-ledger hw-carry" hidden></ul><p class="hh-empty hw-carry-none"></p>'
    + '<h3 class="hw-ledger-head is-on">Saved setups</h3>'
    + '<p class="hs-note">A setup is a whole loadout, with its own action bar and the gear it wears. The bar always shows the setup in use, and changing the bar changes that setup. To make another, save what you have on as a new setup, then change it.</p>'
    + '<ul class="hw-ledger hw-presets"></ul><p class="hh-empty hw-presets-none"></p>'
    + '<p class="hs-note hw-town-only">Setups change in town. This hunt keeps the bar it set off with.</p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-preset-name" maxlength="24" placeholder="Name this setup" aria-label="Setup name" data-hs-act="preset-name">'
    + '<button type="button" class="hh-tool" data-hs-act="save-new" data-coach-hook="setup-save">Save current setup</button></div>'
    + '<button type="button" class="hh-tool hw-slot-buy" data-hs-act="buy-slot" hidden></button>'
    + '<p class="hs-note hw-slot-why" hidden></p>'
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
  patchCarry(root, ctx, cs, sc);
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
  /* The server says how many this hero may open; with no such section it is the limit and the server's refusal still speaks. */
  const slots = setupSlotsOf(cs);
  const count = slots ? slots.count : MAX_PRESETS;
  const full = presets && firstFree(presets) >= count;
  for (const el of root.querySelectorAll('.hw-add input, .hw-add button')) prop(el, 'disabled', sc.pending || !presets || full || hunting);
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
  const why = full && !hunting ? setupFullWords(count, price) + (short ? ' You need ' + gold(short) + ' more.' : '') : '';
  const whyEl = root.querySelector('.hw-slot-why');
  prop(whyEl, 'hidden', !why);
  text(whyEl, why);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

/* CARRY IN (src/shell/carry-in.js): the bag's hunt supplies while this hero hunts, each with the server's two counts. */
function patchCarry(root, ctx, cs, sc) {
  const carry = carryRows(cs);
  cls(root.querySelector('.hw-carry-head'), 'is-on', !!carry);
  prop(root.querySelector('.hw-carry-note'), 'hidden', !carry);
  const list = root.querySelector('.hw-carry');
  prop(list, 'hidden', !carry || !carry.length);
  rows(list, carry || [], {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="carry" data-item="' + r.id + '"></button></li>'),
    patch: (li, r) => {
      text(li.querySelector('b'), itemName(r.id));
      text(li.querySelector('small'), whole(r.have) + ' in your backpack · ' + whole(r.inHunt) + ' in this hunt' + (r.wait ? ' · ' + r.wait : ''));
      const b = li.querySelector('button');
      text(b, 'Carry ' + whole(r.max));
      attr(b, 'aria-label', carryWords(r));
      prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-carry-none');
  cls(none, 'is-on', !!carry && !carry.length);
  text(none, carry && !carry.length ? 'Nothing in your backpack can be carried into a hunt.' : '');
}

renderHuntPrep.act = function actHuntPrep(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntPrep.patch(body, ctx);
  if (action === 'rename-key') return renameKey(ctx, ev, t, sc, repaint);
  if (ev.type !== 'click') return false;
  if (action === 'carry') {
    const row = (carryRows(cs) || []).find((r) => r.id === t.getAttribute('data-item'));
    const at = t.getBoundingClientRect();
    if (row && !sc.pending) askCarry(ctx, body, sc, repaint, row, { x: at.left, y: at.bottom });
    return true;
  }
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
  if (action === 'buy-slot') {
    const q = setupSlotsOf(cs);
    if (q && q.price !== null) runIntent(sc, repaint, () => buySetupSlot(ctx.account, cs, q.price), 'Buying…', () => 'Bought. This hero has ' + (q.count + 1) + ' setup slots.');
    return true;
  }
  if (action === 'save-new') {
    const free = firstFree(presetsOf(cs));
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
