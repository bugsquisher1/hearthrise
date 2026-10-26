// ════════════════════════════════════════════════════════════════════════
// src/shell/settings-model.js — HOW A SETTINGS ROW IS READ, WRITTEN AND FOUND.
//
// PURE apart from the session/hud it is handed. The registry rows live in
// src/data/settings.js; this is the one place that knows what each `bind` store
// means, so the window never does.
//   read(ctx, row)         the value now (a toggle: boolean)
//   write(ctx, row, v)     display rows -> residue (or the HUD layout); a
//                          'server' row calls its existing intent and keeps
//                          nothing locally (the next envelope is the truth)
//   categoriesFor(ctx, rows, cats)   the categories that have a visible row
//   search(rows, q)        rows whose label or help holds every word of q
// ════════════════════════════════════════════════════════════════════════
import { floatShown, withFloat } from '../hunt-view/float-prefs.js?v=0.2.49';

const residueOf = (ctx) => (ctx.character && ctx.character.record && ctx.character.record.residue) || {};

export function visible(ctx, row) {
  return typeof row.visibleWhen !== 'function' || row.visibleWhen(ctx) !== false;
}

export function read(ctx, row) {
  const b = row.bind;
  if (b.store === 'float') return floatShown(ctx.character, b.type, b.target);
  if (b.store === 'hud') { const L = ctx.hud.layoutOf(b.id); return L ? L.visible : row.default; }
  if (b.store === 'residue') { const v = residueOf(ctx)[b.field]; return v === undefined ? row.default : v; }
  if (row.scope === 'server' && ctx.character && typeof ctx.character.settingOf === 'function') {
    const v = ctx.character.settingOf(row.id);
    return v === undefined ? row.default : v;
  }
  return row.default;
}

export function write(ctx, row, value) {
  if (row.scope === 'server') {
    const send = ctx.character && ctx.character[row.intent];
    if (typeof send !== 'function') return false;
    send.call(ctx.character, value, row.id);
    return true;
  }
  const b = row.bind;
  if (b.store === 'float') return ctx.character.setResidue('combatText', withFloat(ctx.character, b.type, b.target, value));
  if (b.store === 'hud') return ctx.hud.setVisible(b.id, value);
  if (b.store === 'residue') return ctx.character.setResidue(b.field, value);
  return false;
}

export function categoriesFor(ctx, rows, cats) {
  const have = new Set(rows.filter((r) => visible(ctx, r)).map((r) => r.category));
  return cats.filter((c) => have.has(c.id));
}

export function search(rows, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows.slice();
  return rows.filter((r) => {
    const hay = (r.label + ' ' + r.help).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
