#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hearthfind-mint-guard.mjs — A HEARTHFIND MINTS NOTHING, AND NOTHING
//                                   MAKES ONE MORE LIKELY.
//
// ── WHY THIS FILE EXISTS, AND WHY IT EXISTS SEPARATELY ──────────────────────
// Three files in this feature CITE this guard by name as the reason a property
// is safe to rely on:
//
//   src/core/hearthfind.js   "NOTHING SCALES THIS … asserted by
//                             tests/hearthfind-mint-guard.mjs"
//   src/data/hearthfind.js   "what makes the mint-leak guard … provable rather
//                             than aspirational"
//   src/data/items.js        "what makes tests/hearthfind-mint-guard.mjs a proof"
//
// On 2026-09-08 the Security review measured that the file did not exist. Three
// citations, zero assertions — which is the most expensive kind of comment in
// this repository, because a reader who greps the name and finds a filename in
// a header stops looking. A cited guard that is missing is worse than no guard:
// it is a guard somebody has already trusted. (tests/guard-hygiene.mjs exists
// for the sibling failure — the guard that exists but nothing runs.)
//
// It stays SEPARATE from tests/hearthfind-roll.mjs (which asserts the roll's
// determinism, AWAY-1 parity and one-roll-site properties, and does carry
// overlapping MINT assertions) for the reason the citations imply: the two
// sentences being cited are ECONOMIC INVARIANTS about the DATA, not claims
// about the engine's behaviour, and they must stay checkable in a file that
// needs no simulation, no seeds and no engine at all. This one reads two data
// modules and one source file, in milliseconds. If the roll guard is ever
// deleted, split or rewritten, the two properties the item table promises are
// still asserted somewhere.
//
// ── THE TWO PROPERTIES ──────────────────────────────────────────────────────
//   MINT-G1  THE ROLL TAKES NO MODIFIER. `rollHearthfind` has exactly the four
//            parameters (index, kind, id, rng) and its body mentions no
//            multiplier, rate, bonus, luck or perk term. This is the structural
//            form of the Feature Slate's "must NOT be purchasable or boostable
//            by anything paid": a roll that has nowhere to put a multiplier
//            cannot acquire one by accident, and a future author who wants one
//            must change a signature that a guard is watching.
//
//            ⚠ SIGNATURE, NOT BEHAVIOUR. hearthfind-roll.mjs ROLL-4 proves that
//              dropMult / dropRate / the featured multiplier do not MOVE a find
//              in a real simulated span. That is the behavioural half and it is
//              the stronger measurement. This half is the one that survives a
//              rewrite of the engine, because it reads the door rather than the
//              room.
//
//   MINT-G2  EVERY hearthfind ITEM IS v:0 AND BIND-ON-PICKUP. `v:0` keeps a
//            trophy out of the vendor (a find mints ZERO gold); `bop:true`
//            keeps it off the player market (a find can never become a second
//            gold bridge — the muster_seal rule). Together they are what make
//            "the rarest event in the game moves no value" a fact about the
//            data rather than a promise in a header. Also asserted: the
//            hearthfind:true set and src/data/hearthfind.js's HEARTHFIND_ITEMS
//            allowlist are the SAME set (a trophy in one and not the other is
//            either an unreachable item or an item the generator mirrors into
//            the server catalogue without the flags above), and no trophy is a
//            currency.
//
// ── THE MUTATION PROOF ──────────────────────────────────────────────────────
//   node tests/hearthfind-mint-guard.mjs             # the guard
//   node tests/hearthfind-mint-guard.mjs --selftest  # every mutation must be RED
//
// Each mutation plants a REAL defect in an IN-MEMORY copy of the data or of the
// source text — nothing on disk is touched — and --selftest fails unless every
// one of them turns the run red. The two the Security review named explicitly
// are `tradeable_trophy` (a planted tradeable trophy) and `one_in_multiplier`
// (a planted `oneIn` multiplier parameter on the roll).
//
// Credential-free, database-free, browser-free. NO ?v= on the imports (this is
// tests/**, not a browser module — b332).
//
// Exit: 0 green · 1 a property is violated (or a mutation was not caught).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { ITEMS } from '../src/data/items.js';
import { HEARTHFIND_ITEMS } from '../src/data/hearthfind.js';
import { rollHearthfind } from '../src/core/hearthfind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'src', 'core', 'hearthfind.js');
/* THE TWO ROLL SITES. MINT-G5 reads them: a signature with nowhere to put a
   multiplier proves nothing if the CALLER computes one and smuggles it in
   through `index` or through a hand-built row. */
