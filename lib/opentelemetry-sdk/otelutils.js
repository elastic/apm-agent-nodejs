'use strict'

const semver = require('semver')
const timeOrigin = require('perf_hooks').performance.timeOrigin

const haveUsablePerformanceNow = semver.satisfies(process.version, '>=8.12.0')

function isTimeInputHrTime (value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

// Convert an OTel `TimeInput` to a number of milliseconds since the Unix epoch.
//
// The latter is the time format used for `SpanOptions.startTime` and the
// `endTime` arg to `Span.end()` and `Transaction.end()`.
//
// `TimeInput` is defined as:
//      // hrtime, epoch milliseconds, performance.now() or Date
//      export type TimeInput = HrTime | number | Date;
//
// This implementation is adapted from of TimeInput parsing in
// "@opentelemetry/core/src/common/time.ts". Some notes:
// - @opentelemetry/core base supported node is 8.12.0. The APM agent's is
//   currently 8.6.0. Before 8.12.0, node's `performance.now()` did *not*
//   return a value relative to `performance.timeOrigin()`. Therefore it was
//   not useful to specify an absolute time value.
// - Allowing both epoch milliseconds and performance.now() in the same arg
//   is inherently ambiguous. The disambiguate, the following code relies on an
//   *assumption* that one never wants to provide a TimeInput value that is
//   before the process started. Woe be the code that attempts to set a
//   retroactive span startTime for, say, an incoming message from an out of
//   process queue.
function epochMsFromOTelTimeInput (otelTimeInput) {
  if (isTimeInputHrTime(otelTimeInput)) {
    // OTel's HrTime is `[<seconds since unix epoch>, <nanoseconds>]`
    return otelTimeInput[0] * 1e3 + otelTimeInput[1] / 1e6
  } else if (typeof otelTimeInput === 'number') {
    // Assume a performance.now() if it's smaller than process start time.
    if (haveUsablePerformanceNow && otelTimeInput < timeOrigin) {
      return timeOrigin + otelTimeInput
    } else {
      return otelTimeInput
    }
  } else if (otelTimeInput instanceof Date) {
    return otelTimeInput.getTime()
  } else {
    throw TypeError(`Invalid OTel TimeInput: ${otelTimeInput}`)
  }
}

module.exports = {
  epochMsFromOTelTimeInput
}
