/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Exercise the full `interface Tracer`.

const assert = require('assert');
const performance = require('perf_hooks').performance;
const semver = require('semver');

const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('test-interface-tracer');

const haveUsablePerformanceNow = semver.satisfies(process.version, '>=8.12.0');

// SpanOptions.kind
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-api-otel.md#span-kind
tracer.startSpan('sKindDefault').end();
tracer.startSpan('sKindInternal', { kind: otel.SpanKind.INTERNAL }).end();
tracer.startSpan('sKindServer', { kind: otel.SpanKind.SERVER }).end();
tracer.startSpan('sKindClient', { kind: otel.SpanKind.CLIENT }).end();
tracer.startSpan('sKindProducer', { kind: otel.SpanKind.PRODUCER }).end();
tracer.startSpan('sKindConsumer', { kind: otel.SpanKind.CONSUMER }).end();

// SpanOptions.attributes
// https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/common/README.md#attribute
tracer.startSpan('sAttributesNone').end();
const myArray = ['hello', 'bob'];
tracer
  .startSpan('sAttributesLots', {
    attributes: {
      'a.string': 'hi',
      'a.number': 42,
      'a.boolean': true,
      'an.array.of.strings': ['one', 'two', 'three'],
      'an.array.of.numbers': [1, 2, 3],
      'an.array.of.booleans': [true, false],
      'an.array.that.will.be.modified': myArray,
      // Empty/falsey values:
      'a.zero': 0,
      'a.false': false,
      'an.empty.string': '',
      'an.empty.array': [],
      // From the OTel spec:
      // > `null` values SHOULD NOT be allowed in arrays. However, ...
      // The OTel JS SDK allows nulls and undefineds.
      'an.array.with.nulls': ['one', null, 'three'],
      'an.array.with.undefineds': ['one', undefined, 'three'],
      // These are *not* allowed by the OTel API:
      'an.array.of.mixed.types': [1, true, 'three', undefined, null],
      'an.object': { foo: 'bar' },
      'a.null': null,
      'a.undefined': undefined,
      '': 'empty string key',
    },
  })
  .end();
myArray[0] = 'goodbye';

// SpanOptions.links
const s = tracer.startSpan('sLinksNone');
s.end();
tracer.startSpan('sLinksEmptyArray', { links: [] }).end();
tracer.startSpan('sLinksInvalid', { links: [{}] }).end();
tracer.startSpan('sLinks', { links: [{ context: s.spanContext() }] }).end();
tracer
  .startSpan('sLinksWithAttrs', {
    links: [
      {
        context: s.spanContext(),
        attributes: { 'a.string': 'hi', 'a.number': 42 },
      },
    ],
  })
  .end();

// SpanOptions.startTime
// Specify approximately "now" in each of the supported TimeInput formats.
// OTel HrTime is `[<seconds since epoch>, <nanoseconds>]`.
const now = Date.now();
tracer
  .startSpan('sStartTimeHrTime', {
    startTime: [Math.floor(now / 1e3), (now % 1e3) * 1e6],
  })
  .end();
tracer.startSpan('sStartTimeEpochMs', { startTime: Date.now() }).end();
if (haveUsablePerformanceNow) {
  tracer
    .startSpan('sStartTimePerformanceNow', { startTime: performance.now() })
    .end();
}
tracer.startSpan('sStartTimeDate', { startTime: new Date() }).end();

// SpanOptions.root
const sParent = tracer.startSpan('sParent');
const parentCtx = otel.trace.setSpan(otel.context.active(), sParent);
otel.context.with(parentCtx, () => {
  tracer.startSpan('sRootNotSpecified').end();
  // This one should *not* have sParent as a parent. It should be a separate trace.
  tracer.startSpan('sRoot', { root: true }).end();
});
sParent.end();

// tracer.startActiveSpan()
// - retval comes back
const retval = tracer.startActiveSpan('sActiveRetval', (sActiveRetval) => {
  try {
    return 42;
  } finally {
    sActiveRetval.end();
  }
});
assert.strictEqual(retval, 42, 'sActiveRetval');

// - thrown error passes through
let thrownErr;
try {
  tracer.startActiveSpan('sActiveThrows', (sActiveThrows) => {
    try {
      throw new Error('inside sActiveThrows');
    } finally {
      sActiveThrows.end();
    }
  });
} catch (err) {
  thrownErr = err;
}
assert.ok(
  thrownErr && thrownErr.message === 'inside sActiveThrows',
  'sActiveThrows',
);

// - async function
tracer
  .startActiveSpan('sActiveAsync', async (sActiveAsync) => {
    await Promise.resolve();
    sActiveAsync.end();
    return 42;
  })
  .then((rv) => {
    assert.strictEqual(rv, 42, 'sActiveAsync retval');
  });

// - with options arg
tracer.startActiveSpan(
  'sActiveWithOptions',
  {
    kind: otel.SpanKind.CLIENT,
    attributes: {
      'a.string': 'hi',
    },
  },
  (sActiveWithOptions) => {
    try {
      // ...
    } finally {
      sActiveWithOptions.end();
    }
  },
);

// - with context arg
const FOO_KEY = otel.createContextKey('foo');
const ctx = otel.context.active().setValue(FOO_KEY, 'bar');
tracer.startActiveSpan(
  'sActiveWithContext',
  undefined,
  ctx,
  (sActiveWithContext) => {
    assert.strictEqual(
      otel.context.active().getValue(FOO_KEY),
      'bar',
      'FOO_KEY was passed through with context',
    );
    sActiveWithContext.end();
  },
);
