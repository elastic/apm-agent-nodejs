#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An example showing Elastic APM tracing the sending of a message to an AWS
// SQS queue. See the related "trace-sqs-receive-message.js" script.
//
// Warning: Running this script can incur costs on your AWS account. Do not
// use this on production queues.
//
// Prerequisites:
// - AWS credentials are setup. E.g. if using the `aws` CLI
//   (https://aws.amazon.com/cli/) works, then you should be good.
// - You have a test queue to which to send messages. Use `aws sqs list-queues`
//   to list current queues in the configured region.
//
// Usage:
//    node trace-sqs-send-message.js REGION SQS-QUEUE-NAME
//
// Example:
//    node trace-sqs-send-message.js us-west-2 my-play-queue

const apm = require('../').start({
  serviceName: 'example-trace-sqs',
  logUncaughtExceptions: true,
});

const path = require('path');
const AWS = require('aws-sdk');

const NAME = path.basename(process.argv[1]);

function fail(err) {
  console.error(`${NAME}: error: ${err.toString()}`);
  process.exitCode = 1;
}

const region = process.argv[2];
const queueName = process.argv[3];
if (!region || !queueName) {
  console.error(`usage: node ${NAME} AWS-REGION SQS-QUEUE-NAME`);
  fail('missing arguments');
  process.exit();
}
console.log('SQS SendMessage to region=%s queueName=%s', region, queueName);

AWS.config.update({ region });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const trans = apm.startTransaction('send-message');

sqs.getQueueUrl({ QueueName: queueName }, function (err, data) {
  if (err) {
    fail(err);
    return;
  }
  const queueUrl = data.QueueUrl;
  // console.log('queueUrl:', queueUrl)

  const rand = Math.random();
  const params = {
    QueueUrl: queueUrl,
    MessageBody: `this is my message (${rand}})`,
    MessageAttributes: {
      foo: { DataType: 'String', StringValue: 'bar' },
    },
    // Only used for FIFO queues.
    MessageGroupId: 'example-trace-sqs',
    MessageDeduplicationId: rand.toString(),
  };
  console.log('Sending message with body: %j', params.MessageBody);
  sqs.sendMessage(params, function (err, data) {
    if (err) {
      fail(err);
    } else {
      process.stdout.write('sendMessage response data: ');
      console.dir(data, { depth: 5 });
    }
    trans.end();
  });
});
