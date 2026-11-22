// ════════════════════════════════════════════════════════════════════════
// src/session/carry-on-intents.js — CARRY ON: THE PLAN, AND THE ONE PRESS FOR THE ACCOUNT.
//
// Tyler RULED 27-1 (2026-11-20): one "Carry on" press on the return card sends every hero back to what it did last (its ground, tier,
// setup, party, Tamsin's Repeat, Blessings, loot plan), Storage before the store; no hunt ever starts by itself
// (supabase/migrations/1024-carry-on.sql). The end card's "Hunt again, all four" is the same press for one party's own heroes.
//
//   carryOnPlan(account, cs, slots)          hr_carry_on_plan: what one press would do now, the SERVER's plan for each hero (a read:
//                                            nothing moves). `slots`: null = the whole account, or the heroes the press is for.
//   carryOn(account, cs, gold, slots, jobs, wear)  hr_carry_on: THE PRESS (1051-company-start.sql: THE ONE START). `gold` is the plan's Blessings gold the player was shown: the
//                                            server refuses quote_changed rather than charge another sum (and its new plan comes
//                                            back). `jobs`: the heroes the plan says will stop a town job, settled first through
//                                            the engine so the stretch they earned is paid (party-intents.js settleTownActivity,
//                                            the party Start's own rule). On ok every hero it touched is RE-READ: the screen shows
//                                            the server's hunts and bags, never this answer's. `wear`: the "Wear upgrades" line's picks
//                                            ({ slot, equip_slot, item, from? }, carry-on.js wearListOf), each put on by the server through
//                                            hr_apply's equip gate; a line it refuses is named and the hero still goes.
//   setCompanyLine(account, cs, line, value) hr_company_line_set: a plan line set once for every hero; every hero is read again.
//
// The client names slots, the shown gold figure and a key: never a ground, a count, a price or an item. `cs` is the hero the press was
// made from: a refusal re-reads it once (quoted-ask.js afterRefusal, the A20 rule) before the refusal is said.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { settleTownActivity } from './party-intents.js';

const VERB = 'carry_on';
const PLAN = 'carry_on_plan';
const MAX_SLOT = 5;
const ITEM = /^[a-z0-9_]{1,64}$/;
const CODE = /^[a-z0-9_]{1,48}$/;
const STATES = Object.freeze(['go', 'no', 'busy', 'parked', 'went']);
const EQUIP = /^[a-z0-9_]{1,24}$/;
/* The company's plan lines and the values each takes (1051-company-start.sql hr_company_line_set). */
export const COMPANY_LINES = Object.freeze({ wear_upgrades: Object.freeze(['on', 'off']), if_one_falls: Object.freeze(['hunt_on', 'all_home']) });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function' && !!cs && cs.status !== 'closed';
const newIdem = () => globalThis.crypto.randomUUID();

/** The scope a press names: null (the whole account) or 1..6 distinct slots, sorted; undefined when it is not one. */
export function scopeOf(slots) {
  if (slots === null || slots === undefined) return null;
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > MAX_SLOT + 1) return undefined;
  if (!slots.every((s) => Number.isInteger(s) && s >= 0 && s <= MAX_SLOT) || new Set(slots).size !== slots.length) return undefined;
  return slots.slice().sort((a, b) => a - b);
}

const linesOf = (v) => (Array.isArray(v) ? v.slice(0, 10).filter((l) => isObj(l) && ITEM.test(String(l.item)) && whole(l.qty) > 0)
  .map((l) => ({ item: l.item, qty: l.qty })) : []);

/** One hero of the server's plan or answer, bounded to the fields a screen reads. */
function heroOf(h) {
  if (!isObj(h) || !Number.isInteger(h.slot) || h.slot < 0 || h.slot > MAX_SLOT || !STATES.includes(h.state)) return null;
  const bless = Array.isArray(h.bless) ? h.bless.slice(0, 9).filter((b) => isObj(b) && Number.isInteger(b.tier) && whole(b.price) !== null)
    .map((b) => ({ tier: b.tier, price: b.price })) : [];
  return {
    slot: h.slot, state: h.state,
    name: typeof h.name === 'string' && h.name.trim() ? h.name.trim().slice(0, 40) : null,
    hunt: typeof h.hunt === 'string' && ITEM.test(h.hunt) ? h.hunt : null,
    tier: typeof h.tier === 'string' && CODE.test(h.tier) ? h.tier : null,
    why: typeof h.why === 'string' && CODE.test(h.why) ? h.why : null,
    leader: isObj(h.detail) && typeof h.detail.leader === 'string' ? h.detail.leader.slice(0, 40) : null,
    party: h.party === true,
    storage: linesOf(h.storage), short: linesOf(h.short), bless,
    blessGold: whole(h.bless_gold) || 0,
    loot: h.loot === true,
    job: typeof h.job === 'string' && CODE.test(h.job) ? h.job : null,
    after: typeof h.after === 'string' && CODE.test(h.after) ? h.after : null,
    joins: typeof h.joins === 'string' && h.joins.trim() ? h.joins.trim().slice(0, 40) : null,
    /* the press's answer: what the wear put on (its items), or that the gate refused it; the task Tamsin's board gave on entry; a pending seat */
    wore: isObj(h.wore) && typeof h.wore.refused !== 'string'
      ? Object.entries(h.wore).filter(([k, v]) => EQUIP.test(k) && typeof v === 'string' && ITEM.test(v)).map(([, v]) => v).slice(0, 12) : [],
    wearRefused: isObj(h.wore) && typeof h.wore.refused === 'string',
    task: typeof h.task === 'string' && CODE.test(h.task) ? h.task : null,
    seat: h.seat === 'seated' || h.seat === 'waits' || h.seat === 'full' ? h.seat : null,
  };
}

