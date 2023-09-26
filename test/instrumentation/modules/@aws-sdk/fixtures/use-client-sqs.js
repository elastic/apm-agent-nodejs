/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Run a single scenario of using the SQS client with APM enabled.
//
// This script can also be used for manual testing of APM instrumentation of SQS
// against a real AWS account. This can be useful because tests are done against
// https://github.com/localstack/localstack that *simulates* SQS.
//
// WARNINGs:
// - This can incur costs.
// - A given queue name (with `TEST_QUEUE_NAME`) is DELETED.
// - There is a 60s window after queue deletion where re-using that queue name
//   can result in surprising behaviour.
//
// Auth note: By default this uses the AWS profile/configuration from the
// environment. If you do not have that configured (i.e. do not have
// "~/.aws/...") files, then you can still use localstack via setting:
//    unset AWS_PROFILE
//    export AWS_ACCESS_KEY_ID=fake
//    export AWS_SECRET_ACCESS_KEY=fake
// See also: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html
//
// Usage:
//    # Run against the default configured AWS profile ('aws configure list').
//    # but defaulting to 'us-east-2' region.
//    node use-sqs.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-sqs.js | ecslog
//
//    # Specify a queue name to use. It must begin with 'elasticapmtest-queue-'.
//    TEST_QUEUE_NAME=elasticapmtest-queue-1 node use-client-sqs.js | ecslog
//

const apm = require('../../../../..').start({
  serviceName: 'use-client-sqs',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
});

const assert = require('assert');
const crypto = require('crypto');
const {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  SendMessageCommand,
  SendMessageBatchCommand,
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  ListQueuesCommand,
} = require('@aws-sdk/client-sqs');

const TEST_QUEUE_NAME_PREFIX = 'elasticapmtest-queue-';

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/
async function useClientSQS(sqsClient, queueName) {
  const region = await sqsClient.config.region();
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: sqsClient.config.endpoint,
    queueName,
    region,
  });

  let queueUrl;
  let command;
  let data;

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/CreateQueueCommand/
  // for testing purposes, shouldn't be instrumented
  command = new CreateQueueCommand({
    QueueName: queueName,
    Attributes: {
      FifoQueue: 'true', // Ensure order of messages to help testing.
      DelaySeconds: '10',
      MessageRetentionPeriod: '86400',
    },
  });
  data = await sqsClient.send(command);
  assert(
    apm.currentSpan === null,
    'SQS span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'createQueue');
  queueUrl = data.QueueUrl;

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#createQueue-property
  // > Note: After you create a queue, you must wait at least one second
  // > after the queue is created to be able to use the queue.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SendMessageCommand/
  command = new SendMessageCommand({
    MessageGroupId: 'use-sqs-client',
    MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
    MessageAttributes: {
      foo: { DataType: 'String', StringValue: 'bar' },
    },
    MessageBody: 'this is message 1',
    QueueUrl: queueUrl,
  });
  data = await sqsClient.send(command);
  assert(
    apm.currentSpan === null,
    'SQS span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'sendMessage');

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/SendMessageBatchCommand/
  command = new SendMessageBatchCommand({
    QueueUrl: queueUrl,
    Entries: [
      {
        Id: '2',
        MessageGroupId: 'use-sqs-client',
        MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
        MessageAttributes: {
          foo: { DataType: 'String', StringValue: 'bar' },
        },
        MessageBody: 'this is message 2',
      },
      {
        Id: '3',
        MessageGroupId: 'use-sqs-client',
        MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
        MessageAttributes: {
          foo: { DataType: 'String', StringValue: 'bar' },
        },
        MessageBody: 'this is message 3',
      },
    ],
  });
  data = await sqsClient.send(command);
  assert(
    apm.currentSpan === null,
    'SQS span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'sendMessageBatchCommand');

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/ReceiveMessageCommand/
  const messages = [];
  for (const attemptNum of [0, 1, 2, 3, 4]) {
    data = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
        VisibilityTimeout: 10,
        WaitTimeSeconds: 5,
      }),
    );
    log.info({ attemptNum, data }, 'receiveMessage');
    if (data.Messages) {
      messages.push(...data.Messages);
      // We effectively don't test `deleteMessage`, just the batch version. Meh.
      const entries = data.Messages.map((msg, idx) => {
        return { Id: idx.toString(), ReceiptHandle: msg.ReceiptHandle };
      });
      data = await sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: entries,
        }),
      );
      log.info({ data }, 'deleteMessageBatch');
    }
    if (messages.length >= 3) {
      break;
    }
  }
  if (messages.length !== 3) {
    const errmsg =
      'incomplete or unexpected messages after all ReceiveMessage attempts';
    log.error({ messages }, errmsg);
    throw new Error(errmsg);
  }
  assert.deepEqual(
    messages.map((msg) => msg.Body),
    ['this is message 1', 'this is message 2', 'this is message 3'],
    'got the expected message bodies in order',
  );

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/DeleteQueueCommand/
  // > When you delete a queue, the deletion process takes up to 60 seconds.
  // > Requests you send involving that queue during the 60 seconds might
  // > succeed. For example, a SendMessage request might succeed, but after
  // > 60 seconds the queue and the message you sent no longer exist.
  // >
  // > When you delete a queue, you must wait at least 60 seconds before
  // > creating a queue with the same name.
  command = new DeleteQueueCommand({ QueueUrl: queueUrl });
  data = await sqsClient.send(command);
  log.info({ data }, 'deleteQueue');

  // Warn if there are left over queues from runs of this file.
  command = new ListQueuesCommand({});
  data = await sqsClient.send(command);
  log.info({ data }, 'listQueues');
  if (data.QueueUrls) {
    const leftovers = data.QueueUrls.filter(
      (u) => u.indexOf('/' + TEST_QUEUE_NAME_PREFIX) !== -1,
    );
    if (leftovers.length > 0) {
      log.warn(
        { leftovers },
        'there are left over SQS queues from previous runs of this script',
      );
    }
  }
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an SNS
// topic name:
function getTimestamp() {
  return new Date()
    .toISOString()
    .split('.')[0]
    .replace(/[^0-9]/g, '');
}

// ---- mainline

function main() {
  // Config vars.
  const region = process.env.TEST_REGION || 'us-east-2';
  const endpoint = process.env.TEST_ENDPOINT || null;
  const queueName =
    (process.env.TEST_QUEUE_NAME || TEST_QUEUE_NAME_PREFIX + getTimestamp()) +
    '.fifo';

  // Guard against any queue name being used because we will be creating and
  // deleting messages in it, and potentially *deleting* the queue.
  if (!queueName.startsWith(TEST_QUEUE_NAME_PREFIX)) {
    throw new Error(
      `cannot use queue name "${queueName}", it must start with ${TEST_QUEUE_NAME_PREFIX} for safety`,
    );
  }

  const snsClient = new SQSClient({
    region,
    endpoint,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useClientSQS(snsClient, queueName).then(
    function () {
      tx.end();
      snsClient.destroy();
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, 'useClientSQS rejected');
      tx.setOutcome('failure');
      tx.end();
      snsClient.destroy();
      process.exitCode = 1;
    },
  );
}

main();
