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
//                card shows without them. Tokens: {store} (the store rune B5 names), {slot} (the card's bar slot)
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
//     text       may name a bar slot as {slot:<item id>}: cardFor() writes the server's slot there; a card with
//                a word builder (SAY) is stated from the facts, and one that cannot be stated truly is passed by
//     done       a fact kind (FACTS), or { kind: 'any', of: [...] }
//
// FACTS (src/session/tutorial-sections.js tutorialFactsOf; a field the server has not sent is null or absent):
//   levelXp, charLevel, skillLevel, skillXp { skill: xp }, huntId (the open hunt), visited (Set of hunts the
//   server has seen this hero in), unitKinds, inParty, partied (a party personal best on any ground), self (slot),
//   name, slots (the bar the server SHOWS: [{ type, id, store, conditions, enabled, usable, count } | null]),
//   stored (the bar it STORED: [{ type, id, conditions } | null]), discipline, role, stance, store (the server's
//   store rows), carried { item: n } (the hunt bag in a hunt, else the bag), bag { item: n }, stacks, bagCap,
//   bankStacks, lootRules { item: keep|sell|ignore }, weapon (worn), blessings { held, of, freeUntil, prices },
//   endReason (the latest hunt's, once ended), death { xp, saved } (the newest death_log row), supplies [{ item,
//   source, count }] (this hunt's analyzer), huntMs, hpMax, presets (saved setups), landPlanted, land { ready },
//   home { owned, next }, gold, staminaMs, tally { held, paid, weight }, and from the SHELL (the lane 1 / lane 2
//   interface, src/session/tutorial-sections.js pointerCardOf's second argument): read (Set of read card ids),
//   roster [{ slot, level, name, open, hunting }], slotsOwned, playLimit, sellable (stacks Sell all loot sells
//   now), upgrades ([item] Equip upgrades would put on).
//
// No number is restated here: floors are read from hunts.js, pockets from hunt-grounds.js, the turnip's hours from
// gathering.js, Tamsin's task from tally-tasks.js, prices from the server's store rows, Blessings from the server's
// section, the stances from rule-subjects.js. validate() proves every name a card uses is real; the walk-through
// (every step doable from the steps before it plus the start kit, the bar cards against the real default bar) is
// tests/hunt-core/sewer.mjs `tutorial-walk-through`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_INDEX } from './hunts.js?v=0.2.46';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.46';
import { END_ORDER, DEATH_XP_LOSS, STAMINA_LOW_MIN } from './hunt-sessions.js?v=0.2.46';
import { nextUnlock } from './skill-unlocks.js?v=0.2.46';
import { SKILLS_DEF } from './skills.js?v=0.2.46';
import { CROPS, TREES, ROCKS } from './gathering.js?v=0.2.46';
import { tallyTask } from './tally-tasks.js?v=0.2.46';
import { ITEMS } from './items.js?v=0.2.46';
import { BASIC_INDEX } from './supply-basics.js?v=0.2.46';
import { LEVEL_REQ } from './gear-tiers.js?v=0.2.46';
import { roleWeaponOf, WEAPON_ROLES, SHIELD_ARM } from './hunt-roles.js?v=0.2.46';
import { isShield } from './shields.js?v=0.2.46';
import { deriveProfile } from '../core/member.js?v=0.2.46';
import { ABILITIES } from './abilities.js?v=0.2.46';
import { CONSUMABLES } from './consumables.js?v=0.2.46';
import { RUNE_FAMILIES, runeId } from './runes.js?v=0.2.46';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.46';
import { HUNT_STANCES, ROLE_DEFAULTS } from './rule-subjects.js?v=0.2.46';
import { START_EQUIPMENT, START_BAR } from './start-kit.js?v=0.2.46';

/* The surfaces a card may point at: `window` the shell window (src/data/shell-windows.js) its controls live in (the
   card shows INSIDE it while it is open), `icon` its way starts at that window's icon, and what the coach rings
   (src/shell/launcher.js ringPlan). */
const anchor = (about, window, icon, tab) => Object.freeze({ about, window: window || null, icon: !!icon, tab: tab || null });
export const TUTORIAL_ANCHORS = Object.freeze({
  hunt_picker: anchor('Hunts (src/shell/windows/hunts.js): its icon, then the ground\'s line, then Enter', 'hunts', true),
  world: anchor('the world pane (src/app/world-pane.js): nothing to ring'),
  hud_vitals: anchor('the bottom bar\'s Level, HP and stamina (action-bar.js): its hooks'),
  hunt_topbar: anchor('Leave hunt (HUNT_SCREEN_SPEC §1.4 hunt-topbar.js)'),
  action_bar: anchor('the bar slot the card names (src/shell/widgets/action-bar.js), then Configure action\'s Save; shown in town too', 'configure-action'),
  farm: anchor('the Farm (src/shell/windows/farm.js): its icon, an empty plot\'s Plant, then ring.crop\'s Plant', 'farm', true),
  crafting: anchor('Gathering and crafting (src/shell/windows/work.js): its icon, ring.skill, then ring.work\'s Start', 'skills-trade', true),
  tally: anchor('Tamsin\'s tally (src/shell/windows/tally.js): her icon, the armor weight, then ring.task\'s Take', 'tally', true),
  inventory: anchor('the bag (src/shell/windows/inventory): its icon, then the control the card names', 'inventory', true),
  shop: anchor('the Shop (src/shell/windows/shop.js): its icon, the Sell tab, then Sell all loot', 'shop', true),
  /* Services is the Shop's third tab (Tyler 2026-10-25): the Shop's icon, its Services tab, then the next Bless */
  services: anchor('the Shop\'s Services tab (src/shell/windows/services.js): the Shop\'s icon, the Services tab, then the control', 'shop', true, 'services'),
  storage: anchor('Storage (src/shell/windows/storage.js): its icon', 'storage', true),
  hunt_prep: anchor('Hunt prep (src/shell/windows/hunt-prep.js): the bar\'s setup corner, then Save current setup', 'hunt-prep', true),
  house: anchor('the House (src/shell/windows/house.js): its icon, then Buy', 'house', true),
  characters: anchor('the character strip\'s Characters button, then Create hero on the characters screen', 'characters'),
  strip: anchor('the character strip (src/app/character-strip.js): another hero\'s tab'),
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

const MORE = ['ring', 'when', 'hooks', 'inWindow', 'party', 'reactive', 'knowledge', 'gotIt', 'dayOne'];
const freeze = (v) => (Array.isArray(v) ? Object.freeze(v.map(freeze)) : v && typeof v === 'object' ? Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freeze(x)]))) : v);
const step = (id, title, text, anchor, done, more) => Object.freeze({ id, title, text, anchor, done: freeze(done),
  ...Object.fromEntries(MORE.filter((k) => more && more[k] !== undefined).map((k) => [k, freeze(more[k])])) });

