/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const semver = require('semver');

const constants = require('../../constants');
const shimmer = require('../shimmer');

const NAME = 'Kafka';
const TYPE = 'messaging';
const SUBTYPE = 'kafka';

/**
 * @typedef {{ Kafka: import('kafkajs').Kafka}} KafkaModule
 * @typedef {(config: any) => import('kafkajs').Producer} ProducerFactory
 * @typedef {(config: any) => import('kafkajs').Consumer} ConsumerFactory
 */

/**
 * @param {KafkaModule} mod
 * @param {any} agent
 * @param {Object} options
 * @param {string} options.version
 * @param {boolean} options.enabled
 */
module.exports = function (mod, agent, { version, enabled }) {
  // TODO: discuss this range
  if (!enabled || !semver.satisfies(version, '>=2 <3')) {
    return mod;
  }

  const config = agent._config;
  const ins = agent._instrumentation;

  agent.logger.debug('shimming Kafka.prototype.consumer');
  shimmer.wrap(mod.Kafka.prototype, 'consumer', wrapConsumer);
  agent.logger.debug('shimming Kafka.prototype.producer');
  shimmer.wrap(mod.Kafka.prototype, 'producer', wrapProducer);
  return mod;

  /**
   * Returns a function which creates instrumented consumers
   * @param {ConsumerFactory} origConsumer
   * @returns {ConsumerFactory}
   */
  function wrapConsumer(origConsumer) {
    return function wrappedConsumer() {
      const consumer = origConsumer.apply(this, arguments);

      shimmer.wrap(consumer, 'run', wrapConsumerRun);
      return consumer;
    };
  }

  function wrapConsumerRun(origRun) {
    return function wrappedConsumerRun() {
      const runConfig = arguments[0];

      if (typeof runConfig.eachMessage === 'function') {
        shimmer.wrap(runConfig, 'eachMessage', wrapEachMessage);
      }

      if (typeof runConfig.eachBatch === 'function') {
        shimmer.wrap(runConfig, 'eachBatch', wrapEachBatch);
      }

      return origRun.apply(this, arguments);
    };
  }

  /**
   * @param {import('kafkajs').EachMessageHandler} origEachMessage
   * @returns {import('kafkajs').EachMessageHandler}
   */
  function wrapEachMessage(origEachMessage) {
    return async function (payload) {
      const { topic, message } = payload;

      if (shouldIgnoreTopic(topic, config)) {
        return origEachMessage.apply(this, arguments);
      }

      console.log('kmessage', message);

      // XXX: This should be a transaction
      // should we use `startTransaction` or `createTransaction` ???
      // https://github.com/elastic/apm/blob/2ad487ebb18ba0a6d47507f2a699fa244841bfa5/specs/agents/tracing-instrumentation-messaging.md?plain=1#L34
      const trans = ins.startTransaction(
        `${NAME} RECEIVE from ${topic}`,
        TYPE,
        {}, // options
      );

      // XXX: if NoopTransaction we could finish right away
      if (trans.type === 'noop') {
        return origEachMessage.apply(this, arguments);
      }

      if (message.headers) {
        // TODO: look for a parent context if needed?
        trans.propagateTraceContextHeaders(
          message.headers,
          function (headers, name, value) {
            if (name.startsWith('elastic-')) {
              return;
            }
            headers[name] = value;
          },
        );
      }

      const messageCtx = { queue: { name: topic } };
      if (config.captureBody) {
        messageCtx.body = message.value.toString();
      }
      if (message.headers) {
        messageCtx.headers = Object.assign({}, message.headers);
      }

      // age: { ms: 0 }, // TODO: check kafkajs docs
      // message.timestamp
      trans.setMessageContext(messageCtx);

      // XXX: is necessary to bind????
      let result;
      try {
        result = await origEachMessage.apply(this, arguments);
        trans.setOutcome(constants.OUTCOME_SUCCESS);
      } catch (err) {
        trans.setOutcome(constants.OUTCOME_FAILURE);
      } finally {
        trans.end();
      }

      return result;
    };
  }

  /**
   * @param {import('kafkajs').EachBatchHandler} origEachMessage
   * @returns {import('kafkajs').EachBatchHandler}
   */
  function wrapEachBatch(origEachBatch) {
    return async function (payload) {
      const { batch } = payload;

      // XXX: the callback receives a batch with all mesages (Array) and use code will
      // treat them in some sort of loop (I guess) but it's hard to tell
      // We could do something simliar to java which is instrument the iterator
      // to start/end a transaction for each element iteration
      // https://github.com/elastic/apm/blob/2ad487ebb18ba0a6d47507f2a699fa244841bfa5/specs/agents/tracing-instrumentation-messaging.md?plain=1#L62C33-L62C33

      // for now just a transaction for the whole batch
      // XXX: This should be a transaction
      // should we use `startTransaction` or `createTransaction` ???
      // https://github.com/elastic/apm/blob/2ad487ebb18ba0a6d47507f2a699fa244841bfa5/specs/agents/tracing-instrumentation-messaging.md?plain=1#L34
      const trans = ins.startTransaction(
        `${NAME} RECEIVE from batch`,
        TYPE,
        {}, // options
      );

      // XXX: if NoopTransaction we could finish right away
      if (trans.type === 'noop') {
        return origEachBatch.apply(this, arguments);
      }

      // XXX: propagate context not possible if messages come from different traces

      trans._setDestinationContext({
        service: { resource: `${SUBTYPE}` }, // no topic because they may be multiple?
      });

      // XXX: is necessary to bind????
      let result;
      try {
        result = await origEachBatch.apply(this, arguments);
      } catch (err) {
        trans.setOutcome(constants.OUTCOME_FAILURE);
      } finally {
        trans.end();
      }

      return result;
    };
  }

  function wrapProducer(origProducer) {
    return function wrappedProducer() {
      const producer = origProducer.apply(this, arguments);

      // TODO: instrument producer
      return producer;
    };
  }

  /**
   * Returns true if we have to ignore messages on the given topic
   * @param {string} topic the topic where client is publishing/subscribing
   * @param {any} config the agent's configuration object
   * @returns {boolean}
   */
  function shouldIgnoreTopic(topic, config) {
    if (config.ignoreMessageQueuesRegExp) {
      for (const rule of config.ignoreMessageQueuesRegExp) {
        if (rule.test(topic)) {
          return true;
        }
      }
    }

    return false;
  }
};
