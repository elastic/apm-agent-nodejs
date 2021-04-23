#!/usr/bin/env bash
set -xueo pipefail

RESULT_FILE=$1
NODE_VERSION=$2
if [[ -z "$RESULT_FILE" || -z "$NODE_VERSION" ]]; then
  echo "usage: run-benchmarks.sh RESULT_FILE NODE_VERSION"
  exit 1
fi

SCRIPTPATH=$(dirname "$0")
source ./${SCRIPTPATH}/prepare-benchmarks-env.sh

npm run bench:ci "${RESULT_FILE}" "${NODE_VERSION}"
