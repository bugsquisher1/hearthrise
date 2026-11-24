// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tutorial.js — THE FIRST HOURS, ONE CARD AT A TIME (week plan item 17; tutorial polish 2026-10-25)
//
// Tyler 2026-10-25 ("holy shit i didn't realize this tutorial was so bad"): the tutorial teaches the action bar
// DURING combat (spells and their runes, food and drink, conditions, slot order, Fight settings, setups), styles and
// roles, playing more than one hero, and the whole loop (selling and keeping loot, supplies, gear, gold, cooking, the
// farm, Tamsin, dying and Blessings). The curriculum is the designer's (PRIORITY_BOARD "Tutorial polish walkthrough
// (2026-10-25)", stages A-F, played on live): go -> fight -> plant -> the bar (spells need runes, eat on time, order
// matters) -> cash in -> sell or keep -> cook -> styles -> bless before the wolves -> Tamsin -> the Thicket -> paid ->
// keep this bar; reactive cards explain what just happened (you ate, you drank, you died, stamina is low, more heroes),
// and day-one cards each start on their own fact (juice, home, own runes, Blessings that cost gold).
//
// EVERY CARD IS FINISHED BY SOMETHING THE SERVER SAYS (CLAUDE.md §6): the bar the server shows and the bar it stored,
// its struck state, the bag and the hunt bag, the loot rules, the Blessings held, the death log, the hunt analyzer's
// supplies, the saved setups, the worn set, the land, the house, Tamsin's tally, the party. A "Got it" card finishes on
// a press the shell records in the residue (`coach.read`, display state like the death popup's seen mark); a reactive
// card the player only needs to read is marked read by the shell once it has been on screen long enough. Until the
// shell can record a read (`facts.read` absent), a card that finishes on one is passed by, never a wall.
//
// ROW SHAPE
//   { id, title, text, anchor, done, when?, ring?, hooks?, inWindow?, party?, reactive?, knowledge?, gotIt? }
//     anchor     the surface the card points at (TUTORIAL_ANCHORS); the shell rings the real control there
//                (src/shell/launcher.js ringPlan) and, when the anchor is a window, shows the card inside it
//     ring       what on that surface: { item } the bar slot holding it, { crop } the seed to plant,
//                { skill, work } the skill and its recipe, { task } Tamsin's task
//     hooks      the ring hooks the card's way needs that the client does not carry yet (lane 2 adds them); the
//                card shows without them. Tokens: {store} (the store rune B5 names), {slot} (the card's bar slot),
//                {other} (another hero's strip slot), {fuel} (the fuel stack the Hearth card names), {spell} (the rune spell "A spell costs runes" offers),
//                {shot} (the ammo stack "Nothing to shoot" names)
//     inWindow   the words once the card shows INSIDE its window (it no longer says "open X")
//     when       the facts the card needs to be on the hero's way (all of them); unmet = passed by
//     party      a PARTY card, met only by a hero in a party of 2+ whose Level opens its hunt
//     reactive   a card on its own fact, outside the chain: it is not capped by the guide's Level and the
//                never-backward walk ranks it beside the chain. Placed right after the first-minute cards it
//                interrupts the chain while its `when` holds; placed after the chain it waits for the chain
//     dayOne     a reactive first-day goal (juice, a house, own runes): capped at the solo chain's top Level like
//                the chain, so it never nags a hero the first day is behind
//     knowledge  a lesson a second hero is not asked again (another hero on the account past KNOWN_LEVEL)
//     gotIt      the card finishes on its Got it press (`read`); without it a `read` card is read on sight
//     holdOpen   under the hunt bar it keeps its words: never folds to a bare title (the title alone says nothing: "Cash in")
//     text       may name a bar slot as {slot:<item id>}: cardFor() writes the server's slot there; a card with
//                a word builder (SAY) is stated from the facts, and one that cannot be stated truly is passed by
//     done       a fact kind (FACTS), or { kind: 'any', of: [...] }
//
// FACTS (src/session/tutorial-sections.js tutorialFactsOf; a field the server has not sent is null or absent):
//   levelXp, charLevel, skillLevel, benchLevel (the best bench skill's level), skillXp { skill: xp }, huntId (the open hunt), visited (Set of hunts the
//   server has seen this hero in), unitKinds, inParty, partied (a party personal best on any ground), self (slot),
//   name, slots (the bar the server SHOWS: [{ type, id, store, conditions, enabled, usable, count } | null]),
//   stored (the bar it STORED: [{ type, id, conditions } | null]), discipline, role, stance, store (the server's
//   store rows), carried { item: n } (the hunt bag in a hunt, else the bag), bag { item: n }, stacks, bagCap,
//   bankStacks, lootRules { item: deposit|sell|ignore }, weapon (worn), armoured (wears armor or a shield), armourWorn [slot] (the armor slots wearing a
//   piece with an armor weight), lastHunt (the latest hunt, open or ended), tierTaken (a harder tier picked, running or last hunted), blessings { held, of, freeUntil, prices },
//   endReason (the latest hunt's, once ended), freeDeath (that hunt's mode takes nothing for a death: the Tower), towerBest (the Burning
//   Tower's best floor while the server sends its section, else null), death { xp, saved } (the newest death_log row), supplies [{ item,
//   source, count }] (this hunt's analyzer), huntMs, hpMax, presets (saved setups), landPlanted, land { ready, empty },
//   home { owned, next }, gold, staminaMs, tally { held, paid, weight, tasks { task: { kills, target, done } }, paidTasks [task] }, sessionId (the open hunt's), and from the SHELL (the lane 1 / lane 2
//   interface, src/session/tutorial-sections.js pointerCardOf's second argument): read (Set of read card ids), hid (Set of the
//   cards a server fact finishes that the player hid with Got it: passed by, see WHICH CARD IS UP),
//   roster [{ slot, level, name, open, hunting }], slotsOwned, playLimit, sellable (stacks Sell all loot sells
//   now), upgrades ([item] Equip upgrades would put on), back (the hunt the player came back to after an absence), slotCost (the next hero slot's price).
//
// No number is restated here: floors are read from hunts.js, pockets from hunt-grounds.js, the turnip's hours from
// gathering.js, Tamsin's task from tally-tasks.js, prices from the server's store rows, Blessings from the server's
// section, the stances from rule-subjects.js. validate() proves every name a card uses is real; the walk-through
// (every step doable from the steps before it plus the start kit, the bar cards against the real default bar) is
// tests/hunt-core/sewer.mjs `tutorial-walk-through`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { WEIGHT_FOR_ROLE } from './hunt-roles.js';
import { HUNT_INDEX } from './hunts.js';
import { HUNT_GROUNDS, OPEN_GROUNDS } from './hunt-grounds.js';
import { tiersOf } from './hunt-tiers.js';
import { partyBestLine } from './party-class-xp.js';
import { PARTY } from './party.js';
import { END_ORDER, STAMINA_LOW_MIN } from './hunt-sessions.js';
import { nextUnlock } from './skill-unlocks.js';
import { SKILLS_DEF } from './skills.js';
import { CROPS, TREES, ROCKS, FISH_SPOTS } from './gathering.js';
import { tallyTask } from './tally-tasks.js';
import { ITEMS } from './items.js';
import { BASIC_INDEX } from './supply-basics.js';
import { LEVEL_REQ } from './gear-tiers.js';
import { roleWeaponOf, WEAPON_ROLES, SHIELD_ARM, shootsItem } from './hunt-roles.js';
import { isShield } from './shields.js';
import { deriveProfile } from '../core/member.js';
import { ABILITIES, abilitySkill, partyOnly } from './abilities.js';
import { skillLevelFromXp } from '../core/xp.js';
import { CONSUMABLES } from './consumables.js';
import { RUNE_FAMILIES } from './runes.js';
import { ARTISAN_RECIPES } from './recipes.js';
import { ROLE_DEFAULTS, ACTION_SET_LIMITS } from './rule-subjects.js';
import { START_EQUIPMENT, START_BAR } from './start-kit.js';
import { HEARTH_FUELS } from './hearth.js';
import { RECRUITS } from './recruits.js';
import { DANGER_GROUNDS, DEPTHS } from './danger.js';
import { BAR_TEXT } from './text/bar.js';
import { t } from './player-text.js';

/* The surfaces a card may point at: `window` the shell window (src/data/shell-windows.js) its controls live in (the
   card shows INSIDE it while it is open), `icon` its way starts at that window's icon, and what the coach rings
   (src/shell/launcher.js ringPlan). */
const anchor = (about, window, icon, tab) => Object.freeze({ about, window: window || null, icon: !!icon, tab: tab || null });
export const TUTORIAL_ANCHORS = Object.freeze({
  hunt_picker: anchor('Hunts (src/shell/windows/hunts.js), its icon, then the ground\'s line, then Enter', 'hunts', true),
  world: anchor('the world pane (src/app/world-pane.js), nothing to ring'),
  hud_vitals: anchor('the bottom bar\'s Level, HP and stamina (action-bar.js), its hooks'),
  hunt_topbar: anchor('Leave hunt (HUNT_SCREEN_SPEC §1.4 hunt-topbar.js)'),
  action_bar: anchor('the bar slot the card names (src/shell/widgets/action-bar.js), then Configure action\'s Save, shown in town too', 'configure-action'),
  farm: anchor('the Farm (src/shell/windows/farm.js), its icon, an empty plot\'s Plant, then ring.crop\'s Plant', 'farm', true),
  crafting: anchor('Gathering and crafting (src/shell/windows/work.js), its icon, ring.skill, then ring.work\'s Start', 'skills-trade', true),
  tally: anchor('Tamsin\'s tally (src/shell/windows/tally.js), her icon, the armor weight, then ring.task\'s Take', 'tally', true),
  inventory: anchor('the bag (src/shell/windows/inventory), its icon, then the control the card names', 'inventory', true),
  shop: anchor('the Shop (src/shell/windows/shop.js), its icon, the Sell tab, then Sell all junk', 'shop', true),
  /* Services is the Shop's third tab (Tyler 2026-10-25), the Shop's icon, its Services tab, then the next Bless */
  services: anchor('the Shop\'s Services tab (src/shell/windows/services.js), the Shop\'s icon, the Services tab, then the control', 'shop', true, 'services'),
  storage: anchor('Storage (src/shell/windows/storage.js), its icon', 'storage', true),
  market: anchor('the Weighhouse (src/shell/windows/market), its icon', 'market', true),
  honor: anchor('Leaderboards (src/shell/windows/honor.js), its icon', 'honor', true),
  /* the Town menu's Burning Tower line (src/data/shell-windows.js `tower`, group town), then Enter */
  tower: anchor('the Burning Tower (src/shell/windows/tower.js), the Town menu\'s line, then Enter', 'tower', true),
  settings: anchor('Settings (src/shell/windows/settings.js), its icon, then the Help tab', 'settings', true),
  /* no icon of its own since the top bar's groups (2026-11-16): its way starts at the bar's setup press, a hook */
  hunt_prep: anchor('Hunt prep (src/shell/windows/hunt-prep.js), the bar\'s setup corner, then New setup', 'hunt-prep'),
  house: anchor('the House (src/shell/windows/house.js), its icon, then Buy', 'house', true),
  characters: anchor('the character strip\'s Character list (a phone: Heroes, then its sheet\'s), then Create hero on the characters screen', 'characters'),
  /* THE ROADS (lane/first-hour-rewrite): the Character window's Talents tab (shown only while the server sends the `talents` section), then Spend as suggested */
  talents: anchor('the Character window\'s Talents tab (src/shell/windows/character/talents.js), its icon, the Talents tab, then Spend as suggested', 'character', true, 'talents'),
  strip: anchor('the character strip (src/app/character-strip.js), another hero\'s tab'),
});

/** The window `card`'s controls live in (its card shows inside it while open), or null. */
export function coachWindow(card) {
  const a = card && TUTORIAL_ANCHORS[card.anchor];
  return a ? a.window : null;
}

/** The tab of that window `card`'s controls live on (the Shop's Services), or null. */
export function coachTab(card) {
  const a = card && TUTORIAL_ANCHORS[card.anchor];
  return a ? a.tab : null;
}

/** The window whose ICON the coach rings for `card` (its way starts there and the window is closed), or null. */
export function coachIcon(card, open) {
  const a = card && TUTORIAL_ANCHORS[card.anchor];
  return a && a.icon && !open(a.window) ? a.window : null;
}

const MORE = ['ring', 'when', 'hooks', 'inWindow', 'party', 'reactive', 'knowledge', 'gotIt', 'dayOne', 'holdOpen'];
const freeze = (v) => (Array.isArray(v) ? Object.freeze(v.map(freeze)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freeze(x)]))) : v);
const step = (id, title, text, anchor, done, more) => Object.freeze({ id, title, text, anchor, done: freeze(done),
  ...Object.fromEntries(MORE.filter((k) => more && more[k] !== undefined).map((k) => [k, freeze(more[k])])) });

/* The task Tamsin's card names: a solo task on the solo ground (tally-tasks.js). */
const WOLVES = tallyTask('thicket_gray_wolves');
/* The first place a new hero picks an armor weight: one sentence a weight (Tyler 2026-10-25, src/data/armour-weights.js). */
const TAMSIN_WAY = t('coach.tamsins_task', { count: WOLVES.count, label: WOLVES.label });
/* Her wolves' card while the count runs, and what it says once her row counts them done (SAY.tamsin_pays). */
const WOLVES_WAIT = t('coach.tamsin_pays', { count: WOLVES.count, label: WOLVES.label, gold: WOLVES.gold });
const CELLAR = 'mill_cellar', THICKET = 'meadowbrook_thicket';
/* TAMSIN FIRST (designer 2026-11-10, the first ten minutes, played: the quit minute was 9, with nothing asked for five minutes and only junk in the bag).
   Her Cellar task is taken before the first hunt, counts inside it, and pays a helmet the hero wears at once. Its count and label are her row's. */
const RATS = tallyTask('cellar_giant_rats');
/* The party's first task, on the party's first ground (the Rat King in the Sewer): what a company of recruits is offered in place of the wolves. */
const KING = tallyTask('sewer_rat_king');
const RATS_WORDS = Object.freeze({ label: RATS.label, count: RATS.count, ground: HUNT_INDEX[CELLAR].name, level: HUNT_INDEX[THICKET].band[0], next: HUNT_INDEX[THICKET].name });
/* The first hour's lessons are for a hero under the Thicket's floor. */
const UNDER_THICKET = { kind: 'level_at', at: 1, below: HUNT_INDEX[THICKET].band[0] };
/* "Out to the brook" as a hero who never took her rats reads it (played 2026-11-10: Level 5 at 15 min 45 s of one unbroken first hunt). */
const BROOK = t('coach.brook', RATS_WORDS);
/* A second hero skips the knowledge cards once another hero on the account is past this Level (the designer's rule:
   it has lived through the first hour; the cards that set THIS hero's own state still show). */
export const KNOWN_LEVEL = 5;
/* "Taking a beating?" comes once the hero has eaten this many times in one hunt, at this many meals an hour or more: a
   count alone called 35 meals in 8.5 h a beating (panel 2026-11-01, about 4 an hour at full health). Measured: a practice-set
   tank eats 35-50 an hour at the Thicket's floor, 170-250 in the Glade under its floor, and 0-5 in armor in band. */
const BEATING_EATS = 3;
const BEATING_PER_HOUR = 30;
/* THE FOOD LESSONS WAIT FOR A HERO WHO IS SPENDING FOOD (designer 2026-11-15, the playthrough audit's F5 and F4; PRIORITY_BOARD "2026-11-15 The
   audit's balance findings"). "Eat on time" came after three meals in a hunt, however long the hunt: the audit's hero ate 8 in two hours of the
   Thicket and 0 of 216 in ten hours of Wickstead, and was walked through two windows to save 4 HP a bite. Measured on the real settle
   (tools/balance-sim/audit-table.mjs food, the start bar, 2 x 1 h a row): on Normal a hero in its Level's gear eats 0 to 0.5 times an hour from
   Level 1 to 15 and one in the practice kit 0 to 6.5 on Wickstead; the heroes food matters to eat 20 to 96 an hour (Dangerous in gear from Level 5)
   and 11 to 31 (the Thicket at 5 to 8 with no armor). The line sits between: this many meals in the hunt, at this many an hour or more. */
