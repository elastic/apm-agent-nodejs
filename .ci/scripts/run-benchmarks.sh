#!/usr/bin/env bash

# Bash strict mode
set -eo pipefail

# Found current script directory
RELATIVE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Found project directory
BASE_PROJECT="$(dirname "$(dirname "${RELATIVE_DIR}")")"

# Arguments
RESULT_FILE=$1
NODE_VERSION=$2
if [[ -z "$RESULT_FILE" || -z "$NODE_VERSION" ]]; then
  echo "usage: run-benchmarks.sh RESULT_FILE NODE_VERSION"
  exit 1
fi

# Prepare benchmark environment
export NODE_VERSION="${NODE_VERSION}"
source "${RELATIVE_DIR}/prepare-benchmarks-env.sh"

# Run benchmark
npm run bench:ci "${RESULT_FILE}" "${NODE_VERSION}"
