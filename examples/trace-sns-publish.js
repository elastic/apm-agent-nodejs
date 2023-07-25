#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An example showing Elastic APM tracing the publishing of a message to an AWS
// SNS topic.
//
// Warning: Running this script can incur costs on your AWS account. Do not
// use this on production topics.
//
// Prerequisites:
// - AWS credentials are setup. E.g. if using the `aws` CLI
//   (https://aws.amazon.com/cli/) works, then you should be good.
// - You have a test SNS topic to which to send messages.
//   Use `aws sns list-topics` to list current topics in the configured region.
//
// Usage:
//    node trace-sns-publish.js REGION SNS-TOPIC-NAME
//
// Example:
//    node trace-sns-publish.js us-west-2 my-play-topic

const apm = require('../').start({
  serviceName: 'example-trace-sns',
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
const topicName = process.argv[3];
if (!region || !topicName) {
  console.error(`usage: node ${NAME} AWS-REGION SNS-TOPIC-NAME`);
  fail('missing arguments');
  process.exit();
}
console.log('SNS Publish to region=%s topicName=%s', region, topicName);

AWS.config.update({ region });
const sns = new AWS.SNS({ apiVersion: '2010-03-31' });

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const trans = apm.startTransaction('publish');

sns.listTopics(function (err, data) {
  if (err) {
    fail(err);
    return;
  }
  const matches = data.Topics.filter(
    (t) => t.TopicArn && t.TopicArn.endsWith(':' + topicName),
  );
  if (matches.length === 0) {
    fail(`could not find an SNS topic ARN in ${region} named "${topicName}"`);
    return;
  }
  const topicArn = matches[0].TopicArn;
  // console.log('topicArn:', topicArn)

  const params = {
    TopicArn: topicArn,
    Message: `this is my message (${Math.random()})`,
    MessageAttributes: {
      foo: { DataType: 'String', StringValue: 'bar' },
    },
  };
  console.log('Publishing with message: %j', params.Message);
  sns.publish(params, function (err, data) {
    if (err) {
      fail(err);
    } else {
      process.stdout.write('publish response data: ');
      console.dir(data, { depth: 5 });
    }
    trans.end();
  });
});
