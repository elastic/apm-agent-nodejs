/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const cassandra = require('cassandra-driver')

const defaultOptions = {
  contactPoints: [process.env.CASSANDRA_HOST || 'localhost'],
  localDataCenter: 'datacenter1'
}

function maybeInitialize (options) {
  if (!options.keyspace) {
    return Promise.resolve()
  }

  const keyspace = options.keyspace
  const query1 = `
    CREATE KEYSPACE IF NOT EXISTS ${keyspace} WITH replication = {
      'class': 'SimpleStrategy',
      'replication_factor': 1
    };
  `
  const query2 = `
    CREATE TABLE IF NOT EXISTS ${keyspace}.${keyspace}(id uuid,text varchar,PRIMARY KEY(id));
  `

  const client = new cassandra.Client(defaultOptions)

  return new Promise((resolve, reject) => {
    client.execute(query1, (err) => {
      if (err) return reject(err)
      client.execute(query2, (err) => {
        if (err) return reject(err)
        client.shutdown(() => resolve())
      })
    })
  })
}

module.exports = function makeClient (t, opts) {
  const options = Object.assign({}, defaultOptions, opts)

  return maybeInitialize(options).then(() => {
    const client = new cassandra.Client(options)

    t.on('end', () => {
      client.shutdown()
    })

    return client
  })
}
