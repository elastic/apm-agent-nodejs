#!/usr/bin/env bash

set -x

schemadir="${1:-.schemacache}"

FILES=( \
  "errors/error.json" \
  "errors/payload.json" \
  "sourcemaps/payload.json" \
  "transactions/mark.json" \
  "transactions/payload.json" \
  "transactions/span.json" \
  "transactions/transaction.json" \
  "context.json" \
  "process.json" \
  "request.json" \
  "service.json" \
  "stacktrace_frame.json" \
  "system.json" \
  "user.json" \
)

mkdir -p ${schemadir}/errors ${schemadir}/transactions ${schemadir}/sourcemaps

for i in "${FILES[@]}"; do
  output="${schemadir}/${i}"
  curl -sf --compressed https://raw.githubusercontent.com/elastic/apm-server/master/docs/spec/${i} > ${output} || exit $?
done
echo "Done."
