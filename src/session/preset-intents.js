// ════════════════════════════════════════════════════════════════════════
// src/session/preset-intents.js — NAMING AND REMOVING SAVED SETUPS AND ACTION SETS.
//
// Ruling C4 (Tyler 2026-10-18): presets need rename and delete. Each verb is ONE
// intent naming only this character's slot, a small preset number and a name
// (supabase/migrations/2026-11-15-preset-names.sql); the server owns the name
// rule (1 to 24 characters, the hero-name moderation list) and refuses with
// `bad_preset_name`. On ok the character is RE-READ: the new name or the gone
// row shows only from the server's envelope, never from what was typed.
//   renameSetup(account, cs, preset, name)     hr_hunt_preset_rename
//   deleteSetup(account, cs, preset)           hr_hunt_preset_delete
//   renameActionSet(account, cs, preset, name) hr_action_set_rename (the bar's plaque)
// A setup owns the action set of its own number (designer ruling 2026-10-22), so
// both names are one name on the server: either verb renames both.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.67';
import { ACTION_SET_LIMITS } from '../data/rule-subjects.js?v=0.2.67';

/* Setups saved before the one-model rule (numbers 5 to 7) can still be renamed or deleted. */
const MAX_SETUP = 7;
const MAX_SET = ACTION_SET_LIMITS.presets - 1;
const newIdem = () => globalThis.crypto.randomUUID();

/** The name as sent: trimmed, at most 24 characters; '' is not sent. The server re-checks all of it. */
function setupName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 24);
}

async function settled(cs, ans) {
  const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
  if (ans && ans.ok && b.ok === true) { if (cs.status !== 'closed') await cs.load(); return { ok: true }; }
  return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused' };
}

/* One ask in the character's intent ledger; `send(server)` names its RPC (the intent-surface guard reads the names). */
function ask(account, cs, verb, send) {
  if (!account || !account.server || !cs) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, verb, async () => settled(cs, await send(account.server)));
}

const okPreset = (p, max) => Number.isInteger(p) && p >= 0 && p <= max;

/** Rename one saved setup. */
export function renameSetup(account, cs, preset, name) {
  const n = setupName(name);
  if (!okPreset(preset, MAX_SETUP) || !n) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'hunt_preset_rename', (server) => server.rpc('hr_hunt_preset_rename', { p_slot: cs.slot, p_preset: preset, p_name: n, p_idem: newIdem() }));
}

/** Remove one saved setup (none left is fine: the window says so). */
export function deleteSetup(account, cs, preset) {
  if (!okPreset(preset, MAX_SETUP)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'hunt_preset_delete', (server) => server.rpc('hr_hunt_preset_delete', { p_slot: cs.slot, p_preset: preset, p_idem: newIdem() }));
}

/** Name the action set the bar shows. */
export function renameActionSet(account, cs, preset, name) {
  const n = setupName(name);
  if (!okPreset(preset, MAX_SET) || !n) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return ask(account, cs, 'action_set_rename', (server) => server.rpc('hr_action_set_rename', { p_slot: cs.slot, p_preset: preset, p_name: n, p_idem: newIdem() }));
}