const FOOD_LESSON_EATS = 6;
const FOOD_LESSON_PER_HOUR = 12;
const SPENDING_FOOD = Object.freeze({ kind: 'eating_fast', n: FOOD_LESSON_EATS, perHour: FOOD_LESSON_PER_HOUR });
/* The bag counts as nearly full at this share of its stacks (the designer's 80 of 100). */
const BAG_NEAR_FULL = 0.8;
/* "Drink your own juice" waits for a hunt that has bought this many of the store's drinks (designer 2026-10-31,
   lane/b-core-loop-20h, played: a sword hero carrying Turnip Juice drank ONE store juice in twelve hours, and the card
   sat over the town's What next line for two days; a Mage buys about 35 an hour, 10 is under twenty minutes of hers). */
const JUICE_BOUGHT = 10;
/* The Level the house and own-rune cards wait for (the designer's day-one plan: past the Thicket's first half hour).
   8 -> 7 (designer 2026-10-28, lane/b-first-hour): on the 10-25 curve Level 8 is about two hours in, so the day-one goals
   sat unseen through a first evening; Level 7 is about 40 minutes, the Thicket's first half hour. */
const DAY_ONE_LEVEL = 7;
/* The fuel a hero carries before the Hearth card asks it to burn some: the Cellar's quarter hour leaves about a dozen
   (9 Bones and 3 Lamp Jelly a fresh kit hero, forest-cave --play), the Thicket about 160 Bones an hour. */
const FUEL_CARD_AT = 10;
/* The everyday fuels a hero at Inner Flame 1 can burn (hearth.js HEARTH_FUELS: Bones and the family fuels). */
const FIRST_FUELS = Object.freeze(HEARTH_FUELS.filter((x) => x.req <= 1).map((x) => x.item));
/* The first-hour rung and the pelts its stitch takes (slot-ladders.js), read from the rows, never restated. */
const CLOAK = ITEMS.graypelt_cloak;
const CLOAK_PELTS = ((ARTISAN_RECIPES.crafting || []).find((r) => r.output === 'graypelt_cloak') || { inputs: {} }).inputs.wolf_pelt;
/* The club hero's first bench job (style-gear.js, Tyler 2026-11-03), read from its row. */
const CLUB_REFORGE = (ARTISAN_RECIPES.smithing || []).find((r) => r.output === 'klappas_club');
/* Eat on time: Configure action's − and + move an HP condition in 5% steps (configure-action.js nudge), and the card
   never asks a hero to eat below the designer's 50%. */
const PCT_STEP = 5, EAT_FLOOR_PCT = 50;
const IN_TOWN = { kind: 'in_town' }, HUNTING = { kind: 'hunting' };
/* WHAT THE FIRST TWO HUNTS DON'T NEED WAITS (panel 2026-11-01: eighteen cards before the second hunt, boredom peaking at "Decide
   once"): the Thicket is where a hero has time to read, and the second return is when a bag has something to decide about. */
const THICKET_BEHIND = { kind: 'been', hunt: THICKET };
/* WHAT TO WANT, ONCE EACH (the same ruling): the Weighhouse when it opens (hr_market_config's default: the window says the live Level, and
   sewer.mjs pins this to its migration), the Roll of Honor from the first Level the gear runs thin (none from 18 to 30). It opens on either
   route the server takes (hr_market_eligible, 2027-03-03-market-bench-gate.sql): the Level, or a bench skill (skills.js `artisan`) at its own level. */
export const WEIGHHOUSE_LEVEL = 10;
export const WEIGHHOUSE_BENCH = 30;
export const ROLL_LEVEL = 16;
const PULL_LEVEL = 10;
/* THE BURNING TOWER, once (the design's walk-through, origin/lane/d-burning-tower §9 steps 2-6: a hero hunts to Level 10, about 6 hours, then
   climbs; a Level 10 hero alone holds floor 15 to 20 and takes the floor-10 Bronze Key). Only while the server sends the Tower's section. */
export const TOWER_LEVEL = 10;
/* THE FIRST DANGEROUS RUN (lane/a-next-steps; board "2026-11-15 The audit's balance findings" F5, measured on the real settle): on Normal a hero
   in its Level's gear eats 0 to 0.5 meals an hour from Level 1 to 15, so food has no stakes; Dangerous at the Thicket and Wickstead from Level 5 costs real
   food (a tank at 8 in its gear: 74.5 meals an hour) and gives more XP, while the practice kit with no armor dies there (22 and 24 deaths in 2 h at 5).
   So one card offers it at about Level 8, to a hero the server shows in armor on its head and body (DANGER_KIT: the helm-and-body kit Tyler's
   11-02 test holds a ground's floor to), and never again once read or taken. */
const DANGER_LEVEL = 8;
export const DANGER_KIT = Object.freeze(['helmet', 'body']);
const DANGER_TIER = 'dangerous';
/** The card's id: the Hunts window records a harder tier's pick as its read (hunts.js saveTier). */
export const FIRST_DANGEROUS = 'first_dangerous';
/* A hero past the guide's last ground has found them. */
const WANT_BELOW = HUNT_INDEX.millrace_sewer.band[1] + 1;
/* THE CARDS THAT SAY "JUST NOW" stand aside in a hunt the player has just come back to: they speak of what nobody watched. */
const FRESH = { kind: 'fresh_hunt' };
const READ = { kind: 'read' };
/* A CARD THAT ASKS NEVER WALLS (first-hour play 2026-10-31: a hero who only watched sat on "Plant your land" at Level 5 and
   would have until 15, with Cash in and the Thicket behind it; QA's Pellow, "Order matters", the same). A card that asks for
   a press finishes on it, or on its Got it. */
const orGotIt = (fact) => ({ kind: 'any', asks: true, of: [READ, fact] });
/* THE FIRST HUNT'S BAR AND FARM LESSONS STAND ASIDE AT THE THICKET'S FLOOR, so Cash in always gets through, and come back
   in the Thicket if they were not done: Tyler's ruling is that the bar is taught during combat, and a hero back from a
   first night away has the whole lesson still to come. */
const LESSON = { kind: 'lesson_time', hunt: THICKET };
/* The Shop's Services tab and its next Bless (the shell rings the deepest one on screen first) */
const SERVICES_TAB = '[data-hs-win="shop"] .hw-tab[data-tab="services"]';
/* ...after the hunt summary's Back in town Bless row, the shallowest doorway (ringPlan rings the deepest on screen first: the Shop's own controls
   when the Shop is open, else the summary's row while that card shows, else the Shop's icon) */
const TO_BLESS = ['[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="bless"]', SERVICES_TAB, '[data-hs-win="shop"] [data-hs-act="bless"]:not([disabled])'];

