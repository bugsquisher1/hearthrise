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
  /* The phone's routes. */
  icons_head: 'What the icons open',
  also_here_aria: 'Also here',
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
  party_leads: 'Party: {hunt}, leads',
  no_party: 'No party',
  on_screen: 'On screen',

  /* Renaming. */
  new_name: 'New name',
  confirm_aria: 'Confirm the new name',
  rename_head: 'Rename {name}',
  rename_unpriced: 'The server has not priced a new name yet.',
  rename_quote: 'Rename cost: {price} at Level {level} (only the first name is free)',
  rename_hunting: '{name} is hunting. Rename once the hunt ends.',
  rename_today: '{name} changed name today. One change a day.',
  rename_cant: '{name} cannot change name right now.',
  rename_short: 'You have {gold}.',
  rename_price: 'Rename for {price}',
  confirm_q: 'Change {name} to {typed} for {price}?',
  confirm_note: 'Gold not refunded, {name} becomes free to take',
  pay: 'Pay {price}',
  name_length: 'Names are 3 to 20 letters, numbers and spaces.',
  name_same: 'That is already this hero’s name.',
  renaming: 'Renaming…',
  renamed: 'Done: this hero is now {name}.',

  /* Parties and alerts. */
  parties_head: 'Parties',
  parties_some: { one: '{count} of your {total} characters is in a party.', other: '{count} of your {total} characters are in a party.' },
  parties_none: 'None of your characters is in a party.',
  parties_how_phone: 'Invite: Invite on a hero, or hold a name. Parties: Party window',
  parties_how: 'Invite: right-click a player or a character tab. Open parties: Party (Y)',
  sending: 'Sending…',
  invite_failed: 'That did not work. Try again.',
  alerts_from: 'Alerts from {name}',

  /* The character strip's heroes this tab has not open (src/app/character-strip.js): each is listed, so none seems missing,
     with its Level and what it was last doing, and one press plays it. Tyler's voice (11-11): what the player can do, plain words. */
  strip_no_name: 'Hero {number}',
  strip_level: 'Level {level}',
  strip_level_doing: 'Level {level}, {doing}',
  strip_play_title: 'Play {name} too. Your other heroes keep playing.',
  strip_full: { one: 'Heroes at once: 1. Sign out to pick {name}',
    other: 'Heroes at once: {count}. Sign out to swap in {name}' },
  strip_open_failed: '{name} didn’t load. Try again in a minute.',

  /* THE STRIP'S TOOLS (src/app/character-strip.js) */
  strip_all: 'All characters',
  strip_all_title: 'All characters on one screen (O)',
  strip_all_short: 'Heroes',
  strip_characters: 'Characters',

  /* HERO CREATION (src/app/hero-create.js): the step's labels, the name rules, the answers. */
  create_title: 'Create your hero',
  create_preview: 'Your hero',
  create_preview_in: 'Your hero in the {outfit}',
  create_name: 'Name',
  create_name_hint: '3 to 20 letters',
  create_go: 'Enter town',
  create_how: 'How you fight',
  create_more: 'More below',
  /* {outfit} the starting outfit, {parts} the parts the colors change ("hood and tunic") */
  create_start: 'Starting outfit: {outfit} (colors change its {parts}, kept on every outfit)',
  name_short: 'Name: at least 3 letters',
  name_long: 'Name: at most 20 letters',
  name_charset: 'Letters, numbers, spaces, hyphens and apostrophes only',
  name_reserved: 'Name reserved, try another',
  name_blocked: 'Name not allowed, try another',
  create_failed: 'Hero not created. Try again in a minute.',
  creating: 'Creating your hero…',
  entering: 'Entering town…',
  enter_failed: 'Hero created, but town didn’t open. Press Enter town again.',
});
