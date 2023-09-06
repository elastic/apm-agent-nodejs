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

const agent = require('../../../..').start({
  serviceName: 'test-dynamodb',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: 'none',
  logLevel: 'off',
});
const tape = require('tape');
const AWS = require('aws-sdk');
const express = require('express');
const bodyParser = require('body-parser');
const fixtures = require('./fixtures/dynamodb');

const mockClient = require('../../../_mock_http_client');

const {
  getRegionFromRequest,
  getPortFromRequest,
  getStatementFromRequest,
  getAddressFromRequest,
  getMethodFromRequest,
} = require('../../../../lib/instrumentation/modules/aws-sdk/dynamodb');

const AWS_REGION = 'us-west-2';

initializeAwsSdk();

function initializeAwsSdk() {
  // SDk requires a region to be set
  AWS.config.update({ region: AWS_REGION });

  // without fake credentials the aws-sdk will attempt to fetch
  // credentials as though it was on an EC2 instance
  process.env.AWS_ACCESS_KEY_ID = 'fake-1';
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-2';
}

function createMockServer(fixture) {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: false }));
  app.post('/', (req, res) => {
    res.status(fixture.httpStatusCode);
    res.setHeader('Content-Type', 'application/javascript');
    res.send(fixture.response);
  });
  return app;
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
}

tape.test('AWS DynamoDB: Unit Test Functions', function (test) {
  test.test('function getRegionFromRequest', function (t) {
    const request = {
      service: {
        config: {
          region: AWS_REGION,
        },
      },
    };
    t.equals(getRegionFromRequest(request), AWS_REGION);
    t.equals(getRegionFromRequest({}), undefined);
    t.equals(getRegionFromRequest({ service: null }), null);
    t.equals(getRegionFromRequest({ service: { config: null } }), null);
    t.equals(
      getRegionFromRequest({ service: { config: { region: null } } }),
      null,
    );
    t.equals(getRegionFromRequest(), undefined);
    t.equals(getRegionFromRequest(null), null);
    t.end();
  });

  test.test('function getPortFromRequest', function (t) {
    const request = {
      service: {
        endpoint: {
          port: 443,
        },
      },
    };
    t.equals(getPortFromRequest(request), 443);
    t.equals(getPortFromRequest({}), undefined);
    t.equals(getPortFromRequest({ service: null }), null);
    t.equals(getPortFromRequest({ service: { endpoint: null } }), null);
    t.equals(
      getPortFromRequest({ service: { endpoint: { port: null } } }),
      null,
    );
    t.equals(getPortFromRequest(), undefined);
    t.equals(getPortFromRequest(null), null);
    t.end();
  });

  test.test('function getStatementFromRequest', function (t) {
    const request = {
      operation: 'query',
      params: {
        KeyConditionExpression: 'foo = :bar',
      },
    };
    t.equals(getStatementFromRequest(request), 'foo = :bar');
    t.equals(getStatementFromRequest({}), undefined);
    t.equals(getStatementFromRequest({ operation: null }), undefined);
    t.equals(
      getStatementFromRequest({ operation: 'query', params: {} }),
      undefined,
    );
    t.equals(
      getStatementFromRequest({
        operation: 'query',
        params: { KeyConditionExpression: null },
      }),
      undefined,
    );
    t.equals(getStatementFromRequest(), undefined);
    t.equals(getStatementFromRequest(null), undefined);
    t.end();
  });

  test.test('function getAddressFromRequest', function (t) {
    const request = {
      service: {
        endpoint: {
          hostname: 'dynamodb.us-west-2.amazonaws.com',
        },
      },
    };
    t.equals(
      getAddressFromRequest(request),
      'dynamodb.us-west-2.amazonaws.com',
    );
    t.equals(getAddressFromRequest({}), undefined);
    t.equals(getAddressFromRequest({ service: null }), null);
    t.equals(getAddressFromRequest({ service: { endpoint: null } }), null);
    t.equals(
      getAddressFromRequest({ service: { endpoint: { hostname: null } } }),
      null,
    );
    t.equals(getAddressFromRequest(), undefined);
    t.equals(getAddressFromRequest(null), null);
    t.end();
  });

  test.test('function getMethodFromRequest', function (t) {
    const request = {
      operation: 'query',
    };
    t.equals(getMethodFromRequest(request), 'Query');
    t.equals(getMethodFromRequest({}), undefined);
    t.equals(getMethodFromRequest({ operation: null }), undefined);
    t.equals(getAddressFromRequest(), undefined);
    t.equals(getAddressFromRequest(null), null);

    t.end();
  });
});

