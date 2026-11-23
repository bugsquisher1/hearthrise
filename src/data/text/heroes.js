// ════════════════════════════════════════════════════════════════════════
// src/data/text/heroes.js — THE ALL CHARACTERS WINDOW'S WORDS: each hero's
// card, renaming, parties, alerts and the phone's routes
// (src/shell/windows/characters.js), and the character strip's heroes that
// are not open (src/app/character-strip.js).
//
// One row per sentence or label, read by t('heroes.<key>'). The parties line
// is two sentences: how many heroes are in one, then how to invite.
// ════════════════════════════════════════════════════════════════════════

export const HEROES_TEXT = Object.freeze({
  /* A TITLE EARNED (src/shell/town-news.js; QA audit 2026-11-18 A24: titles unlocked with nobody told). {title} its name, {price} the
     server's, {count} how many more are waiting. */
  title_ready: 'New title for {name}: {title} · Claim for {price} in Character → Titles',
  title_ready_free: 'New title for {name}: {title} · Claim in Character → Titles',
  title_ready_more: { one: 'New titles for {name}: {title} +1 more · Claim in Character → Titles',
    other: 'New titles for {name}: {title} +{count} more · Claim in Character → Titles' },
  /* The phone's routes. */
  icons_head: 'What the icons open',
  character_list: 'Character list',

  /* A hero's card. */
  alerts_waiting_aria: 'Alerts waiting',
  gauge_health: 'Health',
  gauge_mana: 'Mana',
  gauge_stamina: 'Stamina',
  hp_unknown: 'HP –',
  mana_unknown: 'Mana –',
  bag_worth: 'Bag worth {gold}',
  party_in: 'Party: {hunt}',
  party_leads: 'Party leader: {hunt}',
  no_party: 'No party',
  on_screen: 'On screen',

  /* Renaming. */
  new_name: 'New name',
  confirm_aria: 'Confirm the new name',
  rename_head: 'Rename {name}',
  rename_unpriced: 'Rename price not set yet',
  rename_quote: 'Rename cost: {price} at Level {level}',
  rename_hunting: '{name}: hunting · Rename after the hunt',
  rename_today: '{name}: already renamed today (1 per day)',
  rename_cant: '{name}: can\'t rename now',
  rename_short: 'Gold: {gold}',
  rename_price: 'Rename for {price}',
  confirm_q: 'Change {name} to {typed} for {price}?',
  confirm_note: 'No refund · {name} becomes free for others',
  pay: 'Pay {price}',
  name_length: 'Names: 3 to 20 letters, numbers and spaces',
  name_same: 'Same name',
  renaming: 'Renaming…',
  renamed: 'Renamed to {name}',

  /* Parties and alerts. */
  parties_head: 'Parties',
  parties_some: { one: 'In a party: {count} of {total} characters', other: 'In a party: {count} of {total} characters' },
  parties_none: 'No characters in a party',
  parties_how_phone: 'Invite: press Invite on a hero, or hold a name',
  parties_how: 'Invite: right-click a player or a character tab',
  sending: 'Sending…',
  invite_failed: 'Invite failed, try again',
  alerts_from: 'Alerts from {name}',

  /* The character strip's heroes this tab has not open (src/app/character-strip.js): each is listed, so none seems missing,
     with its Level and what it was last doing, and one press plays it. Tyler's voice (11-11): what the player can do, plain words. */
  strip_no_name: 'Hero {number}',
  strip_level: 'Level {level}',
  strip_level_doing: 'Level {level}, {doing}',
  strip_play_title: 'Play {name} too',
  strip_full: { one: 'Heroes at once: 1 · Sign out to pick {name}',
    other: 'Heroes at once: {count} · Sign out to swap in {name}' },
  strip_open_failed: '{name} didn’t load, try again',

  /* THE STRIP'S TOOLS (src/app/character-strip.js) */
  strip_all: 'All characters',
  strip_all_title: 'All characters on one screen (O)',
  strip_all_short: 'Heroes',
  strip_characters: 'Characters',

  /* HERO CREATION (src/app/hero-create.js): the step's labels, the name rules, the answers. */
  create_title: 'Create your hero',
  create_preview: 'Hero',
  create_preview_in: 'Hero in the {outfit}',
  create_name: 'Name',
  create_name_hint: '3 to 20 letters',
  create_go: 'Enter town',
  create_more: 'More below',
  /* {outfit} the starting outfit, {parts} the parts the colors change ("hood and tunic") */
  create_start: 'Starting outfit: {outfit}',
  name_short: 'Name: at least 3 letters',
  name_long: 'Name: at most 20 letters',
  name_charset: 'Letters, numbers, spaces, hyphens and apostrophes only',
  name_reserved: 'Name reserved, try another',
  name_blocked: 'Name not allowed, try another',
  create_failed: 'Hero not created, try again',
  creating: 'Creating hero…',
  entering: 'Entering town…',
  enter_failed: 'Hero created, press Enter town again',
  /* THE WEAPON PICK (GR-24, chapter 08 section 2.1): a card for each way to fight, none picked for the player */
  create_pick: 'How this hero fights',
  pick_needed: 'Pick how this hero fights first',
  bad_set: 'Pick how this hero fights first',
  /* THE RECRUITS (1053-recruits.sql; Tyler RD-Q6 a 2026-11-22): one hero first, then ONE press makes the rest of the company at the first hero's
     Level, each in a job the company lacks (src/shell/windows/recruits-pane.js, in All characters). {name} the first hero, {count} the recruits,
     {level} the Level they arrive at, {at} the Level the press opens at, {names} the recruits made */
  recruits_head: 'Your recruits',
  recruits_wait: { one: '{count} recruit · Joins when {name} reaches Level {at}',
    other: '{count} recruits · Join when {name} reaches Level {at}' },
  recruits_lead: { one: '{count} recruit ready (joins {name} at Level {level}) · Type a name or leave empty',
    other: '{count} recruits ready (join {name} at Level {level}) · Type names or leave empty' },
  recruits_name: 'Name (optional)',
  recruits_go: { one: 'Recruit 1 hero', other: 'Recruit {count} heroes' },
  recruiting: 'Recruiting…',
  recruits_done: 'Joined: {names} · Ready in town',
});
