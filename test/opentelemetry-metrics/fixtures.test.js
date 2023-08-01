/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Thes tests below execute a script from "fixtures/" something like:
//
//    ELASTIC_APM_METRICS_INTERVAL=500ms ELASTIC_APM_API_REQUEST_TIME=500ms \
//      node -r ../../start.js fixtures/start-span.js
//
// waits a short period to be sure metrics have been sent, stops the process,
// then asserts the mock APM server got the expected metrics data.
//
// The scripts can be run independent of the test suite.

const util = require('util');

const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const semver = require('semver');
const tape = require('tape');

const { MockAPMServer } = require('../_mock_apm_server');
const {
  findObjInArray,
  findObjsInArray,
  formatForTComment,
} = require('../_utils');

if (!semver.satisfies(process.version, '>=14')) {
  console.log(
    `# SKIP @opentelemetry/sdk-metrics only supports node >=14 (node ${process.version})`,
  );
  process.exit();
}

const undici = require('undici'); // import after we've excluded node <14

const fixturesDir = path.join(__dirname, 'fixtures');

// ---- support functions

async function checkEventsHaveTestMetrics(t, events, extraMetricNames = []) {
  let m;

  // Test the first of the metricsets with no tags/attributes.
  const event = findObjInArray(events, 'metricset.samples.test_counter');
  t.comment(
    'test_counter metricset: ' +
      formatForTComment(util.inspect(event.metricset, { depth: 5 })),
  );
  const agoUs = Date.now() * 1000 - event.metricset.timestamp;
  const limit = 10 * 1000 * 1000; // 10s ago in μs
  t.ok(
    agoUs > 0 && agoUs < limit,
    `metricset.timestamp (a recent number of μs since the epoch, ${agoUs}μs ago)`,
  );
  t.deepEqual(event.metricset.tags, {}, 'metricset.tags');
  m = event.metricset.samples.test_counter;
  t.equal(m.type, 'counter', 'test_counter.type');
  t.ok(
    Number.isInteger(m.value) && m.value >= 0,
    'test_counter.value is a positive integer',
  );
  // The expected value is between 2 and 3 because we have
  // `metricsInterval=500ms` and the "fixtures/*.js" scripts are incrementing
  // the counters every 200ms.
  t.ok(
    2 <= m.value && m.value <= 3, // eslint-disable-line yoda
    'test_counter value is in [2,3] range, indicating aggregation temporality is the expected "Delta"',
  );

  m = event.metricset.samples.test_async_counter;
  t.equal(m.type, 'counter', 'test_async_counter.type');
  t.ok(
    2 <= m.value && m.value <= 3, // eslint-disable-line yoda
    'test_async_counter value is in [2,3] range, indicating aggregation temporality is the expected "Delta"',
  );

  m = event.metricset.samples.test_async_gauge;
  t.ok(
    -1 <= m.value && m.value <= 1, // eslint-disable-line yoda
    'test_async_gauge value is in [-1,1] range, the expected sine wave range',
  );

  m = event.metricset.samples.test_updowncounter;
  t.equal(m.type, 'gauge', 'test_updowncounter.type');
  t.ok(
    -30 <= m.value && m.value <= 30, // eslint-disable-line yoda
    'test_updowncounter value is in expect [-30,30] range',
  );

  m = event.metricset.samples.test_async_updowncounter;
  t.equal(m.type, 'gauge', 'test_async_updowncounter.type');
  t.ok(
    -30 <= m.value && m.value <= 30, // eslint-disable-line yoda
    'test_async_updowncounter value is in expect [-30,30] range',
  );

  if (extraMetricNames.includes('test_histogram_defbuckets')) {
    // A histogram that we expect to have the APM agent default buckets.
    m = event.metricset.samples.test_histogram_defbuckets;
    t.equal(m.type, 'histogram', 'test_histogram_defbuckets.type');
    t.equal(m.counts.length, 3, 'test_histogram_defbuckets.counts');
    // The test file recorded values of 2, 3, and 4. The expected converted values
    // are the midpoints between the default bucket boundaries. For example,
    // 3 is between bucket boundaries (2.82843, 4], whose midpoint is 3.414215.
    t.deepEqual(
      m.values,
      [2.414215, 3.414215, 4.828425],
      'test_histogram_defbuckets.values',
    );
  }
  if (extraMetricNames.includes('test_histogram_viewbuckets')) {
    // A histogram that we expect to have the buckets defined by a `View`.
    m = event.metricset.samples.test_histogram_viewbuckets;
    t.equal(m.type, 'histogram', 'test_histogram_viewbuckets.type');
    // The test file recorded values of 2, 3, and 4. These fall into two
    // buckets in `[..., 1, 2.5, 5, ...]`. After conversion to APM server
    // intake format, the values are the midpoints of those buckets.
    t.equal(m.counts.length, 2, 'test_histogram_viewbuckets.counts');
    t.deepEqual(m.values, [1.75, 3.75], 'test_histogram_viewbuckets.values');
  }
  if (extraMetricNames.includes('test_histogram_confbuckets')) {
    // A histogram that we expect to have the buckets defined by the
    // `custom_metrics_histogram_boundaries` config var.
    m = event.metricset.samples.test_histogram_confbuckets;
    t.equal(m.type, 'histogram', 'test_histogram_confbuckets.type');
    // The test file recorded values of 2, 3, and 4. These fall into three
    // buckets in `[0, 1, 2, 3, 4, 5]`. After conversion to APM server
    // intake format, the values are the midpoints of those buckets.
    t.equal(m.counts.length, 3, 'test_histogram_confbuckets.counts');
    t.deepEqual(m.values, [2.5, 3.5, 4.5], 'test_histogram_confbuckets.values');
  }
}

