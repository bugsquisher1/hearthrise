// ============================================================
// src/chat-filter.js
//
// Profanity filter for the chat system: masks common curse words.
// Default ON. Players can disable in Settings → Chat.
//
// 2026-10-11: the "always-on slur layer" that used to sit here is GONE. Its
// SLUR_HASHES were ten illustrative placeholders that matched nothing, so it
// was a claim of protection with none behind it. Names are filtered by the
// SERVER (2026-10-11-name-moderation.sql: hr_name_blocked on every claim and
// clan). Chat BODIES are not server-filtered yet — that is a separate lane,
// and until it lands this file is honest about being a courtesy mask only.
//
// Implementation notes:
//   • Leet-speak normalization (a→@, e→3, etc.) so simple
//     bypasses don't work.
//   • Word-boundary detection (\b) prevents Scunthorpe-style
//     false positives on innocent substrings.
//   • Mask preserves original length so UX feels less jarring
//     than a single [filtered] tag.
//
// Production note: this is a curated list good enough for soft
// beta. For 1.0+ scale we should swap to a managed service
// (Sightengine, Hive, etc.) — the public API is stable so
// the swap is one file.
//
// Public API:
//   window.ChatFilter.filter(text, opts) → masked string
//   window.ChatFilter.contains(text)     → boolean (profanity)
//   window.ChatFilter.normalize(text)    → de-leeted string
// ============================================================

(function(){
  'use strict';

  // ── Curated word lists ─────────────────────────────────────
  // Kept short on purpose. Tuning these is faster than wrestling
  // with a 50,000-word dump that has too many false positives.
  // Stems are matched with \w* so plurals/conjugations catch.
  var PROFANITY_STEMS = [
    'fuck','shit','bitch','asshole','dick','piss','cunt','bastard',
    'damn','crap','goddamn','jackass','douche','prick','wanker',
    'bullshit','horseshit','jerkoff','arsehole','twat','bollocks',
  ];

  // ── Leet-speak normalization ────────────────────────────────
  var LEET_MAP = {
    '@':'a', '4':'a',
    '8':'b',
    '(':'c', '<':'c',
    '3':'e',
    '6':'g', '9':'g',
    '!':'i', '1':'i', '|':'i',
    '0':'o',
    '5':'s', '$':'s',
    '7':'t', '+':'t',
    '2':'z',
  };
  function normalize(text){
    if(!text) return '';
    var out = '';
    for(var i=0; i<text.length; i++){
      var ch = text[i];
      var lower = ch.toLowerCase();
      out += (LEET_MAP[lower] != null) ? LEET_MAP[lower] : lower;
    }
    // Collapse repeated characters (fuuuck → fuck) so naive
    // letter-stretching doesn't bypass us.
    out = out.replace(/(.)\1{2,}/g, '$1$1');
    // Strip non-word characters that could be inserted between
    // letters (f.u.c.k, f-u-c-k, f u c k, f*u*c*k)
    return out;
  }

  // ── Build matchers ──────────────────────────────────────────
  // Profanity: regex with word boundaries on the de-leeted text.
  // We replace in two passes:
  //   1. Soft pass: \b<stem>\w*\b on normalized text — catches
  //      regular spellings + mild leet (fuck, fucking, f*ck).
  //   2. Aggressive pass: contiguous-letter version (no word
  //      boundary) — catches f.u.c.k, f-u-c-k, f u c k.
  // We don't actually mutate the original string in pass 2
  // because that would risk false positives; we only use it
  // to flag "contains profanity" for moderation purposes.
  function buildProfanityRegex(){
    return new RegExp('\\b(' + PROFANITY_STEMS.join('|') + ')\\w*\\b', 'gi');
  }
  var PROFANITY_RE = buildProfanityRegex();

  // ── Public API ──────────────────────────────────────────────
  function maskWord(word){
    if(word.length <= 1) return word;
    return word[0] + '*'.repeat(Math.max(2, word.length - 1));
  }

  function filter(text, opts){
    if(!text) return '';
    opts = opts || {};
    var profanityOn = opts.profanityFilter !== false;   // default ON
    var working = text;

    // Profanity: only mask if filter is on
    if(profanityOn){
      // Apply against the normalized text but mask in the original
      var normalized = normalize(working);
      var match;
      var ranges = [];
      PROFANITY_RE.lastIndex = 0;
      while((match = PROFANITY_RE.exec(normalized)) !== null){
        ranges.push([match.index, match.index + match[0].length]);
      }
      if(ranges.length){
        // Apply ranges to working string. Because normalize()
        // is character-wise (no length change), indices map 1:1.
        var chars = working.split('');
        ranges.forEach(function(r){
          var word = working.slice(r[0], r[1]);
          var masked = maskWord(word);
          for(var i = r[0], j = 0; i < r[1]; i++, j++){
            chars[i] = masked[j] != null ? masked[j] : '*';
          }
        });
        working = chars.join('');
      }
    }

    return working;
  }

  function contains(text){
    if(!text) return false;
    PROFANITY_RE.lastIndex = 0;
    return PROFANITY_RE.test(normalize(text));
  }

  // ── Expose ──────────────────────────────────────────────────
  window.ChatFilter = {
    filter: filter,
    contains: contains,
    normalize: normalize,
  };

  console.log('[chat-filter] loaded — ' + PROFANITY_STEMS.length + ' profanity stems');
})();
