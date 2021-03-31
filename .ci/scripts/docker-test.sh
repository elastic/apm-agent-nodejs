#!/usr/bin/env bash
set -ueo pipefail

major_node_version=`node --version | cut -d . -f1 | cut -d v -f2`
minor_node_version=`node --version | cut -d . -f2`

if [[ $major_node_version -eq 8 ]] && [[ $minor_node_version -lt 8 ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS}} --expose-http2"
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
  nyc report --reporter=lcov > coverage.lcov
fi
