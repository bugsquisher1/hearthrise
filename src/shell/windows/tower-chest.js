// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower-chest.js — THE HEARTH CHEST: THE KEYS YOU HOLD, EACH KEY'S ODDS, STOKING, USE (the Tower window's Chest tab).
//
// The design's "One menu that shows all of it" (the board's "2026-11-14 The Burning Tower" §5 (c), Tyler 2026-11-14: "be very transparent
// about it in a menu"). The server half is 2027-04-27-tower-chest.sql: hr_chest_section's numbers (the `tower` section's `chest`),
// hr_chest_open and hr_chest_stoke_default.
//   THE KEY you look at: one of the kinds you hold (a press on its name), with how many and where they are.
//   ITS ODDS, every one the server's: the key's chance, the Hearth's warmth from your dry keys, the stokes and what each costs in Cinders,
//   and "Your chance", the server's chance_ppm at your SAVED stokes. A press on a stoke count SAVES it (hr_chest_stoke_default) and the
//   chance shown is re-read from the server, so Use (hr_chest_open with p_stokes null: the saved default) can only send what you saw.
//   What's always inside, the type you have equipped and how often it comes, the tower weapon's +skill.
//   KEY FAMILIES (Tyler 2026-11-16): each family the server lists (tower, catacomb, later more) has its own week: "Chests opened: N / 6"
//   and "Keys held: N / 30", both the server's numbers (tower-sections.js familyOf, hr_chest_section's families), and the instant the
//   week resets (its week_ends). With no family row the pane draws no cap line and gates nothing on it.
//   Use spends one key, Use all as many as the server's own numbers allow (held, the press's cap, the key family's week). Both are off,
//   with why, while the hero is out, the key isn't held, its weapons aren't built, or the family's week of chests is used; the server
//   judges the rest. A key counts wherever the hero holds it: the bag, the account's Storage, the Key Ring (lane/c-key-ring's bag tab).
// The answer of a press (each key's weapon or none, what came out) is drawn from the server's answer; the counts come back with the envelope.
// ════════════════════════════════════════════════════════════════════════
import { keyRow, stokeRow, familyRow } from '../../session/tower-sections.js?v=0.2.133';
import { openChest, saveStokes } from '../../session/tower-intents.js?v=0.2.133';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.133';
import { CHESTS, CINDERS } from '../../data/chests.js?v=0.2.133';
import { text, attr, prop, rows } from '../../render/paint.js?v=0.2.133';
import { whole } from '../../render/format.js?v=0.2.133';
import { t } from '../../render/player-text.js?v=0.2.133';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.133';
import { runIntent } from '../intent-words.js?v=0.2.133';
import { itemName } from '../widgets/bits.js?v=0.2.133';
import { ppmWords, familyWord, keyFamilyWord, stokeLabel, stokeWord, timesWords, haulWords } from '../tower-words.js?v=0.2.133';
import { localWhen } from '../../render/format.js?v=0.2.133';

/* The one chest today (src/data/chests.js CHESTS: a later chest is a row). */
const CHEST_ID = Object.keys(CHESTS)[0];

/** The keys the hero holds (bag or Storage), in the server's order. Pure. */
export const heldKeys = (tw) => (tw && tw.chest ? tw.chest.keys.filter((k) => k.heldAll > 0) : []);

/** The key the panel shows: the one picked while still held, else the first held, else null. Pure. */
export function keyPicked(sc, tw) {
  const held = heldKeys(tw);
  return held.find((k) => k.key === sc.key) || held[0] || null;
}

const serverNow = (cs) => { const v = cs && typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** How many keys Use all spends: the held count, the press's cap and what's left of the key family's week (when the server sends the
    family), by the server's numbers; 0 when the press's cap is unknown. Pure. */
export function useAllCount(tw, k) {
  const c = tw && tw.chest;
  if (!c || !k || c.perCall === null) return 0;
  let n = Math.min(k.heldAll, c.perCall);
  const f = familyRow(tw, k);
  if (f) n = Math.min(n, f.maxWeek - f.openedWeek);
  return Math.max(0, n);
}

