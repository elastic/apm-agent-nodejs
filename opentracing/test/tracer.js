'use strict'

const opentracing = require('opentracing')
const test = require('tape')

const { setup } = require('./_utils')
const Tracer = require('..')
const Agent = require('../../lib/agent')

test('should automatically create and keep a reference to an instance of the Agent', setup(function (t, done) {
  const tracer = new Tracer()
  t.ok(tracer._agent instanceof Agent)
  done(tracer._agent)
}))

test('should use Agent instance given as argument', setup(function (t, done) {
  const agent = new Agent()
  const tracer = new Tracer(agent)

  t.equal(tracer._agent, agent)
  done(tracer._agent)
}))

test('custom config', setup(function (t, done) {
  const tracer = new Tracer({
    serviceName: 'hello'
  })

  t.equal(tracer._agent._conf.serviceName, 'hello')
  done(tracer._agent)
}))

test('#startSpan()', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan()

  t.ok(span1, 'should return span')
  t.ok(span1._span, 'should hold reference to span/transaction')
  t.equal(span1._span.name, 'unnamed', 'should fall back to default name')
  t.equal(span1._span.type, 'custom', 'should fall back to default type')

  const span2 = tracer.startSpan()

  t.equal(span1._isTransaction, true, 'first span should be a transaction')
  t.equal(span2._isTransaction, false, 'second span should not be a transaction')

  done(tracer._agent)
}))

test('#startSpan(name)', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan('foo')

  t.equal(span._span.name, 'foo', 'should use given name')
  t.equal(span._span.type, 'custom', 'should fall back to default type')
  done(tracer._agent)
}))

test('#startSpan(name, {tags: {}})', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan('foo', { tags: {} })

  t.equal(span._span.name, 'foo', 'should use given name')
  t.equal(span._span.type, 'custom', 'should fall back to default type')
  done(tracer._agent)
}))

test('#startSpan(name, {tags: {type}})', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan('foo', { tags: { type: 'bar' } })

  t.equal(span._span.name, 'foo', 'should use given name')
  t.equal(span._span.type, 'bar', 'should use given type')
  done(tracer._agent)
}))

test('#startSpan(name, {tags: {...}})', setup(function (t, done) {
  const opts = { tags: {
    type: 'bar',
    a: '1',
    'a.b': '2',
    'a"b': '3',
    'a*b': '4'
  } }

  const tracer = new Tracer()
  const span = tracer.startSpan('foo', opts)

  t.equal(span._span.name, 'foo', 'should use given name')
  t.equal(span._span.type, 'bar', 'should use given type')

  t.deepEqual(span._span._tags, {
    a: '1',
    a_b: '4'
  }, 'should set expected tags')

  t.deepEqual(opts, { tags: {
    type: 'bar',
    a: '1',
    'a.b': '2',
    'a"b': '3',
    'a*b': '4'
  } }, 'should not mutate input')

  done(tracer._agent)
}))

test('#startSpan(name, {startTime})', setup(function (t, done) {
  const startTime = Date.now() - 1000

  const tracer = new Tracer()
  const span = tracer.startSpan('foo', { startTime })

  t.equal(span._span.timestamp, startTime * 1000)
  done(tracer._agent)
}))

test('#startSpan() - implicit children', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan('foo')
  const span2 = tracer.startSpan('bar') // implicit child of span1, because span1 is a transaction
  const span3 = tracer.startSpan('baz') // implicit child of span1, because span1 is a transaction

  t.equal(span1._isTransaction, true)
  t.equal(span2._isTransaction, false)
  t.equal(span3._isTransaction, false)

  const span1Context = span1.context()._elasticContext
  const span2Context = span2.context()._elasticContext
  const span3Context = span3.context()._elasticContext

  t.equal(span1Context.version, '00')
  t.ok(typeof span1Context.traceId, 'string')
  t.ok(typeof span1Context.id, 'string')
  t.equal(span1Context.flags, '01')

  // span1 should be the root
  t.equal(span1Context.parentId, undefined)

  // span2 should be a child of span1
  t.equal(span2Context.version, span1Context.version)
  t.equal(span2Context.traceId, span1Context.traceId)
  t.notEqual(span2Context.id, span1Context.id)
  t.equal(span2Context.parentId, span1Context.id)
  t.equal(span2Context.flags, span1Context.flags)

  // span3 should be a child of span1
  t.equal(span3Context.version, span1Context.version)
  t.equal(span3Context.traceId, span1Context.traceId)
  t.notEqual(span3Context.id, span1Context.id)
  t.equal(span3Context.parentId, span1Context.id)
  t.equal(span3Context.flags, span1Context.flags)

  done(tracer._agent)
}))

test('#startSpan(name, {childOf})', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan('foo')
  const span2 = tracer.startSpan('bar') // implicit child of span1, because span1 is a transaction
  const span3 = tracer.startSpan('baz', { childOf: span2.context() })

  t.equal(span1._isTransaction, true)
  t.equal(span2._isTransaction, false)
  t.equal(span3._isTransaction, false)

  const span1Context = span1.context()._elasticContext
  const span2Context = span2.context()._elasticContext
  const span3Context = span3.context()._elasticContext

  t.equal(span1Context.version, '00')
  t.ok(typeof span1Context.traceId, 'string')
  t.ok(typeof span1Context.id, 'string')
  t.equal(span1Context.flags, '01')

  // span1 should be the root
  t.equal(span1Context.parentId, undefined)

  // span2 should be a child of span1
  t.equal(span2Context.version, span1Context.version)
  t.equal(span2Context.traceId, span1Context.traceId)
  t.notEqual(span2Context.id, span1Context.id)
  t.equal(span2Context.parentId, span1Context.id)
  t.equal(span2Context.flags, span1Context.flags)

  // span3 should be a child of span2
  t.equal(span3Context.version, span2Context.version)
  t.equal(span3Context.traceId, span2Context.traceId)
  t.notEqual(span3Context.id, span2Context.id)
  t.equal(span3Context.parentId, span2Context.id)
  t.equal(span3Context.flags, span2Context.flags)

  done(tracer._agent)
}))

