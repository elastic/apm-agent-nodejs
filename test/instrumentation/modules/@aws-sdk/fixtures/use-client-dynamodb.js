/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Run a single scenario of using the DynamoDB client (callback style) with APM
// enabled. This is used to test that the expected APM events are generated.
// It writes log.info (in ecs-logging format, see
// https://github.com/trentm/go-ecslog#install) for each S3 client API call.
//
// This script can also be used for manual testing of APM instrumentation of DynamoDB
// against a real DynamoDB account. This can be useful because tests are done against
// https://github.com/localstack/localstack that *simulates* DynamoDB with imperfect
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
//    node use-client-dynamodb.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-client-s3.js | ecslog
//
//    # Use TEST_TABLE_NAME to re-use an existing table (and not delete it).
//    # For safety the table name must start with "elasticapmtest-table-".
//    TEST_TABLE_NAME=elasticapmtest-table-3 node use-client-dynamodb.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/david-luna/2b785a3197891505902fa85ee8ff3e3d

const apm = require('../../../../..').start({
  serviceName: 'use-client-dyamodb',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info'
})

// const crypto = require('crypto')
const assert = require('assert')
const {
  DynamoDBClient,
  ListTablesCommand,
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  DeleteTableCommand
} = require('@aws-sdk/client-dynamodb')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const TEST_TABLE_NAME_PREFIX = 'elasticapmtest-table-'

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/
async function useClientDynamoDB (dynamoDBClient, tableName) {
  const region = await dynamoDBClient.config.region()
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: dynamoDBClient.config.endpoint,
    region
  })

  let command
  let data

  command = new ListTablesCommand()
  data = await dynamoDBClient.send(command)
  assert(apm.currentSpan === null,
    'DynamoDB span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'query')

  const tableIsPreexisting = data.TableNames.some(t => t === tableName)
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/CreateTableCommand/
  if (!tableIsPreexisting) {
    command = new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        {
          AttributeName: 'RECORD_ID',
          AttributeType: 'S'
        }
      ],
      KeySchema: [
        {
          AttributeName: 'RECORD_ID',
          KeyType: 'HASH'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      }
    })
    data = await dynamoDBClient.send(command)
    log.info({ data }, 'createTable')
  }

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand/
  command = new PutItemCommand({
    TableName: tableName,
    Item: {
      RECORD_ID: { S: '001' }
    }
  })
  data = await dynamoDBClient.send(command)
  assert(apm.currentSpan === null,
    'DynamoDB span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'putItem')

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/QueryCommand/
  command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'RECORD_ID = :foo',
    ExpressionAttributeValues: {
      ':foo': { S: '001' }
    }
  })
  data = await dynamoDBClient.send(command)
  assert(apm.currentSpan === null,
    'DynamoDB span (or its HTTP span) should not be currentSpan after awaiting the task')
  log.info({ data }, 'query')

  // Get a signed URL.
  // This is interesting to test, because `getSignedUrl` uses the command
  // `middlewareStack` -- including our added middleware -- **without** calling
  // `dynamoDBClient.send()`. The test here is to ensure this doesn't break.
  const customSpan = apm.startSpan('get-signed-url')
  const signedUrl = await getSignedUrl(
    dynamoDBClient,
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'RECORD_ID = :foo',
      ExpressionAttributeValues: { ':foo': { S: '001' } }
    }),
    { expiresIn: 3600 })
  log.info({ signedUrl }, 'getSignedUrl')
  customSpan.end()

  command = new QueryCommand({
    TableName: tableName + '-unexistent',
    KeyConditionExpression: 'RECORD_ID = :foo',
    ExpressionAttributeValues: {
      ':foo': { S: '001' }
    }
  })
  try {
    data = await dynamoDBClient.send(command)
    throw new Error('expected ResourceNotFoundException error for query')
  } catch (err) {
    log.info({ err }, 'query with error')
    const statusCode = err && err.$metadata && err.$metadata.httpStatusCode
    if (statusCode !== 400) {
      throw err
    }
  }

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DeleteItemCommand/
  command = new DeleteItemCommand({
    TableName: tableName,
    Key: {
      RECORD_ID: { S: '001' }
    }
  })
  data = await dynamoDBClient.send(command)
  log.info({ data }, 'deleteItem')

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DeleteTableCommand/
  command = new DeleteTableCommand({ TableName: tableName })
  data = await dynamoDBClient.send(command)
  log.info({ data }, 'deleteTable')
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an S3
// bucket name:
// https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html#HowItWorks.NamingRules
function getTimestamp () {
  return (new Date()).toISOString().split('.')[0].replace(/[^0-9]/g, '')
}

// ---- mainline

function main () {
  const region = process.env.TEST_REGION || 'us-east-2'
  const endpoint = process.env.TEST_ENDPOINT || null
  const tableName = process.env.TEST_TABLE_NAME || TEST_TABLE_NAME_PREFIX + getTimestamp()

  // Guard against any table name being used because we will be creating and
  // deleting records in it, and potentially *deleting* the table.
  if (!tableName.startsWith(TEST_TABLE_NAME_PREFIX)) {
    throw new Error(`cannot use table name "${tableName}", it must start with ${TEST_TABLE_NAME_PREFIX}`)
  }

  const dynamoDBClient = new DynamoDBClient({
    region,
    endpoint
  })

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual')

  useClientDynamoDB(dynamoDBClient, tableName).then(
    function () {
      tx.end()
      dynamoDBClient.destroy()
      process.exitCode = 0
    },
    function (err) {
      apm.logger.error(err, 'useClientDynamoDB rejected')
      tx.setOutcome('failure')
      tx.end()
      dynamoDBClient.destroy()
      process.exitCode = 1
    }
  )
}

main()
