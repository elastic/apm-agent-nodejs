/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const os = require('os');

const semver = require('semver');
const test = require('tape');

const Metrics = require('../../lib/metrics');

const delayMs = 500;
const delayDeviationMs = (delayMs / 100) * 10;

let agent;
let metrics;

function mockAgent(conf = {}, onMetricSet) {
  return {
    _conf: conf,
    _apmClient: {
      sendMetricSet: onMetricSet,
    },
    _isMetricNameDisabled(name) {
      return false;
    },
  };
}

function isRoughly(received, expected, variance) {
  return isRoughlyAbsolute(received, expected, expected * variance);
}

function isRoughlyAbsolute(received, expected, range) {
  const upper = expected + range;
  const lower = expected - range;
  return received >= lower && received < upper;
}

test('reports expected metrics', function (t) {
  let count = 0;
  let last;

  const timeout = setTimeout(() => {
    t.fail('should not reach timeout');
  }, 2000);

  agent = mockAgent(
    {
      metricsInterval: delayMs / 1000,
      hostname: 'foo',
      environment: 'bar',
    },
    (metricset = {}) => {
      t.comment(`event #${++count}`);

      const now = Date.now();
      t.ok(
        isRoughlyAbsolute(
          metricset.timestamp,
          now * 1000,
          delayDeviationMs * 1000,
        ),
        `has timestamp within ${delayDeviationMs}ms of now (delta: ${
          (now * 1000 - metricset.timestamp) / 1000
        }ms, timestamp: ${new Date(metricset.timestamp / 1000).toISOString()})`,
      );
      if (count === 2) {
        const delay = delayMs * 1000;
        t.ok(
          isRoughlyAbsolute(
            metricset.timestamp,
            last + delay,
            delayDeviationMs * 1000,
          ),
          `is about ${delayMs}ms later (delta: ${
            (last + delay - metricset.timestamp) / 1000
          }ms, timestamp: ${new Date(
            metricset.timestamp / 1000,
          ).toISOString()})`,
        );
      }

      t.deepEqual(
        metricset.tags,
        {
          hostname: 'foo',
          env: 'bar',
        },
        'has expected tags',
      );

      const metrics = {
        'system.cpu.total.norm.pct': (value) => {
          if (count === 1) {
            t.ok(value >= 0 && value <= 1, 'is betewen 0 and 1');
          } else {
            t.ok(value > 0 && value <= 1, 'is >0 and <=1');
          }
        },
        'system.memory.total': (value) => {
          t.strictEqual(value, os.totalmem(), 'should match total memory');
        },
        'system.memory.actual.free': (value) => {
          const free = os.freemem();
          if (
            os.type() === 'Linux' &&
            semver.lt(process.version, '18.0.0-nightly20220107') &&
            semver.lt(process.version, '17.4.0') &&
            semver.lt(process.version, '16.14.0')
          ) {
            // On Linux we use "MemAvailable" from /proc/meminfo as the value for
            // this metric. In older versions of Node.js on Linus, `os.freemem()`
            // reports "MemFree" from /proc/meminfo. This changed when dev-lines
            // of node upgraded to libuv 1.43.0 to include
            // https://github.com/libuv/libuv/pull/3351.
            t.ok(
              value > free,
              `is larger than os.freemem() (value: ${value},
          free: ${free})`,
            );
          } else {
            // `isRoughly` because we are comparing free memory queried at
            // near but separate times, so we expect some variance.
            t.ok(
              isRoughly(value, free, 0.1),
              `is close to current free memory (value: ${value}, free: ${free})`,
            );
          }
        },
        'system.process.memory.rss.bytes': (value) => {
          const rss = process.memoryUsage().rss;
          t.ok(
            isRoughly(value, rss, 0.1),
            `is close to current rss (value: ${value}, rss: ${rss})`,
          );
        },
        'system.process.cpu.total.norm.pct': (value) => {
          if (count === 1) {
            t.ok(value >= 0 && value <= 1, 'is betewen 0 and 1');
          } else {
            t.ok(value > 0 && value <= 1, 'is >0 and <=1');
          }
        },
        'system.process.cpu.system.norm.pct': (value) => {
          t.ok(value >= 0 && value <= 1, 'is betewen 0 and 1');
        },
        'system.process.cpu.user.norm.pct': (value) => {
          if (count === 1) {
            t.ok(value >= 0 && value <= 1, 'is betewen 0 and 1');
          } else {
            t.ok(value > 0 && value <= 1, 'is >0 and <=1');
          }
        },
        'nodejs.handles.active': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.requests.active': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.eventloop.delay.avg.ms': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.memory.heap.allocated.bytes': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.memory.heap.used.bytes': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.memory.external.bytes': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'nodejs.memory.arrayBuffers.bytes': (value) => {
          t.ok(value >= 0, 'is positive');
        },
        'ws.connections': (value) => {
          t.strictEqual(value, 23);
        },
      };

      for (const name of Object.keys(metrics)) {
        const metric = metricset.samples[name];
        t.comment(name);
        t.ok(metric, 'is present');
        t.strictEqual(typeof metric.value, 'number', 'is a number');
        t.ok(Number.isFinite(metric.value), `is finite (was: ${metric.value})`);
        metrics[name](metric.value);
      }

      if (count === 2) {
        clearTimeout(timeout);
        t.end();
      } else {
        last = metricset.timestamp;
        spinCPUFor(delayMs / 2); // make some CPU load to get some interesting numbers
      }
    },
  );

  metrics = new Metrics(agent);
  metrics.start();

  metrics.getOrCreateGauge('ws.connections', () => {
    return 23;
  });
});

