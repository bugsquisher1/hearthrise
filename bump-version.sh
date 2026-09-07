#!/usr/bin/env bash
# ============================================================
# bump-version.sh — single command to bump the cache-buster
# EVERYWHERE it must agree, so a release can't ship half-stale.
#
# Bumps, in lockstep:
#   1. src/build-info.js   BUILD.cache
#   2. index.html          every ?v=NNN on <script>/<link> tags
#   3. src/**/*.js         every ?v=NNN on ESM import specifiers
#      (the b148 fix for the ESM cache gap — static imports like
#       `import './net/sync.js?v=NNN'` are fetched by the browser
#       WITHOUT inheriting index.html's version, so they must carry
#       their own ?v= and get bumped here too. Miss this and browsers
#       run a mix of old + new modules for up to 10 min after deploy.)
#
# ── SCOPE IS src/ ONLY, AND THAT IS CORRECT (b332) ──────────────────────
# `supabase/functions/**` and `tests/**` are OUTSIDE this script's reach, and
# for five builds their imports sat frozen at `?v=326` while their targets moved
# to `?v=331` — silent, because the query is inert in Node. **Do not fix that by
# widening the `find` below.** A `?v=` is a BROWSER cache-buster; nothing under
# those roots is ever served to a browser, so a version string there has no job
# to do and can only rot. The queries were removed instead, and
# `versionQueryGuard()` in tools/pack-edge.mjs (run by tests/run-smoke.mjs)
# fails the build if one comes back. The contract is split cleanly in two:
#   • here            — everything the browser loads carries the CURRENT version
#   • versionQueryGuard — everything the browser does not load carries NONE
# Widening this script would also make every bump move the Edge Function's
# payload hash and demand a redeploy for a change that alters no behaviour.
#
# Usage:  ./bump-version.sh <new-cache-number>
#   e.g.  ./bump-version.sh 149
#
#         ./bump-version.sh --check
#   Verifies the invariant WITHOUT changing anything: build-info's cache
#   number must match every ?v= in index.html and on every ESM import, and
#   no relative import may be missing its ?v= entirely. Exits non-zero when
#   they disagree, so CI can gate on it (b215).
#
# After running: review `git diff`, update CHANGELOG.md + the date in
# build-info.js by hand, then commit & push.
# ============================================================
#
# ── THE b493 LESSON: BUMP AND CHECK MUST BE THE SAME RULE ───────────────
# The 492→493 release shipped fourteen `?v=491` specifiers, carried in on merges
# from branches cut at build 491. The bump's step 3 rewrote only `?v=<old>`
# (=492) and its verification then looked only for leftover `?v=<old>` — so a
# specifier two builds stale matched NEITHER and passed silently. `--check`
# would have caught it (it compares against the CURRENT number), but bump and
# check were separate rules and only one of them ran.
#
# The result was not merely stale code. A `?v=` is part of the module KEY, so
# `record.js?v=491` and `record.js?v=493` are two DIFFERENT modules: fetched
# twice, evaluated twice, each with its own module-level state. Six modules ran
# as doubles (record, accrue, capstone, predict, auth, styles) — two accrual
# kill-switches, two prediction ledgers, two sessions — and 19 smoke tests
# failed on an assembly whose every branch was green.
#
# So: step 3 now NORMALISES every versioned specifier to the new build rather
# than only rewriting the old number, and the post-bump verification calls the
# SAME function `--check` does. `tests/cache-buster-guard.mjs` asserts the same
# invariant inside `node tests/run-smoke.mjs`, which is the gate people
# actually run, and additionally reports the double-load directly.
# ============================================================

set -euo pipefail

new="${1:-}"