/** The server's plan (or a press's answer), bounded: { heroes, go, gold, went }. */
export function planOf(b) {
  const heroes = isObj(b) && Array.isArray(b.heroes) ? b.heroes.slice(0, MAX_SLOT + 1).map(heroOf).filter(Boolean) : [];
  return { heroes, go: whole(isObj(b) ? b.go : null) || 0, gold: whole(isObj(b) ? b.gold : null) || 0, went: whole(isObj(b) ? b.went : null) || 0,
    /* the company's "Wear upgrades" line as the server holds it (unknown: off, so nothing goes on that the player did not ask for) */
    wearOn: isObj(b) && b.wear_upgrades === true };
}

const refused = (ans, verb) => {
  const b = ans && isObj(ans.body) ? ans.body : {};
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb,
    plan: isObj(b.plan) ? planOf(b.plan) : null };
};

/** What one Carry on press would do now: the server's plan. A read: a refusal is no news (nothing is re-read). */
export function carryOnPlan(account, cs, slots) {
  const scope = scopeOf(slots);
  if (!usable(account, cs) || scope === undefined) return Promise.resolve({ ok: false, error: 'bad_intent', verb: PLAN, plan: null });
  return askVia(cs, PLAN, async () => {
    const ans = await account.server.rpc('hr_carry_on_plan', { p_slots: scope });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) return refused(ans, PLAN);
    return { ok: true, plan: planOf(b) };
  });
}

/** The wear list as sent: at most 48 well-formed lines naming own slots; null when there is none, undefined when it is not one. */
export function wearOf(lines) {
  if (lines === null || lines === undefined || (Array.isArray(lines) && !lines.length)) return null;
  if (!Array.isArray(lines) || lines.length > 48) return undefined;
  const out = [];
  for (const l of lines) {
    if (!isObj(l) || !Number.isInteger(l.slot) || l.slot < 0 || l.slot > MAX_SLOT || !EQUIP.test(String(l.equip_slot)) || !ITEM.test(String(l.item))) return undefined;
    const line = { slot: l.slot, equip_slot: l.equip_slot, item: l.item };
    if (l.from !== undefined && l.from !== null) {
      if (!Number.isInteger(l.from) || l.from < 0 || l.from > MAX_SLOT || l.from === l.slot) return undefined;
      line.from = l.from;
    }
    out.push(line);
  }
  return out;
}

/** THE ONE PRESS. `gold`: the plan's Blessings gold the player was shown. `jobs`: the heroes whose town job the hunt stops. `wear`: wearOf's lines. */
export function carryOn(account, cs, gold, slots, jobs, wear) {
  const scope = scopeOf(slots), lines = wearOf(wear);
  if (!usable(account, cs) || scope === undefined || whole(gold) === null || lines === undefined) return Promise.resolve({ ok: false, error: 'bad_intent', verb: VERB, plan: null });
  return askVia(cs, VERB, async () => {
    for (const o of Array.isArray(jobs) ? jobs : []) await settleTownActivity(o);
    const ans = await account.server.rpc('hr_carry_on', { p_slots: scope, p_gold: gold, p_wear: lines, p_idem: newIdem() });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      return refused(ans, VERB);
    }
    const plan = planOf(b);
    /* every hero the press touched shows the server's hunt, bag and purse: each is read again */
    const touched = plan.heroes.filter((h) => h.state === 'went' || h.state === 'no').map((h) => (typeof account.character === 'function' ? account.character(h.slot) : null))
      .filter((o) => o && o.status !== 'closed' && typeof o.load === 'function');
    if (!touched.includes(cs) && cs.status !== 'closed' && typeof cs.load === 'function') touched.push(cs);
    /* the answer carries each touched hero as the press left them (1024 `envelopes` by slot, rule 11): taken like a load, read only when absent */
    const envs = isObj(b.envelopes) ? b.envelopes : {};
    await Promise.all(touched.map((o) => o.load(isObj(envs[o.slot]) ? envs[o.slot] : null)));
    return { ok: true, plan };
  });
}

/** A plan line set once for every hero of the account (`line` a COMPANY_LINES key, `value` one of its values). On ok every open hero
    takes the envelope the answer carries for it (each one's box and section are the server's), read again only when one is missing. */
export function setCompanyLine(account, cs, line, value) {
  if (!usable(account, cs) || !COMPANY_LINES[line] || !COMPANY_LINES[line].includes(value)) return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'company_line_set' });
  return askVia(cs, 'company_line_set', async () => {
    const ans = await account.server.rpc('hr_company_line_set', { p_line: line, p_value: value, p_idem: newIdem() });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) { await afterRefusal(cs, ans); return refused(ans, 'company_line_set'); }
    /* every hero as the line left it (`envelopes` by slot, rule 11): taken like a load, read only when absent */
    const envs = isObj(b.envelopes) ? b.envelopes : {};
    const all = typeof account.characters === 'function' ? account.characters() : [cs];
    await Promise.all(all.filter((o) => o && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load(isObj(envs[o.slot]) ? envs[o.slot] : null)));
    return { ok: true };
  });
}