export const HUNT_TUTORIAL = Object.freeze([
  /* ── THE WEAPON IS THE STYLE, ONCE HOME FROM THE FIRST HUNT (designer 2026-11-12, first-30 play: before any hunt it sent a new
     hero into the bag instead of to the Cellar; the kit's sword needs nothing loaded, and load_shot still catches a bow). ── */
  step('styles', 'Weapon sets the style',
    'Equip another weapon in town to switch style',
    'inventory', { kind: 'any', of: [READ, { kind: 'weapon_changed' }] },
    { knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'kills', atLeast: 1 }], hooks: ['[data-hs-win="inventory"] .hw-slot[data-slot="weapon"]'] }),
  /* ── A. Before the first pull ───────────────────────────────────────── */
  /* Before the first hunt only: a hero who has hunted meets her at the Thicket's card (tamsins_task), as before. */
  step('tamsins_rats', t('coach.tamsins_rats_title'), t('coach.tamsins_rats', RATS_WORDS),
    'tally', orGotIt({ kind: 'tally_taken', task: RATS.id }), { gotIt: true, when: [IN_TOWN, { kind: 'unhunted' }], ring: { task: RATS.id },
      inWindow: t('coach.tamsins_rats_in', RATS_WORDS) }),
  step('to_the_cellar', 'Rats in the mill',
    'Hunts → Mill Cellar → Enter',
    'hunt_picker', { kind: 'enter', hunt: CELLAR },
    /* "Press the Mill Cellar, then Enter": on a phone the sheet opens on the list, so the first press is the row
       (playtest 2026-10-29: the card said Enter while the ring sat on the row) */
    { inWindow: 'Press the Mill Cellar, then Enter' }),
  /* ── A BOW WITH NOTHING LOADED (first-hour play 2026-10-31: the kit's bow shot nothing for 7 minutes and no card said
     why, since the first kill's card waits for a kill that never comes). Equip loads a shot now (bag-model.js equipOps);
     these catch a hero who took it off or came by another door. First, so they stand before that wait. ── */
  step('load_shot', 'Nothing to shoot',
    'Put arrows on your bar from the bag',
    'inventory', { kind: 'shot_ready' }, { when: [IN_TOWN, { kind: 'no_shot' }],
      hooks: ['[data-hs-win="inventory"] .hw-pocket[data-item="{shot}"]', '[data-hs-win="inventory"] .hw-pick[data-item="{shot}"] [data-hs-act="primary"]'] }),
  step('load_shot_hunt', 'Nothing to shoot',
    'Leave the hunt, then load arrows from the bag',
    'hunt_topbar', { kind: 'shot_ready' }, { when: [HUNTING, { kind: 'no_shot' }] }),
  /* ── B. The first hunt: the cards the server finishes on its own come first (AUTO_KINDS) ── */
  step('first_kill', 'Fights on its own',
    'Let your hero pick and fight each monster',
    'world', { kind: 'kills', atLeast: 1 }, { knowledge: true }),
  /* Shown from the first kill until Level 2 lands, so it never names the Level (playtest 2026-10-29: "Level 2" sat
     over a bar that read Lv 1). */
  step('first_level', 'Level up',
    'Kill monsters to fill the ring around your Level',
    'hud_vitals', { kind: 'level' }, { knowledge: true, holdOpen: true, hooks: ['[data-coach-hook="level"]'] }),
  /* THE COUNT IS DONE: ahead of every lesson of the first hunt, so a hero who pressed nothing still hears it. The hunt bar's Leave is ringed. */
  step('tamsin_owes', t('coach.tamsin_owes_title'), t('coach.tamsin_owes', RATS_WORDS),
    'hunt_topbar', IN_TOWN, { holdOpen: true, when: [HUNTING, UNDER_THICKET, { kind: 'tally_counted', task: RATS.id }] }),
  /* ── Reactive cards that interrupt the chain (after the first-minute cards, so the shell's "passed" rule never
     replays one of those). Each starts on its own fact and explains what just happened. ── */
  /* A TALENT POINT (the Roads, 17 section 13: a point from Level 2; lane/first-hour-rewrite): first among the reactive cards, so a hero meets it
     in the first hunt at Level 2. One press spends every point along the suggested road. Passed by while the switch is off (no `talents`
     section). Got it hides it: the Talents tab keeps the count, and a standing "Spend as suggested" rule is owed (20 section 3.3). */
  step('talent_point', t('coach.talent_point_title'), t('coach.talent_point'),
    'talents', orGotIt({ kind: 'talents_spent' }), { reactive: true, gotIt: true, when: [{ kind: 'level_at', at: 2 }, { kind: 'talents_left' }],
      inWindow: t('coach.talent_point_in'),
      hooks: ['[data-hs-win="character"] .hw-tab[data-tab="talents"]', '[data-hs-win="character"] [data-hs-act="tl-suggested"]:not([disabled])'] }),
  /* THE DANGER SCALE, ONCE (02 package 3; 12-targets 2.6: the player sees only "Depth N of 20"): the first hunt on a ground the scale opens on */
  step('depth', 'Depth', t('coach.depth'),
    'hud_vitals', READ, { reactive: true, knowledge: true, gotIt: true, when: [HUNTING, { kind: 'on_scale' }] }),
  /* THE FIRST FALL BACK, EXPLAINED (20 section 3.1: "nothing explained the edge before"): the newest hunt's report holds one and no death */
  step('fell_back', t('coach.fell_back_title'), t('coach.fell_back'),
    'hud_vitals', READ, { reactive: true, knowledge: true, gotIt: true, when: [{ kind: 'fell_back' }] }),
  step('stamina_low', 'Stamina low',
    t('coach.stamina_low'),
    'hud_vitals', READ, { reactive: true, when: [HUNTING, { kind: 'stamina_low' }], hooks: ['[data-coach-hook="stamina-buy"]'] }),
  step('first_death', 'Defeated',
    'Shop → Services → Bless',
    'services', { kind: 'blessed' }, { reactive: true, when: [IN_TOWN, { kind: 'died' }, { kind: 'below_free' }],
      inWindow: 'Press Bless', hooks: TO_BLESS }),
  step('first_eat', 'Food eaten',
    'Cook more food to save gold',
    'action_bar', READ, { reactive: true, when: [HUNTING, FRESH, { kind: 'ate' }] }),
  step('first_drink', 'Drink used',
    'Brew your own drinks to save gold',
    'action_bar', READ, { reactive: true, when: [HUNTING, FRESH, { kind: 'drank' }] }),
  /* Tyler 2026-10-25: the stance, chase and distance sit ON the bar's right side, never behind the sliders popup. */
  step('fight_settings', 'Taking a beating?',
    'Set the stance on your bar to Defensive',
    'hud_vitals', { kind: 'any', of: [READ, { kind: 'stance_changed' }] },
    /* off the scale only: on it the party falls back by itself and the Risk is the answer (fell_back, risk_pick) */
    { reactive: true, knowledge: true, gotIt: true, when: [HUNTING, FRESH, { kind: 'off_scale' }, { kind: 'eating_fast', n: BEATING_EATS, perHour: BEATING_PER_HOUR }], hooks: ['[data-coach-hook="stance"]'] }),
  /* THE RECRUITS (Tyler RD-Q6 a, 2026-11-22; 1053-recruits.sql): one hero first; when the server says its recruit press is ready (Level 5, the
     `recruits` section), this card points at it: All characters, then its one press. Done when the account holds a second hero. */
  step('more_heroes', 'Your recruits are ready',
    t('coach.more_heroes', { count: RECRUITS.count }),
    /* A card that asks never walls: played 2026-11-01, a hero who wants one hero sat on this card in every hunt past 5 minutes, ahead of the Thicket's lessons. */
    'characters', orGotIt({ kind: 'heroes', atLeast: 2 }),
    { reactive: true, knowledge: true, gotIt: true, when: [{ kind: 'recruits_ready' }],
      /* the strip's All characters (a phone's strip calls it Heroes, UI-10), then in that window its one press */
      hooks: ['.char-tool.is-all', '[data-hs-act="recruit-go"]'] }),
  /* Gated on THIS hero's Level (the server's level_xp), not only on the account having a second hero in town: a
     reactive card here interrupts the chain, so a Level 2 hero beside an older one was asked to party before its own
     Cellar steps (played on live 10-28, Pellow beside Corliss). Past the Cellar stretch it fits. */
  /* A card that asks never walls (optimizer panel 11-03: "Next: Hunt together" for two days over a woodcutting alt, and nothing behind it was reached). */
  /* Every hero in one party (played 2026-11-23: done on the first invite, it left two recruits standing in town): it stays, naming the next
     hero outside the party, until none is left, or its Got it. */
  step('party_own', 'Hunt together',
    'Right-click a hero\'s tab → Invite to party',
    'strip', { kind: 'any', asks: true, of: [READ, { kind: 'party_gathered' }, { kind: 'party_hunted' }] }, { reactive: true, gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: HUNT_INDEX[THICKET].band[0] }, { kind: 'own_hero_out' }],
      hooks: ['.char-tab[data-slot="{other}"]'] }),
  /* THE RISK PICK, AT THE FIRST PARTY GROUND ON THE SCALE (20 sections 1.2 and 3.1; the Hunts window's Risk row, company-pane.js). Steady is set
     with no press, so the card says so and names the one stance that can die. Passed by until a ground at the recruits' Level is on the scale. */
  step('risk_pick', t('coach.risk_pick_title'), 'Hunts → Risk',
    'hunt_picker', orGotIt({ kind: 'risk_set' }), { reactive: true, knowledge: true, gotIt: true,
      when: [IN_TOWN, { kind: 'level_at', at: RECRUITS.atLevel }, { kind: 'scale_ground' }],
      hooks: ['[data-hs-win="hunts"] [data-hs-act="stance"][data-risk="steady"]'] }),
  step('equip_upgrades', 'Better gear found',
    'Bag → Equip upgrades',
    'inventory', { kind: 'upgrades_none' }, { reactive: true, when: [IN_TOWN, { kind: 'upgrades' }],
      inWindow: 'Press Equip upgrades',
      /* the hunt summary's Back in town Equip row while that card shows (a card about the return rings its row, never the summary's gold press), then the bag's Equip upgrades */
      hooks: ['[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="equip"]', '[data-hs-win="inventory"] [data-hs-act="equip-upgrades"]'] }),
  step('storage', 'Bag nearly full',
    'Deposit stacks in Storage',
    'storage', { kind: 'any', of: [READ, { kind: 'stored_stack' }] }, { reactive: true, gotIt: true, when: [{ kind: 'bag_full' }] }),
  /* THE HEARTH, TAUGHT (designer 2026-10-28, lane/b-first-hour): Inner Flame was named only in a bracket of the Sell
     card, so no hero was ever asked to fuel the Hearth. In town with a stack of fuel and no Inner Flame XP yet, the
     card names the stack and rings it in the bag, then its Burn all. Finished by the server's Inner Flame XP. */
  step('fuel_hearth', 'Feed the Hearth',
    'Bag → Bones → Burn all',
    'inventory', { kind: 'skill_xp', skill: 'inner_flame' }, { reactive: true, when: [IN_TOWN, { kind: 'fuel_held', n: FUEL_CARD_AT }],
      inWindow: 'Press Bones, then Burn all',
      /* while the walk and the burn run (no XP yet) the ring rests: pressing Burn all again only says it is running */
      hooks: ['[data-hs-win="inventory"]:not(:has(.hw-burying.is-on)) .hw-pocket[data-item="{fuel}"]', '[data-hs-win="inventory"]:not(:has(.hw-burying.is-on)) .hw-pick[data-item="{fuel}"] [data-hs-act="primary"]'] }),
  /* DEFENSE THAT NEVER TRAINS (designer 2026-10-28): it rises only from blows taken in armor or behind a shield
     (Tyler 2026-10-18; core/vitals.js wearsArmour). The kit's Practice Shield trains it, but a hero who took up a staff,
     a bow, the hatchets or the club wears nothing that counts. In town with nothing worn that counts (its first-minute
     cards come before it, so never ahead of the first hunt), the card says so and names the Shop's piece every style
     can wear; wearing one finishes it. */
  step('no_defense', 'Defense isn\'t training',
    'Buy Leather Gloves in the Shop and wear them',
    'shop', { kind: 'any', of: [READ, { kind: 'armoured' }] },
    { reactive: true, gotIt: true, when: [IN_TOWN, THICKET_BEHIND, { kind: 'unarmoured' }],
      inWindow: 'Press Buy, then Leather Gloves', hooks: ['[data-hs-win="shop"] .hw-tab[data-tab="buy"]'] }),
  /* PLANT YOUR LAND, IN TOWN (audit 2026-11-18 A4: two minutes into the first hunt it said "Plant a Turnip Seed in each empty plot" with no word
     on where the land is, and the Farm lives in the Town menu). Back from the first hunt, before the hero goes back down, the card names the way
     there and rings it (the Town menu, then its Farm): the turnips grow while the hero hunts. Under the Thicket's floor, or back from it if not done. */
  step('plant_land', 'Plant your land',
    t('coach.plant_land'),
    'farm', orGotIt({ kind: 'planted', crop: 'turnip' }), { gotIt: true, when: [IN_TOWN, LESSON], ring: { crop: 'turnip' }, inWindow: t('coach.plant_land_in') }),
  /* PAID, AND BACK DOWN: after "Wear what you found" and the Hearth (reactive, above), and ahead of the hunt's own lessons, which wait for the hunt.
     The invitation to close the game, at the minute the designer would have quit. */
  step('back_down', t('coach.back_down_title', RATS_WORDS), t('coach.back_down', RATS_WORDS),
    'hunt_picker', { kind: 'in_hunt', hunt: CELLAR }, { when: [IN_TOWN, UNDER_THICKET, { kind: 'tally_paid_for', task: RATS.id }],
      inWindow: t('coach.back_down_in', RATS_WORDS) }),
  /* ── B. The first hunt, the bar while it fights ────────────────────── */
  step('bar_intro', 'Action bar',
    'Press a slot to change what it does',
    'action_bar', READ, { knowledge: true, gotIt: true, when: [LESSON] }),
  /* WHY IT WAITS (designer 2026-11-05, lane/d-caster-first-fights): a default bar no longer reaches "Spells need runes", so a caster
     would lose the lesson about what a cast costs and why a slot waits. It sits on a real slot, the one the bar marks (src/shell/slot-waits.js).
     A bar with no slot waiting on a count (a tank, a melee weapon) passes it by; a bow meets it on Flame Volley's slot since its default set
     casts it (2+ in its area; the balance audit's fix 7, 2026-11-19). */
  step('why_it_waits', 'Why it waits',
    'Press the waiting slot to change when it fires',
    'action_bar', READ, { knowledge: true, gotIt: true, when: [LESSON, { kind: 'slot_waits' }] }),
  /* A slot the hero picked Carried runes only for, with none left: no default bar reaches it (every default rune spell names its store rune). */
  step('spell_runes', 'Spells need runes',
    'Press the crossed-out spell and pick the store\'s rune',
    'action_bar', orGotIt({ kind: 'rune_ready' }), { gotIt: true, when: [LESSON, { kind: 'rune_struck' }], hooks: ['[data-hs-win="configure-action"] .ca-rs[data-store="{store}"]'] }),
  step('food_when', 'Eat on time',
    'Press the food slot and set its HP',
    'action_bar', orGotIt({ kind: 'food_cond' }), { gotIt: true, when: [SPENDING_FOOD, { kind: 'food_slot' }], hooks: ['[data-hs-win="configure-action"] .ca-cond[data-cond="0"] [data-x="dec"]'] }),
  /* Was "Order matters": the lesson is what it costs, not slot arithmetic (first-hour play 2026-10-31). */
  step('food_order', 'Own food first',
    'Move your own food ahead of store food',
    'action_bar', orGotIt({ kind: 'food_order' }), { gotIt: true, when: [LESSON, SPENDING_FOOD, { kind: 'food_order_bad' }], hooks: ['[data-hs-win="configure-action"] .ca-cond[data-cond="0"] [data-x="dec"]'] }),
  /* A SPELL IS A CHOICE (designer 2026-10-29, lane/a-starter-bars; 2026-11-05 for the bow and the axes): a melee hero's default bar
     holds no rune spell (Flame Strike and Rend each measured against the first grounds, rule-subjects.js; the bow's holds Flame Volley
     since the balance audit's fix 7, 2026-11-19, so a bow, like a caster, is offered nothing here), so the hero
     would meet neither "Spells need runes" nor "Make your own runes" (Tyler 2026-10-25: the tutorial teaches spells and their runes).
     Here a bar with no rune spell is offered one of its own style: what it adds, what each cast costs, and the store rune to
     pick, on the real controls. Adding it or Got it finishes it; a hero who adds it with no rune met "Spells need runes". */
  step('first_spell', 'Try a rune spell',
    'Press an empty slot, then Spells',
    'action_bar', { kind: 'any', of: [READ, { kind: 'rune_spell_on' }] }, { knowledge: true, gotIt: true, when: [HUNTING, THICKET_BEHIND, { kind: 'rune_spell_none' }],
      /* deepest first: the first on screen is ringed (launcher.js ringPlan), so the ring walks tab -> spell -> rune */
      hooks: ['[data-hs-win="configure-action"] .ca-rs[data-store="{store}"]', '[data-hs-win="configure-action"] .ca-row[data-id="{spell}"]',
        '[data-hs-win="configure-action"] .ca-tab[data-tab="spells"]'] }),
  /* THE HELP PAGE, POINTED AT (the panel: "the best thing you've written, buried behind a gear icon"). */
  step('help_page', 'Help',
    'Settings → Help',
    'settings', READ, { knowledge: true, gotIt: true, when: [HUNTING, THICKET_BEHIND], hooks: ['[data-hs-win="settings"] .st-tab[data-cat="help"]'] }),
  /* WHILE HER COUNT RUNS the wait has a goal, and "Out to the brook" keeps for the second trip (the designer's beat sheet). It also holds the
     chain: the cards after it speak of Level 5 and the Thicket. */
  step('rats_count', t('coach.rats_count_title'), t('coach.rats_count', RATS_WORDS),
    'world', { kind: 'tally_idle', task: RATS.id }, { when: [HUNTING, { kind: 'not_elsewhere', hunt: CELLAR }] }),
  step('earn_the_thicket', 'Out to the brook',
    /* The wait is the hook, so the card leads with it: you don't have to watch. Back from Tamsin's pay it is the invitation itself (SAY). */
    BROOK,
    'hud_vitals', { kind: 'unlock', hunt: THICKET }, { hooks: ['[data-coach-hook="stamina"]'] }),
  step('leave_cellar', 'Cash in',
    t('coach.leave_cellar'),
    'hunt_topbar', { kind: 'ended', reason: 'left' }, { holdOpen: true }),
  /* ── C. The first return: sell or keep, cook, styles, Blessings before danger, Tamsin ── */
  /* Blessings first on the way back: they are one press and the next ground is where a hero can die (the panel: "Before the
     wolves" came after the wolves). */
  /* ONLY WHERE A HERO CAN DIE (RD-Q3 a, Tyler 2026-11-22: Careful and Steady fall back before a death, only Bold dies; lane/first-hour-rewrite):
     a party on Steady never needs it, so the card waits for Bold or a death on record. */
  step('bless', t('coach.bless_title'),
    'Shop → Services → Bless',
    'services', orGotIt({ kind: 'blessed' }), { gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: HUNT_INDEX[THICKET].band[0] }, { kind: 'can_die' }, { kind: 'below_free' }],
      inWindow: 'Press Bless', hooks: TO_BLESS }),
  /* FINISHED BY THE SERVER, NEVER BY A READ (retention dive 2026-11-20: Got it on it meant never again, and junk comes back every hunt): a sale or the
     Thicket finishes it; Got it hides it for this visit only (src/shell/launcher.js visitOf), so it never walls and comes back on the next return. */
  step('sell_loot', 'Sell junk',
    'Shop → Sell all junk',
    'shop', { kind: 'any', of: [{ kind: 'loot_sold' }, { kind: 'been', hunt: THICKET }] },
    { when: [IN_TOWN, { kind: 'sellable' }], inWindow: 'Press Sell, then Sell all junk',
      /* the hunt summary's Back in town Sell row while that card shows (the card rings the row, never the summary's gold press), then the Shop's way */
      hooks: ['[data-hs-win="hunt-summary"] [data-hs-act="town"][data-step="sell"]',
        '[data-hs-win="shop"] .hw-tab[data-tab="sell"]', '[data-hs-win="shop"] [data-hs-act="sell-loot"]', '[data-hs-win="shop"] [data-coach-hook="sell-confirm"]'] }),
  /* One decision, not a form (panel 2026-11-01: a 14-dropdown list at hour one, "I don't know what I don't need yet"): after the
     Thicket the bag knows what piles up, and a plan once set is kept for every hunt after (the first principle). */
  step('loot_rules', 'Decide once',
    'Bag → This hunt → set one item to Sell',
    'inventory', { kind: 'any', asks: true, of: [READ, { kind: 'loot_rule' }] },
    { knowledge: true, gotIt: true, when: [IN_TOWN, THICKET_BEHIND], inWindow: 'Press This hunt, then set one item to Sell',
      hooks: ['[data-hs-win="inventory"] .hw-tab[data-tab="hunt"]', '[data-hs-win="inventory"] [data-rule-item][data-coin]'] }),
  step('cook_catch', 'Cook your catch',
    'Gathering and crafting → Cooking → Cook Shrimp',
    'crafting', orGotIt({ kind: 'skill_xp', skill: 'cooking' }), { gotIt: true, when: [IN_TOWN, THICKET_BEHIND], ring: { skill: 'cooking', work: 'cook_shrimp' },
      inWindow: 'Press Cooking, then Start on Cook Shrimp' }),
  /* A PARTY GOES BELOW BEFORE THE WOLVES (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5"): the Sewer opens at the Thicket's floor and a four there earns
     about 1.6x the same heroes alone in the Thicket, so a hero in a party at 5 meets this card where a hero alone meets Tamsin's wolves (a party card is never on a
     solo hero's way). Hunting the Sewer is past the Thicket on the road, so the wolves' cards behind it pass by. */
  step('go_below', 'Into the sewer, together',
    'Hunts → The Sewer → Enter with party',
    'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),
  step('tamsins_task', 'Tamsin\'s next task',
    TAMSIN_WAY,
    'tally', orGotIt({ kind: 'tally_taken', task: WOLVES.id }), { gotIt: true, when: [IN_TOWN], ring: { task: WOLVES.id } }),
  step('into_the_thicket', 'Into the Thicket',
    'Hunts → ' + HUNT_INDEX[THICKET].name + ' → Enter',
    'hunt_picker', { kind: 'enter', hunt: THICKET },
    { inWindow: 'Press Enter on ' + HUNT_INDEX[THICKET].name }),
  /* ── D / E. The second hunt and the second return ─────────────────── */
  /* Done when Tamsin pays, or once the hero hunts PAST the Thicket (#58, Andy: the wolves still held, out of the
     Sewer the card sent him back to the Thicket; the tally on screen still counts them and she still pays). */
  step('tamsin_pays', 'Paid in town', WOLVES_WAIT,
    'world', { kind: 'any', of: [{ kind: 'tally_paid', task: WOLVES.id }, { kind: 'been', hunt: WOLVES.hunt, past: true }] }, { when: [{ kind: 'not_elsewhere', hunt: WOLVES.hunt }] }),
  step('save_setup', 'Keep this bar',
    'Setup check mark on your bar → New setup → Save',
    'hunt_prep', { kind: 'setup_saved' }, { when: [IN_TOWN, { kind: 'bar_saved' }, { kind: 'been', hunt: THICKET }],
      inWindow: 'Press New setup, name it, then Save',
      hooks: ['[data-hs-act="setups"]', '[data-hs-win="hunt-prep"] [data-coach-hook="setup-save"]'] }),
  /* ── F. Day one: each waits for the chain, then starts on its own fact ── */
  step('harvest_juice', 'Turnips are ready',
    'Harvest on the Farm, then cook Turnip Juice',
    'farm', { kind: 'juice_made' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'turnips' }] }),
  step('juice_slot', 'Drink your own juice',
    'Put Turnip Juice in a slot before store juice',
    'action_bar', { kind: 'drink_slot', item: 'turnip_juice' }, { reactive: true, dayOne: true,
      when: [{ kind: 'carries', item: 'turnip_juice' }, { kind: 'bought_drinks', n: JUICE_BOUGHT }] }),
  /* KLAPPA'S KLUB (Tyler 2026-11-03; Andy's own idea, the first taste of the bench): a club hero's next rung is 10 Levels away and this one
     is two minutes of mining and smelting. Before Build your home, which holds the line until a house is owned. The bench spends the bag's
     club, so the hero's hands are empty when it is done: the card stays until the new club is worn, and then rings the bag (SAY). */
  step('klappas_club', 'Klappa\'s Klub',
    t('coach.club_make', { recipe: CLUB_REFORGE ? CLUB_REFORGE.name : 'Reforge Klappa\'s Klub' }),
    'crafting', orGotIt({ kind: 'wields', item: 'klappas_club' }), { reactive: true, dayOne: true, gotIt: true, ring: { skill: 'smithing', work: CLUB_REFORGE.id },
      when: [IN_TOWN, { kind: 'level_at', at: ITEMS.klappas_club.reqLv }, { kind: 'club_hand', item: 'practice_club', made: 'klappas_club' }],
      hooks: ['[data-hs-win="inventory"] .hw-pocket[data-item="klappas_club"]', '[data-hs-win="inventory"] .hw-pick[data-item="klappas_club"] [data-hs-act="primary"]'] }),
  /* GOLD WITH NOWHERE TO GO (designer's 10-31 pass ruled it a FIX; blind panel 11-03, hour 11, 15k banked: "nothing says what's next"): What next carries it in a line, but What next only
     speaks with every window shut and no card up, and a return lands on the Hunt summary. So once the purse is a real start on the next hero, one card names what exists at the server's
     prices; the summary's Next opens the House. Read once: the What next line keeps saying it. After Klappa's Klub, one card at a time: the club has a job in it and a Level on it, and the gold
     keeps. */
  step('purse_goal', 'Spend your gold',
    t('coach.purse_goal'),
    'house', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'purse_saving_hero' }] }),
  /* THE DAY-ONE TOWN CARDS WAIT FOR THE FIRST STAMINA END (plan L08, retention R3: a lone hero sent to the rocks at Level 7 left the hunt,
     and the job never ended): they speak when the latest hunt ended on stamina, when a town job costs the hunt nothing, and the home card
     sets the job's count (SAY.home: the material still short, then the hero waits in town). */
  step('home', 'Build your home',
    'Gather logs and ore for your first house',
    'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'stamina_ended' }, { kind: 'home_unowned' }] }),
  step('own_runes', 'Make your own runes',
    'Mine Rune Essence, then bind runes in Runecrafting',
    'crafting', { kind: 'rune_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'stamina_ended' }, { kind: 'rune_unowned' }] }),
  /* The first-hour rung (slot-ladders.js graypelt_cloak): at its Level with the pelts in the bag, the card rings the
     recipe. Finished by any Crafting XP (a fresh hero has none: the cloak is most heroes' first craft). */
  step('stitch_cloak', 'Stitch a cloak',
    'Gathering and crafting → Crafting → Stitch Graypelt Cloak',
    'crafting', { kind: 'skill_xp', skill: 'crafting' }, { reactive: true, dayOne: true, ring: { skill: 'crafting', work: 'stitch_graypelt_cloak' },
      when: [IN_TOWN, { kind: 'level_at', at: CLOAK.reqLv }, { kind: 'carries', item: 'wolf_pelt', n: CLOAK_PELTS }] }),
  step('bless_paid', 'Blessings cost gold now',
    'Shop → Services → Bless',
    'services', { kind: 'any', of: [{ kind: 'blessed' }, READ] }, { reactive: true, gotIt: true, when: [IN_TOWN, { kind: 'can_die' }, { kind: 'at_free' }, { kind: 'unblessed' }],
      hooks: TO_BLESS }),
  step('weighhouse', 'The Weighhouse is open',
    'List items for other players to buy',
    'market', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'market_open', below: WANT_BELOW }] }),
  step('roll_of_honor', 'Leaderboards',
    'Press Leaderboards to see where you stand',
    'honor', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: ROLL_LEVEL, below: WANT_BELOW }] }),
  /* THE BURNING TOWER (QA gate 2026-11-17: it opened only by clicking the Hearth): once, at TOWER_LEVEL, while the server offers it. Finished by
     its Got it or by a floor on the hero's record (the server's best). */
  step('burning_tower', t('coach.tower_title'), t('coach.tower'),
    'tower', orGotIt({ kind: 'tower_climbed' }), { reactive: true, knowledge: true, gotIt: true,
      when: [IN_TOWN, { kind: 'level_at', at: TOWER_LEVEL }, { kind: 'tower_open' }] }),
  /* THE FIRST DANGEROUS RUN (DANGER_LEVEL above): finished by its Got it or by the hero taking it (the server's tier picks and hunts: tier_taken), and the
     Hunts window records the take as its read (hunts.js), so a hero who goes back to Normal is not offered it again. */
  step(FIRST_DANGEROUS, t('coach.first_dangerous_title'), t('coach.first_dangerous', { ground: HUNT_INDEX[THICKET].name }),
    'hunt_picker', orGotIt({ kind: 'tier_taken' }), { reactive: true, knowledge: true, gotIt: true,
      when: [IN_TOWN, { kind: 'level_at', at: DANGER_LEVEL, below: WANT_BELOW }, { kind: 'danger_kit' }] }),
  /* THE ONE DECISION OF LEVELS 10-30 (designer 2026-11-02, re-ruled with Tyler's harder monsters; a blind veteran found it by poking, +110% XP/h): it costs food now, and too big
     can kill, so it is named once with its price. The tier is that decision since 2026-11-04 (hunt-tiers.js). Once the offer above was read or taken, it is not said twice. */
  step('pull_goal', 'Harder tiers',
    'Pick Dangerous or Deadly for more XP and more risk',
    'hunt_picker', { kind: 'any', of: [READ, { kind: 'card_read', card: FIRST_DANGEROUS }, { kind: 'tier_taken' }] }, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: PULL_LEVEL, below: WANT_BELOW }] }),
]);

