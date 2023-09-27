/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small subset of "./use-client-sqs.js". Mainly this is to test that
// instrumentation of @aws-sdk/client-sqs in an ES module works.
// See "./use-client-sqs.js" for more details.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/@aws-sdk/fixtures/use-client-sqs.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'
import {
  SQSClient,
  CreateQueueCommand,
  SendMessageCommand,
  DeleteQueueCommand,
} from '@aws-sdk/client-sqs';

import assert from 'assert';
import { randomBytes } from 'crypto';

const TEST_QUEUE_NAME_PREFIX = 'elasticapmtest-queue-';

// ---- support functions

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
    MessageDeduplicationId: randomBytes(16).toString('hex'), // Avoid deduplication between runs.
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

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sqs/command/DeleteQueueCommand/
  command = new DeleteQueueCommand({ QueueUrl: queueUrl });
  data = await sqsClient.send(command);
  log.info({ data }, 'deleteQueue');
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
