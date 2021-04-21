#!/usr/bin/env bash
set -exo pipefail

NODE_VERSION=$1
if [[ -z "$NODE_VERSION" ]]; then
  echo "$0: error: missing NODE_VERSION arg"
  echo "usage: prepare-benchmarks-env.sh NODE_VERSION"
  exit 1
fi

# This particular configuration is required to be installed in the baremetal
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
command -v nvm

nvm install "${NODE_VERSION}"

npm config list
npm install

node --version
npm --version
