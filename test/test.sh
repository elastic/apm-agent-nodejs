#!/usr/bin/env bash

shopt -s extglob # allow for complex regex like globs

for file in test/!(_*).js; do
  node "$file" || exit $?;
done

for file in test/instrumentation/!(_*).js; do
  node "$file" || exit $?;
done

for file in test/instrumentation/modules/!(_*).js; do
  node "$file" || exit $?;
done

for file in test/instrumentation/modules/mysql/!(_*).js; do
  node "$file" || exit $?;
done
