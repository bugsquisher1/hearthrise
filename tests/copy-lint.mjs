#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/copy-lint.mjs — PLAYER-FACING COPY READS LIKE A PERSON WROTE IT (b568)
//
//   node tests/copy-lint.mjs             gate: no copy slip in any src string
//   node tests/copy-lint.mjs --report    gate + every finding listed
//   node tests/copy-lint.mjs --selftest  mutation proof (one planted slip per rule)
//   node tests/copy-lint.mjs --prune-names  drop baseline rows whose name was fixed
//                                           (never adds a row: the ratchet only shrinks)
//   node tests/copy-lint.mjs --prune-voice  drop voice baseline rows whose line was rewritten (never adds one)
//
// WHY. Tyler, 2026-10-11, after playing: "craft 60 items in all — what? sounds
// like broken english". The slips are a CLASS, not a line: a quantity padded
// with "in all", "a"/"an" in front of a plural item ("an Apprentice Gloves"),
// a "(s)" plural hack, two spaces where one belongs, a "·" standing in for words.
// Each is cheap to write and cheap to catch, so this gate catches them.
//
// WHAT IS SCANNED. Every string and template literal in src/**/*.js (comments
// skipped by a small tokenizer; `${…}` holes become a placeholder), except the
// vendored bundle and the in-page test suite, whose strings are fixtures.
//
// THE RULES (each one a pattern a native reader trips over):
//   in-all        "<n> <things> in all"            → drop "in all"
//   plural-hack   "item(s)" / "worker(s)"          → pluralise for real
//   article       "a"/"an" before a plural item    → no article, or "a pair of"
//                 name from src/data/items.js
//   double-space  two spaces between words         → one
//   dot           a "·" in copy (lane/a-text-polish 2026-11-14: "Rename · 50 gp", "12 kills · Out of food" read as
//                 a generated dashboard, not a person) → words ("Rename for 50 gp"), a comma, a sentence,
//                 or one item a part in the layout (the bag's key help). A row of separately painted tags may
//                 still take src/render/format.js SEP between its spans; no literal carries the dot.
//   spelling      a British form (armour, colour, centre, grey, favourite,
//                 defence, cancelled, -ise…) — player copy is American
//                 (Tyler 2026-10-28); one-word labels are read too, and so is
//                 every CHANGELOG.md entry from v0.2.64 on (the welcome modal's text)
// THE VOICE (Discord playtest 2026-11-05, Andy: "so many ; in the text are a dead
// giveaway of AI writing", "pays" for XP, "...fits you"; Tyler: "we are getting
// absolutely flamed for the wording"). Read on the words: tags, HTML entities
// (&lsaquo;) and a CSS declaration list are not prose.
//   semicolon     a ";" in copy                   → two sentences, or "and"/"so"
//   em-dash       a "—" in copy (a name/label field's "Room — Rung" is a label)
//                                                 → a period or a comma
//   pays-xp       "pays (more) Level XP", also across "' pays ' + n + ' more XP'"
//                                                 → "earns"; gold is what pays
//   fits-you      "<ground> fits you(r Level)" in a sentence, and the list
//                 tag "Fits your level"           → "is right for", "awaits"
// THE PERSON TEST (Tyler 2026-11-09, on "Numbers for the Plain Fire Rune at Melee 1.": "the 'lint' needs to check
// whether it reads like a person wrote it"; the voice: docs/DESIGN_STANDARDS.md §3 "Tyler's voice"):
//   numbers-for   "Numbers for/at …"              → say what it does for you
//   reads-as      "reads as"                      → "looks like", or say what it is
//   the-version   "the version the slot casts"    → name the spell or the rune
//   this-slots    "this slot's", "this hero's"    → "your", or the name
//   per-unit      "per cast/use/shot/swing/hit"   → "each cast", "a shot" (a column's "g per shot" is a header)
//   server-talk   "The server says / does not know / has not priced", "loads from the server"
//                                                 → what the player gets ("Loading your house…")
//   stiff-word    "as used", "upon", "via", "thus", "therefore", "in order to", "utilize"…
//   set-to        "This hero is set to …"         → say what happens
//   jargon        "monsters a pull", "a four", "holds Deadly", "level floor", "stays struck"
//   label-sentence  a whole line "Label: a lower-case sentence." ("Drink: restores mana.")
//   no-verb       a sentence of 3+ words with no verb (text table rows only)
//   noun-stack    3+ game nouns in a row, "store rune tier" (text table rows only)
// Today's older hits are pinned in tests/copy-lint-voice.baseline.json ("<file>#<rule>#<text>"), which only shrinks:
//   stale-voice   a pinned line that was rewritten — drop its row (--prune-voice)
// THE CONTROLS (Tyler 2026-11-11, after "Start from what you wear" became "Use equipped": "Try to standardize language
// like that a bit more please"): a control says the genre's one word for its action (src/data/text/controls.js), and a
// sentence is for explanations, never for a button. Read on every static <button> or <summary> label in src/shell and
// src/app, on every controls.* row, and on any text table row keyed btn_/tab_/button_:
//   control-long     four or more words ("Pick a hunt for the party")   → the glossary word, plus at most a noun
//   control-period   a label that ends in a period                      → no period on a control
//   control-synonym  a near-synonym of a glossary word (Put away, Store, Stash, Wear, Take off, Forget it, No thanks,
//                    Unselect, Give up…)                                → the glossary word (CONTROL_SYNONYMS says which)
// What no pattern can judge, a reader does before each release: tools/player-read.local.mjs.
// plus a SHRINK-ONLY RATCHET on filler fantasy words in NAMES (DESIGN_STANDARDS
// §2): Shadow, Void, Ancient, Eternal, Dark, Forgotten (whole word, any case)
// in the `name`/`label`/`title`/`n` field of a data row under src/data/**.
// Prose fields ("it's dark") are not names and are not read. Today's hits are
// pinned in tests/copy-lint-names.baseline.json as "<file>#<name>" → word(s);
// they are renamed as each area is reworked.
//   filler-name   a name not in the baseline (or a new word on a pinned name)
//   stale-name    a pinned name that no longer exists — drop its row
//                 (--prune-names), so the baseline can never grow back
//
// Exit: 0 green · 1 a slip found · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { playerParts, codeish } from './text-home.mjs';

const HERE_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);

const SKIP = [
  /[\\/]vendor[\\/]/,
  /[\\/]features[\\/]smoke[\\/]/,
  /[\\/]features[\\/]smoke-test(-loader)?\.js$/,
];

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js') && !SKIP.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

/* A small JS tokenizer: enough to tell a comment from a string from a regex
   literal. Yields { text, at } (at = source offset) for every string/template literal. Template
   holes are replaced by "§" so "${n} items in all" is still read as copy. */
export function stringLiterals(src) {
  const out = [];
  const n = src.length;
  const REGEX_AFTER_WORD = /^(return|typeof|case|in|of|void|delete|throw|new|else|do|yield|await)$/;

  /* Scan code from `i`. With `hole` set, stop at the `}` that closes a
     template hole and return the index just past it. Template holes are code,
     so they are scanned by this same function (a regex or a quote inside a
     hole must not open a string). */
  function code(i, hole) {
    let prev = '';      // '' | 'a' (operand) | an operator char
    let word = '';
    let depth = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
      if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
      if (hole) {
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) return i + 1; depth--; }
      }
      if (c === '\'' || c === '"') {
        const start = i; let j = i + 1, s = '';
        while (j < n && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; } if (src[j] === '\n') break; s += src[j]; j++; }
        out.push({ text: s, at: start }); i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (c === '`') {
        const start = i; let j = i + 1, s = '';
        while (j < n && src[j] !== '`') {
          if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
          if (src[j] === '$' && src[j + 1] === '{') { j = code(j + 2, true); s += '§'; continue; }
          s += src[j]; j++;
        }
        out.push({ text: s, at: start }); i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (c === '/' && (prev !== 'a' || REGEX_AFTER_WORD.test(word))) {
        let j = i + 1, inClass = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (/[A-Za-z0-9_$]/.test(c)) { word = (/[A-Za-z0-9_$]/.test(src[i - 1] || '') ? word : '') + c; prev = 'a'; }
      else if (/[)\]]/.test(c)) { prev = 'a'; word = ''; }
      else if (!/\s/.test(c)) { prev = c; word = ''; }
      i++;
    }
    return i;
  }
  code(0, false);
  return out;
}

/* Plural item names: the LAST word of a catalogue name is a plural-only noun. */
const PLURAL_HEADS = new Set(['Gloves', 'Boots', 'Studs', 'Gauntlets', 'Greaves', 'Chaps', 'Vambraces',
  'Slippers', 'Arrows', 'Platelegs', 'Earrings', 'Irons', 'Bones', 'Drops', 'Shears', 'Tongs', 'Leggings',
  'Bracers', 'Plates', 'Runes', 'Seeds', 'Chips', 'Trousers', 'Sabatons', 'Salts']);
export function isPluralName(name) {
  const last = String(name || '').trim().split(/\s+/).pop();
  return PLURAL_HEADS.has(last);
}

/* Every catalogue name, read from the live ITEMS table (generated ladders
   included — "Bronze Gauntlets" is never a literal in the source). */
async function itemNames(root) {
  const mod = await import(pathToFileURL(join(root, 'src', 'data', 'items.js')).href);
  return [...new Set(Object.values(mod.ITEMS).map((i) => i && i.n).filter(Boolean))];
}

