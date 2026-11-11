// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep.js — HUNT PREP: THE SETUP BUILDER (Tyler 2026-11-11, from his reference).
//
// One window, one setup at a time: pick a setup on the left, edit it on the right, then Save.
//   Setups     the server's `hunt_presets` rows (hunt-prep/setups.js): a setup is a whole loadout, its OWN
//              action bar (slots, conditions, fight options) and the gear it wears, at most
//              ACTION_SET_LIMITS.presets. The hero is always on one (hunt_settings.preset, "In use").
//              Use = ONE hr_hunt_preset_apply (the server wears the gear and switches the bar), one press
//              on each row so swapping setups is one click. New = ONE hr_hunt_preset_save on the first free
//              number, named first. Use equipped = ONE hr_hunt_preset_save over the picked setup (what the
//              hero has on, gear and bar), asked once. The name renames in place (inline-name.js: ONE
//              hr_hunt_preset_rename); Delete asks once, then ONE hr_hunt_preset_delete. Use, New and Use
//              equipped are town-only (the server refuses hunt_open). Past the server's count (`setup_slots`)
//              Buy sends ONE hr_setup_slot_buy with the quoted price.
//   Builder    (hunt-prep/builder.js, hunt-prep/grid.js) Fights as (read only: the worn weapon decides it),
//              stance, target, chase and distance, the gold to keep, and the 2 x 10 slot grid at the HUD's
//              own tiles: drag to move, drop on a filled slot to swap, a press opens Configure action on
//              that slot (every condition the engine has), Sort (bar-sort.js) and Clear. All of it edits a
//              COPY of the picked setup (prep-draft.js); Save sends it as ONE hr_action_set_options with
//              every key, Save and use then ONE hr_hunt_preset_apply. The setup in use is the envelope's
//              projection; another setup is read on demand (session/preset-read.js).
//   Ready?     this hero's readiness line in the footer (src/shell/readiness.js), the checklist for every
//              open hero on a press. Supplies are never bought here: the bar pays the store per use.
//   Carry in   while this hero hunts (Tyler 2026-11-02): every hunt supply in its bag, how many the hunt
//              holds, and "Carry 40" (src/shell/carry-in.js), then ONE hr_hunt_restock.
// Built once per opening (a fresh opening starts from the server's row, never a stale draft), patched in
// place; every control is off while an intent is in flight, and changes show only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { huntOf } from '../../session/hunt-sections.js?v=0.2.123';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.123';
import { carryRows, carryWords, askCarry } from '../carry-in.js?v=0.2.123';
import { itemName } from '../widgets/bits.js?v=0.2.123';
import { whole } from '../../render/format.js?v=0.2.123';
import { readinessOf, readinessLine } from '../readiness.js?v=0.2.123';
import { t } from '../../render/player-text.js?v=0.2.123';
import { setupsHtml, patchSetups, actSetups } from './hunt-prep/setups.js?v=0.2.123';
import { builderHtml, patchBuilder, actBuilder, dropDraft } from './hunt-prep/builder.js?v=0.2.123';

const SCRATCH = new WeakMap();
/* The window's state for one character: `pending` and `msg` (intent-words.js runIntent), `naming` the setup whose name
   field is open, `arming` the setup whose Delete asked, `adding` the New row open, `readyOpen` the checklist shown, and
   the builder's draft (builder.js): `picked`, `draft`, `base`, `read`, `stale`, `sorted`, `drag`. */
export const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', naming: null, arming: null, armingEquipped: false, adding: false, readyOpen: false, picked: null, draft: null, draftFor: null, base: '', read: null, stale: false, sorted: false, cleared: false, roleHint: null, drag: null }; SCRATCH.set(cs, s); }
  return s;
};