/* The task Tamsin's card names: a solo task on the solo ground (tally-tasks.js). */
const WOLVES = tallyTask('thicket_gray_wolves');
const CELLAR = 'mill_cellar', THICKET = 'meadowbrook_thicket';
/* A second hero skips the knowledge cards once another hero on the account is past this Level (the designer's rule:
   it has lived through the first hour; the cards that set THIS hero's own state still show). */
export const KNOWN_LEVEL = 5;
/* How long into a hunt past the Cellar the "more than one hero" card waits (the designer's 5 minutes). */
const MORE_HEROES_MS = 5 * 60000;
/* "Taking a beating?" comes once the hero has eaten this many times in one hunt. */
const BEATING_EATS = 3;
/* The bag counts as nearly full at this share of its stacks (the designer's 80 of 100). */
const BAG_NEAR_FULL = 0.8;
/* The Level the house and own-rune cards wait for (the designer's day-one plan: past the Thicket's first half hour). */
const DAY_ONE_LEVEL = 8;
/* Eat on time: Configure action's − and + move an HP condition in 5% steps (configure-action.js nudge), and the card
   never asks a hero to eat below the designer's 50%. */
const PCT_STEP = 5, EAT_FLOOR_PCT = 50;
const IN_TOWN = { kind: 'in_town' }, HUNTING = { kind: 'hunting' };
const READ = { kind: 'read' };
/* The Shop's Services tab and its next Bless (the shell rings the deepest one on screen first) */
const SERVICES_TAB = '[data-hs-win="shop"] .hw-tab[data-tab="services"]';
const TO_BLESS = [SERVICES_TAB, '[data-hs-win="shop"] [data-hs-act="bless"]:not([disabled])'];