/* The kinds the SERVER finishes on its own (no press of the player's): the shell keeps such a card up long enough
   to read before the next one replaces it (src/shell/launcher.js heldCard). Only the first-minute cards: a card the
   shell held for its reading time would otherwise replay when a reactive card interrupts the chain. */
export const AUTO_KINDS = Object.freeze(['kills', 'level', 'pull']);
const SLOT_TOKEN = /\{slot:([a-z0-9_]+)\}/g;
const START_FOOD_PCT = (START_BAR.find((s) => s.id === 'd_food') || { conditions: [{ value: null }] }).conditions[0].value;

/* ── THE BAR, READ AS THE ENGINE READS IT ─────────────────────────────────
   A slot here is the facts' shape ({ type, id, store, conditions, enabled, usable, count }). */
const isFood = (s) => !!s && s.type === 'consume' && !!CONSUMABLES[s.id] && CONSUMABLES[s.id].kind === 'food';
const isDrink = (s) => !!s && s.type === 'consume' && !!CONSUMABLES[s.id] && CONSUMABLES[s.id].kind === 'drink';
const isStore = (s) => !!s && s.type === 'consume' && !!BASIC_INDEX[s.id];
const ownFood = (s) => isFood(s) && !isStore(s);
const on = (s) => !!s && s.enabled !== false;
const BAR_SLOTS = ACTION_SET_LIMITS.slots;
const runeSpell = (s) => on(s) && s.type === 'ability' && !!ABILITIES[s.id] && !!ABILITIES[s.id].rune;
/* The slot's first "my HP / my mana below N%" test (what Configure action's − and + move), or null. */
const below = (s, metric) => {
  const c = s && Array.isArray(s.conditions) ? s.conditions.find((x) => x && x.metric === metric && (x.op === 'lt' || x.op === 'lte') && Number.isFinite(x.value)) : null;
  return c ? c.value : null;
};
const hpBelow = (s) => below(s, 'self_hp_pct');
/* A spell slot the SERVER struck for its rune: on, of the worn weapon's discipline, active, needing a rune, and
   `usable: false` (hr_hunt_settings_view: no rune it can cast where the engine spends it, and no store rune named on the slot). */
function struckSpell(f) {
  if (!Array.isArray(f.slots)) return -1;
  return f.slots.findIndex((s) => on(s) && s.type === 'ability' && s.usable === false && !!ABILITIES[s.id] && ABILITIES[s.id].active
    && !!ABILITIES[s.id].rune && (!f.discipline || ABILITIES[s.id].disciplines.includes(f.discipline)));
}
/* A TEST ON A COUNT A SLOT WAITS FOR: 2 or more monsters in its area, or 2 or more heroes hurt (what the bar marks, src/shell/slot-waits.js MARKS), or null. */
const countWait = (s) => (s && Array.isArray(s.conditions)
  && s.conditions.find((c) => c && ['enemies_in_aoe', 'allies_below'].includes(c.metric) && c.op === 'gte' && Number.isInteger(c.value) && c.value > 1)) || null;
/* A move behind a skill level (abilities.js `unlock`, the area moves) the server's skills do not reach yet; unknown skills read as locked (fail safe).
   Such a slot waits for the LEVEL, not for its count (a new Ranger's Raking Shot waits for Ranged 10), so the count card is not its story. */
const underUnlock = (f, row) => !!row.unlock && !(skillLevelFromXp(abilitySkill(row), xpIn(f, abilitySkill(row)) ?? -1) >= row.unlock);
/* The first slot that can fire but waits on such a count, or -1: on, not struck, not under its unlock, of the worn weapon's discipline. */
const waitingSlot = (f) => (Array.isArray(f.slots) ? f.slots.findIndex((s) => on(s) && s.type === 'ability' && s.usable !== false && !!ABILITIES[s.id]
  && (!f.discipline || ABILITIES[s.id].disciplines.includes(f.discipline)) && !underUnlock(f, ABILITIES[s.id]) && !!countWait(s)) : -1);
/* The first pair where a STORE food slot eats while the hero's own food would wait: it fires at a higher HP than an
   own food slot that still holds stock, or at the same HP from an earlier slot (the engine fires the first slot whose
   conditions pass, conditions.js pickSlot). { store, own } slot indices, or null. */
function storeFirst(f) {
  if (!Array.isArray(f.slots)) return null;
  for (let o = 0; o < f.slots.length; o++) {
    const O = f.slots[o];
    if (!on(O) || !ownFood(O) || hpBelow(O) === null || O.count === 0) continue;
    for (let s = 0; s < f.slots.length; s++) {
      const S = f.slots[s];
      if (!on(S) || !isStore(S) || BASIC_INDEX[S.id].kind !== 'heal' || hpBelow(S) === null) continue;
      if (hpBelow(S) > hpBelow(O) || (s < o && hpBelow(S) >= hpBelow(O))) return { store: s, own: o };
    }
  }
  return null;
}
/* This hunt's supplies of one kind (food or drink), as the analyzer counts them. */
const used = (f, kind, source) => (Array.isArray(f.supplies) ? f.supplies.filter((r) => CONSUMABLES[r.item] && CONSUMABLES[r.item].kind === kind
  && (!source || r.source === source) && r.count > 0) : null);
const sum = (rows) => rows.reduce((n, r) => n + r.count, 0);
/* The family of the first rune spell on the shown bar that the hero carries no rune of, or null. */
function runeless(f) {
  if (!Array.isArray(f.slots) || !f.carried) return null;
  for (const s of f.slots) {
    const a = on(s) && s.type === 'ability' ? ABILITIES[s.id] : null;
    const fam = a && a.active && a.rune && ITEMS[a.rune] ? ITEMS[a.rune].family : null;
    if (fam && !Object.keys(f.carried).some((id) => ITEMS[id] && ITEMS[id].family === fam && f.carried[id] > 0)) return { family: fam, spell: s.id };
  }
  return null;
}
/* Can this hero loose a shot? A hero who does not shoot always can. The worn ammo, or an ammo slot's item (`loaded`: the worn
   ammo), carried or with its store row behind it. */
const shotRole = (r) => shootsItem(r, { slot: 'ammo', reqSkill: 'ranged' });
function canShoot(f) {
  if (!shotRole(f.role)) return true;
  const ids = [f.ammo, ...f.slots.filter((s) => on(s) && s.type === 'attack_with_item').map((s) => (s.id === 'loaded' ? f.ammo : s.id))];
  return ids.some((id) => !!id && shootsItem(f.role, ITEMS[id]) && (f.carried[id] > 0 || (Array.isArray(f.store) && f.store.some((r) => r && r.partner === id))));
}
const heroesOn = (f) => (Array.isArray(f.roster) ? f.roster.filter((h) => h && Number.isInteger(h.slot)) : null);
/* The account's other heroes playing in town and outside this hero's party (the roster's names against the server's seat names), or null
   while either is unknown. */
const outsideParty = (f) => {
  const hs = heroesOn(f);
  /* a hero in no party has no seats to read: every other hero is outside it */
  const seated = Array.isArray(f.partyNames) ? f.partyNames : f.inParty === false ? [] : null;
  if (!hs || !seated) return null;
  return hs.filter((h) => h.slot !== f.self && h.open === true && h.hunting === false && !!h.name && !seated.includes(h.name));
};
/* The running hunt's place on the Danger scale ({ hunt, step, risk } from the `danger` section), or null off the scale. */
const scaleHunt = (f) => (f.danger && f.danger.playing && f.danger.playing.hunt === f.huntId && DANGER_GROUNDS[f.huntId] ? f.danger.playing : null);
/* THE FIRST RISK PICK (20-v030-the-roads.md 1.2: risk is taught at the first party ground, not before): the lowest open ground on the scale
   whose band holds the hero's Level and opens at the recruits' Level or later, or null. Derived from DANGER_GROUNDS, so a ground R10 puts on
   the scale joins by itself. */
const riskGround = (f) => Object.keys(DANGER_GROUNDS).map((id) => HUNT_INDEX[id])
  .filter((h) => !!h && h.staged !== true && h.band[0] >= RECRUITS.atLevel && f.charLevel >= h.band[0] && f.charLevel <= h.band[1])
  .sort((a, b) => a.band[0] - b.band[0])[0] || null;

/* ── WHERE THE HERO HAS BEEN (#58, Andy 10-22: the Thicket card came back every time he left the Thicket) ── */
/* The monster kinds that tell `pocket` (or a LATER pocket) has been pulled: kinds standing in a pocket
   at or after it on the route that no earlier pocket holds. The hunt section's units are the server's. */
const pulledKinds = (ground, pocket) => {
  const at = ground.route.indexOf(pocket);
  const kinds = (ps) => new Set(ps.flatMap((p) => ground.pockets[p].spawns.map((x) => x.monster)));
  const before = kinds(ground.route.slice(0, at));
  return [...kinds(ground.route.slice(at))].filter((k) => !before.has(k));
};
/* The hunts the server has seen this hero in: the open one and the `visited` record. */
const been = (facts) => [facts.huntId, ...(facts.visited instanceof Set ? facts.visited : [])].filter((h) => HUNT_INDEX[h]);
/* Is ground `h` PAST ground `hunt` on the road: a higher band floor, or the same floor and a higher top (the chain only moves forward,
   Cellar -> Thicket -> Sewer -> on; the Thicket and the Sewer both open at 5 since lane/d-party-pace, Tyler 2026-11-18, and the Sewer's band runs on to 25). */
const past = (h, hunt) => { const a = HUNT_INDEX[h].band, b = HUNT_INDEX[hunt].band; return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]); };
/* Has the hero hunted `hunt`, or a ground past it? `past` alone asks only for a ground past it. */
const reached = (facts, hunt, onlyPast) => been(facts).some((h) => (!onlyPast && h === hunt) || past(h, hunt));
/* A skill's XP as the server said it (a skill it did not list is 0), or null when it sent no skills. */
const xpIn = (facts, skill) => (facts.skillXp ? Number(facts.skillXp[skill]) || 0 : null);
const known = (v, fn) => (v === null || v === undefined ? null : fn(v));
/* Tamsin's tasks this hero holds or was paid for in the last day (the server's `tally` section), or null when the facts carry no rows. */
const tallyTasks = (f) => (f.tally && f.tally.tasks ? [...Object.keys(f.tally.tasks), ...(f.tally.paidTasks || [])].filter((id) => tallyTask(id)) : null);
const taskFloor = (id) => HUNT_INDEX[tallyTask(id).hunt].band[0];

/* ── THE FACT KINDS: (params, facts, { openedIn, id }) -> true | false | null (the server has not said). In a card's
   `when` null is "not met" (a trigger the coach cannot see does not fire); in its `done` null is "done" (the coach
   never asks for something it cannot see happen). ── */
