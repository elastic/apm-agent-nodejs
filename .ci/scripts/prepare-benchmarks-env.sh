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

echo "--- Download nvm"
# This particular configuration is required to be installed in the baremetal
curl -sS -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"

echo "--- Debug nvm "
# debug if curl works as explained in https://github.com/nvm-sh/nvm/issues/3117
curl -I --compressed -v https://nodejs.org/dist/

echo "--- Install nvm"
set +x  # Disable xtrace because output using nvm.sh is huge.
if [ -s "$NVM_DIR/nvm.sh" ] ; then
  # As long as the Buildkite agent does some weird behaviours compare to the Jenkins agent
  # let's avoid failures when running nvm.sh for the first time. For some reason
  # nvm_resolve_local_alias default returns VERSION= while in Jenkins a similar
  # runner returns VERSION=v14.21.3
  # Already reported to the System owners of the Buildkite agent setup.
  \. "$NVM_DIR/nvm.sh" || true
fi

command -v nvm
nvm --version

echo "--- Run nvm install ${NODE_VERSION}"
nvm install "${NODE_VERSION}"

echo "--- Run npm"
set -x
npm config list
npm install

node --version
npm --version
