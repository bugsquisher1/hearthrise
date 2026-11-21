// ════════════════════════════════════════════════════════════════════════
// src/shell/carry-on.js — CARRY ON ON THE RETURN CARD, AND "HUNT AGAIN, ALL FOUR" ON THE END CARD.
//
// Tyler RULED 27-1 (2026-11-20): ONE "Carry on" press for the whole account sends each hero back to what it did last (its ground, tier,
// setup, party, Tamsin's Repeat, Blessings, loot plan), from Storage before the store; no hunt ever starts by itself. The card shows the
// SERVER's plan for each hero before the press (hr_carry_on_plan, src/session/carry-on-intents.js), the press stays off until that plan
// says a hero would go, and the answer replaces the plan. Nothing here counts, prices or predicts: every line is the server's plan in words.
//
//   carryLinesOf(plan)        the plan's lines, one a hero, in the player's words (pure)
//   renderCarry()             the away card's block (built once): its head, the lines, the press, its answer
//   patchCarry(el, ctx)       the block as the plan stands; `live` (a press is on offer) for the card's one gold press
//   followCarry(ctx, refresh) the plan is read as the card opens and again when a hero's hunt starts or ends (its key)
//   pressCarry(ctx, refresh)  THE PRESS: the plan's gold, the heroes it will stop a job for; a hero that went has its away line read
//   ownPartyOf(ctx, cs)       the slots of a party the account fills alone, led by `cs` (two or more), or null: the end card's case
//   againAllWords(n)          "Hunt again, both" / "all three" / "all four"
//   againAll(ctx, cs, sc, repaint, slots)  the end card's press for that party: the plan first, a Blessing bill said once, then the press
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, element } from '../render/paint.js';
import { whole, gold } from '../render/format.js';
import { t, hasText } from '../render/player-text.js';
import { itemName } from './widgets/bits.js';
import { refusalWords, runIntent } from './intent-words.js';
import { huntName, partyMembershipOf } from '../session/party-sections.js';
import { partyPeersOf } from '../session/party-intents.js';
import { huntOf } from '../session/hunt-sections.js';
import { carryOnPlan, carryOn } from '../session/carry-on-intents.js';
import { TIER_NAME, DEFAULT_TIER } from '../data/hunt-tiers.js';

