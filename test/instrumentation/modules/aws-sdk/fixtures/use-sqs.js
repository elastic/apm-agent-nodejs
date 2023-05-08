/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Run a single scenario of using the SQS client (callback style) with APM
// enabled. This is used to test that the expected APM events are generated.
// It writes log.info (in ecs-logging format, see
// https://github.com/trentm/go-ecslog#install) for each SQS client API call.
//
// This script can also be used for manual testing of APM instrumentation of SQS
// against a real AWS account. This can be useful because tests are done against
// https://github.com/localstack/localstack that *simulates* SQS.
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
//    # Run against the default configured AWS profile, creating a new bucket
//    # and deleting it afterwards.
//    node use-sqs.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-sqs.js | ecslog
//
//    # Use TEST_QUEUE_NAME to re-use an existing queue (and not delete it).
//    # For safety the queue name must start with "elasticapmtest-queue-".
//    TEST_QUEUE_NAME=elasticapmtest-queue-1 node use-sqs.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/trentm/c402bcab8c0571f26d879ec0bcf5759c

const apm = require('../../../../..').start({
  serviceName: 'use-sqs',
  centralConfig: false,
  metricsInterval: '0s',
  cloudProvider: 'none',
  captureExceptions: false,
  logUncaughtExceptions: true,
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info'
})

const crypto = require('crypto')
const vasync = require('vasync')
const AWS = require('aws-sdk')
const assert = require('assert')

const TEST_QUEUE_NAME_PREFIX = 'elasticapmtest-queue-'

