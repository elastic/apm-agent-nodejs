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
  "errors/v2_error.json" \
  "metricsets/metricset.json" \
  "metricsets/payload.json" \
  "metricsets/sample.json" \
  "sourcemaps/payload.json" \
  "spans/common_span.json" \
  "spans/v2_span.json" \
  "transactions/common_transaction.json" \
  "transactions/mark.json" \
  "transactions/v2_transaction.json" \
  "context.json" \
  "metadata.json" \
  "process.json" \
  "request.json" \
  "service.json" \
  "stacktrace_frame.json" \
  "system.json" \
  "tags.json" \
  "timestamp_rfc3339.json" \
  "user.json" \
)

mkdir -p \
  ${schemadir}/errors \
  ${schemadir}/transactions \
  ${schemadir}/spans \
  ${schemadir}/metricsets \
  ${schemadir}/sourcemaps

for i in "${FILES[@]}"; do
  download_schema https://raw.githubusercontent.com/elastic/apm-server/v2/docs/spec/${i} ${schemadir}/${i}
done
echo "Done."
