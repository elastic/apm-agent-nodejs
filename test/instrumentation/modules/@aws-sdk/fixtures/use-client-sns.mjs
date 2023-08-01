/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small subset of "./use-client-sns.js". Mainly this is to test that
// instrumentation of @aws-sdk/client-sns in an ES module works.
// See "./use-client-sns.js" for more details.
//
// Usage:
//    node --experimental-loader=./loader.mjs --require=./start.js test/instrumentation/modules/@aws-sdk/fixtures/use-client-sns.mjs

import apm from '../../../../../index.js'; // 'elastic-apm-node'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

import assert from 'assert';

// ---- support functions

async function useClientSNS(snsClient) {
  const command = new PublishCommand({
    Message: 'message to be sent',
    PhoneNumber: '+34555555555',
  });
  const data = await snsClient.send(command);
  assert(
    apm.currentSpan === null,
    'SNS span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  console.log('PublishCommand sent with id %s', data.MessageId);
}

// ---- mainline

function main() {
  const region = process.env.TEST_REGION || 'us-east-2';
  const endpoint = process.env.TEST_ENDPOINT || null;
  const snsClient = new SNSClient({ region, endpoint });

  const tx = apm.startTransaction('manual');
  useClientSNS(snsClient).then(
    function () {
      tx.end();
      snsClient.destroy();
      process.exitCode = 0;
    },
    function () {
      tx.setOutcome('failure');
      tx.end();
      snsClient.destroy();
      process.exitCode = 1;
    },
  );
}

main();
