// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep.js — HUNT PREP: ONE-CLICK SETUPS AND A READINESS CHECK (QoL 2).
//
// Tyler 10-18: "players should spend their time making interesting decisions,
// not repeating decisions they've already made". So a hunt setup is saved
// once and put back with one press:
//   Presets    the server's saved setups (`hunt_presets`): the action set and
//              the worn gear. Use = ONE hr_hunt_preset_apply (the server wears
//              the gear from the bag and switches the set); Save here = ONE hr_hunt_preset_save of what the
//              character has now (the server snapshots its own state, the
//              client sends a slot number and a name).
//   Ready?     every open character's checklist (src/shell/readiness.js), with
//              what is short in one line. Supplies are never bought here: the
//              action bar pays the store per use (Tyler 2026-10-20).
// Built once, patched in place; every control is off while an intent is in
// flight, and changes show only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { presetsOf } from '../../session/item-sections.js?v=0.2.23';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.23';
import { runIntent } from '../intent-words.js?v=0.2.23';
import { settleTownActivity } from '../../session/party-intents.js?v=0.2.23';
import { readinessOf, readinessLine } from '../readiness.js?v=0.2.23';

const MAX_PRESETS = 8;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The skeleton (built once per opening). */
export function renderHuntPrep() {
  return '<div class="hw-prep">'
    + '<h3 class="hw-ledger-head is-on">Ready to hunt?</h3><ul class="hw-ready"></ul>'
    + '<h3 class="hw-ledger-head is-on">Saved setups</h3>'
    + '<p class="hs-note">A setup keeps this character’s action set and worn gear. Use it to put both back in one press.</p>'
    + '<ul class="hw-ledger hw-presets"></ul><p class="hh-empty hw-presets-none"></p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-preset-name" maxlength="24" placeholder="Name this setup" aria-label="Setup name" data-hs-act="preset-name">'
    + '<button type="button" class="hh-tool" data-hs-act="save-new">Save current setup</button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function readyRow(ctx) {
  return element(ctx.doc, '<li class="hw-ready-row"><p class="hw-ready-line"><b></b></p><ul class="hw-checks"></ul></li>');
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
  rows(root.querySelector('.hw-presets'), presets || [], {
    key: (p) => String(p.preset),
    build: (p) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="save-over" data-preset="' + p.preset + '">Save here</button>'
      + '<button type="button" class="hh-tool hw-use" data-hs-act="apply" data-preset="' + p.preset + '">Use</button></li>'),
    patch: (li, p) => {
      text(li.querySelector('b'), p.name);
      const gearN = Object.keys(p.gear).length;
      text(li.querySelector('small'), (p.actionSet !== null ? 'Action set ' + (p.actionSet + 1) + ' · ' : '') + gearN + (gearN === 1 ? ' piece' : ' pieces') + ' of gear');
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-presets-none');
  cls(none, 'is-on', !presets || !presets.length);
  text(none, presets ? 'No saved setups yet.' : 'Saved setups switch on when the server starts keeping them.');
  const full = presets && presets.length >= MAX_PRESETS;
  for (const el of root.querySelectorAll('.hw-add input, .hw-add button')) prop(el, 'disabled', sc.pending || !presets || full);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderHuntPrep.act = function actHuntPrep(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderHuntPrep.patch(body, ctx);
  /* A town activity yields to the hunt setup (Andy live 10-21: "burying locks an action"): the engine collects
     it first (set_activity idle, as Enter does in hunts.js), so the server's apply never answers activity_running. */
  if (action === 'apply') {
    runIntent(sc, repaint, () => settleTownActivity(cs).then(() => cs.applyPreset(Number(t.getAttribute('data-preset')))), 'Putting the setup on…', () => 'Setup on.');
    return true;
  }
  if (action === 'save-over') {
    const p = (presetsOf(cs) || []).find((x) => x.preset === Number(t.getAttribute('data-preset')));
    if (p) runIntent(sc, repaint, () => cs.savePreset(p.preset, p.name), 'Saving…', () => 'Saved over ' + p.name + '.');
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