const FACTS = Object.freeze({
  /* where the hero is and has been */
  lesson_time: (p, f) => f.charLevel < HUNT_INDEX[p.hunt].band[0] || reached(f, p.hunt),
  /* a shooter with nothing it can loose (the engine's own rule, core/hunt/damage.js pickShot); unknown until the worn set is sent */
  no_shot: (p, f) => (f.ammo === undefined || !Array.isArray(f.slots) || !f.carried ? null : !canShoot(f)),
  shot_ready: (p, f) => (f.ammo === undefined || !Array.isArray(f.slots) || !f.carried ? null : canShoot(f)),
  hunting: (p, f) => !!f.huntId,
  /* not the hunt the player has just come back to (the shell's `back`, away-recap.js): nobody watched what happened in it */
  fresh_hunt: (p, f) => !f.back || f.back !== f.sessionId,
  in_town: (p, f) => !f.huntId,
  in_hunt: (p, f) => f.huntId === p.hunt,
  /* no kill yet (Level XP comes from kills only) */
  unhunted: (p, f) => f.levelXp === 0,
  enter: (p, f) => reached(f, p.hunt) || (p.hunt === CELLAR && f.levelXp > 0),
  /* `past: true`: only a ground past `hunt` counts */
  been: (p, f) => reached(f, p.hunt, p.past === true),
  not_elsewhere: (p, f) => !f.huntId || f.huntId === p.hunt,
  /* out of that hunt now, or already hunting past it (back in it later is not a step back) */
  ended: (p, f, c) => f.huntId !== c.openedIn || (!!c.openedIn && reached(f, c.openedIn, true)),
  hunt_age: (p, f) => (!f.huntId || !HUNT_INDEX[f.huntId] || !past(f.huntId, p.past) ? false : known(f.huntMs, (ms) => ms >= p.min)),
  pull: (p, f) => {
    const g = HUNT_GROUNDS[p.ground];
    return (f.huntId === g.hunt && pulledKinds(g, p.pocket).some((k) => f.unitKinds && f.unitKinds.has(k))) || reached(f, g.hunt, true);
  },
  /* Level and kills (Level XP comes from kills only, so > 0 means a kill landed) */
  kills: (p, f) => f.levelXp > 0,
  level: (p, f) => f.charLevel >= 2,
  level_at: (p, f) => f.charLevel >= p.at && (!p.below || f.charLevel < p.below),
  /* the Weighhouse trades with this hero by either of the server's routes: its Level, or its best bench skill as the server sent it (a bench
     not sent opens nothing: never "open" on a guess) */
  market_open: (p, f) => (f.charLevel >= WEIGHHOUSE_LEVEL || (Number.isInteger(f.benchLevel) && f.benchLevel >= WEIGHHOUSE_BENCH)) && (!p.below || f.charLevel < p.below),
  unlock: (p, f) => f.charLevel >= HUNT_INDEX[p.hunt].band[0],
  /* town work, judged on facts that stay (Farming and Cooking XP; the shared land) */
  /* "plant a seed in EACH empty plot" (playtest 2026-10-29 #12: one plot finished it, since a plant pays Farming XP): done
     when the shared land has no empty open plot, or the hero holds none of the card's seed (a bag the server never sent
     is not a wall), or it has farmed past one harvest's XP (it knows the field; sticky, so a later bare plot never walls
     the chain). Land not sent: as before. */
  planted: (p, f) => {
    const crop = CROPS[p.crop], xp = xpIn(f, 'farming');
    if (f.land && Number.isInteger(f.land.empty) && crop) {
      return f.land.empty === 0 || (xp !== null && xp >= crop.xp) || !f.bag || !(f.bag[crop.seed] > 0);
    }
    return (xp === null && f.landPlanted == null) || xp > 0 || f.landPlanted === true;
  },
  skill_xp: (p, f) => known(xpIn(f, p.skill), (xp) => xp > 0),
  turnips: (p, f) => (f.land == null && f.bag == null ? null : !!(f.land && f.land.ready && f.land.ready.turnip > 0) || !!(f.bag && f.bag.turnip > 0)),
  juice_made: (p, f) => (f.bag == null ? null : f.bag.turnip_juice > 0 || FACTS.drink_slot({ item: 'turnip_juice' }, f) === true),
  home_unowned: (p, f) => known(f.home, (h) => !h.owned && !!h.next),
  home_owned: (p, f) => known(f.home, (h) => h.owned),
  /* Tamsin */
  /* Taken: this task or one on a ground at or past its own is held or was paid (her Cellar rats are not her wolves: the wolves' card still asks). */
  tally_taken: (p, f) => {
    const tl = f.tally, mine = tallyTasks(f);
    if (!tl) return true;
    return (mine ? mine.some((id) => taskFloor(id) >= taskFloor(p.task)) : tl.held > 0 || tl.paid > 0) || (tl.weight === true && reached(f, tallyTask(p.task).hunt));
  },
  /* Paid: this task was paid or is no longer held (`task` absent, or no rows in the facts: any pay, or nothing held). */
  tally_paid: (p, f) => !f.tally || (p.task && f.tally.tasks ? (f.tally.paidTasks || []).includes(p.task) || !f.tally.tasks[p.task] : f.tally.paid > 0 || f.tally.held === 0),
  /* the held task's count, the server's: done and waiting for the pay, or nothing left to count (not held, or done) */
  tally_counted: (p, f) => known(f.tally && f.tally.tasks, (ts) => !!ts[p.task] && ts[p.task].done === true),
  tally_idle: (p, f) => known(f.tally && f.tally.tasks, (ts) => !ts[p.task] || ts[p.task].done === true),
  tally_paid_for: (p, f) => known(f.tally && f.tally.paidTasks, (ps) => ps.includes(p.task)),
  /* the bar: what the server shows, what it stored, what it struck */
  rune_struck: (p, f) => (Array.isArray(f.slots) ? struckSpell(f) >= 0 : null),
  rune_ready: (p, f) => (Array.isArray(f.slots) ? struckSpell(f) < 0 : null),
  slot_waits: (p, f) => (Array.isArray(f.slots) ? waitingSlot(f) >= 0 : null),
  rune_spell_none: (p, f) => (Array.isArray(f.slots) ? !f.slots.some(runeSpell) : null),
  rune_spell_on: (p, f) => (Array.isArray(f.slots) ? f.slots.some(runeSpell) : null),
  food_slot: (p, f) => (Array.isArray(f.slots) ? f.slots.some((s) => on(s) && ownFood(s) && hpBelow(s) !== null) : null),
  /* the player SAVED an own food slot at an HP of their own: the stored bar, never the shown start bar, and never a
     whole-bar restatement of the kit's 60% (any Save restates every slot: "Tell your hero when" finished unseen) */
  food_cond: (p, f) => (Array.isArray(f.stored) ? f.stored.some((s) => ownFood(s) && hpBelow(s) !== null && hpBelow(s) !== START_FOOD_PCT) : null),
  food_order_bad: (p, f) => (Array.isArray(f.slots) ? storeFirst(f) !== null : null),
  food_order: (p, f) => (Array.isArray(f.slots) ? storeFirst(f) === null : null),
  bar_saved: (p, f) => (Array.isArray(f.stored) ? f.stored.some(Boolean) : null),
  drink_slot: (p, f) => (Array.isArray(f.stored) ? f.stored.some((s) => isDrink(s) && s.id === p.item) : null),
  carries: (p, f) => known(f.carried, (c) => c[p.item] >= (p.n || 1)),
  rune_unowned: (p, f) => (Array.isArray(f.slots) && f.carried ? runeless(f) !== null : null),
  rune_owned: (p, f) => (Array.isArray(f.slots) && f.carried ? runeless(f) === null : null),
  stance_changed: (p, f) => (f.stance && ROLE_DEFAULTS[f.role] ? f.stance !== ROLE_DEFAULTS[f.role].stance : null),
  /* this hunt, as the analyzer counts it */
  ate: (p, f) => known(used(f, 'food', 'own'), (r) => r.length > 0),
  drank: (p, f) => known(used(f, 'drink'), (r) => r.length > 0),
  bought_drinks: (p, f) => known(used(f, 'drink', 'store'), (r) => sum(r) >= p.n),
  eaten_at_least: (p, f) => known(used(f, 'food'), (r) => sum(r) >= p.n),
  eating_fast: (p, f) => known(used(f, 'food'), (r) => sum(r) >= p.n && sum(r) * 3600000 >= p.perHour * (f.huntMs || 0)),
  stamina_low: (p, f) => known(f.staminaMs, (ms) => ms <= STAMINA_LOW_MIN * 60000),
  /* the bag, loot and gear */
  sellable: (p, f) => known(f.sellable, (n) => n > 0),
  loot_sold: (p, f) => known(f.sellable, (n) => n === 0),
  loot_rule: (p, f) => known(f.lootRules, (r) => Object.values(r).some((v) => v === 'sell' || v === 'deposit')),
  weapon_changed: (p, f) => known(f.weapon, (w) => w !== START_EQUIPMENT.weapon),
  /* this weapon in hand, or hands empty with it or what it is made into in the bag (taken off to reforge: the bench spends the bag's) */
  club_hand: (p, f) => (f.weapon === undefined || !f.carried ? null : f.weapon === p.item || (!f.weapon && (f.carried[p.item] > 0 || f.carried[p.made] > 0))),
  wields: (p, f) => (f.weapon === undefined ? null : f.weapon === p.item),
  /* worn armor or a shield, the pieces Defense trains in (core/vitals.js wearsArmour over the server's worn set) */
  armoured: (p, f) => known(f.armoured, (a) => a === true),
  /* armor (a piece with an armor weight) on every DANGER_KIT slot, from the server's worn set */
  danger_kit: (p, f) => known(f.armourWorn, (w) => DANGER_KIT.every((s) => w.includes(s))),
  /* a harder tier picked on any ground, running now, or the latest hunt's (the server's hunt_tier section and the hunt's own tier); unknown without the section */
  tier_taken: (p, f) => known(f.tierTaken, (v) => v === true),
  /* another card the player has read (Got it, or on screen long enough) */
  card_read: (p, f) => (f.read instanceof Set ? f.read.has(p.card) : null),
  unarmoured: (p, f) => known(f.armoured, (a) => a === false),
  /* the bag holds at least `n` of the fuels Inner Flame 1 burns (Bones and the family fuels) */
  fuel_held: (p, f) => known(f.bag, (b) => FIRST_FUELS.reduce((n, id) => n + (Number(b[id]) || 0), 0) >= p.n),
  upgrades: (p, f) => known(f.upgrades, (u) => u.length > 0),
  upgrades_none: (p, f) => known(f.upgrades, (u) => u.length === 0),
  bag_full: (p, f) => (f.stacks == null || !f.bagCap ? null : f.stacks >= Math.ceil(f.bagCap * BAG_NEAR_FULL)),
  stored_stack: (p, f) => known(f.bankStacks, (n) => n > 0),
  setup_saved: (p, f) => known(f.presets, (n) => n > 0),
  /* death and Blessings (the server's section: held, its free limit and its prices) */
  /* ...never a death its mode took nothing for (the Tower spits you out: session-modes.js deathLossPm 0), which a Blessing has nothing to cut */
  died: (p, f) => !f.huntId && f.endReason === 'died' && f.freeDeath !== true,
  /* the latest hunt ended because stamina ran out (the server's end reason): the moment a town job costs the hunt nothing (plan L08) */
  stamina_ended: (p, f) => !f.huntId && f.endReason === 'stamina',
  /* the server offers the Burning Tower (its section, the burning_tower switch); climbed: a floor on its record */
  tower_open: (p, f) => f.towerBest !== null && f.towerBest !== undefined,
  tower_climbed: (p, f) => known(f.towerBest, (b) => b > 0),
  blessed: (p, f) => known(f.blessings, (b) => b.held >= b.of),
  unblessed: (p, f) => known(f.blessings, (b) => b.held < b.of),
  below_free: (p, f) => known(f.blessings, (b) => Number.isInteger(b.freeUntil) && f.charLevel < b.freeUntil),
  at_free: (p, f) => known(f.blessings, (b) => Number.isInteger(b.freeUntil) && f.charLevel >= b.freeUntil),
  /* the purse holds the price of the next hero slot the server offers; none on offer: never (unknown until the account's offer is read) */
  /* The purse is a real start on the next hero (the What next line's own share): at 400,000 gp for the second (Tyler 2026-11-20) that is 200,000 gp; the first house speaks until then (lane/c-slots-lower). */
  purse_saving_hero: (p, f) => (Number.isSafeInteger(f.gold) && Number.isInteger(f.slotsOwned) ? Number.isSafeInteger(f.slotCost) && f.slotCost > 0 && f.gold >= f.slotCost * SAVING_FROM : null),
  /* the server's recruit press is ready (the `recruits` section, tutorial-sections.js recruitFact): no section reads as no press, never a guess */
  recruits_ready: (p, f) => (f.recruits === undefined ? null : !!f.recruits && f.recruits.ready === true),
  /* more than one hero (the account's roster, from the shell) */
  heroes: (p, f) => known(heroesOn(f), (h) => h.length >= p.atLeast),
  own_hero_in_town: (p, f) => known(heroesOn(f), (h) => h.some((x) => x.slot !== f.self && x.open === true && x.hunting === false)),
  partied: (p, f) => f.inParty === true || f.partied === true,
  /* THE COMPANY IN ONE PARTY (lane/first-hour-rewrite, played 2026-11-23: after the first invite the card moved on and two recruits stood in
     town): an own hero the roster shows playing, in town and outside this hero's party (`partyNames`, the server's seats), or none left */
  own_hero_out: (p, f) => known(outsideParty(f), (o) => o.length > 0),
  party_gathered: (p, f) => known(outsideParty(f), (o) => o.length === 0 && f.inParty === true),
  /* a party personal best on any ground (the server's): this hero has hunted in a party, so it knows how to make one */
  party_hunted: (p, f) => f.partied === true,
  /* THE ROADS (the `talents` section, null while the switch is off: every card on it is passed by) */
  talents_left: (p, f) => known(f.talents, (tl) => tl.left > 0),
  talents_spent: (p, f) => known(f.talents, (tl) => tl.left === 0),
  /* THE DANGER SCALE (the `danger` section; `falls` the newest hunt's report). A ground the scale opens on is a DANGER_GROUNDS row */
  /* no `danger` section is the tier path (danger-sections.js: null, none), so a hunt with none is off the scale */
  on_scale: (p, f) => !!f.huntId && !!scaleHunt(f),
  off_scale: (p, f) => !!f.huntId && !scaleHunt(f),
  fell_back: (p, f) => known(f.falls, (n) => n > 0),
  risk_set: (p, f) => known(f.danger, (d) => !!d.risk),
  scale_ground: (p, f) => !!riskGround(f),
  /* where a hero can die (RD-Q3 a: Careful and Steady fall back first, only Bold dies): Bold in the plan or in the running hunt, or a death on record */
  can_die: (p, f) => (f.danger === undefined && f.death === undefined ? null
    : !!f.death || (!!f.danger && (f.danger.risk === 'bold' || (!!f.danger.playing && f.danger.playing.risk === 'bold')))),
  /* a press the shell recorded (Got it), or a reactive card on screen long enough to read */
  read: (p, f, c) => (f.read instanceof Set ? f.read.has(c.id) : null),
});
const PARAMS = Object.freeze({ card_read: ['card'], tally_counted: ['task'], tally_idle: ['task'], tally_paid_for: ['task'], in_hunt: ['hunt'], lesson_time: ['hunt'], enter: ['hunt'], been: ['hunt'], not_elsewhere: ['hunt'], unlock: ['hunt'], level_at: ['at'], skill_xp: ['skill'],
  tally_taken: ['task'], hunt_age: ['min', 'past'], pull: ['ground', 'pocket'], eaten_at_least: ['n'], eating_fast: ['n', 'perHour'], heroes: ['atLeast'], drink_slot: ['item'],
  carries: ['item'], club_hand: ['item', 'made'], wields: ['item'], kills: ['atLeast'], fuel_held: ['n'], bought_drinks: ['n'] });

/* One fact as true / false / null; `any` is true once one is, null when none is and one is unknown. */
function judge(d, f, c) {
  if (d.kind === 'any') {
    const got = d.of.map((x) => judge(x, f, c));
    if (got.includes(true)) return true;
    /* `asks`: the card asks for a press, and Got it is only its way past: a client that records no read still asks */
    const said = d.asks ? got.filter((g, i) => d.of[i].kind !== 'read') : got;
    return said.includes(null) ? null : false;
  }
  return FACTS[d.kind] ? FACTS[d.kind](d, f, c) : false;
}
const mentionsRead = (d) => d.kind === 'read' || (d.kind === 'any' && d.of.some(mentionsRead));

