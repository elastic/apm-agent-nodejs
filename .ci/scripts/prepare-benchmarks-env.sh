#!/usr/bin/env bash
set -eo pipefail

# This particular configuration is required to be installed in the baremetal
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
command -v nvm

## If NODE_VERSION env variable exists then use it otherwise use node as default
if [ -z "${NODE_VERSION}" ] ; then
  NODE_VERSION="node"
fi
nvm install ${NODE_VERSION}

set +x
npm config list
npm install

node --version
npm --version
