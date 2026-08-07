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
# Usage:  ./bump-version.sh <new-cache-number>
#   e.g.  ./bump-version.sh 149
#
# After running: review `git diff`, update CHANGELOG.md + the date in
# build-info.js by hand, then commit & push.
# ============================================================
set -euo pipefail

new="${1:-}"
if ! [[ "$new" =~ ^[0-9]+$ ]]; then
  echo "usage: ./bump-version.sh <new-cache-number>   (integer)" >&2
  exit 1
fi

old="$(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js | grep -oE '[0-9]+')"
if [[ -z "$old" ]]; then
  echo "could not read current cache number from src/build-info.js" >&2
  exit 1
fi
if [[ "$old" == "$new" ]]; then
  echo "cache is already $new — nothing to do." >&2
  exit 0
fi

echo "Bumping cache-buster $old -> $new"

# 1. build-info.js
sed -i -E "s/(cache:[[:space:]]*)${old},/\1${new},/" src/build-info.js

# 2. index.html script/link tags
sed -i "s/?v=${old}/?v=${new}/g" index.html

# 3. Every ?v= on ESM import specifiers under src/
find src -name '*.js' -print0 | xargs -0 sed -i "s/?v=${old}/?v=${new}/g"

# --- Verify nothing was left behind ---
# NOTE: grep exits 1 when it finds nothing, which is the SUCCESS case here, so
# each grep is guarded with `|| true` — otherwise `set -e -o pipefail` would kill
# the script on a clean bump (the b149 self-bug this script hit on its first run).
stale_html="$({ grep -oE "\?v=${old}\b" index.html || true; } | wc -l | tr -d ' ')"
stale_js="$({ grep -roE "\?v=${old}\b" src --include='*.js' || true; } | wc -l | tr -d ' ')"
# Any relative .js import that has NO ?v= at all is a NEW gap — flag it.
missing="$({ grep -rnE "(import|export|from|import\()[^'\"]*['\"]\.\.?/[^'\"]*\.js['\"]" src --include='*.js' || true; } | { grep -vE '\?v=' || true; } | wc -l | tr -d ' ')"
new_html="$({ grep -oE "\?v=${new}\b" index.html || true; } | wc -l | tr -d ' ')"
new_js="$({ grep -roE "\?v=${new}\b" src --include='*.js' || true; } | wc -l | tr -d ' ')"

echo "  build-info.cache : $(grep -oE 'cache:[[:space:]]*[0-9]+' src/build-info.js)"
echo "  index.html ?v=${new} : ${new_html} tags"
echo "  src ?v=${new}        : ${new_js} import specifiers"
echo "  leftover ?v=${old}   : html=${stale_html} js=${stale_js} (want 0/0)"
echo "  unversioned relative imports : ${missing} (want 0)"

if [[ "$stale_html" != "0" || "$stale_js" != "0" || "$missing" != "0" ]]; then
  echo "WARNING: something is inconsistent — review git diff before committing." >&2
  exit 1
fi
echo "OK. Now: bump the date in src/build-info.js, add a CHANGELOG.md entry, then commit & push."
