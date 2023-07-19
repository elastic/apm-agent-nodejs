/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Run a single scenario of using the S3 client (callback style) with APM
// enabled. This is used to test that the expected APM events are generated.
// It writes log.info (in ecs-logging format, see
// https://github.com/trentm/go-ecslog#install) for each S3 client API call.
//
// This script can also be used for manual testing of APM instrumentation of S3
// against a real S3 account. This can be useful because tests are done against
// https://github.com/localstack/localstack that *simulates* S3 with imperfect
// fidelity.
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
//    node use-client-s3.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-client-s3.js | ecslog
//
//    # Use TEST_BUCKET_NAME to re-use an existing bucket (and not delete it).
//    # For safety the bucket name must start with "elasticapmtest-bucket-".
//    TEST_BUCKET_NAME=elasticapmtest-bucket-3 node use-client-s3.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/trentm/c402bcab8c0571f26d879ec0bcf5759c

const apm = require('../../../../..').start({
  serviceName: 'use-client-s3',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
  ignoreMessageQueues: [
    'arn:aws:sns:us-west-2:111111111111:ignore-name'
  ]
})

const assert = require('assert')
const {
  SNSClient,
  ListTopicsCommand,
  CreateTopicCommand,
  DeleteTopicCommand,
  PublishCommand
} = require('@aws-sdk/client-sns')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const TEST_TOPIC_NAME_PREFIX = 'elasticapmtest-topic-'

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/
async function useClientSNS (snsClient, topicName) {
  const region = await snsClient.config.region()
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: snsClient.config.endpoint,
    topicName,
    region
  })

  let command
  let data

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/ListTopicsCommand/
  // for testing purposes, shouldn't be instrumented
  command = new ListTopicsCommand({})
  data = await snsClient.send(command)
  assert(apm.currentSpan === null,
    'SNS span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'listTopics')

  let topicArn
  const preexistingTopic = data.Topics.find(t => t.TopicArn.split(':').pop() === topicName)

  if (!preexistingTopic) {
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/CreateTopicCommand/
    // for testing purposes, shouldn't be instrumented
    command = new CreateTopicCommand({ Name: topicName })
    data = await snsClient.send(command)
    assert(apm.currentSpan === null,
      'SNS span (or its HTTP span) should not be currentSpan after awaiting the task')
    log.info({ data }, 'createTopic')
    topicArn = data.TopicArn
  } else {
    topicArn = preexistingTopic.TopicArn
  }

  // Get a signed URL.
  // This is interesting to test, because `getSignedUrl` uses the command
  // `middlewareStack` -- including our added middleware -- **without** calling
  // `snsClient.send()`. The test here is to ensure this doesn't break.
  const customSpan = apm.startSpan('get-signed-url')
  const signedUrl = await getSignedUrl(
    snsClient,
    new ListTopicsCommand({}),
    { expiresIn: 3600 })
  log.info({ signedUrl }, 'getSignedUrl')
  customSpan.end()

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sns/command/PublishCommand/
  command = new PublishCommand({
    Message: 'message to be sent',
    PhoneNumber: '+34555555555'
  })
  data = await snsClient.send(command)
  assert(apm.currentSpan === null,
    'SNS span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'publish with PhoneNumber')

  command = new PublishCommand({
    Message: 'message to be sent',
    TopicArn: topicArn
  })
  data = await snsClient.send(command)
  assert(apm.currentSpan === null,
    'SNS span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'publish with TopicArn')

  command = new PublishCommand({
    Message: 'message to be sent',
    TopicArn: topicArn + '-unexistent'
  })
  try {
    data = await snsClient.send(command)
    throw new Error('expected NotFoundException error')
  } catch (err) {
    log.info({ data }, 'publish with non existent TopicArn')
    const statusCode = err && err.$metadata && err.$metadata.httpStatusCode
    if (statusCode !== 404) {
      throw err
    }
  }

  command = new PublishCommand({
    Message: 'message to be sent',
    TopicArn: 'arn:aws:sns:us-west-2:111111111111:ignore-name'
  })
  try {
    data = await snsClient.send(command)
    throw new Error('expected NotFoundException error')
  } catch (err) {
    log.info({ data }, 'publish with TopicArn to ignore')
    const statusCode = err && err.$metadata && err.$metadata.httpStatusCode
    if (statusCode !== 404) {
      throw err
    }
  }

  // TODO: execute a publish with TargetArn in input, combinations of phone and arn?

  command = new DeleteTopicCommand({ TopicArn: topicArn })
  data = await snsClient.send(command)
  assert(apm.currentSpan === null,
    'SNS span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'deleteTopic')
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an SNS
// topic name:
function getTimestamp () {
  return (new Date()).toISOString().split('.')[0].replace(/[^0-9]/g, '')
}

// ---- mainline

function main () {
  // Config vars.
  const region = process.env.TEST_REGION || 'us-east-2'
  const endpoint = process.env.TEST_ENDPOINT || null
  const topicName = process.env.TEST_TOPIC_NAME || TEST_TOPIC_NAME_PREFIX + getTimestamp()

  // Guard against any topic name being used because we will be publishing
  // messages in it, and potentially *deleting* the topic.
  if (!topicName.startsWith(TEST_TOPIC_NAME_PREFIX)) {
    throw new Error(`cannot use topic name "${topicName}", it must start with ${TEST_TOPIC_NAME_PREFIX}`)
  }

  const snsClient = new SNSClient({
    region,
    endpoint
  })

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual')

  useClientSNS(snsClient, topicName).then(
    function () {
      tx.end()
      snsClient.destroy()
      process.exitCode = 0
    },
    function (err) {
      apm.logger.error(err, 'useClientSNS rejected')
      tx.setOutcome('failure')
      tx.end()
      snsClient.destroy()
      process.exitCode = 1
    }
  )
}

main()