/** Every problem with the tutorial, as strings. Empty = valid. */
export function validate(rows = HUNT_TUTORIAL) {
  const out = [];
  const seen = new Set();
  const checkFact = (bad, d, where) => {
    if (!d || typeof d !== 'object') return bad(where + ' is not a fact');
    if (d.kind === 'any') {
      if (!Array.isArray(d.of) || d.of.length < 2) bad(where + ': any needs two facts or more');
      else d.of.forEach((x) => checkFact(bad, x, where));
      return;
    }
    if (!FACTS[d.kind]) return bad(where + ' kind ' + d.kind + ' is unknown');
    for (const k of PARAMS[d.kind] || []) if (d[k] === undefined) bad(where + ' ' + d.kind + ' needs ' + k);
    if (['enter', 'been', 'not_elsewhere', 'unlock', 'lesson_time', 'in_hunt'].includes(d.kind) && !HUNT_INDEX[d.hunt]) bad('hunt ' + d.hunt + ' is not in hunts.js');
    if (d.kind === 'hunt_age' && !HUNT_INDEX[d.past]) bad('hunt ' + d.past + ' is not in hunts.js');
    if (d.kind === 'kills' && d.atLeast !== 1) bad('kills: the server only tells the first kill (Level XP > 0), so atLeast must be 1');
    if (d.kind === 'ended' && !END_ORDER.includes(d.reason)) bad('end reason ' + d.reason + ' is not in END_ORDER');
    if (d.kind === 'skill_xp' && !SKILLS_DEF[d.skill]) bad('skill ' + d.skill + ' is not a skill');
    if (['tally_taken', 'tally_counted', 'tally_idle', 'tally_paid_for'].includes(d.kind) && !tallyTask(d.task)) bad('task ' + d.task + ' is not one of Tamsin\'s tasks');
    if (d.kind === 'tally_paid' && d.task !== undefined && !tallyTask(d.task)) bad('task ' + d.task + ' is not one of Tamsin\'s tasks');
    if (['drink_slot', 'carries', 'club_hand', 'wields'].includes(d.kind) && !ITEMS[d.item]) bad(d.kind + ' item ' + d.item + ' is not an item');
    if (d.kind === 'club_hand' && !ITEMS[d.made]) bad('club_hand made ' + d.made + ' is not an item');
    if (d.kind === 'card_read' && !rows.some((x) => x.id === d.card)) bad('card_read card ' + d.card + ' is not a card');
    if (d.kind === 'pull') {
      const gr = HUNT_GROUNDS[d.ground];
      if (!gr) bad('ground ' + d.ground + ' is not in hunt-grounds.js');
      else if (!(Number.isInteger(d.pocket) && gr.route.includes(d.pocket))) bad('pocket ' + d.pocket + ' is not on ' + d.ground + "'s route");
    }
  };
  const firstReactive = rows.findIndex((x) => x.reactive);
  for (const r of rows) {
    const bad = (why) => out.push(String(r && r.id) + ': ' + why);
    if (!/^[a-z0-9_]{1,40}$/.test(String(r.id)) || seen.has(r.id)) bad('id must be unique [a-z0-9_]');
    seen.add(r.id);
    if (!r.title || !r.text) bad('a card needs a title and a text');
    if (!TUTORIAL_ANCHORS[r.anchor]) bad('anchor ' + r.anchor + ' is not a tutorial anchor');
    for (const m of String(r.text).matchAll(SLOT_TOKEN)) if (!ITEMS[m[1]] && !BASIC_INDEX[m[1]]) bad('{slot:' + m[1] + '} names no item');
    const g = r.ring || {};
    if (g.item && !ITEMS[g.item]) bad('ring item ' + g.item + ' is not an item');
    if (g.crop && !CROPS[g.crop]) bad('ring crop ' + g.crop + ' is not a crop');
    if (g.skill && !SKILLS_DEF[g.skill]) bad('ring skill ' + g.skill + ' is not a skill');
    if (g.task && !tallyTask(g.task)) bad('ring task ' + g.task + ' is not one of Tamsin\'s tasks');
    checkFact(bad, r.done, 'done');
    for (const w of r.when || []) checkFact(bad, w, 'when');
    if (r.when && !Array.isArray(r.when)) bad('when must be a list of facts');
    if (r.hooks && !(Array.isArray(r.hooks) && r.hooks.every((h) => typeof h === 'string' && h.length > 2))) bad('hooks must be selector strings');
    if (r.gotIt && !mentionsRead(r.done)) bad('a Got it card must finish on its read');
    if (r.party && r.done.kind !== 'enter') bad('a party card is finished by entering its party hunt');
    if (r.party && r.reactive) bad('a party card is part of the chain');
    if (AUTO_KINDS.includes(r.done.kind) && firstReactive >= 0 && rows.indexOf(r) > firstReactive) bad('a card the server finishes on its own must come before the reactive cards (the shell would replay it)');
  }
  return out;
}

/* ── WHICH CARD IS UP ──────────────────────────────────────────────────────
   The card is a pure function of what the SERVER has said (no step counter is stored anywhere, so a reload, a
   second device and a closed browser all show the same card), plus the reads the shell recorded. The first card
   in order that is on the hero's way, not done, and can be stated truly is the card. A step about WHERE the hero is
   (enter, ended, pull) is judged on where it has BEEN as well: going into a hunt and back out to town never moves
   the card backward (#58). A step about what the hero has DONE in town is judged on a fact that stays (Farming and
   Cooking XP, the armor weight Tamsin asks for once, a loot rule, a saved setup).
   A CARD HIDDEN WITH GOT IT HOLDS NOTHING UP (`facts.hid`, the shell's residue `coach.hid`: a card a server fact finishes, which the
   player pressed Got it on; 2026-11-18, lane/a-first-hours: "Feed the Hearth" hidden held every card after it, the farm's included,
   until the hero burned fuel). It is passed by like a done card, so the next card whose conditions hold is up; only a card the
   player has seen and dismissed is passed, never one it has not. */

/* The top of the band of the last ground `rows` enter: past it, those cards are behind the hero. */
const guideCap = (rows) => Math.max(...rows.filter((r) => r.done.kind === 'enter').map((r) => HUNT_INDEX[r.done.hunt].band[1]));
/* Has another hero on this account lived through the first hour? (the roster's Levels, the shell's) */
const secondHero = (f) => (heroesOn(f) || []).some((h) => h.slot !== f.self && Number.isInteger(h.level) && h.level > KNOWN_LEVEL);
/* Is this card on this hero's way? A party card: only in a party of 2+ whose Level opens its hunt. A chain card: only
   up to the top of the solo chain's last ground (a hero who out-levelled the Thicket is past the first hour; "What
   next" speaks to them). A reactive card: its own facts alone. Every card: its `when`, all of it. (A card that finishes
   on a read the shell cannot record judges `done` null, which passes it by: never a wall.) */
function onWay(r, f, caps) {
  if (r.party) { if (!(f.inParty === true && f.charLevel >= HUNT_INDEX[r.done.hunt].band[0])) return false; } else if ((!r.reactive || r.dayOne) && f.charLevel > caps.solo) return false;
  if (r.knowledge && secondHero(f)) return false;
  return (r.when || []).every((w) => judge(w, f, { id: r.id }) === true);
}

/** The tutorial card this character is on, or null (finished, or out-levelled the chain's grounds). */
export function currentCard(facts, rows = HUNT_TUTORIAL) {
  const past = facts.charLevel > guideCap(rows);
  const caps = { solo: guideCap(rows.filter((r) => !r.party)) };
  let openedIn = null;
  for (const r of rows) {
    if (r.done.kind === 'enter' && !r.party) openedIn = r.done.hunt;
    if (past && (!r.reactive || r.dayOne)) continue;
    if (facts.hid instanceof Set && facts.hid.has(r.id)) continue;
    if (!onWay(r, facts, caps)) continue;
    if (judge(r.done, facts, { openedIn, id: r.id }) !== false) continue;
    if (stated(r, facts)) return r;
  }
  return null;
}

/* ── THE WORDS, FROM THE FACTS ────────────────────────────────────────────
   A card the bar or the server's numbers state is written here, so "slot 4" is the slot that holds the food and
   "14 gp" is the server's price. A builder answers null when the card cannot be stated truly (the slot it names is
   gone, the server has not priced it): the card is then passed by, never shown with a false word (#2 of the
   2026-10-25 walk: the old bar card came back saying "Press the Cooked Shrimp slot" with no such slot). */
const name = (id) => (ITEMS[id] && ITEMS[id].n) || (BASIC_INDEX[id] && BASIC_INDEX[id].n) || null;
const listed = (words) => (words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]);
/** "slot 4", "slots 4 and 5", "slots 1 to 3", "slots 1, 3 and 5" for 0-based slot indices. */
export function slotWords(ix) {
  const n = ix.map((i) => i + 1);
  if (n.length === 1) return 'slot ' + n[0];
  if (n.length > 2 && n.every((v, k) => k === 0 || v === n[k - 1] + 1)) return 'slots ' + n[0] + ' to ' + n[n.length - 1];
  return 'slots ' + listed(n.map(String));
}
const priceOf = (f, id) => { const r = Array.isArray(f.store) ? f.store.find((x) => x && x.id === id) : null; return r && Number.isInteger(r.price) ? r.price : null; };
const slotOf = (f, test) => (Array.isArray(f.slots) ? f.slots.findIndex((s) => on(s) && test(s)) : -1);
/* What a heal at `pct` wastes on a pool of `max`: the Configure action's own sum (src/shell/action-table.js wasteLine). */
export const wasteAt = (amount, pct, max) => amount - Math.round((max * (100 - pct)) / 100);
/* The armor weight that costs a role's style nothing (wornByRole: plate costs a caster and a Ranger accuracy, cloth a
   Melee): what Tamsin's card advises. */
/* The armor weight a role's first card calls right: src/data/hunt-roles.js WEIGHT_FOR_ROLE (moved there with the upgrade pick, src/core/upgrade-pick.js). */
export { WEIGHT_FOR_ROLE };
export const ROLE_WORDS = Object.freeze({ tank: 'a shield tank', melee_dps: 'a Melee hero', ranger: 'a Ranger', mage: 'a Mage', healer: 'a Healer' });
/* THE CARDS STATED FROM THE FACTS (Tyler 2026-11-16: a coach card is a short title and ONE line that names the press, tests/copy-lint.mjs coach-card).
   A builder fills its coach.js row from the facts (the slot, the item, the rune), rings what it names, and answers null when it cannot be stated truly. */
/* THE GROUND THE FIRST DANGEROUS RUN NAMES: of the open grounds whose band holds the hero's Level and that have a Dangerous tier, the one it hunted last,
   else the highest it has hunted, else the lowest (the Thicket at 8). Null when none has one: the card is passed by. */
