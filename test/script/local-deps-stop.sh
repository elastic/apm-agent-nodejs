#!/usr/bin/env bash

pg_ctl -D /usr/local/var/postgres stop
kill `cat /tmp/mongod.pid`
kill `cat /tmp/elasticsearch.pid`
kill `cat /tmp/cassandra.pid`
kill `cat /tmp/memcached.pid`
redis-cli shutdown
mysql.server stop
docker stop dev-localstack
