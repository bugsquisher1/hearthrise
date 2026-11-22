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
// THE COMPANY (lane/c-company FB-6, 1051-company-start.sql; designer D-2): the press is the ONE Start. When the company's "Wear upgrades"
// line is on (the server's plan says so), the press first asks the server to dress the going heroes (carry-on-intents.js companyWear: the
// SERVER's pick, src/core/upgrade-pick.js over each hero's own hr_state_of, put on through hr_apply's gate; a piece another going hero holds
// passes through Storage), then the Start: a tank with no armor at the end card is dressed at the next Start with no press, whatever the
// browser saw. The company's two plan lines ("Wear upgrades", "If one falls") sit in the block, each ONE hr_company_line_set for every hero.
//   pressLine(ctx, refresh, line, value)  one plan line for the whole company; every hero read again
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, attr, element } from '../render/paint.js';
import { whole, gold } from '../render/format.js';
import { t, hasText } from '../render/player-text.js';
import { itemNameFor } from './widgets/bits.js';
import { refusalWords, runIntent } from './intent-words.js';
import { huntName, partyMembershipOf } from '../session/party-sections.js';
import { huntOf } from '../session/hunt-sections.js';
import { carryOnPlan, carryOn, setCompanyLine } from '../session/carry-on-intents.js';
import { companyPlanOf } from '../session/company-sections.js';
import { TIER_NAME, DEFAULT_TIER } from '../data/hunt-tiers.js';

