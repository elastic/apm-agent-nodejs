'use strict'

const crypto = require('crypto')

const SIZES = {
  version: 1,
  traceId: 16,
  id: 8,
  flags: 1,
  parentId: 8,

  // Aggregate sizes
  ids: 24, // traceId + id
  all: 34
}

const OFFSETS = {
  version: 0,
  traceId: SIZES.version,
  id: SIZES.version + SIZES.traceId,
  flags: SIZES.version + SIZES.ids,

  // Additional parentId is stored after the header content
  parentId: SIZES.version + SIZES.ids + SIZES.flags
}

const FLAGS = {
  requested: 0b00000001,
  reported: 0b00000010
}

function defineLazyProp (obj, prop, fn) {
  Object.defineProperty(obj, prop, {
    configurable: true,
    enumerable: true,
    get () {
      const value = fn()
      Object.defineProperty(obj, prop, {
        enumerable: true,
        value
      })
      return value
    }
  })
}

function hexSliceFn (buffer, offset, length) {
  return () => buffer.slice(offset, length).toString('hex')
}

function maybeHexSliceFn (buffer, offset, length) {
  const fn = hexSliceFn(buffer, offset, length)
  return () => {
    const value = fn()
    // Check for any non-zero characters to identify a valid ID
    if (/[1-9a-f]/.test(value)) {
      return value
    }
  }
}

function makeChild (buffer) {
  // Move current id into parentId region
  buffer.copy(buffer, OFFSETS.parentId, OFFSETS.id, OFFSETS.flags)

  // If the parent context has been requested,
  // mark the child context as reported.
  if (buffer[OFFSETS.flags] & FLAGS.requested) {
    buffer[OFFSETS.flags] |= FLAGS.reported
  } else {
    buffer[OFFSETS.flags] &= ~FLAGS.reported
  }

  // Generate new id
  crypto.randomFillSync(buffer, OFFSETS.id, SIZES.id)

  return new TraceContext(buffer)
}

function isValidHeader (header) {
  return /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(header)
}

// NOTE: The version byte is not fully supported yet, but is not important until
// we use the official header name rather than elastic-apm-traceparent.
// https://w3c.github.io/distributed-tracing/report-trace-context.html#versioning-of-traceparent
function headerToBuffer (header) {
  const buffer = Buffer.alloc(SIZES.all)
  buffer.write(header.replace(/-/g, ''), 'hex')
  return buffer
}

function resume (header) {
  return makeChild(headerToBuffer(header))
}

function start (sampled = false) {
  const buffer = Buffer.alloc(SIZES.all)

  // Generate new ids
  crypto.randomFillSync(buffer, OFFSETS.traceId, SIZES.ids)

  // Apply reported and requested flags
  if (sampled) {
    buffer[OFFSETS.flags] |= FLAGS.reported
    buffer[OFFSETS.flags] |= FLAGS.requested
  }

  return new TraceContext(buffer)
}

const bufferSymbol = Symbol('trace-context-buffer')

class TraceContext {
  constructor (buffer) {
    this[bufferSymbol] = buffer
    defineLazyProp(this, 'version', hexSliceFn(buffer, OFFSETS.version, OFFSETS.traceId))
    defineLazyProp(this, 'traceId', hexSliceFn(buffer, OFFSETS.traceId, OFFSETS.id))
    defineLazyProp(this, 'id', hexSliceFn(buffer, OFFSETS.id, OFFSETS.flags))
    defineLazyProp(this, 'flags', hexSliceFn(buffer, OFFSETS.flags, OFFSETS.parentId))
    defineLazyProp(this, 'parentId', maybeHexSliceFn(buffer, OFFSETS.parentId))

    const requested = !!(this[bufferSymbol][OFFSETS.flags] & FLAGS.requested)
    const reported = !!(this[bufferSymbol][OFFSETS.flags] & FLAGS.reported)
    Object.defineProperties(this, {
      requested: {
        enumerable: true,
        value: requested
      },
      reported: {
        enumerable: true,
        value: reported
      },
      sampled: {
        enumerable: true,
        value: reported
      }
    })
  }

  static startOrResume (traceparent, conf) {
    return isValidHeader(traceparent)
      ? resume(traceparent)
      : start(Math.random() <= conf.transactionSampleRate)
  }

  static fromString (header) {
    return new TraceContext(headerToBuffer(header))
  }

  child () {
    return makeChild(Buffer.from(this[bufferSymbol]))
  }

  toString () {
    return `${this.version}-${this.traceId}-${this.id}-${this.flags}`
  }
}

TraceContext.FLAGS = FLAGS

module.exports = TraceContext
