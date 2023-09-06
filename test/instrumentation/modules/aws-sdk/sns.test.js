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
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: 'none',
  logLevel: 'off',
  cloudProvider: 'none',
  ignoreMessageQueues: ['arn:aws:sns:us-west-2:111111111111:ignore-name'],
});

const tape = require('tape');
const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');

const {
  getSpanNameFromRequest,
  getDestinationNameFromRequest,
  getArnOrPhoneNumberFromRequest,
  getMessageDestinationContextFromRequest,
} = require('../../../../lib/instrumentation/modules/aws-sdk/sns');
const fixtures = require('./fixtures/sns');
const mockClient = require('../../../_mock_http_client');

initializeAwsSdk();

function initializeAwsSdk() {
  // SDk requires a region to be set
  AWS.config.update({ region: 'us-west-2' });

  // without fake credentials the aws-sdk will attempt to fetch
  // credentials as though it was on an EC2 instance
  process.env.AWS_ACCESS_KEY_ID = 'fake-1';
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-2';
}

function createMockServer(fixture) {
  const app = express();
  app._receivedReqs = [];
  app.use(bodyParser.urlencoded({ extended: false }));
  app.post('/', (req, res) => {
    app._receivedReqs.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    });
    res.status(fixture.httpStatusCode);
    res.setHeader('Content-Type', 'text/xml');
    res.send(fixture.response);
  });
  return app;
}

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(cb);
}

tape.test('AWS SNS: Unit Test Functions', function (test) {
  test.test('getArnOrPhoneNumberFromRequest tests', function (t) {
    t.equals(
      getArnOrPhoneNumberFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many like it but this one is mine',
          TopicArn: 'foo',
        },
      }),
      'foo',
    );

    t.equals(
      getArnOrPhoneNumberFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many like it but this one is mine',
          TargetArn: 'bar',
        },
      }),
      'bar',
    );

    t.equals(
      getArnOrPhoneNumberFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many like it but this one is mine',
          PhoneNumber: '1-555-555-5555',
        },
      }),
      '1-555-555-5555',
    );

    t.end();
  });

  test.test('getDestinationNameFromRequest tests', function (t) {
    t.equals(
      getDestinationNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name',
        },
      }),
      'topic-name',
    );

    t.equals(
      getDestinationNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TargetArn:
            'arn:aws:sns:us-west-2:123456789012:endpoint/GCM/gcmpushapp/5e3e9847-3183-3f18-a7e8-671c3a57d4b3',
        },
      }),
      'endpoint/GCM/gcmpushapp',
    );

    // unlikely we'll receive a targetArn without /, but we should
    // do something reasonable, just in case
    t.equals(
      getDestinationNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TargetArn: 'arn:aws:sns:us-west-2:123456789012:endpoint:GCM',
        },
      }),
      'GCM',
    );

    t.equals(
      getDestinationNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:111111111111:foo/withslashes',
        },
      }),
      'foo/withslashes',
    );

    t.equals(
      getDestinationNameFromRequest({
        operation: 'publish',
        params: {
          Message: 'work test',
          Subject: 'Admin',
          PhoneNumber: '15037299028',
        },
      }),
      '<PHONE_NUMBER>',
    );

    t.equals(getDestinationNameFromRequest(null), undefined);
    t.equals(getDestinationNameFromRequest({}), undefined);
    t.equals(getDestinationNameFromRequest({ params: {} }), undefined);
    t.end();
  });

  test.test('getSpanNameFromRequest tests', function (t) {
    t.equals(
      getSpanNameFromRequest({
        operation: 'publish',
        params: {
          Message: 'work test',
          Subject: 'Admin',
          PhoneNumber: '15555555555',
        },
      }),
      'SNS PUBLISH to <PHONE_NUMBER>',
    );

    t.equals(
      getSpanNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TargetArn:
            'arn:aws:sns:us-west-2:123456789012:endpoint/GCM/gcmpushapp/5e3e9847-3183-3f18-a7e8-671c3a57d4b3',
        },
      }),
      'SNS PUBLISH to endpoint/GCM/gcmpushapp',
    );

    t.equals(
      getSpanNameFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:111111111111:foo:topic-name',
        },
      }),
      'SNS PUBLISH to topic-name',
    );

    t.equals(getSpanNameFromRequest(null), 'SNS PUBLISH to undefined');
    t.equals(getSpanNameFromRequest({}), 'SNS PUBLISH to undefined');
    t.equals(
      getSpanNameFromRequest({ params: {} }),
      'SNS PUBLISH to undefined',
    );
    t.end();
  });

  test.test('getMessageDestinationContextFromRequest tests', function (t) {
    t.deepEquals(
      getMessageDestinationContextFromRequest({
        operation: 'publish',
        params: {
          Message:
            'this is my test, there are many lot like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:111111111111:foo:topic-name',
        },
        service: {
          config: {
            region: 'us-west-2',
          },
          endpoint: {
            hostname: 'example.com',
            port: 1234,
          },
        },
      }),
      {
        address: 'example.com',
        port: 1234,
        cloud: { region: 'us-west-2' },
      },
    );

    t.deepEquals(getMessageDestinationContextFromRequest(null), {
      address: null,
      port: null,
      cloud: { region: null },
    });

    t.deepEquals(getMessageDestinationContextFromRequest({}), {
      address: undefined,
      port: undefined,
      cloud: { region: undefined },
    });
    t.end();
  });

  test.end();
});

