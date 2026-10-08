// ════════════════════════════════════════════════════════════════════════
// src/features/progress-surfaces.js — WHICH TRACKERS HOME MAY DRAW.
//
// Reads the ruling in src/data/progress-surfaces.js. A KEEP/FOLD row answers
// `shown` by its decision; a HIDE row is shown only once the realm's own number
// reaches its `reveal.at` (CLAUDE.md §6): lifetime counts through
// HearthriseLifetime, levels through HearthriseSkillRecord (server XP, never
// the prediction). An unknown number keeps the surface hidden.
// setupProgressSurfaces() publishes window.HearthriseSurfaces; nothing here
// touches window at import, so tests/daily-board.mjs imports it in Node.
// ════════════════════════════════════════════════════════════════════════

import { PROGRESS_SURFACES } from '../data/progress-surfaces.js?v=564';

const BY_ID = Object.freeze(Object.fromEntries(PROGRESS_SURFACES.map((r) => [r.id, r])));

/** The reveal's number, or null when the realm has not said it. */
export function revealValue(reveal, readers) {
  if (!reveal || !readers) return null;
  if (reveal.kind === 'lifetime') return readers.lifetime(reveal.key);
  if (reveal.kind === 'totalLevel') return readers.totalLevel();
  return null;
}

/** May Home draw this surface now? Unknown id or unknown number: no. */
export function surfaceShown(id, readers) {
  const r = BY_ID[id];
  if (!r || r.decision === 'FOLD') return false;
  if (r.decision !== 'HIDE') return true;
  const v = revealValue(r.reveal, readers);
  return typeof v === 'number' && Number.isFinite(v) && v >= r.reveal.at;
}

function liveReaders() {
  const W = window;
  return {
    lifetime: (k) => {
      const L = W.HearthriseLifetime;
      const c = L && typeof L.count === 'function' ? L.count(k) : null;
      return c && Number.isFinite(c.n) ? c.n : null;
    },
    totalLevel: () => {
      const SR = W.HearthriseSkillRecord;
      const ids = Object.keys(W.SKILLS_DEF || {});
      if (!SR || typeof SR.skillLevelOf !== 'function' || !ids.length) return null;
      let t = 0;
      for (const id of ids) {
        const lv = SR.skillLevelOf(W.G, id);
        if (lv === null || !Number.isFinite(lv)) return null;
        t += lv;
      }
      return t;
    },
  };
}

export function setupProgressSurfaces() {
  window.HearthriseSurfaces = {
    rows: PROGRESS_SURFACES,
    shown: (id) => { try { return surfaceShown(id, liveReaders()); } catch (e) { return false; } },
  };
}
