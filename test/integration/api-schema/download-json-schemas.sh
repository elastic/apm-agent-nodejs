#!/usr/bin/env bash

set -x

download_schema()
{
  from=$1
  to=$2

  for run in {1..5}
  do
    curl -sf --compressed ${from} > ${to}
    result=$?
    if [ $result -eq 0 ]; then break; fi
    sleep 1
  done

  if [ $result -ne 0 ]; then exit $result; fi
}

schemadir="${1:-.schemacache}"

FILES=( \
  "errors/common_error.json" \
  "errors/v1_error.json" \
  "sourcemaps/payload.json" \
  "spans/common_span.json" \
  "spans/v1_span.json" \
  "transactions/common_transaction.json" \
  "transactions/mark.json" \
  "transactions/v1_transaction.json" \
  "common_system.json" \
  "context.json" \
  "process.json" \
  "request.json" \
  "service.json" \
  "stacktrace_frame.json" \
  "tags.json" \
  "timestamp_rfc3339.json" \
  "user.json" \
  "v1_system.json" \
)

mkdir -p \
  ${schemadir}/errors \
  ${schemadir}/transactions \
  ${schemadir}/spans \
  ${schemadir}/sourcemaps

for i in "${FILES[@]}"; do
  download_schema https://raw.githubusercontent.com/elastic/apm-server/6.x/docs/spec/${i} ${schemadir}/${i}
done
echo "Done."
