// ============================================================================
// src/utils/dialog.js — THE ONE WAY HEARTHRISE ASKS THE PLAYER A QUESTION.
//
// window.confirm / window.prompt / window.alert BLOCK THE RENDERER'S MAIN
// THREAD until they are answered. While one is up, nothing in this game runs:
// no combat tick, no gather tick, no autosave, no paint, no input handler, no
// network callback. And an unanswered one — suppressed by Chrome's "prevent
// this page from creating additional dialogs", raised while the tab is not
// frontmost, buried behind an OS window, or driven under automation — blocks it
// FOREVER, with no self-recovery available to the page itself.
//
// This is not theory. It has been the mechanism of two shipped freezes:
//   • b371 — hero-slot switch (`confirm`), 3/3 repro, 60s+ hang, manual reload
//     the only way out. Fixed by an in-game modal.
//   • b373 — the character RENAME pencil (`prompt`), found in the b372 FTUE
//     run: "the renderer blocked hard (all CDP evaluate/screenshot timed out)
//     until the tab was closed."
//
// Twice is a pattern, and the pattern is that the primitive itself is unsafe,
// not that two call sites were unlucky. So the answer is not a third bespoke
// modal: it is ONE service, and a build guard (tests/native-dialog.mjs) that
// refuses a new native call site anywhere under src/.
//
// PROPERTIES, and each of them is why a per-feature reimplementation is worse:
//   • NON-BLOCKING. Returns a Promise; the game keeps ticking underneath.
//   • ALWAYS ESCAPABLE. Escape, the backdrop and the cancel button all resolve.
//     A question the player cannot dismiss is the freeze wearing a costume.
//   • TEXT IS TEXT. Every caller-supplied string reaches the DOM through
//     textContent. b214 shipped a stored-XSS hole by putting a player name into
//     innerHTML; a dialog that renders item names, clan names and display names
//     is exactly where that repeats.
//   • TOKENS ONLY (CLAUDE.md hard rule) — it reuses .qm-overlay/.qm-modal/.btn,
//     the components the rest of the game already themes. No new colours.
//   • ONE AT A TIME. Opening a second dialog replaces the first rather than
//     stacking two overlays with two live keydown handlers.
//
// MARKUP CONTRACT — `#hr-confirm-overlay` with `[data-hrc="yes"|"no"]`. That is
// not incidental: tests/slot-switch.mjs answers the switch confirmation through
// exactly those selectors, and src/multi-character.js's confirmDialog()
// delegates here. Changing them breaks a guard, which is the point of pinning
// them in a comment.
//
// NO NATIVE FALLBACK ANYWHERE IN THIS FILE. If the DOM is unavailable the
// promise resolves to the SAFE answer (cancel / null) — falling back to
// window.confirm would reintroduce the freeze on precisely the degraded path
// least able to recover from it.
// ============================================================================

