// ════════════════════════════════════════════════════════════════════════
// src/data/coach.js — FIRST STEPS, THE GUIDED COACH FOR A BRAND-NEW HERO (b573).
//
// One card at a time, anchored to a gold-ringed REAL control (Huntera's model,
// watched live 2026-10-12). Each row is data; src/features/coach.js runs them
// and src/render/coach.js draws them. Adding a step is a row, never code.
//
// ── A ROW ───────────────────────────────────────────────────────────────
//   id      stable key (tests and the reload resume read it)
//   kind    'info' — a card the player reads and closes (the only kind with a
//           button that moves on); 'act' — done ONLY when `done` holds on the
//           server's facts. An 'act' card has no Next button, ever (COACH-5).
//   title   short; body 1-2 sentences (tests/copy-lint.mjs reads both)
//   path    outermost → innermost. Each hop is a selector list; the coach rings
//           the DEEPEST hop that is laid out and not locked, and while that is
//           not the last hop the card leads with the hop's `say` ("Open
//           Skills"). A hop with `reveal` is only ever ringed when
//           HearthriseReveal.shows(reveal): the coach never points at a shut door.
//   watch   (optional) what the ring sits on while the action is running and the
//           server has not counted it yet: the fight's foe, the chopping tile.
//   done    every fact must hold. Fact kinds and their server source:
//             count {key,min}    a permanent `stat` row in hr_state_of `progress`
//             xp    {skill,min}  the record's skills (the envelope's `skills`)
//             kills {monster,min} the bestiary block on the accrual envelope
//                                (G._bestiaryTrophies, render/bestiary-trophies.js)
//             sold               a vendor_sell / vendor_sell_many the edge
//                                ACCEPTED (src/net/gold.js `hearthrise:server-sold`)
//             activity           the server's last stated activity is not idle
//           No fact is a client-written G field (tests/coach-rows.mjs C2).
//   progress (optional) the one fact the card counts out loud, "3/15".
//
// ── WHY THE STEP TARGETS ARE THE REVEAL'S NUMBERS (walk-through, 2026-10-13) ──
// The designer's list completed step 2 on one log, step 3 on one shrimp and
// step 5 on one rat. Walked against the real start kit and src/data/reveals.js,
// a fresh hero sees Woodcutting and nothing else: Fishing and Cooking open at
// 15 logs chopped, Combat at 5 fish caught AND 5 cooked, Farming at 5 fights
// won (src/data/spine.js steps 1-3). One log would have rung a shut door on
// step 3. So each step completes on exactly the count that opens the next
// step's door, and the card says the number. Nothing else changed.
// ════════════════════════════════════════════════════════════════════════

/* The way to a pane: the rail door of its hub (src/nav-consolidation.js HUBS;
   the desktop rail and the phone's bottom bar carry the same data-tab, and the
   coach rings whichever is on screen), then, when the hub holds several panes,
   the pane's tab in the hub strip. COACH-6 resolves every hop in the DOM. */
const rail = (hub, label, reveal) => ({ sel: '.nav-btn[data-tab="' + hub + '"], .bn-btn[data-tab="' + hub + '"]', say: 'Open ' + label + ' first.', reveal });
const door = (tab, label, hub, hubLabel) => (hub
  ? [rail(hub, hubLabel, 'pane:' + tab), { sel: '#hub-tabs [data-hub-pane="' + tab + '"]', say: 'Open ' + label + '.', reveal: 'pane:' + tab }]
  : [rail(tab, label, 'pane:' + tab)]);
const skillTile = (id, label) => ({ sel: '#panel-skills .skill-tile[onclick*="\'' + id + '\'"]', say: 'Open ' + label + '.', reveal: 'skill:' + id });
const actTile = (id, reveal) => ({ sel: '#panel-skills .act-tile[onclick*="\'' + id + '\'"]:not(.locked)', reveal });

/* The Giant Rat's drops, in the order the sell step looks for them (the
   monster row in src/data/monsters.js `rat`). tests/coach-rows.mjs C4 pins
   that each one is a real item the vendor buys. */
export const COACH_LOOT = Object.freeze(['rat_tail', 'small_fang', 'bones', 'wheat']);
export const COACH_FOE = 'rat';

