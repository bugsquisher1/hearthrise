// ════════════════════════════════════════════════════════════════════════
// src/shell/chronicle-model.js — WHICH PAGES OF THE CHRONICLE THIS HERO HAS FOUND, FROM WHAT THE SERVER SAYS.
//
// PURE, no DOM: src/shell/windows/wiki.js draws only what this answers. A page is open when the server's own sections
// say the hero got there (src/data/chronicle.js `open`): the grounds it has hunted (src/session/hunt-sections.js
// groundsSeenOf) and the kills the `titles` section counts. Nothing here is kept or remembered by the client, so a reload,
// another device or a closed browser shows the same pages (CLAUDE.md §6). Display only: it gates, spends and stores nothing.
// ════════════════════════════════════════════════════════════════════════
import { CHRONICLE } from '../data/chronicle.js?v=0.2.138';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.138';
import { groundsSeenOf } from '../session/hunt-sections.js?v=0.2.138';
import { titlesOf } from '../session/character-sections.js?v=0.2.138';
import { t } from '../render/player-text.js?v=0.2.138';

/** Is page `p` open for what the server said: `seen` the grounds hunted (a Set), `kills` title id -> the server's count (a Map). Pure. */
function pageOpen(p, seen, kills) {
  const o = p.open;
  if (o.kind === 'start') return true;
  if (o.kind === 'ground') return seen.has(o.hunt);
  if (o.kind === 'kills') return o.titles.some((id) => (kills.get(id) || 0) >= 1);
  return false;
}

/**
 * The Chronicle for `cs` (a CharacterSession, or null: only the start is open): { pages, found, total, key }. Each page is
 * { id, open, title, teaser, paras (the story's paragraphs, [] while shut), how: { ground } | { words } | null (shut: what opens it) }.
 * `key` names the open pages, so a window redraws only when one opens.
 */
export function chronicleOf(cs) {
  const seen = cs ? groundsSeenOf(cs) : new Set();
  const titles = cs ? titlesOf(cs) : null;
  const kills = new Map(titles ? titles.rows.map((r) => [r.id, r.have]) : []);
  const pages = CHRONICLE.map((p) => {
    const open = pageOpen(p, seen, kills);
    const g = p.open.kind === 'ground' ? HUNT_INDEX[p.open.hunt] : null;
    return {
      id: p.id, open,
      title: t('chronicle.title_' + p.id),
      teaser: t('chronicle.teaser_' + p.id),
      paras: open ? t('chronicle.page_' + p.id).split('\n\n') : [],
      how: open ? null : g ? { hunt: g.id, ground: g.name, band: g.band || null } : { words: t('chronicle.opens_' + p.id) },
    };
  });
  const found = pages.filter((p) => p.open).length;
  return { pages, found, total: pages.length, key: pages.filter((p) => p.open).map((p) => p.id).join(',') };
}
