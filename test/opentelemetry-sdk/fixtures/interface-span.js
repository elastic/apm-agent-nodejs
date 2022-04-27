'use strict'

// Exercise the full `interface Span`.

const assert = require('assert')

const otel = require('@opentelemetry/api')
const tracer = otel.trace.getTracer('test-interface-span')

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

// Span#addEvent (currently not supported, so this should no-op)
const sAddEvent = tracer.startSpan('sAddEvent')
assert.strictEqual(sAddEvent.addEvent(), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName'), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', { 'a.string': 'hi' }), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', Date.now()), sAddEvent)
assert.strictEqual(sAddEvent.addEvent('myEventName', { 'a.string': 'hi' }, Date.now()), sAddEvent)
sAddEvent.end()

//   /**
//    * Sets a status to the span. If used, this will override the default Span
//    * status. Default is {@link SpanStatusCode.UNSET}. SetStatus overrides the value
//    * of previous calls to SetStatus on the Span.
//    *
//    * @param status the SpanStatus to set.
//    */
//   setStatus(status: SpanStatus): this;

//   /**
//    * Updates the Span name.
//    *
//    * This will override the name provided via {@link Tracer.startSpan}.
//    *
//    * Upon this update, any sampling behavior based on Span name will depend on
//    * the implementation.
//    *
//    * @param name the Span name.
//    */
//   updateName(name: string): this;

//   /**
//    * Marks the end of Span execution.
//    *
//    * Call to End of a Span MUST not have any effects on child spans. Those may
//    * still be running and can be ended later.
//    *
//    * Do not return `this`. The Span generally should not be used after it
//    * is ended so chaining is not desired in this context.
//    *
//    * @param [endTime] the time to set as Span's end time. If not provided,
//    *     use the current time as the span's end time.
//    */
//   end(endTime?: TimeInput): void;

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
