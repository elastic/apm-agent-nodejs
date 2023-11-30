/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { Buffer } = require('buffer');

const semver = require('semver');

const constants = require('../../constants');
const shimmer = require('../shimmer');

const NAME = 'Kafka';
const TYPE = 'messaging';
const SUBTYPE = 'kafka';

/**
 * @typedef {{ Kafka: import('kafkajs').Kafka}} KafkaModule
 * @typedef {(config: any) => Consumer} ConsumerFactory
 * @typedef {import('kafkajs').Consumer} Consumer
 * @typedef {import('kafkajs').ConsumerRunConfig} ConsumerRunConfig
 * @typedef {(config: any) => Producer} ProducerFactory
 * @typedef {import('kafkajs').Producer} Producer
 * @typedef {import('kafkajs').ProducerRecord} ProducerRecord
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

  /**
   * Returns a function which istrument the run callbacks `eachMessage` & `eachBatch`
   * @param {Consumer['run']} origRun
   * @returns {Consumer['run']}
   */
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
   * Returns the instrumented version of `eachMessage` which
   * - creates a transaction each time is called
   * - adds the trace context headers for distrubuted tracing
   * @param {ConsumerRunConfig['eachMessage']} origEachMessage
   * @returns {ConsumerRunConfig['eachMessage']}
   */
  function wrapEachMessage(origEachMessage) {
    return async function (payload) {
      const { topic, message } = payload;

      if (shouldIgnoreTopic(topic, config)) {
        return origEachMessage.apply(this, arguments);
      }

      const traceparent = message.headers && message.headers.traceparent;
      const tracestate = message.headers && message.headers.traceparent;
      const opts = {};

      // According to `kafkajs` types a header value might be
      // a string or Buffer
      // https://github.com/tulios/kafkajs/blob/ff3b1117f316d527ae170b550bc0f772614338e9/types/index.d.ts#L148
      if (typeof traceparent === 'string') {
        opts.childOf = traceparent;
      } else if (traceparent instanceof Buffer) {
        opts.childOf = traceparent.toString('utf-8');
      }

      if (typeof tracestate === 'string') {
        opts.tracestate = tracestate;
      } else if (tracestate instanceof Buffer) {
        opts.tracestate = tracestate.toString('utf-8');
      }

      const trans = ins.startTransaction(
        `${NAME} RECEIVE from ${topic}`,
        TYPE,
        opts,
      );

      const messageCtx = { queue: { name: topic } };
      if (config.captureBody) {
        messageCtx.body = message.value.toString();
      }

      if (message.headers) {
        messageCtx.headers = Object.assign({}, message.headers);
      }

      if (message.timestamp) {
        messageCtx.age = {
          ms: Date.now() - Number(message.timestamp),
        };
      }

      trans.setMessageContext(messageCtx);

      let result, err;
      try {
        result = await origEachMessage.apply(this, arguments);
      } catch (ex) {
        // Save the error for use in `finally` below, but re-throw it to
        // not impact code flow.
        err = ex;
        throw ex;
      } finally {
        trans.setOutcome(
          err ? constants.OUTCOME_FAILURE : constants.OUTCOME_SUCCESS,
        );
        trans.end();
      }

      return result;
    };
  }

  /**
   * Returns the instrumented version of `eachMessage` which
   * - creates a transaction each time is called
   * - adds the trace context headers for distrubuted tracing
   * @param {ConsumerRunConfig['eachBatch']} origEachBatch
   * @returns {ConsumerRunConfig['eachBatch']}
   */
  function wrapEachBatch(origEachBatch) {
    return async function (payload) {
      // Messages could come from different traces so we cannot
      // set a traceparent info in the new transaction
      // Q: maybe check if all messages have same traceparent?
      const trans = ins.startTransaction(`${NAME} RECEIVE from batch`, TYPE);

      // We do not use topic in `service.resouce` since messages could
      // come from different ones.
      trans._setDestinationContext({
        service: { resource: `${SUBTYPE}` },
      });

      let result, err;
      try {
        result = await origEachBatch.apply(this, arguments);
      } catch (ex) {
        // Save the error for use in `finally` below, but re-throw it to
        // not impact code flow.
        err = ex;
        throw ex;
      } finally {
        trans.setOutcome(
          err ? constants.OUTCOME_FAILURE : constants.OUTCOME_SUCCESS,
        );
        trans.end();
      }

      return result;
    };
  }

  /**
   * Returns a function which creates instrumented producers
   * @param {ProducerFactory} origProducer
   * @returns {ProducerFactory}
   */
  function wrapProducer(origProducer) {
    return function wrappedProducer() {
      const producer = origProducer.apply(this, arguments);

      shimmer.wrap(producer, 'send', wrapProducerSend);
      return producer;
    };
  }

  /**
   * TODO: add comment
   * @param {Producer['send']} origSend
   * @returns {Producer['send']}
   */
  function wrapProducerSend(origSend) {
    return async function (record) {
      const { topic } = record;

      if (shouldIgnoreTopic(topic, config)) {
        // TODO: ask trent about `contextPropagationOnly`
        return origSend.apply(this, arguments);
      }

      const span = ins.createSpan(
        `${NAME} send to ${topic}`,
        TYPE,
        SUBTYPE,
        'send',
        { exitSpan: true },
      );

      // W3C trace-context propagation.
      const runContext = ins.currRunContext();
      const parentSpan =
        span || runContext.currSpan() || runContext.currTransaction();

      if (parentSpan) {
        record.messages.forEach((msg) => {
          const newHeaders = Object.assign({}, msg.headers);
          parentSpan.propagateTraceContextHeaders(
            newHeaders,
            function (carrier, name, value) {
              if (name.startsWith('elastic-')) {
                return;
              }
              carrier[name] = value;
            },
          );
          msg.headers = newHeaders;
        });
      }

      if (!span) {
        return origSend.apply(this.arguments);
      }

      // We do not add headers or body because:
      // - `record.messages` is a list
      // - spec says is for transactions (https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#transaction-context-fields)
      span.setMessageContext({ queue: { name: topic } });

      const service = {
        resource: `${SUBTYPE}/${topic}`,
        type: SUBTYPE,
        name: topic,
      };

      span._setDestinationContext({ service });

      let result, err;
      try {
        result = await origSend.apply(this, arguments);
      } catch (ex) {
        // Save the error for use in `finally` below, but re-throw it to
        // not impact code flow.
        err = ex;
        throw ex;
      } finally {
        span.setOutcome(
          err ? constants.OUTCOME_FAILURE : constants.OUTCOME_SUCCESS,
        );
        span.end();
      }

      return result;
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