const CALL_SITES = [
  ['src/core/combat-sim.js', join(ROOT, 'src', 'core', 'combat-sim.js')],
  ['src/core/skill-sim.js', join(ROOT, 'src', 'core', 'skill-sim.js')],
];

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/* THE PARAMETERS THE ROLL IS ALLOWED TO HAVE. A closed list, in order: adding
   one is a deliberate edit to this line, which is the whole point. */
const ALLOWED_PARAMS = ['index', 'kind', 'id', 'rng'];

/* Words that name a scaling term. Matched against the roll's BODY, so a comment
   above the function (the header explains at length why there is no multiplier)
   cannot trip it and a live identifier cannot hide behind one. */
const SCALING_WORDS = [
  'mult', 'multiplier', 'dropmult', 'droprate', 'rate', 'bonus', 'boost',
  'luck', 'perk', 'featured', 'buff', 'scale', 'modifier', 'factor',
];

/** The text of `export function rollHearthfind(...) { … }`, params and body. */
export function extractRoll(src) {
  const at = src.indexOf('export function rollHearthfind');
  if (at < 0) throw new Error('rollHearthfind is not an exported function in src/core/hearthfind.js');
  const open = src.indexOf('(', at);
  const close = src.indexOf(')', open);
  if (open < 0 || close < 0) throw new Error('rollHearthfind: unparseable parameter list');
  const params = src.slice(open + 1, close)
    .split(',').map((x) => x.trim()).filter(Boolean);

  // The body: brace-matched from the first `{` after the parameter list.
  const bodyStart = src.indexOf('{', close);
  let depth = 0, i = bodyStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const body = src.slice(bodyStart, i);
  // Strip comments so an explanatory line inside the body is not an identifier.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return { params, body, code };
}

// ── MINT-G1 ────────────────────────────────────────────────────────────────
function checkSignature(src) {
  const { params, code } = extractRoll(src);

  ok(params.length === ALLOWED_PARAMS.length,
    `rollHearthfind takes ${params.length} parameters (${params.join(', ')}), not `
    + `${ALLOWED_PARAMS.length}. A hearthfind must never be boostable by anything paid, and the `
    + 'cheapest way to keep that true forever is for the roll to have nowhere to put a modifier.');

  for (let i = 0; i < Math.min(params.length, ALLOWED_PARAMS.length); i++) {
    ok(params[i] === ALLOWED_PARAMS[i],
      `rollHearthfind parameter ${i} is \`${params[i]}\`, expected \`${ALLOWED_PARAMS[i]}\``);
  }
  for (const p of params) {
    ok(ALLOWED_PARAMS.includes(p),
      `rollHearthfind takes \`${p}\` — a parameter this guard does not know is, by default, `
      + 'a scaling term until a human says otherwise.');
  }

  // The runtime function agrees with the text (a default value or a rest
  // parameter would change `.length` without changing the parameter count).
  ok(rollHearthfind.length === ALLOWED_PARAMS.length,
    `rollHearthfind.length is ${rollHearthfind.length}, expected ${ALLOWED_PARAMS.length} — a `
    + 'defaulted or rest parameter is a modifier with the safety catch on.');

  const lower = code.toLowerCase();
  for (const w of SCALING_WORDS) {
    const hit = new RegExp(`[a-z0-9_$]*${w}[a-z0-9_$]*`, 'i').exec(lower);
    ok(!hit,
      `the body of rollHearthfind mentions \`${hit && hit[0]}\` (matched "${w}") — the odds are the `
      + 'catalogue\'s number and nothing may scale them.');
  }

  // The probability is exactly 1/oneIn: no arithmetic between them.
  ok(/rng\.chance\(\s*1\s*\/\s*row\.oneIn\s*\)/.test(code),
    'rollHearthfind no longer rolls exactly `rng.chance(1 / row.oneIn)` — anything else is an '
    + 'adjusted probability, whatever it is called.');
}