tape.test('AWS DynamoDB: End to End Test', function (test) {
  test.test('API: query', function (t) {
    const app = createMockServer(fixtures.query);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'db').pop();
        t.equals(
          span.name,
          'DynamoDB Query fixture-table',
          'span named correctly',
        );
        t.equals(span.type, 'db', 'span type correctly set');
        t.equals(span.subtype, 'dynamodb', 'span subtype set correctly');
        t.equals(span.action, 'query', 'query set correctly');
        t.deepEqual(
          span.context.service.target,
          { type: 'dynamodb', name: AWS_REGION },
          'span.context.service.target',
        );
        t.deepEqual(
          span.context.destination,
          {
            address: 'localhost',
            port,
            cloud: { region: AWS_REGION },
            service: { type: '', name: '', resource: `dynamodb/${AWS_REGION}` },
          },
          'span.context.destination',
        );
        t.deepEqual(
          span.context.db,
          {
            instance: AWS_REGION,
            statement: params.KeyConditionExpression,
            type: 'dynamodb',
          },
          'span.context.db',
        );
        t.end();
      });

      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
      var params = {
        TableName: 'fixture-table',
        KeyConditionExpression: 'id = :foo',
        ExpressionAttributeValues: {
          ':foo': { S: '001' },
        },
      };
      ddb.query(params, function (err, data) {
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in ddb.query callback',
        );
        t.error(err);
        agent.endTransaction();
        listener.close();
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after ddb.query(...)',
      );
    });
  });

  test.test('API: listTable', function (t) {
    const app = createMockServer(fixtures.listTable);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'db').pop();
        t.equals(span.name, 'DynamoDB ListTables', 'span named correctly');
        t.equals(span.type, 'db', 'span type correctly set');
        t.equals(span.subtype, 'dynamodb', 'span subtype set correctly');
        t.equals(span.action, 'query', 'query set correctly');
        t.deepEqual(
          span.context.service.target,
          { type: 'dynamodb', name: AWS_REGION },
          'span.context.service.target',
        );
        t.deepEqual(
          span.context.destination,
          {
            address: 'localhost',
            port,
            cloud: { region: AWS_REGION },
            service: { type: '', name: '', resource: `dynamodb/${AWS_REGION}` },
          },
          'span.context.destination',
        );
        t.deepEqual(
          span.context.db,
          {
            instance: AWS_REGION,
            type: 'dynamodb',
          },
          'span.context.db',
        );
        t.end();
      });

      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
      ddb.listTables(function (err, data) {
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in ddb.listTables callback',
        );
        t.error(err);
        agent.endTransaction();
        listener.close();
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after ddb.listTables(...)',
      );
    });
  });

  test.test('API: error', function (t) {
    const app = createMockServer(fixtures.error);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans.filter((span) => span.type === 'db').pop();
        t.ok(span, 'expect a db span');
        t.equals(
          span.outcome,
          'failure',
          'expect db span to have failure outcome',
        );
        t.equals(data.errors.length, 1, 'expect captured error');
        const error = data.errors[0];
        t.equals(
          error.parent_id,
          span.id,
          'error is a child of the failing span',
        );
        t.end();
      });
      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
      var params = {
        TableName: 'fixture-table',
        KeyConditionExpression: 'id = :foo',
        ExpressionAttributeValues: {
          ':foo': { S: '001' },
        },
      };
      ddb.query(params, function (err, data) {
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in ddb.query callback',
        );
        t.ok(err, 'expect error');
        agent.endTransaction();
        listener.close();
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after ddb.query(...)',
      );
    });
  });

  tape.test('AWS DynamoDB: No Transaction', function (test) {
    test.test('API: query', function (t) {
      const app = createMockServer(fixtures.query);
      const listener = app.listen(0, function () {
        resetAgent(function (data) {
          t.equals(data.spans.length, 0, 'no spans without transaction');
          t.end();
        });
        const port = listener.address().port;
        AWS.config.update({
          endpoint: `http://localhost:${port}`,
        });
        var ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
        var params = {
          TableName: 'fixture-table',
          KeyConditionExpression: 'id = :foo',
          ExpressionAttributeValues: {
            ':foo': { S: '001' },
          },
        };
        ddb.query(params, function (err, data) {
          t.error(err);
          listener.close();
        });
      });
    });
  });
});