test('#startSpan(name, {references: [childOf]})', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan('foo')
  const span2 = tracer.startSpan('bar') // implicit child of span1, because span1 is a transaction
  const references = [
    new opentracing.Reference(opentracing.REFERENCE_CHILD_OF, span2.context())
  ]
  const span3 = tracer.startSpan('baz', { references })

  t.equal(span1._isTransaction, true)
  t.equal(span2._isTransaction, false)
  t.equal(span3._isTransaction, false)

  const span1Context = span1.context()._elasticContext
  const span2Context = span2.context()._elasticContext
  const span3Context = span3.context()._elasticContext

  t.equal(span1Context.version, '00')
  t.ok(typeof span1Context.traceId, 'string')
  t.ok(typeof span1Context.id, 'string')
  t.equal(span1Context.flags, '01')

  // span1 should be the root
  t.equal(span1Context.parentId, undefined)

  // span2 should be a child of span1
  t.equal(span2Context.version, span1Context.version)
  t.equal(span2Context.traceId, span1Context.traceId)
  t.notEqual(span2Context.id, span1Context.id)
  t.equal(span2Context.parentId, span1Context.id)
  t.equal(span2Context.flags, span1Context.flags)

  // span3 should be a child of span2
  t.equal(span3Context.version, span2Context.version)
  t.equal(span3Context.traceId, span2Context.traceId)
  t.notEqual(span3Context.id, span2Context.id)
  t.equal(span3Context.parentId, span2Context.id)
  t.equal(span3Context.flags, span2Context.flags)

  done(tracer._agent)
}))

// This currently doesn't behave in a logical way as when the followsFrom
// reference is being ignored, the agent will simply automatically associate
// span2 with span1, because span1 is a transaction
test.skip('#startSpan(name, {references: [followsFrom]})', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan('foo')
  const references = [
    new opentracing.Reference(opentracing.REFERENCE_FOLLOWS_FROM, span1.context())
  ]
  const span2 = tracer.startSpan('bar', { references })

  const span1Context = span1.context()._elasticContext
  const span2Context = span2.context()._elasticContext

  t.notEqual(span1Context.traceId, span1Context.traceId)
  t.notEqual(span1Context.id, span1Context.id)
  t.equal(span2Context.parentId, undefined)
  t.equal(span1Context.parentId, undefined)
  done(tracer._agent)
}))

test('#startSpan(name, {references: [followsFrom, childOf, childOf]})', setup(function (t, done) {
  const tracer = new Tracer()
  const span1 = tracer.startSpan('foo')
  const span2 = tracer.startSpan('bar') // implicit child of span1, because span1 is a transaction
  const references = [
    new opentracing.Reference(opentracing.REFERENCE_FOLLOWS_FROM, span1.context()),
    new opentracing.Reference(opentracing.REFERENCE_CHILD_OF, span2.context()),
    new opentracing.Reference(opentracing.REFERENCE_CHILD_OF, span1.context())
  ]
  const span3 = tracer.startSpan('baz', { references })

  t.equal(span1._isTransaction, true)
  t.equal(span2._isTransaction, false)
  t.equal(span3._isTransaction, false)

  const span1Context = span1.context()._elasticContext
  const span2Context = span2.context()._elasticContext
  const span3Context = span3.context()._elasticContext

  t.equal(span1Context.version, '00')
  t.ok(typeof span1Context.traceId, 'string')
  t.ok(typeof span1Context.id, 'string')
  t.equal(span1Context.flags, '01')

  // span1 should be the root
  t.equal(span1Context.parentId, undefined)

  // span2 should be a child of span1
  t.equal(span2Context.version, span1Context.version)
  t.equal(span2Context.traceId, span1Context.traceId)
  t.notEqual(span2Context.id, span1Context.id)
  t.equal(span2Context.parentId, span1Context.id)
  t.equal(span2Context.flags, span1Context.flags)

  // span3 should be a child of span2
  t.equal(span3Context.version, span2Context.version)
  t.equal(span3Context.traceId, span2Context.traceId)
  t.notEqual(span3Context.id, span2Context.id)
  t.equal(span3Context.parentId, span2Context.id)
  t.equal(span3Context.flags, span2Context.flags)

  done(tracer._agent)
}))

test('#startSpan() - ended transaction', setup(function (t, done) {
  const tracer = new Tracer()

  const span1 = tracer.startSpan('foo')
  span1.finish()

  const span2 = tracer.startSpan('bar')

  t.equal(span1._isTransaction, true)
  t.equal(span2._isTransaction, true)
  t.equal(span1.context()._elasticContext.parentId, undefined)
  t.equal(span2.context()._elasticContext.parentId, undefined)
  done(tracer._agent)
}))
