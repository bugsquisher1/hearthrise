// ════════════════════════════════════════════════════════════════════════
// src/session/preset-read.js — ONE SAVED SETUP'S BAR AND OPTIONS, READ ON DEMAND.
//
// The envelope projects the bar of the setup IN USE (`hunt_settings`); a setup the hero is
// not on has only its name and gear in `hunt_presets`. The Hunt prep builder edits any setup,
// so it asks the server for that setup's whole state when it is picked, never for every one
// in every envelope (five bars of twenty slots would bloat it).
//
//   readPreset(account, cs, preset) → { ok: true, set, live, name } | { ok: false, error }
//     the setup in use   the envelope's own projection (settingsOf), `live: true`: the same server
//                        row, replaced by every envelope (so the builder sees the HUD's edits), never
//                        a read and never a client copy
//     any other setup    ONE hr_hunt_preset_read(p_slot, p_preset) (2027-04-13-hunt-preset-read.sql,
//                        ARCHITECTURE_CONTRACTS §15(f)): { ok: true, preset, saved, name, in_use, role,
//                        discipline, target_mode, stance, distance, chase, gold_floor, defaults, stop_rules,
//                        grounds, slots (as the engine plays it, with mana/usable/why/count), bar, options, … },
//                        the hunt_settings shape, so hunt-sections.js settingsView reads it as the
//                        envelope's section. An unset option reads its role default, projected by the
//                        server. `store` and `presets` are left out (the same for every setup): the store
//                        rows come from the envelope. Refusals: not_signed_in, bad_slot, bad_preset,
//                        rate_limited (60 a minute an account), no_character.
// A read, so it is tracked as the player's ask (press-ack) and never re-reads the character.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.122';
import { settingsOf, settingsView } from './hunt-sections.js?v=0.2.122';
import { ACTION_SET_LIMITS } from '../data/rule-subjects.js?v=0.2.122';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

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
    if (!ans || !ans.ok || !b || b.ok !== true) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
    const set = settingsView(Object.assign({ preset }, b));
    if (!set) return { ok: false, error: 'bad_answer' };
    /* The store the slots may buy from is one table priced per hero, not per setup: the read leaves it out, the envelope has it. */
    if (!set.store.length && live) set.store = live.store;
    return { ok: true, set, live: false, name: typeof b.name === 'string' ? b.name : null };
  });
}