const itemsWords = (lines) => lines.map((l) => whole(l.qty) + ' ' + itemName(l.item)).join(', ');
/* a refusal's line inside a sentence: "stays in town: no stamina left" */
const lower = (s) => (s && /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The plan's lines, one a hero (busy heroes say nothing here: their own block does), in slot order. Pure. */
export function carryLinesOf(plan) {
  const out = [];
  for (const h of plan && Array.isArray(plan.heroes) ? plan.heroes : []) {
    const name = h.name || t('away.your_hero');
    if (h.state === 'busy') continue;
    if (h.state === 'parked') { out.push({ slot: h.slot, go: false, text: t('away.carry_parked', { name }) }); continue; }
    if (h.state === 'no') {
      out.push({ slot: h.slot, go: false, text: h.why === 'party_leader' && h.leader ? t('away.carry_leader', { name, leader: h.leader })
        : t('away.carry_no', { name, why: lower(refusalWords(h.why || 'refused')) }) });
      continue;
    }
    const parts = [t('away.carry_go', { name, ground: huntName(h.hunt), tier: TIER_NAME[h.tier] || TIER_NAME[DEFAULT_TIER] })];
    if (h.party) parts.push(t('away.carry_party'));
    if (h.storage.length) parts.push(t('away.carry_storage', { items: itemsWords(h.storage) }));
    if (h.short.length) parts.push(t('away.carry_short', { items: itemsWords(h.short) }));
    if (h.blessGold > 0) parts.push(t('away.carry_bless', { gold: gold(h.blessGold) }));
    if (h.loot) parts.push(t('away.carry_loot'));
    if (h.job && hasText('away.carry_job_' + h.job)) parts.push(t('away.carry_job_' + h.job));
    out.push({ slot: h.slot, go: h.state === 'go' || h.state === 'went', text: parts.join(' ') });
  }
  return out;
}

/* ── THE AWAY CARD'S BLOCK ─────────────────────────────────────────────── */
/* One state a card's context: the server's plan, whether it is being read, the press in flight, its answer, and the key it was read for. */
const STATE = new WeakMap();
function stateOf(ctx) {
  let s = STATE.get(ctx);
  if (!s) { s = { plan: null, asking: false, pending: false, msg: '', key: null, said: null }; STATE.set(ctx, s); }
  return s;
}
/* Each hero's hunt as the envelope says it: a hunt that starts or ends changes what one press would do. */
const keyOf = (ctx) => ctx.peers().map((p) => { const h = huntOf(p); return p.slot + ':' + (h ? h.sessionId + (h.ended ? '.' : '') : ''); }).join('|');
const pressFrom = (ctx) => ctx.character || ctx.peers()[0] || null;

/** The block (built once). */
export function renderCarry() {
  return '<section class="haway-carry" hidden><p class="haway-carry-head">' + t('away.carry_head') + '</p><ul class="haway-carry-list"></ul>'
    + '<div class="haway-acts"><button type="button" class="hh-tool is-primary" data-hs-act="away-carry" disabled>' + t('away.carry_press') + '</button></div>'
    + '<p class="hh-intent-msg haway-carry-msg" role="status" aria-live="polite"></p></section>';
}

/** The block as the plan stands. Returns `live`: the press is on offer (it is then the card's one gold press). */
export function patchCarry(el, ctx) {
  const s = stateOf(ctx);
  const plan = s.said || s.plan;
  const list = plan ? carryLinesOf(plan) : [];
  const live = !!(s.plan && s.plan.go > 0);
  const shown = live || (!!s.msg && list.length > 0) || s.pending;
  prop(el, 'hidden', !shown);
  rows(el.querySelector('.haway-carry-list'), shown ? list : [], {
    key: (l) => String(l.slot),
    build: () => element(ctx.doc, '<li class="haway-carry-line"></li>'),
    patch: (li, l) => { text(li, l.text); cls(li, 'is-no', !l.go); },
  });
  const press = el.querySelector('[data-hs-act="away-carry"]');
  text(press, s.pending ? t('heroes.sending') : t('away.carry_press'));
  prop(press, 'disabled', s.pending || !live);
  text(el.querySelector('.haway-carry-msg'), s.msg);
  return live || s.pending;
}

/** Read the server's plan for the whole account; the card repaints when it lands. */
async function readPlan(ctx, refresh) {
  const s = stateOf(ctx), cs = pressFrom(ctx);
  if (!ctx.account || !cs || s.asking) return;
  const key = s.key;
  s.asking = true;
  let r;
  try { r = await carryOnPlan(ctx.account, cs, null); } catch (e) { r = { ok: false }; }
  s.asking = false;
  s.plan = r && r.ok ? r.plan : null;
  /* a hero's hunt moved while this read was out: read once more for the newer key */
  if (s.key !== key && !s.pending) { readPlan(ctx, refresh); return; }
  refresh();
}

/** The card's controller hook: a fresh plan as the card opens, and when a hero's hunt starts or ends. */
export function followCarry(ctx, refresh, opened) {
  const s = stateOf(ctx);
  if (opened) { s.msg = ''; s.said = null; s.key = null; }
  const key = keyOf(ctx);
  if (key === s.key || s.pending) return;
  s.key = key;
  readPlan(ctx, refresh);
}

/** THE PRESS: the gold the plan showed, the heroes whose job it stops settled first; a hero that went has its away line read. */
export async function pressCarry(ctx, refresh, dismissSlots) {
  const s = stateOf(ctx), cs = pressFrom(ctx), plan = s.plan;
  if (!ctx.account || !cs || !plan || !(plan.go > 0) || s.pending) return;
  const jobs = plan.heroes.filter((h) => h.state === 'go' && h.job).map((h) => ctx.account.character(h.slot)).filter(Boolean);
  s.pending = true; s.msg = ''; s.said = null;
  refresh();
  let r;
  try { r = await carryOn(ctx.account, cs, plan.gold, null, jobs); } catch (e) { r = { ok: false, error: 'network' }; }
  s.pending = false;
  if (r && r.ok) {
    s.said = r.plan;
    s.msg = r.plan.went > 0 ? t('away.carry_went', { count: r.plan.went }) : t('away.carry_went_none');
    dismissSlots(r.plan.heroes.filter((h) => h.state === 'went').map((h) => h.slot));
  } else {
    s.msg = refusalWords(r && r.error);
    if (r && r.plan) s.plan = r.plan;   // quote_changed / nothing_to_carry_on: the server's plan as it stands now
  }
  s.key = null;   // the next step reads the plan again
  refresh();
}

/* ── THE END CARD: "HUNT AGAIN, ALL FOUR" ──────────────────────────────── */
/** The slots of `cs`'s party when the account fills every seat and `cs` leads it (two or more), else null. */
export function ownPartyOf(ctx, cs) {
  const p = partyMembershipOf(cs);
  if (!p || !p.isLeader || p.seats.length < 2 || !ctx.account) return null;
  const own = partyPeersOf(ctx.account, cs);
  return own.length === p.seats.length ? own.map((o) => o.slot).sort((a, b) => a - b) : null;
}

/** "Hunt again, both" / "Hunt again, all three" / "Hunt again, all four" (21-combat change 9). */
export function againAllWords(n) {
  return n === 2 ? t('away.again_both') : n === 3 ? t('away.again_all_three') : n === 4 ? t('away.again_all_four') : t('controls.hunt_again');
}

/** The end card's press for an own party: the server's plan for its heroes; a Blessing bill is said once, the next press goes. */
export async function againAll(ctx, cs, sc, repaint, slots) {
  if (sc.pending) return;
  const read = await carryOnPlan(ctx.account, cs, slots);
  if (!read.ok) { sc.msg = refusalWords(read.error); repaint(); return; }
  const plan = read.plan;
  const bill = 'gold:' + plan.gold + ':' + slots.join();
  if (plan.gold > 0 && sc.billed !== bill) { sc.billed = bill; sc.msg = t('away.again_bless', { gold: gold(plan.gold) }); repaint(); return; }
  sc.billed = null;
  const jobs = plan.heroes.filter((h) => h.state === 'go' && h.job).map((h) => ctx.account.character(h.slot)).filter(Boolean);
  await runIntent(sc, repaint, () => carryOn(ctx.account, cs, plan.gold, slots, jobs), t('heroes.sending'),
    (r) => (r.plan.went > 0 ? t('away.carry_went', { count: r.plan.went }) : t('away.carry_went_none'))
      + carryLinesOf({ heroes: r.plan.heroes.filter((h) => h.state === 'no') }).map((l) => ' ' + l.text).join(''), cs);
}
