/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const agent = require('../..').start({
  serviceName: 'test-composite-context',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanCompressionEnabled: true,
});

const mockClient = require('../_mock_http_client');

const tape = require('tape');
tape.test(function (suite) {
  suite.test(function (t) {
    resetAgent(2, function (data) {
      t.equals(data.length, 2);
      t.equals(data.spans.length, 1);
      const span = data.spans.pop();
      t.equals(span.context.db.statement, dbContext.statement);
      t.equals(span.context.db.type, dbContext.type);
      console.log();
      t.end();
    });

    const dbContext = { statement: 'SELECT foo from bar', type: 'sql' };
    agent.startTransaction('test');
    const span1 = agent.startSpan('name1', 'db', 'mysql', { exitSpan: true });
    span1.setDbContext(dbContext);
    span1.end();

    const span2 = agent.startSpan('name1', 'db', 'mysql', { exitSpan: true });
    span2.setDbContext(dbContext);
    span2.end();

    agent.endTransaction();
    agent.flush();
  });
  suite.end();
});

function resetAgent(numExpected, cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(numExpected, cb);
  agent.captureError = function (err) {
    throw err;
  };
}