function dangerGround(f) {
  const floor = (g) => HUNT_INDEX[g.hunt].band[0];
  /* a ground on the Danger scale plays no tier (lane/scale-early-grounds: the Thicket's Hunts page shows the Risk, so a Dangerous ring there
     stands on nothing); when no open ground at the hero's Level has the tier, the offer is not made */
  const fits = Object.values(OPEN_GROUNDS).filter((g) => { const h = HUNT_INDEX[g.hunt]; return !!h && !DANGER_GROUNDS[g.id] && f.charLevel >= h.band[0] && f.charLevel <= h.band[1] && tiersOf(g.id).includes(DANGER_TIER); });
  const seen = been(f);
  return fits.find((g) => g.hunt === f.lastHunt) || fits.filter((g) => seen.includes(g.hunt)).sort((a, b) => floor(b) - floor(a))[0]
    || fits.sort((a, b) => floor(a) - floor(b))[0] || null;
}
const SAY = Object.freeze({
  [FIRST_DANGEROUS]: (f) => {
    const g = dangerGround(f);
    if (!g) return null;
    const words = { ground: HUNT_INDEX[g.hunt].name };
    return { text: t('coach.first_dangerous', words), textIn: t('coach.first_dangerous_in', words), ring: { hunt: g.hunt, tier: DANGER_TIER } };
  },
  /* THE SECOND TRIP (back from Tamsin's pay): the invitation leads. */
  earn_the_thicket: (f) => ({ text: FACTS.tally_paid_for({ task: RATS.id }, f) === true ? t('coach.keep_hunting', RATS_WORDS) : BROOK }),
  /* THE COUNT IS THE SERVER'S (audit 2026-11-15 F3: "Hunt the Thicket until your 200 Gray Wolves are down" stood beside a tally reading 200/200): once her
     task's row says done, the card says what is left to do. Read from each envelope's tally, like her rats' card (tamsin_owes). */
  tamsin_pays: (f) => ({ text: FACTS.tally_counted({ task: WOLVES.id }, f) === true ? t(f.huntId ? 'coach.count_done' : 'coach.count_done_town', { gold: WOLVES.gold }) : WOLVES_WAIT }),
  load_shot: (f) => {
    /* the bag's first stack the weapon can loose: the card names and rings it (none: the Hunts page's Ammo line says the rest) */
    const id = f.carried ? Object.keys(f.carried).find((x) => f.carried[x] > 0 && shootsItem(f.role, ITEMS[x])) : null;
    if (!id) return null;
    return { text: t('coach.load_shot', { shot: name(id) }), textIn: t('coach.load_shot_in', { shot: name(id) }), shot: id };
  },
  bar_intro: (f) => (Array.isArray(f.slots) && f.slots.some(on) ? { text: t('coach.bar_intro'), barSlot: 0 } : null),
  why_it_waits: (f) => {
    const i = waitingSlot(f);
    return i < 0 ? null : { text: t('coach.why_waits', { slot: slotWords([i]) }), barSlot: i };
  },
  spell_runes: (f) => {
    const i = struckSpell(f);
    const a = i >= 0 ? ABILITIES[f.slots[i].id] : null;
    const fam = a && ITEMS[a.rune] ? ITEMS[a.rune].family : null;
    const st = fam && Array.isArray(f.store) ? f.store.find((r) => r && r.partner === a.rune) : null;
    if (!fam || !RUNE_FAMILIES[fam] || !st || !name(st.id)) return null;
    return { text: t('coach.spell_runes', { slot: slotWords([i]), rune: name(st.id) }), barSlot: i, store: st.id };
  },
  food_when: (f) => {
    const i = slotOf(f, (s) => ownFood(s) && hpBelow(s) !== null);
    if (i < 0) return null;
    const s = f.slots[i], pct = hpBelow(s), heal = CONSUMABLES[s.id].amount;
    const max = Number.isFinite(f.hpMax) && f.hpMax > 0 ? f.hpMax : null;
    /* where to stop: the first step down (Configure action's 5%) that wastes nothing, but never under EAT_FLOOR_PCT (a low
       hero's few HP; the designer's 50%), where a little waste is the price of eating before a big hit */
    let to = pct;
    if (max) while (to - PCT_STEP >= EAT_FLOOR_PCT && wasteAt(heal, to, max) > 0) to -= PCT_STEP;
    /* ONE VISIT SETS BOTH (the audit's F4): lowering the own slot alone leaves the store food eating first between the two lines, and that was a
       second card and a second window ("Own food first") made by this one's advice. */
    const j = to < pct ? slotOf(f, (x) => isFood(x) && isStore(x) && hpBelow(x) !== null && hpBelow(x) > to) : -1;
    if (j >= 0) return { text: t('coach.food_when_both', { slot: slotWords([i]), other: slotWords([j]), pct: to }), barSlot: i, goal: to };
    return to < pct ? { text: t('coach.food_when_to', { slot: slotWords([i]), pct: to }), barSlot: i, goal: to }
      : { text: t('coach.food_when', { slot: slotWords([i]) }), barSlot: i };
  },
  food_order: (f) => {
    const p = storeFirst(f);
    if (!p) return null;
    const S = f.slots[p.store], O = f.slots[p.own];
    if (priceOf(f, S.id) === null) return null;
    /* a later slot at a higher HP: lower it to the own slot's; an EARLIER slot: it must also move after the own slot
       (at the same HP the first slot whose conditions pass fires) */
    const higher = hpBelow(S) > hpBelow(O), first = p.store < p.own;
    const vars = { slot: slotWords([p.store]), pct: hpBelow(O), own: slotWords([p.own]) };
    const key = higher && first ? 'coach.food_order_both' : higher ? 'coach.food_order_lower' : 'coach.food_order_later';
    return { text: t(key, vars), barSlot: p.store, goal: higher ? hpBelow(O) : null };
  },
  first_spell: (f) => {
    /* the first rune spell the worn weapon casts that THIS hero can cast now, whose family the store sells, and an empty slot to put it in.
       CAST NOW (retention dive 2026-11-20, dead moment E: every sword-and-shield hero was told to slot Frost Slam, Melee 12 and party only):
       its unlock reached on the server's skills (underUnlock, unknown = locked) and its party rule met where the hero stands (partyOnly, the
       engine's own reading; an `alone` row only alone). None: the card is passed by. */
    const castsNow = (x) => !underUnlock(f, x) && (!partyOnly(x, f.role) || f.inParty === true) && (!x.alone || f.inParty !== true);
    const a = f.discipline ? Object.values(ABILITIES).find((x) => x.active && x.rune && x.disciplines.includes(f.discipline) && castsNow(x)) : null;
    const st = a && Array.isArray(f.store) ? f.store.find((r) => r && r.partner === a.rune) : null;
    /* the first empty slot: a gap in the bar the server shows, else the one after its last (20 slots, ACTION_SET_LIMITS) */
    const gap = Array.isArray(f.slots) ? f.slots.findIndex((x) => !x) : -1;
    const free = gap >= 0 ? gap : Array.isArray(f.slots) && f.slots.length < BAR_SLOTS ? f.slots.length : -1;
    const fam = a && ITEMS[a.rune] ? RUNE_FAMILIES[ITEMS[a.rune].family] : null;
    if (!a || !st || !name(st.id) || !fam || free < 0 || !Number.isInteger(st.price)) return null;
    /* the tab's own name (Configure action's Spells tab: a rune spell is a spell), never a tab that isn't there (designer re-read 2026-11-11) */
    return { text: t('coach.first_spell', { slot: slotWords([free]), tab: BAR_TEXT.tab_spells, spell: a.n, rune: name(st.id) }), barSlot: free, store: st.id, spell: a.id };
  },
  /* In a party a leaver takes the others home (Tyler 10-22: every ticked box, on by default): the card says so before the press (party panel 11-03). */
  leave_cellar: (f) => ({ text: f.inParty === true ? t('coach.leave_party') : t('coach.leave_cellar') }),
  styles: () => ({ text: t('coach.styles'), textIn: t('coach.styles_in') }),
  bless: (f) => {
    const b = f.blessings;
    if (!b || !Number.isInteger(b.freeUntil) || !(b.best > 0)) return null;
    /* the ONE Blessing (lane/level-costs, 2026-11-22): one press, no count to name */
    return { text: t('coach.bless') };
  },
  /* the weight that costs this hero's style nothing, named on the press (her window's line beside the picker says what each gives) */
  tamsins_task: (f) => {
    /* A HERO IN A PARTY, or back from the party's ground, takes the party's task there (played 2026-11-23: a company of four in the Sewer was sent
       to the lone wolves): the Rat King, on the ground it hunts */
    if (f.inParty === true || reached(f, KING.hunt)) {
      const words = { label: KING.label, count: KING.count };
      return { text: t('coach.tamsins_task_party', words), textIn: t('coach.tamsins_task_party_in', words), ring: { task: KING.id } };
    }
    const w = WEIGHT_FOR_ROLE[f.role];
    return { text: TAMSIN_WAY, textIn: w ? t('coach.tamsins_task_in', { weight: w, label: WOLVES.label }) : t('coach.tamsins_task_in_any', { label: WOLVES.label }) };
  },
  first_eat: (f) => {
    const ate = used(f, 'food', 'own');
    const item = ate && ate.length ? ate[0].item : null;
    const i = item ? slotOf(f, (s) => s.type === 'consume' && s.id === item) : -1;
    if (i < 0 || hpBelow(f.slots[i]) === null) return null;
    return { text: t('coach.first_eat', { item: name(item) }), barSlot: i };
  },
  first_drink: (f) => {
    const i = slotOf(f, (s) => isDrink(s) && below(s, 'self_mana_pct') !== null);
    if (i < 0) return null;
    const s = f.slots[i];
    if (isStore(s) && priceOf(f, s.id) === null) return null;
    return { text: isStore(s) ? t('coach.first_drink_store') : t('coach.first_drink_own', { item: name(s.id) }), barSlot: i };
  },
  /* unstated until the server's recruit press is ready (never a card on a guess): its count in the words */
  more_heroes: (f) => (f.recruits && f.recruits.ready === true ? { text: t('coach.more_heroes', { count: f.recruits.count }) } : null),
  talent_point: () => ({ text: t('coach.talent_point'), textIn: t('coach.talent_point_in') }),
  /* "Depth 4 of 20", the HUD's own words for the server's step (`depth`: src/session/danger-sections.js depthOf over the `danger` section) */
  depth: (f) => {
    const d = scaleHunt(f) && f.depth && Number.isInteger(f.depth.depth) ? f.depth : null;
    return d ? { title: t('coach.depth_title', { depth: d.depth, of: d.of || DEPTHS }), text: t('coach.depth') } : null;
  },
  risk_pick: (f) => {
    const g = riskGround(f);
    return g ? { text: t('coach.risk_pick', { ground: g.name }), textIn: t('coach.risk_pick_in'), ring: { hunt: g.id } } : null;
  },
  party_own: (f) => {
    const o = (outsideParty(f) || []).find((x) => x.name);
    return o ? { text: t('coach.party_own', { name: o.name }), other: o.slot } : null;
  },
  fuel_hearth: (f) => {
    /* the bag's biggest first-rung fuel stack: the one the card rings and names */
    const top = f.bag ? FIRST_FUELS.map((id) => [id, Number(f.bag[id]) || 0]).sort((a, b) => b[1] - a[1])[0] : null;
    if (!top || !(top[1] > 0) || !name(top[0])) return null;
    return { text: t('coach.fuel_hearth', { fuel: name(top[0]) }), textIn: t('coach.fuel_hearth_in', { fuel: name(top[0]) }), fuel: top[0] };
  },
  harvest_juice: (f) => {
    const juice = (ARTISAN_RECIPES.cooking || []).find((r) => r.output === 'turnip_juice');
    if (!juice) return null;
    /* Harvested, the way is the bench: the ring stayed on the Farm, whose window then showed "Cook your turnips" over a field with nothing left to press (door panel 2026-11-04). */
    const ready = f.land && f.land.ready && f.land.ready.turnip > 0;
    return ready ? { text: t('coach.harvest_ready') } : { text: t('coach.harvest_cook', { recipe: juice.name }), anchor: 'crafting', ring: { skill: 'cooking', work: juice.id } };
  },
  juice_slot: (f) => {
    if (!(f.carried && f.carried.turnip_juice > 0)) return null;
    const st = slotOf(f, (s) => isStore(s) && BASIC_INDEX[s.id].kind === 'mana' && below(s, 'self_mana_pct') !== null);
    return st < 0 ? { text: t('coach.juice_slot', { item: name('turnip_juice') }) } : { text: t('coach.juice_slot_before', { item: name('turnip_juice'), slot: slotWords([st]) }), barSlot: st };
  },
  /* The bench spends the bag's club, so the hero's hands are empty when it is done: the card stays until the new club is worn, and then rings the bag. */
  klappas_club: (f) => {
    if (!CLUB_REFORGE || !name('klappas_club')) return null;
    return f.carried && f.carried.klappas_club > 0 ? { text: t('coach.club_equip', { club: name('klappas_club') }), anchor: 'inventory' }
      : { text: t('coach.club_make', { recipe: CLUB_REFORGE.name }) };
  },
  /* the smith's first rung when the purse covers it (Tempering, src/data/temper.js), else the hero and the House; unstated with no offer */
  purse_goal: (f) => {
    if (!ORDINAL[(Number(f.slotsOwned) || 0) + 1] || !Number.isSafeInteger(f.slotCost) || !Number.isSafeInteger(f.gold)) return null;
    const smith = f.temper && Number.isSafeInteger(f.temper.gold) ? f.temper : null;
    return { text: smith ? t('coach.goal_temper', { piece: smith.piece, gold: gp(smith.gold) }) : t('coach.purse_goal') };
  },
  home: (f) => {
    const deed = f.home && f.home.next;
    if (!deed || !Array.isArray(deed.items) || deed.items.some((x) => !name(x.id))) return null;
    /* the first material still short, with its count; all in the bag: the House's Buy */
    const need = deed.items.map((x) => ({ ...x, have: (f.bag && f.bag[x.id]) || 0 })).find((x) => x.have < x.qty);
    if (!need) return { text: t('coach.home_buy', { deed: deed.name }) };
    /* A GATHERED MATERIAL IS A JOB WITH A COUNT (plan L08): the card rings its node's Start in Gathering and crafting with the count
       still short set on the row (windows/work.js reads ring.count), and the job ends there with the hero waiting in town. */
    const node = gatherNodeFor(need.id);
    const n = need.qty - need.have;
    if (node) return { text: t('coach.home_job', { verb: node.verb, n, item: name(need.id) }), anchor: 'crafting', ring: { skill: node.skill, work: node.id, count: n } };
    return { text: t('coach.home_gather', { item: name(need.id), have: need.have, qty: need.qty }) };
  },
});

/* The lowest gathering node that yields `item` ({ id, skill, verb }), or null: the one a new hero can work first. */
/** @type {ReadonlyArray<[string, ReadonlyArray<{ id: string, prod: string, req?: number }>, string]>} */
const GATHER_ROWS = Object.freeze([['woodcutting', TREES, 'Chop'], ['mining', ROCKS, 'Mine'], ['fishing', FISH_SPOTS, 'Catch']]);
function gatherNodeFor(item) {
  let best = null;
  for (const [skill, rows, verb] of GATHER_ROWS) {
    for (const r of rows) if (r.prod === item && (!best || (r.req || 1) < best.req)) best = { id: r.id, skill, verb, req: r.req || 1 };
  }
  return best;
}

/* The card as stated from the facts ({ text, barSlot?, store?, other? }), or null when it cannot be stated truly. */
function stated(card, facts) {
  if (SAY[card.id]) return SAY[card.id](facts);
  return { text: card.text };
}

/**
 * The card as the player reads it: its words stated from the facts (SAY; else its text with each {slot:<item>} written
 * as the server's slot: "slot 4", 1-based, or "the Salted Shrimp slot" when no slot holds it), `barSlot` (the 0-based
 * bar slot its ring is on, or null), `goal` (the HP % its words ask the slot to reach, or null), `textIn` (its words inside its window) and `hooks` (the ring hooks it needs that
 * the client does not carry yet, their tokens written). `facts`: the tutorial facts. Pure; null for no card, or one
 * that cannot be stated truly.
 */
export function cardFor(card, facts) {
  if (!card) return null;
  const f = facts || {};
  const said = stated(card, f);
  if (!said) return null;
  const at = (id) => (Array.isArray(f.slots) ? f.slots.findIndex((a) => !!a && a.type === 'consume' && a.id === id) : -1);
  /* {slot:<item>} becomes the server's slot, in the card's words and its words inside the window alike */
  const slotted = (w) => w.replace(SLOT_TOKEN, (m, id) => (at(id) >= 0 ? 'slot ' + (at(id) + 1) : 'the ' + (name(id) || id) + ' slot'));
  const text = said.text;
  const item = card.ring && card.ring.item;
  const barSlot = Number.isInteger(said.barSlot) ? said.barSlot : item && at(item) >= 0 ? at(item) : null;
  const hooks = (card.hooks || []).map((h) => h.replace('{store}', said.store || '').replace('{other}', said.other === undefined ? '' : String(said.other))
    .replace('{slot}', barSlot === null ? '' : String(barSlot)).replace('{fuel}', said.fuel || '').replace('{spell}', said.spell || '').replace('{shot}', said.shot || ''));
  const textIn = said.textIn || card.inWindow || null;
  /* `said.anchor`: the words moved on to another surface (Klappa's Klub: from the bench to the bag), so the ring goes with them */
  return Object.freeze({ ...card, ...(said.title ? { title: said.title } : {}), ...(said.anchor ? { anchor: said.anchor } : {}), ...(said.ring ? { ring: Object.freeze(said.ring) } : {}), text: slotted(text), barSlot, goal: Number.isFinite(said.goal) ? said.goal : null, textIn: textIn && slotted(textIn), hooks: Object.freeze(hooks) });
}

/* ── AFTER THE GUIDE: WHAT NEXT ───────────────────────────────────────────
   The fresh-hero play (designer 2026-10-22): at Level 12, 2.5 h in, the last card
   was gone and nothing on screen said what to aim at. Once currentCard is null the
   pointer shows ONE goal line, read from the same server facts plus the hero's role
   and skills: the next hunting ground by Level (a hunt-grounds.js row, so a new
   ground shows up here with no edit), the next GEAR by Level (every piece is worn by
   the hero's Level, Tyler 2026-10-24: skill-unlocks.js nextUnlock(LEVEL_REQ), only
   pieces a player can get, only the ones the role wears), and the next supply the
   weapon's skill opens (the Character window's own "Next at level" line). Display only. */

