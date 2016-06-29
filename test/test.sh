#!/usr/bin/env bash

for file in test/*.js; do
  node "$file" || exit $?;
done

for file in test/instrumentation/*.js; do
  node "$file" || exit $?;
done

for file in test/instrumentation/modules/*.js; do
  node "$file" || exit $?;
done
