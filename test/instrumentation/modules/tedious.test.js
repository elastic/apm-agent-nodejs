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

const agent = require('../../../').start({
  serviceName: 'test-tedious',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
});

const tediousVer =
  require('../../../node_modules/tedious/package.json').version;
const semver = require('semver');
if (
  (semver.gte(tediousVer, '16.0.0') && semver.lt(process.version, '16.0.0')) ||
  (semver.gte(tediousVer, '15.0.0') && semver.lt(process.version, '14.0.0')) ||
  (semver.gte(tediousVer, '12.0.0') && semver.lt(process.version, '12.3.0')) ||
  (semver.gte(tediousVer, '11.0.0') && semver.lt(process.version, '10.17.0'))
) {
  console.log(
    `# SKIP tedious@${tediousVer} does not support node ${process.version}`,
  );
  process.exit();
}
const tedious = require('tedious');
const test = require('tape');

const mockClient = require('../../_mock_http_client');
const version = require('tedious/package').version;

let connOpts;
const hostname = process.env.MSSQL_HOST || '127.0.0.1';

if (semver.gte(version, '4.0.0')) {
  connOpts = {
    server: hostname,
    authentication: {
      type: 'default',
      options: {
        userName: 'SA',
        password: process.env.SA_PASSWORD || 'Very(!)Secure',
      },
    },
    options: {
      // Tedious@9 changed to `trustServerCertificate: false` by default.
      trustServerCertificate: true,
      // Silence deprecation warning in tedious@8.
      validateBulkLoadParameters: true,
    },
  };
} else {
  connOpts = {
    server: hostname,
    userName: 'SA',
    password: process.env.SA_PASSWORD || 'Very(!)Secure',
  };
}

function withConnection(t) {
  return new Promise((resolve, reject) => {
    const conn = new tedious.Connection(connOpts);
    const onConnect = (err) => {
      if (err) return reject(err);
      resolve(conn);
    };

    if (typeof tedious.connect === 'function') {
      // Tedious@8.3.0 deprecated automatic connection and tedious@9 dropped it,
      // requiring `conn.connect(onConnect)` usage.
      //
      // We cannot switch on the presence of `conn.connect` because a different
      // version of that existed before tedious@8.3.0; instead we check for the
      // top-level `tedious.connect` helper that was added in the same commit:
      // https://github.com/tediousjs/tedious/pull/1069
      conn.connect(onConnect);
    } else {
      conn.on('connect', onConnect);
    }

    t.on('end', () => {
      conn.close();
    });
  });
}

test('execSql', (t) => {
  const sql = 'select 1';

  resetAgent(2, function (data) {
    assertBasicQuery(t, sql, data);
    t.end();
  });

  withConnection(t).then(
    (connection) => {
      agent.startTransaction('foo');

      const request = new tedious.Request(sql, (err, rowCount) => {
        t.ok(
          agent.currentSpan === null,
          'mssql span should not spill into calling code',
        );
        t.error(err, 'no error');
        t.strictEqual(rowCount, 1, 'row count');
        agent.endTransaction();
      });

      request.on('row', (columns) => {
        t.ok(
          agent.currentSpan === null,
          'mssql span should not spill into calling code',
        );
        t.strictEqual(columns[0].value, 1, 'column value');
      });

      connection.execSql(request);
      t.ok(
        agent.currentSpan === null,
        'mssql span should not spill into calling code',
      );
    },
    (err) => {
      t.error(err, 'no error');
      t.fail('unable to connect to mssql');
    },
  );
});

test('prepare / execute', (t) => {
  const sql = 'select @value';

  resetAgent(3, function (data) {
    assertPreparedQuery(t, sql, data);
    t.end();
  });

  withConnection(t).then(
    (connection) => {
      agent.startTransaction('foo');

      const request = new tedious.Request(sql, (err, rowCount) => {
        t.ok(
          agent.currentSpan === null,
          'mssql span should not spill into calling code',
        );
        t.error(err, 'no error');
        t.strictEqual(rowCount, 1, 'row count');
        agent.endTransaction();
      });
      request.addParameter('value', tedious.TYPES.Int);

      request.on('row', (columns) => {
        t.ok(
          agent.currentSpan === null,
          'mssql span should not spill into calling code',
        );
        t.strictEqual(columns[0].value, 42, 'column value');
      });

      request.on('prepared', function () {
        t.ok(
          agent.currentSpan === null,
          'mssql span should not spill into calling code',
        );
        connection.execute(request, {
          value: 42,
        });
      });

      connection.prepare(request);
      t.ok(
        agent.currentSpan === null,
        'mssql span should not spill into calling code',
      );
    },
    (err) => {
      t.error(err, 'no error');
      t.fail('unable to connect to mssql');
    },
  );
});

function assertTransaction(t, sql, data, spanCount) {
  t.strictEqual(data.transactions.length, 1, 'transaction count');
  t.strictEqual(data.spans.length, spanCount, 'span count');

  var trans = data.transactions[0];
  t.strictEqual(trans.name, 'foo', 'transaction name');
}

function assertQuery(t, sql, span, name) {
  t.strictEqual(span.name, name, 'span name');
  t.strictEqual(span.type, 'db', 'span type');
  t.strictEqual(span.subtype, 'mssql', 'span subtype');
  t.strictEqual(span.action, 'query', 'span action');
  t.deepEqual(
    span.context.db,
    {
      statement: sql,
      type: 'sql',
    },
    'span db context',
  );
  t.deepEqual(
    span.context.service.target,
    { type: 'mssql' },
    'span.context.service.target',
  );
  t.deepEqual(
    span.context.destination,
    {
      service: {
        type: '',
        name: '',
        resource: 'mssql',
      },
      address: hostname,
      port: 1433,
    },
    'span.context.destination',
  );
}

function assertBasicQuery(t, sql, data) {
  assertTransaction(t, sql, data, 1);
  assertQuery(t, sql, data.spans[0], 'SELECT');
}

function assertPreparedQuery(t, sql, data) {
  assertTransaction(t, sql, data, 2);

  var spans = sortSpansBy(data.spans, (span) => span.name);
  assertQuery(t, sql, spans[0], 'SELECT');
  assertQuery(t, sql, spans[1], 'SELECT (prepare)');
}

function sortSpansBy(spans, fn) {
  return spans.sort((a, b) => {
    return fn(a) > fn(b) ? 1 : fn(b) > fn(a) ? -1 : 0;
  });
}

function resetAgent(expected, cb) {
  // first time this function is called, the real client will be present - so
  // let's just destroy it before creating the mock
  if (agent._apmClient.destroy) agent._apmClient.destroy();
  agent._apmClient = mockClient(expected, cb);
  agent._instrumentation.testReset();
}
