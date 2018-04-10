#!/usr/bin/env bash

set -e

# Only run if we're not on a CI system
if [[ -z "$CI" ]]; then
  GIT_BRANCH=`git rev-parse --abbrev-ref HEAD`

  if [[ "$GIT_BRANCH" == "master" ]]; then
    # If on master, just test the latest commit
    commitlint --edit
  else
    # If on a branch, test all commits between this branch and master
    commitlint --from=master
  fi
fi