# ── THE ONE RULE, used by --check AND by the post-bump verification ──────
# Reads the current cache number from build-info.js and asserts that every
# browser-loaded reference agrees with it. Exits 0 clean / 1 dirty.
check_invariant() {
  local cur
  cur="$(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js | grep -oE '[0-9]+')"
  if [[ -z "$cur" ]]; then
    echo "FAIL: could not read cache number from src/build-info.js" >&2; return 1
  fi
  # Only real references count. Scoping matters: a bare `?v=` grep also hits
  # prose in comments (index.html + legacy.js both *describe* "legacy.js?v=111"
  # when explaining the kill-switch) and asset image URLs (icon-swap.js pins
  # sprites at ?v=88). Those are not cache-busted modules and must not fail CI.
  #   • index.html → only src="…?v=" / href="…?v=" attributes
  #   • src/**.js  → only QUOTED specifiers ending in .js?v=
  # The file extension is required so the comment on index.html:12, which spells
  # out `<script src="...?v=111">` as an EXAMPLE, isn't mistaken for a real tag.
  # b493: the src/ pattern used to require an import/export/from keyword on the
  # SAME LINE, which missed `fetch('src/legacy.js?v=491')` — a real browser fetch
  # of a real module at a stale version. Any quoted `.js?v=` is now in scope,
  # which is exactly the population step 3's sed rewrites, so the two can no
  # longer disagree about what a versioned specifier is.
  # b511: …and the gap that carve-out left. `?v=88` lived in src/icon-swap.js for
  # 400+ builds precisely BECAUSE the js pattern above requires a `.ext` in front
  # of the query: `BASE + filename + '?v=88'` is a quoted bare query, invisible to
  # both the rewrite (step 3b) and the check. A pinned version is worse than a
  # missing one — it is a cache LOCK that no bump can ever move. So: ANY quoted
  # string under src/**.js that contains `?v=<digits>` must carry the current
  # build, extension-anchored or not. Unquoted prose in comments still doesn't
  # count (that's how index.html:12 and legacy.js's kill-switch example survive).
  local bad_html bad_js bad_lit missing ok
  bad_html="$({ grep -oE '(src|href)="[^"]*\.[a-z]+\?v=[0-9]+' index.html || true; } \
    | grep -oE '\?v=[0-9]+$' | { grep -vE "\?v=${cur}\$" || true; } | sort -u | tr '\n' ' ')"
  bad_js="$({ grep -rhoE "['\"][^'\"]*\.js\?v=[0-9]+" src --include='*.js' || true; } \
    | grep -oE '\?v=[0-9]+$' | { grep -vE "\?v=${cur}\$" || true; } | sort -u | tr '\n' ' ')"
  bad_lit="$({ grep -rnoE "['\"\`][^'\"\`]*\?v=[0-9]+" src --include='*.js' || true; } \
    | { grep -vE "\?v=${cur}\$" || true; })"
  # A relative .js import with no ?v= at all is the gap that lets a stale
  # module run for ~10 min after deploy.
  missing="$({ grep -rnE "(import|export|from|import\()[^'\"]*['\"]\.\.?/[^'\"]*\.js['\"]" src --include='*.js' || true; } | { grep -vE '\?v=' || true; })"

  echo "cache-buster check — build-info says ${cur}"
  ok=0
  if [[ -n "$bad_html" ]]; then echo "  FAIL index.html has stale versions: ${bad_html}" >&2; ok=1; fi
  if [[ -n "$bad_js"   ]]; then
    echo "  FAIL src/**/*.js has stale versions: ${bad_js}" >&2
    { grep -rnE "['\"][^'\"]*\.js\?v=[0-9]+" src --include='*.js' || true; } \
      | { grep -vE "\?v=${cur}[\"']" || true; } | sed 's/^/      /' >&2
    echo "      ^ a module reachable at TWO versions is loaded TWICE, with two copies" >&2
    echo "        of its module state. See tests/cache-buster-guard.mjs (b493)." >&2
    ok=1
  fi
  if [[ -n "$bad_lit"  ]]; then
    echo "  FAIL src/**/*.js has a QUOTED ?v= literal that is not the current build:" >&2
    echo "$bad_lit" | sed 's/^/      /' >&2
    echo "      ^ a hardcoded version is a cache LOCK, not a cache buster: no bump can" >&2
    echo "        move it. Derive it (window.HearthriseBuild.cache) or drop it." >&2
    ok=1
  fi
  if [[ -n "$missing"  ]]; then
    echo "  FAIL relative imports with no ?v= (they'd serve stale after deploy):" >&2
    echo "$missing" >&2
    ok=1
  fi
  if [[ "$ok" == "0" ]]; then echo "  OK — index.html + every ESM import are all at ?v=${cur}"; fi
  return "$ok"
}

