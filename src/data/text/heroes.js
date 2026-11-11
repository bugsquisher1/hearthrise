// ════════════════════════════════════════════════════════════════════════
// src/data/text/heroes.js — THE ALL CHARACTERS WINDOW'S WORDS: each hero's
// card, renaming, parties, alerts and the phone's routes
// (src/shell/windows/characters.js).
//
// One row per sentence or label, read by t('heroes.<key>'). The parties line
// is two sentences: how many heroes are in one, then how to invite.
// ════════════════════════════════════════════════════════════════════════

export const HEROES_TEXT = Object.freeze({
  /* The phone's routes. */
  icons_head: 'What the icons open',
  also_here_aria: 'Also here',
  character_list: 'Character list',
  sign_out: 'Sign out',

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
  show: 'Show',
  on_screen: 'On screen',
  rename: 'Rename',

  /* Renaming. */
  new_name: 'New name',
  close: 'Close',
  confirm_aria: 'Confirm the new name',
  cancel: 'Cancel',
  rename_head: 'Rename {name}',
  rename_unpriced: 'The server has not priced a new name yet.',
  rename_quote: 'A new name costs {price} at Level {level}, paid from your gold. The first name was free, and every change after it costs gold.',
  rename_hunting: '{name} is hunting. Rename once the hunt ends.',
  rename_today: '{name} changed name today. One change a day.',
  rename_cant: '{name} cannot change name right now.',
  rename_short: 'You have {gold}.',
  rename_price: 'Rename · {price}',
  confirm_q: 'Change {name} to {typed} for {price}?',
  confirm_note: 'The gold is gone for good, and the name {name} is free for anyone to take.',
  pay: 'Pay {price}',
  name_length: 'Names are 3 to 20 letters, numbers and spaces.',
  name_same: 'That is already this hero’s name.',
  renaming: 'Renaming…',
  renamed: 'Done: this hero is now {name}.',

  /* Parties and alerts. */
  parties_head: 'Parties',
  parties_some: { one: '{count} of your {total} characters is in a party.', other: '{count} of your {total} characters are in a party.' },
  parties_none: 'None of your characters is in a party.',
  parties_how_phone: 'Press Invite on a hero to bring it into your party, or hold a player’s name. The Party window finds open parties.',
  parties_how: 'Right-click a player, or one of your character tabs, to invite. Party (Y) finds open parties.',
  sending: 'Sending…',
  invite_failed: 'That did not work. Try again.',
  alerts_from: 'Alerts from {name}',
});
