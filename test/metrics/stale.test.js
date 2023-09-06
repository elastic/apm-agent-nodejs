/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const tape = require('tape');
const MetricsReporter = require('../../lib/metrics/reporter');

function createMockRegistry(fnGenerateStorageKey, fnDelete) {
  return {
    _generateStorageKey: fnGenerateStorageKey,
    _metrics: {
      delete: fnDelete,
    },
  };
}

tape.test(
  'Unit Tests: isStaleMetric and removeMetricFromRegistry',
  function (t) {
    t.test('isStaleMetric', function (t) {
      const reg = new MetricsReporter({});

      t.ok(
        reg.isStaleMetric({ metricImpl: { _count: 0 } }, '_count 0 is stale'),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: {} },
          'no _count property is not stale',
        ),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: { _count: 1 } },
          'non-zero values not stale',
        ),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: { _count: false } },
          'non-zero values not stale',
        ),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: { _count: '' } },
          'non-zero values not stale',
        ),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: { _count: null } },
          'non-zero values not stale',
        ),
      );
      t.ok(
        !reg.isStaleMetric(
          { metricImpl: { _count: undefined } },
          'non-zero values not stale',
        ),
      );
      t.ok(!reg.isStaleMetric({}), 'value without metricImpl does not explode');

      t.end();
    });

    t.test('removeMetricFromRegistry functionality', function (t) {
      const reg = new MetricsReporter({});
      reg._registry = createMockRegistry(
        function generateStorageKey(name, dimensions) {
          return JSON.stringify(name) + JSON.stringify(dimensions);
        },
        function metricsDelete(key) {
          t.equals(key, '"foo"["bar"]', 'requested deletion of correct key');
          t.end();
        },
      );

      reg.removeMetricFromRegistry({
        name: 'foo',
        dimensions: ['bar'],
      });
    });

    t.test('removeMetricFromRegistry invalid types', function (t) {
      const reg = new MetricsReporter({});

      t.ok(
        !reg.removeMetricFromRegistry(),
        'call with empty object does not explode',
      );

      reg._registry = {};
      t.ok(
        !reg.removeMetricFromRegistry(),
        'call with invalid registry does not explode',
      );

      t.end();
    });
  },
);
