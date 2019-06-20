#!/usr/bin/env bash
set -ueo pipefail

# This particular configuration is required to be installed in the baremetal
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
command -v nvm

nvm install node
nvm use node

set +x
npm config list
npm install

node --version
npm --version

npm run test:cibenchmark
