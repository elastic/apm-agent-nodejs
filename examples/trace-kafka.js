#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing the 'kadfkajs' package.
//
// This assumes a Kafka server running on localhost. You can use:
//    npm run docker:start kafka
// to start a Kafka container. Then `npm run docker:stop` to stop it.

// eslint-disable-next-line no-unused-vars
const apm = require('../').start({
  serviceName: 'example-trace-kafka',
});

const { Kafka } = require('kafkajs');

const topic = 'trace-kafka-topic';
const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'],
});
const consumer = kafka.consumer();
const producer = kafka.producer();

async function run() {
  await producer.connect();
  await producer.send({
    topic,
    messages: [
      { value: 'message 1' },
      { value: 'message 2' },
      { value: 'message 3' },
    ],
  });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async function ({ topic, partition, message }) {
      console.log({
        value: message.value.toString(),
      });
    },
  });
}

run()
  .catch((err) => {
    console.warn('run err:', err);
  })
  .finally(async () => {
    await producer.disconnect();
    await consumer.disconnect();
  });