export function prose(text) {
  // Only lines that read as words: at least two words of letters.
  return /[A-Za-z]{2,}[ ,.;:!?'’—-]+[A-Za-z]{2,}/.test(text) || /·/.test(text);
}

/* Developer text is not copy: a literal inside a console.* call, an Error, a
   validator's message (`problems.push(`, `bad(`), or a catalogue's documentation
   field (`formula`, `where`, and the price catalogue's `server_needs` /
   `spends_at` / `anchor` / `origin`) never reaches a player. Read from the
   statement the literal sits in (back to the last ; { or }). */
export function devOnly(src, at) {
  const back = src.slice(Math.max(0, at - 600), at);
  const stmt = back.slice(Math.max(back.lastIndexOf(';'), back.lastIndexOf('{'), back.lastIndexOf('}')) + 1);
  if (/console\.\w+\(|Error\(|\blog\(|blockers\.push\(|problems\.push\(|\bbad\(/.test(stmt)) return true;
  return /["']?\b(formula|where|server_needs|spends_at|anchor|origin)["']?\s*:\s*$/.test(back);
}

/* One alternation for every plural name, compiled once per scan. */
export function pluralArticleRe(plurals) {
  if (!plurals || !plurals.length) return null;
  const alt = plurals.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('\\b[Aa]n? (?:' + alt + ')\\b');
}

/* THE VOICE rules' patterns (header). `pays` then up to three words of the same
   sentence, then (Level) XP: "every kill pays more XP", "pays 10% more Level XP". */
export const PAYS_XP_RE = /\bpa(?:y|ys|id|ying)\b(?:\s+[^\s.!?;:]+){0,3}?\s+(?:Level\s+)?(?:XP|experience)\b/i;
/* The two halves of "' pays ' + pct + ' more Level XP'": a literal ending on pay(s), the next one starting on (a word or two and) XP. */
export const PAYS_TAIL_RE = /\bpa(?:y|ys|id|ying)\s*$/i;
export const XP_HEAD_RE = /^\s*(?:[^\s.!?;:]+\s+){0,2}(?:Level\s+)?(?:XP|experience)\b/i;
/* A ground or a hunt that "fits you." / "fits your Level", in a sentence, a literal after a name (' fits you.') or a list tag
   ("Fits your level", the Hunts chip the playtest read on Wickstead). A glove that fits your hand is English. */
export const FITS_YOU_RE = /\bfits (?:you(?=\s*[.,;:!?)]|\s*$)|your (?:level|party|group)\b)/i;
/* A CSS declaration list ("display: none; color: red") is code, not a sentence. */
const CSS_LIST_RE = /^\s*(?:-{0,2}[a-z][a-z-]*\s*:\s*[^;:]+;\s*)+(?:-{0,2}[a-z][a-z-]*\s*:\s*[^;:]*)?$/;

/** The voice rules a prose literal breaks. `name`: it is a name/label field (an em dash there is a label's separator). */
export function voiceRules(text, name = false) {
  const w = String(text).replace(/<[^>]*>/g, ' ').replace(/&#?[A-Za-z0-9]+;/g, ' ');
  const hits = [];
  if (/;/.test(w) && !CSS_LIST_RE.test(w)) hits.push('semicolon');
  if (!name && /—/.test(w)) hits.push('em-dash');
  if (PAYS_XP_RE.test(w)) hits.push('pays-xp');
  if (FITS_YOU_RE.test(w)) hits.push('fits-you');
  if (colonJoins(w).length) hits.push('colon-join');
  return hits;
}

/* COLON JOINS (Tyler 2026-11-06, "did you fix all the shitty text"): a clause glued to another by ": " inside a sentence
   ("Creating a hero says there's nothing to choose: your hero owns every weapon"). A LABEL stays: 1 to 3 words before the
   colon in its sentence ("Food: store", "Gold: 12,875 gp", "Next step up: Mosslight Glade"), and so does a colon that
   opens a capitalized value ("Next gear at Level 22: Houndskin Cloak"). Flagged: 4+ words of the same sentence before
   it AND a lower-case word after it. A CSS declaration list is code. Returns the offending clause heads. */
export function colonJoins(text) {
  const w = String(text);
  if (CSS_LIST_RE.test(w)) return [];
  const out = [];
  for (const m of w.matchAll(/:\s+(?=[a-z])/g)) {
    const before = w.slice(0, m.index);
    /* the sentence it sits in: back to a sentence end, a line break (a line of labels, Tyler 2026-11-14), a tag gap, an open bracket or an
       attribute's opening quote */
    const sentence = before.slice(Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('\n'), before.lastIndexOf('\u0000'),
      before.lastIndexOf('('), before.lastIndexOf('="'), -1) + 1);
    const words = sentence.match(/[A-Za-z0-9§][\w'’%,.§-]*/g) || [];
    if (words.length >= 4) out.push(sentence.trim().slice(-60));
  }
  return out;
}

/* ── THE PERSON TEST (Tyler 2026-11-09) ───────────────────────────────────────────────────────────────────────────────
   "the 'lint' needs to check whether it reads like a person wrote it". The rules above read punctuation, so "Numbers for the
   Plain Fire Rune at Melee 1." passed and shipped. These name the shapes a person never says: a line that labels a field, or
   narrates the game's machinery instead of saying what happens to you (docs/DESIGN_STANDARDS.md §3 "Tyler's voice"). What no
   pattern can judge, a reader does: tools/player-read.local.mjs lists a release's new lines for the rubric. Each rule: its
   name, its pattern, and the fix a red run prints. */
const SERVER_TALK_RE = /\bthe server (?:does(?: not|n['’]t) (?:know|take)|says|has(?: not|n['’]t) (?:priced|named|said)|refused|keeps)\b|\b(?:loads?|reading\b[^.!?…]{0,40}?) from the server\b/i;
const JARGON_RE = /\bmonsters? (?:a|per|each) pull\b|\b(?:per|each|every) pull\b|\ba four\b(?!-)|\bholds? (?:Normal|Dangerous|Deadly)\b|\bout of (?:your|their) league\b|\b(?:level|band) floor\b|\bstays? struck\b/i;
export const PERSON_PHRASES = Object.freeze([
  ['numbers-for', /\bnumbers (?:for|at)\b/i, 'say what it does for you: "Hits for 12 to 18."'],
  ['reads-as', /\breads? as\b/i, '"looks like", or just say what it is'],
  ['the-version', /\b(?:the|this|that|which) version\b/i, 'name the spell or the rune'],
  ['this-slots', /\bthis (?:slot|hero|row|field|entry|character)['’]s\b/i, '"your", or the name: "Mira\'s bag"'],
  ['per-unit', /\bper (?:cast|use|shot|swing|hit)\b/i, '"each cast", "a shot"'],
  ['server-talk', SERVER_TALK_RE, 'say what the player gets: "Loading your house…", "This can\'t fire right now."'],
  ['stiff-word', /\b(?:as used|upon|via|thus|hence|therefore|in order to|prior to|utili[sz](?:e|es|ed|ing)|additionally|furthermore|moreover|whereas|thereby|respectively)\b/i,
    'the everyday word: "as you go", "on", "so", "to", "before", "use", "also"'],
  ['set-to', /\b(?:is|are) set to\b/i, 'say what happens: "You chose to leave the hunt instead of buying more."'],
  ['jargon', JARGON_RE, 'say it as a player would: "more monsters at once", "your party of four", "the slot is crossed out"'],
]);
/* A table column's unit ("g per shot, cheapest first") is a header a player reads as "gold per shot", not a sentence. */
const UNIT_HEADER_RE = /^\s*(?:g|gp|gold|XP|HP|mana)\s+per\s/i;
/* A field label glued to its explanation as one sentence ("Drink: restores mana.", "Requires: any weapon.", "Done: this hero is
   now Mira."): the whole line is 1 to 3 words, a colon, and a lower-case clause that ends on a period. A label with a value
   ("Cost: 25 mana, 1 Earth Rune (1 g)", "Gold: 12,875 gp", "Next gear at Level 22: Houndskin Cloak") stays. */
export const LABEL_SENTENCE_RE = /^[A-Z][\w’'&-]*(?: [\w’'&-]+){0,2}: [a-z§][^:]*[.!?]$/;
export const PERSON_FIX = Object.freeze(Object.fromEntries([...PERSON_PHRASES.map(([r, , fix]) => [r, fix]),
  ['label-sentence', 'say it as a sentence: "Restores mana.", "Works with any weapon."'],
  ['no-verb', 'give it a verb: "Build the one before it first.", "You can buy this one next."'],
  ['noun-stack', 'join the nouns with words: "the rune the store sells", "extra XP for a party"'],
  ['two-sentences', 'outside lore a line is a label ("Not enough gold", "Gold: 500 gp") or ONE instruction ("Shop → Sell all junk"): cut the second '
    + 'sentence, or make it its own label'],
  ['long-line', 'a label or an instruction is at most 12 words: say the label ("Recommended: 4+ players", "Requires Level 30")'],
  ['parenthetical', 'no aside in brackets: cut it, or make it its own label (a count, a unit or a key may stay: "(3)", "(12 gp)", "(E)")'],
  ['you-line', '"you"/"your" only inside one short instruction ("Pick your look"); a label drops it ("Gold: 500 gp", "Bag full", "In bag")'],
  ['coach-card', 'a coach card is a title of at most 4 words and ONE line of at most 10 words that names the press: "Shop → Sell all junk"'],
  ['unread-home', 'a src/data file with player sentences is read: add it to LABEL_DATA or EDGE_LABEL_DATA, or name it in NOT_LABEL_HOMES with why'],
  ['stale-label-pin', 'an edge file\'s pinned line was rewritten: drop its row (--prune-labels)']]));

/* ── THE LABEL FORM (Tyler 2026-11-14, 2026-11-16) ─────────────────────────────────────────────────────────────────────────────
   2026-11-14: "Recommended: 4+ players" was "Perfect. Now do it like that for everything outside of actual lore." 2026-11-16, angry, at the live
   coach card "Sell what only pays coin / Open the Shop and press Sell. Sell all junk sells what is only worth gold. Your Materials stay, like fuel
   for the Great Hearth (it raises your Inner Flame), ..." and the bag's "None yet. Your outfit is only a look.", "Your gold 500 gp" and "You haven't
   picked Deposit or Sell for anything yet. Pick one in an item's menu.": "Every time i read something in game i wonder how it slipped through." They
   slipped because the coach and wiki tables were exempt, an @sentence comment let a whole block out, and words written in code or in a data file were
   never read. So outside lore every line a player reads is a genre LABEL or ONE short instruction (the Huntera coach: a short title, one line, the press):
     two-sentences  more than one sentence on a line ("Label: value" segments are labels: "Heroes at once: 1. Sign out to pick Mira" stays)
     long-line      a line of more than LABEL_MAX_WORDS words (a row of labels breaks per line, so each line is read)
     parenthetical  words in brackets ("(it raises your Inner Flame)"); a count, a unit or a key stays: "(3)", "(12 gp)", "(E)"
     you-line       "you"/"your" outside one short instruction: "Pick your look" stays; "Your gold 500 gp" and "None yet. Your outfit is only a look." don't
     coach-card     a coach line (every card the coach shows, as stated, and every src/data/text/coach.js row): one line, one sentence, at most
                    COACH_MAX_WORDS words, opening on a verb, a path ("Shop → Sell all junk") or a label ("Next gear at Level 22: Houndskin Cloak");
                    a card's title (a coach.js row keyed *_title, a card's `title`) is at most COACH_TITLE_MAX_WORDS words, with no period
   READ ON: every row of src/data/text/*, every file in LABEL_DATA (the refusals, the coach, the UI data files), and every player piece written in
   src/shell, src/app, src/hunt-view and src/social (tests/text-home.mjs playerParts). LORE IS SENTENCES, by an explicit allowlist, never a pattern or a
   comment: LORE_ROWS names a file's lore rows (a key, or a key prefix ending in _). Every other src/data file that holds a sentence is named:
   EDGE_LABEL_DATA (edge-bundled, so its words change only with an edge deploy: each shown line that breaks a rule is pinned in
   tests/copy-lint-labels.baseline.json, which only shrinks, and a new one is red), or NOT_LABEL_HOMES with why (item flavor and a ground's story are
   lore; design notes are never shown). A data file in none of the lists with a line that breaks a rule is red (unread-home): no home slips in unread. */
export const LABEL_MAX_WORDS = 12;
export const COACH_MAX_WORDS = 10;
export const COACH_TITLE_MAX_WORDS = 4;
/* The lore rows, by file: a key, or a key prefix ending in _ (a plural row is read by its own key). */
export const LORE_ROWS = Object.freeze({
  'src/data/text/criers.js': ['say_'],                    // the criers call out in Local chat: NPC talk is lore (Tyler 2026-11-14)
  'src/data/text/factions.js': ['said_', 'join_lead'],    // Holly's and Venn's own words, and the March's story line
  'src/data/text/tally.js': ['say_'],                     // Tamsin talking at her board
  'src/data/town-works.js': ['about', 'aboutDone'],       // the Works' story: Havora raising the Weighhouse
  'src/data/hunts.js': ['theme'],                         // a ground's story line
});
/* The src/data files read like the text table (outside src/data/text/): the refusals, the coach and the data files a window shows as they are. */
export const LABEL_DATA = Object.freeze(['src/data/refusal-words.js', 'src/data/hunt-tutorial.js', 'src/data/armour-weights.js', 'src/data/party-words.js',
  'src/data/alerts.js', 'src/data/honor-roll.js', 'src/data/settings.js', 'src/data/social-settings.js', 'src/data/chat-channels.js', 'src/data/town-works.js',
  'src/data/hunt-after.js', 'src/data/outfits.js', 'src/data/shell-windows.js', 'src/data/combat-text.js', 'src/data/live-events.js', 'src/data/how-to-play.js',
  'src/data/skill-guide.js', 'src/data/fx-alpha.js', 'src/data/hud-widgets.js']);
/* Edge-bundled (tools/pack-edge.mjs walks them into hr-accrue): read like LABEL_DATA, and a line that breaks a rule today is pinned until the next edge deploy. */
export const EDGE_LABEL_DATA = Object.freeze(['src/data/hunt-sessions.js', 'src/data/training.js', 'src/data/boss-calls.js', 'src/data/boss-halls.js',
  'src/data/hunt-tiers.js', 'src/data/session-modes.js', 'src/data/condition-metrics.js', 'src/data/supply-basics.js', 'src/data/party.js',
  'src/data/scaled-hunts.js', 'src/data/hunt-roles.js', 'src/data/shops.js', 'src/data/elements.js', 'src/data/monster-classes.js', 'src/data/hunts.js']);
/* Never read for labels, each with why (a prefix ending in / is a whole directory). */
export const NOT_LABEL_HOMES = Object.freeze({
  'src/data/item-descriptions.js': 'lore: item flavor',
  'src/data/items.js': 'lore: item flavor (the burnt food\'s note)',
  'src/data/library2-items.js': 'lore: item flavor', 'src/data/slot-ladders.js': 'lore: item flavor', 'src/data/style-gear.js': 'lore: item flavor',
  'src/data/imbuements.js': 'lore: item flavor', 'src/data/champions.js': 'lore: item flavor', 'src/data/shields.js': 'lore: item flavor',
  'src/data/drinks.js': 'lore: item flavor', 'src/data/boss-forge.js': 'lore: item flavor', 'src/data/wave3-uniques.js': 'lore: item flavor',
  'src/data/jewelry.js': 'lore: item flavor', 'src/data/bosses.js': 'lore: a boss\'s story line',
  'src/data/grounds/': 'lore: a ground\'s story and its loot\'s flavor, and design notes', 'src/data/world/': 'names and design notes of the pixel world',
  'src/data/monster-art.js': 'design notes (the art review), never shown', 'src/data/catalogue-coherence.js': 'design notes, never shown',
  'src/data/item-effects.js': 'design notes, never shown', 'src/data/balance-sheet.js': 'design notes, never shown',
  /* each holds only its own validator's messages (a validate() list a test prints) or a documentation field */
  'src/data/bench-tax.js': 'validator messages and notes, never shown', 'src/data/consumables.js': 'validator messages, never shown',
  'src/data/factions.js': 'validator messages, never shown (its words are src/data/text/factions.js)', 'src/data/item-authority.js': 'documentation, never shown',
  'src/data/monster-spells.js': 'validator messages, never shown', 'src/data/party-class-xp.js': 'validator messages, never shown',
  'src/data/runes.js': 'validator messages, never shown', 'src/data/stamina-refill.js': 'validator messages, never shown',
  'src/data/tally-tasks.js': 'validator messages, never shown',
});
const homeOf = (rel) => (/^src\/data\/text\/[^/]+\.js$/.test(rel) || LABEL_DATA.includes(rel) ? 'table'
  : EDGE_LABEL_DATA.includes(rel) ? 'edge' : /^src\/(?:shell|app|hunt-view|social)\//.test(rel) ? 'code' : null);
export const notLabelHome = (rel) => Object.keys(NOT_LABEL_HOMES).some((k) => (k.endsWith('/') ? rel.startsWith(k) : rel === k));
/** Is `key` of `rel` a lore row (LORE_ROWS)? */
export function loreRow(rel, key) {
  const rows = LORE_ROWS[rel];
  return !!rows && !!key && rows.some((k) => (k.endsWith('_') ? key.startsWith(k) : key === k));
}
/** The row key a literal at `at` is the value of: `key: '…'`, or a plural row's own key for `one: '…'` / `other: '…'`. */
export function rowKey(src, at) {
  const back = src.slice(Math.max(0, at - 240), at);
  const m = /([A-Za-z_$][\w$]*)['"]?\s*:\s*$/.exec(back);
  if (!m) return null;
  if (!/^(?:zero|one|two|few|many|other)$/.test(m[1])) return m[1];
  const p = /([A-Za-z_$][\w$]*)['"]?\s*:\s*(?:Object\.freeze\(\s*)?\{[^{}]*$/.exec(back);
  return p ? p[1] : m[1];
}
/** The words a reader reads in a line (a {placeholder} or § is one word; a lone dash, arrow or plus sign is none). */
export function wordCount(text) {
  return (String(text).replace(/\{[a-z][A-Za-z0-9_]*\}/g, '§').match(/[A-Za-z0-9§][^\s]*/g) || []).length;
}
const YOU_RE = /\b(?:you|your|yours|yourself)\b|\byou['’](?:re|ll|ve|d)\b/i;
const PAREN_OK_RE = /^\s*(?:[+−-]?(?:§|\d[\d,.]*)\s*(?:%|[A-Za-z]{1,3})?|[x×]\s*(?:§|\d[\d,]*)|[A-Za-z0-9])\s*$/;
/* A CSS media query in a matchMedia() literal is code, not a bracket in a sentence. */
const MEDIA_RE = /\((?:hover|pointer|any-hover|any-pointer|prefers-[a-z-]+|(?:max|min)-(?:width|height))\s*:/;
const LABEL_SEG_RE = /^[A-Z§][\w’'&§-]*(?: [\w’'&§-]+){0,4}: \S/;
let IMPERATIVE = null;   /* built on first use: VERB_BASES is declared below */
const IMPERATIVE_MORE = Object.freeze(['don\'t', 'don’t', 'never', 'reload', 'tap', 'click', 'right-click', 'scroll', 'hover', 'unequip', 'deselect',
  'enable', 'disable', 'dispatch', 'bless', 'expand', 'refresh', 'sort', 'filter', 'search', 'dye', 'unlist', 'relist', 'harvest', 'log', 'sign']);
/** The sentences of one line ("Label: value" segments included). */
export const sentencesOf = (line) => String(line).split(/(?<=[.!?])\s+(?=[A-Z§"“'(\d])/).map((s) => s.trim()).filter((s) => /[A-Za-z]/.test(s));
const opensOnVerb = (line) => (IMPERATIVE ||= new Set([...VERB_BASES, ...IMPERATIVE_MORE])).has(String((String(line).match(/[A-Za-z][A-Za-z'’-]*/) || [''])[0]).toLowerCase());
/** One short instruction: one sentence, at most COACH_MAX_WORDS words, opening on a verb ("Pick your look", "Sign in again to keep playing"). */
export const instruction = (line) => sentencesOf(line).length === 1 && wordCount(line) <= COACH_MAX_WORDS && opensOnVerb(line);
/**
 * The LABEL FORM rules `raw` breaks (a row, or a piece a window shows). `kind`: 'title' for a coach card's title, 'line' for a coach card's line,
 * else null. Tags and entities are not words; a {placeholder}, `${…}` (§) or "{…}" is one word.
 */
export function labelForm(raw, kind = null) {
  const t = String(raw).replace(/<[^>]*>/g, ' ').replace(/&#?[A-Za-z0-9]+;/g, ' ').replace(/\{[a-z][A-Za-z0-9_:]*\}|\{…\}/g, '§');
  if (!/[A-Za-z]{2,}/.test(t) || MEDIA_RE.test(t) || CSS_LIST_RE.test(t)) return [];
  const lines = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter((l) => /[A-Za-z]/.test(l));
  const hits = new Set();
  for (const line of lines) {
    if (sentencesOf(line).filter((s) => !LABEL_SEG_RE.test(s)).length > 1) hits.add('two-sentences');
    if (wordCount(line) > LABEL_MAX_WORDS) hits.add('long-line');
    for (const m of line.matchAll(/\(([^()]*)\)/g)) if (!PAREN_OK_RE.test(m[1])) hits.add('parenthetical');
    if (YOU_RE.test(line) && !instruction(line)) hits.add('you-line');
  }
  const all = lines.join(' ');
  if (kind === 'title' && (lines.length > 1 || wordCount(all) > COACH_TITLE_MAX_WORDS || /\.\s*$/.test(all))) hits.add('coach-card');
  if (kind === 'line' && (lines.length > 1 || sentencesOf(all).length > 1 || wordCount(all) > COACH_MAX_WORDS
    || !(opensOnVerb(all) || /→/.test(all) || LABEL_SEG_RE.test(all)))) hits.add('coach-card');
  return [...hits];
}
/** A coach.js row's kind: its card titles, its card lines, and the two presses (controls, read by the control rules). */
const coachKind = (rel, key) => (rel !== 'src/data/text/coach.js' || !key || ['got_it', 'no_tips'].includes(key) ? null : /_title$/.test(key) ? 'title' : 'line');
/* THE EDGE PINS: an edge-bundled file's lines that broke a LABEL FORM rule the day the rules landed (2026-11-16), "<file>#<rule>#<text>". The list only
   shrinks: the next edge deploy rewrites them (the shown ones move to src/data/text/), --prune-labels drops a rewritten row, and a new hit is red. */
export const LABELS_BASELINE = join(HERE_ROOT, 'tests', 'copy-lint-labels.baseline.json');
export function readLabelPins(path = LABELS_BASELINE) {
  return new Set(JSON.parse(readFileSync(path, 'utf8')).hits || []);
}

/* A SENTENCE WITH NO VERB ("After the one before.", "The next home."): a sentence ending in . ! or ? with 3 or more words,
   none of them a verb. Read in the text table only, where every row is a whole sentence a window says: elsewhere a literal is
   often a sentence's tail, and item and creature flavor ("Short, heavy iron bolts.") is a description by design. The everyday
   fragments people do say ("Not enough gold.", "No friends yet.", "More after midnight UTC.") open on a word that carries them.
   A verb is a word of VERB_BASES in any form, any -ed or -ing word, or a contraction. A verb the lexicon lacks is ADDED here,
   never waived. */
const VERB_BASES = ('accept add affect afford aim allow apply arrive ask attack avoid bake be bear beat become begin believe belong bind bite '
  + 'bleed bless block boil boost bow break breathe brew bring build burn bury buy call cancel carry carve cast catch cause change charge '
  + 'chase check choose chop claim clean clear climb close collect come contain cook copy cost count cover craft create crush cut deal decide '
  + 'defend delete deliver deposit die dig do dodge drag draw dress drink drop dye earn eat empty end enter equip escape expect explain face '
  + 'fade fail fall feed feel fight fill find finish fire fish fit fix flee float fly follow forge forget fuel gain gather get give glow go '
  + 'grant grind grow guard guide hammer hand handle hang happen harvest hate have heal hear help hide hit hold hope hunt hurt improve include '
  + 'invite join jump keep kill know land last lead learn leave let level lift like link list live load lock look lose love make mark matter '
  + 'mean meet melt mend mine miss mix move name need note obey offer open order own pack paste pay pick place plant play point pop pour '
  + 'press prevent protect pull push put raise rank reach read receive recover refill refuse regrow release remember remove rename repair '
  + 'replant require reset rest restore return reveal ride rise roast roll rot run rust save say see seem sell send set sew shake share '
  + 'sharpen shield shine shoot shout show shut sign sink sit skip sleep slow smell smelt smith snap soak sow speak spend spill split spread '
  + 'stack stand start stay steal step stick stir stop store strike suit supply swap swing switch take talk taunt teach tell temper tend test '
  + 'thank think throw tick tie train trade travel treat try turn type unlock upgrade use wait wake walk want ward warn wash waste watch water '
  + 'wear weave weigh wield win wish withdraw wither work worry wrap write yield').split(' ');
const VERB_IRREGULAR = ('am is are was were been being has had does did done went gone got gotten made gave given took taken came saw seen knew '
  + 'known found left lost paid bought brought built caught chose chosen dealt drank drunk ate eaten fell fallen fed felt fought flew forgot froze '
  + 'grew grown heard held hid hung kept laid led lent lit meant met rode rang rose ran said sold sent shook shot sat slept spoke spent spun stood '
  + 'stole stuck struck swore swept swung taught told thought threw woke wore worn won wound wrote written bore borne bound bled broke broken '
  + 'began begun bit bitten blew blown burnt dug drew drawn drove driven can could will would shall should may might must').split(' ');
const VERBS = new Set(VERB_IRREGULAR);
for (const b of VERB_BASES) {
  for (const f of [b, b + 's', b + 'es', b + 'ed', b + 'd', b + 'ing']) VERBS.add(f);
  if (b.endsWith('e')) VERBS.add(b.slice(0, -1) + 'ing');
  if (b.endsWith('y')) { VERBS.add(b.slice(0, -1) + 'ies'); VERBS.add(b.slice(0, -1) + 'ied'); }
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(b)) { VERBS.add(b + b.slice(-1) + 'ed'); VERBS.add(b + b.slice(-1) + 'ing'); }
}
export function isVerb(word) {
  const x = String(word).toLowerCase().replace(/’/g, '\'');
  return VERBS.has(x) || /n't$|'(?:re|ll|ve|m|d)$/.test(x) || /^(?:it|that|there|here|what|who|he|she|let|where|how)'s$/.test(x)
    || (x.length >= 5 && /(?:ed|ing)$/.test(x));
}
/* 1 to 4 words, a colon, and a value: a label (the value may be a number, a placeholder or words). */
const LABEL_VALUE_RE = /^[A-Z][\w’'&-]*(?: [\w’'&-]+){0,3}: \S/;
const FRAGMENT_OPENER_RE = /^(?:No|Not|None|Nothing|More|Less|Still|Too|Already|Only|Best|Back|Plus|Never|Once|Same|Almost|Just|Yes|Thanks|Sorry|Up to|Out of)\b/;
/** The sentences of `text` (a text table row, placeholders as §) that have no verb. */
export function verbless(text) {
  const out = [];
  for (const m of String(text).matchAll(/[^.!?]+[.!?](?=\s|$)/g)) {
    const s = m[0].trim();
    const words = s.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    /* a LABEL with its value ("Heroes at once: 1.", "Time limit: 10 min.") is the genre's own form, not a sentence (Tyler 2026-11-14) */
    if (words.length < 3 || FRAGMENT_OPENER_RE.test(s) || LABEL_VALUE_RE.test(s) || words.some(isVerb)) continue;
    out.push(s);
  }
  return out;
}
/* NOUNS STACKED ("store rune tier", "party XP bonus"): three or more game nouns in a row with no word to join them. Text table
   only; a Title Case run is a name ("Gold Given") and stays. */
const STACK_NOUNS = new Set(('rune runes tier tiers slot slots setup setups xp hp mana gold plot plots ammo item items spell spells skill skills '
  + 'cooldown cooldowns purse bag party bonus stock price prices cap count rate fee level store hunt share pack').split(' '));
export function nounStacks(text) {
  const out = [];
  for (const run of String(text).split(/[^A-Za-z ]+/)) {
    const ws = run.trim().split(/\s+/).filter(Boolean);
    let n = 0;
    for (let i = 0; i < ws.length; i++) {
      const titled = /^[A-Z][a-z]/.test(ws[i]);
      n = !titled && STACK_NOUNS.has(ws[i].toLowerCase()) ? n + 1 : 0;
      if (n === 3) out.push(ws.slice(i - 2, i + 1).join(' '));
    }
  }
  return out;
}
/** The PERSON rules a prose literal breaks. `table`: it is a text table row (src/data/text/*), where no-verb and noun-stack read too. */
export function personRules(text, table = false) {
  const w = String(text).replace(/<[^>]*>/g, ' ').replace(/&#?[A-Za-z0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const hits = [];
  for (const [rule, re] of PERSON_PHRASES) if (re.test(w) && !(rule === 'per-unit' && UNIT_HEADER_RE.test(w))) hits.push(rule);
  if (LABEL_SENTENCE_RE.test(w)) hits.push('label-sentence');
  if (table && verbless(w).length) hits.push('no-verb');
  if (table && nounStacks(w).length) hits.push('noun-stack');
  return hits;
}

/* ── THE CONTROLS (Tyler 2026-11-11) ──────────────────────────────────────────────────────────────────────────────────
   One standard word per action, everywhere (src/data/text/controls.js is the glossary). A control label is read from a
   static <button>/<summary> in src/shell or src/app, from every controls.* row, and from a text table row keyed
   btn_/tab_/button_. A feature noun after the word is fine (Dispatch loot, Sell all junk, Leave party); a sentence is not.
   CONTROL_SYNONYMS: the near-synonym a writer reaches for → the glossary word the control says instead. The selftest holds
   that every target is a glossary row's value, so the table cannot drift from the glossary. */
export const CONTROL_SYNONYMS = Object.freeze({
  'put away': 'Deposit', store: 'Deposit', stash: 'Deposit', 'take out': 'Withdraw',
  wear: 'Equip', 'put it on': 'Equip', 'take off': 'Unequip', 'wear this outfit': 'Equip',
  'forget it': 'Cancel', 'never mind': 'Cancel', 'no thanks': 'Decline', 'give up': 'Abandon', unselect: 'Deselect',
  'go back': 'Back', 'back to the list': 'Back', return: 'Back', purchase: 'Buy', erase: 'Delete', shut: 'Close', apply: 'Use',
  'save here': 'Use equipped', 'start from what you wear': 'Use equipped', 'save current setup': 'New setup',
  'start with party': 'Enter with party', 'start anyway': 'Enter anyway', 'keep in bag': 'Keep', 'deposit in storage': 'Deposit',
});
export const CONTROL_KEY_RE = /(?:^|_)(?:btn|tab|button)(?:_|$)/;
/** A control label, as the player reads it: the back glyph, entities, a trailing ellipsis and a count in brackets dropped. */
export function controlLabel(text) {
  return String(text).replace(/&[a-z#0-9]+;/gi, ' ').replace(/[‹›×…]/g, ' ').replace(/\{[a-z][A-Za-z0-9_]*\}/g, 'x').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
}
/** The control rules `text` breaks: ['control-long' | 'control-period' | 'control-synonym', …]. */
export function controlRules(text) {
  const raw = String(text).trim();
  const label = controlLabel(raw);
  if (!/[A-Za-z]/.test(label)) return [];
  const hits = [];
  if (label.split(' ').length > 3) hits.push('control-long');
  if (/\.$/.test(raw)) hits.push('control-period');
  if (Object.prototype.hasOwnProperty.call(CONTROL_SYNONYMS, label.toLowerCase())) hits.push('control-synonym');
  return hits;
}
/** The static button and summary labels written in one literal: [{ label }] ("' + t('controls.equip') + '" is no literal). */
export function buttonLabels(text) {
  const out = [];
  for (const m of String(text).matchAll(/<(button|summary)\b[^>]*>([^<§]*)<\/\1>/g)) { const l = m[2].trim(); if (l) out.push(l); }
  return out;
}
export const CONTROL_FIX = Object.freeze({
  'control-long': 'a control says the glossary word, plus at most a noun (src/data/text/controls.js): "Pick a hunt", "Use equipped"',
  'control-period': 'a control is not a sentence: drop the period',
  'control-synonym': 'say the glossary word instead (tests/copy-lint.mjs CONTROL_SYNONYMS says which): Deposit, not Put away',
});
const CONTROL_DIRS_RE = /[\\/]src[\\/](?:shell|app)[\\/]/;
const CONTROLS_TABLE_RE = /[\\/]src[\\/]data[\\/]text[\\/]controls\.js$/;

/* THE PERSON DEBT: the lines that broke a PERSON rule the day the rules landed (2026-11-09), pinned as "<file>#<rule>#<text>"
   in tests/copy-lint-voice.baseline.json and rewritten batch by batch (.claude/coordination/voice-sweep.txt holds the next
   batch). The list only shrinks: a new line is red, and a pinned line that no longer exists is red as stale-voice until its row
   is dropped (--prune-voice, which never adds one). */
export const VOICE_BASELINE = join(HERE_ROOT, 'tests', 'copy-lint-voice.baseline.json');
export function readVoiceBaseline(path = VOICE_BASELINE) {
  return new Set(JSON.parse(readFileSync(path, 'utf8')).hits || []);
}
const voiceKey = (rel, rule, text) => rel + '#' + rule + '#' + String(text).replace(/\s+/g, ' ').trim();

export function lintText(text, pluralRe, name = false) {
  const hits = voiceRules(text, name);
  const t = text.replace(/<[^>]*>/g, ' \u0000 ');   // tags are not copy; keep a gap marker
  /* also a literal glued to the number before it ("' + n + ' heroes in all'", "' in all'"): it starts with the space */
  if (/\b\d[\d,]*\s+[a-z]+(\s+[a-z]+)?\s+in all\b|§\s+[a-z]+(\s+[a-z]+)?\s+in all\b|^\s+(?:[a-z]+\s+){0,2}in all\b/i.test(t)) hits.push('in-all');
  if (/[A-Za-z]\(s\)/.test(t)) hits.push('plural-hack');
  const segs = t.split('\u0000');
  if (segs.some((seg) => !/\n/.test(seg) && /[A-Za-z0-9.,!?;:’']  +[A-Za-z0-9(]/.test(seg))) hits.push('double-space');
  if (segs.some((seg) => /·/.test(seg))) hits.push('dot');
  if (pluralRe && pluralRe.test(t)) hits.push('article');
  if (britishWords(t).length) hits.push('spelling');
  return hits;
}

/* AMERICAN SPELLING in player copy (Tyler 2026-10-28: "centre in the change
   log? Center."). A British form read as a whole word — not part of an id,
   a path, a class or a selector ("armour-weights.js", `[data-combat="defence"]`
   stay silent: code names are not copy). The fix is the American form. */
export const BRITISH_RE = new RegExp('(?<![-\\w/.$])(?:'
  + 'armour(?:s|ed|ing|er|ers|y)?|colour(?:s|ed|ful|ing|less)?|centre[sd]?|jeweller(?:y|s)?'
  + '|grey(?:s|ed|ish|er)?|favourite[s]?|honour(?:s|ed|able|ing)?|behaviour(?:s|al)?|(?:centi|kilo|milli)?metre[s]?'
  + '|travell(?:ing|ed|er|ers)|cancell(?:ed|ing)|levell(?:ed|ing|er|ers)|labell(?:ed|ing)|defence[s]?|offence[s]?'
  + '|practis(?:e|ed|es|ing)|plough(?:s|ed|ing)?|mould(?:s|ed|ing|y|ering)?|storey[s]?|smoulder(?:s|ed|ing)?'
  + '|sombre|savoury|rumour[s]?|flavour(?:s|ed|ful)?|valour|vapour[s]?|harbour(?:s|ed)?|labour(?:s|ed|er)?'
  + '|neighbour(?:s|ing|hood)?|odour[s]?|splendour|theatre[s]?|fibre[s]?|sabre[s]?|lustre|spectre[s]?|sceptre[s]?'
  + '|paralys(?:e|ed|es|ing)|analys(?:e|ed|es|ing)|sulphur|prised'
  + '|(?:organi|recogni|reali|apologi|prioriti|customi|finali|minimi|maximi|optimi|summari|speciali|visuali'
  + '|authori|categori|carameli|personali|standardi|memori|critici|stabili|neutrali|normali|utili|crystalli'
  + '|materiali|mobili|immobili|sympathi|energi|harmoni|fertili|sterili|weaponi)s(?:e|ed|es|ing|ation|ations)'
  + ')(?![-\\w/])', 'gi');
export function britishWords(text) {
  const t = String(text).replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  return [...t.matchAll(BRITISH_RE)].map((m) => m[0]);
}

/* THE CHANGELOG IS PLAYER TEXT TOO (the welcome modal reads it; the Discord note is cut from it): every entry from
   CHANGELOG_FROM on is read for British spelling, `code` and link targets skipped. Older entries are history and are
   left as they shipped (Tyler 2026-10-28: the sweep starts at v0.2.64). */
export const CHANGELOG_FROM = '0.2.64';
const semver = (v) => v.split('.').map(Number);
const atLeast = (v, from) => { const a = semver(v), b = semver(from); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
/* The PERSON rules read the entries from PERSON_FROM on (the first release after they landed, 2026-11-09); older entries
   shipped before them and stay as they are. */
export const PERSON_FROM = '0.2.113';
export function changelogFindings(text, file = 'CHANGELOG.md') {
  const out = [];
  let on = false, person = false;
  String(text).split(/\r?\n/).forEach((line, i) => {
    const h = /^## v(\d+\.\d+\.\d+)\b/.exec(line);
    if (h) { on = atLeast(h[1], CHANGELOG_FROM); person = atLeast(h[1], PERSON_FROM); }
    if (!on) return;
    const plain = line.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']');
    const words = britishWords(plain);
    if (words.length) out.push({ file, line: i + 1, rule: 'spelling', text: words.join(', ') + ' — ' + line.slice(0, 90) });
    /* THE VOICE on every body line the welcome modal shows (2026-11-06); the `## vX.Y.Z — date (Title)` heading keeps its dash */
    const body = plain.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '');
    if (!h) for (const rule of [...voiceRules(body), ...(person ? personRules(body) : [])]) out.push({ file, line: i + 1, rule, text: line.slice(0, 110) });
  });
  return out;
}

/* SERVER-HELD PLAYER TEXT (lane/c-copy-server, 2026-11-06): the SQL functions whose sentences GoTrue or the client hand a
   player word for word. Each is read at its NEWEST definition in apply order (tests/schema-apply-order.json `order`), so a
   restating migration fixes it and an old file's history stays as it shipped. Its quoted strings are read like copy: the
   voice rules and American spelling. A new player-facing SQL function joins this list. */
export const SQL_COPY_FUNCTIONS = Object.freeze(['hr_beta_gate_message', 'hr_beta_signup_message']);
/** `files`: [[name, sql], ...] in apply order. Findings for each listed function's newest body. */
export function sqlCopyFindings(files, fns = SQL_COPY_FUNCTIONS) {
  const out = [];
  for (const fn of fns) {
    const head = new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + fn + '\\s*\\(', 'i');
    const last = [...files].reverse().find(([, sql]) => head.test(sql));
    if (!last) { out.push({ file: 'supabase/migrations', line: 0, rule: 'sql-copy', text: fn + ' is defined by no migration in the apply order' }); continue; }
    const [name, sql] = last;
    const from = sql.search(head);
    const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from));
    const start = from + open.index + open[0].length;
    const body = sql.slice(start, sql.indexOf(open[0], start)).replace(/--[^\n]*/g, ' ');
    for (const m of body.matchAll(/'((?:[^']|'')*)'/g)) {
      const text = m[1].replace(/''/g, '\'');
      if (!prose(text)) continue;
      const line = sql.slice(0, start + m.index).split('\n').length;
      for (const rule of [...voiceRules(text), ...personRules(text), ...(britishWords(text).length ? ['spelling'] : [])]) {
        out.push({ file: 'supabase/migrations/' + name, line, rule, text: fn + ': ' + text.slice(0, 100) });
      }
    }
  }
  return out;
}
function chainSql(root) {
  const order = JSON.parse(readFileSync(join(root, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  return order.map((n) => [n, readFileSync(join(root, 'supabase', 'migrations', n), 'utf8').replace(/\r\n/g, '\n')]);
}

/* A waiver is one known literal the next edge deploy removes (edge-bundled
   files move only with that deploy), or a slip the text table UNCOVERED: a
   sentence glued from pieces hid it from these rules, and moving its words into
   src/data/text/ (lane/b-text-home) may not change them, so it waits for Tyler's
   wording review. A waiver that no longer matches is stale and fails the gate,
   so it is deleted the day its fix lands. */
/* (The four bar.js rune_needs_* rows, "Needs a Fire rune for each cast: you carry none.", were rewritten in the 2026-11-09
   voice sweep: "Each cast uses a Fire rune, and you have none.") */
const WAIVERS = [];
const usedWaivers = new Set();
function waived(root, f, rule, text) {
  const rel = relative(root, f).split(sep).join('/');
  const w = WAIVERS.find((x) => x.file === rel && x.rule === rule && text.includes(x.text));
  if (w) usedWaivers.add(w);
  return !!w;
}

/* Every player sentence the windows show lives in src/data/text/ (src/render/player-text.js reads it). */
const TEXT_TABLE_RE = /[\\/]src[\\/]data[\\/]text[\\/][^\\/]+\.js$/;

/* opts.files: scan only these files (the selftest's plants); opts.article: the
   article helper to exercise (default src/render/article.js under root). */
export async function scan(root, opts = {}) {
  const files = opts.files || walk(join(root, 'src'));
  const plurals = (await itemNames(root)).filter(isPluralName);
  const pluralRe = pluralArticleRe(plurals);
  const findings = [];
  /* opts.voice: the pinned PERSON keys to honour (default: the baseline on a full scan, none on planted files; a caller that
     passes its own set gets no stale-voice check unless it sets opts.checkStale). */
  const pinned = opts.voice || (opts.files ? new Set() : readVoiceBaseline());
  const seenVoice = new Set();
  /* opts.labels: the edge pins to honour (default: the baseline on a full scan, none on planted files) */
  const labelPins = opts.labels || (opts.files ? new Set() : readLabelPins());
  const seenPins = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const lits = stringLiterals(src);
    const rel = relative(root, f).split(sep).join('/');
    /* the path from src/ on (a selftest plant sits under a temp dir's own src/) */
    const srcRel = (/(?:^|\/)(src\/.*)$/.exec(rel) || [, rel])[1];
    const home = homeOf(srcRel);
    /* THE TEXT TABLE (src/data/text/*, lane/b-text-home): a row's {placeholder} is a hole, read like a template's ${…}. */
    const table = TEXT_TABLE_RE.test(f);
    for (let i = 0; i < lits.length; i++) {
      const { at } = lits[i];
      const text = table ? lits[i].text.replace(/\{[a-z][A-Za-z0-9_]*\}/g, '§') : lits[i].text;
      if (devOnly(src, at)) continue;
      /* A one-word label ("Armour", ' colour ') is copy too for spelling: a
         capitalised word or one with a space round it. A bare lower-case
         token ('armour', 'armour/helm') is an id, never read. */
      const name = NAME_KEY_RE.test(src.slice(Math.max(0, at - 40), at));
      const rules = prose(text) ? lintText(text, pluralRe, name)
        : (/^[A-Z]|\s/.test(text) && britishWords(text).length ? ['spelling'] : []);
      /* "' pays ' + pct + ' more Level XP'": the slip split across a join (the next literal, after a + only) */
      const next = lits[i + 1];
      if (next && !rules.includes('pays-xp') && PAYS_TAIL_RE.test(text) && XP_HEAD_RE.test(next.text)
        && /^[^;{}]{0,160}\+\s*$/.test(src.slice(at + 1 + text.length, next.at)) && !devOnly(src, next.at)) rules.push('pays-xp');
      /* THE JOINS (v0.2.100 played: "Iron, Studded, Adept: bodies, legs; Bramble Blade"): a bare "; " or " — " literal glues
         player words together in code (`.join('; ')`, `a + '; ' + b`, `${a}; ${b}`), so no prose literal ever holds the slip.
         A bare ";" or "—" with no space after it is a code token (a map legend, a cache key) or a table's empty cell, and stays quiet. */
      if (!rules.includes('semicolon') && /^\s*;\s+$|§\s*;\s+§/.test(text)) rules.push('semicolon');
      if (!rules.includes('em-dash') && /^\s+—\s+$/.test(text)) rules.push('em-dash');
      /* THE PERSON TEST: a pinned line (the voice baseline) is the debt the sweep pays down, anything else is red. */
      const person = prose(text) ? personRules(text, table) : [];
      /* THE LABEL FORM: every row, refusal and UI data line outside LORE_ROWS, and every player piece written in code (the windows) */
      const labels = [];
      /* a selector, an id or a class list is code; a coach anchor's about (hunt-tutorial.js TUTORIAL_ANCHORS) is its documentation */
      /* a data row's {placeholder} is a hole like the table's (else its brace reads as code and the row goes unread) */
      const row = home === 'code' ? text : lits[i].text.replace(/\{[a-z][A-Za-z0-9_]*\}/g, '§');
      if (home && prose(row) && !codeish(row) && !/\banchor\(\s*$/.test(src.slice(Math.max(0, at - 20), at))) {
        const key = home === 'code' ? null : rowKey(src, at);
        if (!loreRow(srcRel, key)) {
          const pieces = home === 'code' ? playerParts(lits[i].text) : [row];
          for (const p of pieces) for (const r of labelForm(p, coachKind(srcRel, key))) labels.push([r, p]);
        }
      }
      /* THE CONTROLS: a controls.* row, a btn_/tab_/button_ row, or a static <button>/<summary> label in src/shell or src/app */
      const controls = [];
      if (table) {
        const key = (/([a-z][a-z0-9_]*)\s*:\s*$/.exec(src.slice(Math.max(0, at - 40), at)) || [])[1];
        if (CONTROLS_TABLE_RE.test(f) || (key && CONTROL_KEY_RE.test(key))) for (const r of controlRules(lits[i].text)) controls.push([r, lits[i].text]);
      } else if (CONTROL_DIRS_RE.test(f)) {
        for (const l of buttonLabels(text)) for (const r of controlRules(l)) controls.push([r, l]);
      }
      if (!rules.length && !person.length && !controls.length && !labels.length) continue;
      const line = src.slice(0, at).split('\n').length;
      for (const rule of rules) {
        if (waived(root, f, rule, text)) continue;
        findings.push({ file: rel, line, rule, text: text.replace(/\s+/g, ' ').slice(0, 110) });
      }
      for (const [rule, label] of controls) findings.push({ file: rel, line, rule, text: label.replace(/\s+/g, ' ').slice(0, 110) });
      for (const [rule, piece] of labels) {
        /* an edge-bundled file's line is pinned until the next edge deploy; every other home's is red now */
        const pin = home === 'edge' ? srcRel + '#' + rule + '#' + piece.replace(/\s+/g, ' ').trim() : null;
        if (pin && labelPins.has(pin)) { seenPins.add(pin); continue; }
        findings.push({ file: rel, line, rule, text: piece.replace(/\s+/g, ' ').slice(0, 140), ...(pin ? { pin } : {}) });
      }
      for (const rule of person) {
        const key = voiceKey(rel, rule, text);
        if (pinned.has(key)) { seenVoice.add(key); continue; }
        findings.push({ file: rel, line, rule, text: text.replace(/\s+/g, ' ').slice(0, 110), key });
      }
    }
  }
  if (!opts.files) for (const w of WAIVERS) if (!usedWaivers.has(w)) findings.push({ file: w.file, line: 0, rule: 'stale-waiver', text: w.text });
  usedWaivers.clear();
  if (opts.checkStale ?? (!opts.files && !opts.voice)) for (const k of pinned) {
    if (!seenVoice.has(k)) findings.push({ file: k.slice(0, k.indexOf('#')), line: 0, rule: 'stale-voice', text: k.slice(k.indexOf('#') + 1).slice(0, 110) + ' (rewritten: drop the row, --prune-voice)' });
  }
  if (opts.checkStale ?? (!opts.files && !opts.labels)) for (const k of labelPins) {
    if (!seenPins.has(k)) findings.push({ file: k.slice(0, k.indexOf('#')), line: 0, rule: 'stale-label-pin', text: k.slice(k.indexOf('#') + 1).slice(0, 110) + ' (rewritten: drop the row, --prune-labels)' });
  }
  return { files: files.length, plurals: plurals.length, findings };
}

/* EVERY DATA HOME IS NAMED (the label form's last rule): a src/data file outside the text table, LABEL_DATA, EDGE_LABEL_DATA and NOT_LABEL_HOMES with a
   line that breaks a LABEL FORM rule is red once, as unread-home. `files`: absolute paths (default every src/data file). */
export function unreadHomes(root, files = walk(join(root, 'src', 'data'))) {
  const out = [];
  for (const f of files) {
    const rel = relative(root, f).split(sep).join('/');
    const srcRel = (/(?:^|\/)(src\/.*)$/.exec(rel) || [, rel])[1];
    if (homeOf(srcRel) || notLabelHome(srcRel)) continue;
    const src = readFileSync(f, 'utf8');
    const hit = stringLiterals(src).find(({ text, at }) => !devOnly(src, at) && prose(text) && labelForm(text).length);
    if (hit) out.push({ file: rel, line: src.slice(0, hit.at).split('\n').length, rule: 'unread-home', text: hit.text.replace(/\s+/g, ' ').slice(0, 110) });
  }
  return out;
}

/* THE COACH, AS SHOWN: every card's title and its lines as written on the row (a card stated from the facts is read from its coach.js rows, and
   tests/hunt-core/sewer.mjs reads each stated card against labelForm on the walk-through's facts). */
export async function coachFindings(root) {
  const { HUNT_TUTORIAL } = await import(pathToFileURL(join(root, 'src', 'data', 'hunt-tutorial.js')).href);
  const out = [];
  for (const c of HUNT_TUTORIAL) {
    for (const [field, kind] of [['title', 'title'], ['text', 'line'], ['inWindow', 'line']]) {
      if (typeof c[field] !== 'string') continue;
      for (const rule of labelForm(c[field], kind)) out.push({ file: 'src/data/hunt-tutorial.js', line: 0, rule, text: c.id + '.' + field + ': ' + c[field].slice(0, 120) });
    }
  }
  return out;
}

/* ── Filler words in names (shrink-only ratchet) ─────────────────────── */
export const FILLER_RE = /\b(shadow|void|ancient|eternal|dark|forgotten)\b/gi;
const NAME_KEY_RE = /(?:^|[{,\s])["']?(?:name|label|title|n)["']?\s*:\s*$/;
export const NAMES_BASELINE = join(HERE_ROOT, 'tests', 'copy-lint-names.baseline.json');

export function fillerWords(text) {
  const w = [...String(text).matchAll(FILLER_RE)].map((m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
  return [...new Set(w)].sort().join(',');
}

/* Every name-field literal in the given files that carries a filler word:
   Map("<rel file>#<name>" → { words: "Word[,Word]", line }). Keyed by the name
   text, not the line, so moving a row never reads as new or stale. */
export function fillerNames(root, files) {
  const hits = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(root, f).split(sep).join('/');
    for (const { text, at } of stringLiterals(src)) {
      if (!NAME_KEY_RE.test(src.slice(Math.max(0, at - 40), at))) continue;
      const words = fillerWords(text);
      if (!words) continue;
      const id = `${rel}#${text}`;
      if (!hits.has(id)) hits.set(id, { words, line: src.slice(0, at).split('\n').length });
    }
  }
  return hits;
}

export function readNamesBaseline(path = NAMES_BASELINE) {
  return JSON.parse(readFileSync(path, 'utf8')).hits || {};
}

/* New hits fail; a pinned row that no longer matches fails as stale. */
export function nameFindings(hits, baseline, checkStale = true) {
  const out = [];
  for (const [id, { words, line }] of hits) {
    if (baseline[id] === words) continue;
    const file = id.slice(0, id.indexOf('#'));
    out.push({ file, line, rule: 'filler-name', text: `${id.slice(file.length + 1)} (${words}) — pick a concrete name (DESIGN_STANDARDS §2)` });
  }
  if (checkStale) for (const [id, words] of Object.entries(baseline)) {
    if (hits.has(id) && hits.get(id).words === words) continue;
    const file = id.slice(0, id.indexOf('#'));
    out.push({ file, line: 0, rule: 'stale-name', text: `${id.slice(file.length + 1)} (${words}) — renamed: drop the row (--prune-names)` });
  }
  return out;
}

function dataNames(root) { return fillerNames(root, walk(join(root, 'src', 'data'))); }

/* Drops fixed rows only; a row is never added here, so the baseline can only shrink. */
function pruneNames(root) {
  const doc = JSON.parse(readFileSync(NAMES_BASELINE, 'utf8'));
  const hits = dataNames(root);
  const kept = {};
  for (const [id, words] of Object.entries(doc.hits)) if (hits.has(id) && hits.get(id).words === words) kept[id] = words;
  const dropped = Object.keys(doc.hits).length - Object.keys(kept).length;
  doc.hits = kept;
  writeFileSync(NAMES_BASELINE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`copy-lint --prune-names: dropped ${dropped} row(s), ${Object.keys(kept).length} pinned`);
  return 0;
}

async function gate(root, report) {
  const { files, plurals, findings } = await scan(root);
  const baseline = readNamesBaseline();
  findings.push(...nameFindings(dataNames(root), baseline));
  findings.push(...changelogFindings(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')));
  findings.push(...sqlCopyFindings(chainSql(root)));
  findings.push(...unreadHomes(root), ...await coachFindings(root));
  if (report || findings.length) for (const f of findings) console.log(`  ${f.rule.padEnd(12)} ${f.file}:${f.line}  ${f.text}`);
  /* a red PERSON rule says its fix once, and where the voice is written down */
  const fixes = [...new Set(findings.map((f) => f.rule))].filter((r) => PERSON_FIX[r]);
  for (const r of fixes) console.log(`  fix ${r}: ${PERSON_FIX[r]}`);
  if (fixes.length) console.log('  (the voice: docs/DESIGN_STANDARDS.md §3 "Tyler\'s voice")');
  for (const r of [...new Set(findings.map((f) => f.rule))].filter((r) => CONTROL_FIX[r])) console.log(`  fix ${r}: ${CONTROL_FIX[r]}`);
  console.log(`copy-lint: ${files} files, ${plurals} plural item names, ${Object.keys(baseline).length} pinned filler name(s), ${readVoiceBaseline().size} pinned person line(s), `
    + `${readLabelPins().size} pinned edge label line(s), ${findings.length} slip(s)`);
  return findings.length ? 1 : 0;
}

/* Drops the edge pins whose line was rewritten; a row is never added here, so the list can only shrink. */
async function pruneLabels(root) {
  const doc = JSON.parse(readFileSync(LABELS_BASELINE, 'utf8'));
  const live = new Set((await scan(root, { labels: new Set() })).findings.filter((f) => f.pin).map((f) => f.pin));
  const kept = doc.hits.filter((k) => live.has(k));
  const dropped = doc.hits.length - kept.length;
  doc.hits = kept;
  writeFileSync(LABELS_BASELINE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`copy-lint --prune-labels: dropped ${dropped} row(s), ${kept.length} pinned`);
  return 0;
}

/* Drops the voice baseline's rewritten rows only; a row is never added here, so the debt can only shrink. */
async function pruneVoice(root) {
  const doc = JSON.parse(readFileSync(VOICE_BASELINE, 'utf8'));
  const live = new Set((await scan(root, { voice: new Set() })).findings.filter((f) => f.key).map((f) => f.key));
  const kept = doc.hits.filter((k) => live.has(k));
  const dropped = doc.hits.length - kept.length;
  doc.hits = kept;
  writeFileSync(VOICE_BASELINE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`copy-lint --prune-voice: dropped ${dropped} row(s), ${kept.length} pinned`);
  return 0;
}

/* Mutation proof: the real tree must be green; then one slip per rule is
   planted in a temp file and each rule must fire on it; a comment carrying the
   same slips must stay silent; and the pre-b568 vowel-only article helper must
   be caught by the runtime rule. */
async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'copy-lint-'));
  let bad = 0;
  try {
    const clean = await scan(HERE_ROOT);
    clean.findings.push(...nameFindings(dataNames(HERE_ROOT), readNamesBaseline()));
    if (clean.findings.length) { console.log(`  selftest: the real tree is not green (${clean.findings.length})`); bad++; }
    const plant = join(tmp, '__copy_lint_plant.js');
    const cases = [
      ['in-all', "export const a = { label: 'Smith 60 items in all' };"],
      ['in-all', "export const a = 'Costs 9 gold, up to ' + n + ' heroes in all.';"],
      ['in-all', "export const a = pct + '% less XP lost' + (t > 1 ? ' in all' : '');"],
      ['plural-hack', "export const a = `${n} item(s) left in your bag`;"],
      ['article', "export const a = 'Craft an Apprentice Gloves first';"],
      ['double-space', "export const a = 'Your crops are  ready to pick';"],
      ['dot', "export const a = 'Lv 3 ·4h grow';"],
      ['dot', "export const a = { rename: 'Rename · {price}' };"],
      ['dot', "export const a = name + ' · ' + level;"],
      ['spelling', "export const a = 'Requires Defence 30 to wear';"],
      ['spelling', "export const TIP = { absorb: 'Heavy armour: the share of every blow it takes.' };"],
      ['spelling', "export const a = [{ key: 'armor', label: 'Armour' }];"],
      ['spelling', "export const a = r + ' colour ' + i;"],
      ['spelling', "export const a = 'Pick your favourite grey cloak from the centre rack';"],
      ['spelling', "export const a = 'Organise the bag: it was cancelled while travelling';"],
      ['semicolon', "export const a = 'One house for all your heroes. Gold comes from your purse; materials from your bag.';"],
      ['semicolon', "export const a = 'Bought today: ' + n + '; each one costs more.';"],
      ['semicolon', "export const a = `Defensive takes ${d} less damage; Offensive deals more.`;"],
      ['em-dash', "export const a = { one: 'You ran out of gold for supplies — the hunt ended.' };"],
      ['em-dash', "export const a = 'Buy a hero slot — ' + whole(cost) + ' gold';"],
      ['pays-xp', "export const a = 'Every kill pays Level XP and fills the ring around your Level.';"],
      ['pays-xp', "export const a = 'They cost more food, and every kill pays more XP.';"],
      ['pays-xp', "export const a = 'Each kill pays ' + PCT(t.xpPm) + ' more Level XP, with the same gold.';"],
      ['pays-xp', "export const a = `Each kill pays ${pct} more experience`;"],
      ['fits-you', "export const a = 'Keep hunting until Level 5. Then ' + name + ' fits you. You can close the game.';"],
      ['fits-you', "export const a = HUNT.name + ' fits your Level with a party. ' + how;"],
      ['fits-you', "export function tag(party) { return party ? 'Fits your party' : 'Fits your level'; }"],
      ['semicolon', "export const a = (e) => [e.slots.join(', '), e.weapons.join(', ')].filter(Boolean).join('; ');"],
      ['semicolon', "export const a = (n, u, l) => 'You are missing ' + n + ' ' + u + '; ' + l + ' would be wasted.';"],
      ['semicolon', "export const a = (x, y) => `${x}; ${y}`;"],
      ['em-dash', "export const a = (lv, have) => 'Needs Level ' + lv + ' — ' + have;"],
      ['colon-join', "export const a = 'Creating a hero says there is nothing to choose: your hero owns every weapon.';"],
      ['colon-join', "export const a = (g) => `Hunt again is off: a hunt is already running in ${g}.`;"],
    ];
    for (const [rule, body] of cases) {
      writeFileSync(plant, '// planted\n' + body + '\n');
      const r = await scan(HERE_ROOT, { files: [plant] });
      const hit = r.findings.some((f) => f.rule === rule && f.file.endsWith('__copy_lint_plant.js'));
      console.log(`  ${hit ? 'caught' : 'MISSED'}  ${rule}`);
      if (!hit) bad++;
    }
    // The text table (src/data/text/*): a row's {placeholder} reads as a hole, so "{count} items in all" is a slip
    // there, and the same row anywhere else is not read as one.
    mkdirSync(join(tmp, 'src', 'data', 'text'), { recursive: true });
    const tablePlant = join(tmp, 'src', 'data', 'text', '__copy_lint_table.js');
    const row = "export const T = Object.freeze({ crafted: 'Smith {count} items in all' });\n";
    writeFileSync(tablePlant, row);
    writeFileSync(plant, row);
    const inTable = (await scan(HERE_ROOT, { files: [tablePlant] })).findings.some((f) => f.rule === 'in-all');
    const outside = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === 'in-all');
    console.log(`  ${inTable && !outside ? 'caught' : 'MISSED'}  a text table row's {placeholder} reads as a number`);
    if (!inTable || outside) bad++;
    // The CHANGELOG: an entry from CHANGELOG_FROM on is read (the real file is green), an older one is history,
    // and a British word in `code` or a link target is not copy.
    const log = (v) => '# Changelog\n\n## v' + v + ' — 2026-10-30 (Colors)\n\n**Armor.** The grey cloak is your favourite.\n`armour-weights.js` [notes](docs/armour.md)\n';
    const cl = [changelogFindings(readFileSync(join(HERE_ROOT, 'CHANGELOG.md'), 'utf8')).length === 0,
      changelogFindings(log('0.2.65')).length === 1 && /grey, favourite/.test(changelogFindings(log('0.2.65'))[0].text),
      changelogFindings(log('0.2.63')).length === 0,
      changelogFindings(log('0.2.65') + '- Trying colors on is free; saving them costs gold.\n- It stays on your bar and says why: it waits.\n').map((x) => x.rule).join() === 'spelling,semicolon,colon-join',
      changelogFindings(log('0.2.63') + '- Trying colors on is free; saving them costs gold.\n').length === 0];
    for (const [ok, what] of [[cl[0], 'the CHANGELOG is green'], [cl[1], 'spelling in a CHANGELOG entry from ' + CHANGELOG_FROM], [cl[2], 'an older CHANGELOG entry is left as it shipped'],
      [cl[3], 'the voice rules in a CHANGELOG entry body from ' + CHANGELOG_FROM + ' (its heading keeps its dash)'], [cl[4], 'the voice rules leave an older entry alone']]) {
      console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${what}`);
      if (!ok) bad++;
    }
    // Code names are not copy: an id, an import path, a selector, a class.
    writeFileSync(plant, "import { W } from './armour-weights.js';\nexport const a = ['armour', 'armour/helm', '[data-combat=\"defence\"] b', '<i class=\"hw-tip-flavour\">Gray wool</i>', 'Hearthrise rises at sunrise'];\n");
    const ids = await scan(HERE_ROOT, { files: [plant] });
    const idLeak = ids.findings.some((f) => f.rule === 'spelling');
    console.log(`  ${idLeak ? 'FALSE-POSITIVE' : 'ignored'}  spelling in ids / paths / selectors / classes`);
    if (idLeak) bad++;
    // The voice rules read words only: gold that pays, the list's tag, an HTML entity, a CSS list, a label's
    // separator, a validator's message, a price catalogue's notes, and an en dash in a range all stay silent.
    const VOICE = ['semicolon', 'em-dash', 'pays-xp', 'fits-you', 'colon-join'];
    writeFileSync(plant, "export const a = ['Tamsin pays for kills, and in armor too.', 'The Shop pays more for gear than for scraps of XP.', 'Right for your level', 'A glove that fits your hand like its own skin',"
      + " '<button>&lsaquo; All settings</button> and the rest', 'display: none; color: var(--ink)', 'Best with a party of 2–4 heroes',"
      + " 'Food: store, then your own bread', 'Gold: 12,875 gp', 'Next gear at Level 22: Houndskin Cloak', 'Runes: Plain Fire Rune from the store'];\n"
      + "export const R = { id: 'room.cellar.1', name: 'Cellar — Root Cellar', server_needs: 'player_state holds the COUNT; the server prices it — never the client' };\n"
      + "function v(bad) { bad('L-COVER', 'is drawn behind a roof; the hero standing there would be hidden'); }\n"
      + "export const cell = (r) => (r.per === null ? '—' : String(r.per));\n"
      + "export function ev(bad) { if (bad.length) throw new Error('makeEvent: ' + bad.join('; ')); }\n");
    const quiet = await scan(HERE_ROOT, { files: [plant] });
    const loud = quiet.findings.filter((f) => VOICE.includes(f.rule));
    console.log(`  ${loud.length ? 'FALSE-POSITIVE' : 'ignored'}  voice rules on gold, tags, entities, CSS, labels, dev text${loud.length ? ': ' + loud.map((f) => f.rule + ' ' + f.text).join(' | ') : ''}`);
    if (loud.length) bad++;
    // Server-held copy: the newest definition of a listed SQL function is read; an older one is history; a function no file defines is red.
    const sqlBad = "create or replace function public.hr_beta_gate_message(p_reason text)\nreturns text language sql immutable as $$\n  select case p_reason when 'x' then 'That invite code was not recognised. Check it for typos — or ask; we answer fast.' end\n$$;\n";
    const sqlGood = sqlBad.replace('was not recognised. Check it for typos — or ask; we answer fast.', 'was not recognized. Check it for typos, or ask in the Discord.');
    const sqlRed = sqlCopyFindings([['a.sql', sqlBad]], ['hr_beta_gate_message']).map((f) => f.rule).sort().join(',');
    const sqlNewest = sqlCopyFindings([['a.sql', sqlBad], ['b.sql', sqlGood]], ['hr_beta_gate_message']).length;
    const sqlNone = sqlCopyFindings([['b.sql', sqlGood]], ['hr_no_such_copy']).some((f) => f.rule === 'sql-copy');
    const sqlReal = sqlCopyFindings(chainSql(HERE_ROOT)).length;
    const sqlWithoutFix = sqlCopyFindings(chainSql(HERE_ROOT).filter(([n]) => n !== '2027-03-18-invite-refusal-words.sql')).length;
    for (const [ok, what] of [[sqlRed === 'em-dash,semicolon,spelling', 'sql-copy: an em dash, a semicolon and "recognised" in a SQL copy function (' + sqlRed + ')'],
      [sqlNewest === 0, 'sql-copy: only the newest definition is read'], [sqlNone, 'sql-copy: a listed function no migration defines'],
      [sqlReal === 0, 'sql-copy: the real chain is green'], [sqlWithoutFix > 0, 'sql-copy: the chain without 2027-03-18-invite-refusal-words.sql is red (' + sqlWithoutFix + ')']]) {
      console.log(`  ${ok ? 'caught' : 'MISSED'}  ${what}`);
      if (!ok) bad++;
    }
    // THE PERSON TEST: each rule bites a planted line (the phrase and label rules anywhere in src).
    const personCases = [
      ['numbers-for', "export const a = 'Numbers for the Plain Fire Rune at Melee 1.';"],
      ['numbers-for', "export const a = (s, l) => `Numbers at ${s} ${l}.`;"],
      ['reads-as', "export const a = 'Bag worth now reads as your gold.';"],
      ['the-version', "export const a = 'Shows the version the slot casts at your level.';"],
      ['this-slots', "export const a = 'Takes it from this hero\\'s bag first.';"],
      ['this-slots', "export const a = 'Fires when this slot’s item runs low.';"],
      ['per-unit', "export const a = 'Better ammo costs a little per shot.';"],
      ['server-talk', "export const a = 'The server does not know this ability.';"],
      ['server-talk', "export const a = 'Your field loads from the server.';"],
      ['server-talk', "export const a = 'Reading your house from the server…';"],
      ['stiff-word', "export const a = 'Pick the store rune to buy one as used.';"],
      ['stiff-word', "export const a = 'Your hero rests upon returning to town.';"],
      ['set-to', "export const a = 'This hero is set to end the hunt instead of buying.';"],
      ['jargon', "export const a = n + ' monsters a pull, hitting harder';"],
      ['jargon', "export const a = 'The slot stays struck until you wield a Bow.';"],
      ['jargon', "export const a = 'A four at the Glade holds Deadly as before.';"],
      ['label-sentence', "export const a = 'Requires: any weapon.';"],
      ['label-sentence', "export const a = { t: 'Drink: restores mana.' };"],
    ];
    for (const [rule, body] of personCases) {
      writeFileSync(plant, '// planted\n' + body + '\n');
      const hit = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === rule);
      console.log(`  ${hit ? 'caught' : 'MISSED'}  ${rule}: ${body.slice(body.indexOf('=') + 2, body.length - 1)}`);
      if (!hit) bad++;
    }
    // no-verb and noun-stack read the text table only: each bites a table row, and the same row elsewhere stays quiet.
    for (const [rule, row] of [['no-verb', "after: 'After the one before.'"], ['no-verb', "home: 'The next home.'"],
      ['no-verb', "nums: 'Numbers for the {rune} at {skill} {level}.'"], ['noun-stack', "tier: 'Pick a store rune tier for this slot.'"],
      ['noun-stack', "bonus: 'Your party xp bonus grows with each role.'"]]) {
      const body = 'export const T = Object.freeze({ ' + row + ' });\n';
      writeFileSync(tablePlant, body);
      writeFileSync(plant, body);
      const inT = (await scan(HERE_ROOT, { files: [tablePlant] })).findings.some((f) => f.rule === rule);
      const outT = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === rule);
      console.log(`  ${inT && !outT ? 'caught' : 'MISSED'}  ${rule} in the text table only: ${row}`);
      if (!inT || outT) bad++;
    }
    // Lines judged fine stay quiet: connection trouble, a unit header, "per kill", lore that says "rather than", a pull that is a
    // verb, a label with a value, a new version, a four-hero party, and (in the table) the fragments people really say.
    writeFileSync(plant, "export const a = ['Bronze Arrows are free and never run out.', 'g per shot, cheapest first', 'chance per kill, hunting alone',"
      + " 'Set more whenever you like.', 'Clawed at the knuckle out of habit rather than design', 'Could not reach the server. Check your connection and try again.',"
      + " 'The server did not answer. Reload to try again.', 'No connection. Your heroes keep hunting on the server, and the world loads by itself when you are back online.',"
      + " 'Climb down the ladder into the cellar.', 'Makes the monsters near you attack you.', 'Cost: 25 mana, 1 Earth Rune (1 g)', 'Food: store, then your own bread',"
      + " 'Next gear at Level 22: Houndskin Cloak', 'A new version of Hearthrise is out. Reload to get it.', 'The hunt screen stutters less in a four-hero party.',"
      + " 'Taunt pulls the monsters near you onto you.', 'The Thicket takes parties from Level 5, with bigger pulls.', 'Your hero holds the line until the pack breaks.',"
      + " 'Name this hero first.'];\n");
    writeFileSync(tablePlant, "export const T = Object.freeze({ a: 'Not enough gold.', b: 'No friends yet.', c: 'More after midnight UTC.', d: 'Already on its way.',"
      + " e: 'Create your new hero in it.', f: 'Paste it anywhere.', g: 'It ranks every hero in Havora.', h: 'Spells cost mana, and drinks bring it back.',"
      + " i: 'Store supplies cost gold as your hero uses them.', j: 'Every skill level counts toward this board.', k: 'Planted {crop} in plot {n}.',"
      + " l: '{now}. Finished.', m: 'The Gold Given Board ranks accounts.', n: 'Hung over the door, torn and proud.', o: 'Up to {n} heroes can play at once.',"
      + " p: 'You’re out of {item}. Your next food or drink slot takes over.', q: 'Your bag holds {count} stacks.' });\n");
    const PERSON = Object.keys(PERSON_FIX);
    const fine = [...(await scan(HERE_ROOT, { files: [plant] })).findings, ...(await scan(HERE_ROOT, { files: [tablePlant] })).findings]
      .filter((f) => PERSON.includes(f.rule));
    console.log(`  ${fine.length ? 'FALSE-POSITIVE' : 'ignored'}  PERSON rules on lines judged fine${fine.length ? ': ' + fine.map((f) => f.rule + ' ' + f.text).join(' | ') : ''}`);
    if (fine.length) bad++;
    // THE LABELS (Tyler 2026-11-14): the rejected group warning is red as a table row; the same row in the criers' table (lore), under an
    // @sentence comment, or outside the text table is quiet; a row after the tagged block's blank line is red again; the labels he
    // approved ("Recommended: 4+ players", a line of labels with breaks, a label and its value) trip no rule at all.
    const HASK = "'Captain Hask is built for a group of four or more. Alone, you still fight him, and he can kill you.'";
    const labelHits = async (file, body) => { writeFileSync(file, body); return (await scan(HERE_ROOT, { files: [file] })).findings.filter((f) => f.rule === 'label-long').length; };
    const criersPlant = join(tmp, 'src', 'data', 'text', 'criers.js');
    const lr = [
      ['a long system row in the table', await labelHits(tablePlant, 'export const T = Object.freeze({ party_boss: ' + HASK + ' });\n'), 1],
      ['the same row in the criers\' table (lore)', await labelHits(criersPlant, 'export const T = Object.freeze({ party_boss: ' + HASK + ' });\n'), 0],
      ['the same row under @sentence', await labelHits(tablePlant, 'export const T = Object.freeze({\n  /* her talk (@sentence: NPC talk is lore) */\n  a: ' + HASK + ',\n  b: ' + HASK + ',\n\n  c: ' + HASK + ',\n});\n'), 1],
      ['the same line outside the table', await labelHits(plant, 'export const a = ' + HASK + ';\n'), 0],
      ['the same line as a refusal (src/data/refusal-words.js)', await labelHits(join(tmp, 'src', 'data', 'refusal-words.js'), 'export const W = { party_size: ' + HASK + ' };\n'), 1],
    ];
    for (const [what, got, want] of lr) {
      console.log(`  ${got === want ? (want ? 'caught' : 'ignored') : want ? 'MISSED' : 'FALSE-POSITIVE'}  label-long: ${what} (${got} of ${want})`);
      if (got !== want) bad++;
    }
    writeFileSync(tablePlant, "export const T = Object.freeze({ a: 'Recommended: {n}+ players', b: 'Hits harder than on the ground\\n50% HP: adds attack your non-tanks\\n25% HP: hits even harder\\nEnds if anyone dies',"
      + " c: 'Heroes at once: 1. Sign out to pick {name}', d: 'Cost: {fee} gp, win or lose\\nNo XP, coin or drops\\nTime limit: {minutes} min', e: 'Requires Level 30', f: 'Not enough gold' });\n");
    const labelsFine = (await scan(HERE_ROOT, { files: [tablePlant] })).findings;
    console.log(`  ${labelsFine.length ? 'FALSE-POSITIVE' : 'ignored'}  the genre labels Tyler approved${labelsFine.length ? ': ' + labelsFine.map((f) => f.rule + ' ' + f.text).join(' | ') : ''}`);
    if (labelsFine.length) bad++;
    // The voice baseline: a pinned line is quiet, a pin shelters only its own file, and a pinned line that is gone is stale-voice.
    writeFileSync(plant, "export const a = 'The server says this cannot fire now.';\n");
    const unpinned = (await scan(HERE_ROOT, { files: [plant] })).findings.find((f) => f.rule === 'server-talk');
    const pinnedQuiet = !!unpinned && !(await scan(HERE_ROOT, { files: [plant], voice: new Set([unpinned.key]) })).findings.some((f) => f.rule === 'server-talk');
    const other = join(tmp, '__copy_lint_other.js');
    writeFileSync(other, "export const a = 'The server says this cannot fire now.';\n");
    const ownFile = !!unpinned && (await scan(HERE_ROOT, { files: [other], voice: new Set([unpinned.key]) })).findings.some((f) => f.rule === 'server-talk');
    const staleV = (await scan(HERE_ROOT, { voice: new Set([...readVoiceBaseline(), 'src/data/items.js#server-talk#A line that was rewritten']), checkStale: true }))
      .findings.some((f) => f.rule === 'stale-voice' && f.text.startsWith('server-talk#A line that was rewritten'));
    // The CHANGELOG: the PERSON rules read entries from PERSON_FROM on; an older entry shipped before them.
    const plog = (v) => '# Changelog\n\n## v' + v + ' (Words)\n\n- The server says this cannot fire now.\n';
    const clNew = changelogFindings(plog(PERSON_FROM)).some((f) => f.rule === 'server-talk');
    const clOld = changelogFindings(plog('0.2.100')).some((f) => f.rule === 'server-talk');
    for (const [ok, what] of [[pinnedQuiet, 'a pinned PERSON line is quiet'], [ownFile, 'a pin shelters only its own file'],
      [staleV, 'stale-voice (a rewritten line\'s row left behind)'], [clNew && !clOld, 'PERSON rules in a CHANGELOG entry from ' + PERSON_FROM + ', not before']]) {
      console.log(`  ${ok ? 'caught' : 'MISSED'}  ${what}`);
      if (!ok) bad++;
    }
    // A waiver only shelters its own literal: a new slip in an edge-bundled file is red.
    writeFileSync(plant, "export const D = { x: 'Bones and grief. Crush them; poison does nothing to the dead.' };\n");
    const sheltered = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === 'semicolon');
    console.log(`  ${sheltered ? 'caught' : 'MISSED'}  a waived literal outside its own file`);
    if (!sheltered) bad++;
    // A waiver whose literal is gone (rewritten on the edge lane) goes red until its row is deleted.
    WAIVERS.push({ file: 'src/data/items.js', rule: 'em-dash', text: 'a literal that was rewritten' });
    const staleW = (await scan(HERE_ROOT)).findings.some((f) => f.rule === 'stale-waiver' && f.text === 'a literal that was rewritten');
    WAIVERS.pop();
    console.log(`  ${staleW ? 'caught' : 'MISSED'}  stale-waiver (a fixed literal's row left behind)`);
    if (!staleW) bad++;
    // THE CONTROLS: a button label in src/shell that is a sentence, one that ends in a period, and a near-synonym of a glossary
    // word each bite; a controls.* row and a btn_ row are read the same way; a feature noun, a question and a glued label stay
    // quiet; a prose literal with no button is not a control; and every synonym's target is a glossary row's value.
    mkdirSync(join(tmp, 'src', 'shell', 'windows'), { recursive: true });
    const shellPlant = join(tmp, 'src', 'shell', 'windows', '__copy_lint_buttons.js');
    const CONTROL = ['control-long', 'control-period', 'control-synonym'];
    const controlHits = async (file) => (await scan(HERE_ROOT, { files: [file] })).findings.filter((f) => CONTROL.includes(f.rule)).map((f) => f.rule + ':' + f.text).sort();
    writeFileSync(shellPlant, "export const h = '<button type=\"button\" class=\"hh-tool\">Start from what you wear</button>'\n"
      + "  + '<button type=\"button\">Put away</button><button type=\"button\">Take off</button><summary class=\"hh-tool\">Filter lines now please</summary>'\n"
      + "  + '<button type=\"button\" data-hs-act=\"x\">Save the setup.</button>';\n");
    const loudC = await controlHits(shellPlant);
    const wantLoud = ['control-long:Filter lines now please', 'control-long:Start from what you wear', 'control-period:Save the setup.',
      'control-synonym:Put away', 'control-synonym:Start from what you wear', 'control-synonym:Take off'].sort();
    const bit = JSON.stringify(loudC) === JSON.stringify(wantLoud);
    console.log(`  ${bit ? 'caught' : 'MISSED'}  control-long / control-period / control-synonym on planted buttons${bit ? '' : ': ' + loudC.join(' | ')}`);
    if (!bit) bad++;
    const controlsPlant = join(tmp, 'src', 'data', 'text', 'controls.js');
    writeFileSync(controlsPlant, "export const CONTROLS_TEXT = Object.freeze({ deposit: 'Put it in the chest', keep: 'Keep.', drop: 'Give up' });\n");
    writeFileSync(tablePlant, "export const T = Object.freeze({ btn_go: 'Go on to the next one', tab_x: 'Store', note: 'Put away {count} stacks in all the chests.' });\n");
    const rowsLoud = [...await controlHits(controlsPlant), ...await controlHits(tablePlant)].sort();
    const wantRows = ['control-long:Go on to the next one', 'control-long:Put it in the chest', 'control-period:Keep.', 'control-synonym:Give up', 'control-synonym:Store'].sort();
    const rowsBit = JSON.stringify(rowsLoud) === JSON.stringify(wantRows);
    console.log(`  ${rowsBit ? 'caught' : 'MISSED'}  the control rules on controls.* rows and btn_/tab_ rows, not on a prose row${rowsBit ? '' : ': ' + rowsLoud.join(' | ')}`);
    if (!rowsBit) bad++;
    writeFileSync(shellPlant, "export const h = '<button type=\"button\">Dispatch loot</button><button type=\"button\">Delete it?</button><button type=\"button\">&lsaquo; Back</button>'\n"
      + "  + '<button type=\"button\">' + t('controls.equip') + '</button><button type=\"button\">All (' + o.max + ')</button>'\n"
      + "  + '<button type=\"button\" class=\"hh-tool\" data-hs-act=\"sell-sel\">Sell selected</button>';\n"
      + "export const p = 'Put away 12 Bones. You can take off the cape in your bag whenever you like.';\n");
    const quietC = await controlHits(shellPlant);
    console.log(`  ${quietC.length ? 'FALSE-POSITIVE' : 'ignored'}  control rules on feature nouns, a question, a glyph, a glued label, a count and prose${quietC.length ? ': ' + quietC.join(' | ') : ''}`);
    if (quietC.length) bad++;
    const glossary = new Set(Object.values((await import(pathToFileURL(join(HERE_ROOT, 'src', 'data', 'text', 'controls.js')).href)).CONTROLS_TEXT));
    const strays = Object.entries(CONTROL_SYNONYMS).filter(([, to]) => !glossary.has(to));
    console.log(`  ${strays.length ? 'FAILED' : 'ok    '}  every CONTROL_SYNONYMS target is a glossary word${strays.length ? ': ' + strays.map(([k, v]) => k + ' → ' + v).join(', ') : ''}`);
    if (strays.length) bad++;
    // A comment is not copy.
    writeFileSync(plant, "/* 'Smith 60 items in all' */\n// 'item(s)' 'an Apprentice Gloves'\nexport const a = 1;\n");
    const c = await scan(HERE_ROOT, { files: [plant] });
    const leaked = c.findings.some((f) => f.file.endsWith('__copy_lint_plant.js'));
    console.log(`  ${leaked ? 'FALSE-POSITIVE' : 'ignored'}  comment`);
    if (leaked) bad++;
    // Filler names: a new filler name goes red; the same words in a prose
    // field stay silent; a stale baseline row goes red.
    writeFileSync(plant, "export const M = { wolf: { name: 'Eternal Shadow Wolf', desc: 'It hunts where it is dark and forgotten.' } };\n");
    const nh = fillerNames(HERE_ROOT, [plant]);
    const newHit = nameFindings(nh, readNamesBaseline(), false)
      .some((f) => f.rule === 'filler-name' && f.text.startsWith('Eternal Shadow Wolf (Eternal,Shadow)'));
    console.log(`  ${newHit ? 'caught' : 'MISSED'}  filler-name (new name)`);
    if (!newHit) bad++;
    const prosy = nh.size !== 1;
    console.log(`  ${prosy ? 'FALSE-POSITIVE' : 'ignored'}  filler word in a prose field`);
    if (prosy) bad++;
    const stale = nameFindings(dataNames(HERE_ROOT), { ...readNamesBaseline(), 'src/data/monsters.js#Forgotten Ghoul': 'Forgotten' });
    const staleHit = stale.some((f) => f.rule === 'stale-name' && f.text.startsWith('Forgotten Ghoul'));
    console.log(`  ${staleHit ? 'caught' : 'MISSED'}  stale-name (baseline row with no name behind it)`);
    if (!staleHit) bad++;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(bad ? `copy-lint selftest: ${bad} FAILED` : 'copy-lint selftest: every rule bites');
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exit(argv.includes('--selftest') ? await selftest()
      : argv.includes('--prune-names') ? pruneNames(HERE_ROOT)
      : argv.includes('--prune-voice') ? await pruneVoice(HERE_ROOT)
      : argv.includes('--prune-labels') ? await pruneLabels(HERE_ROOT)
      : await gate(HERE_ROOT, argv.includes('--report')));
  } catch (e) { console.error('copy-lint harness error:', e); process.exit(2); }
}
