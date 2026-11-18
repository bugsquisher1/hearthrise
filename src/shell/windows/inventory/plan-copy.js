// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/plan-copy.js — "COPY LOOT PLAN FROM <HERO>" (audit 2026-11-15 F11).
//
// A loot plan is per hero (player_item_rules), so each new hero redid the dropdowns one item at a time. One press per other
// open hero of the account, under Dispatch loot, then a confirm that says what the copy does; Yes sends ONE hr_loot_plan_copy
// (loot-intents.js copyLootPlan, 2027-04-24-loot-plan-copy.sql). The server reads both heroes under the caller's own account and
// answers this hero's section; the screen shows the plan only from the re-read that follows, never from the source's copy here.
// Only the heroes this page has open are offered (account.characters(): up to four play at once, so normally all of them).
// ════════════════════════════════════════════════════════════════════════
import { nameOf, rulesOf } from '../../../session/item-sections.js?v=0.2.140';
import { rows, text, cls, prop, attr } from '../../../render/paint.js?v=0.2.140';
import { runIntent } from '../../intent-words.js?v=0.2.140';
import { copyLootPlan } from '../../../session/loot-intents.js?v=0.2.140';
import { t } from '../../../render/player-text.js?v=0.2.140';

/* The other heroes this page has open, by slot: [{ slot, name, plans }] (`plans`: how many items that hero plans, from its own server section; null unread). */
export function sourcesOf(account, cs) {
  const all = account && typeof account.characters === 'function' ? account.characters() : [];
  return all.filter((o) => o && cs && o.slot !== cs.slot && Number.isInteger(o.slot)).sort((a, b) => a.slot - b.slot)
    .map((o) => { const r = rulesOf(o); return { slot: o.slot, name: nameOf(o) || t('bag.plan_copy_hero', { slot: o.slot + 1 }), plans: r && r.loot ? Object.keys(r.loot).length : null }; });
}

/** The row of presses and its confirm (built once; patchPlanCopy fills it). */
export function planCopyHtml() {
  return '<div class="hw-plancopy"><span class="hw-plancopy-list"></span>'
    /* its own class names: the sale's confirm and its tests find the window's first .hw-confirm (grid.js patchTools) */
    + '<div class="hw-plancopy-confirm" role="alertdialog" aria-label="' + t('bag.plan_copy_confirm_label') + '"><p class="hw-plancopy-q"></p>'
    + '<div class="hw-plancopy-do"><button type="button" class="hw-primary" data-hs-act="plan-copy-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="plan-copy-no">' + t('controls.cancel') + '</button></div></div></div>';
}

/* The confirm's words: what this hero will plan afterwards, in the source's own count, and what the copy does not touch. */
export function confirmWords(src, mine) {
  const head = src.plans === null ? t('bag.plan_copy_q_unread', { to: mine, from: src.name })
    : t(src.plans === 1 ? 'bag.plan_copy_q_one' : 'bag.plan_copy_q', { to: mine, from: src.name, count: src.plans });
  return head + ' ' + t('bag.plan_copy_note', { from: src.name });
}

/** Patch the row: one press per other open hero, off while an intent is in flight; the confirm when one was pressed. */
export function patchPlanCopy(root, st, ctx, onBag) {
  const box = root.querySelector('.hw-plancopy');
  const list = sourcesOf(ctx.account, st.cs);
  cls(box, 'is-on', onBag && list.length > 0 && !!rulesOf(st.cs));
  rows(box.querySelector('.hw-plancopy-list'), list, {
    key: (s) => String(s.slot),
    build: () => { const b = root.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'hh-tool'; b.setAttribute('data-hs-act', 'plan-copy'); return b; },
    patch: (b, s) => { attr(b, 'data-from', String(s.slot)); text(b, t('bag.plan_copy_from', { hero: s.name })); prop(b, 'disabled', st.sc.pending); },
  });
  const src = list.find((s) => s.slot === st.sc.planCopy) || null;
  const c = box.querySelector('.hw-plancopy-confirm');
  cls(c, 'is-on', !!src);
  text(c.querySelector('.hw-plancopy-q'), src ? confirmWords(src, nameOf(st.cs) || t('bag.plan_copy_this')) : '');
  const yes = c.querySelector('[data-hs-act="plan-copy-yes"]');
  text(yes, t('bag.plan_copy_yes'));
  prop(yes, 'disabled', st.sc.pending);
}

/** The row's gestures; true when handled. */
export function actPlanCopy(ctx, st, action, el, repaint) {
  const sc = st.sc;
  if (action === 'plan-copy') { sc.planCopy = Number(el.getAttribute('data-from')); sc.confirm = null; repaint(); return true; }
  if (action === 'plan-copy-no') { sc.planCopy = null; repaint(); return true; }
  if (action !== 'plan-copy-yes') return false;
  const from = sc.planCopy;
  const src = sourcesOf(ctx.account, st.cs).find((s) => s.slot === from);
  sc.planCopy = null;
  if (!src || sc.pending) { repaint(); return true; }
  sc.menu = null;
  sc.msgAt = null;
  runIntent(sc, repaint, () => copyLootPlan(ctx.account, st.cs, from), t('bag.plan_copy_busy'),
    (r) => t('bag.plan_copy_done', { from: src.name }) + (r && r.copy && r.copy.skipped > 0 ? ' ' + t('bag.plan_copy_skipped', { count: r.copy.skipped }) : ''), st.cs);
  return true;
}