/** Why Use is off now, said above it, or '' when the server is to judge. Pure over the server's record. */
export function useBlock(cs, tw, k) {
  const c = tw && tw.chest;
  if (!c || !k || k.heldAll < 1) return t('tower.off_no_key');
  const h = huntOf(cs);
  if (h && !h.ended) return t('tower.off_hunting');
  if (!k.ready) return t('tower.not_ready');
  const f = familyRow(tw, k);
  if (f && f.openedWeek >= f.maxWeek) return t('tower.off_week', { max: f.maxWeek });
  return '';
}

/** The pane's skeleton (inside the Tower window, built once). */
export function chestHtml() {
  return '<p class="hs-note tc-lead">' + esc(t('tower.chest_lead')) + '</p>'
    + '<p class="tt-line tc-cinders"></p>'
    + '<div class="tc-fams"></div><p class="hs-note tc-resets"></p>'
    + '<p class="tt-line tc-none" hidden></p>'
    + '<div class="tc-keys" role="radiogroup" aria-label="' + esc(t('tower.keys_head')) + '"></div>'
    + '<section class="tc-key" hidden>'
    + '<h3 class="hs-sub tc-have"></h3><p class="hs-note tc-where"></p>'
    + '<p class="tt-line tc-base"></p><p class="tt-line tc-warm"></p>'
    + '<h4 class="tc-stoke-head">' + esc(t('tower.stoke_head')) + '</h4>'
    + '<div class="tc-stokes" role="radiogroup" aria-label="' + esc(t('tower.stoke_head')) + '"></div>'
    + '<p class="hs-note tc-stoked"></p><p class="hs-note tc-stoke-short" hidden></p><p class="hs-note tc-stoke-saved"></p>'
    + '<p class="tt-line tc-own"></p><p class="tt-line tc-inside"></p><p class="hs-note tc-plus"></p>'
    + '</section>'
    + '<div class="tt-result" hidden></div>'
    /* the chance you'd use the key at stands on the foot beside Use: the number the press acts on is never scrolled away from it */
    + '<div class="tt-foot"><p class="tc-chance"></p><p class="hw-why tc-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tc-use" data-hs-act="chest-use">' + esc(t('controls.use')) + '</button>'
    + '<button type="button" class="hh-tool tc-use-all" data-hs-act="chest-use-all">' + esc(t('controls.use_all')) + '</button></div>';
}

/* The key picker: one press a kind held, its name and count; the picked one gold. */
function patchKeys(host, held, picked, pending) {
  rows(host, held, {
    key: (k) => k.key,
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tc-pick'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'chest-key'); return b; },
    patch: (b, k) => {
      attr(b, 'data-key', k.key);
      attr(b, 'aria-checked', String(!!picked && k.key === picked.key));
      prop(b, 'disabled', pending);
      text(b, (k.name || itemName(k.item)) + ' ' + whole(k.heldAll));
    },
  });
}

/* The stoke picker: None and each row the server lists; the saved one gold. */
function patchStokes(host, k, pending) {
  const list = [0].concat(k.stokes.map((s) => s.n));
  rows(host, list.map((n) => ({ n })), {
    key: (r) => String(r.n),
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tc-stoke'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'chest-stoke'); return b; },
    patch: (b, r) => {
      attr(b, 'data-stokes', String(r.n));
      attr(b, 'aria-checked', String(k.stokesDefault === r.n));
      prop(b, 'disabled', pending);
      text(b, stokeLabel(r.n));
    },
  });
}

/* Each key family's week, the server's rows in its order: the family's name (only when it lists more than one), chests opened this week
   against the cap, and keys held against the limit when it sends them. */
