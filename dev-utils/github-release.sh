#!/usr/bin/env bash

# Create a GitHub release. If the given tag name is the *latest* version, and
# is not a pre-release, then the GH release will be marked as the latest.
# (This is typically only run from the release.yml CI workflow.)
#
# Usage:
#   ./dev-utils/github-release.sh TAG_NAME RELEASE_NOTES_FILE
# Example:
#   ./dev-utils/github-release.sh v3.49.1 ../build/aws/arn-file.md
#
# - For auth, this expects the 'GH_TOKEN' envvar to have been set.
# - The 'TAG_NAME' is typically from the 'GITHUB_REF_NAME' variable
#   (https://docs.github.com/en/actions/learn-github-actions/variables)
#   from a GitHub Actions workflow run.
# - The 'RELEASE_NOTES_FILE' is a path to an already built file to use as
#   the release notes (using GitHub-flavored Markdown).

set -euo pipefail

readonly TAG_NAME="$1"
readonly RELEASE_NOTES_FILE="$2"

echo "INFO: List current GitHub releases"
gh release list

# The latest (by semver version ordering) git version tag, excluding pre-releases.
readonly LATEST_GIT_TAG=$(git tag --list --sort=version:refname "v*" | grep -v - | tail -n1)
if [[ "$TAG_NAME" == "$LATEST_GIT_TAG" ]]; then
  IS_LATEST=true
else
  IS_LATEST=false
fi

echo "INFO: Create '$TAG_NAME' GitHub release (latest=$IS_LATEST)."
gh release create "$TAG_NAME" \
  --title "$TAG_NAME" \
  --notes-file "$RELEASE_NOTES_FILE" \
  --latest=$IS_LATEST
