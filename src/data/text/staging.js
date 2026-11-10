// ════════════════════════════════════════════════════════════════════════
// src/data/text/staging.js — THE STAGING SITE'S OWN WORDS (src/app/staging-mark.js).
//
// One row per sentence, read by t('staging.<key>'). No player on the live game
// ever reads these: they show only on a staging site, where a release is played
// before it goes out, and where nothing a hero does is kept.
// ════════════════════════════════════════════════════════════════════════

export const STAGING_TEXT = Object.freeze({
  /* The plate over every screen of the staging site. */
  mark: 'Staging',
  /* The tab's name on the staging site. */
  tab_title: 'Hearthrise Staging',
  /* Beside the plate on the account screens (sign-in, the characters). */
  not_kept: 'Nothing you do here is kept.',
  /* The whole page when a staging site has no server to play. */
  no_server_title: 'No staging server yet',
  no_server: 'This staging site isn\'t connected to a server yet. The live game is at hearthrise.net.',
});