(function () {
  'use strict';

  var OVERLAY_ID = 'hr-confirm-overlay';

  function hasDom() {
    return typeof document !== 'undefined' && !!document.body;
  }

  function closeOpen() {
    if (!hasDom()) return;
    var prev = document.getElementById(OVERLAY_ID);
    if (prev) { try { prev.remove(); } catch (e) {} }
  }

  function isOpen() {
    return hasDom() && !!document.getElementById(OVERLAY_ID);
  }

  /* The shared shell. Builds the overlay, wires Escape/backdrop/button exits,
     and hands the caller the body node to fill. `finish` is idempotent — a
     click and an Escape racing each other must resolve once. */
  function shell(opts, build) {
    var o = opts || {};
    return new Promise(function (resolve) {
      if (!hasDom()) { resolve(o.safeAnswer); return; }
      closeOpen();

      var ov = document.createElement('div');
      ov.className = 'qm-overlay';
      ov.id = OVERLAY_ID;
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');

      var modal = document.createElement('div');
      modal.className = 'qm-modal hr-confirm';
      modal.style.cssText = 'position:relative;max-width:460px';
      ov.appendChild(modal);

      var h = document.createElement('h3');
      h.style.margin = '0 0 6px';
      h.textContent = String(o.title || 'Are you sure?');
      modal.appendChild(h);

      if (o.body) {
        var b = document.createElement('div');
        b.className = 'hr-confirm-body';
        b.style.cssText = 'margin:0 0 16px;white-space:pre-wrap';
        b.textContent = String(o.body);
        modal.appendChild(b);
      }

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px';

      var no = document.createElement('button');
      no.className = 'btn btn-sm';
      no.type = 'button';
      no.setAttribute('data-hrc', 'no');
      no.textContent = String(o.cancelLabel || 'Cancel');

      var yes = document.createElement('button');
      yes.className = 'btn btn-sm ' + (o.danger ? 'btn-danger' : 'btn-primary');
      yes.type = 'button';
      yes.setAttribute('data-hrc', 'yes');
      yes.textContent = String(o.confirmLabel || 'Confirm');

      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { document.removeEventListener('keydown', onKey, true); } catch (e) {}
        try { ov.remove(); } catch (e) {}
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(o.safeAnswer); }
      }

      /* `build` owns the middle of the modal and decides what "yes" resolves
         to; everything above and below is identical for every dialog kind. */
      var api = build ? build({ modal: modal, row: row, yes: yes, no: no, finish: finish, opts: o }) : null;

      if (!o.hideCancel) row.appendChild(no);
      if (!o.hideConfirm) row.appendChild(yes);
      modal.appendChild(row);

      no.addEventListener('click', function () { finish(o.safeAnswer); });
      if (!api || typeof api.onConfirm !== 'function') {
        yes.addEventListener('click', function () { finish(o.yesAnswer); });
      } else {
        yes.addEventListener('click', function () { api.onConfirm(); });
      }
      /* Backdrop closes. A modal you cannot get out of by clicking away is the
         thing this file exists to delete. */
      ov.addEventListener('click', function (e) { if (e.target === ov) finish(o.safeAnswer); });
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(ov);
      try { (api && api.focus ? api.focus : yes).focus(); } catch (e) {}
    });
  }

  /**
   * confirm({title, body, confirmLabel, cancelLabel, danger}) -> Promise<bool>
   * Cancel / Escape / backdrop / no DOM all resolve FALSE — the safe answer for
   * a question whose "yes" branch does something.
   */
  function confirmDialog(opts) {
    var o = Object.assign({}, opts || {});
    o.safeAnswer = false;
    o.yesAnswer = true;
    return shell(o, null);
  }

  /**
   * prompt({title, body, label, value, placeholder, maxLength, confirmLabel,
   *         readOnly, validate(v) -> message|null}) -> Promise<string|null>
   *
   * Resolves the ENTERED STRING, or null for cancel/Escape/backdrop/no DOM.
   * null and '' are different answers and callers may rely on that: null means
   * "the player declined", '' means "the player cleared it".
   *
   * `validate` runs on every keystroke and gates the confirm button, which is
   * the half of a rename/naming flow window.prompt could never do — the b373
   * rename went through a prompt straight into a local setter, bypassing the
   * game's own name rules entirely.
   */
  function promptDialog(opts) {
    var o = Object.assign({}, opts || {});
    o.safeAnswer = null;
    o.confirmLabel = o.confirmLabel || 'OK';
    var input = null;
    return shell(o, function (ctx) {
      var field = document.createElement('div');
      field.className = 'hr-confirm-field';
      field.style.cssText = 'display:flex;gap:8px;align-items:stretch';

      if (o.label) {
        var lab = document.createElement('label');
        lab.style.cssText = 'display:block;margin:0 0 6px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3)';
        lab.textContent = String(o.label);
        ctx.modal.appendChild(lab);
      }

      input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (o.maxLength) input.maxLength = o.maxLength | 0;
      if (o.placeholder) input.placeholder = String(o.placeholder);
      if (o.readOnly) input.readOnly = true;
      input.value = o.value == null ? '' : String(o.value);
      input.style.cssText = 'flex:1;min-width:0;padding:9px 12px;font:inherit;'
        + 'font-size:calc(16px * var(--ui-scale, 1));color:var(--ink);background:rgba(0,0,0,.30);'
        + 'border:1px solid var(--line);border-radius:8px';
      field.appendChild(input);
      ctx.modal.appendChild(field);

      var note = document.createElement('div');
      note.style.cssText = 'min-height:17px;font-size:calc(14.5px * var(--ui-scale, 1));'
        + 'margin:8px 2px 0;color:var(--ink-3)';
      ctx.modal.appendChild(note);

      function check() {
        if (typeof o.validate !== 'function') return true;
        var msg = null;
        try { msg = o.validate(input.value); } catch (e) { msg = null; }
        note.textContent = msg ? String(msg) : '';
        ctx.yes.disabled = !!msg;
        return !msg;
      }
      input.addEventListener('input', check);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); if (check()) ctx.finish(input.value); }
      });
      check();

      return {
        focus: input,
        onConfirm: function () { if (check()) ctx.finish(input.value); },
      };
    }).then(function (v) {
      input = null;
      return v;
    });
  }

  /**
   * alert({title, body}) -> Promise<void>. One button, and it still closes on
   * Escape and the backdrop: a message is never worth trapping a player in.
   */
  function alertDialog(opts) {
    var o = Object.assign({}, opts || {});
    o.safeAnswer = undefined;
    o.yesAnswer = undefined;
    o.hideCancel = true;
    o.confirmLabel = o.confirmLabel || 'OK';
    return shell(o, null);
  }

  window.HearthriseDialog = {
    confirm: confirmDialog,
    prompt: promptDialog,
    alert: alertDialog,
    close: closeOpen,
    isOpen: isOpen,
    OVERLAY_ID: OVERLAY_ID,
  };
})();
