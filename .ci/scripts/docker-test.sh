#!/usr/bin/env bash
set -ueo pipefail

# "test/instrumentation/modules/http2.js" fails if the OpenSSL SECLEVEL=2,
# which is the case in the node:16 Docker image and could be in other
# environments. Here we explicitly set it to SECLEVEL=0 for testing.
export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS}} --openssl-config=$(pwd)/test/openssl-config-for-testing.cnf"

# Workaround to git <2.7
# error fatal: unable to look up current user in the passwd file: no such user
# see http://git.661346.n2.nabble.com/git-clone-fails-when-current-user-is-not-in-etc-passwd-td7643604.html
if [ -z "$(grep \"\:$(id -u)\:\" /etc/passwd)" ]; then
  git config --global user.name foo
  git config --global user.email foo@example.com
  git config -l
fi

npm_ci() {
  local retries=2
  local count=0

  until npm ci; do
    exit=$?
    wait=$((2 ** $count))
    count=$(($count + 1))
    if [ $count -lt $retries ]; then
      printf "Retry of 'npm ci' %s/%s exited %s, retrying in %s seconds...\n" "$count" "$retries" "$exit" "$wait" >&2
      printf "Force-cleaning of npm cache.\n" >&2
      npm cache clean --force
      sleep $wait
    else
      printf "Retry %s/%s exited %s, no more retries left.\n" "$count" "$retries" "$exit" >&2
      return $exit
    fi
  done
  return 0
}

export
id
node --version
npm --version
npm_ci

# Attempt to provide junit-formatted test results, for Jenkins' "Test Results"
# and other features like flaky-test reporting.
if [[ -n ${TAV} ]]; then
  npm run test:tav
  # Currently the TAV tests do not support TAP or junit-formatted output.
else
  rm -rf ./test_output
  mkdir ./test_output
  nyc node test/test.js -o ./test_output
  ls test_output/*.tap | while read f; do cat $f | ./node_modules/.bin/tap-junit > $f.junit.xml; done
fi
