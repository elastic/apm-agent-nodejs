#!/usr/bin/env bash

shopt -s extglob # allow for complex regex-like globs

files () {
  [ -f "$1" ] && echo "$@"
}

echo "running: test/start/env/test.js"
cd test/start/env
OPBEAT_APP_ID=from-env node -r opbeat/start test.js || exit $?;
cd ../../..

echo "running: test/start/file/test.js"
cd test/start/file
node -r opbeat/start test.js || exit $?;
cd ../../..

for file in $(files test/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/modules/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/modules/http/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/modules/pg/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/modules/mysql/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done

for file in $(files test/instrumentation/modules/bluebird/!(_*).js); do
  echo "running: node $file"
  node "$file" || exit $?;
done