export const COACH_STEPS = Object.freeze([
  {
    id: 'welcome', kind: 'info',
    title: 'Welcome to the Hearth',
    body: 'This is your camp, and the server keeps everything you earn.',
    primary: 'Let’s go',
    path: [{ sel: '.topbar .player-avatar' }],
    done: [],
  },
  {
    id: 'chop', kind: 'act',
    title: 'Chop your first logs',
    body: 'Tap the Normal Tree. Every log fills your Woodcutting bar, and fifteen logs open Fishing.',
    path: [...door('skills', 'Skills'), skillTile('woodcutting', 'Woodcutting'), actTile('normal_tree', 'skill:woodcutting')],
    watch: '#panel-skills .act-tile.active[onclick*="\'normal_tree\'"]',
    done: [{ fact: 'count', key: 'chopped', min: 15 }, { fact: 'xp', skill: 'woodcutting', min: 1 }],
    progress: { fact: 'count', key: 'chopped', min: 15, label: 'Logs' },
  },
  {
    id: 'fish', kind: 'act',
    title: 'Catch some shrimp',
    body: 'Fish at the Shrimp Spot. Fish are your food, and five catches get you cooking.',
    path: [...door('skills', 'Skills'), skillTile('fishing', 'Fishing'), actTile('shrimp_s', 'skill:fishing')],
    watch: '#panel-skills .act-tile.active[onclick*="\'shrimp_s\'"]',
    done: [{ fact: 'count', key: 'fished', min: 5 }, { fact: 'xp', skill: 'fishing', min: 1 }],
    progress: { fact: 'count', key: 'fished', min: 5, label: 'Shrimp' },
  },
  {
    id: 'cook', kind: 'act',
    title: 'Cook your catch',
    body: 'Cook five shrimp. Cooked food heals you between fights, and it opens Combat.',
    path: [...door('skills', 'Skills'), skillTile('cooking', 'Cooking'), actTile('cook_shrimp', 'skill:cooking')],
    watch: '#panel-skills .act-tile.active[onclick*="\'cook_shrimp\'"]',
    done: [{ fact: 'count', key: 'ev:cooked', min: 5 }, { fact: 'xp', skill: 'cooking', min: 1 }],
    progress: { fact: 'count', key: 'ev:cooked', min: 5, label: 'Cooked' },
  },
  {
    id: 'fight', kind: 'act',
    title: 'Your first fight',
    body: 'Win five fights against the Giant Rat. The fight runs itself, and if you fall you get back up and keep going.',
    path: [...door('combat', 'Combat'), { sel: '#panel-combat .wt-card[data-monster="rat"]:not(.is-locked)', reveal: 'pane:combat' },
      { sel: '#panel-combat .fs-fight', reveal: 'pane:combat', foe: 'rat' }],
    watch: '#panel-combat .arena-side.foe',
    done: [{ fact: 'kills', monster: 'rat', min: 1 }, { fact: 'count', key: 'ev:kill_any', min: 5 }],
    progress: { fact: 'count', key: 'ev:kill_any', min: 5, label: 'Wins' },
  },
  {
    id: 'sell', kind: 'act',
    title: 'Turn loot into gold',
    body: 'Sell what the rat dropped. Gold buys seeds, tools and rooms.',
    path: [...door('inventory', 'the Bag', 'character', 'Character'), { sel: '#panel-inventory .invc-tile[onclick*="\'{loot}\'"]', say: 'Tap the {lootName}.', reveal: 'pane:inventory' },
      { sel: 'button[onclick^="invSellOne(\'{loot}\')"]', reveal: 'pane:inventory' }],
    done: [{ fact: 'sold' }],
  },
  {
    id: 'plant', kind: 'act',
    title: 'Plant your camp',
    body: 'Plant a seed. Crops grow while you’re away.',
    path: [...door('farming', 'the Farm', 'homestead', 'Homestead'), { sel: '#panel-farming .farm-tile.empty', say: 'Tap an empty plot.', reveal: 'pane:farming' },
      { sel: '#settings-modal.show button.shop-row[onclick^="plantCrop("][onclick*="\'turnip\'"]', reveal: 'pane:farming' }],
    done: [{ fact: 'count', key: 'ev:planted', min: 1 }],
  },
  {
    id: 'running', kind: 'act',
    title: 'Leave it running',
    body: 'Start something before you close the tab. You get paid for the time you’re away.',
    path: [...door('skills', 'Skills'), skillTile('woodcutting', 'Woodcutting'), actTile('normal_tree', 'skill:woodcutting')],
    done: [{ fact: 'activity' }],
  },
  {
    id: 'discord', kind: 'info',
    title: 'Join the village',
    body: 'Other players, help and patch notes are on our Discord.',
    primary: 'Open Discord', secondary: 'Later', opens: 'discord',
    path: [{ sel: '.topbar [data-hr-discord-btn]', reveal: 'card:discord' }],
    done: [],
  },
  {
    id: 'handoff', kind: 'info',
    title: 'That covers it',
    body: 'This bar always shows your next goal, and the guide steps back now. Good luck!',
    primary: 'Got it',
    path: [{ sel: '#hr-spine-bar:not([hidden]), #panel-profile.active .sp-card' }],
    done: [],
  },
]);

/** The fact kinds a row may name, each with the server surface that states it. */
export const COACH_FACT_SOURCES = Object.freeze({
  count: 'hr_state_of progress (kind stat, period \'\') via HearthriseReveal.facts().counts',
  xp: 'the record’s skills via HearthriseReveal.facts().skills (recordValue: unknown unless an envelope wrote them)',
  kills: 'the accrual envelope’s bestiary block via G._bestiaryTrophies.killsByMonster',
  sold: 'an applied vendor_sell / vendor_sell_many answer (src/net/gold.js settleVerdict)',
  activity: 'HearthriseActivity.getActivityState().lastServerActivity (the server’s last word)',
});

/** Who never sees the guide: more than this many levels past the start kit… */
export const COACH_ADVANCED_LEVELS = 15;
/** …or an account older than this on its first hero (a second hero re-runs it). */
export const COACH_RETURNING_MS = 24 * 60 * 60 * 1000;
