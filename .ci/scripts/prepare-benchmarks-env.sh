#!/usr/bin/env bash

# Install the given node version, put it on the PATH (hence requiring "source"
# to use this) and `npm install`.
#
# Usage:
#   NODE_VERSION=...
#   source .../prepare-benchmarks-env.sh

set -xeo pipefail

if [[ -z "$NODE_VERSION" ]]; then
  echo "prepare-benchmarks-env.sh: error: NODE_VERSION envvar is not set" >&2
  exit 1
fi

# This particular configuration is required to be installed in the baremetal
curl -sS -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
set +x  # Disable xtrace because output using nvm.sh is huge.
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
command -v nvm
nvm --version

nvm install "${NODE_VERSION}"
set -x

npm config list
npm install

node --version
npm --version
