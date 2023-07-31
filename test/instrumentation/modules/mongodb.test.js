/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

const agent = require('../../..').start({
  serviceName: 'test-mongodb',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: false,
});

const isMongodbIncompat = require('../../_is_mongodb_incompat')();
if (isMongodbIncompat) {
  console.log(`# SKIP ${isMongodbIncompat}`);
  process.exit();
}

const { promisify } = require('util');

const MongoClient = require('mongodb').MongoClient;
const semver = require('semver');
const test = require('tape');

const mockClient = require('../../_mock_http_client');
const mockClientStates = require('../../_mock_http_client_states');

const mongodbSupportsCallbacks = semver.satisfies(
  require('mongodb/package.json').version,
  '<5',
);
const host = process.env.MONGODB_HOST || 'localhost';
const url = `mongodb://${host}:27017`;

test(
  'new MongoClient(url); client.connect(callback)',
  { skip: !mongodbSupportsCallbacks },
  function (t) {
    resetAgent(2, function (data) {
      t.equal(data.transactions[0].name, 't0', 'transaction.name');
      t.equal(data.spans.length, 1);
      t.equal(data.spans[0].name, 'elasticapm.test.find', 'span.name');
      t.equal(data.spans[0].subtype, 'mongodb', 'span.subtype');
      t.equal(
        data.spans[0].parent_id,
        data.transactions[0].id,
        'span.parent_id',
      );
      t.end();
    });
    // Explicitly test with no second argument to `new MongoClient(...)`, because
    // that was broken at one point.
    const client = new MongoClient(url);
    agent.startTransaction('t0');
    client.connect((err) => {
      t.error(err, 'no connect error');
      client
        .db('elasticapm')
        .collection('test')
        .findOne({ a: 1 }, function (err, res) {
          t.error(err, 'no findOne error');
          agent.endTransaction();
          agent.flush();
          client.close();
        });
    });
  },
);

test(
  'new MongoClient(url, {...}); client.connect(callback)',
  { skip: !mongodbSupportsCallbacks },
  function (t) {
    resetAgent(2, function (data) {
      t.equal(data.transactions[0].name, 't0', 'transaction.name');
      t.equal(data.spans.length, 1);
      t.equal(data.spans[0].name, 'elasticapm.test.find', 'span.name');
      t.equal(data.spans[0].subtype, 'mongodb', 'span.subtype');
      t.equal(
        data.spans[0].parent_id,
        data.transactions[0].id,
        'span.parent_id',
      );
      t.end();
    });
    const client = new MongoClient(url, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
    });
    agent.startTransaction('t0');
    client.connect((err) => {
      t.error(err, 'no connect error');
      client
        .db('elasticapm')
        .collection('test')
        .findOne({ a: 1 }, function (err, res) {
          t.error(err, 'no findOne error');
          agent.endTransaction();
          agent.flush();
          client.close();
        });
    });
  },
);

test(
  'MongoClient.connect(url, callback)',
  { skip: !mongodbSupportsCallbacks },
  function (t) {
    resetAgent(2, function (data) {
      t.equal(data.transactions[0].name, 't0', 'transaction.name');
      t.equal(data.spans.length, 1);
      t.equal(data.spans[0].name, 'elasticapm.test.find', 'span.name');
      t.equal(data.spans[0].subtype, 'mongodb', 'span.subtype');
      t.equal(
        data.spans[0].parent_id,
        data.transactions[0].id,
        'span.parent_id',
      );
      t.end();
    });
    agent.startTransaction('t0');
    MongoClient.connect(url, function (err, client) {
      t.error(err, 'no connect error');
      t.ok(client, 'got a connected client');
      client
        .db('elasticapm')
        .collection('test')
        .findOne({ a: 1 }, function (err, res) {
          t.error(err, 'no findOne error');
          agent.endTransaction();
          agent.flush();
          client.close();
        });
    });
  },
);

test('await MongoClient.connect(url)', async function (t) {
  // When using an `async function ...`, tape will automatically t.end() when
  // the function promise resolves. That means we cannot use the
  // `resetAgent(..., callback)` technique because `callback` may be called
  // *after* the test async function resolves. Instead we make a Promise for
  // `agent.flush(cb)`, do all assertions when that is complete, and await that.
  resetAgent(2, function noop() {});

  const client = await MongoClient.connect(url);
  agent.startTransaction('t0');
  await client.db('elasticapm').collection('test').findOne({ a: 1 });
  agent.endTransaction();

  await promisify(agent.flush.bind(agent))().then(function (err) {
    t.error(err, 'no error from agent.flush()');
    const data = agent._apmClient._writes;
    t.equal(data.transactions[0].name, 't0', 'transaction.name');
    t.equal(data.spans.length, 1);
    t.equal(data.spans[0].name, 'elasticapm.test.find', 'span.name');
    t.equal(data.spans[0].subtype, 'mongodb', 'span.subtype');
    t.equal(data.spans[0].parent_id, data.transactions[0].id, 'span.parent_id');
  });
  await client.close();
  t.end();
});

