##!/usr/bin/env bash
HOME=/app
rm -fr node_modules
npm i tap-junit

for tf in $(ls *-output.tap)
do
  filename=$(basename ${tf} output.tap) 
  if [ -s ${tf} ]; then
    cat ${tf}|./node_modules/.bin/tap-junit --package="Agent Node.js" > junit-${filename}-report.xml || true
  fi
done

for jf in $(ls junit-*-report.xml)
do
  if [ -f ${jf} ] && [ ! -s ${jf} ]; then
    rm ${jf}
  fi
done

exit 0