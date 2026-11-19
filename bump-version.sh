#!/usr/bin/env bash
# ============================================================
# bump-version.sh — one command per release (CLAUDE.md §5).
#
#   ./bump-version.sh X.Y.Z ["Title"]   src/build-info.js version, cache and date; the
#                                       CHANGELOG heading (with a title); play.html's
#                                       preload block; then the cache-buster guard
#   ./bump-version.sh --check           the source in one stamp state, one key per module
#                                       (node tests/cache-buster-guard.mjs)
#   ./bump-version.sh --selftest        the bump on scratch copies of the tree
#
# The ?v= release stamp is written at publish time by tools/build-site.mjs
# (SITE-9) onto every import and page tag, so a release no longer rewrites
# 3,000 stamps in 440 files. Until tools/strip-version-stamps.mjs has run on
# main, the bump still restamps a stamped source with the build's own
# transform. The logic and its proof live in tools/bump-version.mjs.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  --check) exec node tests/cache-buster-guard.mjs ;;
  --selftest) exec node tools/bump-version.mjs --selftest ;;
  *) exec node tools/bump-version.mjs "$@" ;;
esac
