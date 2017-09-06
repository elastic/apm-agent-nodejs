#!/usr/bin/env bash

if [[ "$CI" != "true" ]]; then
  pg_ctl -D /usr/local/var/postgres stop
  kill `cat /tmp/mongod.pid`
  kill `cat /tmp/elasticsearch.pid`
  redis-cli shutdown
  mysql.server stop
fi
