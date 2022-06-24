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
// - You have a test queue to which to send messages.
//
// Usage:
//    node trace-sqs-send-message.js REGION SQS-QUEUE-NAME
//
// Example:
//    node trace-sqs-send-message.js us-west-2 my-play-queue

const apm = require('../').start({
  serviceName: 'example-trace-sqs'
})

const AWS = require('aws-sdk')

function errExit (err) {
  console.error(`${process.argv[1]}: error: ${err.toString()}`)
  process.exit(1)
}

const region = process.argv[2]
const queueName = process.argv[3]
if (!region || !queueName) {
  console.error(`usage: node ${process.argv[1]} AWS-REGION SQS-QUEUE-NAME`)
  errExit('missing arguments')
}
console.log('SQS SendMessage to region=%s queueName=%s', region, queueName)

AWS.config.update({ region })
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })

// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start a transaction. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
const trans = apm.startTransaction('send-message')

sqs.getQueueUrl({ QueueName: queueName }, function (err, data) {
  if (err) {
    errExit(err)
  }
  const queueUrl = data.QueueUrl
  console.log('queueUrl:', queueUrl)

  const params = {
    QueueUrl: queueUrl,
    MessageBody: `this is my message (${Math.random()})`,
    MessageAttributes: {
      foo: { DataType: 'String', StringValue: 'bar' }
    }
  }
  sqs.sendMessage(params, function (err, data) {
    if (err) {
      errExit(err)
    }
    process.stdout.write('sendMessage response data: ')
    console.dir(data, { depth: 5 })
    trans.end()
  })
})
