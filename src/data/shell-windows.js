// ════════════════════════════════════════════════════════════════════════
// src/data/shell-windows.js — THE WORLD SHELL'S WINDOW CATALOGUE.
//
// One row per window (docs/design/WORLD_SHELL.md §4). A window is this row plus
// a renderer of the same id in src/shell/renderers.js; tests/shell-renderers.mjs
// fails the build when either half is missing. The launcher row, the shortcut
// keys and the dock widths are all read from here, so nothing about a window is
// typed twice.
//
//   id       stable id; the renderer key and the [data-hs-win] attribute
//   label    the title and the launcher tooltip
//   key      KeyboardEvent.key, lower-cased ('b', 'enter'); unique. Digits 1-0
//            belong to the action bar and are refused by the window manager.
//            null: a modal only the game opens (the play cap's popup)
//   glyph    a window.HR_GLYPHS key (src/data/glyphs.js)
//   width    docked width on desktop, CSS px (the phone uses one sheet width)
//   object   the frame's object variant (ART_DIRECTION §6): plain | satchel | doll | ledger | deed | book
//   launcher false keeps a window off the icon row (reached from another window)
//   group    a LAUNCHER_GROUPS id: the row's icon lives in that group's menu, one press under the group's own icon (launcher.js)
//   escape   true on at most one row: Esc with nothing open opens it (Settings)
//   home     'bl': opens floating at the World's bottom-left, never docked (window-manager.js)
//   startsOpen the residue field of a player switch (src/session/player-switch.js, default on): a home row the desktop
//            opens as the shell mounts while that switch is on; the player's own close turns it off and an open turns it
//            back on, one pick for every hero (window-manager.js openAtStart, keep). The phone opens nothing at start
//   typing   true: a window opened to type in (Chat). An open by a press hands its field the caret (takeCaret); its key
//            while it is open hands the caret back instead of closing it; the open at start leaves the caret alone
//   resizable true: a grip resizes it, the size kept per character (src/shell/window-sizes.js)
//   height   the starting height of a home or resizable row, CSS px
//   tabKeys  { letter: tab }: more shortcuts, each opening this window on that tab (window-manager.js openTab)
//   title   the frame's words when they are not the label (the Market's "The Weighhouse")
//   gm       true: shown only when the server's `gm` section says so (launcher.js, characters.js)
//   section  a section key: shown only while the server sends that section for the hero on screen (launcher.js
//            rowOffered, the icon row, a place's tap); hidden, it never opens
//   orElse   with `section`: while the server hides it, a tap in the world that names it opens this window instead
//   menuTabs [{ tab, label, glyph }]: more lines in its group's menu, right under its own, each opening this window on that tab
//            (launcher.js groupHtml, launcher-menu.js actMenu); offered with the row, so a `section` row's lines go with it
//   help     the text row of the window's one help line, behind the header's ? (src/data/text/windows.js)
//   helpKeys [text ids]: the window's keys, listed under its help line behind the same ? (never on a touch screen),
//            one hint a row read as "<key> to <what it does>" (window-head.js keysHtml)
//
// THE COEXISTENCE TABLE (UX flow audit 2026-11-11, src/shell/window-manager.js): which windows stay open together.
//   beside   [ids]: windows that dock side by side past the dock's 60% (the bag and the window a bag task needs:
//            Storage, the Shop, Character), so at 1440 neither closes the other
//   over     true: wider than the dock (Hunts, Hunt prep), it lies over the docked windows and closes none
//   rise     true: in town it rises over the bottom bar whenever its content needs more than the dock leaves, at any
//            screen height (window-fit.js; any other window rises only on a short World, window-manager.js DOCK_ROOM_PX)
//   pageOf   [ids]: opened by a press inside one of these windows, it opens as a PAGE of it with Back, never a
//            second window on top (Monster facts in Hunts, Configure action in Hunt prep)
//
// The rest of the spec's catalogue (Bestiary L) lands
// with its renderer: a launcher never opens a window that does not exist yet
// (§1). Chat opens on Global (or the tab it showed last).
//
// Tyler's first playtest (10-18) shaped the row: Hunts comes first (going
// hunting must be obvious from the first minute; a hunt's door in the World
// opens it too); the bag and the gear are ONE Inventory window (the paper doll
// beside the item grid); the skills are two windows, combat and the rest, so
// neither scrolls; Storage is reachable anywhere; and finding an item is the
// search inside Inventory and Storage, not a window of its own.
// ════════════════════════════════════════════════════════════════════════

import { TOWN_NAME } from './world/town/plan.js?v=0.2.142';

