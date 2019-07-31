#!/usr/bin/env bash
## Given the git SHA it will parse the git log and search for any changes in any
## files under lib/instrumentation/modules/* or test/instrumentation/modules/*
## and will create a YAML file with the list of TAVs.
set -xuo pipefail

OUTPUT=$1

GIT_DIFF=git-diff.txt
CHANGES=changes.txt

cleanup() {
  rm -f ${CHANGES} ${GIT_DIFF} || true
}
trap cleanup EXIT

if [[ -n "${CHANGE_TARGET}" ]] && [[ -n "${GIT_SHA}" ]] ; then

  git diff --name-only origin/"${CHANGE_TARGET}"..."${GIT_SHA}" > ${GIT_DIFF}

  grep 'lib/instrumentation/modules' ${GIT_DIFF}| sed 's#lib/instrumentation/modules/##g' > ${CHANGES}
  grep 'test/instrumentation/modules' ${GIT_DIFF} | sed 's#test/instrumentation/modules/##g' >> ${CHANGES}

  if [[ $(wc -l <${CHANGES}) -gt 0 ]]; then
    sed -iback 's#/.*##g; s#^/##g; s#\..*##g' ${CHANGES}

    ## Generate the file with the content
    echo 'TAV:' > "${OUTPUT}"
    while read -r tav; do
      echo "  - $tav" >> "${OUTPUT}"
    done <${CHANGES}
  fi
fi