test('ensure run context', async function (t) {
  resetAgent(5, function noop() {});

  const client = await MongoClient.connect(url);
  agent.startTransaction('t0');
  const collection = client.db('elasticapm').collection('test');

  // There was a time when the spans created for Mongo client commands, while
  // one command was already inflight, would be a child of the inflight span.
  // That would be wrong. They should all be a direct child of the transaction.
  const promises = [];
  promises.push(
    collection.findOne({ a: 1 }).catch((err) => {
      t.error(err, 'no findOne error');
    }),
  );
  agent.startSpan('manual').end();
  promises.push(collection.findOne({ b: 2 }));
  promises.push(collection.findOne({ c: 3 }));
  await Promise.all(promises);

  agent.endTransaction();
  await promisify(agent.flush.bind(agent))().then(function (err) {
    t.error(err, 'no error from agent.flush()');
    const data = agent._apmClient._writes;
    t.equal(data.transactions[0].name, 't0', 'transaction.name');
    t.equal(data.spans.length, 4);
    data.spans.forEach((s) => {
      t.equal(
        s.parent_id,
        data.transactions[0].id,
        `span ${s.type}.${s.subtype} "${s.name}" is a child of the transaction`,
      );
    });
  });
  await client.close();
  t.end();
});

test('instrument simple command', async function (t) {
  resetAgentStates(
    [
      makeSpanTest(t, 'elasticapm.test.insert', 'insert'),
      makeSpanTest(t, 'elasticapm.test.update', 'update'),
      makeSpanTest(t, 'elasticapm.test.delete', 'delete'),
      makeSpanTest(t, 'elasticapm.test.find', 'find'),
      makeTransactionTest(t),
    ],
    function () {
      t.end();
    },
  );

  const client = await new MongoClient(url, {
    // These two options are to avoid deprecation warnings from some versions
    // of mongodb@3.
    useUnifiedTopology: true,
    useNewUrlParser: true,
  }).connect();

  agent.startTransaction('foo', 'bar');

  const db = client.db('elasticapm');
  const collection = db.collection('test');
  let results;
  let count;

  results = await collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], {
    w: 1,
  });
  count = getInsertedCountFromResults(results);
  t.strictEqual(count, 3, 'inserted three records');

  // If records have been inserted, they should be cleaned up
  t.on('end', async () => {
    await collection.deleteMany({}, { w: 1 });
    client.close();
  });

  results = await collection.updateOne({ a: 1 }, { $set: { b: 1 } }, { w: 1 });
  count = getMatchedCountFromResults(results);
  t.strictEqual(count, 1, 'updated one record');

  results = await collection.deleteOne({ a: 1 }, { w: 1 });
  count = getDeletedCountFromResults(results);
  t.strictEqual(count, 1, 'deleted one record');

  const cursor = collection.find({});
  let doc = await cursor.next();
  t.strictEqual(doc.a, 2, 'found record #2');

  doc = await cursor.next();
  t.strictEqual(doc.a, 3, 'found record #3');

  agent.endTransaction();
  agent.flush();
});

function makeTransactionTest(t) {
  return {
    find(type) {
      return type === 'transaction';
    },
    test(trans) {
      t.strictEqual(trans.name, 'foo', 'transaction name is "foo"');
      t.strictEqual(trans.type, 'bar', 'transaction type is "bar"');
      t.strictEqual(trans.result, 'success', 'transaction result is "success"');
    },
  };
}

function makeSpanTest(t, name, action) {
  return {
    find(type, span) {
      return type === 'span' && span.name === name;
    },
    test(span) {
      t.ok(span, 'found valid span');
      t.strictEqual(span.name, name, 'span.name');
      t.strictEqual(span.type, 'db', 'span.type');
      t.strictEqual(span.subtype, 'mongodb', 'span.subtype');
      t.strictEqual(span.action, action, 'span.action');

      t.deepEqual(
        span.context.db,
        { type: 'mongodb', instance: 'elasticapm' },
        'span.context.db',
      );
      t.deepEqual(
        span.context.service.target,
        { type: 'mongodb', name: 'elasticapm' },
        'span.context.service.target',
      );

      // We can't easily assert destination.address because mongodb >3.5.0
      // returns a resolved IP for the given connection hostname. In our CI
      // setup, the host is set to "mongodb" which is a Docker container with
      // some IP. We could `dns.resolve4()` here, but that's overkill I think.
      t.ok(
        span.context.destination.address,
        'context.destination.address is defined',
      );
      t.deepEqual(
        span.context.destination,
        {
          address: span.context.destination.address,
          port: 27017,
          service: { type: '', name: '', resource: 'mongodb/elasticapm' },
        },
        'span.context.destination',
      );
    },
  };
}

// MongoDB changed the structure of their results objects
// between version 3 and version 4
function getInsertedCountFromResults(results) {
  return results.result ? results.result.n : results.insertedCount;
}

function getMatchedCountFromResults(results) {
  return results.result ? results.result.n : results.matchedCount;
}

function getDeletedCountFromResults(results) {
  return results.result ? results.result.n : results.deletedCount;
}

function resetAgentStates(expectations, cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClientStates(expectations, cb);
  agent.captureError = function (err) {
    throw err;
  };
}

function resetAgent(numExpected, cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(numExpected, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
