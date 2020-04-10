#!/usr/bin/env bash
set -xueo pipefail

CUR_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
for i in generate_cc_changelog update_eol_doc
do
    cd $CUR_DIR/$i && docker build . -t $i
done
