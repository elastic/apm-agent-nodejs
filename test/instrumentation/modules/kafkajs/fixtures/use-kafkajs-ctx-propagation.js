/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const TEST_TOPIC_PREFIX = 'elasticapmtest-topic-';

const apm = require('../../../../..').start({
  serviceName: 'use-kafkajs',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
  ignoreMessageQueues:
    process.env.TEST_MODE === 'send' ? [`${TEST_TOPIC_PREFIX}*`] : [],
});

const { Kafka } = require('kafkajs');
/** @type {import('kafkajs').Admin} */
let admin;
/** @type {import('kafkajs').Consumer} */
let consumer;
/** @type {import('kafkajs').Producer} */
let producer;

/**
 * @param {import('kafkajs').Kafka} kafkaClient
 * @param {{topic: string; groupId: string, mode: string}} options
 */
async function useKafkajsClient(kafkaClient, options) {
  const { topic, groupId, mode } = options;
  const log = apm.logger.child({
    'event.module': 'kafkajs',
    topic,
  });

  admin = kafkaClient.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic }],
  });
  log.info('createTopics');

  if (mode === 'send') {
    // On this mode we send some messages which are ingonerd as per agent config
    // this must be executed 1st
    producer = kafkaClient.producer();
    await producer.connect();
    log.info('producer connected');
    let data;
    const tx = apm.startTransaction(`manual send to ${topic}`);
    data = await producer.send({
      topic: topic,
      messages: [{ value: 'message 1' }],
    });
    log.info({ data }, 'messages sent');
    data = await producer.sendBatch({
      topicMessages: [
        {
          topic: topic,
          messages: [{ value: 'batch message 1' }],
        },
      ],
    });
    log.info({ data }, 'batch sent');
    tx.end();

    await producer.disconnect();
    log.info('messages sent');
  } else if (mode === 'consume') {
    // On this mode we consume the already sent messsages. This time they are
    // instrumented (not ignored) and trace context should be added to transactions
    // this must be executed 2nd
    consumer = kafkaClient.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({
      topics: [topic],
      fromBeginning: true,
    });
    log.info('consumer connected');

    let messagesConsumed = 0;
    await consumer.run({
      eachMessage: async function ({ message }) {
        log.info(`message received: ${message.value.toString()}`);
        messagesConsumed++;
      },
    });
    await waitUntil(() => messagesConsumed >= 2, 10000);
    log.info('messages consumed');
    await consumer.disconnect();
    log.info('consumer disconnect');
    await admin.deleteTopics({ topics: [topic] });
    log.info('topics deleted');
  }
  await admin.disconnect();
  log.info('admin disconnect');
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
  const mode = process.env.TEST_MODE;
  const clientId = process.env.TEST_CLIENT_ID || 'elastictest-kafka-client';
  const groupId = process.env.TEST_GROUP_ID || 'elastictest-kafka-group';
  const broker = process.env.TEST_KAFKA_HOST || 'localhost:9093';
  const topic =
    process.env.TEST_TOPIC ||
    TEST_TOPIC_PREFIX + Math.floor(Math.random() * 1000);

  // Guard against any topic name being used because we will be sending and
  // receiveing in it, and potentially *deleting* the topic.
  if (!topic.startsWith(TEST_TOPIC_PREFIX)) {
    throw new Error(
      `cannot use topic name "${topic}", it must start with ${TEST_TOPIC_PREFIX}`,
    );
  }

  if (!mode) {
    throw new Error(
      `cannot use ${__filename} wihtout a "TEST_MODE" set to "send|consume" in the env.`,
    );
  }

  const kafkaClient = new Kafka({ clientId, brokers: [broker] });

  useKafkajsClient(kafkaClient, { topic, groupId, mode }).then(
    function () {
      apm.logger.info(`useKafkajsClient in "${mode}" mode resolved`);
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, `useKafkajsClient in "${mode}" mode rejected`);
      process.exitCode = 1;
    },
  );
}

main();
