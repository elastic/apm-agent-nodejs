#!/usr/bin/env bash
set -xueo pipefail

HOME=/tmp
PATH=${PATH}:$(pwd)/node_modules/.bin:${HOME}/.npm-global/bin
export NPM_CONFIG_PREFIX=~/.npm-global
npm install -g tap-junit

for tf in $(ls *-output.tap)
do
  filename=$(basename ${tf} output.tap)
  if [ -s ${tf} ]; then
    cat ${tf}|tap-junit --package="Agent Node.js" > junit-${filename}-report.xml || true
  fi
done

for jf in $(ls junit-*-report.xml)
do
  if [ -f ${jf} ] && [ ! -s ${jf} ]; then
    rm ${jf}
  fi
done

exit 0