// ---- support functions

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html
function useSQS (sqsClient, queueName, cb) {
  const region = sqsClient.config.region
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: sqsClient.config.endpoint,
    queueName,
    region
  })
  let queueUrl = null
  // const key = 'aDir/aFile.txt'
  // const content = 'hi there'

  vasync.pipeline({
    arg: {},
    funcs: [
      // Limitation: this doesn't handle paging.
      function listQueues (arg, next) {
        sqsClient.listQueues({}, function (err, data) {
          log.info({ err, data }, 'listQueues')
          assert(apm.currentSpan === null,
            'SQS span should NOT be a currentSpan in its callback')
          if (err) {
            next(err)
          } else {
            arg.queueIsPreexisting = false
            if (data.QueueUrls) {
              data.QueueUrls.forEach(qUrl => {
                if (qUrl.endsWith('/' + queueName)) {
                  arg.queueIsPreexisting = true
                  queueUrl = qUrl
                }
              })
            }
            next()
          }
        })
        assert(apm.currentSpan === null,
          'SQS span (or its HTTP span) should not be currentSpan in same async task after the method call')
      },

      function createTheQueueIfNecessary (arg, next) {
        if (arg.queueIsPreexisting) {
          next()
          return
        }

        sqsClient.createQueue({
          QueueName: queueName,
          Attributes: {
            FifoQueue: 'true', // Ensure order of messages to help testing.
            DelaySeconds: '10',
            MessageRetentionPeriod: '86400'
          }
        }, function (err, data) {
          log.info({ err, data }, 'createQueue')
          if (!err) {
            queueUrl = data.QueueUrl
          }
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#createQueue-property
      // > Note: After you create a queue, you must wait at least one second
      // > after the queue is created to be able to use the queue.
      function waitForBucketToExist (_, next) {
        setTimeout(next, 1000)
      },

      function sendMessage1 (_, next) {
        var params = {
          MessageGroupId: 'use-sqs',
          MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
          MessageAttributes: {
            foo: { DataType: 'String', StringValue: 'bar' }
          },
          MessageBody: 'this is message 1',
          QueueUrl: queueUrl
        }
        sqsClient.sendMessage(params, function (err, data) {
          assert(apm.currentSpan === null,
            'SQS span should NOT be a currentSpan in its callback')
          log.info({ err, data }, 'sendMessage 1')
          next(err)
        })
      },

      function sendMessage2ViaPromise (_, next) {
        var params = {
          MessageGroupId: 'use-sqs',
          MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
          MessageAttributes: {
            foo: { DataType: 'String', StringValue: 'bar' }
          },
          MessageBody: 'this is message 2',
          QueueUrl: queueUrl
        }
        sqsClient.sendMessage(params).promise()
          .then(data => {
            assert(apm.currentSpan === null,
              'SQS span should NOT be a currentSpan in its callback')
            log.info({ data }, 'sendMessage 2')
            next()
          })
          .catch(err => {
            assert(apm.currentSpan === null,
              'SQS span should NOT be a currentSpan in its callback')
            log.info({ err }, 'sendMessage 2')
            next(err)
          })
      },

      function sendMessageBatch (_, next) {
        var params = {
          QueueUrl: queueUrl,
          Entries: [
            {
              Id: '3',
              MessageGroupId: 'use-sqs',
              MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
              MessageAttributes: {
                foo: { DataType: 'String', StringValue: 'bar' }
              },
              MessageBody: 'this is message 3'
            },
            {
              Id: '4',
              MessageGroupId: 'use-sqs',
              MessageDeduplicationId: crypto.randomBytes(16).toString('hex'), // Avoid deduplication between runs.
              MessageAttributes: {
                foo: { DataType: 'String', StringValue: 'bar' }
              },
              MessageBody: 'this is message 4'
            }
          ]
        }
        sqsClient.sendMessageBatch(params, function (err, data) {
          assert(apm.currentSpan === null,
            'SQS span should NOT be a currentSpan in its callback')
          log.info({ err, data }, 'sendMessageBatch')
          next(err)
        })
      },

      // We expect a wait of a number of seconds, then receipt of message *1*.
      // XXX These two `receiveMessage*` steps are flaky. In general it will
      //     take N `sqsClient.receiveMessage()` calls to receive all 4 messages.
      //     We need to adjust that here and in sqs.test.js
      function receiveMessageA (_, next) {
        var params = {
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
          VisibilityTimeout: 10,
          WaitTimeSeconds: 20
        }
        sqsClient.receiveMessage(params, function (err, data) {
          log.info({ err, data }, 'receiveMessage A')
          if (err) {
            next(err)
          } else if (data.Messages && data.Messages.length > 0) {
            // XXX assert traceparent, tracestate

            sqsClient.deleteMessage({
              QueueUrl: queueUrl,
              ReceiptHandle: data.Messages[0].ReceiptHandle
            }, function (err, data) {
              log.info({ err, data }, 'deleteMessage')
              next(err)
            })
          } else {
            next(new Error('did not receive message 1'))
          }
        })
      },

      // We expect to receive the remaining messages from this run.
      function receiveMessageB (_, next) {
        var params = {
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
          VisibilityTimeout: 10,
          WaitTimeSeconds: 20
        }
        sqsClient.receiveMessage(params, function (err, data) {
          log.info({ err, data }, 'receiveMessage B')
          if (err) {
            next(err)
          } else if (data.Messages && data.Messages.length === 3) {
            // XXX assert traceparent, tracestate

            const entries = data.Messages.map((m, idx) => {
              return {
                Id: idx.toString(),
                ReceiptHandle: m.ReceiptHandle
              }
            })
            sqsClient.deleteMessageBatch({
              QueueUrl: queueUrl,
              Entries: entries
            }, function (err, data) {
              log.info({ err, data }, 'deleteMessage')
              next(err)
            })
          } else {
            next(new Error('did not receive messages 2, 3, and 4'))
          }
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#deleteQueue-property
      // > When you delete a queue, the deletion process takes up to 60 seconds.
      // > Requests you send involving that queue during the 60 seconds might
      // > succeed. For example, a SendMessage request might succeed, but after
      // > 60 seconds the queue and the message you sent no longer exist.
      // >
      // > When you delete a queue, you must wait at least 60 seconds before
      // > creating a queue with the same name.
      //
      // Dev Note: These delays might be painful for dev use. Comment out this
      // `deleteTheQueue` step for dev usage.
      function deleteTheQueue (_, next) {
        var params = {
          QueueUrl: queueUrl
        }
        sqsClient.deleteQueue(params, function (err, data) {
          log.info({ err, data }, 'deleteQueue')
          next(err)
        })
      }

      // function createObj (_, next) {
      //   XXX
      //   var md5 = crypto.createHash('md5').update(content).digest('base64')
      //   sqsClient.putObject({
      //     Bucket: queueName,
      //     Key: key,
      //     ContentType: 'text/plain',
      //     Body: content,
      //     ContentMD5: md5
      //   }, function (err, data) {
      //     // data.ETag should match a hexdigest md5 of body.
      //     log.info({ err, data }, 'putObject')
      //     next(err)
      //   })
      // },

      // function waitForObjectToExist (_, next) {
      //   sqsClient.waitFor('objectExists', {
      //     Bucket: queueName,
      //     Key: key
      //   }, function (err, data) {
      //     log.info({ err, data }, 'waitFor objectExists')
      //     next(err)
      //   })
      // },

      // // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property
      // function getObj (_, next) {
      //   sqsClient.getObject({
      //     Bucket: queueName,
      //     Key: key
      //   }, function (err, data) {
      //     log.info({ err, data }, 'getObject')
      //     next(err)
      //   })
      // },

      // function getObjConditionalGet (_, next) {
      //   const md5hex = crypto.createHash('md5').update(content).digest('hex')
      //   const etag = `"${md5hex}"`
      //   sqsClient.getObject({
      //     IfNoneMatch: etag,
      //     Bucket: queueName,
      //     Key: key
      //   }, function (err, data) {
      //     log.info({ err, data }, 'getObject conditional get')
      //     // Expect a 'NotModified' error, statusCode=304.
      //     if (err && err.code === 'NotModified') {
      //       next()
      //     } else if (err) {
      //       next(err)
      //     } else {
      //       next(new Error('expected NotModified error for conditional request'))
      //     }
      //   })
      // },

      // function getObjUsingPromise (_, next) {
      //   const req = sqsClient.getObject({
      //     Bucket: queueName,
      //     Key: key
      //   }).promise()
      //   assert(apm.currentSpan === null,
      //     'SQS span should NOT be the currentSpan after .promise()')

      //   req.then(
      //     function onResolve (data) {
      //       log.info({ data }, 'getObject using Promise, resolve')
      //       assert(apm.currentSpan === null,
      //         'SQS span should NOT be the currentSpan in promise resolve')
      //       next()
      //     },
      //     function onReject (err) {
      //       log.info({ err }, 'getObject using Promise, reject')
      //       assert(apm.currentSpan === null,
      //         'SQS span should NOT be the currentSpan in promise reject')
      //       next(err)
      //     }
      //   )
      // },

      // // Get a non-existant object to test APM captureError.
      // function getObjNonExistantObject (_, next) {
      //   const nonExistantKey = key + '-does-not-exist'
      //   sqsClient.getObject({
      //     Bucket: queueName,
      //     Key: nonExistantKey
      //   }, function (err, data) {
      //     log.info({ err, data }, 'getObject non-existant key, expect error')
      //     if (err) {
      //       next()
      //     } else {
      //       next(new Error(`did not get an error from getObject(${nonExistantKey})`))
      //     }
      //   })
      // },

      // // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObject-property
      // function deleteTheObj (_, next) {
      //   sqsClient.deleteObject({
      //     Bucket: queueName,
      //     Key: key
      //   }, function (err, data) {
      //     log.info({ err, data }, 'deleteObject')
      //     next(err)
      //   })
      // },

      // function deleteTheBucketIfCreatedIt (arg, next) {
      //   if (arg.queueIsPreexisting) {
      //     next()
      //     return
      //   }

      //   sqsClient.deleteBucket({
      //     Bucket: queueName
      //   }, function (err, data) {
      //     log.info({ err, data }, 'deleteBucket')
      //     next(err)
      //   })
      // }
    ]
  }, function (err) {
    if (err) {
      log.error({ err }, 'unexpected error using SQS')
    }
    cb(err)
  })
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an SQS
// queue name:
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
function getTimestamp () {
  return (new Date()).toISOString().split('.')[0].replace(/[^0-9]/g, '')
}

// ---- mainline

function main () {
  // Config vars.
  const region = process.env.TEST_REGION || 'us-east-2'
  const endpoint = process.env.TEST_ENDPOINT || null
  const queueName = (process.env.TEST_QUEUE_NAME ||
    TEST_QUEUE_NAME_PREFIX + getTimestamp()) + '.fifo'

  // Guard against any queue name being used because we will be creating and
  // deleting messages in it, and potentially *deleting* the queue.
  if (!queueName.startsWith(TEST_QUEUE_NAME_PREFIX)) {
    throw new Error(`cannot use queue name "${queueName}", it must start with ${TEST_QUEUE_NAME_PREFIX}`)
  }

  const sqsClient = new AWS.SQS({ apiVersion: '2012-11-05', endpoint, region })

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual')
  useSQS(sqsClient, queueName, function (err) {
    if (err) {
      tx.setOutcome('failure')
    }
    tx.end()
    process.exitCode = err ? 1 : 0
  })
}

main()