async function checkHasPrometheusMetrics(t) {
  const { statusCode, body } = await undici.request(
    'http://localhost:9464/metrics',
  );
  t.equal(statusCode, 200, 'prometheus exporter is still working');
  const text = await body.text();
  t.ok(
    text.indexOf('\ntest_counter') !== -1,
    'prometheus metrics include "test_counter"',
  );
}

// ---- tests

// We need to `npm install` for a first test run.
const haveNodeModules = fs.existsSync(path.join(fixturesDir, 'node_modules'));
tape.test(
  `setup: npm install (in ${fixturesDir})`,
  { skip: haveNodeModules },
  (t) => {
    const startTime = Date.now();
    exec(
      'npm install',
      {
        cwd: fixturesDir,
      },
      function (err, stdout, stderr) {
        t.error(
          err,
          `"npm install" succeeded (took ${(Date.now() - startTime) / 1000}s)`,
        );
        if (err) {
          t.comment(
            `$ npm install\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`,
          );
        }
        t.end();
      },
    );
  },
);

const cases = [
  {
    script: 'use-just-otel-api.js',
    checkEvents: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      await checkEventsHaveTestMetrics(t, events, [
        'test_histogram_defbuckets',
      ]);
    },
  },
  {
    script: 'use-just-otel-sdk.js',
    checkEvents: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      await checkEventsHaveTestMetrics(t, events, [
        'test_histogram_viewbuckets',
      ]);
      await checkHasPrometheusMetrics(t);
    },
  },
  {
    script: 'use-otel-api-with-registered-meter-provider.js',
    env: {
      ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES: '0,1, 2,\t3,4 ,5',
    },
    checkEvents: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');
      await checkEventsHaveTestMetrics(t, events, [
        'test_histogram_confbuckets',
      ]);
      await checkHasPrometheusMetrics(t);
    },
  },
  {
    script: 'various-attrs.js',
    checkEvents: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');

      // Test that there are 3 separate metricsets for 'test_counter_attrs'
      // for a given timestamp -- one for each of the expected attr sets.
      const firstTimestamp = findObjInArray(
        events,
        'metricset.samples.test_counter_attrs',
      ).metricset.timestamp;
      const eventsAttrs = findObjsInArray(
        events,
        'metricset.samples.test_counter_attrs',
      ).filter((e) => e.metricset.timestamp === firstTimestamp);
      t.equal(eventsAttrs.length, 3, '3 attr sets for test_counter_attrs');
      t.ok(
        eventsAttrs.some(
          (e) =>
            e.metricset.tags['http.request.method'] === 'POST' &&
            e.metricset.tags['http.response.status_code'] === '200',
        ),
      );
      t.ok(
        eventsAttrs.some(
          (e) =>
            e.metricset.tags['http.request.method'] === 'GET' &&
            e.metricset.tags['http.response.status_code'] === '200',
        ),
      );
      t.ok(
        eventsAttrs.some(
          (e) =>
            e.metricset.tags['http.request.method'] === 'GET' &&
            e.metricset.tags['http.response.status_code'] === '400',
        ),
      );
      t.ok(
        !eventsAttrs.some((e) => e.metricset.tags.array_valued_attr),
        'no test_counter_attrs metricset with "array_valued_attr" label',
      );
    },
    checkOutput: async (t, stdout, _stderr) => {
      const warnLines = stdout
        .split('\n')
        .filter((ln) => ~ln.indexOf('dropping array-valued metric attribute'));
      t.equal(
        warnLines.length,
        1,
        'exactly one log.warn about dropping the array-valued metric attribute',
      );
      t.ok(
        warnLines[0].indexOf('test_counter_attrs'),
        'log.warn mentions the metric name',
      );
      t.ok(
        warnLines[0].indexOf('array_valued_attr'),
        'log.warn mentions the attribute name',
      );
    },
  },
  {
    script: 'instrumentation-scopes.js',
    checkEvents: async (t, events) => {
      let e;
      t.ok(events[0].metadata, 'APM server got event metadata object');

      // Test that there are 4 separate metricsets for 'test_counter_{a,b,c,d,e}'
      // for a given timestamp -- one for each of the instrumentation scopes.
      const firstTimestamp = findObjInArray(
        events,
        'metricset.samples.test_counter_a',
      ).metricset.timestamp;
      const eventGroup = findObjsInArray(events, 'metricset.samples').filter(
        (e) => e.metricset.timestamp === firstTimestamp,
      );
      t.equal(
        eventGroup.length,
        4,
        '4 instrumentation scopes test_counter_* metrics',
      );
      e = findObjInArray(eventGroup, 'metricset.samples.test_counter_a');
      t.deepEqual(Object.keys(e.metricset.samples), ['test_counter_a']);
      e = findObjInArray(eventGroup, 'metricset.samples.test_counter_b');
      t.deepEqual(Object.keys(e.metricset.samples), ['test_counter_b']);
      e = findObjInArray(eventGroup, 'metricset.samples.test_counter_c');
      t.deepEqual(Object.keys(e.metricset.samples), ['test_counter_c']);
      e = findObjInArray(eventGroup, 'metricset.samples.test_counter_d');
      t.deepEqual(Object.keys(e.metricset.samples), [
        'test_counter_d',
        'test_counter_e',
      ]);
    },
  },
  {
    script: 'use-disable-metrics-conf.js',
    env: {
      ELASTIC_APM_DISABLE_METRICS:
        'nodejs.*,system*cpu*,system.memory.actual.free,foo-counter-*',
    },
    checkEvents: async (t, events) => {
      t.ok(events[0].metadata, 'APM server got event metadata object');

      // Test all metricsets:
      // - There should be no samples for metrics matching the above config patterns.
      // - There should not be any empty metricsets (ones with no samples).
      const reportedMetricNames = new Set();
      events
        .filter((e) => !!e.metricset)
        .forEach((e) => {
          const names = Object.keys(e.metricset.samples);
          t.ok(names.length > 0, 'metricset is not empty');
          const unexpectedNames = names.filter(
            (n) =>
              /^nodejs\..*$/.test(n) ||
              /^system.*cpu.*$/.test(n) ||
              n === 'system.memory.actual.free' ||
              /^foo-counter-.*$/.test(n),
          );
          t.equal(
            unexpectedNames.length,
            0,
            `no unexpected metric names (unexpectedNames=${JSON.stringify(
              unexpectedNames,
            )})`,
          );
          names.forEach((n) => reportedMetricNames.add(n));
        });

      // Spot test that some expected metrics are being reported.
      t.ok(
        reportedMetricNames.has('bar-counter-1'),
        '"bar-counter-1" metric is being reported',
      );
      t.ok(
        reportedMetricNames.has('system.memory.total'),
        '"system.memory.total" metric is being reported',
      );
    },
  },
];

