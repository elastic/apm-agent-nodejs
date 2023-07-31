/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small subset of "./use-client-s3.js". Mainly this is to test that
// instrumentation of @aws-sdk/client-s3 in an ES module works.
// See "./use-client-s3.js" for more details.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/@aws-sdk/fixtures/use-client-s3.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

import assert from 'assert';

// ---- support functions

async function useClientS3(s3Client) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/listbucketscommand.html
  const command = new ListBucketsCommand({});
  const data = await s3Client.send(command);
  assert(
    apm.currentSpan === null,
    'S3 span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  console.log('ListBuckets found %d buckets', data.Buckets.length);
}

// ---- mainline

function main() {
  const region = process.env.TEST_REGION || 'us-east-2';
  const endpoint = process.env.TEST_ENDPOINT || null;
  const s3Client = new S3Client({ region, endpoint });

  const tx = apm.startTransaction('manual');
  useClientS3(s3Client).then(
    function () {
      tx.end();
      s3Client.destroy();
      process.exitCode = 0;
    },
    function () {
      tx.setOutcome('failure');
      tx.end();
      s3Client.destroy();
      process.exitCode = 1;
    },
  );
}

main();
