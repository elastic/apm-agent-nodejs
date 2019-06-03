##!/usr/bin/env bash
HOME=/app
PATH=${PATH}:$(pwd)/node_modules/.bin
rm -fr node_modules
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
