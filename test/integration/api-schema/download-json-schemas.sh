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
  "errors/error.json" \
  "metricsets/sample.json" \
  "metricsets/metricset.json" \
  "sourcemaps/payload.json" \
  "spans/span.json" \
  "transactions/mark.json" \
  "transactions/transaction.json" \
  "cloud.json" \
  "context.json" \
  "http_response.json" \
  "message.json" \
  "metadata.json" \
  "process.json" \
  "request.json" \
  "rum_experience.json" \
  "service.json" \
  "span_subtype.json" \
  "span_type.json" \
  "stacktrace_frame.json" \
  "system.json" \
  "tags.json" \
  "timestamp_epoch.json" \
  "transaction_name.json" \
  "transaction_type.json" \
  "user.json" \
)

mkdir -p \
  ${schemadir}/errors \
  ${schemadir}/transactions \
  ${schemadir}/spans \
  ${schemadir}/metricsets \
  ${schemadir}/sourcemaps

for i in "${FILES[@]}"; do
  download_schema https://raw.githubusercontent.com/elastic/apm-server/master/docs/spec/${i} ${schemadir}/${i}
done
echo "Done."