function patchFamilies(host, families) {
  const named = families.length > 1;
  /* the family's name is the server's (hr_chest_key_families.name); a family this client has no words for still reads */
  rows(host, families, {
    key: (f) => f.family,
    build: () => { const d = host.ownerDocument.createElement('div'); d.className = 'tc-fam';
      d.innerHTML = '<h4 class="tc-fam-name"></h4><p class="tt-line tc-fam-week"></p><p class="tt-line tc-fam-held"></p>'; return d; },
    patch: (d, f) => {
      attr(d, 'data-family', f.family);
      const head = d.querySelector('.tc-fam-name');
      prop(head, 'hidden', !named);
      text(head, named ? keyFamilyWord(f) : '');
      text(d.querySelector('.tc-fam-week'), t('tower.week_opened', { count: whole(f.openedWeek), max: whole(f.maxWeek) }));
      const held = d.querySelector('.tc-fam-held');
      prop(held, 'hidden', f.held === null);
      text(held, f.held !== null ? t('tower.keys_held', { count: whole(f.held), max: whole(f.maxHeld) }) : '');
    },
  });
}

/* The last press's answer: each key's weapon or none, and what came out (the server's answer, drawn once). */
function patchResult(host, r) {
  prop(host, 'hidden', !r);
  if (!r) return;
  const weapons = r.opens.filter((o) => o.weapon);
  const lines = r.opens.length > 1 ? [t('tower.opened_many', { count: r.opens.length, weapons: weapons.length })] : [];
  for (const o of weapons) lines.push(t('tower.opened_weapon', { item: itemName(o.weapon) }));
  if (!weapons.length) lines.push(t('tower.opened_none'));
  const rest = Object.fromEntries(Object.entries(r.haul).filter(([id]) => !weapons.some((o) => o.weapon === id)));
  if (Object.keys(rest).length) lines.push(t('tower.haul', { list: haulWords(rest) }));
  const found = new Set(weapons.map((o) => t('tower.opened_weapon', { item: itemName(o.weapon) })));
  host.innerHTML = lines.map((l) => '<p class="' + (found.has(l) ? 'tt-found' : 'tt-line') + '">' + esc(l) + '</p>').join('');
}

