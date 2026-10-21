// ════════════════════════════════════════════════════════════════════════
// src/net/observability-config.js — WHERE THE CLIENT'S TELEMETRY GOES.
//
// Two PUBLIC, ingest-only client keys (like SUPABASE_CONFIG's anon key: made to
// ship in a browser bundle; they can send events, never read them):
//   sentry   errors (uncaught, unhandled rejections, console.error)
//   posthog  named events and session replay
// The vendored SDKs are pinned by version in the filename and by sha384 here;
// the loader sets each hash as the script's integrity, so a changed byte does
// not run. Telemetry only: nothing in the game reads anything back (§1).
//
// enabled    the one kill switch; ?noanalytics=1 also turns both off for a load
// hosts      the only hosts that send; every other host (localhost included) is
//            'dev' and loads and sends nothing
// ════════════════════════════════════════════════════════════════════════

export const OBSERVABILITY_CONFIG = Object.freeze({
  enabled: true,
  hosts: Object.freeze({ 'hearthrise.net': 'production', 'www.hearthrise.net': 'production' }),
  sentry: Object.freeze({
    dsn: 'https://f19b6d8040e335fa3f7d3aafdd6f6d72@o4511870588944384.ingest.us.sentry.io/4511870595039232',
    scripts: Object.freeze([
      Object.freeze({ src: 'src/vendor/sentry-browser-11.4.0.min.js', integrity: 'sha384-yR8WDlaM5tdf6UYPdUkCyZhW0OUuGNnKT8haW281Se9cj9eZP3z+iKwFvivogWnz' }),
      Object.freeze({ src: 'src/vendor/sentry-captureconsole-11.4.0.min.js', integrity: 'sha384-7G0XB8qiA624aLgQdxnBdDR/DUyLy2rhB1Zp5T0ORZBUeVx69L4LSM4X/moehDim' }),
    ]),
  }),
  posthog: Object.freeze({
    key: 'phc_CjFscKYriJ8fTNe7J9CxYF6kWKmrqGbWvc6rRjMbdS44',
    host: 'https://us.i.posthog.com',
    /* The full build with no external loads: the recorder is inside, nothing is fetched from a CDN. */
    scripts: Object.freeze([
      Object.freeze({ src: 'src/vendor/posthog-js-1.436.1.full.no-external.js', integrity: 'sha384-+DBqre7MmdazbsQIHGtKSM/LWnQcVmurYnHaJnD8PZh74Oig9K5whLcJgO/EH3Fk' }),
    ]),
  }),
});
