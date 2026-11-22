// ════════════════════════════════════════════════════════════════════════
// src/session/recruit-intents.js — THE RECRUIT PRESS: ONE INTENT MAKES THREE HEROES (Tyler RD-Q6 a, 2026-11-22).
//
// A new account makes one hero. When it reaches the server's Level (src/data/recruits.js RECRUITS.atLevel), ONE press makes three more
// heroes at that Level, each in a job the company lacks (supabase/migrations/1053-recruits.sql hr_recruit_company). It is a grant: the
// server decides the Level, the jobs, the slots, the kit and the colours (what it will make is the `recruits` section,
// ./recruit-sections.js recruitsOf). The client sends a key and, for each recruit, a name the player typed or nothing (the server names it).
//
//   recruitCompany(account, cs, names, key)  THE PRESS. `names`: one a recruit in slot order, '' or null where the server names it; `key`:
//                                            the press's idempotency key, kept by the caller until the server answers (a retry with it
//                                            answers the first receipt and makes nothing). On ok the hero takes the envelope the answer
//                                            carries (rule 11: its offer is gone), the roster is read again and the recruits open beside it,
//                                            up to the server's at-once limit. { ok, level, heroes: [{ slot, name, set }] } or
//                                            { ok:false, error, answered, index, reason, at, level } (`index`: the name a refusal is
//                                            about, `reason` the name rule it broke).
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { afterRefusal } from './quoted-ask.js';
import { recruitsOf } from './recruit-sections.js';

const VERB = 'recruit_company';
const SET = /^[a-z][a-z0-9_]{0,31}$/;
const CODE = /^[a-z0-9_]{1,48}$/;
const MAX_SLOT = 5;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const lv = (v) => (Number.isInteger(v) && v >= 1 ? v : null);
const slotOk = (s) => Number.isInteger(s) && s >= 0 && s <= MAX_SLOT;

/** The names a press sends: one a recruit, trimmed, '' -> null (the server names it), exactly `count`. */
function namesOf(names, count) {
  const list = Array.isArray(names) ? names : [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = typeof list[i] === 'string' ? list[i].trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    out.push(n || null);
  }
  return out;
}

/** THE PRESS. */
export function recruitCompany(account, cs, names, key) {
  if (!account || !account.server || typeof account.server.rpc !== 'function' || !cs || cs.status === 'closed') {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: VERB });
  }
  const offer = recruitsOf(cs);
  const count = offer ? offer.slots.length : Array.isArray(names) ? Math.min(names.length, MAX_SLOT) : 0;
  return askVia(cs, VERB, async () => {
    const ans = await account.server.rpc('hr_recruit_company', { p_names: count ? namesOf(names, count) : null,
      p_idem: typeof key === 'string' && key ? key : globalThis.crypto.randomUUID() });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!(ans && ans.ok && b && b.ok === true)) {
      await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
      return { ok: false, verb: VERB, answered: !!b,
        error: (b && typeof b.error === 'string' && CODE.test(b.error) && b.error) || (ans && ans.error) || 'refused',
        index: b && Number.isInteger(b.index) ? b.index : null, reason: b && typeof b.reason === 'string' && CODE.test(b.reason) ? b.reason : null,
        at: b ? lv(b.at) : null, level: b ? lv(b.level) : null };
    }
    const heroes = (Array.isArray(b.heroes) ? b.heroes.slice(0, MAX_SLOT) : []).filter((h) => isObj(h) && slotOk(h.slot))
      .map((h) => ({ slot: h.slot, name: typeof h.name === 'string' ? h.name.slice(0, 40) : '', set: typeof h.set === 'string' && SET.test(h.set) ? h.set : null }));
    /* the hero the press was made from takes the envelope the answer carries (its offer is gone); a receipt replayed by its key carries none */
    if (typeof cs.load === 'function' && cs.status !== 'closed') await cs.load(isObj(b.envelope) ? b.envelope : null);
    /* the recruits are the roster's: read it again, then open them beside the hero on screen (the server's at-once limit holds) */
    if (typeof account.roster === 'function') await account.roster();
    if (typeof account.openOthers === 'function') await account.openOthers(heroes.map((h) => h.slot));
    return { ok: true, verb: VERB, level: lv(b.level), heroes };
  });
}
