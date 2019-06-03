#!/usr/bin/env bash

set -xe

if [[ -z "${CHANGE_ID}" ]]; then
  # If on master, just test the latest commit
  commitlint --from=${GIT_SHA}~1
else
  # If on a branch, test all commits between this branch and master
  commitlint --from=origin/${CHANGE_TARGET} --to=${GIT_BASE_COMMIT}
fi
