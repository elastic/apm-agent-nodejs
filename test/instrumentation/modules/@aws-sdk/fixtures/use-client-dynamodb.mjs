/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small subset of "./use-client-dynamodb.js". Mainly this is to test that
// instrumentation of @aws-sdk/client-dynamodb in an ES module works.
// See "./use-client-dynamodb.js" for more details.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/@aws-sdk/fixtures/use-client-dynamodb.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

import assert from 'assert';

// ---- support functions

async function useClientDynamoDB(dynamoDBClient, tableName) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ListTablesCommand/
  const command = new ListTablesCommand();
  const data = await dynamoDBClient.send(command);
  assert(
    apm.currentSpan === null,
    'DynamoDB span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  console.log('ListTables found %d tables', data.TableNames.length);
}

// ---- mainline

function main() {
  const region = process.env.TEST_REGION || 'us-east-2';
  const endpoint = process.env.TEST_ENDPOINT || null;
  const dynamodbClient = new DynamoDBClient({ region, endpoint });

  const tx = apm.startTransaction('manual');
  useClientDynamoDB(dynamodbClient).then(
    function () {
      tx.end();
      dynamodbClient.destroy();
      process.exitCode = 0;
    },
    function () {
      tx.setOutcome('failure');
      tx.end();
      dynamodbClient.destroy();
      process.exitCode = 1;
    },
  );
}

main();