// ── MINT-G2 ────────────────────────────────────────────────────────────────
function checkItems(items, allowlist) {
  const flagged = Object.keys(items).filter((id) => items[id] && items[id].hearthfind === true);

  ok(flagged.length > 0,
    'no item carries hearthfind:true — the guard would pass vacuously, which is how this '
    + 'repository has shipped a guard that asserted nothing twelve times.');

  for (const id of flagged) {
    const it = items[id];
    ok(Number(it.v || 0) === 0,
      `${id} has vendor value ${it.v} — a hearthfind would mint gold. Trophies are v:0 so the `
      + 'rarest event in the game moves ZERO gold.');
    ok(it.bop === true,
      `${id} is TRADEABLE (bop is ${JSON.stringify(it.bop)}) — a hearthfind on the player market `
      + 'is a second gold bridge (the muster_seal rule). Trophies are bind-on-pickup.');
    ok(it.tag !== 'currency' && !it.premium && !it.musterOnly,
      `${id} is a priced or earned CURRENCY — a find must pay one untradeable trophy and nothing `
      + 'else: never gold, gems, hearth_token or muster_seal.');
  }

  // The two lists are one list. src/data/hearthfind.js's HEARTHFIND_ITEMS is
  // what tools/gen-hearthfind.mjs mirrors into hr_hearthfind_items, i.e. what
  // hr_apply will accept; the hearthfind:true flag is what carries v:0/bop.
  // A member of one and not the other is a trophy the server allows without the
  // flags that make it valueless, or a flagged item nothing can ever drop.
  const a = [...flagged].sort();
  const b = [...allowlist].sort();
  ok(JSON.stringify(a) === JSON.stringify(b),
    'the hearthfind:true items and HEARTHFIND_ITEMS are different sets — '
    + `flagged=[${a.join(', ')}] allowlist=[${b.join(', ')}]. The server catalogue is generated `
    + 'from the allowlist; the economic flags live on the item. They must name the same trophies.');
}

