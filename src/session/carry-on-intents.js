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
//                                            the server's hunts and bags, never this answer's. `wear`: the heroes to dress first (the company's "Wear
//                                            upgrades" line, or the "Equip upgrades" press): companyWear for them, then the press.
//   companyWear(account, cs, slots)          the hr-accrue verb `company_wear`: the SERVER picks what each named hero puts on
//                                            (src/core/upgrade-pick.js over its own hr_state_of) and puts it on through hr_apply's gate;
//                                            every named hero takes the envelope the answer carries for it. { ok, heroes: [{ slot, wore |
//                                            refused | why }] }. Names slots only: the client never says which piece.
//   regear(account, cs, slots, o)            "EQUIP UPGRADES AND GO BACK IN" (D-2 rule 8), a visiting player's ONE press for heroes out
//                                            hunting with upgrades waiting: each leaves (hr_hunt_leave: the server ends the hunt at its next
//                                            lap), the press waits for the server to say every one is home, then ONE Start that the server
//                                            dresses first sends them back where they were (the named heroes' own ground, tier and party).
//   setCompanyLine(account, cs, line, value) hr_company_line_set: a plan line set once for every hero; every hero is read again.
//
// The client names slots, the shown gold figure and a key: never a ground, a count, a price or an item. `cs` is the hero the press was
// made from: a refusal re-reads it once (quoted-ask.js afterRefusal, the A20 rule) before the refusal is said.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { settleTownActivity } from './party-intents.js';
import { huntOf } from './hunt-sections.js';
import { COMPANY_LINES } from '../data/company-lines.js';

const VERB = 'carry_on';
const PLAN = 'carry_on_plan';
const MAX_SLOT = 5;
const ITEM = /^[a-z0-9_]{1,64}$/;
const CODE = /^[a-z0-9_]{1,48}$/;
const STATES = Object.freeze(['go', 'no', 'busy', 'parked', 'went']);
const EQUIP = /^[a-z0-9_]{1,24}$/;
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
    /* the press's answer: the task Tamsin's board gave on entry; a pending seat */
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

/** What the server's wear answer said for each hero: { slot, wore: [items] } | { slot, refused } | { slot, why }. */
function woreOf(heroes) {
  return (Array.isArray(heroes) ? heroes.slice(0, MAX_SLOT + 1) : []).filter((h) => isObj(h) && Number.isInteger(h.slot)).map((h) => ({
    slot: h.slot,
    wore: isObj(h.wore) ? Object.entries(h.wore).filter(([k, v]) => EQUIP.test(k) && typeof v === 'string' && ITEM.test(v)).map(([, v]) => v).slice(0, 12) : [],
    refused: typeof h.refused === 'string',
    busy: h.why === 'busy',
  }));
}

/** "WEAR UPGRADES": the server picks and wears for the named heroes (hr-accrue company_wear). Names slots only. */
export function companyWear(account, cs, slots) {
  const scope = scopeOf(slots);
  if (!usable(account, cs) || !scope || typeof cs.edgeIntent !== 'function') return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'company_wear', heroes: [] });
  return askVia(cs, 'company_wear', async () => {
    /* the engine's answer as it stands (CharacterSession.edgeIntent's read: nothing applied there), then each hero's envelope below */
    const r = await cs.edgeIntent('company_wear', { slots: scope }, true);
    if (!r || !r.ok) { await afterRefusal(cs, { ok: true, body: { ok: false, error: r && r.error } }); return { ok: false, error: (r && r.error) || 'refused', verb: 'company_wear', heroes: [] }; }
    /* every named hero as the wear left it (`envelopes` by slot, rule 11) */
    const envs = isObj(r.body.envelopes) ? r.body.envelopes : {};
    const all = typeof account.characters === 'function' ? account.characters() : [cs];
    await Promise.all(all.filter((o) => o && o.status !== 'closed' && typeof o.load === 'function' && isObj(envs[o.slot])).map((o) => o.load(envs[o.slot])));
    return { ok: true, heroes: woreOf(r.body.heroes) };
  });
}

/** THE ONE PRESS. `gold`: the plan's Blessings gold the player was shown. `jobs`: the heroes whose town job the hunt stops. `wear`: the
    heroes to dress first (companyWear, the server's pick); its answer rides the press's as `wore` (a refusal there never stops the press). */
export async function carryOn(account, cs, gold, slots, jobs, wear) {
  const scope = scopeOf(slots);
  if (!usable(account, cs) || scope === undefined || whole(gold) === null) return { ok: false, error: 'bad_intent', verb: VERB, plan: null };
  for (const o of Array.isArray(jobs) ? jobs : []) await settleTownActivity(o);
  const dressed = Array.isArray(wear) && wear.length ? await companyWear(account, cs, wear) : null;
  const r = await press(account, cs, gold, scope);
  return dressed && dressed.ok ? Object.assign(r, { wore: dressed.heroes }) : r;
}

function press(account, cs, gold, scope) {
  return askVia(cs, VERB, async () => {
    const ans = await account.server.rpc('hr_carry_on', { p_slots: scope, p_gold: gold, p_idem: newIdem() });
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

/**
 * "EQUIP UPGRADES AND GO BACK IN" (designer D-2 rule 8): leave, equip, go back in, for the named heroes out hunting. Every step is the
 * server's: each leave ends at the hunt's next lap (hr_hunt_leave), home is what the server's envelope says (read again, `o.pause`
 * between reads, at most `o.tries` reads), the pieces are the server's pick (companyWear) and the way back is the Start (carryOn) on the server's
 * plan for exactly these heroes, so a hero the player left by hand goes too. A boss room, a training session or a Tower run is never
 * offered this press (needs-you/gear-choice.js): their one door is their own.
 * @param {{ pause?: () => Promise<unknown>, tries?: number }} [o]  test seams: the wait between reads, and how many reads
 */
export async function regear(account, cs, slots, o = {}) {
  const scope = scopeOf(slots);
  if (!usable(account, cs) || !scope || typeof account.character !== 'function') return { ok: false, error: 'bad_intent', verb: 'regear', plan: null };
  const heroes = scope.map((s) => account.character(s)).filter((h) => h && h.status !== 'closed' && typeof h.load === 'function');
  if (heroes.length !== scope.length) return { ok: false, error: 'bad_intent', verb: 'regear', plan: null };
  const out = (h) => { const x = huntOf(h); return !!x && !x.ended; };
  for (const h of heroes) {
    if (!out(h)) continue;
    const r = await h.leaveHunt();
    if (!r || r.ok !== true) return { ok: false, error: (r && r.error) || 'refused', verb: 'regear', plan: null };
  }
  const pause = typeof o.pause === 'function' ? o.pause : () => new Promise((res) => setTimeout(res, 2000));
  const tries = Number.isInteger(o.tries) && o.tries > 0 ? o.tries : 45;
  for (let i = 0; heroes.some(out); i++) {
    if (i >= tries) return { ok: false, error: 'still_hunting', verb: 'regear', plan: null };
    await pause();
    await Promise.all(heroes.map((h) => h.load()));
  }
  const read = await carryOnPlan(account, cs, scope);
  if (!read.ok) return read;
  return carryOn(account, cs, read.plan.gold, scope, [], scope);
}
