#!/usr/bin/env bash
set -ueo pipefail

major_node_version=`node --version | cut -d . -f1 | cut -d v -f2`
minor_node_version=`node --version | cut -d . -f2`

if [[ $major_node_version -eq 8 ]] && [[ $minor_node_version -lt 8 ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS}} --expose-http2"
fi

# "test/instrumentation/modules/http2.js" fails if the OpenSSL SECLEVEL=2,
# which is the case in the node:16 Docker image and could be in other
# environments. Here we explicitly set it to SECLEVEL=0 for testing.
#
# Skip for node v8 because it results in this warning:
#   openssl config failed: error:25066067:DSO support routines:DLFCN_LOAD:could not load the shared library
if [[ $major_node_version -le 8 ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS}} --openssl-config=./test/openssl-config-for-testing.cnf"
fi

# Workaround to git <2.7
# error fatal: unable to look up current user in the passwd file: no such user
# see http://git.661346.n2.nabble.com/git-clone-fails-when-current-user-is-not-in-etc-passwd-td7643604.html
if [ -z "$(grep \"\:$(id -u)\:\" /etc/passwd)" ]; then
  git config --global user.name foo
  git config --global user.email foo@exemple.com
  git config -l
fi

export
id
node --version
npm --version
npm install

if [[ -n ${TAV} ]]; then
  npm run test:tav|tee tav-output.tap
else
  nyc node test/test.js | tee test-suite-output.tap
fi
