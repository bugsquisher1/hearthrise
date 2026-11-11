// ════════════════════════════════════════════════════════════════════════
// src/session/preset-read.js — ONE SAVED SETUP'S BAR AND OPTIONS, READ ON DEMAND.
//
// The envelope projects the bar of the setup IN USE (`hunt_settings`); a setup the hero is
// not on has only its name and gear in `hunt_presets`. The Hunt prep builder edits any setup,
// so it asks the server for that setup's whole state when it is picked, never for every one
// in every envelope (five bars of twenty slots would bloat it).
//
//   readPreset(account, cs, preset) → { ok: true, set, live, name } | { ok: false, error }
//     the setup in use   the envelope's own projection (settingsOf), `live: true`: never a read,
//                        never a client copy of it
//     any other setup    ONE hr_hunt_preset_read(p_slot, p_preset): the setup's full state in the
//                        hr_hunt_settings_view shape (null for an option it never set, its role's
//                        defaults projected, plus its name when the server stores one), parsed by
//                        the same reader as the envelope's section (hunt-sections.js settingsView)
//
// TODO(lane/c-hunt-preset-read): the verb is that lane's, in flight beside this one. Until it
// lands the server answers http_404 and this reads { ok: false }: the builder then edits only the
// setup in use and says the other can't be read yet. The contract above is the lane's brief; if
// its answer nests the view under another key, `viewOf` below is the one place to follow it.
// A read, so it is tracked as the player's ask (press-ack) and never re-reads the character.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.122';
import { settingsOf, settingsView } from './hunt-sections.js?v=0.2.122';
import { ACTION_SET_LIMITS } from '../data/rule-subjects.js?v=0.2.122';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/* The view in the answer: the body itself, or the one object it nests it under. */
function viewOf(body, preset) {
  const raw = isObj(body.settings) ? body.settings : isObj(body.view) ? body.view : body;
  return settingsView(Object.assign({ preset }, raw));
}

/** The setup's state, as the header says. */
export async function readPreset(account, cs, preset) {
  const live = settingsOf(cs);
  if (live && live.preset === preset) return { ok: true, set: live, live: true, name: null };
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(preset) || preset < 0 || preset >= ACTION_SET_LIMITS.presets) {
    return { ok: false, error: 'bad_intent' };
  }
  return askVia(cs, 'hunt_preset_read', async () => {
    const ans = await account.server.rpc('hr_hunt_preset_read', { p_slot: cs.slot, p_preset: preset });
    const b = ans && isObj(ans.body) ? ans.body : null;
    if (!ans || !ans.ok || !b || b.ok === false) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    const set = viewOf(b, preset);
    if (!set) return { ok: false, error: 'bad_answer' };
    /* The store the slots may buy from is one table priced per hero, not per setup: an answer without it reads the envelope's. */
    if (!set.store.length && live) set.store = live.store;
    return { ok: true, set, live: false, name: typeof b.name === 'string' ? b.name : null };
  });
}
