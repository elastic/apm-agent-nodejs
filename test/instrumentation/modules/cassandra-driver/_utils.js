/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const assert = require('assert');
const cassandra = require('cassandra-driver');

const defaultOptions = {
  contactPoints: [process.env.CASSANDRA_HOST || 'localhost'],
  localDataCenter: 'datacenter1',
};

function maybeInitialize(options) {
  options = options || {};
  if (!options.keyspace) {
    return Promise.resolve();
  }
  assert(
    options.table,
    'makeClient options must include "table" if "keyspace" is provided',
  );

  const keyspace = options.keyspace;
  const query1 = `
    CREATE KEYSPACE IF NOT EXISTS ${keyspace} WITH replication = {
      'class': 'SimpleStrategy',
      'replication_factor': 1
    };
  `;
  const query2 = `
    CREATE TABLE IF NOT EXISTS ${keyspace}.${options.table}(id uuid,text varchar,PRIMARY KEY(id));
  `;

  const client = new cassandra.Client(defaultOptions);

  return new Promise((resolve, reject) => {
    client.execute(query1, (err) => {
      if (err) return reject(err);
      client.execute(query2, (err) => {
        if (err) return reject(err);
        client.shutdown(() => resolve());
      });
    });
  });
}

/**
 * Return a promise for a Cassandra client.
 *
 * Optionally `opts.keyspace` and `opts.table` can be provided to initialize a
 * keyspace and table for testing. The caller should provide neither option, or
 * both.
 */
function makeClient(t, opts) {
  const cassOpts = Object.assign({}, defaultOptions, {
    keyspace: opts && opts.keyspace,
  });

  return maybeInitialize(opts).then(() => {
    const client = new cassandra.Client(cassOpts);

    t.on('end', () => {
      client.shutdown();
    });

    return client;
  });
}

module.exports = {
  makeClient,
};