/* The skill the role's weapon trains (Tyler 2026-10-14: classless Melee / Ranged / Magic). */
export const ROLE_SKILL = Object.freeze({ tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' });

/**
 * Would a hero of `role` wear `id`? For the coach's NAMING only, never a gate (any hero wears any piece, Tyler
 * 2026-10-14): a weapon the role plays (hunt-roles.js: its role key, or its shield arm's: a sword is the tank's too),
 * a shield for the tank, a spellbook for its discipline's role, and armor or jewelry that costs the role's own style
 * nothing (no negative accuracy or damage field for it, src/core/member.js deriveProfile: plate costs a caster and a
 * Ranger accuracy, cloth a Melee).
 */
export function wornByRole(id, role) {
  const it = ITEMS[id];
  const skill = ROLE_SKILL[role];
  if (!it || !it.slot || !skill) return false;
  const plays = (k) => [k, SHIELD_ARM[k]].some((x) => x && (WEAPON_ROLES[x] || []).includes(role));
  if (it.slot === 'weapon') return plays(roleWeaponOf(it));
  if (isShield(it)) return role === 'tank';
  if (it.slot === 'shield' && it.discipline) return plays(roleWeaponOf({ weaponType: 'magic', discipline: it.discipline }));
  const p = deriveProfile(skill === 'melee' ? 'sword' : skill);
  return !(Number(it[p.accuracyBonusField]) < 0) && !(Number(it[p.strengthBonusField]) < 0);
}

/** The playable hunts (a ground row, not `staged`: built but not open is never a goal), lowest band floor first. */
const groundHunts = () => Array.from(new Set(Object.values(HUNT_GROUNDS).map((g) => g.hunt)))
  .filter((h) => HUNT_INDEX[h] && HUNT_INDEX[h].staged !== true).sort((a, b) => HUNT_INDEX[a].band[0] - HUNT_INDEX[b].band[0]);

/* "5 Turnip plots", one phrase per ready crop in crop order (gathering.js CROPS), the crop name as the noun's
   modifier so no crop name is ever pluralised by guesswork ("Potatos"). A crop this build does not know reads "crop". */
function readyWords(ready) {
  const order = Object.keys(CROPS);
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  const crops = Object.keys(ready).filter((c) => Number.isInteger(ready[c]) && ready[c] > 0)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  return {
    words: crops.map((c) => ready[c] + ' ' + (CROPS[c] ? CROPS[c].name : 'crop') + (ready[c] === 1 ? ' plot' : ' plots')),
    plots: crops.reduce((n, c) => n + ready[c], 0),
    ids: crops.flatMap((c) => [c, String(ready[c])]),
  };
}

/* WHAT TO WANT, HOURS 5 TO 20 (panel 2026-11-01: 16-22k gold and "nothing to want"; designer's ruling, PRIORITY_BOARD 2026-11-01): the purse's
   next buy on the What next line, at the server's price. Below this share of the next hero's price, it is too far off to be a goal and the house's deeds speak instead.
   A HALF (the ladder at 400,000 / 1,500,000 / 4,000,000 since Tyler 2026-11-20, one slot to start; no fifth slot since 2026-11-07): the second speaks from
   200,000 gp, the third from 750,000 gp and the fourth from 2,000,000 gp (the purse is the account's; the price is always the server's offer). */
const SAVING_FROM = 0.5;
const ORDINAL = Object.freeze(['', 'first', 'second', 'third', 'fourth', 'fifth']);
const gp = (n) => n.toLocaleString('en-US') + ' gp';
/* The hero slot on offer at the server's price, with the purse beside it, or null. No offer while a slot stands empty: that hero is free (freeHeroLine). */
function heroOffer(f) {
  const purse = Number.isSafeInteger(f.gold) ? f.gold : null;
  const slot = Number.isSafeInteger(f.slotCost) && f.slotCost > 0 ? f.slotCost : null;
  const nth = ORDINAL[(Number(f.slotsOwned) || 0) + 1];
  return purse !== null && slot && nth && !emptySlot(f) ? { purse, slot, nth } : null;
}
/* A slot the player owns and has no hero in: how many heroes there are, or null (none empty, or the shell doesn't know). */
function emptySlot(f) {
  const heroes = Array.isArray(f.roster) ? f.roster.length : null;
  return heroes !== null && Number.isInteger(f.slotsOwned) && f.slotsOwned > heroes ? heroes : null;
}
/* THE RECRUITS (Tyler RD-Q6 a, 1053-recruits.sql): once the server's recruit press is ready, the rest of the company is the best thing on the
   line, doubling what the account earns for no gold. An empty slot alone says nothing: a hero is never made there by hand. */
function freeHeroLine(f) {
  const r = f.recruits;
  return r && r.ready === true && Number.isInteger(r.count) && r.count > 0 ? t('coach.goal_recruits', { count: r.count }) : null;
}
/* The house's next deed the purse covers, its materials said. Gold's first job is the next hero (lane/c-gold-matters): a deed speaks when no hero is on offer, or the hero is too far off to save for. */
function deedLine(f, offer) {
  const purse = Number.isSafeInteger(f.gold) ? f.gold : null;
  if (purse === null || (offer && purse >= offer.slot * SAVING_FROM)) return null;
  const deed = f.home && f.home.next && Array.isArray(f.home.next.items) && !f.home.next.items.some((x) => !name(x.id)) ? f.home.next : null;
  return deed && purse >= deed.gold ? t('coach.goal_deed', { deed: deed.name }) : null;
}
/* THE SMITH'S FIRST RUNG (Tempering, src/data/temper.js): named once a hero has twice its price in hand, so it never eats the food money, and only on a ladder this hero has not begun: after that it knows the way. */
function temperLine(f) {
  const r = f.temper;
  if (!r || !Number.isSafeInteger(r.gold) || !Number.isSafeInteger(f.gold) || f.gold < r.gold * 2) return null;
  return t('coach.goal_temper', { piece: r.piece, gold: gp(r.gold) });
}
/* OUT OF STAMINA WITH GOLD IN HAND: a bought hunting block (time-blocks.js: 2 h, two a day), named at the moment it can be used, at the server's quote. Priced in hours of
   the hero's wage (src/core/wage.js), the day's first costs about twice what its hours earn, so it is named only to a hero whose purse holds it. Nearly out: under half an hour. */
const TOP_UP_UNDER_MS = 1800000;
function topUpLine(f) {
  const q = f.refill;
  if (!q || q.available !== true || !Number.isSafeInteger(q.price) || !Number.isSafeInteger(q.blockMs) || !Number.isFinite(f.staminaMs) || f.staminaMs >= TOP_UP_UNDER_MS) return null;
  if (!Number.isSafeInteger(f.gold) || f.gold < q.price) return null;
  return t('coach.goal_top_up', { hours: Math.round(q.blockMs / 3600000), gold: gp(q.price) });
}

/* How a hero who hunts alone makes a party (the go_below card's lesson, said on the What next line instead). */
const PARTY_HOW = t('coach.goal_party_how');
/* A hero with another hero of its own already needs only the press. */
const PARTY_HOW_OWN = t('coach.goal_party_how_own');
const partyHow = (f) => (Array.isArray(f.roster) && f.roster.length > 1 ? PARTY_HOW_OWN : PARTY_HOW);
/* A ground built for a party: a pocket of it is built for one (hunt-grounds.js forParty). */
const partyGround = (hunt) => Object.values(HUNT_GROUNDS).some((g) => g.hunt === hunt && g.pockets.some((p) => (p.forParty || 1) > 1));

/* THE NEXT STEP UP (Tyler 2026-11-04: "if someone wants to try and 'rush' exp then they should be able to try harder content to get there faster, but it comes with risk"; played 11-04: a Level 12 in
   Bronze earned 55,106 Level XP/h in the Glade at +3,042 g/h, while the list's "Fits your level" stood on Wickstead's 28,388 at +3,017 g/h). The lowest floor above the hero's Level, and at most this far
   above it: past that it is a dare for a player to find, never advice. From the Thicket's Level on: the first hour keeps its lessons. Words only: nothing is refused or allowed by it. Pure.
   `rows`: [{ hunt, band, groupFit }]. `alone`: on a tie of floors, a ground not built for a party; a party, the one it is measured to earn the most on
   (party-class-xp.js partyBestLine, as the Hunts window's own party advice breaks the tie: lane/a-party-coach-card retired the workbook's 'solo' tag). */
const STEP_UP = Object.freeze({ fromLevel: HUNT_INDEX.meadowbrook_thicket.band[0], mostUnder: 15 });
const partyLineOf = (hunt) => { const g = Object.values(HUNT_GROUNDS).find((x) => x.hunt === hunt); const v = g ? partyBestLine(g.id, PARTY.maxSize) : null; return Number.isInteger(v) ? v : -1000; };
export function nextStepUp(rows, level, alone = true) {
  if (!Number.isInteger(level) || level < STEP_UP.fromLevel) return null;
  const above = (rows || []).filter((r) => r.band[0] > level && r.band[0] - level <= STEP_UP.mostUnder);
  if (!above.length) return null;
  const floor = Math.min(...above.map((r) => r.band[0]));
  const here = above.filter((r) => r.band[0] === floor);
  if (!alone) return here.slice().sort((x, y) => partyLineOf(y.hunt) - partyLineOf(x.hunt))[0];
  return here.find((r) => r.groupFit !== 'party') || here[0];
}
/* "Iron Sword (sword), Ironbound Shield (shield) and 2 more" (skill-unlocks.js nextUnlock's list) as a card line says it: the first name, the rest
   counted ("Iron Sword and 3 more"). A card is one short line (Tyler 2026-11-16); the item's own page says what each is. */
function firstNamed(list) {
  const more = / and (\d+) more$/.exec(list);
  const names = list.slice(0, more ? more.index : list.length).split(', ').map((x) => x.replace(/ \([^)]*\)$/, ''));
  const rest = names.length - 1 + (more ? Number(more[1]) : 0);
  return { first: names[0], words: rest ? names[0] + ' and ' + rest + ' more' : names[0] };
}
/* The ground's advice row as the Hunts list reads it. */
const adviceRow = (hunt) => ({ hunt, band: HUNT_INDEX[hunt].band, groupFit: partyGround(hunt) ? 'party' : (Object.values(HUNT_GROUNDS).find((g) => g.hunt === hunt) || {}).groupFit });

/* { piece, skill } for the gear piece worn at Level `lv` named `first` when a bench makes it and the role wears it ("Houndskin Cloak, made in
   Crafting": a made piece no line said how to get was a goal with no way, lane/b-first-hour), or null. */
function madeWords(lv, first, role) {
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
    for (const r of list || []) {
      const it = r.output ? ITEMS[r.output] : null;
      if (!it || it.reqSkill !== LEVEL_REQ || it.reqLv !== lv || it.n !== first || (role && !wornByRole(r.output, role))) continue;
      const ins = Object.entries(r.inputs || (r.input ? { [r.input]: 1 } : {}));
      if (!ins.length || !SKILLS_DEF[skill] || ins.some(([id]) => !name(id))) continue;
      return { piece: it.n, skill: SKILLS_DEF[skill].name, req: r.req || 1 };
    }
  }
  return null;
}

/**
 * WHAT NEXT IS ONE GOAL (played 2026-11-04, Level 17, about 41k: eight sentences, the Farm first, the third hero not named at all; blind 20-hour panel: "What next is a five-sentence paragraph"):
 * every goal that holds, in order of what is worth doing first, the first of them the card's words and the rest behind its More. The order: what is wrong now (no armor), a hero already paid for, a
 * hero the purse can pay, stamina the purse can buy, the next step up, a harvest, Tamsin's next hour, then what takes waiting: a deed, the saving, a party, the gear, the ground, the land, the skill.
 * Or null (nothing left to name). `facts`: { charLevel, role, skillLevel, defenseXp, land, inParty, gold, slotCost, slotsOwned, home, roster, visited, staminaMs, refill, tally, recruits } (recruits: the server's recruit press, { ready, count, level } or null; skillLevel: the
 * role's skill's level, or null when unknown; defenseXp: the server's Defense XP, or null when unknown; land: the account's field, { planted: plots holding a crop, ready: { crop: ready plots } },
 * or null when the server has not sent it; inParty: the hero sits in a party of 2+; roster: the account's heroes; visited: a Set of the grounds this hero has hunted; refill: the server's next
 * stamina quote; tally: { held }; training: the running training session, { skill, level, hoursToNext } from the server's
 * training section, or null; partyGround: the hunt the Hunts window's party advice picks at this Level, or null). Answers { id, title, text, also }; the id names every goal, so it changes whenever a goal comes or goes (the hunt top bar redraws on a new id, and a number
 * changing inside a goal follows in place: launcher.js sameCardWords).
 */
export function nextGoal(facts) {
  if (!facts || !Number.isInteger(facts.charLevel)) return null;
  const lines = [];
  const ids = ['goal'];
  const visited = (h) => facts.visited instanceof Set && facts.visited.has(h);
  /* A TRAINING SESSION RUNNING (the server's `training` section: its run's skill, and that skill's quote): the goal is the skill it trains,
     never the armour line (a Melee session read "Your Defense isn't training", lane/a-training-leftovers; a Defense session at the yard
     trains Defense with no armour on). Its time to the next level is the server's. */
  const train = facts.training && SKILLS_DEF[facts.training.skill] ? facts.training : null;
  if (train) {
    if (Number.isInteger(train.level) && Number.isInteger(train.hoursToNext)) {
      lines.push(t('training.coach_next', { hours: t('training.time_hours', { count: Math.max(1, train.hoursToNext) }), skill: SKILLS_DEF[train.skill].name, level: train.level + 1 }));
      ids.push('training', train.skill);
    }
  /* Defense at 0 XP means no armour worn (Tyler 2026-10-18: it trains only in armour). The fresh-hero play hit 117
     kills like that; the Shop's gloves and belts are the cheapest armour (designer 2026-10-22, the outfitter). */
  } else if (facts.defenseXp === 0) {
    lines.push(t('coach.goal_armor'));
    ids.push('armour');
  }
  const free = freeHeroLine(facts);
  if (free) { lines.push(free); ids.push('recruits'); }
  const offer = heroOffer(facts);
  if (offer && offer.purse >= offer.slot) {
    lines.push(t('coach.goal_slot', { nth: offer.nth, gold: gp(offer.slot) }));
    ids.push('slot', String(offer.slot));
  }
  const topUp = topUpLine(facts);
  if (topUp) { lines.push(topUp); ids.push('top_up'); }
  /* THE NEXT STEP UP: until this hero has been there. The page's warning and its one confirm say the rest (Tyler 2026-11-04). */
  const solo = facts.inParty !== true;
  const step = nextStepUp(groundHunts().map(adviceRow), facts.charLevel, solo);
  if (step && !visited(step.hunt)) {
    lines.push(t('coach.goal_step_up', { ground: HUNT_INDEX[step.hunt].name, level: step.band[0] }));
    ids.push('step', step.hunt);
  }
  /* The land is the ACCOUNT's (2026-12-14-shared-farm), so the line reads the field, never this hero's Farming XP
     (v0.2.35 gate: a 0-XP hero was told "nothing grows" over 5 ready turnips the others planted). Empty land asks
     for a seed (P1 2026-10-22: farming sat at zero; the kit holds 8 turnip seeds) until any hero plants; ready
     crops ask for the harvest (any hero may take it) until they are taken; a field that is only growing says nothing. */
  const land = facts.land;
  if (land && land.ready) {
    const ready = readyWords(land.ready);
    if (ready.words.length) {
      lines.push(t('coach.goal_harvest', { crops: listed(ready.words) }));
      ids.push('harvest', ...ready.ids);
    }
  }
  /* AN HOUR'S GOAL WITH A PRESS (played 11-04: 28 hours and no task after the wolves): nothing held, and she pays for the grounds this hero walks. */
  if (facts.tally && facts.tally.held === 0) {
    lines.push(t('coach.goal_tally'));
    ids.push('tally');
  }
  const deed = deedLine(facts, offer);
  if (deed) { lines.push(deed); ids.push('deed', String(facts.home.next.gold)); }
  const smith = temperLine(facts);
  if (smith) { lines.push(smith); ids.push('temper', String(facts.temper.gold)); }
  if (offer && offer.purse < offer.slot && offer.purse >= offer.slot * SAVING_FROM) {
    lines.push(t('coach.goal_saving', { nth: offer.nth, gold: gp(offer.slot) }));
    ids.push('saving', String(offer.slot));
  }
  /* THE PARTY PITCH (designer playtest 2026-10-24): the solo chain ends here, not behind a party card, so a hero with
     no party hears of the party ground its Level fits, and how to make a party: once, on whichever line names it. The ground is the one the
     Hunts window's party advice picks (facts.partyGround, the shell's src/shell/hunt-list.js partyGroundFor; lane/a-party-coach-card: the Rat
     King's hall named the Sewer to a lone hero at 16-25, where a party is sent to the Glade); none when no ground a party suits holds the Level. */
  const fits = solo && typeof facts.partyGround === 'string' && Object.hasOwn(HUNT_INDEX, facts.partyGround) ? facts.partyGround : null;
  if (fits) {
    lines.push(t('coach.goal_party', { ground: HUNT_INDEX[fits].name }));
    ids.push('party', fits);
  }
  /* THE NEXT GEAR, BY LEVEL (Tyler 2026-10-24): the lowest Level above the hero's that opens a piece a player can get
     (skill-unlocks.js: reachable only) and the role wears; with no role from the server yet, every such piece. */
  const role = ROLE_SKILL[facts.role] ? facts.role : null;
  const gear = nextUnlock(LEVEL_REQ, facts.charLevel, role ? (id) => wornByRole(id, role) : null);
  const gat = /^Next at level (\d+): /.exec(gear);
  if (gat) {
    /* A piece that line names and a bench makes: where and from what (the Graypelt Cloak, lane/b-first-hour: a made
       piece no line said how to get was a goal with no way). The first such piece only. */
    const named = firstNamed(gear.slice(gat[0].length));
    const made = madeWords(Number(gat[1]), named.first, role);
    /* a bench rung above 1 says its level (lane/b-core-loop-20h, played: a Level 12 tank read the shield's recipe with Smithing 1 and no word that the bench wants 15) */
    const madeKey = made ? (made.req > 1 ? 'coach.goal_gear_made_at' : 'coach.goal_gear_made') : 'coach.goal_gear';
    lines.push(t(madeKey, { level: gat[1], gear: made ? named.first : named.words, ...(made ? { skill: made.skill } : {}), ...(made && made.req > 1 ? { req: made.req } : {}) }));
    ids.push('gear', gat[1]);
  }
  /* The ground ahead that nothing above has named and this hero has not walked. */
  const next = groundHunts().find((h) => HUNT_INDEX[h].band[0] > facts.charLevel && !visited(h) && !(step && step.hunt === h));
  if (next) {
    const party = partyGround(next);
    /* The floor is a warning, not a lock (Tyler 2026-10-18), so the line names the Level it is built for. */
    lines.push(t(party ? 'coach.goal_ground_party' : 'coach.goal_ground', { ground: HUNT_INDEX[next].name, level: HUNT_INDEX[next].band[0] }));
    if (party && solo && !fits) lines.push(partyHow(facts));
    ids.push(next, String(HUNT_INDEX[next].band[0]), ...(party && solo && !fits ? ['solo'] : []));
  }
  if (land && land.planted === 0) {
    lines.push(t('coach.goal_plant'));
    ids.push('farm');
  }
  const skill = ROLE_SKILL[facts.role];
  if (skill && Number.isInteger(facts.skillLevel)) {
    const u = nextUnlock(skill, facts.skillLevel);
    const at = /^Next at level (\d+): /.exec(u);
    if (at) {
      lines.push(t('coach.goal_skill', { skill: SKILLS_DEF[skill].name, level: at[1], unlock: firstNamed(u.slice(at[0].length)).words }));
      ids.push(skill, at[1]);
    }
  }
  return lines.length ? { id: ids.join('_'), title: 'What next', text: lines[0], also: lines.slice(1) } : null;
}
