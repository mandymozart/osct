#!/usr/bin/env bash
# Version check (agents/RULES.md #23). Run locally before pushing: .github/scripts/check-version.sh
# Fails when the version sources disagree, the CHANGELOG has no section for the version, the version is
# lower than the newest v* tag, or – with --strict (develop, main and PRs into them) – code changed since
# the newest tag without a bump. Changes only in agents/, docs/ or *.md need no bump.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
strict=false; [ "${1:-}" = "--strict" ] && strict=true

v=$(node -p "require('./client/package.json').version")
scripts=$(node -p "require('./scripts/package.json').version")
server=$(sed -n "s/.*APP = '\(.*\)'.*/\1/p" server/api/src/Version.php)
fail() { echo "::error::$1"; exit 1; }

[ "$scripts" = "$v" ] && [ "$server" = "$v" ] \
  || fail "Versions disagree: client $v, scripts $scripts, server $server – set all to the same version."
grep -q "^## $v " docs/CHANGELOG.md || fail "docs/CHANGELOG.md has no section '## $v – <date>'."

latest=$(git tag -l 'v[0-9]*' | sed 's/^v//' | sort -V | tail -1)
[ -z "$latest" ] && { echo "Version $v (no tags yet)."; exit 0; }
highest=$(printf '%s\n%s\n' "$latest" "$v" | sort -V | tail -1)
[ "$highest" = "$v" ] || fail "Version $v is lower than the newest tag v$latest – bump above it (next: patch/minor above $latest)."

if [ "$v" = "$latest" ]; then
  changed=$(git diff --name-only "v$latest" HEAD -- . ':!agents/**' ':!docs/**' ':!*.md')
  if [ -n "$changed" ]; then
    msg="Code changed since v$latest but the version is still $v – bump it and add a CHANGELOG section."
    $strict && fail "$msg"
    echo "::warning::$msg (enforced when merging into develop/main)"
  fi
fi
echo "Version $v OK (newest tag v$latest)."