export const HUNT_TUTORIAL = Object.freeze([
  /* ── A. Before the first pull ───────────────────────────────────────── */
  step('to_the_cellar', 'Rats in the mill',
    'The miller has rats in his grain. Open Hunts and enter the Mill Cellar.',
    'hunt_picker', { kind: 'enter', hunt: CELLAR },
    { inWindow: 'Press Enter on the Mill Cellar. Your hero walks in and fights on its own.' }),
  /* ── B. The first hunt: the cards the server finishes on its own come first (AUTO_KINDS) ── */
  step('first_kill', 'Your hero fights alone',
    'You don\'t click to attack. Your hero walks to the rats, swings, and picks the next one.',
    'world', { kind: 'kills', atLeast: 1 }, { knowledge: true }),
  step('first_level', 'Level 2',
    'Every kill pays Level XP. Each Level gives you more health and mana and opens new grounds and gear.',
    'hud_vitals', { kind: 'level' }, { knowledge: true, hooks: ['[data-coach-hook="level"]'] }),
  /* ── Reactive cards that interrupt the chain (after the first-minute cards, so the shell's "passed" rule never
     replays one of those). Each starts on its own fact and explains what just happened. ── */
  step('stamina_low', 'Stamina is low',
    'At 0 the hunt ends. Anything but hunting refills it hour for hour, and the + beside your stamina buys a top-up.',
    'hud_vitals', READ, { reactive: true, when: [HUNTING, { kind: 'stamina_low' }], hooks: ['[data-coach-hook="stamina-buy"]'] }),
  step('first_death', 'You died',
    'The hunt ended and your hero came home. Blessings cut what a death costs, and they\'re free for now: open the Shop\'s Services tab and Bless again.',
    'services', { kind: 'blessed' }, { reactive: true, when: [IN_TOWN, { kind: 'died' }, { kind: 'below_free' }],
      inWindow: 'Press Services, then Bless on each Blessing while they\'re free.', hooks: TO_BLESS }),
  step('first_eat', 'Your hero just ate',
    'Your HP fell low, so a food slot ate for you.',
    'action_bar', READ, { reactive: true, when: [HUNTING, { kind: 'ate' }] }),
  step('first_drink', 'Your hero just drank',
    'Your moves cost mana, so a drink slot drank for you.',
    'action_bar', READ, { reactive: true, when: [HUNTING, { kind: 'drank' }] }),
  /* Tyler 2026-10-25: the stance, chase and distance sit ON the bar's right side, never behind the sliders popup. */
  step('fight_settings', 'Taking a beating?',
    'The stance on your bar changes how hard your hero hits and is hit: Defensive takes less damage and deals less.',
    'hud_vitals', { kind: 'any', of: [READ, { kind: 'stance_changed' }] },
    { reactive: true, knowledge: true, gotIt: true, when: [HUNTING, { kind: 'eaten_at_least', n: BEATING_EATS }], hooks: ['[data-coach-hook="stance"]'] }),
  step('more_heroes', 'More than one hero',
    'Your hero keeps hunting while you do something else. You can play more heroes at once: press Characters, then Create hero in your empty slot.',
    'characters', { kind: 'heroes', atLeast: 2 },
    { reactive: true, knowledge: true, when: [{ kind: 'hunt_age', min: MORE_HEROES_MS, past: CELLAR }, { kind: 'one_hero' }],
      hooks: ['.char-tool[data-app="characters"]', '.char-pick[data-app="create"]'] }),
  step('party_own', 'Hunt together',
    'Your heroes can share a hunt. Right-click (long-press on a phone) another hero\'s tab and choose Invite to party; your own heroes join at once.',
    'strip', { kind: 'partied' }, { reactive: true, when: [IN_TOWN, { kind: 'own_hero_in_town' }], hooks: ['.char-tab[data-slot="{other}"]'] }),
  step('equip_upgrades', 'Wear what you found',
    'You found gear that beats what you wear. Gear goes on in town: open your bag and press Equip upgrades.',
    'inventory', { kind: 'upgrades_none' }, { reactive: true, when: [IN_TOWN, { kind: 'upgrades' }],
      inWindow: 'Press Equip upgrades. You can swap any piece back from your bag.', hooks: ['[data-hs-win="inventory"] [data-hs-act="equip-upgrades"]'] }),
  step('storage', 'Room in your bag',
    'Your bag is nearly full. Storage holds more, and all your heroes share it.',
    'storage', { kind: 'any', of: [READ, { kind: 'stored_stack' }] }, { reactive: true, gotIt: true, when: [{ kind: 'bag_full' }] }),
  /* ── B. The first hunt, the bar while it fights ────────────────────── */
  /* In the cellar wait (designer 2026-10-24: dead minutes from minute 2 to Level 5); hr_farm_plant does not refuse a hunter. */
  step('plant_land', 'Plant your land',
    'While your hero hunts, open the Farm and plant a Turnip Seed in each empty plot. Turnips are ready in '
      + CROPS.turnip.hours + ' hours and cook into Turnip Juice, a drink.',
    'farm', { kind: 'planted' }, { ring: { crop: 'turnip' }, inWindow: 'Press Plant on an empty plot, then Plant on Turnip. Do it again for each empty plot.' }),
  step('bar_intro', 'Your action bar',
    'Your hero uses this bar by itself. It tries the slots in order and uses the first one that\'s ready and whose conditions are all true.',
    'action_bar', READ, { knowledge: true, gotIt: true }),
  step('spell_runes', 'Spells need runes',
    'A spell on your bar has a line through it: every cast needs a rune, and you carry none.',
    'action_bar', { kind: 'rune_ready' }, { when: [{ kind: 'rune_struck' }], hooks: ['[data-hs-win="configure-action"] .ca-rs[data-store="{store}"]'] }),
  step('food_when', 'Eat on time',
    'A food slot on your bar eats for you below an HP you set.',
    'action_bar', { kind: 'food_cond' }, { when: [{ kind: 'food_slot' }], hooks: ['[data-hs-win="configure-action"] .ca-cond[data-cond="0"] [data-x="dec"]'] }),
  step('food_order', 'Order matters',
    'A store food slot eats before your own food at some HP.',
    'action_bar', { kind: 'food_order' }, { when: [{ kind: 'food_order_bad' }], hooks: ['[data-hs-win="configure-action"] .ca-cond[data-cond="0"] [data-x="dec"]'] }),
  step('earn_the_thicket', 'Out to the brook',
    'Keep hunting here until Level ' + HUNT_INDEX[THICKET].band[0] + ', about a quarter of an hour into your first hunt; then '
      + HUNT_INDEX[THICKET].name + ' fits you. You can close the game: your hero keeps hunting until its stamina runs out, and what it earns waits for you.',
    'hud_vitals', { kind: 'unlock', hunt: THICKET }, { hooks: ['[data-coach-hook="stamina"]'] }),
  step('leave_cellar', 'Cash in',
    'Leave the hunt to go back to town. Your loot is already in your bag.',
    'hunt_topbar', { kind: 'ended', reason: 'left' }),
  /* ── C. The first return: sell or keep, cook, styles, Blessings before danger, Tamsin ── */
  step('sell_loot', 'Sell what only pays coin',
    'Open the Shop and press Sell. Sell all loot sells the parts that are only worth gold, and keeps your Bones (bury them for Prayer) and food you can cook. Point at anything to see what it\'s for.',
    'shop', { kind: 'any', of: [{ kind: 'loot_sold' }, { kind: 'been', hunt: THICKET }] },
    { when: [IN_TOWN, { kind: 'sellable' }], inWindow: 'Press Sell, then Sell all loot. It keeps your Bones (bury them for Prayer) and food you can cook.',
      hooks: ['[data-hs-win="shop"] .hw-tab[data-tab="sell"]', '[data-hs-win="shop"] [data-hs-act="sell-loot"]', '[data-hs-win="shop"] [data-coach-hook="sell-confirm"]'] }),
  step('loot_rules', 'Decide once',
    'Open your bag\'s This hunt tab and set each thing you don\'t need to Sell at the shop. From then on, Sell junk sells everything you marked in one press.',
    'inventory', { kind: 'any', of: [{ kind: 'loot_rule' }, { kind: 'been', hunt: THICKET }] },
    { knowledge: true, when: [IN_TOWN], inWindow: 'Press This hunt, then set each thing you don\'t need to Sell at the shop.',
      hooks: ['[data-hs-win="inventory"] .hw-tab[data-tab="hunt"]', '[data-hs-win="inventory"] [data-rule-item][data-coin]'] }),
  step('cook_catch', 'Cook your catch',
    'Open Gathering and crafting, press Cooking, then Start on Cook Shrimp. Your Raw Shrimp become the Cooked Shrimp your {slot:cooked_shrimp} eats.',
    'crafting', { kind: 'skill_xp', skill: 'cooking' }, { when: [IN_TOWN], ring: { skill: 'cooking', work: 'cook_shrimp' } }),
  step('styles', 'Every weapon is a style',
    'There\'s no class to pick: the weapon you hold decides how you fight.',
    'inventory', { kind: 'any', of: [READ, { kind: 'weapon_changed' }] },
    { knowledge: true, gotIt: true, when: [IN_TOWN], hooks: ['[data-hs-win="inventory"] .hw-slot[data-slot="weapon"]'] }),
  step('bless', 'Before the wolves',
    'Out past the Cellar you can die. Blessings protect most of what a death costs, and they\'re free for now: open the Shop\'s Services tab and Bless all three.',
    'services', { kind: 'blessed' }, { when: [IN_TOWN, { kind: 'level_at', at: HUNT_INDEX[THICKET].band[0] }, { kind: 'below_free' }],
      inWindow: 'Press Services, then Bless on each of the three Blessings.', hooks: TO_BLESS }),
  step('tamsins_task', 'Tamsin\'s wolves',
    'Tamsin pays for kills. Open her tally, pick the armor weight she pays you in, then Take ' + WOLVES.count + ' ' + WOLVES.label
      + '. Every kill counts, even while you\'re away.',
    'tally', { kind: 'tally_taken', task: WOLVES.id }, { when: [IN_TOWN], ring: { task: WOLVES.id } }),
  step('into_the_thicket', 'Into the Thicket',
    'Open Hunts and pick ' + HUNT_INDEX[THICKET].name + '. Your hero walks from clearing to clearing by itself and fights each pack it finds.',
    'hunt_picker', { kind: 'enter', hunt: THICKET },
    { inWindow: 'Press Enter on ' + HUNT_INDEX[THICKET].name + '. Your hero walks from clearing to clearing by itself and fights each pack it finds.' }),
  /* ── D / E. The second hunt and the second return ─────────────────── */
  step('tamsin_pays', 'Paid in town',
    'Hunt the Thicket until your ' + WOLVES.count + ' ' + WOLVES.label + ' are down; the tally on screen counts. Tamsin pays as you come back to town: '
      + WOLVES.gold + ' gp and a piece of armor you can wear.',
    'world', { kind: 'tally_paid' }, { when: [{ kind: 'not_elsewhere', hunt: WOLVES.hunt }] }),
  step('go_below', 'Into the sewer, together',
    'The Sewer is a party hunt. Pick The Sewer and Start with party: everyone walks in together. The Rat King holds the last room and only comes out for a party.',
    'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),
  step('save_setup', 'Keep this bar',
    'A setup is your whole loadout, bar and gear. Open Hunt prep and press Save current setup, so you can come back to it after trying another style.',
    'hunt_prep', { kind: 'setup_saved' }, { when: [IN_TOWN, { kind: 'bar_saved' }, { kind: 'been', hunt: THICKET }],
      inWindow: 'Press Save current setup. Your bar and the gear you wear are kept under its name.',
      hooks: ['[data-hs-act="setups"]', '[data-hs-win="hunt-prep"] [data-coach-hook="setup-save"]'] }),
  /* ── F. Day one: each waits for the chain, then starts on its own fact ── */
  step('harvest_juice', 'Turnips are ready',
    'Harvest them on the Farm, then cook Turnip Juice: Gathering and crafting, Cooking.',
    'farm', { kind: 'juice_made' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'turnips' }] }),
  step('juice_slot', 'Drink your own juice',
    'Put your Turnip Juice in a drink slot before the store\'s juice: your own drinks cost nothing.',
    'action_bar', { kind: 'drink_slot', item: 'turnip_juice' }, { reactive: true, dayOne: true, when: [{ kind: 'carries', item: 'turnip_juice' }] }),
  step('home', 'Build your home',
    'Your first house needs gold, ore and logs: start with logs in Gathering and crafting, Woodcutting.',
    'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'home_unowned' }] }),
  step('own_runes', 'Make your own runes',
    'Mine Rune Essence, then cut it into Blank Runes and bind them in Runecrafting. Your own runes cast the full spell; the store\'s rune casts a weaker one.',
    'crafting', { kind: 'rune_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'rune_unowned' }] }),
  step('bless_paid', 'Blessings cost gold now',
    'From now on each Blessing costs gold. They still cut what a death takes.',
    'services', { kind: 'any', of: [{ kind: 'blessed' }, READ] }, { reactive: true, gotIt: true, when: [IN_TOWN, { kind: 'at_free' }, { kind: 'unblessed' }],
      hooks: TO_BLESS }),
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
/* The slot's first "my HP / my mana below N%" test (what Configure action's − and + move), or null. */
const below = (s, metric) => {
  const c = s && Array.isArray(s.conditions) ? s.conditions.find((x) => x && x.metric === metric && (x.op === 'lt' || x.op === 'lte') && Number.isFinite(x.value)) : null;
  return c ? c.value : null;
};
const hpBelow = (s) => below(s, 'self_hp_pct');
/* A spell slot the SERVER struck for its rune: on, of the worn weapon's discipline, active, needing a rune, and
   `usable: false` (hr_hunt_settings_view: no rune of it held and no store rune named on the slot). */
function struckSpell(f) {
  if (!Array.isArray(f.slots)) return -1;
  return f.slots.findIndex((s) => on(s) && s.type === 'ability' && s.usable === false && !!ABILITIES[s.id] && ABILITIES[s.id].active
    && !!ABILITIES[s.id].rune && (!f.discipline || ABILITIES[s.id].disciplines.includes(f.discipline)));
}
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
const heroesOn = (f) => (Array.isArray(f.roster) ? f.roster.filter((h) => h && Number.isInteger(h.slot)) : null);

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
/* Has the hero hunted `hunt`, or a ground PAST it (a higher band floor: the chain only moves forward,
   Cellar -> Thicket -> Sewer -> on)? `past` alone asks only for a ground past it. */
const reached = (facts, hunt, past) => been(facts).some((h) => (!past && h === hunt) || HUNT_INDEX[h].band[0] > HUNT_INDEX[hunt].band[0]);
/* A skill's XP as the server said it (a skill it did not list is 0), or null when it sent no skills. */
const xpIn = (facts, skill) => (facts.skillXp ? Number(facts.skillXp[skill]) || 0 : null);
const known = (v, fn) => (v === null || v === undefined ? null : fn(v));

/* ── THE FACT KINDS: (params, facts, { openedIn, id }) -> true | false | null (the server has not said). In a card's
   `when` null is "not met" (a trigger the coach cannot see does not fire); in its `done` null is "done" (the coach
   never asks for something it cannot see happen). ── */
const FACTS = Object.freeze({
  /* where the hero is and has been */
  hunting: (p, f) => !!f.huntId,
  in_town: (p, f) => !f.huntId,
  enter: (p, f) => reached(f, p.hunt) || (p.hunt === CELLAR && f.levelXp > 0),
  been: (p, f) => reached(f, p.hunt),
  not_elsewhere: (p, f) => !f.huntId || f.huntId === p.hunt,
  /* out of that hunt now, or already hunting past it (back in it later is not a step back) */
  ended: (p, f, c) => f.huntId !== c.openedIn || (!!c.openedIn && reached(f, c.openedIn, true)),
  hunt_age: (p, f) => (!f.huntId || !HUNT_INDEX[f.huntId] || HUNT_INDEX[f.huntId].band[0] <= HUNT_INDEX[p.past].band[0] ? false : known(f.huntMs, (ms) => ms >= p.min)),
  pull: (p, f) => {
    const g = HUNT_GROUNDS[p.ground];
    return (f.huntId === g.hunt && pulledKinds(g, p.pocket).some((k) => f.unitKinds && f.unitKinds.has(k))) || reached(f, g.hunt, true);
  },
  /* Level and kills (Level XP comes from kills only, so > 0 means a kill landed) */
  kills: (p, f) => f.levelXp > 0,
  level: (p, f) => f.charLevel >= 2,
  level_at: (p, f) => f.charLevel >= p.at,
  unlock: (p, f) => f.charLevel >= HUNT_INDEX[p.hunt].band[0],
  /* town work, judged on facts that stay (Farming and Cooking XP; the shared land) */
  planted: (p, f) => (xpIn(f, 'farming') === null && f.landPlanted == null) || xpIn(f, 'farming') > 0 || f.landPlanted === true,
  skill_xp: (p, f) => known(xpIn(f, p.skill), (xp) => xp > 0),
  turnips: (p, f) => (f.land == null && f.bag == null ? null : !!(f.land && f.land.ready && f.land.ready.turnip > 0) || !!(f.bag && f.bag.turnip > 0)),
  juice_made: (p, f) => (f.bag == null ? null : f.bag.turnip_juice > 0 || FACTS.drink_slot({ item: 'turnip_juice' }, f) === true),
  home_unowned: (p, f) => known(f.home, (h) => !h.owned && !!h.next),
  home_owned: (p, f) => known(f.home, (h) => h.owned),
  /* Tamsin */
  tally_taken: (p, f) => { const t = f.tally; return !t || t.held > 0 || t.paid > 0 || (t.weight === true && reached(f, tallyTask(p.task).hunt)); },
  tally_paid: (p, f) => !f.tally || f.tally.paid > 0 || f.tally.held === 0,
  /* the bar: what the server shows, what it stored, what it struck */
  rune_struck: (p, f) => (Array.isArray(f.slots) ? struckSpell(f) >= 0 : null),
  rune_ready: (p, f) => (Array.isArray(f.slots) ? struckSpell(f) < 0 : null),
  food_slot: (p, f) => (Array.isArray(f.slots) ? f.slots.some((s) => on(s) && ownFood(s) && hpBelow(s) !== null) : null),
  /* the player SAVED an own food slot at an HP of their own: the stored bar, never the shown start bar, and never a
     whole-bar restatement of the kit's 60% (any Save restates every slot: "Tell your hero when" finished unseen) */
  food_cond: (p, f) => (Array.isArray(f.stored) ? f.stored.some((s) => ownFood(s) && hpBelow(s) !== null && hpBelow(s) !== START_FOOD_PCT) : null),
  food_order_bad: (p, f) => (Array.isArray(f.slots) ? storeFirst(f) !== null : null),
  food_order: (p, f) => (Array.isArray(f.slots) ? storeFirst(f) === null : null),
  bar_saved: (p, f) => (Array.isArray(f.stored) ? f.stored.some(Boolean) : null),
  drink_slot: (p, f) => (Array.isArray(f.stored) ? f.stored.some((s) => isDrink(s) && s.id === p.item) : null),
  carries: (p, f) => known(f.carried, (c) => c[p.item] > 0),
  rune_unowned: (p, f) => (Array.isArray(f.slots) && f.carried ? runeless(f) !== null : null),
  rune_owned: (p, f) => (Array.isArray(f.slots) && f.carried ? runeless(f) === null : null),
  stance_changed: (p, f) => (f.stance && ROLE_DEFAULTS[f.role] ? f.stance !== ROLE_DEFAULTS[f.role].stance : null),
  /* this hunt, as the analyzer counts it */
  ate: (p, f) => known(used(f, 'food', 'own'), (r) => r.length > 0),
  drank: (p, f) => known(used(f, 'drink'), (r) => r.length > 0),
  eaten_at_least: (p, f) => known(used(f, 'food'), (r) => sum(r) >= p.n),
  stamina_low: (p, f) => known(f.staminaMs, (ms) => ms <= STAMINA_LOW_MIN * 60000),
  /* the bag, loot and gear */
  sellable: (p, f) => known(f.sellable, (n) => n > 0),
  loot_sold: (p, f) => known(f.sellable, (n) => n === 0),
  loot_rule: (p, f) => known(f.lootRules, (r) => Object.values(r).includes('sell')),
  weapon_changed: (p, f) => known(f.weapon, (w) => w !== START_EQUIPMENT.weapon),
  upgrades: (p, f) => known(f.upgrades, (u) => u.length > 0),
  upgrades_none: (p, f) => known(f.upgrades, (u) => u.length === 0),
  bag_full: (p, f) => (f.stacks == null || !f.bagCap ? null : f.stacks >= Math.ceil(f.bagCap * BAG_NEAR_FULL)),
  stored_stack: (p, f) => known(f.bankStacks, (n) => n > 0),
  setup_saved: (p, f) => known(f.presets, (n) => n > 0),
  /* death and Blessings (the server's section: held, its free limit and its prices) */
  died: (p, f) => !f.huntId && f.endReason === 'died',
  blessed: (p, f) => known(f.blessings, (b) => b.held >= b.of),
  unblessed: (p, f) => known(f.blessings, (b) => b.held < b.of),
  below_free: (p, f) => known(f.blessings, (b) => Number.isInteger(b.freeUntil) && f.charLevel < b.freeUntil),
  at_free: (p, f) => known(f.blessings, (b) => Number.isInteger(b.freeUntil) && f.charLevel >= b.freeUntil),
  /* more than one hero (the account's roster, from the shell) */
  one_hero: (p, f) => known(heroesOn(f), (h) => h.length === 1 && Number.isInteger(f.slotsOwned) && f.slotsOwned > 1),
  heroes: (p, f) => known(heroesOn(f), (h) => h.length >= p.atLeast),
  own_hero_in_town: (p, f) => known(heroesOn(f), (h) => h.some((x) => x.slot !== f.self && x.open === true && x.hunting === false)),
  partied: (p, f) => f.inParty === true || f.partied === true,
  /* a press the shell recorded (Got it), or a reactive card on screen long enough to read */
  read: (p, f, c) => (f.read instanceof Set ? f.read.has(c.id) : null),
});
const PARAMS = Object.freeze({ enter: ['hunt'], been: ['hunt'], not_elsewhere: ['hunt'], unlock: ['hunt'], level_at: ['at'], skill_xp: ['skill'],
  tally_taken: ['task'], hunt_age: ['min', 'past'], pull: ['ground', 'pocket'], eaten_at_least: ['n'], heroes: ['atLeast'], drink_slot: ['item'],
  carries: ['item'], kills: ['atLeast'] });

/* One fact as true / false / null; `any` is true once one is, null when none is and one is unknown. */
function judge(d, f, c) {
  if (d.kind === 'any') {
    const got = d.of.map((x) => judge(x, f, c));
    return got.includes(true) ? true : got.includes(null) ? null : false;
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
    if (['enter', 'been', 'not_elsewhere', 'unlock'].includes(d.kind) && !HUNT_INDEX[d.hunt]) bad('hunt ' + d.hunt + ' is not in hunts.js');
    if (d.kind === 'hunt_age' && !HUNT_INDEX[d.past]) bad('hunt ' + d.past + ' is not in hunts.js');
    if (d.kind === 'kills' && d.atLeast !== 1) bad('kills: the server only tells the first kill (Level XP > 0), so atLeast must be 1');
    if (d.kind === 'ended' && !END_ORDER.includes(d.reason)) bad('end reason ' + d.reason + ' is not in END_ORDER');
    if (d.kind === 'skill_xp' && !SKILLS_DEF[d.skill]) bad('skill ' + d.skill + ' is not a skill');
    if (d.kind === 'tally_taken' && !tallyTask(d.task)) bad('task ' + d.task + ' is not one of Tamsin\'s tasks');
    if ((d.kind === 'drink_slot' || d.kind === 'carries') && !ITEMS[d.item]) bad(d.kind + ' item ' + d.item + ' is not an item');
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
   Cooking XP, the armor weight Tamsin asks for once, a loot rule, a saved setup). */

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
const lc = (w) => w.charAt(0).toLowerCase() + w.slice(1);
const uc = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const anA = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
/* a small count in words ("Bless all three"), else its digits */
const inWords = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] || String(n);
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
export const WEIGHT_FOR_ROLE = Object.freeze({ tank: 'heavy', melee_dps: 'heavy', ranger: 'medium', mage: 'light', healer: 'light' });
const ROLE_WORDS = Object.freeze({ tank: 'a shield tank', melee_dps: 'a Melee hero', ranger: 'a Ranger', mage: 'a Mage', healer: 'a Healer' });
const STANCE_WORDS = (() => {
  const pc = (pm) => Math.abs(pm - 1000) / 10 + '%';
  const d = HUNT_STANCES.defensive, o = HUNT_STANCES.offensive;
  return 'Defensive takes ' + pc(d.taken) + ' less damage and deals ' + pc(d.dealt) + ' less; Offensive deals and takes ' + pc(o.dealt) + ' more.';
})();

const SAY = Object.freeze({
  bar_intro: (f) => {
    if (!Array.isArray(f.slots)) return null;
    const at = (test) => f.slots.map((s, i) => (on(s) && test(s) ? i : -1)).filter((i) => i >= 0);
    const parts = [[at((s) => s.type === 'ability'), 'are your moves', 'is your move'], [at(isFood), 'eat', 'eats'],
      [at(isDrink), 'drink', 'drinks'], [at((s) => s.type === 'attack_with_item'), 'shoot', 'shoots']]
      .filter(([ix]) => ix.length).map(([ix, many, one]) => slotWords(ix) + ' ' + (ix.length > 1 ? many : one));
    if (!parts.length) return null;
    return { text: 'Your hero uses this bar by itself. It tries the slots in order and uses the first one that\'s ready and whose conditions are all true. '
      + uc(listed(parts)) + '.', barSlot: 0 };
  },
  spell_runes: (f) => {
    const i = struckSpell(f);
    const a = i >= 0 ? ABILITIES[f.slots[i].id] : null;
    const fam = a && ITEMS[a.rune] ? ITEMS[a.rune].family : null;
    const st = fam && Array.isArray(f.store) ? f.store.find((r) => r && r.partner === a.rune) : null;
    if (!fam || !RUNE_FAMILIES[fam] || !st || !name(st.id)) return null;
    return { text: uc(slotWords([i])) + ', ' + a.n + ', has a line through it: every cast needs ' + anA(RUNE_FAMILIES[fam].label) + ' rune, and you carry none. Press '
      + slotWords([i]) + ', pick ' + name(st.id) + ' under "When your runes run out" (' + st.price + ' gp a cast from the store), then Save. Later you can make your own with Runecrafting.',
    barSlot: i, store: st.id };
  },
  food_when: (f) => {
    const i = slotOf(f, (s) => ownFood(s) && hpBelow(s) !== null);
    if (i < 0) return null;
    const s = f.slots[i], pct = hpBelow(s), heal = CONSUMABLES[s.id].amount, food = name(s.id);
    const max = Number.isFinite(f.hpMax) && f.hpMax > 0 ? f.hpMax : null;
    const head = uc(slotWords([i])) + ' eats your own ' + food + ' when your HP is below ' + pct + '%. ';
    if (!max) return { text: head + uc(anA(food)) + ' heals ' + heal + ': eat too early and some of it is wasted, too late and a big hit can catch you. Press '
      + slotWords([i]) + ', set the HP with − or +, then Save.', barSlot: i };
    const lost = wasteAt(heal, pct, max);
    const missing = Math.round((max * (100 - pct)) / 100);
    if (lost <= 0) return { text: head + uc(anA(food)) + ' heals ' + heal + ', and at ' + pct + '% of your ' + max + ' HP you\'re missing ' + missing
      + ', so none of it is wasted. Eat lower to save food or higher to play safe: press ' + slotWords([i]) + ', set it with − or +, then Save.', barSlot: i };
    /* where to stop: the first step down (Configure action's 5%) that wastes nothing, but never under EAT_FLOOR_PCT (a low
       hero's few HP; the designer's 50%), where a little waste is the price of eating before a big hit */
    let to = pct;
    while (to - PCT_STEP >= EAT_FLOOR_PCT && wasteAt(heal, to, max) > 0) to -= PCT_STEP;
    const left = wasteAt(heal, to, max);
    const how = to === pct ? 'set it with − or +' : 'press − until it reads ' + to + '% (' + (left > 0 ? 'only ' + left + ' is wasted there, and you still eat before a big hit'
      : 'nothing is wasted there') + ')';
    return { text: head + uc(anA(food)) + ' heals ' + heal + ', and at ' + pct + '% of your ' + max + ' HP you\'re missing ' + missing + ', so ' + lost
      + ' of it is wasted. Press ' + slotWords([i]) + ', ' + how + ', then Save.', barSlot: i, goal: to < pct ? to : null };
  },
  food_order: (f) => {
    const p = storeFirst(f);
    if (!p) return null;
    const S = f.slots[p.store], O = f.slots[p.own], gp = priceOf(f, S.id);
    if (gp === null) return null;
    const higher = hpBelow(S) > hpBelow(O), first = p.store < p.own;
    const why = higher ? 'so between ' + hpBelow(O) + '% and ' + hpBelow(S) + '% it eats before your own ' + name(O.id)
      : 'and it comes first, so it eats before your own ' + name(O.id);
    /* a later slot at a higher HP: lower it to the own slot's; an EARLIER slot: it must also move after the own slot
       (at the same HP the first slot whose conditions pass fires) */
    const fix = [higher ? 'make it ' + hpBelow(O) + '% or lower' : null, first ? 'press Later until it sits after ' + slotWords([p.own]) : null].filter(Boolean);
    return { text: uc(slotWords([p.store])) + ' still buys ' + name(S.id) + ' (' + gp + ' gp) below ' + hpBelow(S) + '%, ' + why + '. Press '
      + slotWords([p.store]) + ', ' + fix.join(' and ') + ', then Save.', barSlot: p.store, goal: higher ? hpBelow(O) : null };
  },
  leave_cellar: (f) => ({ text: 'You\'re Level ' + f.charLevel + '. Leave the hunt to go back to town. Your loot is already in your bag.' }),
  styles: () => {
    const n = (id) => name(id) || id;
    return { text: 'There\'s no class to pick: the weapon you hold decides how you fight. ' + n(START_EQUIPMENT.weapon) + ' and ' + n(START_EQUIPMENT.shield)
      + ' hold the monsters on you (a tank). ' + n('practice_hatchets') + ' or a ' + n('practice_club') + ' hit hardest up close. A ' + n('practice_bow') + ' or '
      + n('practice_crossbow') + ' shoots from range. A ' + n('practice_wand') + ' and ' + n('practice_spellbook') + ' cast spells. A ' + n('practice_staff')
      + ' heals. Your bag holds the others: swap any time in town.' };
  },
  bless: (f) => {
    const b = f.blessings;
    if (!b || !Number.isInteger(b.freeUntil) || !(b.best > 0)) return null;
    return { text: 'Out past the Cellar you can die. Dying ends the hunt, sends you home and costs ' + Math.round(DEATH_XP_LOSS * 100)
      + '% of your Level XP, never a Level. Blessings protect up to ' + Math.round(b.best / 10) + '% of that, and they\'re free until Level ' + b.freeUntil
      + ': open the Shop\'s Services tab and Bless all ' + inWords(b.of) + '.' };
  },
  tamsins_task: (f) => {
    const w = WEIGHT_FOR_ROLE[f.role];
    const pick = w ? uc(w) + ' suits ' + ROLE_WORDS[f.role] + '. Then' : 'Then';
    return { text: 'Tamsin pays for kills. Open her tally and pick the armor weight she pays you in. ' + pick + ' Take ' + WOLVES.count + ' ' + WOLVES.label
      + ': every kill counts, even while you\'re away.' };
  },
  first_death: (f) => {
    const d = f.death, b = f.blessings;
    if (!d || !Number.isInteger(d.xp) || !b || !Number.isInteger(b.freeUntil)) return null;
    const who = f.name || 'Your hero';
    const kept = d.saved && Number.isInteger(d.saved.level) && d.saved.level > 0
      ? '; your Blessings saved ' + d.saved.level + ' more and are used up now' : '. Blessings would have saved most of it';
    return { text: 'The hunt ended and ' + who + ' came home. You kept your loot and your Level. Dying cost ' + d.xp + ' Level XP' + kept
      + '. They\'re free until Level ' + b.freeUntil + ': open the Shop\'s Services tab and Bless ' + (d.saved ? 'again' : 'all ' + inWords(b.of)) + ' before you go back.' };
  },
  first_eat: (f) => {
    const ate = used(f, 'food', 'own');
    const item = ate && ate.length ? ate[0].item : null;
    const i = item ? slotOf(f, (s) => s.type === 'consume' && s.id === item) : -1;
    if (i < 0 || hpBelow(f.slots[i]) === null) return null;
    const left = f.carried && Number.isInteger(f.carried[item]) ? f.carried[item] : f.slots[i].count;
    const st = slotOf(f, (s) => isStore(s) && BASIC_INDEX[s.id].kind === 'heal');
    const gp = st >= 0 ? priceOf(f, f.slots[st].id) : null;
    const then = st >= 0 && gp !== null ? '; after that ' + slotWords([st]) + ' buys ' + name(f.slots[st].id) + ' at ' + gp + ' gp' : '';
    return { text: 'Your HP fell under ' + hpBelow(f.slots[i]) + '%, so ' + slotWords([i]) + ' ate ' + anA(name(item)) + '.'
      + (Number.isInteger(left) ? ' You have ' + left + ' left' + then + '.' : '') + ' Cook more to keep your gold.', barSlot: i };
  },
  first_drink: (f) => {
    const i = slotOf(f, (s) => isDrink(s) && below(s, 'self_mana_pct') !== null);
    if (i < 0) return null;
    const s = f.slots[i], gp = isStore(s) ? priceOf(f, s.id) : 0;
    if (gp === null) return null;
    const how = isStore(s) ? 'buys ' + name(s.id) + ' (' + gp + ' gp)' : 'drinks your own ' + name(s.id);
    return { text: 'Your moves cost mana. Below ' + below(s, 'self_mana_pct') + '% mana, ' + slotWords([i]) + ' ' + how + '. Your own turnips cook into juice that costs nothing.', barSlot: i };
  },
  fight_settings: (f) => {
    const n = used(f, 'food');
    return n ? { text: 'Your hero has eaten ' + sum(n) + ' times this hunt. Try the stance on your bar: ' + STANCE_WORDS + ' Target picks who your hero hits first.' } : null;
  },
  more_heroes: (f) => {
    const h = heroesOn(f);
    if (!h || !Number.isInteger(f.slotsOwned) || !Number.isInteger(f.playLimit)) return null;
    return { text: (f.name || 'Your hero') + ' keeps hunting while you do something else, even with the game closed. You can play up to ' + f.playLimit
      + ' heroes at once, and you own ' + f.slotsOwned + ' hero slots. Press Characters, then Create hero in your empty slot.' };
  },
  party_own: (f) => {
    const o = (heroesOn(f) || []).find((x) => x.slot !== f.self && x.open === true && x.hunting === false && x.name);
    if (!o) return null;
    return { text: 'Your heroes can share a hunt. Right-click (long-press on a phone) ' + o.name + '\'s tab and choose Invite to party; your own heroes join at once. A shield tank holds the pack and a staff heals.', other: o.slot };
  },
  equip_upgrades: (f) => {
    const ids = (f.upgrades || []).filter((id) => name(id));
    if (!ids.length) return null;
    return { text: 'You found ' + listed(ids.slice(0, 2).map(name)) + (ids.length > 2 ? ' and more' : '') + '. Gear goes on in town: open your bag and press Equip upgrades.' };
  },
  storage: (f) => {
    if (f.stacks == null || !f.bagCap) return null;
    return { text: f.stacks + ' of your bag\'s ' + f.bagCap + ' spaces are used. Storage holds more, and all your heroes share it: open Storage and press a stack in your bag to put it away.' };
  },
  harvest_juice: (f) => {
    const juice = (ARTISAN_RECIPES.cooking || []).find((r) => r.output === 'turnip_juice');
    if (!juice) return null;
    const ready = f.land && f.land.ready && f.land.ready.turnip > 0;
    return { text: (ready ? 'Harvest them on the Farm, then cook' : 'Cook your turnips into') + ' Turnip Juice: Gathering and crafting, Cooking, ' + juice.name
      + ' (1 turnip makes ' + (juice.outputQty || 1) + '). Your own juice costs nothing to drink.' };
  },
  juice_slot: (f) => {
    const n = f.carried && f.carried.turnip_juice;
    if (!(n > 0)) return null;
    const st = slotOf(f, (s) => isStore(s) && BASIC_INDEX[s.id].kind === 'mana' && below(s, 'self_mana_pct') !== null);
    if (st < 0) return { text: 'You carry ' + n + ' ' + name('turnip_juice') + '. Press an empty slot, pick ' + name('turnip_juice') + ', add a mana condition, then Save: your own drinks cost nothing.' };
    const S = f.slots[st];
    return { text: 'You carry ' + n + ' ' + name('turnip_juice') + '. Press an empty slot, pick ' + name('turnip_juice') + ' and give it My mana % below '
      + below(S, 'self_mana_pct') + ', then press Earlier until it sits before ' + slotWords([st]) + ' (the store\'s ' + name(S.id) + ') and Save. Your own juice costs nothing, and the store\'s takes over once yours runs out.', barSlot: st };
  },
  home: (f) => {
    const t = f.home && f.home.next;
    if (!t || !Array.isArray(t.items)) return null;
    const need = t.items.map((x) => ({ ...x, have: (f.bag && f.bag[x.id]) || 0 })).filter((x) => x.have < x.qty);
    const node = need.length ? [...TREES, ...ROCKS].find((n) => n.prod === need[0].id && n.req <= 1) : null;
    const skill = node ? (TREES.includes(node) ? 'Woodcutting' : 'Mining') : null;
    /* "Normal Log ×30": an item name is never pluralised by guesswork (readyWords below) */
    if (t.items.some((x) => !name(x.id))) return null;
    const cost = t.gold + ' gp, ' + listed(t.items.map((x) => name(x.id) + ' ×' + x.qty));
    const next = need.length ? (node ? name(need[0].id) + ' so far: ' + need[0].have + ' of ' + need[0].qty + '. Get more in Gathering and crafting, ' + skill + ', ' + node.name + '.' : null)
      : 'You have the materials: open the House and press Buy.';
    return next ? { text: 'The ' + t.name + ' needs ' + cost + '. ' + next } : null;
  },
  own_runes: (f) => {
    const r = runeless(f);
    const out = r ? runeId(r.family, 1) : null;
    const bind = out ? (ARTISAN_RECIPES.runecrafting || []).find((x) => x.output === out && (x.req || 1) <= 1) : null;
    const cut = (ARTISAN_RECIPES.runecrafting || []).find((x) => x.output === 'rune_blank' && (x.req || 1) <= 1);
    const ess = ROCKS.find((n) => n.prod === 'rune_essence');
    if (!bind || !cut || !ess || !name(out)) return null;
    const ins = (x) => Object.entries(x.inputs || {})[0] || [];
    /* the recipes' own names are the buttons the player presses (and they are written plural) */
    return { text: 'Mine ' + ess.name + ' (Gathering and crafting, Mining), then in Runecrafting press ' + cut.name + ' (' + ins(cut)[1] + ' essence make ' + cut.outputQty
      + ') and ' + bind.name + ' (' + ins(bind)[1] + ' blanks make ' + bind.outputQty + '). Your own runes cast the full spell; the store\'s rune casts a weaker one.' };
  },
  bless_paid: (f) => {
    const b = f.blessings;
    if (!b || !Array.isArray(b.prices) || !b.prices.length || !(b.best > 0)) return null;
    const total = b.prices.reduce((n, p) => n + p, 0);
    const which = b.prices.length === b.of ? 'all ' + inWords(b.of) : 'the ' + inWords(b.prices.length) + ' you don\'t hold';
    return { text: 'From Level ' + b.freeUntil + ' each Blessing costs gold: ' + total + ' gp for ' + which + ' at Level ' + f.charLevel
      + '. They still cut what a death takes by up to ' + Math.round(b.best / 10) + '%.' };
  },
});

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
  const text = said.text.replace(SLOT_TOKEN, (m, id) => (at(id) >= 0 ? 'slot ' + (at(id) + 1) : 'the ' + (name(id) || id) + ' slot'));
  const item = card.ring && card.ring.item;
  const barSlot = Number.isInteger(said.barSlot) ? said.barSlot : item && at(item) >= 0 ? at(item) : null;
  const hooks = (card.hooks || []).map((h) => h.replace('{store}', said.store || '').replace('{other}', said.other === undefined ? '' : String(said.other))
    .replace('{slot}', barSlot === null ? '' : String(barSlot)));
  return Object.freeze({ ...card, text, barSlot, goal: Number.isFinite(said.goal) ? said.goal : null, textIn: card.inWindow || null, hooks: Object.freeze(hooks) });
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

/* How a hero who hunts alone makes a party (the go_below card's lesson, said on the What next line instead). */
const PARTY_HOW = 'Invite a friend, or make a second hero: up to four of yours can hunt at once.';
/* A ground built for a party: a pocket of it needs one (hunt-grounds.js minParty). */
const partyGround = (hunt) => Object.values(HUNT_GROUNDS).some((g) => g.hunt === hunt && g.pockets.some((p) => (p.minParty || 1) > 1));

/**
 * The goal line after the guide, or null (nothing left to name). `facts`: { charLevel, role, skillLevel, defenseXp, land,
 * inParty } (skillLevel: the role's skill's level, or null when unknown; defenseXp: the server's Defense XP, or null when
 * unknown; land: the account's field, { planted: plots holding a crop, ready: { crop: ready plots } }, or null when the
 * server has not sent it; inParty: the hero sits in a party of 2+). Answers { id, title, text }; the id
 * changes whenever the text does (the hunt top bar redraws on a new id).
 */
export function nextGoal(facts) {
  if (!facts || !Number.isInteger(facts.charLevel)) return null;
  const lines = [];
  const ids = ['goal'];
  /* Defense at 0 XP means no armour worn (Tyler 2026-10-18: it trains only in armour). The fresh-hero play hit 117
     kills like that; the Shop's gloves and belts are the cheapest armour (designer 2026-10-22, the outfitter). */
  if (facts.defenseXp === 0) {
    lines.push('Your Defense isn\'t training: it rises only while you wear armor. The Shop sells gloves and belts.');
    ids.push('armour');
  }
  /* The land is the ACCOUNT's (2026-12-14-shared-farm), so the line reads the field, never this hero's Farming XP
     (v0.2.35 gate: a 0-XP hero was told "nothing grows" over 5 ready turnips the others planted). Empty land asks
     for a seed (P1 2026-10-22: farming sat at zero; the kit holds 8 turnip seeds) until any hero plants; ready
     crops ask for the harvest (any hero may take it) until they are taken; a field that is only growing says nothing. */
  const land = facts.land;
  if (land && land.planted === 0) {
    lines.push('Nothing grows on your land: open the Farm (J) and plant a seed. Turnips are ready in ' + CROPS.turnip.hours + ' hours, sooner if watered.');
    ids.push('farm');
  } else if (land && land.ready) {
    const ready = readyWords(land.ready);
    if (ready.words.length) {
      lines.push(listed(ready.words) + (ready.plots === 1 ? ' is' : ' are') + ' ready on your land: open the Farm (J) to harvest '
        + (ready.plots === 1 ? 'it.' : 'them.'));
      ids.push('harvest', ...ready.ids);
    }
  }
  /* THE PARTY PITCH (designer playtest 2026-10-24): the solo chain ends here, not behind a party card, so a hero with
     no party hears of the party ground its Level fits, and how to make a party: once, on whichever line names it. */
  const solo = facts.inParty !== true;
  const fits = solo ? groundHunts().find((h) => partyGround(h) && HUNT_INDEX[h].band[0] <= facts.charLevel && facts.charLevel <= HUNT_INDEX[h].band[1]) : null;
  if (fits) {
    lines.push(HUNT_INDEX[fits].name + ' fits your Level with a party. ' + PARTY_HOW);
    ids.push('party', fits);
  }
  const next = groundHunts().find((h) => HUNT_INDEX[h].band[0] > facts.charLevel);
  if (next) {
    const party = partyGround(next);
    /* The floor is a warning, not a lock (Tyler 2026-10-18), so the line names the Level it is built for. */
    lines.push('Next ground: ' + HUNT_INDEX[next].name + ', for Level ' + HUNT_INDEX[next].band[0] + ' and up' + (party ? ', with a party.' : '.')
      + (party && solo && !fits ? ' ' + PARTY_HOW : ''));
    ids.push(next, String(HUNT_INDEX[next].band[0]), ...(party && solo && !fits ? ['solo'] : []));
  }
  /* THE NEXT GEAR, BY LEVEL (Tyler 2026-10-24): the lowest Level above the hero's that opens a piece a player can get
     (skill-unlocks.js: reachable only) and the role wears; with no role from the server yet, every such piece. */
  const role = ROLE_SKILL[facts.role] ? facts.role : null;
  const gear = nextUnlock(LEVEL_REQ, facts.charLevel, role ? (id) => wornByRole(id, role) : null);
  const gat = /^Next at level (\d+): /.exec(gear);
  if (gat) {
    lines.push('Next gear at Level ' + gat[1] + ': ' + gear.slice(gat[0].length) + '.');
    ids.push('gear', gat[1]);
  }
  const skill = ROLE_SKILL[facts.role];
  if (skill && Number.isInteger(facts.skillLevel)) {
    const u = nextUnlock(skill, facts.skillLevel);
    const at = /^Next at level (\d+): /.exec(u);
    if (at) {
      lines.push('Next at ' + SKILLS_DEF[skill].name + ' level ' + at[1] + ': ' + u.slice(at[0].length) + '.');
      ids.push(skill, at[1]);
    }
  }
  return lines.length ? { id: ids.join('_'), title: 'What next', text: lines.join(' ') } : null;
}