# ════════════════════════════════════════════════════════════════════════
# --selftest — THE MUTATION PROOF FOR --check
#
# `bash bump-version.sh --check` is a CI gate, and until now it was the only
# one with no way to demonstrate it can fail. That matters more here than
# almost anywhere else, because this rule is ENTIRELY made of greps whose
# scoping has been narrowed four times (b332, b493, b511) to stop false
# positives — and every narrowing is a chance to have narrowed it into
# blindness. b511 is the proof: `?v=88` sat in src/icon-swap.js for 400+ builds
# while --check said OK, because the pattern required a `.ext` before the query.
#
# So: copy the tree to a scratch dir, plant ONE real defect, run the REAL
# check_invariant against it, and require the SPECIFIC message that owns that
# defect. Nothing in the working tree is touched — the copy is thrown away.
# Each mutation is a defect this repo has actually shipped or narrowly avoided;
# none is a syntax break.
#
#   bash bump-version.sh --selftest
# ════════════════════════════════════════════════════════════════════════
selftest() {
  local orig scratch bad=0 cur
  orig="$PWD"
  cur="$(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js | grep -oE '[0-9]+')"
  echo "bump-version --selftest: each mutation must turn --check RED (current build ${cur})"
  echo

  # id | human reason | the mutation (run inside the scratch copy) | required message
  run_case() {
    local id="$1" why="$2" mutate="$3" want="$4" out rc
    scratch="$(mktemp -d)"
    cp -r "$orig/src" "$scratch/src"
    cp "$orig/index.html" "$scratch/index.html"
    ( cd "$scratch" && eval "$mutate" )
    set +e
    out="$( cd "$scratch" && check_invariant 2>&1 )"; rc=$?
    set -e
    rm -rf "$scratch"
    if [[ "$rc" == "0" ]]; then
      echo "  FAIL  ${id} — NOT CAUGHT: --check stayed GREEN with the defect planted"
      bad=$((bad+1))
    elif ! grep -qF "$want" <<<"$out"; then
      echo "  FAIL  ${id} — went red for the WRONG reason (wanted: ${want})"
      sed 's/^/          /' <<<"$out"
      bad=$((bad+1))
    else
      echo "  ok    ${id} — caught"
    fi
    echo "        ${why}"
  }

  # THE CLEAN CONTROL. A rule that is red at rest is red for everything, and
  # every "caught" below would be an artefact rather than a proof.
  scratch="$(mktemp -d)"
  cp -r "$orig/src" "$scratch/src"; cp "$orig/index.html" "$scratch/index.html"
  set +e; ( cd "$scratch" && check_invariant >/dev/null 2>&1 ); local crc=$?; set -e
  rm -rf "$scratch"
  if [[ "$crc" == "0" ]]; then
    echo "  ok    CLEAN control is GREEN (an unmutated copy of the tree passes)"
  else
    echo "  FAIL  CLEAN control is RED — the mutations below prove nothing"
    bad=$((bad+1))
  fi
  echo "        the copy the mutations are planted into must itself be clean"

  run_case "B1-stale-index-tag" \
    "a merge brings index.html in at the branch's build number; the browser then loads that file stale for ~10 min after deploy" \
    "sed -i -E '0,/(src|href)=\"([^\"]*\\.[a-z]+)\\?v=[0-9]+\"/s//\\1=\"\\2?v=1\"/' index.html" \
    "index.html has stale versions"

  run_case "B2-stale-esm-specifier" \
    "THE b493 DOUBLE-LOAD: a specifier two builds stale is a DIFFERENT module key, so the module is fetched and evaluated twice with two copies of its state (six modules ran as doubles on 492->493)" \
    "sed -i \"0,/\\.js?v=${cur}/s//.js?v=1/\" src/main.js" \
    "src/**/*.js has stale versions"

  run_case "B3-bare-quoted-version-pin" \
    "THE b511 CACHE LOCK: a quoted BARE ?v= with no extension in front of it (BASE + name + '?v=88') is invisible to the rewrite, so no bump can ever move it. It survived 400+ builds" \
    "printf \"%s\\n\" \"const SPRITE = base + name + '?v=88';\" >> src/build-info.js" \
    "QUOTED ?v= literal"

  run_case "B4-relative-import-loses-its-version" \
    "an unversioned relative import serves the previous build's module after deploy — the gap b148 closed, and the one a bump cannot repair because there is no number to rewrite" \
    "sed -i \"0,/\\.js?v=${cur}'/s//.js'/\" src/main.js" \
    "relative imports with no ?v="

  run_case "B5-build-info-moved-alone" \
    "somebody edits BUILD.cache by hand instead of running this script: build-info claims a build the tree is not at, which is the half-stale release the whole invariant exists to prevent" \
    "sed -i -E \"s/(cache:[[:space:]]*)[0-9]+,/\\19999,/\" src/build-info.js" \
    "index.html has stale versions"

  run_case "B6-build-info-unreadable" \
    "the shape of build-info.js changes and the number cannot be read. This must be a LOUD failure: a check that silently compares against an empty string would call every version stale, or nothing" \
    "sed -i -E 's/cache:[[:space:]]*[0-9]+,/cacheNumber: undefined,/' src/build-info.js" \
    "could not read cache number"

  # ── THE OTHER HALF: the scoping must not have been narrowed into blindness,
  # and it must not have been widened into noise either. These plant shapes the
  # rule is RIGHT to ignore, and require --check to stay GREEN. Without them the
  # cheapest way to pass every case above is a grep that flags everything.
  stay_green() {
    local id="$1" why="$2" mutate="$3" out rc
    scratch="$(mktemp -d)"
    cp -r "$orig/src" "$scratch/src"; cp "$orig/index.html" "$scratch/index.html"
    ( cd "$scratch" && eval "$mutate" )
    set +e; out="$( cd "$scratch" && check_invariant 2>&1 )"; rc=$?; set -e
    rm -rf "$scratch"
    if [[ "$rc" != "0" ]]; then
      echo "  FAIL  ${id} — FALSE POSITIVE: --check went red on a shape it must ignore"
      sed 's/^/          /' <<<"$out"
      bad=$((bad+1))
    else
      echo "  ok    ${id} — correctly ignored"
    fi
    echo "        ${why}"
  }

  stay_green "B7-unquoted-prose-in-a-src-comment" \
    "legacy.js's kill-switch comment DESCRIBES a stale specifier (e.g. legacy.js?v=111). Unquoted prose is not a specifier, and flagging it is how this rule gets switched off by whoever is trying to ship" \
    "printf '%s\\n' '// e.g. a browser stuck on legacy.js?v=111 after a bad deploy' >> src/build-info.js"

  stay_green "B8-node-only-import-under-tests" \
    "b332: a ?v= outside src/** has no job to do and must not be demanded. tests/ and supabase/functions/ are not served to a browser; versionQueryGuard owns that half" \
    "mkdir -p othertests && printf \"%s\\n\" \"import { x } from '../src/core/pacing.js';\" > othertests/probe.mjs"

  echo
  if [[ "$bad" != "0" ]]; then
    echo "bump-version --selftest FAILED — ${bad} unproven" >&2
    return 1
  fi
  echo "bump-version --selftest PASSED — clean control green, 6/6 mutations caught, 2/2 ignorable shapes ignored."
  return 0
}

