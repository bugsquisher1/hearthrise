// ════════════════════════════════════════════════════════════════════════
// src/data/honor-roll.js — THE ROLL OF HONOR'S BOARDS (game-designer, 2026-10-31).
//
// One row per board the window offers, in the order its picker lists them. A
// board is a server board id (hr_lb_boards(), 2027-02-12-leaderboard-heroes.sql)
// plus the words around it; adding a skill board is one row here, nothing else.
//   id      the server's board id ('level', 'total_level', 'skill:<skill id>')
//   group   the picker's heading the board sits under
//   label   the board's name; a skill row takes its name from SKILLS_DEF
//   reads   what the value means: 'level' (Level N, by XP), 'total' (Total level N)
//   glyph   a window.HR_GLYPHS key for the board's heading
//   why     one line: where the number comes from (a skill's is SKILL_GUIDE's `where`)
//   empty   the board with no hero on it yet: an honest line that invites the first
//   join    the viewed hero is not on it yet: how to get on
//
// THE PURPOSE TEST, PER BOARD (DESIGN_STANDARDS §4; CLAUDE.md §10):
//   Level        the main climb: who has fought furthest. Decision: push to the next
//                ground or stay where kills are safe. Plugs into hunts.
//   Total level  breadth: rewards the semi-idle side (gathering and crafting between
//                hunts). Decision: which skill to raise next. Plugs into every skill.
//   a skill      each weapon style, the Hearth and each trade has its own climb; an
//                empty board is a first place anyone can take this week. Decision:
//                which style or trade to make yours. Plugs into that skill's source.
// CUT OR HIDDEN (each with its reason, so nobody re-adds one by habit):
//   wealth       cut on the server: the purse is the ACCOUNT's (one purse, many heroes),
//                it rewards hoarding against the game's gold sinks, and gold is the one
//                ranked value another account can hand you.
//   clan_power   cut on the server: clans have no client in the rebuild.
//   renown, bosses   no server source (hr_lb_unsourced): never offered.
//   stonemason, bountyHunter   no such skill in the catalogue: nobody can rank.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from './skills.js?v=0.2.77';
import { SKILL_GUIDE } from './skill-guide.js?v=0.2.77';

/* A skill board: its name from SKILLS_DEF, where it is trained from SKILL_GUIDE (one wording, the Skills window's). */
const skill = (id, group) => Object.freeze({
  id: 'skill:' + id, group, label: SKILLS_DEF[id].name, reads: 'level', glyph: SKILL_GUIDE[id].glyph,
  why: SKILL_GUIDE[id].where,
  empty: 'No hero has trained ' + SKILLS_DEF[id].name + ' yet. The first to do it takes first place.',
  join: 'Train ' + SKILLS_DEF[id].name + ' to earn a place: ' + SKILL_GUIDE[id].where.charAt(0).toLowerCase() + SKILL_GUIDE[id].where.slice(1),
});

export const HONOR_BOARDS = Object.freeze([
  Object.freeze({ id: 'level', group: 'Hunting', label: 'Level', reads: 'level', glyph: 'uiSkull',
    why: 'Level comes from the creatures a hero defeats in hunts.',
    empty: 'No hero has earned a level in a hunt yet. The first to do it takes first place.',
    join: 'Defeat creatures in a hunt to earn Level and a place here.' }),
  Object.freeze({ id: 'total_level', group: 'Hunting', label: 'Total level', reads: 'total', glyph: 'uiStar',
    why: 'Every skill level a hero has, added together.',
    empty: 'No hero is on this roll yet.',
    join: 'Every skill level counts toward this roll.' }),
  skill('melee', 'Fighting'),
  skill('ranged', 'Fighting'),
  skill('magic', 'Fighting'),
  skill('defense', 'Fighting'),
  skill('inner_flame', 'Fighting'),
  skill('woodcutting', 'Gathering'),
  skill('mining', 'Gathering'),
  skill('fishing', 'Gathering'),
  skill('farming', 'Gathering'),
  skill('cooking', 'Crafting'),
  skill('crafting', 'Crafting'),
  skill('smithing', 'Crafting'),
  skill('runecrafting', 'Crafting'),
]);

/** The row for a board id, or null. */
export function honorBoard(id) { return HONOR_BOARDS.find((b) => b.id === id) || null; }

/** The headings in picker order, each with its boards. */
export function honorGroups() {
  const out = [];
  for (const b of HONOR_BOARDS) {
    let g = out.find((x) => x.group === b.group);
    if (!g) { g = { group: b.group, boards: [] }; out.push(g); }
    g.boards.push(b);
  }
  return out;
}

/** How many rows the window asks for: the top of a roll (the server clamps to 100). */
export const HONOR_TOP = 25;
