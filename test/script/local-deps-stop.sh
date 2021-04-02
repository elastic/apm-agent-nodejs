#!/usr/bin/env bash

# Explicitly *not* currently using "set -o errexit" because we want to
# stumble through and try to stop all the services.

echo stop postgres
pg_ctl -D /usr/local/var/postgres stop

if [[ -f /tmp/mongod.pid ]]; then
    echo
    echo stop mongodb
    kill $(cat /tmp/mongod.pid)
fi

if [[ -f /tmp/elasticsearch.pid ]]; then
    echo
    echo stop elasticsearch
    kill $(cat /tmp/elasticsearch.pid)
fi

if [[ -f /tmp/cassandra.pid ]]; then
    echo
    echo stop cassandra
    kill $(cat /tmp/cassandra.pid)
fi

if [[ -f /tmp/memcached.pid ]]; then
    echo
    echo stop memcached
    kill $(cat /tmp/memcached.pid)
fi

echo
echo stop redis
redis-cli shutdown

echo
echo start mysql
mysql.server stop