if [[ "$new" == "--selftest" ]]; then
  selftest
  exit "$?"
fi

# ── --check: assert the three places agree, change nothing ──────────────
if [[ "$new" == "--check" ]]; then
  check_invariant
  exit "$?"
fi

if ! [[ "$new" =~ ^[0-9]+$ ]]; then
  echo "usage: ./bump-version.sh <new-cache-number>   (integer)" >&2
  echo "       ./bump-version.sh --check              (verify only)" >&2
  exit 1
fi

old="$(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js | grep -oE '[0-9]+')"
if [[ -z "$old" ]]; then
  echo "could not read current cache number from src/build-info.js" >&2
  exit 1
fi
# ── "ALREADY AT N" IS NOT "NOTHING TO DO" (b493) ────────────────────────
# This used to exit 0 here, which meant the ONE command that can repair a
# post-merge tree refused to run on exactly the tree that needs it: a merge
# brings in specifiers at the branch's build number without moving build-info,
# so `old == new` and the tree is stale at the same time. Steps 1-3 are no-ops
# in that case (nothing to rewrite from `$old`), but 3b and the verification are
# the whole point, so the run continues.
if [[ "$old" == "$new" ]]; then
  echo "cache is already ${new} — re-normalising specifiers and verifying (post-merge repair)."