/* THE TOP BAR'S GROUPS (Tyler 2026-11-16: "Our top menu bar is starting to get long again ... It's getting a bit overwhelming").
   The row had grown back to 19 icons (WORLD_SHELL.md §1 started at 8), so the windows a player opens now and then sit one press
   under a group's icon, in the order listed here: the places in town, the people, and the system menu. Every window keeps its key,
   so a group costs a key player nothing and a mouse player one press. A phone shows the same groups, each menu a slide-out sheet.
   A group's icon stands in the row where its first member's would. */
export const LAUNCHER_GROUPS = Object.freeze([
  Object.freeze({ id: 'town', label: 'Town', glyph: 'uiCastle' }),
  Object.freeze({ id: 'social', label: 'Social', glyph: 'uiPeople' }),
  Object.freeze({ id: 'menu', label: 'Menu', glyph: 'navMore' }),
]);

export const SHELL_WINDOWS = Object.freeze([
  Object.freeze({ id: 'hunts', label: 'Hunts', key: 'h', glyph: 'uiMap', width: 960, object: 'plain', over: true, help: 'windows.help_hunts' }),
  Object.freeze({ id: 'inventory', label: 'Inventory', key: 'b', glyph: 'navInventory', width: 560, object: 'satchel', help: 'windows.help_inventory',
    helpKeys: Object.freeze(['bag.key_search', 'bag.key_move', 'bag.key_use', 'bag.key_select', 'bag.key_range', 'bag.key_all', 'bag.key_clear',
      'bag.key_sell', 'bag.key_lock']),
    beside: Object.freeze(['storage', 'shop', 'character']) }),
  Object.freeze({ id: 'character', label: 'Character', key: 'c', glyph: 'navCharacter', width: 560, object: 'ledger' }),
  /* The band says "Skills" (UI audit 2026-11-18: "Gathering and crafting" took two lines beside Back, ?, the key and Close, and the
     window can't be wider: it docks beside Party, 440, inside 60% of a 1440 World, tests/shell-core.mjs W18). Its two sections
     name the rest; the icon row keeps the full label. */
  Object.freeze({ id: 'skills-trade', label: 'Gathering and crafting', title: 'Skills', key: 'g', glyph: 'uiPickaxe', width: 380, object: 'ledger', help: 'windows.help_skills' }),
  /* Services (stamina, Blessings) is the Shop's third tab (Tyler 2026-10-25: "Lets move services to the 'shop' menu"):
     its old key R opens the Shop on it. */
  Object.freeze({ id: 'shop', label: 'Shop', key: 'v', group: 'town', glyph: 'navStore', width: 480, object: 'ledger', help: 'windows.help_shop', tabKeys: Object.freeze({ r: 'services' }) }),
  /* The Weighhouse (market design 2026-10-24): one window with four tabs, for every hero, hunting or not. */
  Object.freeze({ id: 'market', label: 'Market', title: 'The Weighhouse', key: 'm', group: 'town', glyph: 'navMarket', width: 820, object: 'ledger' }),
  /* Two containers side by side (UI audit 2026-11-18 #4): six pockets a row in each at 1280 and up, and still beside the bag (560) at 1280 (W18). */
  Object.freeze({ id: 'storage', label: 'Storage', key: 't', group: 'town', glyph: 'uiChest', width: 660, object: 'satchel', help: 'windows.help_storage' }),
  /* Tamsin's tally (2026-12-23-tally-tasks.sql): kill tasks counted by the server, paid in town. Her board on the
     Common opens it too (src/data/world/stations.js TAP_OPENS), and so does the HUD's tally. */
  Object.freeze({ id: 'tally', label: 'Tamsin\'s tally', key: 'q', group: 'town', glyph: 'navBounty', width: 460, object: 'ledger' }),
  /* What gold buys in town (Tyler 2026-11-04; the designer's gold sinks section): Hearth powders, a round at the Tavern, later the Town Works. X is its shortcut (every
     other letter is taken and WASD walks; You died gave X up, a popup only the game opens). The Tavern on the map opens it on Round. Its label is the city's name, read from the one place it lives.
     Its glyph is the Hearth's fire: the castle is the Town group's own (LAUNCHER_GROUPS). */
  Object.freeze({ id: 'havora', label: TOWN_NAME, key: 'x', group: 'town', glyph: 'uiFire', width: 420, object: 'ledger' }),
  /* The farm plots (P1 2026-10-22: no client door to farming). Per hero: each hero has its own plots on the server. */
  Object.freeze({ id: 'farm', label: 'Farm', key: 'j', group: 'town', glyph: 'uiSprout', width: 440, object: 'plain' }),
  /* Lane S2: stamina refills, blessings and the character's name, each priced by the server. */
  /* The account's one house (Tyler 2026-10-15): the property, its rooms and the storage chests, bought from any character. */
  Object.freeze({ id: 'house', label: 'House', key: 'e', group: 'town', glyph: 'navHouse', width: 480, object: 'deed' }),
  /* Combat training (the designer's "2026-11-13 Combat training spec"): one combat skill for gold by the hour at the yard, or free
     on the house dummy. Shown only while the server sends the `training` section; the yard's dummies open it, and while it is
     hidden the yard opens Hunts, as before. No letter: the yard and the icon open it. */
  Object.freeze({ id: 'training', label: 'Training', title: 'Training Yard', key: null, noShortcut: true, group: 'town', section: 'training', orElse: 'hunts',
    glyph: 'uiSword', width: 420, object: 'ledger' }),
  /* The Burning Tower (Tyler 2026-11-14; the board's "2026-11-14 The Burning Tower"): the climb's start floors, this week's keys and the Hearth
     Chest, one window. Shown only while the server sends the `tower` section (the burning_tower switch); the Great Hearth's tap opens it
     (src/data/world/stations.js), so does the Havora window's Hearth tab, and so does its line in the Town menu (QA gate 2026-11-17: the
     Hearth click was its only door); while it is hidden the Hearth opens the bag, as before, and the Town menu has no line for it. */
  /* `rise` (audit 2026-11-18 A5): its column grew a Before entering box, so the window rises over the bar in town when the rules, the supplies and
     Enter need more than the room above it (in a hunt no window rises: window-fit.js). Kept at 1440x900 (v0.2.141 gate P3, measured: the column is
     734 px against 558 above the bar, and without the rise the Climb rules lay wholly under the sticky door again) */
  /* `menuTabs` (QA audit 2026-11-18 N2: the Hearth Chest was reached only through Burning Tower, then Chest): its own line in the Town menu,
     opening the window on its Chest tab */
  Object.freeze({ id: 'tower', label: 'Burning Tower', title: 'The Burning Tower', key: null, noShortcut: true, group: 'town', section: 'tower', orElse: 'inventory',
    glyph: 'uiFlame', width: 660, object: 'ledger', rise: true, menuTabs: Object.freeze([Object.freeze({ tab: 'chest', label: 'Hearth Chest', glyph: 'uiKey' })]) }),
  /* The setup builder (Tyler 2026-11-11): the setups column beside the HUD's own 2 x 10 slot grid, so it is as wide as Hunts. No icon of its
     own since the bar's groups (2026-11-16): the door beside the bar's setup name opens it (action-bar.js, drawn from this row: the
     glyph, the name, the key), so does Hunt prep under a ground's Go as, and P. Its glyph is a written plan (Tyler 2026-11-17: the
     tick it had read as a confirm, and nobody found Hunt prep behind it). It rises over the bar in town when it needs the room (Coordinator
     review 2026-11-17: at 1518x845 the dock left it 526 px and its bar's slots 11-20 ran under Close and Save; the bar it edits is this). */
  Object.freeze({ id: 'hunt-prep', label: 'Hunt prep', key: 'p', launcher: false, glyph: 'uiQuests', width: 1040, object: 'plain', over: true, rise: true, help: 'windows.help_prep' }),
  /* Week plan step 16 + QoL 3: the party, and every open character on one screen (opened from the
     character strip's "All characters", so it takes no launcher icon). */
  Object.freeze({ id: 'hunt-party', label: 'Party', key: 'y', group: 'social', glyph: 'uiBanner', width: 440, object: 'plain' }),
  Object.freeze({ id: 'characters', label: 'All characters', key: 'o', glyph: 'navProfile', width: 460, object: 'ledger', launcher: false }),
  /* UI audit 2026-11-18 #2: the return is ONE card, docked where the summary docks (src/shell/windows/away.js opens it from the alert centre's away lines) */
  Object.freeze({ id: 'away', label: 'While you were away', key: null, noShortcut: true, glyph: 'uiHourglass', width: 420, object: 'ledger', launcher: false, rise: true }),
  /* No `rise` (v0.2.141 gate: at 1440x900 the card lay over the action bar): the result leads and the presses' foot is sticky, so the card reads
     from the top and its presses stay in view while it scrolls above the bar; on a short World (UI audit 2026-11-18 #1: 404 px of a 1,194 px
     card) it rises as any window does (window-fit.js, DOCK_ROOM_PX) */
  Object.freeze({ id: 'hunt-summary', label: 'Hunt summary', key: 'l', glyph: 'uiCheck', width: 420, object: 'ledger', launcher: false }),
  Object.freeze({ id: 'hud', label: 'HUD layout', key: 'u', glyph: 'uiSettings', width: 380, object: 'plain', launcher: false }),
  /* One bar slot: what it does and when (opened by a press on a bar slot, in town or in a hunt). */
  Object.freeze({ id: 'configure-action', label: 'Configure action', key: 'k', glyph: 'uiTarget', width: 880, object: 'plain', launcher: false, modal: true,
    pageOf: Object.freeze(['hunt-prep']) }),
  /* Tyler 2026-10-19: a death opens a centred popup (src/shell/death-popup.js opens it; its key shows the last death). */
  Object.freeze({ id: 'death', label: 'Defeated', key: null, glyph: 'uiSkull', width: 420, object: 'ledger', launcher: false, modal: true }),
  /* Tyler 2026-11-01: the play cap's refusal opens a centered popup (windows/play-cap.js). It has nothing to say until the server refuses a start, so no key. */
  Object.freeze({ id: 'play-cap', label: 'Too many heroes playing', key: null, glyph: 'uiWarn', width: 420, object: 'plain', launcher: false, modal: true }),
  /* Tyler 2026-11-14: after a hero's first Krell kill, Holly and Venn ask it to pick a side (windows/faction-join.js opens it once; the
     Character window's Faction tab offers it again). Shown only while the server sends the `factions` section (its switch). */
  Object.freeze({ id: 'faction-join', label: 'Choose a side', key: null, noShortcut: true, section: 'factions', glyph: 'uiFlame', width: 640, object: 'ledger', launcher: false, modal: true }),
  /* Tyler 2026-10-22: "Chat window: resizable, opens by default at the bottom-left". It opens floating there (never docked) as the
     shell mounts on desktop (`startsOpen`, lane/a-chat-opens: a new account found only the online count there) until the player closes
     it, and the player resizes it (both kept in the residue). Enter on it open starts a line rather than closing it (`typing`).
     `besideCoach`: the coach's card stays up while it is open (played 2026-11-10: Chat is the window a new player leaves open, and with it open
     the screen said nothing at the minute the designer would have quit). It sits in the far corner from the card; a phone's sheet takes the
     right half and the card the left. */
  Object.freeze({ id: 'chat', label: 'Chat', key: 'enter', group: 'social', glyph: 'uiChat', width: 400, height: 280, home: 'bl', resizable: true, object: 'plain', besideCoach: true,
    startsOpen: 'chatOpen', typing: true }),
  /* The social side (2026-10-18): friends, and a read-only look at another player's worn gear
     (opened from the player menu, so it takes no launcher icon). */
  Object.freeze({ id: 'friends', label: 'Friends', key: 'n', group: 'social', glyph: 'navProfile', width: 380, object: 'ledger' }),
  /* Leaderboards (lane/b-leaderboards, 2026-10-31; named by Tyler 2026-11-01): Havora's heroes in order, one board at a
     time, every place and number the server's (src/data/honor-roll.js names the boards). */
  Object.freeze({ id: 'honor', label: 'Leaderboards', key: 'z', group: 'social', glyph: 'uiTrophy', width: 440, object: 'book' }),
  Object.freeze({ id: 'inspect', label: 'Inspect', key: 'i', glyph: 'navCharacter', width: 340, object: 'doll', launcher: false }),
  /* THE BOOK (the wiki, work ledger item 9, Tyler: public formulas; and the Chronicle, Tyler 2026-11-16 "Yeah build the chronicle"): the story
     so far as this hero has lived it, then skills, grounds and formulas generated from the data rows and the engine's own functions
     (src/shell/wiki-model.js), so it can never disagree with a hunt. Every letter is taken, so its key is the slash. The bar's groups made room
     for its icon; Settings, Help opens it too (src/data/settings.js). The Chronicle is its first tab (src/shell/windows/wiki.js). */
  Object.freeze({ id: 'wiki', label: 'Book', key: '/', glyph: 'uiBook', width: 620, object: 'book', help: 'windows.help_wiki' }),
  Object.freeze({ id: 'settings', label: 'Settings', key: 'escape', group: 'menu', glyph: 'uiSettings', width: 540, object: 'plain', escape: true }),
  /* A player's problem report, straight to the team through the bug-report bridge (also in Settings, Help: a phone's way in). */
  Object.freeze({ id: 'report', label: 'Report a problem', key: 'f', group: 'menu', glyph: 'uiWarn', width: 420, object: 'plain' }),
  /* One monster's facts, a page of the encyclopedia (Tyler 2026-11-09: every monster's stats are visible). A creature on a hunt's page opens it
     (src/shell/goto.js), so it has no icon and no key. It opens at the bottom-left, beside the Hunts window it was opened from: docked, it would close it. */
  Object.freeze({ id: 'monster', label: 'Monster facts', key: null, noShortcut: true, launcher: false, glyph: 'uiBook', width: 420, height: 560, home: 'bl', object: 'book',
    pageOf: Object.freeze(['hunts']) }),
  /* The owner's tools (2027-03-13-gm-tools.sql). No key: nobody else's keyboard reaches an empty window; the icon is the way in. */
  Object.freeze({ id: 'game-master', label: 'Game Master', key: null, group: 'menu', gm: true, glyph: 'uiTarget', width: 520, object: 'ledger' }),
]);
