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

const { Buffer } = require('buffer');
const { TextEncoder } = require('util');

const { Kafka } = require('kafkajs');

const topic = 'trace-kafka-topic';
const kafka = new Kafka({ clientId: 'my-app', brokers: ['localhost:9093'] });
const admin = kafka.admin();

const headerStr = 'value inside buffer';
const headerEnc = new TextEncoder().encode(headerStr);
const headerBuf = Buffer.from(headerEnc);

let producer, consumer;
let messagesConsumed = 0;

async function run() {
  await admin.connect();
  await admin.createTopics({ topics: [{ topic }] });

  consumer = kafka.consumer({ groupId: 'trace-group' });
  producer = kafka.producer();

  await producer.connect();
  await producer.send({
    topic,
    messages: [
      { value: 'message 1', headers: { foo: 'bar' } },
      { value: 'message 2', headers: { foo: headerBuf } },
      { value: 'message 3' },
    ],
  });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: async function ({ topic, partition, message }) {
      console.log(`message from topic(${topic}): ${message.value.toString()}`);
      console.log(`message header ${message.headers.foo}`);
      messagesConsumed++;
    },
  });

  await new Promise((resolve, reject) => {
    let count = 0;
    const id = setInterval(() => {
      count++;
      if (messagesConsumed === 3) {
        clearInterval(id);
        resolve();
      } else if (count > 10) {
        // set a limit of 10s/retries
        clearInterval(id);
        reject(new Error('not receiving all messages after 10s'));
      }
    }, 1000);
  });
}

run()
  .catch((err) => {
    console.warn('run err:', err);
  })
  .finally(async () => {
    console.log('disconnecting Kafkajs client');
    await producer.disconnect();
    await consumer.disconnect();
    await admin.deleteTopics({ topics: [topic] });
    await admin.disconnect();
  });
