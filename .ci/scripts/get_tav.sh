#!/usr/bin/env bash
## Given the git SHA it will parse the git log and search for any changes in any
## files under lib/instrumentation/modules/* or test/instrumentation/modules/*
## and will create a YAML file with the list of TAVs.
## If no matches then it will create the file with an empty list.
##
set -xuo pipefail

OUTPUT=$1

GIT_DIFF=git-diff.txt
CHANGES=changes.txt

## Node.js core modules are not on npm and doesn't need to be tested in the
## same way as regular modules does
NODE_CORE_MODULES=(
  assert
  async_hooks
  child_process
  cluster
  crypto
  dns
  domain
  events
  fs
  http
  http2
  https
  inspector
  net
  os
  path
  perf_hooks
  punycode
  querystring
  readline
  repl
  stream
  string_decoder
  tls
  trace_events
  tty
  dgram
  url
  util
  v8
  vm
  worker_threads
  zlib
)

cleanup() {
  rm -f ${CHANGES} ${GIT_DIFF} || true
}
trap cleanup EXIT

## Generate the file with the content
echo 'FRAMEWORK:' > "${OUTPUT}"

if [[ -n "${CHANGE_TARGET}" ]] && [[ -n "${GIT_SHA}" ]] ; then

  git diff --name-only origin/"${CHANGE_TARGET}"..."${GIT_SHA}" > ${GIT_DIFF}

  grep 'lib/instrumentation/modules' ${GIT_DIFF} | sed 's#lib/instrumentation/modules/##g' > ${CHANGES}
  grep 'test/instrumentation/modules' ${GIT_DIFF} | sed 's#test/instrumentation/modules/##g' >> ${CHANGES}

  if [[ $(wc -l <${CHANGES}) -gt 0 ]]; then
    sed -iback '/^@/! s#/.*##g; s#^/##g; s#\..*##g' ${CHANGES}

    ## Let's sort the unique matches
    sort -u -o ${CHANGES} ${CHANGES}

    ## Filter out Node.js core modules
    CHANGES_ARR=()
    while read -r tav; do
      skip=
      for core_module in "${NODE_CORE_MODULES[@]}"; do
        [[ $tav == $core_module ]] && { skip=1; break; }
      done
      [[ -n $skip ]] || CHANGES_ARR+=("$tav")
    done <${CHANGES}
    if [ ${#CHANGES_ARR[@]} -eq 0 ]; then
      exit
    fi

    ## Add the list of TAV
    for tav in "${CHANGES_ARR[@]}"; do
      echo "  - '$tav'" >> "${OUTPUT}"
    done
  fi
fi
