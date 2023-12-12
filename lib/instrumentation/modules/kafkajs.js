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

  const config = agent._conf;
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
      const tracestate = message.headers && message.headers.tracestate;
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
      if (
        config.captureBody === 'all' ||
        config.captureBody === 'transactions'
      ) {
        messageCtx.body = message.value.toString();
      }

      if (message.headers) {
        messageCtx.headers = Object.keys(message.headers).reduce(
          (acc, name) => {
            const value = message.headers[name];
            if (value instanceof Buffer) {
              acc[name] = value.toString('utf-8');
            } else {
              acc[name] = value;
            }
            return acc;
          },
          {},
        );
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
    return async function ({ batch }) {
      if (shouldIgnoreTopic(batch.topic, config)) {
        return origEachBatch.apply(this, arguments);
      }

      const trans = ins.startTransaction(`${NAME} RECEIVE from batch`, TYPE);

      // TODO: not sure if this should be here but we gat batches for only one topic
      const messageCtx = { queue: { name: batch.topic } };
      trans.setMessageContext(messageCtx);

      const serviceContext = {
        framework: { name: 'Kafka' },
      };
      trans.setServiceContext(serviceContext);

      // Extract span links from up to 1000 messages in this batch.
      // https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
      // A span link is created from a `traceparent` header in a message.
      const messages = batch && batch.messages;

      if (messages) {
        const links = [];
        const limit = Math.min(
          messages.length,
          constants.MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
        );

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (msg.headers && msg.headers.traceparent) {
            links.push({ context: msg.headers.traceparent.toString() });

            if (links.length >= limit) {
              break;
            }
          }
        }
        trans._addLinks(links);
      }

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
      shimmer.wrap(producer, 'sendBatch', wrapProducerSendBatch);
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
              // TODO: why doing it everywhere???
              if (name.startsWith('elastic-')) {
                return;
              }
              carrier[name] = value;
            },
          );
          msg.headers = newHeaders;
        });
      }

      if (!span || shouldIgnoreTopic(topic, config)) {
        return origSend.apply(this, arguments);
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
   * TODO: add comment
   * @param {Producer['sendBatch']} origSendBatch
   * @returns {Producer['sendBatch']}
   */
  function wrapProducerSendBatch(origSendBatch) {
    return async function (batch) {
      const span = ins.createSpan(
        `${NAME} send messages batch`,
        TYPE,
        SUBTYPE,
        'send',
        { exitSpan: true },
      );

      // W3C trace-context propagation.
      const runContext = ins.currRunContext();
      const parentSpan =
        span || runContext.currSpan() || runContext.currTransaction();

      if (parentSpan && batch.topicMessages) {
        batch.topicMessages.forEach((topicMessage) => {
          topicMessage.messages.forEach((msg) => {
            const newHeaders = Object.assign({}, msg.headers);
            parentSpan.propagateTraceContextHeaders(
              newHeaders,
              function (carrier, name, value) {
                // TODO: why doing it everywhere???
                if (name.startsWith('elastic-')) {
                  return;
                }
                carrier[name] = value;
              },
            );
            msg.headers = newHeaders;
          });
        });
      }

      // TODO: discuss this
      const topics =
        batch.topicMessages && batch.topicMessages.map((tm) => tm.topic);
      const shouldIgnoreBatch =
        topics && topics.every((t) => shouldIgnoreTopic(t, config));

      if (!span || shouldIgnoreBatch) {
        return origSendBatch.apply(this, arguments);
      }

      // TODO: mabe set if only one topic or all messages for same topic (which is unlikely?
      // span.setMessageContext({ queue: { name: topic } });

      // TODO: same here about the topic
      // const service = {
      //   resource: `${SUBTYPE}/${topic}`,
      //   type: SUBTYPE,
      //   name: topic,
      // };

      const service = { type: SUBTYPE };
      span._setDestinationContext({ service });

      let result, err;
      try {
        result = await origSendBatch.apply(this, arguments);
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
};

/**
 * Returns true if we have to ignore messages on the given topic
 * @param {string} topic the topic where client is publishing/subscribing
 * @param {{ ignoreMessageQueuesRegExp: RegExp[] }} config the agent's configuration object
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