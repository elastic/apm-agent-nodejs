#!/usr/bin/env bash

# Install the given node version, put it on the PATH (hence requiring "source"
# to use this) and `npm install`.
#
# Usage:
#   NODE_VERSION=...
#   source .../prepare-benchmarks-env.sh
#
# Note: echo "--- ..." helps with presenting the output in Buildkite.
#

set -xeo pipefail

if [[ -z "$NODE_VERSION" ]]; then
  echo "prepare-benchmarks-env.sh: error: NODE_VERSION envvar is not set" >&2
  exit 1
fi

echo "--- Download/Install nvm"
# This particular configuration is required to be installed in the baremetal
export NVM_DIR="$HOME/.nvm" && (
  git clone https://github.com/nvm-sh/nvm.git "$NVM_DIR"
  cd "$NVM_DIR"
  git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
) && \. "$NVM_DIR/nvm.sh"

set -x
command -v nvm
nvm --version

echo "--- Run nvm install ${NODE_VERSION}"
nvm install "${NODE_VERSION}"

echo "--- Run npm"
npm config list
npm install

node --version
npm --version
