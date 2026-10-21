// ════════════════════════════════════════════════════════════════════════
// src/shell/press-ack.js — EVERY PRESS ANSWERS AT ONCE.
//
// One page-level mechanism for every control that sends the server something
// (tracker r20): the shell's windows and widgets, the player menu, the
// characters screen, hero creation, chat. A control never has to opt in.
//
//   a PRESS       a click, change, drop or Enter on a control (a button, a
//                 field, a menu item, any [data-hs-act]) is noted, in the
//                 capture phase, before the control's own handler runs;
//   BINDING       an ask that starts in the intent ledger (src/session/
//                 intent-ledger.js) while the press's own event is still being
//                 handled (the same task and its microtasks), or while an ask
//                 it already holds is in flight or just settled (a chain:
//                 settle the town activity, then enter), belongs to that press;
//                 a debounced or background ask that starts later never does;
//   PENDING       from the first bound ask, in the same frame as the press, the
//                 control carries `is-sending` and aria-busy="true", and a
//                 second click on it is swallowed (one intent per press);
//   THE ACK       when every bound ask has settled (its answer AND the re-read
//                 envelope), the pending state goes; a refusal leaves
//                 `is-refused` on the control for REFUSED_MS. Its words are the
//                 component's own message line (refusalText), never a guess.
//
// Display state only: it predicts no number and gates nothing the server owns
// (CLAUDE.md §6); the control's own disabled state stays the component's.
// ════════════════════════════════════════════════════════════════════════

/* What counts as a control: the element a press lands on, walked up from the event target. */
const CONTROL = 'button, select, input, textarea, [data-hs-act], [role="button"], [role="menuitem"], [role="tab"]';
/* How long the refused mark stays on a control. */
export const REFUSED_MS = 1600;
const PRESS_EVENTS = Object.freeze(['click', 'change', 'drop', 'keydown']);

/**
 * Mount the press acknowledgement on a document for one account's ledger.
 * @param {Document} doc
 * @param {{subscribe: Function}} ledger      the account's intent ledger
 * @param {object} [o]
 * @param {(fn: Function, ms: number) => any} [o.setTimer]
 * @param {(t: any) => void} [o.clearTimer]
 * @returns {{ destroy(): void }}
 */
export function mountPressAck(doc, ledger, o) {
  const setTimer = (o && o.setTimer) || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = (o && o.clearTimer) || ((t) => clearTimeout(t));
  const sending = new WeakSet();
  const refusedTimers = new WeakMap();
  const owner = new Map();   // ask id -> its press
  let armed = null;          // the press whose event is still being handled

  const mark = (el, on) => {
    if (on) sending.add(el); else sending.delete(el);
    el.classList.toggle('is-sending', on);
    if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
  };
  const refuse = (el) => {
    clearTimer(refusedTimers.get(el));
    el.classList.add('is-refused');
    refusedTimers.set(el, setTimer(() => { el.classList.remove('is-refused'); refusedTimers.delete(el); }, REFUSED_MS));
  };

  function onPress(e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    const t = e.target && e.target.closest ? e.target.closest(CONTROL) : null;
    if (!t) return;
    /* A control whose ask is in flight takes no second press: the first one is still being answered. */
    if (sending.has(t) && (e.type === 'click' || e.type === 'drop' || e.type === 'keydown')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const press = { el: t, open: 0, refused: false, settling: false };
    armed = press;
    /* The press binds what its own handling starts: the timer fires after this task and its microtasks. */
    setTimer(() => { if (armed === press) armed = null; }, 0);
  }

  function finish(p) {
    p.settling = false;
    if (p.open > 0) return;
    mark(p.el, false);
    if (p.refused) refuse(p.el);
  }

  const off = ledger.subscribe((kind, entry) => {
    if (kind === 'begin') {
      const p = armed || null;
      if (!p || !p.el.isConnected) return;
      owner.set(entry.id, p);
      p.open++;
      if (p.open === 1) mark(p.el, true);
      return;
    }
    const p = owner.get(entry.id);
    if (!p) return;
    owner.delete(entry.id);
    p.open--;
    /* The press's verdict is its last settled ask's: the outer ask of a nest, the last link of a chain. */
    p.refused = !(entry.result && entry.result.ok);
    if (p.open > 0) return;
    /* A chain's next ask starts in the microtasks after this one settles: it still belongs to the press. */
    p.settling = true;
    armed = p;
    setTimer(() => { if (armed === p) armed = null; finish(p); }, 0);
  });

  for (const type of PRESS_EVENTS) doc.addEventListener(type, onPress, true);
  return {
    destroy() {
      off();
      for (const type of PRESS_EVENTS) doc.removeEventListener(type, onPress, true);
      armed = null;
      owner.clear();
    },
  };
}
