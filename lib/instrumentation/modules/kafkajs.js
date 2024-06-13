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
const { redactKeysFromObject } = require('../../filters/sanitize-field-names');

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
   * Returns the patched version of `Kafka.consumer` which creates a new
   * consumer with its `run` method patched to instrument message handling
   *
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
   * Return the patched version of `run` which instruments the
   * `eachMessage` & `eachBatch` callbacks.
   *
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
   * - add trace context into the transaction if present in message headers
   *
   * @param {ConsumerRunConfig['eachMessage']} origEachMessage
   * @returns {ConsumerRunConfig['eachMessage']}
   */
  function wrapEachMessage(origEachMessage) {
    return async function (payload) {
      const { topic, message } = payload;

      if (shouldIgnoreTopic(topic, config)) {
        return origEachMessage.apply(this, arguments);
      }

      // For distributed tracing this instrumentation is going to check
      // the headers defined by opentelemetry and ignore the propietary
      // `elasticaapmtraceparent` header
      // https://github.com/elastic/apm/blob/main/specs/agents/tracing-distributed-tracing.md#binary-fields
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
        messageCtx.body = message.value?.toString();
      }

      if (message.headers && config.captureHeaders) {
        // Make sure there is no sensitive data
        // and transform non-redacted buffers
        messageCtx.headers = redactKeysFromObject(
          message.headers,
          config.sanitizeFieldNamesRegExp,
        );
        Object.keys(messageCtx.headers).forEach((key) => {
          const value = messageCtx.headers[key];
          if (value instanceof Buffer) {
            messageCtx.headers[key] = value.toString('utf-8');
          }
        });
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
   * Returns the instrumented version of `eachBatch` which
   * - creates a transaction each time is called
   * - if trace context present in messages inks them to the transaction
   *
   * @param {ConsumerRunConfig['eachBatch']} origEachBatch
   * @returns {ConsumerRunConfig['eachBatch']}
   */
  function wrapEachBatch(origEachBatch) {
    return async function ({ batch }) {
      if (shouldIgnoreTopic(batch.topic, config)) {
        return origEachBatch.apply(this, arguments);
      }

      const trans = ins.startTransaction(
        `${NAME} RECEIVE from ${batch.topic}`,
        TYPE,
      );
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
        const traceparentsSeen = new Set();
        const links = [];
        const limit = Math.min(
          messages.length,
          constants.MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
        );

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const traceparent =
            msg.headers &&
            msg.headers.traceparent &&
            msg.headers.traceparent.toString();

          if (traceparent && !traceparentsSeen.has(traceparent)) {
            links.push({ context: traceparent });
            traceparentsSeen.add(traceparent);

            if (links.length >= limit) {
              break;
            }
          }
        }
        trans.addLinks(links);
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
   * Returns the patched version of `Kafka.producer` which creates a new
   * producer with `send` & `sendBatch` methods patched to instrument message sending
   *
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
   * Returns the instrumented version of `send` which
   * - creates an exit span each time is called
   * - propagates trace context through message headers
   *
   * @param {Producer['send']} origSend
   * @returns {Producer['send']}
   */
  function wrapProducerSend(origSend) {
    return async function (record) {
      const { topic } = record;
      let span;

      if (!shouldIgnoreTopic(topic, config)) {
        span = ins.createSpan(
          `${NAME} SEND to ${topic}`,
          TYPE,
          SUBTYPE,
          'send',
          { exitSpan: true },
        );
      }

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
   * Returns the patched version of `Producer.sendBatch` which
   * - creates an exit span for the operation
   * - propagates trace context via message headers
   *
   * @param {Producer['sendBatch']} origSendBatch
   * @returns {Producer['sendBatch']}
   */
  function wrapProducerSendBatch(origSendBatch) {
    return async function (batch) {
      let span;
      let topicForContext;
      let shouldIgnoreBatch = true;
      const messages = batch.topicMessages || [];
      const topics = new Set();

      // Remove possible topic duplications
      for (const msg of messages) {
        topics.add(msg.topic);
      }

      for (const t of topics) {
        const topicIgnored = shouldIgnoreTopic(t, config);

        shouldIgnoreBatch = shouldIgnoreBatch && topicIgnored;

        // When a topic is not ignored we keep a copy for context unless
        // we find a 2nd topic also not ignored.
        if (!topicIgnored) {
          if (topicForContext) {
            topicForContext = undefined;
            break;
          }
          topicForContext = t;
        }
      }

      if (!shouldIgnoreBatch) {
        const suffix = topicForContext ? ` to ${topicForContext}` : '';
        span = ins.createSpan(`${NAME} SEND${suffix}`, TYPE, SUBTYPE, 'send', {
          exitSpan: true,
        });
      }

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

      if (!span) {
        return origSendBatch.apply(this, arguments);
      }

      if (topicForContext) {
        // We do not add headers or body because:
        // - `record.messages` is a list
        // - spec says is for transactions (https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#transaction-context-fields)
        span.setMessageContext({ queue: { name: topicForContext } });
      }
      span.setServiceTarget(SUBTYPE, topicForContext);

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
 *
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