test('applies metrics limit', function (t) {
  agent = mockAgent(
    {
      metricsInterval: 10,
      metricsLimit: 2,
      hostname: 'foo',
      environment: 'bar',
    },
    (metricset = {}) => {
      t.strictEqual(
        Object.keys(metricset.samples).length,
        2,
        'has expected number of metrics',
      );
      t.end();
    },
  );

  metrics = new Metrics(agent);
  metrics.start();

  // Ensure there are at least two counters
  metrics.getOrCreateCounter('first').inc();
  metrics.getOrCreateCounter('second').inc();
  metrics.getOrCreateCounter('third').inc();
});

test('increments counter when active', function (t) {
  agent = mockAgent(
    {
      metricsInterval: delayMs / 1000,
      hostname: 'foo',
      environment: 'bar',
    },
    () => {},
  );

  metrics = new Metrics(agent);
  metrics.start();

  t.strictEqual(
    metrics.getOrCreateCounter('test-counter').toJSON(),
    0,
    'should start at zero',
  );

  metrics.incrementCounter('test-counter');
  t.strictEqual(
    metrics.getOrCreateCounter('test-counter').toJSON(),
    1,
    'should have incremented by 1 by default',
  );

  metrics.incrementCounter('test-counter', null, 2);
  t.strictEqual(
    metrics.getOrCreateCounter('test-counter').toJSON(),
    3,
    'should have incremented by an amount',
  );

  metrics.incrementCounter('test-counter', null);
  t.strictEqual(
    metrics.getOrCreateCounter('test-counter').toJSON(),
    4,
    'should have incremented',
  );

  t.end();
});

test('noop counter when not active', function (t) {
  agent = mockAgent(
    {
      metricsInterval: delayMs / 1000,
      hostname: 'foo',
      environment: 'bar',
    },
    () => {},
  );

  metrics = new Metrics(agent);

  t.doesNotThrow(() => metrics.incrementCounter('test-counter'));
  t.end();
});

test('Metrics objects do not throw/crash when not started', function (t) {
  const metrics = new Metrics();

  t.equals(
    metrics.stop(),
    undefined,
    'unset registrySymbol does not crash metrics object',
  );
  t.equals(
    metrics.getOrCreateCounter('foo', {}, null),
    undefined,
    'unset registrySymbol does not crash metrics object',
  );
  t.equals(
    metrics.incrementCounter('foo'),
    undefined,
    'unset registrySymbol does not crash metrics object',
  );
  t.equals(
    metrics.getOrCreateGauge('foo', function () {}),
    undefined,
    'unset registrySymbol does not crash metrics object',
  );
  t.equals(
    metrics.createQueueMetricsCollector('foo'),
    undefined,
    'unset registrySymbol does not crash metrics object',
  );

  t.end();
});

function spinCPUFor(durationMs) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    // spin
  }
}
