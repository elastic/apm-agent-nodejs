#!/usr/bin/env bash
set -eo pipefail

# Run if we're not on Travis
if [[ -n "${JENKINS_URL}" ]]; then
  export PATH=$(npm bin):${PATH}
  export HOME=$(pwd)
  if [[ -z "${CHANGE_ID}" ]]; then
    # If on master, just test the latest commit
    commitlint --from="${GIT_SHA}~1"
  else
    # If on a branch, test all commits between this branch and master
    commitlint --from="origin/${CHANGE_TARGET}" --to="${GIT_BASE_COMMIT}"

    # Lint PR title
    if [[ -n ${CHANGE_TITLE} ]]; then
      echo "${CHANGE_TITLE}" | commitlint
    fi
  fi
elif [[ -z "$CI" ]]; then
  GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  if [[ "$GIT_BRANCH" == "master" ]]; then
    # If on master, just test the latest commit
    commitlint --edit
  else
    # If on a branch, test all commits between this branch and master
    commitlint --from=master
  fi
fi
