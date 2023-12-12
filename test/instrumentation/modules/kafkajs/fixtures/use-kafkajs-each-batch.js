/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const apm = require('../../../../..').start({
  serviceName: 'use-kafkajs',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
});

const { Buffer } = require('buffer');

const { Kafka } = require('kafkajs');
/** @type {import('kafkajs').Admin} */
let admin;
/** @type {import('kafkajs').Consumer} */
let consumer;
/** @type {import('kafkajs').Producer} */
let producer;

const TEST_TOPIC_PREFIX = 'elasticapmtest-topic-';

/**
 * @param {import('kafkajs').Kafka} kafkaClient
 * @param {{topic: string; groupId: string}} options
 */
async function useKafkajsClient(kafkaClient, options) {
  const { topic, groupId } = options;
  const log = apm.logger.child({
    'event.module': 'kafkajs',
    topic,
  });

  admin = kafkaClient.admin();
  consumer = kafkaClient.consumer({ groupId });
  producer = kafkaClient.producer();

  // Create the topics & subscribe
  await admin.connect();
  await admin.createTopics({
    topics: [{ topic }],
  });
  log.info('createTopics');

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topics: [topic], fromBeginning: true });
  log.info('all connected');

  let batchMessagesConsumed = 0;
  await consumer.run({
    eachBatch: async function ({ batch }) {
      batch.messages.forEach((message) => {
        log.info(`batch message received: ${message.value.toString()}`);
        batchMessagesConsumed++;
      });
    },
  });

  // 1st test trasnsactions for each message received
  // Ensure an APM transaction so spans can happen.
  let data;
  const batchTx = apm.startTransaction(`manual send to ${topic}`);
  data = await producer.sendBatch({
    topicMessages: [
      {
        topic,
        messages: [
          { value: 'batch message 1', headers: { foo: 'string' } },
          { value: 'batch message 2', headers: { foo: Buffer.from('buffer') } },
          { value: 'batch message 3' },
        ],
      },
    ],
  });
  batchTx.end();
  log.info({ data }, 'batch sent');

  try {
    await waitUntil(() => batchMessagesConsumed >= 3, 5000);
  } catch (err) {
    log.error(err, ' messages could not be consumed after 30s');
  }

  await consumer.disconnect();
  await producer.disconnect();
  await admin.deleteTopics({ topics: [topic] });
  await admin.disconnect();
}

// ---- helper functions

/**
 * Retuns a promise which is resolved when the predicate becomes true or rejected
 * if the timeout is reached.
 * @param {() => boolean} predicate function which will return true to make ed of wait
 * @param {number} [timeout] max time in ms to wait for the predicste to be true (defaults to 5000)
 * @returns {Promise<void>}
 */
function waitUntil(predicate, timeout = 5000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const deltaTime = Date.now() - startTime;

      if (predicate()) {
        clearInterval(intervalId);
        resolve();
      } else if (deltaTime > timeout) {
        clearInterval(intervalId);
        reject(new Error(`timeout after ${deltaTime}ms`));
      }
    }, 1000);
  });
}

// ---- mainline

function main() {
  // Config vars.
  const clientId = process.env.TEST_CLIENT_ID || 'elastictest-kafka-client';
  const groupId = process.env.TEST_GROUP_ID || 'elastictest-kafka-group';
  const broker = process.env.TEST_KAFKA_URL || 'localhost:9093';
  const topic =
    process.env.TEST_TOPIC ||
    TEST_TOPIC_PREFIX + Math.floor(Math.random() * 1000);

  // Guard against any topic name being used because we will be sending and
  // receiveing in it, and potentially *deleting* the topic.
  if (!topic.startsWith(TEST_TOPIC_PREFIX)) {
    throw new Error(
      `cannot use bucket name "${topic}", it must start with ${TEST_TOPIC_PREFIX}`,
    );
  }

  const kafkaClient = new Kafka({ clientId, brokers: [broker] });

  useKafkajsClient(kafkaClient, { topic, groupId }).then(
    function () {
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, 'useKafkajsClient rejected');
      process.exitCode = 1;
    },
  );
}

main();
