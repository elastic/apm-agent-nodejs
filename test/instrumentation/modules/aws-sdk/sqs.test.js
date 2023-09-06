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

const { execFile } = require('child_process');
const util = require('util');

const semver = require('semver');
const tape = require('tape');

const logging = require('../../../../lib/logging');
const { MockAPMServer } = require('../../../_mock_apm_server');
const { validateSpan } = require('../../../_validate_schema');

const {
  getToFromFromOperation,
  getActionFromRequest,
  getQueueNameFromRequest,
  getRegionFromRequest,
  getMessageDestinationContextFromRequest,
  shouldIgnoreRequest,
} = require('../../../../lib/instrumentation/modules/aws-sdk/sqs');

const LOCALSTACK_HOST = process.env.LOCALSTACK_HOST || 'localhost';
const LOCALSTACK_PORT = 4566;
const ENDPOINT = 'http://' + LOCALSTACK_HOST + ':' + LOCALSTACK_PORT;

// ---- tests

tape.test('unit tests', function (suite) {
  suite.test('function getToFromFromOperation', function (t) {
    t.equals(getToFromFromOperation('deleteMessage'), 'from');
    t.equals(getToFromFromOperation('deleteMessageBatch'), 'from');
    t.equals(getToFromFromOperation('receiveMessage'), 'from');
    t.equals(getToFromFromOperation('sendMessageBatch'), 'to');
    t.equals(getToFromFromOperation('sendMessage'), 'to');
    t.end();
  });

  suite.test('function getActionFromOperation', function (t) {
    const request = {};

    request.operation = 'deleteMessage';
    t.equals(getActionFromRequest(request), 'delete');

    request.operation = 'deleteMessageBatch';
    t.equals(getActionFromRequest(request), 'delete_batch');

    request.operation = 'receiveMessage';
    t.equals(getActionFromRequest(request), 'poll');

    request.operation = 'sendMessage';
    t.equals(getActionFromRequest(request), 'send');

    request.operation = 'sendMessageBatch';
    t.equals(getActionFromRequest(request), 'send_batch');

    request.operation = 'sendMessageBatch';
    request.params = null;
    t.equals(getActionFromRequest(request), 'send_batch');

    request.operation = 'sendMessageBatch';
    request.params = {};
    t.equals(getActionFromRequest(request), 'send_batch');

    request.operation = 'receiveMessage';
    request.params = {};
    t.equals(getActionFromRequest(request), 'poll');

    request.operation = 'receiveMessage';
    request.params = { WaitTimeSeconds: 0 };
    t.equals(getActionFromRequest(request), 'poll');

    request.operation = 'receiveMessage';
    request.params = { WaitTimeSeconds: -1 };
    t.equals(getActionFromRequest(request), 'poll');

    request.operation = 'receiveMessage';
    request.params = { WaitTimeSeconds: 1 };
    t.equals(getActionFromRequest(request), 'poll');
    t.end();
  });

  suite.test('function getQueueNameFromRequest', function (t) {
    const request = {};
    t.equals(getQueueNameFromRequest(null), 'unknown');
    t.equals(getQueueNameFromRequest(request), 'unknown');

    request.params = null;
    t.equals(getQueueNameFromRequest(request), 'unknown');
    request.params = {};
    t.equals(getQueueNameFromRequest(request), 'unknown');

    request.params.QueueUrl = null;
    t.equals(getQueueNameFromRequest(request), 'unknown');
    request.params.QueueUrl = 5;
    t.equals(getQueueNameFromRequest(request), 'unknown');
    request.params.QueueUrl = 'foo/baz/bar';
    t.equals(getQueueNameFromRequest(request), 'unknown');

    request.params.QueueUrl = 'http://foo/baz/bar';
    t.equals(getQueueNameFromRequest(request), 'bar');

    request.params.QueueUrl = 'http://foo/baz/bar/bing?some=params&ok=true';
    t.equals(getQueueNameFromRequest(request), 'bing');
    t.end();
  });

  suite.test('function getRegionFromRequest', function (t) {
    const request = {};
    t.equals(getRegionFromRequest(null), '');
    t.equals(getRegionFromRequest(request), '');

    request.service = null;
    t.equals(getRegionFromRequest(request), '');
    request.service = {};
    t.equals(getRegionFromRequest(request), '');

    request.service.config = null;
    t.equals(getRegionFromRequest(request), '');
    request.service.config = {};
    t.equals(getRegionFromRequest(request), '');

    request.service.config.region = null;
    t.equals(getRegionFromRequest(request), '');
    request.service.config.region = 'region-name';
    t.equals(getRegionFromRequest(request), 'region-name');

    t.end();
  });

  suite.test('function shouldIgnoreRequest', function (t) {
    t.equals(shouldIgnoreRequest(null, null), true);

    const request = {
      operation: 'deleteMessage',
      params: {
        QueueUrl: 'http://foo/baz/bar/bing?some=params&ok=true',
      },
    };
    const agent = {
      _conf: {
        ignoreMessageQueuesRegExp: [],
      },
      logger: logging.createLogger('off'),
    };

    t.equals(shouldIgnoreRequest(request, agent), false);

    agent._conf.ignoreMessageQueuesRegExp.push(/b.*g/);
    t.equals(shouldIgnoreRequest(request, agent), true);

    agent.operation = 'fakeMethod';
    t.equals(shouldIgnoreRequest(request, agent), true);

    t.end();
  });

  suite.test('function getMessageDestinationContext', function (t) {
    const request = {
      service: {
        config: {
          region: 'region-name',
        },
        endpoint: {
          hostname: 'example.com',
          port: 1234,
        },
      },
      params: {
        QueueUrl: 'http://foo/baz/bar/bing?some=params&ok=true',
      },
    };

    t.equals(getRegionFromRequest(request), 'region-name');
    t.equals(getQueueNameFromRequest(request), 'bing');

    t.deepEquals(getMessageDestinationContextFromRequest(request), {
      address: 'example.com',
      port: 1234,
      cloud: {
        region: 'region-name',
      },
    });
    t.end();
  });

  suite.end();
});

