#!/usr/bin/env bash
set -euo pipefail
channel="$1" tag="$2" title="$3" latest="$4"
shift 4
paths=("$@")
prefix="${tag%%-*}"

git fetch --force --tags origin

if [[ "$channel" == "stable" ]]; then
  message="$(git tag -l --format='%(contents)' "$tag")"
  previous="$(git tag -l "$prefix-v*" --sort=-v:refname | grep -vx "$tag" | head -1 || true)"
  args=(--generate-notes --notes "$message" --title "$title" --latest="$latest" --verify-tag)
  [[ -n "$previous" ]] && args+=(--notes-start-tag "$previous")
  gh release create "$tag" release-assets/* "${args[@]}"
  exit 0
fi

previous="$(git rev-parse -q --verify "refs/tags/$tag^{commit}" || true)"
range="${previous:+$previous..}$GITHUB_SHA"
changes="$(git log --format='- %s (%h)' --max-count=50 "$range" -- "${paths[@]}")"
notes="Built from \`${GITHUB_SHA::7}\`. Unstable; for testing only.

## Changes since the last nightly
${changes:-- No app changes.}"
if [[ -n "$previous" ]]; then
  notes+="

**Full Changelog:** https://github.com/$GITHUB_REPOSITORY/compare/${previous::7}...${GITHUB_SHA::7}"
fi

git tag -f "$tag" "$GITHUB_SHA"
git push -f origin "refs/tags/$tag"
gh release delete "$tag" --yes 2>/dev/null || true
gh release create "$tag" release-assets/* --title "$title" --notes "$notes" \
  --prerelease --latest=false --verify-tag