const itemsWords = (lines) => lines.map((l) => whole(l.qty) + ' ' + itemNameFor(l.item, l.qty)).join(', ');   // one Bone, two Bones (TK-8c)
/* a refusal's line inside a sentence: "stays in town: no stamina left" */
const lower = (s) => (s && /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The plan's lines, one a hero (busy heroes say nothing here: their own block does), in slot order. Pure. */
export function carryLinesOf(plan) {
  const out = [];
  for (const h of plan && Array.isArray(plan.heroes) ? plan.heroes : []) {
    const name = h.name || t('away.your_hero');
    /* a hunting hero planned in beside another (the party door, 1051): it joins once its hunt ends, at the next Start */
    if (h.state === 'busy') { if (h.joins) out.push({ slot: h.slot, go: false, text: t('away.carry_joins', { name, partner: h.joins }) }); continue; }
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
    /* what the Start did on the way out: the pieces the server put on, a wear the gate refused (the wear's answer, carryOn `wore`), the
       seat, Tamsin's task (the press's answer) */
    if (h.wore && h.wore.length) parts.push(t('away.carry_wore', { name, items: h.wore.map((id) => itemNameFor(id, 1)).join(', ') }));
    if (h.wearRefused) parts.push(t('away.carry_wear_refused', { name }));
    if (h.seat === 'seated' && h.joins) parts.push(t('away.carry_seated', { name, partner: h.joins }));
    if (h.task) parts.push(t('away.carry_task', { name }));
    out.push({ slot: h.slot, go: h.state === 'go' || h.state === 'went', text: parts.join(' ') });
  }
  return out;
}

/* The press's plan with what the server put on each hero first (carryOn `wore`), for the lines. */
const withWore = (plan, wore) => (Array.isArray(wore) && wore.length ? Object.assign({}, plan, { heroes: plan.heroes.map((h) => {
  const w = wore.find((x) => x.slot === h.slot);
  return w ? Object.assign({}, h, { wore: w.wore, wearRefused: w.refused }) : h;
}) }) : plan);
/* The heroes the press dresses first: the going ones, only while the server's plan says the company's line is on (the server picks). */
const wearFor = (ctx, plan) => (plan.wearOn ? plan.heroes.filter((h) => h.state === 'go').map((h) => h.slot) : null);

/* ── THE AWAY CARD'S BLOCK ─────────────────────────────────────────────── */
/* One state a card's context: the server's plan, whether it is being read, the press in flight, its answer, and the key it was read for. */
const STATE = new WeakMap();
function stateOf(ctx) {
  let s = STATE.get(ctx);
  if (!s) { s = { plan: null, asking: false, pending: false, line: false, msg: '', key: null, said: null }; STATE.set(ctx, s); }
  return s;
}
/* Each hero's hunt as the envelope says it: a hunt that starts or ends changes what one press would do. */
const keyOf = (ctx) => ctx.peers().map((p) => { const h = huntOf(p); return p.slot + ':' + (h ? h.sessionId + (h.ended ? '.' : '') : ''); }).join('|');
const pressFrom = (ctx) => ctx.character || ctx.peers()[0] || null;

/* THE COMPANY'S PLAN LINES: each a pair of presses, the server's value pressed (companyPlanOf, the section), both off while one is out. */
const LINES = Object.freeze([
  Object.freeze({ line: 'wear_upgrades', label: 'away.line_wear', tip: 'away.line_wear_tip', values: Object.freeze([['on', 'away.line_on'], ['off', 'away.line_off']]) }),
  Object.freeze({ line: 'if_one_falls', label: 'away.line_falls', tip: null, values: Object.freeze([['hunt_on', 'away.line_hunt_on'], ['all_home', 'away.line_all_home']]) }),
]);
const linesHtml = () => '<div class="haway-lines">' + LINES.map((l) => '<div class="haway-line" data-line="' + l.line + '"><span class="haway-line-name"'
  + (l.tip ? ' title="' + t(l.tip) + '"' : '') + '>' + t(l.label) + '</span>'
  + l.values.map(([v, w]) => '<button type="button" class="hh-seg" data-hs-act="away-line" data-line="' + l.line + '" data-value="' + v + '">' + t(w) + '</button>').join('')
  + '</div>').join('') + '<p class="haway-line-note" hidden></p></div>';

/** The server's Carry on plan this card shows (its last press's answer once one went, else the plan; null before it has come): the Needs you
    providers read it (../needs-you.js). */
export const carryPlanFor = (ctx) => stateOf(ctx).said || stateOf(ctx).plan;

/** The block (built once). */
export function renderCarry() {
  return '<section class="haway-carry" hidden><p class="haway-carry-head">' + t('away.carry_head') + '</p>' + linesHtml() + '<ul class="haway-carry-list"></ul>'
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
  /* the company's lines, as the server holds them; off until the section has come, and while a press is out */
  const co = companyPlanOf(pressFrom(ctx));
  for (const b of el.querySelectorAll('[data-hs-act="away-line"]')) {
    const line = b.getAttribute('data-line'), v = b.getAttribute('data-value');
    const now = !co ? null : line === 'wear_upgrades' ? (co.wearOn ? 'on' : 'off') : co.falls;
    cls(b, 'is-on', now === v);
    attr(b, 'aria-pressed', now === v ? 'true' : 'false');
    prop(b, 'disabled', !co || s.pending || s.line);
  }
  /* the note under the lines says why they are off (the plan is being read, a press is out) and when the heroes' boxes differ */
  const note = el.querySelector('.haway-line-note');
  const why = !co ? t('away.line_reading') : s.line || s.pending ? t('heroes.sending') : co.falls === 'mixed' ? t('away.line_mixed') : '';
  prop(note, 'hidden', !why);
  text(note, why);
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
  /* a card that opens again offers nothing until the server's plan for NOW lands (a plan from an earlier open may be stale) */
  if (opened) { s.msg = ''; s.said = null; s.key = null; s.plan = null; }
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
  const wear = wearFor(ctx, plan);
  s.pending = true; s.msg = ''; s.said = null;
  refresh();
  let r;
  try { r = await carryOn(ctx.account, cs, plan.gold, null, jobs, wear); } catch (e) { r = { ok: false, error: 'network' }; }
  s.pending = false;
  /* a refusal says why (quote_changed / nothing_to_carry_on bring the server's plan as it stands now); an answer says who went */
  s.msg = !(r && r.ok) ? refusalWords(r && r.error) : r.plan.went > 0 ? t('away.carry_went', { count: r.plan.went }) : t('away.carry_went_none');
  if (r && r.ok) {
    s.said = Object.assign(withWore(r.plan, r.wore), { wearOn: plan.wearOn });   // the line as it stood for this press
    dismissSlots(r.plan.heroes.filter((h) => h.state === 'went').map((h) => h.slot));
  } else if (r && r.plan) s.plan = r.plan;
  s.key = null;   // the next step reads the plan again
  refresh();
}

/** ONE plan line for the whole company (hr_company_line_set); its press is off until the server answers, and every hero is read again. */
export async function pressLine(ctx, refresh, line, value) {
  const s = stateOf(ctx), cs = pressFrom(ctx);
  if (!ctx.account || !cs || s.line || s.pending) return;
  s.line = true; s.msg = '';
  refresh();
  let r;
  try { r = await setCompanyLine(ctx.account, cs, line, value); } catch (e) { r = { ok: false, error: 'network' }; }
  s.line = false;
  if (!(r && r.ok)) s.msg = refusalWords(r && r.error);
  s.key = null;   // the plan reads the line: read it again
  refresh();
}

/* ── THE END CARD: "HUNT AGAIN, ALL FOUR" ──────────────────────────────── */
/** The slots of `cs`'s party when the account fills every seat and `cs` leads it (two or more), else null. */
export function ownPartyOf(ctx, cs) {
  const p = partyMembershipOf(cs);
  if (!p || !p.isLeader || p.seats.length < 2 || !ctx.account || typeof ctx.account.characters !== 'function') return null;
  /* the account's heroes seated in this party (each one's own party section names it) */
  const own = ctx.account.characters().filter((o) => o === cs || (partyMembershipOf(o) || {}).id === p.id);
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
  await runIntent(sc, repaint, () => carryOn(ctx.account, cs, plan.gold, slots, jobs, wearFor(ctx, plan)), t('heroes.sending'),
    (r) => (r.plan.went > 0 ? t('away.carry_went', { count: r.plan.went }) : t('away.carry_went_none'))
      + carryLinesOf({ heroes: r.plan.heroes.filter((h) => h.state === 'no') }).map((l) => ' ' + l.text).join(''), cs);
}
