// ════════════════════════════════════════════════════════════════════════
// src/render/player-text.js — EVERY WORD A PLAYER READS, BY ITS ID: the views' door to src/data/player-text.js.
//
// t(id, vars) and hasText(id) live in the data layer since 2026-11-19 (lane/c-delivery): they read only the text table, and
// data rows build their sentences with them. A view imports them from here as before; it is the same module instance.
// ════════════════════════════════════════════════════════════════════════
export { t, hasText } from '../data/player-text.js?v=0.2.142';
