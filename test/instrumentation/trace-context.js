'use strict'

const crypto = require('crypto')
const test = require('tape')

const agent = require('./_agent')()
const TraceContext = require('../../lib/instrumentation/trace-context')

const version = Buffer.alloc(1).toString('hex')
const traceId = crypto.randomBytes(16).toString('hex')
const id = crypto.randomBytes(8).toString('hex')
const flags = '01'

const header = `${version}-${traceId}-${id}-${flags}`

function jsonify (object) {
  return JSON.parse(JSON.stringify(object))
}

function isValid (t, context) {
  t.ok(context instanceof TraceContext, 'has a trace context object')
  t.ok(/^[\da-f]{2}$/.test(context.version), 'has valid version')
  t.ok(/^[\da-f]{32}$/.test(context.traceId), 'has valid traceId')
  t.ok(/^[\da-f]{16}$/.test(context.id), 'has valid id')
  t.ok(/^[\da-f]{2}$/.test(context.flags), 'has valid flags')
}

test('fromString', t => {
  const context = TraceContext.fromString(header)

  isValid(t, context)
  t.equal(context.version, version, 'version matches')
  t.equal(context.traceId, traceId, 'traceId matches')
  t.equal(context.id, id, 'id matches')
  t.equal(context.flags, flags, 'flags matches')

  t.end()
})

test('toString', t => {
  const context = TraceContext.fromString(header)

  isValid(t, context)
  t.equal(context.toString(), header, 'trace context stringifies to valid header')

  t.end()
})

test('toJSON', t => {
  const context = TraceContext.fromString(header)

  isValid(t, context)
  t.deepEqual(jsonify(context), {
    version,
    traceId,
    id,
    flags,
    recorded: true
  }, 'trace context serializes fields to hex strings, in JSON form')

  t.end()
})

test('startOrResume', t => {
  t.test('resume from header', t => {
    const context = TraceContext.startOrResume(header)

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, flags, 'flags matches')

    t.end()
  })

  t.test('resume from TraceContext', t => {
    const context = TraceContext.startOrResume(
      TraceContext.fromString(header)
    )

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, flags, 'flags matches')

    t.end()
  })

  t.test('resume from Transaction', t => {
    const trans = agent.startTransaction(null, null, { childOf: header })
    const context = TraceContext.startOrResume(trans)

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, flags, 'flags matches')

    t.end()
  })

  t.test('resume from Span', t => {
    const trans = agent.startTransaction(null, null, { childOf: header })
    const span = trans.startSpan()
    const context = TraceContext.startOrResume(span)

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, flags, 'flags matches')

    t.end()
  })

  t.test('start sampled', t => {
    const context = TraceContext.startOrResume(null, {
      transactionSampleRate: 1.0
    })

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.notEqual(context.traceId, traceId, 'has new traceId')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.recorded, true, 'is sampled')

    t.end()
  })

  t.test('start unsampled', t => {
    const context = TraceContext.startOrResume(null, {
      transactionSampleRate: 0.0
    })

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.notEqual(context.traceId, traceId, 'has new traceId')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.recorded, false, 'is sampled')

    t.end()
  })
})

test('child', t => {
  t.test('recorded', t => {
    const header = `${version}-${traceId}-${id}-01`
    const context = TraceContext.fromString(header).child()

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, '01', 'recorded remains recorded')

    t.end()
  })

  t.test('not recorded', t => {
    const header = `${version}-${traceId}-${id}-00`
    const context = TraceContext.fromString(header).child()

    isValid(t, context)
    t.equal(context.version, version, 'version matches')
    t.equal(context.traceId, traceId, 'traceId matches')
    t.notEqual(context.id, id, 'has new id')
    t.equal(context.flags, '00', 'not recorded remains not recorded')

    t.end()
  })
})

test('ensureParentId', t => {
  const context = TraceContext.fromString(header)

  isValid(t, context)
  t.equal(context.version, version, 'version matches')
  t.equal(context.traceId, traceId, 'traceId matches')
  t.equal(context.id, id, 'id matches')
  t.equal(context.flags, flags, 'flags matches')
  t.notOk(context.parentId, 'no parent id before')

  const first = context.ensureParentId()
  t.ok(first, 'returns parent id')
  t.equal(context.parentId, first, 'context parent id matches returned parent id')

  const second = context.ensureParentId()
  t.equal(first, second, 'future calls return the first parent id')

  t.end()
})
