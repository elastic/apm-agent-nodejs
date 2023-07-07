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

if [[ -z "${NODE_VERSION}" ]]; then
  echo "prepare-benchmarks-env.sh: error: NODE_VERSION envvar is not set" >&2
  exit 1
fi

echo "--- Download nvm"
# This particular configuration is required to be installed in the baremetal
curl -sS -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="${HOME}/.nvm"

echo "--- Install nvm"
set +x  # Disable xtrace because output using nvm.sh is huge.
# Flush positional arguments
shift $#
if [ -s "${NVM_DIR}/nvm.sh" ] ; then
  \. "${NVM_DIR}/nvm.sh"
fi

# Check nvm command is available
command -v nvm
nvm --version

echo "--- Run nvm install ${NODE_VERSION}"
nvm install "${NODE_VERSION}"

# Check node command is available
node --version
npm --version

echo "--- Install dependencies"
set -x
npm config list
npm install
