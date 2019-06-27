#!/usr/bin/env bash
set -xeo pipefail

export PATH=${PATH}:/$(pwd)/node_modules:/$(pwd)/node_modules/.bin
export HOME=$(pwd)

npm install

if [[ -z "${CHANGE_ID}" ]]; then
  # If on master, just test the latest commit
  commitlint --from=${GIT_SHA}~1
else
  # If on a branch, test all commits between this branch and master
  commitlint --from=origin/${CHANGE_TARGET} --to=${GIT_BASE_COMMIT}
fi
