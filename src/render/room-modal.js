// ============================================================================
// src/render/room-modal.js — THE ROOM MODAL (window.HearthriseRoomModal).
//
// A reusable descriptor-driven modal: a place you look at, structures you click,
// and a room that opens with its own flavour, its state, its upgrade ladder and
// its actions. Consumers: src/features/homestead.js (the Rooms tab),
// src/features/combat-render.js, src/legacy.js (refresh after a room upgrade).
//
// MOVED VERBATIM out of src/features/clan-seat-ui.js (section 10) in the
// 2026-10-14 clean-slate demolition, because the clan seat is deleted and the
// homestead is not: the component never knew anything about clans. Its helper
// functions (esc, nfmt, pct, gly, bar) are restated below exactly as they were.
//
// The descriptor:  { id, title, subtitle, theme, scene, sections:[…], onAction }
//   {kind:'note',   html}
//   {kind:'meter',  label, value, max, valueText, foot, tone}
//   {kind:'rows',   title, rows:[{name, meta, right, bar, action}], empty}
//   {kind:'ladder', title, current, cap, rows:[…], note}
//   {kind:'actions',buttons:[{label, action, data, primary, danger, disabled, why, pin, costs}]}
//   {kind:'field',  title, select:{name,options}, qty:{name,value}, button:{…}, preview}
// `pin: true` lifts ONE control into a bar between the header and the body
// (b354). `open()` takes a BUILD FUNCTION so the modal re-derives itself from
// live state after every action.
//
// A classic script, loaded by index.html before homestead.js; every consumer
// resolves it at CALL time.
// ============================================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nfmt(v) { return Math.max(0, Math.floor(+v || 0)).toLocaleString(); }
  function pct(a, b) { return b > 0 ? Math.max(0, Math.min(100, Math.round(100 * a / b))) : 0; }
  function gly(key, px) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, 'currentColor') || '') : '';
  }
  function bar(cls, a, b) {
    return '<div class="hr-cs-bar ' + cls + '"><i style="width:' + pct(a, b) + '%"></i></div>';
  }

  var RoomModal = (function () {
    var _build = null;

    function close() {
      var m = document.querySelector('.hr-room-scrim');
      if (m) m.remove();
      _build = null;
    }
    function isOpen() { return !!document.querySelector('.hr-room-scrim'); }

    function open(buildFn) {
      if (typeof buildFn !== 'function') return null;
      _build = buildFn;
      return paint();
    }
    function refresh() { if (_build && isOpen()) paint(); }

    /* b330 — A REPAINT MUST NOT SILENTLY UNDO WHAT THE PLAYER JUST CHOSE.
       paint() rebuilds the whole modal, and refresh() is called by a dozen
       things (an armed button, a finished RPC, a 30-second feast timer). Before
       this, every <select>, quantity and text box in the room was reset to its
       descriptor default on each of those. It was CAUGHT at runtime rather than
       reasoned about: choosing a 24-hour bar and then clicking Remove — which
       arms the button, which repaints — sent 168 hours, because the select had
       silently snapped back to its first option between the two clicks. A
       control that quietly reverts is worse than one that is missing.

       So the values are carried across, keyed by the control's name, and only
       when the new DOM still offers that value (an option list can legitimately
       change under it). Focus and caret come with them, or typing a display
       name would be interrupted by any background refresh. scrollTop was
       already preserved for exactly this reason; this is the same idea applied
       to the thing the player actually typed. */
    function snapshotFields(root) {
      var keep = { val: {}, focus: null, sel: null };
      if (!root) return keep;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        keep.val[fieldKey(el)] = el.value;
      });
      var a = document.activeElement;
      if (a && root.contains(a) && a.matches && a.matches('[data-cs-sel],[data-cs-qty],[data-cs-txt]')) {
        keep.focus = fieldKey(a);
        try { keep.sel = [a.selectionStart, a.selectionEnd]; } catch (e) { keep.sel = null; }
      }
      return keep;
    }
    function fieldKey(el) {
      return (el.getAttribute('data-cs-sel') ? 'sel:' : el.getAttribute('data-cs-qty') ? 'qty:' : 'txt:') +
        (el.getAttribute('data-cs-sel') || el.getAttribute('data-cs-qty') || el.getAttribute('data-cs-txt'));
    }
    function restoreFields(root, keep) {
      if (!root || !keep) return;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        var k = fieldKey(el);
        if (!(k in keep.val)) return;
        var v = keep.val[k];
        if (el.tagName === 'SELECT' && !([].some.call(el.options, function (o) { return o.value === v; }))) return;
        if (el.value === v) return;
        el.value = v;
        /* Anything DERIVED from a field (the Storehouse's payout preview) is
           rebuilt from the descriptor's defaults, so a restored value has to
           re-announce itself or the preview would describe a different choice
           than the one showing. Same event the player's own edit fires. */
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      });
      if (!keep.focus) return;
      var back = null;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        if (fieldKey(el) === keep.focus) back = el;
      });
      if (!back) return;
      try {
        back.focus();
        if (keep.sel && back.setSelectionRange) back.setSelectionRange(keep.sel[0], keep.sel[1]);
      } catch (e) {}
    }

    /* ── THE PIN PASS ────────────────────────────────────────────────────
       Pure: takes the descriptor's section list and returns
       `{ pin, sections }` — the pinned control and a section list with that
       control removed. It never mutates the descriptor, because `_build()` is
       also what the smoke suite and the grid cards read, and a render that
       edited its input would make "what the descriptor says" depend on whether
       anything had painted it yet.

       Two shapes carry a pin, and they are the two shapes that already express
       "the thing you came here to press":
         · an `actions` button (the homestead's Build/Upgrade, which exists even
           when it is disabled — a named reason at the top of the modal is worth
           more than a button at the bottom);
         · a `ladder` row's `action` (the castle's Commission / Raise the hold,
           which only exists when it can actually be taken). The row's own
           `costs` come with it, so the bar states the price without any caller
           restating one. */
    function hoistPin(sections) {
      var list = sections || [], out = [], pin = null, i, j;
      for (i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s) { out.push(s); continue; }
        if (!pin && s.kind === 'actions' && s.buttons) {
          var keep = [];
          for (j = 0; j < s.buttons.length; j++) {
            var b = s.buttons[j];
            if (!pin && b && b.pin) {
              pin = { label: b.label, action: b.action, data: b.data, disabled: !!b.disabled,
                      why: b.why || '', whyCovered: !!b.whyCovered,
                      whyShown: typeof b.whyShown === 'string' ? b.whyShown : null,
                      costs: b.costs || null, gates: b.gates || null,
                      level: b.level || null,
                      primary: b.primary !== false };
            } else keep.push(b);
          }
          /* A section that held ONLY the pinned button must not leave an empty
             action row behind — an 8px gap where a button used to be reads as a
             rendering fault. */
          if (pin && !keep.length) continue;
          out.push(pin ? { kind: 'actions', buttons: keep } : s);
          continue;
        }
        if (!pin && s.kind === 'ladder' && s.rows) {
          var rows = s.rows.map(function (r) {
            if (pin || !r || !r.action || !r.action.pin) return r;
            var a = r.action;
            pin = { label: a.label, action: a.name, data: a.data, disabled: false,
                    why: '', costs: r.costs || null, gates: r.gates || null,
                    level: r.level == null ? null : r.level,
                    primary: true };
            var copy = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) copy[k] = r[k];
            copy.action = null;
            return copy;
          });
          out.push(pin ? { kind: 'ladder', title: s.title, rows: rows, note: s.note } : s);
          continue;
        }
        out.push(s);
      }
      return { pin: pin, sections: out };
    }

    /* ── THE THIRD REQUIREMENT CLASS (b355) ──────────────────────────────
       Tyler, live, on the Kitchen: "this doesn't tell me anywhere it requires
       a blueprint or how to get a blueprint."

       A rung has three kinds of requirement and they are not the same kind of
       problem for a player:
         (a) an affordable cost           — a number, already met
         (b) a short cost                 — a number, go grind it
         (c) an ITEM GATE (blueprint, key) — a THING, and grinding will not get
             it; you have to go to a SPECIFIC place
       (a) and (b) are the same component with two states, which is correct.
       Rendering (c) as a third cost chip ("0/1 Kitchen Blueprint II") was the
       trap: it reads as one more plank when it is actually "you cannot start".
       So a gate is its OWN line, and — because "where do I get one" is the
       immediate next question and the toast used to answer it with hardcoded
       prose — the line carries the item's real source from the reverse index.

       `spent` is the owned-rung state: the requirement stays visible on a rung
       you already built, so a player scanning the ladder sees that rungs 2 and
       3 want blueprints BEFORE reaching one they cannot pay for. */
    /* ── ONE COST CHIP, TWO PLACES (b372) ─────────────────────────────────
       The pinned build bar and the upgrade ladder were rendering the same
       have/need chip from two nearly-identical expressions, and only one of
       them handled `known === false`. They are one function now, which is what
       lets the b372 inspect link land on BOTH without a second chance to get
       it half-done.

       The link itself: KD420 asked for the maple planks in his house upgrade
       to say where they come from, and a room rung is the same question one
       screen over. `c.id` rides on every cost line (homestead costTriples,
       castle wingLadder); where it is absent — the gold line — hrInspectAttrs
       returns '' and the chip stays inert text, which is correct because gold
       is not an item and its flyout would be empty.

       `.hr-si` on the label is the affordance hook: these chips are flex, and
       a flex container does not propagate text-decoration to its children, so
       the dotted underline has to sit on an inner inline span. */
    function costChip(c) {
      var insp = (typeof window.hrInspectAttrs === 'function') ? window.hrInspectAttrs(c.id) : '';
      var hint = (typeof window.hrInspectHint === 'function') ? window.hrInspectHint(c.id) : '';
      var label = '<span class="hr-si">' + esc(c.label) + '</span>';
      var title = insp ? ' title="' + esc(c.label + hint) + '"' : '';
      /* `known === false` is a balance the server has not sent yet. It is
         neither full nor short (`is-pending`, never the short red) — it renders
         as the pending dash, the glyph the rest of the game uses for that state. */
      if (c.known === false) {
        return '<span class="hr-cs-qty is-pending"' + insp + title + '><span class="bal-pending" role="status" '
          + 'title="Waiting for the realm">—</span>/' + nfmt(c.need) + ' ' + label + '</span>';
      }
      return '<span class="hr-cs-qty' + (c.have != null && c.have >= c.need ? ' is-full' : '') + '"' + insp + title + '>' +
        (c.have != null ? nfmt(c.have) + '/' : '') + nfmt(c.need) + ' ' + label + '</span>';
    }

    function gateLines(list) {
      var g = (list || []).filter(Boolean);
      if (!g.length) return '';
      return '<div class="hr-room-gates">' + g.map(function (x) {
        var cls = x.spent ? 'is-spent' : x.ok ? 'is-met' : x.known === false ? 'is-pending' : 'is-need';   /* known:false = bag unstated: pending, never "none" */
        var state = x.spent ? 'Spent' : x.ok
          ? ('In your bags' + (x.have > 1 ? ' (' + nfmt(x.have) + ')' : ''))
          : x.known === false ? 'Still being counted' : 'You have none';
        /* b372: the gate is the requirement a player is MOST likely to tap —
           it is the one they cannot grind for. b355 already prints its source
           line underneath; the name now also opens the full flyout, where the
           value, the description and the complete source list live. */
        var gi = (typeof window.hrInspectAttrs === 'function') ? window.hrInspectAttrs(x.id) : '';
        var gh = (typeof window.hrInspectHint === 'function') ? window.hrInspectHint(x.id) : '';
        return '<div class="hr-room-gate ' + cls + '">' +
          '<span class="hr-room-gate-hd">' +
            '<span class="hr-room-gate-nm"' + gi + (gi ? ' title="' + esc((x.name || x.id) + gh) + '"' : '') +
              '>' + esc(x.name || x.id) + '</span>' +
            '<span class="hr-room-gate-st">' + esc(state) + '</span>' +
          '</span>' +
          /* No source line is better than an invented one — an item the index
             has no route for says nothing rather than guessing "dungeons". */
          (x.source ? '<span class="hr-room-gate-src">' + esc(x.source) + '</span>' : '') +
        '</div>';
      }).join('') + '</div>';
    }

    /* The bar itself. Everything in it is already-computed descriptor data —
       no price is derived here, and the cost chips are the SAME `hr-cs-qty`
       have/need component the ladder uses, so "met" reads identically in both
       places. */
    function buildBar(p) {
      if (!p) return '';
      var chips = (p.costs || []).map(costChip).join(' &middot; ');
      var btn = p.disabled
        ? '<button class="btn btn-sm" disabled title="' + esc(p.why || '') + '">' + esc(p.label) + '</button>'
        : '<button class="btn btn-sm ' + (p.primary ? 'btn-primary' : '') + '" data-cs="' + esc(p.action) + '"' +
          (p.data ? Object.keys(p.data).map(function (k) {
            return ' data-' + k + '="' + esc(p.data[k]) + '"';
          }).join('') : '') + '>' + esc(p.label) + '</button>';
      return '<div class="hr-room-build">' +
        '<div class="hr-cs-grow">' +
          (p.level != null ? '<span class="hr-room-build-lv">Lv ' + esc(p.level) + '</span>' : '') +
          (chips ? '<span class="hr-room-build-cost">' + chips + '</span>'
                 : '<span class="hr-room-build-cost is-free">Ready to build</span>') +
          (p.disabled && !p.whyCovered && (p.whyShown != null ? p.whyShown : p.why)
            ? '<div class="hr-room-build-why">' + esc(p.whyShown != null ? p.whyShown : p.why) + '</div>' : '') +
          /* The gate rides in the PINNED bar, never in a toast: the bar is the
             one strip of this modal that cannot be scrolled away from, so the
             reason a Build button is dead is on screen the moment it opens. */
          gateLines(p.gates) +
        '</div>' + btn +
      '</div>';
    }

    function paint() {
      var d = _build();
      if (!d) { close(); return null; }
      var prev = document.querySelector('.hr-room-scrim');
      var scrollTop = prev ? (prev.querySelector('.hr-room-body') || {}).scrollTop || 0 : 0;
      var keep = snapshotFields(prev);
      if (prev) prev.remove();

      var hoisted = hoistPin(d.sections);
      var sc = document.createElement('div');
      sc.className = 'hr-room-scrim hr-cs';
      sc.innerHTML =
        '<div class="hr-room-wrap" data-room-theme="' + esc(d.theme || 'hall') + '" role="dialog" aria-modal="true" ' +
            'aria-label="' + esc(d.title || '') + '">' +
          '<div class="hr-room-head">' +
            (d.scene ? '<div class="hr-room-scene">' + d.scene + '</div>' : '') +
            '<div class="hr-room-title"><h3>' + esc(d.title || '') + '</h3>' +
              (d.subtitle ? '<div class="hr-room-sub">' + d.subtitle + '</div>' : '') + '</div>' +
            '<button class="hr-room-x" data-close="1" aria-label="Close">' + (gly('uiClose', 13) || '&#10005;') + '</button>' +
          '</div>' +
          /* OUTSIDE `.hr-room-body`, which is the element that scrolls. That is
             the whole fix: no amount of body content can push this off screen. */
          buildBar(hoisted.pin) +
          '<div class="hr-room-body">' + hoisted.sections.map(section).join('') + '</div>' +
        '</div>';
      sc.addEventListener('click', function (e) {
        if (e.target === sc || (e.target.closest && e.target.closest('[data-close]'))) { close(); return; }
        var t = e.target.closest && e.target.closest('[data-cs]');
        if (t && d.onAction) d.onAction(t.getAttribute('data-cs'), t, sc);
      });
      var relay = function (e) { if (d.onInput) d.onInput(e, sc); };
      sc.addEventListener('change', relay);
      sc.addEventListener('input', relay);
      sc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      document.body.appendChild(sc);
      var body = sc.querySelector('.hr-room-body');
      if (body && scrollTop) body.scrollTop = scrollTop;
      restoreFields(sc, keep);
      return sc;
    }

    function section(s) {
      if (!s) return '';
      if (s.kind === 'note') return '<div class="hr-room-note">' + (s.html || '') + '</div>';
      if (s.kind === 'meter') {
        return (s.title ? eyebrow(s.title) : '') +
          '<div class="hr-cs-line"><span class="hr-cs-label">' + esc(s.label || '') + '</span>' +
          '<span class="hr-cs-val">' + (s.valueText || '') + '</span></div>' +
          bar(s.tone || '', s.value || 0, s.max || 1) +
          (s.foot ? '<div class="hr-cs-foot">' + s.foot + '</div>' : '');
      }
      if (s.kind === 'rows') {
        var body = (s.rows || []).map(function (r) {
          return '<div class="hr-cs-row"><div class="hr-cs-grow">' +
            '<div class="hr-cs-nm">' + (r.name || '') + '</div>' +
            (r.meta ? '<div class="hr-cs-meta">' + r.meta + '</div>' : '') +
            (r.bar ? bar(r.bar.tone || '', r.bar.value, r.bar.max) : '') +
            '</div>' + (r.right || '') + '</div>';
        }).join('');
        return (s.title ? eyebrow(s.title) : '') +
          (body || '<div class="hr-cs-empty">' + (s.empty || 'Nothing here yet.') + '</div>');
      }
      if (s.kind === 'ladder') return ladder(s);
      if (s.kind === 'actions') {
        return '<div class="hr-cs-acts">' + (s.buttons || []).map(function (b) {
          if (b.disabled) {
            return '<button class="btn btn-sm" disabled title="' + esc(b.why || '') + '">' +
              esc(b.label) + (b.why ? ' — ' + esc(b.why) : '') + '</button>';
          }
          return '<button class="btn btn-sm ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : '') +
            '" data-cs="' + esc(b.action) + '"' +
            (b.data ? Object.keys(b.data).map(function (k) {
              return ' data-' + k + '="' + esc(b.data[k]) + '"';
            }).join('') : '') + '>' + esc(b.label) + '</button>';
        }).join('') + '</div>';
      }
      if (s.kind === 'field') {
        return (s.title ? eyebrow(s.title) : '') +
          (s.intro ? '<div class="hr-cs-foot">' + s.intro + '</div>' : '') +
          '<div class="hr-cs-field">' +
            /* `value` preselects. Without it a select that reflects live server
               state (the hold's door) would open showing the wrong answer and
               invite a leader to "change" it to what it already is. */
            (s.select ? '<select data-cs-sel="' + esc(s.select.name) + '"' +
              (s.select.label ? ' aria-label="' + esc(s.select.label) + '"' : '') + '>' +
              (s.select.options || []).map(function (o) {
                return '<option value="' + esc(o.value) + '"' +
                  (s.select.value != null && String(s.select.value) === String(o.value) ? ' selected' : '') +
                  '>' + esc(o.label) + '</option>';
              }).join('') + '</select>' : '') +
            /* A free-text field, for a descriptor that needs a name typed rather
               than picked from a list. Whatever is typed is a LOOKUP KEY the
               caller resolves server-side; this component never stores it. */
            (s.text ? '<input type="text" data-cs-txt="' + esc(s.text.name) + '" maxlength="' +
              (s.text.maxlength || 24) + '" value="' + esc(s.text.value || '') +
              '" placeholder="' + esc(s.text.placeholder || '') +
              '" aria-label="' + esc(s.text.placeholder || s.text.name) + '">' : '') +
            (s.qty ? '<input type="number" min="1" step="1" value="' + esc(s.qty.value == null ? 1 : s.qty.value) +
              '" data-cs-qty="' + esc(s.qty.name) + '" placeholder="' + esc(s.qty.placeholder || 'Quantity') +
              '" aria-label="' + esc(s.qty.placeholder || 'quantity') + '">' : '') +
            (s.button ? '<button class="btn btn-sm btn-primary" data-cs="' + esc(s.button.action) + '">' +
              esc(s.button.label) + '</button>' : '') +
          '</div>' +
          (s.previewId ? '<div class="hr-cs-preview" id="' + esc(s.previewId) + '">' + (s.preview || '') + '</div>' : '');
      }
      return '';
    }
    function eyebrow(t) { return '<div class="hr-cs-eyebrow">' + t + '</div>'; }

    /* THE UPGRADE LADDER. Three rungs, not ten: what it costs now, and enough
       of what comes after to make the decision a decision. A row is dimmed when
       the castle tier will not allow it yet, and it SAYS the reason rather than
       just going grey. */
    function ladder(s) {
      var rows = (s.rows || []).map(function (r) {
        return '<div class="hr-room-rung' + (r.locked ? ' is-locked' : '') + (r.next ? ' is-next' : '') + '">' +
          '<div class="hr-room-rung-lv">Lv ' + r.level + '</div>' +
          '<div class="hr-cs-grow">' +
            '<div class="hr-cs-nm">' + (r.effect || '') + '</div>' +
            (r.costs ? '<div class="hr-cs-meta">' + r.costs.map(costChip).join(' &middot; ') + '</div>' : '') +
            (r.why ? '<div class="hr-cs-meta">' + esc(r.why) + '</div>' : '') +
            gateLines(r.gates) +
          '</div>' +
          (r.action
            ? '<button class="btn btn-sm btn-primary" data-cs="' + esc(r.action.name) + '"' +
              (r.action.data ? Object.keys(r.action.data).map(function (k) {
                return ' data-' + k + '="' + esc(r.action.data[k]) + '"';
              }).join('') : '') + '>' + esc(r.action.label) + '</button>'
            : '') +
          '</div>';
      }).join('');
      return (s.title ? eyebrow(s.title) : '') +
        '<div class="hr-room-ladder">' + (rows || '<div class="hr-cs-empty">Nothing further to build here.</div>') + '</div>' +
        (s.note ? '<div class="hr-room-note">' + s.note + '</div>' : '');
    }

    return { open: open, close: close, refresh: refresh, isOpen: isOpen,
             _section: section, _hoistPin: hoistPin };
  })();

  window.HearthriseRoomModal = RoomModal;
})();
