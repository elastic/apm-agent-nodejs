const cassandra = require('cassandra-driver')

module.exports = function makeClient (t, opts) {
  const options = Object.assign({
    contactPoints: [process.env.CASSANDRA_HOST || 'localhost']
  }, opts)

  const client = new cassandra.Client(options)

  t.on('end', () => {
    client.shutdown()
  })

  if (!options.keyspace) {
    return Promise.resolve(client)
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

  return client.execute(query1)
    .then(() => client.execute(query2))
    .then(() => client)
}
