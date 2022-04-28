'use strict'

// Exercise the full `interface Span`.
//
// Usage:
//  node -r ../../../examples/otel/otel-sdk.js interface-span.js  # with OTel SDK
//  node -r ../../../opentelemetry-sdk.js interface-span.js       # with APM agent

const assert = require('assert')
const performance = require('perf_hooks').performance

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('test-interface-span')
const semver = require('semver')

const haveUsablePerformanceNow = semver.satisfies(process.version, '>=8.12.0')

function parentIdFromSpan (span) {
  return (
    span.parentSpanId || // OTel SDK
    (span._span && span._span.parentId) || // Elastic APM
    undefined
  )
}
function idFromSpan (span) {
  return span.spanContext().spanId
}

let rv

// A parent OTel Span (i.e. a Transaction) to act as a parent for child spans
// so that we test the OTel Span API on both Elastic `Transaction`s and `Span`s.
const sParent = tracer.startSpan('sParent')
const ctxParent = otel.trace.setSpan(otel.context.active(), sParent)
sParent.end()

// Span#spanContext()
const sSpanContext = tracer.startSpan('sSpanContext')
const spanContext = sSpanContext.spanContext()
sSpanContext.end()
assert.ok(otel.trace.isSpanContextValid(spanContext), 'spanContext is valid')
assert.strictEqual(spanContext.traceFlags, otel.TraceFlags.SAMPLED, 'spanContext.traceFlags')
assert.strictEqual(spanContext.traceState, undefined, 'no spanContext.traceState')

const ctx = otel.trace.setSpanContext(otel.context.active(), spanContext)
const sSpanContextChild = tracer.startSpan('sSpanContextChild', {}, ctx)
assert.strictEqual(parentIdFromSpan(sSpanContextChild), idFromSpan(sSpanContext), 'sSpanContextChild parent id')
sSpanContextChild.end()

// Span#setAttribute, Span#setAttributes
const sSetAttribute = tracer.startSpan('sSetAttribute')
const sSetAttributes = tracer.startSpan('sSetAttributes')
const myArray = ['hello', 'bob']
const attributesToTry = {
  'a.string': 'hi',
  'a.number': 42,
  'a.boolean': true,
  'an.array.of.strings': ['one', 'two', 'three'],
  'an.array.of.numbers': [1, 2, 3],
  'an.array.of.booleans': [true, false],
  'an.array.that.will.be.modified': myArray, // Testing that we take a slice.
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
  '': 'empty string key'
}
for (const [k, v] of Object.entries(attributesToTry)) {
  rv = sSetAttribute.setAttribute(k, v)
  assert.strictEqual(rv, sSetAttribute, 'setAttribute return value is the span')
}
rv = sSetAttributes.setAttributes(attributesToTry)
assert.strictEqual(rv, sSetAttributes, 'setAttributes return value is the span')
myArray[0] = 'goodbye'
sSetAttribute.setAttribute() // undefined key
sSetAttribute.setAttribute() // null key
sSetAttribute.setAttribute(42) // non-string key
sSetAttribute.end()
sSetAttributes.end()
sSetAttribute.setAttribute('a.string', 'after-end') // setAttribute after end should not take
sSetAttributes.setAttributes({ 'a.string': 'after-end' }) // setAttributes after end should not take

// Span#addEvent (currently not supported, so this should no-op)
const sAddEvent = tracer.startSpan('sAddEvent')
assert.strictEqual(sAddEvent.addEvent(), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName'), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', { 'a.string': 'hi' }), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', Date.now()), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', { 'a.string': 'hi' }, Date.now()), sAddEvent)
sAddEvent.end()

// Span#setStatus
tracer.startSpan('sSetStatusDoNotSet').end()
tracer.startSpan('sSetStatusUNSET').setStatus(otel.SpanStatusCode.UNSET).end()
tracer.startSpan('sSetStatusOK').setStatus(otel.SpanStatusCode.OK).end()
tracer.startSpan('sSetStatusERROR').setStatus(otel.SpanStatusCode.ERROR).end()
const sSetStatusMulti = tracer.startSpan('sSetStatusMulti')
assert.strictEqual(sSetStatusMulti.setStatus(otel.SpanStatusCode.ERROR), sSetStatusMulti, 'setStatus retval is the span')
assert.strictEqual(sSetStatusMulti.setStatus(otel.SpanStatusCode.OK), sSetStatusMulti, 'setStatus retval is the span')
sSetStatusMulti.end()
sSetStatusMulti.setStatus(otel.SpanStatusCode.UNSET) // setStatus after end should not take
tracer.startSpan('sSetStatusChildERROR', {}, ctxParent).setStatus(otel.SpanStatusCode.ERROR).end()

// Span#updateName
const sUpdateName = tracer.startSpan('one')
sUpdateName.setAttribute('testId', 'sUpdateName') // so test code can find this span
assert.strictEqual(sUpdateName.updateName('two'), sUpdateName, 'updateName retval is the span')
sUpdateName.updateName('three')
sUpdateName.end()
sUpdateName.updateName('four') // updateName after end should *not* take

// Span#end
// Specify approximately "now" in each of the supported TimeInput formats.
// OTel HrTime is `[<seconds since epoch>, <nanoseconds>]`.
rv = tracer.startSpan('sEndTimeNotSpecified').end()
assert.strictEqual(rv, undefined, 'Span .end() retval is undefined')
const now = Date.now()
tracer.startSpan('sEndTimeHrTime').end([Math.floor(now / 1e3), (now % 1e3) * 1e6])
tracer.startSpan('sEndTimeEpochMs').end(Date.now())
if (haveUsablePerformanceNow) {
  tracer.startSpan('sEndTimePerformanceNow').end(performance.now())
}
tracer.startSpan('sEndTimeDate').end(new Date())
tracer.startSpan('sEndChildTimeDate', {}, ctxParent).end(new Date())
// Specify past and future endTime. Make the duration one hour for testing.
const t = Date.now()
const HOUR = 1 * 60 * 60 * 1000
tracer.startSpan('sEndOneHourAgo', { startTime: new Date(t - 2 * HOUR) }).end(new Date(t - HOUR))
tracer.startSpan('sEndOneHourFromNow', { startTime: t }).end(new Date(t + HOUR))

// Span#isRecording

//   /**
//    * Returns the flag whether this span will be recorded.
//    *
//    * @returns true if this Span is active and recording information like events
//    *     with the `AddEvent` operation and attributes using `setAttributes`.
//    */
//   isRecording(): boolean;

//   /**
//    * Sets exception as a span event
//    * @param exception the exception the only accepted values are string or Error
//    * @param [time] the time to set as Span's event time. If not provided,
//    *     use the current time.
//    */
//   recordException(exception: Exception, time?: TimeInput): void;
// }
