// ════════════════════════════════════════════════════════════════════════
// src/session/residue.js — THE RESIDUE ALLOWLIST (CLAUDE.md §6).
//
// The residue is the client-only display state a character keeps on the
// server (`client_state`, written by hr_put_client_state). It is an ALLOWLIST:
// a field not named here is never read from an envelope and never sent. Each
// field gates and spends nothing; anything a player would miss after a reload
// that the game acts on is a server column, not residue.
//
// Each field carries its own sanitizer (shape and size only), applied on the
// way IN (envelope) and on the way OUT (put), so a malformed or oversized value
// can never reach a renderer or the server.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const HUD_LAYOUT = Object.freeze({ classes: 4, widgets: 48, offset: 4096 });   // headroom over the spec's 2 x 8

/** The World shell's widget show/hide, opacity and anchor per size class (src/shell/hud.js). */
function sanitizeHudLayout(v) {
  const out = {};
  if (!isObj(v)) return out;
  let classes = 0;
  for (const cls of Object.keys(v)) {
    const rows = v[cls];
    if (!/^[a-z]{1,16}$/.test(cls) || !isObj(rows)) continue;
    const kept = {};
    let n = 0;
    for (const id of Object.keys(rows)) {
      const r = rows[id];
      if (!/^[a-z0-9_-]{1,32}$/.test(id) || !isObj(r)) continue;
      const e = {};
      if (typeof r.anchor === 'string' && /^[tmb][lcr]$/.test(r.anchor)) e.anchor = r.anchor;
      for (const k of ['dx', 'dy']) if (Number.isFinite(r[k])) e[k] = Math.max(-HUD_LAYOUT.offset, Math.min(HUD_LAYOUT.offset, Math.round(r[k])));
      if (Number.isFinite(r.opacity)) e.opacity = Math.max(0.4, Math.min(1, r.opacity));
      if (typeof r.visible === 'boolean') e.visible = r.visible;
      if (!Object.keys(e).length) continue;
      kept[id] = e;
      if (++n >= HUD_LAYOUT.widgets) break;
    }
    out[cls] = kept;
    if (++classes >= HUD_LAYOUT.classes) break;
  }
  return out;
}

const ID = /^[a-z][a-z0-9_]{0,31}$/;

/** The floating-number toggles (src/data/combat-text.js FLOAT_TYPES): {type: {regular, boss}}. */
function sanitizeCombatText(v) {
  const out = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const id of Object.keys(v)) {
    const r = v[id];
    if (!ID.test(id) || !isObj(r)) continue;
    const e = {};
    for (const k of ['regular', 'boss']) if (typeof r[k] === 'boolean') e[k] = r[k];
    if (Object.keys(e).length) out[id] = e;
    if (++n >= 32) break;
  }
  return out;
}

/** The combat log's filters (LOG_TYPES ids switched off) and its hero / party scope. */
function sanitizeCombatLog(v) {
  const out = {};
  if (!isObj(v)) return out;
  if (Array.isArray(v.off)) out.off = v.off.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 32);
  if (v.scope === 'hero' || v.scope === 'party') out.scope = v.scope;
  return out;
}

/** field -> sanitizer. The keys ARE the allowlist. */
const SANITIZERS = Object.freeze({
  hudLayout: sanitizeHudLayout,     // display preference: the HUD layout; gates and spends nothing
  combatText: sanitizeCombatText,   // display preference: which floating numbers show; gates and spends nothing
  combatLog: sanitizeCombatLog,     // display preference: the combat log's filters; gates and spends nothing
});

export const RESIDUE_FIELDS = Object.freeze(Object.keys(SANITIZERS));

/** One field, bounded; undefined for a field that is not on the allowlist. */
export function sanitizeResidueField(field, v) {
  const fn = Object.prototype.hasOwnProperty.call(SANITIZERS, field) ? SANITIZERS[field] : null;
  return fn ? fn(v) : undefined;
}

/** The allowlisted, sanitized projection of a `client_state` bag (a fresh object; never the input). */
export function residueOf(bag) {
  const out = {};
  if (!isObj(bag)) return out;
  for (const f of RESIDUE_FIELDS) if (Object.prototype.hasOwnProperty.call(bag, f)) out[f] = sanitizeResidueField(f, bag[f]);
  return out;
}
