/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const assert = require('assert');

const MetricsRegistry = require('./registry');
const { createQueueMetrics } = require('./queue');

const registrySymbol = Symbol('metrics-registry');
const agentSymbol = Symbol('metrics-agent');

class NoopLogger {
  debug() {}
  error() {}
  fatal() {}
  info() {}
  trace() {}
  warn() {}
}

class Metrics {
  constructor(agent) {
    this[agentSymbol] = agent;
    this[registrySymbol] = null;
  }

  start(refTimers) {
    const metricsInterval = this[agentSymbol]._conf.metricsInterval;
    assert(
      metricsInterval > 0,
      'Metrics.start() should not be called if metricsInterval <= 0',
    );
    this[registrySymbol] = new MetricsRegistry(this[agentSymbol], {
      reporterOptions: {
        defaultReportingIntervalInSeconds: metricsInterval,
        enabled: true,
        unrefTimers: !refTimers,
        logger: new NoopLogger(),
      },
    });
  }

  stop() {
    if (this[registrySymbol]) {
      this[registrySymbol].shutdown();
      this[registrySymbol] = null;
    }
  }

  getOrCreateCounter(...args) {
    if (!this[registrySymbol]) {
      return;
    }
    return this[registrySymbol].getOrCreateCounter(...args);
  }

  incrementCounter(name, dimensions, amount = 1) {
    if (!this[registrySymbol]) {
      return;
    }

    this.getOrCreateCounter(name, dimensions).inc(amount);
  }

  getOrCreateGauge(...args) {
    if (!this[registrySymbol]) {
      return;
    }
    return this[registrySymbol].getOrCreateGauge(...args);
  }

  // factory function for creating a queue metrics collector
  //
  // called from instrumentation, only when the agent receives a queue message
  createQueueMetricsCollector(queueOrTopicName) {
    if (!this[registrySymbol]) {
      return;
    }
    const collector = createQueueMetrics(
      queueOrTopicName,
      this[registrySymbol],
    );
    return collector;
  }
}

module.exports = Metrics;
