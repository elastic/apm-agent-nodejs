'use strict'

const crypto = require('crypto')
const test = require('tape')

const TraceContext = require('../../lib/instrumentation/context')

const version = Buffer.alloc(1)
const traceId = crypto.randomBytes(16)
const id = crypto.randomBytes(8)
const flags = Buffer.alloc(1)

const header = `00-${traceId.toString('hex')}-${id.toString('hex')}-00`

test('constructor', t => {
  const context = new TraceContext({
    version,
    traceId,
    id,
    flags
  })

  t.ok(context instanceof TraceContext, 'has a trace context object')
  t.ok(version.equals(context.version), 'version matches')
  t.ok(traceId.equals(context.traceId), 'traceId matches')
  t.ok(id.equals(context.id), 'id matches')
  t.ok(flags.equals(context.flags), 'flags matches')

  t.end()
})

test('fromString', t => {
  const context = TraceContext.fromString(header)

  t.ok(context instanceof TraceContext, 'has a trace context object')
  t.ok(version.equals(context.version), 'version matches')
  t.ok(traceId.equals(context.traceId), 'traceId matches')
  t.ok(id.equals(context.id), 'id matches')
  t.ok(flags.equals(context.flags), 'flags matches')

  t.end()
})

test('toString', t => {
  const result = TraceContext.fromString(header).toString()
  t.equal(result, header, 'trace context stringifies to valid header')
  t.end()
})

test('toJSON', t => {
  const context = TraceContext.fromString(header)

  t.deepEqual(context.toJSON(), {
    version: version.toString('hex'),
    traceId: traceId.toString('hex'),
    id: id.toString('hex'),
    flags: flags.toString('hex'),
    parentId: undefined
  }, 'trace context serializes fields to hex strings, in JSON form')

  t.end()
})

test('create', t => {
  const context = TraceContext.create()

  t.ok(context instanceof TraceContext, 'has a trace context object')
  t.ok(version.equals(context.version), 'version matches')
  t.notOk(traceId.equals(context.traceId), 'has new traceId')
  t.notOk(id.equals(context.id), 'has new spanId')
  t.ok(flags.equals(context.flags), 'flags matches')

  t.end()
})

test('child', t => {
  const parent = TraceContext.fromString(header)
  const context = parent.child()

  t.ok(context instanceof TraceContext, 'has a trace context object')
  t.ok(version.equals(context.version), 'version matches')
  t.ok(traceId.equals(context.traceId), 'traceId matches')
  t.notOk(id.equals(context.id), 'has new id')
  t.ok(flags.equals(context.flags), 'flags matches')
  t.ok(parent.id.equals(context.parentId), 'parentId matches parent.id')

  t.end()
})