cases.forEach((c) => {
  tape.test(
    `test/opentelemetry-metrics/fixtures/${c.script}`,
    c.testOpts || {},
    (t) => {
      const server = new MockAPMServer();
      const scriptPath = path.join('fixtures', c.script);
      server.start(function (serverUrl) {
        const proc = execFile(
          process.execPath,
          ['-r', '../../start.js', scriptPath],
          {
            cwd: __dirname,
            timeout: 10000, // guard on hang, 3s is sometimes too short for CI
            env: Object.assign({}, process.env, c.env, {
              ELASTIC_APM_SERVER_URL: serverUrl,
              ELASTIC_APM_METRICS_INTERVAL: '500ms',
              ELASTIC_APM_API_REQUEST_TIME: '500ms',
              ELASTIC_APM_CENTRAL_CONFIG: 'false',
              ELASTIC_APM_CLOUD_PROVIDER: 'none',
              ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS: 'true',
            }),
          },
          async function done(_err, stdout, stderr) {
            // We are terminating the process with SIGTERM, so we *expect* a
            // non-zero exit. Hence checking `_err` isn't useful. If there is
            // any output, then show it, in case it is useful for debugging
            // test failures.
            if (stdout.trim() || stderr.trim()) {
              t.comment(
                `$ node ${scriptPath}\n-- stdout --\n|${formatForTComment(
                  stdout,
                )}\n-- stderr --\n|${formatForTComment(stderr)}\n--`,
              );
            }
            if (c.checkOutput) {
              await c.checkOutput(t, stdout, stderr);
            }
            server.close();
            t.end();
          },
        );
        // Wait some time for some metrics to have been sent.
        // (Attempt to avoid spurious GH Actions CI issues on Windows runners with
        // a longer wait time.)
        const WAIT_TIME_MS = os.platform() === 'win32' ? 4000 : 2000;
        setTimeout(async () => {
          await c.checkEvents(t, server.events);
          proc.kill();
        }, WAIT_TIME_MS);
      });
    },
  );
});