// ── MINT-G5  THE ROLL SITE READS ONLY (source_kind, source_id, server seed) ─
// The Designer's anti-P2W property (ruling §7) is a statement about the CALL,
// not only about the signature: "the roll reads only (source_kind, source_id,
// server seed) — never a drop-rate multiplier". MINT-G1 proves the callee has
// nowhere to put a modifier; this proves the CALLER does not compute one.
//
// `resolveHearthfind(state, kind, id, ctx)` is the one call shape both engines
// use. What it may pass to `rollHearthfind` is exactly:
//   · ctx.hearthfind — the INDEX (the catalogue), or the shipped index
//   · kind, id       — the source pair, both string literals at the call sites
//   · ctx.rng        — the server-seeded stream
// Anything else — a weakness dropMult, a `bonus('dropRate')`, a featured
// multiplier, a luck perk, an ammo term — reaching the same expression is the
// defect. Both call sites are checked by TEXT, because the numeric proof
// (ROLL-4 in tests/hearthfind-roll.mjs, which turns every multiplier in the
// game up to its cap and demands an identical find stream) can only sample the
// multipliers that exist TODAY; this catches the one added tomorrow.
function checkCallSites(sites) {
  for (const [label, src] of sites) {
    const calls = [...src.matchAll(/resolveHearthfind\s*\(([^)]*)\)/g)];
    ok(calls.length === 1,
      `${label} has ${calls.length} hearthfind roll sites — exactly one, or the live tick and the `
      + 'away replay can come to disagree (AWAY-12).');
    for (const c of calls) {
      const args = c[1].split(',').map((x) => x.trim());
      ok(args.length === 4,
        `${label}: resolveHearthfind is called with ${args.length} arguments (${c[1]}) — the shape `
        + 'is (state, kind, id, ctx) and a fifth argument is a modifier by default.');
      /* The SOURCE PAIR is a literal or a plain identifier at the call site —
         never an expression, which is where a conditional source id ("roll the
         boss table while a buff is up") would hide. */
      const kind = args[1] || '';
      ok(/^'[a-z]+'$/.test(kind),
        `${label}: the source kind is \`${kind}\`, not a string literal — a computed kind is a `
        + 'roll whose odds depend on something other than what you are fighting.');
      const id = args[2] || '';
      /* A plain identifier, a guarded property read (`node && node.id` — the
         gather site's null check), or a literal. Never an expression with an
         operator that could select a DIFFERENT source under some condition. */
      ok(/^([A-Za-z_$][\w$]*\s*&&\s*)?[A-Za-z_$][\w$.]*$/.test(id) || /^'[a-z0-9_]+'$/.test(id),
        `${label}: the source id is the expression \`${id}\` — it must be the plain id of the `
        + 'thing being fought or gathered.');
      const ctxArg = args[3] || '';
      ok(/^[A-Za-z_$][\w$]*$/.test(ctxArg),
        `${label}: the ctx argument is the expression \`${ctxArg}\` — a call site that BUILDS an `
        + 'object here is a call site that can add a term to it.');
    }
    /* AND NO MULTIPLIER IN THE SAME STATEMENT. Comments are stripped first, so
       the long explanatory headers above both call sites do not count. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    for (const m of code.matchAll(/resolveHearthfind\s*\([^)]*\)/g)) {
      const lower = m[0].toLowerCase();
      for (const w of SCALING_WORDS) {
        ok(!lower.includes(w),
          `${label}: the hearthfind call site mentions "${w}" (${m[0]}) — the odds are the `
          + 'catalogue\'s number and nothing at the call site may scale them.');
      }
    }
  }
}

// ── THE MUTATIONS ──────────────────────────────────────────────────────────
// Each returns { items, allowlist, src }. Nothing on disk is modified.
const MUTATIONS = {
  tradeable_trophy: {
    why: 'a trophy is tradeable (bop dropped) — it could be sold on the player market',
    apply: (V) => { V.items.emberheart = { ...V.items.emberheart, bop: false }; },
  },
  vendorable_trophy: {
    why: 'a trophy has vendor value — a find would mint gold',
    apply: (V) => { V.items.worldroot_seed = { ...V.items.worldroot_seed, v: 250000 }; },
  },
  currency_trophy: {
    why: 'a trophy is tagged as a currency — a find would pay a priced unit',
    apply: (V) => { V.items.deepvein_lodestar = { ...V.items.deepvein_lodestar, tag: 'currency' }; },
  },
  unflagged_allowlist_member: {
    why: 'the allowlist names a trophy that carries no hearthfind:true flag (server-mintable, '
       + 'economically unmarked)',
    apply: (V) => { V.allowlist = [...V.allowlist, 'gold_bar']; },
  },
  one_in_multiplier: {
    why: 'the roll gained an `oneIn` multiplier parameter — the odds became purchasable',
    apply: (V) => {
      V.src = V.src
        .replace('export function rollHearthfind(index, kind, id, rng)',
                 'export function rollHearthfind(index, kind, id, rng, oneInMult)')
        .replace('if (!rng.chance(1 / row.oneIn)) return null;',
                 'if (!rng.chance((1 / row.oneIn) * (oneInMult || 1))) return null;');
    },
  },
  silent_rate_term: {
    why: 'the roll body scales the probability by a `dropRate` read off the index, with the '
       + 'signature left untouched',
    apply: (V) => {
      V.src = V.src.replace('if (!rng.chance(1 / row.oneIn)) return null;',
        'if (!rng.chance((1 / row.oneIn) * (row.dropRate || 1))) return null;');
    },
  },
  call_site_multiplier: {
    why: 'a call site multiplies the roll by a drop-rate buff — the SIGNATURE is still clean, so '
       + 'MINT-G1 stays green while the odds become purchasable at the one place that actually '
       + 'rolls them (ruling §7: the roll reads only source_kind, source_id and the server seed)',
    apply: (V) => {
      V.sites = V.sites.map(([label, src]) => [label, src.replace(
        /resolveHearthfind\(state, 'monster', id, ctx\)/,
        "resolveHearthfind(state, 'monster', id, ctx, bonus('dropRate'))")]);
    },
  },
  call_site_luck_ctx: {
    why: 'a call site builds its own ctx for the roll — an object literal at the call site is a '
       + 'place to put a luck term, and the next person to touch it will',
    apply: (V) => {
      V.sites = V.sites.map(([label, src]) => [label, src.replace(
        /resolveHearthfind\(state, 'monster', id, ctx\)/,
        "resolveHearthfind(state, 'monster', id, { ...ctx, luck: 2 })")]);
    },
  },
  second_roll_site: {
    why: 'a second roll site is added to one engine — the live tick and the away replay then roll '
       + 'a different number of times for the same span, and AWAY-1 parity is gone',
    apply: (V) => {
      V.sites = V.sites.map(([label, src]) => [label, src.replace(
        /resolveHearthfind\(state, 'monster', id, ctx\)/,
        "resolveHearthfind(state, 'monster', id, ctx) || resolveHearthfind(state, 'monster', id, ctx)")]);
    },
  },
  vacuous_flag: {
    why: 'nothing carries hearthfind:true any more — the item half of the guard would pass '
       + 'while asserting nothing',
    apply: (V) => {
      for (const id of Object.keys(V.items)) {
        if (V.items[id] && V.items[id].hearthfind) V.items[id] = { ...V.items[id], hearthfind: false };
      }
    },
  },
};

async function runAll(mutation) {
  const V = {
    items: { ...ITEMS },
    allowlist: [...HEARTHFIND_ITEMS],
    src: await readFile(ENGINE, 'utf8'),
    sites: await Promise.all(CALL_SITES.map(async ([label, path]) =>
      [label, await readFile(path, 'utf8')])),
  };
  if (mutation) MUTATIONS[mutation].apply(V);
  checkSignature(V.src);
  checkItems(V.items, V.allowlist);
  checkCallSites(V.sites);
}

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('hearthfind-mint-guard --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const save = failed; failed = 0; let threw = false;
    try { await runAll(name); } catch (e) {
      threw = true; console.log(`  ${name}: RED (threw: ${e.message.split('\n')[0]})`);
    }
    const red = failed > 0 || threw;
    failed = save;
    if (red) { if (!threw) console.log(`  ${name}: RED — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  // A NEGATIVE CONTROL: the unmutated tree must be green, or "every mutation is
  // red" would be satisfied by a guard that is simply always red.
  await runAll(null);
  if (failed) { console.error(`\nthe UNMUTATED tree is red (${failed}) — the mutations prove nothing.`); process.exit(1); }
  if (bad) { console.error(`\n${bad} mutation(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught, clean tree green. The guard is non-vacuous.`);
  process.exit(0);
} else {
  await runAll(null);
  if (failed) { console.error(`\nhearthfind-mint-guard: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('hearthfind-mint-guard: all assertions passed (rollHearthfind takes exactly '
    + '(index, kind, id, rng) and scales its odds by nothing; both roll sites pass only the source '
    + 'pair and the server-seeded ctx, with no multiplier in the call; every hearthfind trophy is '
    + 'v:0, bind-on-pickup and not a currency; the flagged set and HEARTHFIND_ITEMS are one set).');
  process.exit(0);
}