else
  echo "Bumping cache-buster $old -> $new"
fi

# 1. build-info.js
sed -i -E "s/(cache:[[:space:]]*)${old},/\1${new},/" src/build-info.js

# 2. index.html script/link tags
sed -i "s/?v=${old}/?v=${new}/g" index.html

# 3. Every ?v= on ESM import specifiers under src/
find src -name '*.js' -print0 | xargs -0 sed -i "s/?v=${old}/?v=${new}/g"

# 3b. ── THE b493 PASS: NORMALISE, don't just rewrite the previous number ──────
# Step 3 only knows about `?v=${old}`. A branch cut at build N and integrated at
# build N+2 carries `?v=N` specifiers that step 3 never sees, and the browser
# then loads those modules a SECOND time under a second key — two copies of the
# module, two copies of its state. So every QUOTED versioned specifier is
# normalised to ${new}, whatever number it currently holds.
#
# The quote + extension anchors are what make this safe to run blind. What they
# leave behind is legacy.js's kill-switch prose `e.g. legacy.js?v=111` — a
# comment, unquoted, correctly ignored.
#   ⚠ b511: they USED to leave icon-swap.js's sprite pin `BASE + filename +
#   '?v=88'` too — a quoted BARE query with no `.ext` in front of it, invisible
#   here and invisible to the old --check. It sat at build 88 for 400+ builds.
#   The pin is gone (icon-swap.js derives the version now) and check_invariant
#   grew a `bad_lit` rule so a bare quoted `?v=<n>` can never come back silently.
find src -name '*.js' -print0 | xargs -0 sed -i -E "s/([\"'\`][^\"'\`]*\.[a-z0-9]+)\?v=[0-9]+/\1?v=${new}/g"

# --- Verify: the SAME rule --check uses, so the two can never disagree ---
# (b493: this used to check only for leftover `?v=${old}`, which is why fourteen
#  `?v=491` specifiers passed a 492→493 bump without a word.)
echo
if ! check_invariant; then
  echo >&2
  echo "WARNING: the cache-buster invariant is NOT satisfied after the bump — review git diff." >&2
  exit 1
fi

new_html="$({ grep -oE "\?v=${new}\b" index.html || true; } | wc -l | tr -d ' ')"
new_js="$({ grep -roE "\?v=${new}\b" src --include='*.js' || true; } | wc -l | tr -d ' ')"

echo "  build-info.cache : $(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js)"
echo "  index.html ?v=${new} : ${new_html} tags"
echo "  src ?v=${new}        : ${new_js} import specifiers"
echo "OK. Now: bump the date in src/build-info.js, add a CHANGELOG.md entry, then commit & push."