// Execute 'node fixtures/use-sqs.js' and assert APM server gets the expected
// spans.
tape.test('SQS usage scenario', function (t) {
  // Skip in earlier Node.js versions because use-sqs.js uses a recent core function.
  if (!semver.satisfies(process.version, '>=16.14.0')) {
    t.comment(
      `SKIP node ${process.version} is not supported by this fixture (requires: >=16.14.0})`,
    );
    t.end();
    return;
  }

  const server = new MockAPMServer();
  server.start(function (serverUrl) {
    const additionalEnv = {
      ELASTIC_APM_SERVER_URL: serverUrl,
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_QUEUE_NAME: 'elasticapmtest-queue-1',
      TEST_ENDPOINT: ENDPOINT,
      TEST_REGION: 'us-east-2',
    };
    t.comment(
      'executing test script with this env: ' + JSON.stringify(additionalEnv),
    );
    console.time && console.time('exec use-s3');
    execFile(
      process.execPath,
      ['fixtures/use-sqs.js'],
      {
        cwd: __dirname,
        timeout: 40000, // sanity guard on the test hanging
        maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
        env: Object.assign({}, process.env, additionalEnv),
      },
      function done(err, stdout, stderr) {
        console.timeLog && console.timeLog('exec use-s3');
        t.error(err, 'use-sqs.js did not error out');
        if (err) {
          t.comment('err: ' + util.inspect(err));
        }
        t.comment(`use-sqs.js stdout:\n${stdout}\n`);
        t.comment(`use-sqs.js stderr:\n${stderr}\n`);
        t.ok(server.events[0].metadata, 'APM server got event metadata object');

        // Sort the events by timestamp, then work through each expected span.
        const events = server.events
          .slice(1)
          // Filter out "metadata" events from possible multiple intake requests.
          .filter((e) => !e.metadata);
        events.sort((a, b) => {
          const aTimestamp = (a.transaction || a.span || a.error || {})
            .timestamp;
          const bTimestamp = (b.transaction || b.span || b.error || {})
            .timestamp;
          return aTimestamp < bTimestamp ? -1 : 1;
        });

        // First the transaction.
        t.ok(events[0].transaction, 'got the transaction');
        const tx = events.shift().transaction;

        // Limitations: We currently don't instrument ListQueues, CreateQueue, etc.
        // Filter those ones out.
        const spans = events
          .filter((e) => e.span)
          .map((e) => e.span)
          .filter((e) => !e.name.startsWith('POST '));

        // Compare some common fields across all spans.
        spans.forEach((s) => {
          const errs = validateSpan(s);
          t.equal(errs, null, 'span is valid  (per apm-server intake schema)');
        });
        t.equal(
          spans.filter((s) => s.trace_id === tx.trace_id).length,
          spans.length,
          'all spans have the same trace_id',
        );
        t.equal(
          spans.filter((s) => s.transaction_id === tx.id).length,
          spans.length,
          'all spans have the same transaction_id',
        );
        t.equal(
          spans.filter((s) => s.sync === false).length,
          spans.length,
          'all spans have sync=false',
        );
        t.equal(
          spans.filter((s) => s.sample_rate === 1).length,
          spans.length,
          'all spans have sample_rate=1',
        );
        function delVariableSpanFields(span) {
          // Return a copy of the span with variable and common fields to
          // facilitate t.deepEqual below.
          const s = Object.assign({}, span);
          delete s.id;
          delete s.transaction_id;
          delete s.parent_id;
          delete s.trace_id;
          delete s.timestamp;
          delete s.duration;
          delete s.sync;
          delete s.sample_rate;
          return s;
        }

        const sendMessageSpan = spans.shift();
        t.deepEqual(
          delVariableSpanFields(sendMessageSpan),
          {
            name: 'SQS SEND to elasticapmtest-queue-1.fifo',
            type: 'messaging',
            subtype: 'sqs',
            action: 'send',
            context: {
              service: {
                target: { type: 'sqs', name: 'elasticapmtest-queue-1.fifo' },
              },
              destination: {
                address: LOCALSTACK_HOST,
                port: 4566,
                cloud: { region: 'us-east-2' },
                service: {
                  type: '',
                  name: '',
                  resource: 'sqs/elasticapmtest-queue-1.fifo',
                },
              },
              message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
            },
            outcome: 'success',
          },
          'sendMessage',
        );

        const sendMessagesBatchSpan = spans.shift();
        t.deepEqual(
          delVariableSpanFields(sendMessagesBatchSpan),
          {
            name: 'SQS SEND_BATCH to elasticapmtest-queue-1.fifo',
            type: 'messaging',
            subtype: 'sqs',
            action: 'send_batch',
            context: {
              service: {
                target: { type: 'sqs', name: 'elasticapmtest-queue-1.fifo' },
              },
              destination: {
                address: LOCALSTACK_HOST,
                port: 4566,
                cloud: { region: 'us-east-2' },
                service: {
                  type: '',
                  name: '',
                  resource: 'sqs/elasticapmtest-queue-1.fifo',
                },
              },
              message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
            },
            outcome: 'success',
          },
          'sendMessageBatch',
        );

        // There will be one or more `SQS POLL ...` spans for the ReceiveMessage
        // API calls until all messages are retrieved -- with interspersed
        // `SQS DELETE_BATCH ...` spans to delete those messages as they are
        // received.
        let spanLinks = [];
        while (spans.length > 0) {
          const topSpanName = spans[0].name;
          if (topSpanName.startsWith('SQS POLL')) {
            const span = spans.shift();
            let numSpanLinks = 0;
            if (span.links) {
              numSpanLinks = span.links.length;
              spanLinks = spanLinks.concat(span.links);
              delete span.links;
            }
            t.deepEqual(
              delVariableSpanFields(span),
              {
                name: 'SQS POLL from elasticapmtest-queue-1.fifo',
                type: 'messaging',
                subtype: 'sqs',
                action: 'poll',
                context: {
                  service: {
                    target: {
                      type: 'sqs',
                      name: 'elasticapmtest-queue-1.fifo',
                    },
                  },
                  destination: {
                    address: LOCALSTACK_HOST,
                    port: 4566,
                    cloud: { region: 'us-east-2' },
                    service: {
                      type: '',
                      name: '',
                      resource: 'sqs/elasticapmtest-queue-1.fifo',
                    },
                  },
                  message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
                },
                outcome: 'success',
              },
              `receiveMessage (${numSpanLinks} span links)`,
            );
          } else if (topSpanName.startsWith('SQS DELETE_BATCH')) {
            t.deepEqual(
              delVariableSpanFields(spans.shift()),
              {
                name: 'SQS DELETE_BATCH from elasticapmtest-queue-1.fifo',
                type: 'messaging',
                subtype: 'sqs',
                action: 'delete_batch',
                context: {
                  service: {
                    target: {
                      type: 'sqs',
                      name: 'elasticapmtest-queue-1.fifo',
                    },
                  },
                  destination: {
                    address: LOCALSTACK_HOST,
                    port: 4566,
                    cloud: { region: 'us-east-2' },
                    service: {
                      type: '',
                      name: '',
                      resource: 'sqs/elasticapmtest-queue-1.fifo',
                    },
                  },
                  message: { queue: { name: 'elasticapmtest-queue-1.fifo' } },
                },
                outcome: 'success',
              },
              'deleteMessageBatch',
            );
          } else {
            break;
          }
        }

        t.deepEqual(
          spanLinks,
          [
            { trace_id: tx.trace_id, span_id: sendMessageSpan.id },
            { trace_id: tx.trace_id, span_id: sendMessagesBatchSpan.id },
            { trace_id: tx.trace_id, span_id: sendMessagesBatchSpan.id },
          ],
          'collected span.links',
        );

        t.equal(
          spans.length,
          0,
          `all spans accounted for, remaining spans: ${JSON.stringify(spans)}`,
        );

        server.close();
        t.end();
      },
    );
  });
});