tape.test('AWS SNS: End to End Test', function (test) {
  test.test('API: publish (using promise)', function (t) {
    const params = {
      Message:
        'this is my test, there are many like it but this one is mine' /* required */,
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name',
    };

    const app = createMockServer(fixtures.publish);
    const listener = app.listen(0, function () {
      const port = listener.address().port;
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.equals(
          span.name,
          'SNS PUBLISH to topic-name',
          'span named correctly',
        );
        t.equals(span.type, 'messaging', 'span type correctly set');
        t.equals(span.subtype, 'sns', 'span subtype set correctly');
        t.equals(span.action, 'publish', 'span action set correctly');
        t.equals(span.sync, false, 'span.sync is false');
        t.equals(span.context.message.queue.name, 'topic-name');
        t.deepEquals(
          span.context.service.target,
          { type: 'sns', name: 'topic-name' },
          'span.context.service.target',
        );
        t.deepEquals(
          span.context.destination,
          {
            address: 'localhost',
            port,
            cloud: { region: 'us-west-2' },
            service: { type: '', name: '', resource: 'sns/topic-name' },
          },
          'span.context.destination',
        );

        // Ensure the request sent to SNS included trace-context in message
        // attributes.
        t.equal(app._receivedReqs.length, 1);
        const req = app._receivedReqs[0];
        t.equal(req.body.Action, 'Publish', 'req.body.Action');
        // The fixture has 0 message attributes, so traceparent and tracestate
        // should be attributes 1 and 2.
        t.equal(
          req.body['MessageAttributes.entry.1.Name'],
          'traceparent',
          'traceparent message attribute Name',
        );
        t.equal(
          req.body['MessageAttributes.entry.1.Value.DataType'],
          'String',
          'traceparent message attribute DataType',
        );
        t.equal(
          req.body['MessageAttributes.entry.1.Value.StringValue'],
          `00-${span.trace_id}-${span.id}-01`,
          'traceparent message attribute StringValue',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Name'],
          'tracestate',
          'tracestate message attribute Name',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Value.DataType'],
          'String',
          'tracestate message attribute DataType',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Value.StringValue'],
          'es=s:1',
          'tracestate message attribute StringValue',
        );

        t.end();
      });

      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params)
        .promise();
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after sns.publish(...).promise()',
      );

      // Handle promise's fulfilled/rejected states
      publishTextPromise
        .then(function (data) {
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in SNS promise resolve',
          );
          agent.endTransaction();
          listener.close();
        })
        .catch(function (err) {
          t.ok(
            agent.currentSpan === null,
            'no currentSpan in SNS promise catch',
          );
          t.error(err);
          agent.endTransaction();
          listener.close();
        });
    });
  });

  test.test('API: publish (using callback)', function (t) {
    const params = {
      Message:
        'this is my test, there are many like it but this one is mine' /* required */,
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name',
    };

    const app = createMockServer(fixtures.publish);
    const listener = app.listen(0, function () {
      const port = listener.address().port;
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.equals(
          span.name,
          'SNS PUBLISH to topic-name',
          'span named correctly',
        );
        t.equals(span.type, 'messaging', 'span type correctly set');
        t.equals(span.subtype, 'sns', 'span subtype set correctly');
        t.equals(span.action, 'publish', 'span action set correctly');
        t.equals(span.sync, false, 'span.sync is false');
        t.equals(span.context.message.queue.name, 'topic-name');
        t.deepEquals(
          span.context.service.target,
          { type: 'sns', name: 'topic-name' },
          'span.context.service.target',
        );
        t.deepEquals(
          span.context.destination,
          {
            address: 'localhost',
            port,
            cloud: { region: 'us-west-2' },
            service: { type: '', name: '', resource: 'sns/topic-name' },
          },
          'span.context.destination',
        );

        // Ensure the request sent to SNS included trace-context in message
        // attributes.
        t.equal(app._receivedReqs.length, 1);
        const req = app._receivedReqs[0];
        t.equal(req.body.Action, 'Publish', 'req.body.Action');
        // The fixture has 0 message attributes, so traceparent and tracestate
        // should be attributes 1 and 2.
        t.equal(
          req.body['MessageAttributes.entry.1.Name'],
          'traceparent',
          'traceparent message attribute Name',
        );
        t.equal(
          req.body['MessageAttributes.entry.1.Value.DataType'],
          'String',
          'traceparent message attribute DataType',
        );
        t.equal(
          req.body['MessageAttributes.entry.1.Value.StringValue'],
          `00-${span.trace_id}-${span.id}-01`,
          'traceparent message attribute StringValue',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Name'],
          'tracestate',
          'tracestate message attribute Name',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Value.DataType'],
          'String',
          'tracestate message attribute DataType',
        );
        t.equal(
          req.body['MessageAttributes.entry.2.Value.StringValue'],
          'es=s:1',
          'tracestate message attribute StringValue',
        );

        t.end();
      });

      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      const sns = new AWS.SNS({ apiVersion: '2010-03-31' });
      sns.publish(params, function (err, _data) {
        t.error(err);
        t.ok(
          agent.currentSpan === null,
          'no currentSpan in sns.publish(...) callback',
        );
        agent.endTransaction();
        listener.close();
      });
      t.ok(
        agent.currentSpan === null,
        'no currentSpan in sync code after sns.publish(...)',
      );
    });
  });

  test.test('API: no transaction', function (t) {
    const params = {
      Message:
        'this is my test, there are many like it but this one is mine' /* required */,
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name',
    };

    const app = createMockServer(fixtures.publish);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.ok(!span, 'no messaging span without a transaction');
        t.end();
      });
      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });

      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params)
        .promise();

      // Handle promise's fulfilled/rejected states
      publishTextPromise
        .then(function (data) {
          listener.close();
        })
        .catch(function (err) {
          t.error(err);
          listener.close();
        });
    });
  });

  test.test('API: error', function (t) {
    const params = {
      Message:
        'this is my test, there are many like it but this one is mine' /* required */,
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:topic-name-not-exists',
    };

    const app = createMockServer(fixtures.publishNoTopic);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.equals(
          span.outcome,
          'failure',
          'error produces outcome=failure span',
        );
        t.equal(data.errors.length, 1, 'got 1 error');
        const error = data.errors[0];
        t.equal(
          error.parent_id,
          span.id,
          'error is a child of the failing span',
        );
        t.equal(error.exception.type, 'NotFound', 'error.exception.type');
        t.end();
      });
      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params)
        .promise();

      // Handle promise's fulfilled/rejected states
      publishTextPromise
        .then(function (data) {
          agent.endTransaction();
          listener.close();
        })
        .catch(function (err) {
          t.ok(err, 'error expected');
          agent.endTransaction();
          listener.close();
        });
    });
  });

  test.test('API: listTopics', function (t) {
    const app = createMockServer(fixtures.listTopics);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.ok(!span, 'only publish operation creates spans');
        t.end();
      });
      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .listTopics()
        .promise();

      // Handle promise's fulfilled/rejected states
      publishTextPromise
        .then(function (data) {
          agent.endTransaction();
          listener.close();
        })
        .catch(function (err) {
          t.error(err);
          agent.endTransaction();
          listener.close();
        });
    });
  });

  test.test('API: ignored queue', function (t) {
    const params = {
      Message:
        'this is my test, there are many like it but this one is mine' /* required */,
      TopicArn: 'arn:aws:sns:us-west-2:111111111111:ignore-name',
    };

    const app = createMockServer(fixtures.publish);
    const listener = app.listen(0, function () {
      resetAgent(function (data) {
        const span = data.spans
          .filter((span) => span.type === 'messaging')
          .pop();
        t.ok(!span, 'ignores configured topic name');
        t.end();
      });
      const port = listener.address().port;
      AWS.config.update({
        endpoint: `http://localhost:${port}`,
      });
      agent.startTransaction('myTransaction');
      const publishTextPromise = new AWS.SNS({ apiVersion: '2010-03-31' })
        .publish(params)
        .promise();

      // Handle promise's fulfilled/rejected states
      publishTextPromise
        .then(function (data) {
          agent.endTransaction();
          listener.close();
        })
        .catch(function (err) {
          t.error(err);
          agent.endTransaction();
          listener.close();
        });
    });
  });

  test.end();
});