/** The skeleton (built once per opening). A fresh opening throws any old draft away: it starts from the server's row. */
export function renderHuntPrep(ctx) {
  if (ctx && ctx.character) dropDraft(scratchOf(ctx.character));
  return '<div class="hw-prep hpb">'
    + '<div class="hpb-left">' + setupsHtml() + '</div>'
    + '<div class="hpb-right">'
    + '<section class="hpb-carry" hidden><h3 class="hw-ledger-head hw-carry-head">' + t('prep.carry_head') + '</h3>'
    + '<p class="hs-note hw-carry-note" hidden>' + t('prep.carry_note') + '</p>'
    + '<ul class="hw-ledger hw-carry" hidden></ul><p class="hh-empty hw-carry-none"></p></section>'
    + builderHtml()
    + '</div>'
    + '<p class="hh-intent-msg hpb-msg" role="status" aria-live="polite"></p>'
    + '<div class="hpb-foot"><p class="hpb-state"></p><button type="button" class="hpb-ready hw-ready-line" data-hs-act="ready" aria-expanded="false" title="' + t('prep.ready_label') + '"><b></b></button>'
    + '<button type="button" class="hh-tool hpb-load" data-hs-act="load-again" hidden>' + t('prep.load_again') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="close">' + t('controls.close') + '</button>'
    + '<button type="button" class="hh-tool hpb-save" data-hs-act="save">' + t('prep.save') + '</button>'
    + '<button type="button" class="hh-tool is-primary hpb-save-use" data-hs-act="save-use">' + t('prep.save_and_use') + '</button></div>'
    + '<h3 class="hw-ledger-head hpb-ready-head">' + t('prep.ready_head') + '</h3><ul class="hw-ready" hidden></ul></div>';
}

function readyRow(ctx) {
  return element(ctx.doc, '<li class="hw-ready-row"><p class="hw-ready-line"><b></b></p><ul class="hw-checks"></ul></li>');
}

renderHuntPrep.patch = function patchHuntPrep(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-prep');
  const repaint = () => renderHuntPrep.patch(body, ctx);
  const h = huntOf(cs);
  const hunting = !!h && !h.ended;
  patchSetups(root, ctx, sc, hunting);
  patchCarry(root, ctx, cs, sc, hunting);
  patchBuilder(root, ctx, sc, hunting, repaint);
  /* THE FOOTER'S READINESS: this hero's line (green when ready, red when short); a press shows every open hero's checklist. */
  const peers = ctx.peers();
  const mine = readinessOf(cs);
  const line = root.querySelector('.hpb-ready');
  text(line.querySelector('b'), readinessLine(mine));
  cls(line, 'is-ready', mine.ready);
  attr(line, 'aria-expanded', String(sc.readyOpen));
  cls(root.querySelector('.hpb-ready-head'), 'is-on', sc.readyOpen);
  const list = root.querySelector('.hw-ready');
  prop(list, 'hidden', !sc.readyOpen);
  rows(list, peers.map((p) => ({ cs: p, r: readinessOf(p) })), {
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
  text(root.querySelector('.hpb-msg'), sc.msg);
};

/* CARRY IN (src/shell/carry-in.js): the bag's hunt supplies while this hero hunts, each with the server's two counts. */
function patchCarry(root, ctx, cs, sc, hunting) {
  const carry = hunting ? carryRows(cs) : null;
  prop(root.querySelector('.hpb-carry'), 'hidden', !carry);
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
      text(li.querySelector('small'), t('prep.carry_line', { have: whole(r.have), inHunt: whole(r.inHunt) }) + (r.wait ? ' · ' + r.wait : ''));
      const b = li.querySelector('button');
      text(b, t('prep.carry_press', { n: whole(r.max) }));
      attr(b, 'aria-label', carryWords(r));
      prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-carry-none');
  cls(none, 'is-on', !!carry && !carry.length);
  text(none, carry && !carry.length ? t('prep.carry_none') : '');
}

renderHuntPrep.act = function actHuntPrep(ctx, body, action, ev, el) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntPrep.patch(body, ctx);
  if (action === 'carry' && ev.type === 'click') {
    const row = (carryRows(cs) || []).find((r) => r.id === el.getAttribute('data-item'));
    const at = el.getBoundingClientRect();
    if (row && !sc.pending) askCarry(ctx, body, sc, repaint, row, { x: at.left, y: at.bottom });
    return true;
  }
  if (action === 'ready' && ev.type === 'click') { sc.readyOpen = !sc.readyOpen; repaint(); return true; }
  if (action === 'close' && ev.type === 'click') { dropDraft(sc); ctx.wm.close('hunt-prep'); return true; }
  const done = actSetups(ctx, body, sc, repaint, action, ev, el);
  if (done !== undefined) return done;
  return actBuilder(ctx, body, sc, repaint, action, ev, el);
};
renderHuntPrep.events = Object.freeze(['keydown', 'pointerdown']);