/** The Chest tab, every number from the section. */
export function patchChest(pane, cs, tw, sc) {
  const c = tw.chest;
  const held = heldKeys(tw);
  const k = keyPicked(sc, tw);
  /* the Cinders' label is the item's own name (the catacomb design renames them Hearth Cinders: every key family pays them) */
  text(pane.querySelector('.tc-cinders'), c && c.cindersAll !== null ? t('tower.cinders', { name: itemName(CINDERS), count: whole(c.cindersAll) }) : '');
  text(pane.querySelector('.tc-resets'), c && c.weekEnds !== null && c.families.length ? t('tower.week_resets', { when: localWhen(c.weekEnds, serverNow(cs), true) }) : '');
  patchFamilies(pane.querySelector('.tc-fams'), c ? c.families : []);
  const none = pane.querySelector('.tc-none');
  prop(none, 'hidden', !!k);
  text(none, k ? '' : t('tower.no_keys', { every: tw.rules.landingEvery }));
  patchKeys(pane.querySelector('.tc-keys'), held, k, sc.pending);
  const panel = pane.querySelector('.tc-key');
  prop(panel, 'hidden', !k);
  if (k) {
    text(pane.querySelector('.tc-have'), t('tower.key_have', { key: k.name || itemName(k.item), count: whole(k.heldAll) }));
    /* where the keys are, when not all in one place the bag: bag, Storage, the Key Ring */
    const where = [['tower.key_bag', k.held.bag], ['tower.key_storage', k.held.storage], ['tower.key_ring', k.held.ring]].filter(([, n]) => n > 0);
    text(pane.querySelector('.tc-where'), where.length > 1 || (where.length === 1 && where[0][0] !== 'tower.key_bag')
      ? where.map(([id, n]) => t(id, { count: whole(n) })).join(', ') : '');
    text(pane.querySelector('.tc-base'), k.basePm !== null ? t('tower.key_base', { pct: ppmWords(k.basePm * 1000) }) : '');
    const warm = c.dry !== null && c.dry > 0 && c.warmthPm !== null && c.warmthPm > 1000;
    text(pane.querySelector('.tc-warm'), warm ? t('tower.key_warm', { count: c.dry, times: timesWords(c.warmthPm) }) : t('tower.key_cold'));
    patchStokes(pane.querySelector('.tc-stokes'), k, sc.pending);
    const st = k.stokesDefault ? stokeRow(k, k.stokesDefault) : null;
    /* one label a line: the saved stokes and their Cinders, short of Cinders, saved for the key */
    text(pane.querySelector('.tc-stoked'), st ? t('tower.stoked', { times: stokeWord(st.n), mult: timesWords(st.pm), cost: whole(st.cost), cinders: whole(c.cindersAll || 0) })
      : k.stokesDefault === 0 ? t('tower.stoke_off') : '');
    const short = !!st && c.cindersAll !== null && c.cindersAll < st.cost;
    prop(pane.querySelector('.tc-stoke-short'), 'hidden', !short);
    text(pane.querySelector('.tc-stoke-short'), short ? t('tower.stoke_short') : '');
    text(pane.querySelector('.tc-stoke-saved'), st ? t('tower.stoke_saved', { key: k.name || itemName(k.item) }) : '');
    text(pane.querySelector('.tc-own'), c.ownFamily && c.ownPm !== null ? t('tower.own', { family: familyWord(c.ownFamily), pct: ppmWords(c.ownPm * 1000) })
      : c.ownFamily ? '' : t('tower.own_none'));
    text(pane.querySelector('.tc-inside'), Object.keys(k.inside).length ? t('tower.inside', { list: haulWords(k.inside) }) : '');
    text(pane.querySelector('.tc-plus'), k.skillPlus !== null ? t('tower.skill_plus', { plus: k.skillPlus }) : '');
  }
  text(pane.querySelector('.tc-chance'), k && k.chancePpm !== null ? t('tower.chance', { pct: ppmWords(k.chancePpm) }) : '');
  patchResult(pane.querySelector('.tt-result'), sc.result);
  const block = useBlock(cs, tw, k);
  const all = useAllCount(tw, k);
  const use = pane.querySelector('.tc-use'), useAll = pane.querySelector('.tc-use-all');
  prop(use, 'disabled', sc.pending || !!block);
  prop(use, 'hidden', !k);
  prop(useAll, 'disabled', sc.pending || !!block || all < 2);
  prop(useAll, 'hidden', !k || k.heldAll < 2);
  attr(use, 'data-off-why', block || null);
  attr(useAll, 'data-count', all ? String(all) : null);
  text(pane.querySelector('.tc-off-why'), k ? block : '');
}

/** A press in the Chest tab; true when it was the chest's. */
export function actChest(ctx, cs, tw, sc, action, el, repaint) {
  if (action === 'chest-key') { const key = el.getAttribute('data-key'); if (keyRow(tw, key)) { sc.key = key; sc.msg = ''; sc.result = null; repaint(); } return true; }
  if (action !== 'chest-stoke' && action !== 'chest-use' && action !== 'chest-use-all') return false;
  if (sc.pending || !ctx.account) return true;
  const k = keyPicked(sc, tw);
  if (!k) { repaint(); return true; }
  if (action === 'chest-stoke') {
    const n = Number(el.getAttribute('data-stokes'));
    if (!(n === 0 || stokeRow(k, n)) || n === k.stokesDefault) return true;
    runIntent(sc, repaint, () => saveStokes(ctx.account, cs, k.key, n), t('tower.busy_stoke'), () => '', cs);
    return true;
  }
  if (useBlock(cs, tw, k)) { repaint(); return true; }
  const count = action === 'chest-use-all' ? useAllCount(tw, k) : 1;
  if (count < 1) { repaint(); return true; }
  sc.result = null;
  runIntent(sc, repaint, async () => { const r = await openChest(ctx.account, cs, CHEST_ID, k.key, count); if (r.ok) sc.result = r; return r; },
    t('tower.busy_open'), () => '', cs);
  return true;
}
