#!/usr/bin/env bash

pg_ctl -D /usr/local/var/postgres stop
kill `cat /tmp/mongod.pid`
kill `cat /tmp/elasticsearch.pid`
kill `cat /tmp/cassandra.pid`
redis-cli shutdown
mysql.server stop
