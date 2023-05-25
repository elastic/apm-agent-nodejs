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

# Help to debug whether the shell is login so we know nvm might not be affected by that.
shopt -q login_shell && echo 'Login shell' || echo 'No login shell'

if ! command -v nvm &> /dev/null ; then
  echo "--- Download nvm"
  # This particular configuration is required to be installed in the baremetal
  PROFILE=/dev/null bash -c 'curl -sS -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash'

  echo "--- Install nvm"
  #set +x  # Disable xtrace because output using nvm.sh is huge.
  export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
fi

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
