'use strict'

const test = require('tape')

const { setup } = require('./_utils')
const Tracer = require('..')
const Transaction = require('../../lib/instrumentation/transaction')

test('init', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()
  t.equal(span._isTransaction, true)
  t.ok(span._span instanceof Transaction)
  done(tracer._agent)
}))

test('#setOperationName()', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan('foo')
  span.setOperationName('bar')
  t.equal(span._span.name, 'bar')
  done(tracer._agent)
}))

test('tags', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()

  const tags = {
    a: '1',
    'a.b': '2',
    'a"b': '3',
    'a*b': '4'
  }

  span.addTags(tags)

  t.deepEqual(span._span._tags, {
    a: '1',
    a_b: '4'
  }, 'should set expected tags')

  t.deepEqual(tags, {
    a: '1',
    'a.b': '2',
    'a"b': '3',
    'a*b': '4'
  }, 'should not mutate input')

  done(tracer._agent)
}))

test('tag: type', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()
  span.setTag('type', 'foo')
  t.equal(span._span.type, 'foo')
  t.equal(span._span._tags, null)
  done(tracer._agent)
}))

test('tag: result', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()
  span.setTag('result', 'foo')
  t.equal(span._span.result, 'foo')
  t.equal(span._span._tags, null)
  done(tracer._agent)
}))

test('tag: http.status_code', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()
  span.setTag('http.status_code', 200)
  t.equal(span._span.result, 'HTTP 2xx')
  t.equal(span._span._tags, null)
  done(tracer._agent)
}))

test('tag: user.*', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan()
  span.addTags({
    'user.id': 'foo',
    'user.username': 'bar',
    'user.email': 'baz'
  })
  t.deepEqual(span._span._user, {
    id: 'foo',
    username: 'bar',
    email: 'baz'
  })
  t.equal(span._span._tags, null)
  done(tracer._agent)
}))

test('log - error, but no details', setup(function (t, done) {
  const tracer = new Tracer()

  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function () {
    t.fail('should not capture error if only the event log is set')
  }

  const span = tracer.startSpan()
  span.log({ event: 'error' })
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('log - error, with error object', setup(function (t, done) {
  const tracer = new Tracer()

  const error = new Error('foo')
  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function (capturedError, opts) {
    t.equal(capturedError, error)
    t.deepEqual(opts, {
      timestamp: undefined,
      message: undefined
    })
  }

  const span = tracer.startSpan()
  span.log({ event: 'error', 'error.object': error })
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('log - error, with string message', setup(function (t, done) {
  const tracer = new Tracer()

  const error = 'foo'
  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function (capturedError, opts) {
    t.equal(capturedError, error)
    t.deepEqual(opts, { timestamp: undefined })
  }

  const span = tracer.startSpan()
  span.log({ event: 'error', message: error })
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('log - error, with error object + timestamp', setup(function (t, done) {
  const tracer = new Tracer()

  const error = new Error('foo')
  const timestamp = Date.now() - 1000

  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function (capturedError, opts) {
    t.equal(capturedError, error)
    t.deepEqual(opts, {
      timestamp,
      message: undefined
    })
  }

  const span = tracer.startSpan()
  span.log({ event: 'error', 'error.object': error }, timestamp)
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('log - error, with string message + timestamp', setup(function (t, done) {
  const tracer = new Tracer()

  const error = 'foo'
  const timestamp = Date.now() - 1000

  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function (capturedError, opts) {
    t.equal(capturedError, error)
    t.deepEqual(opts, { timestamp })
  }

  const span = tracer.startSpan()
  span.log({ event: 'error', message: error }, timestamp)
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('log - error, with error object + message + timestamp', setup(function (t, done) {
  const tracer = new Tracer()

  const error = new Error('foo')
  const message = 'bar'
  const timestamp = Date.now() - 1000

  const captureError = tracer._agent.captureError
  tracer._agent.captureError = function (capturedError, opts) {
    t.equal(capturedError, error)
    t.deepEqual(opts, {
      timestamp,
      message
    })
  }

  const span = tracer.startSpan()
  span.log({ event: 'error', 'error.object': error, message }, timestamp)
  t.equal(span._span._tags, null)

  tracer._agent.captureError = captureError
  done(tracer._agent)
}))

test('#finish() - transaction', setup(function (t, done) {
  const tracer = new Tracer()
  const span = tracer.startSpan('foo')
  t.equal(span._span.ended, false)
  span.finish()
  t.equal(span._span.ended, true)
  done(tracer._agent)
}))

test('#finish(finishTime) - transaction', setup(function (t, done) {
  const startTime = Date.now() - 1000
  const finishTime = startTime + 2000.123

  const tracer = new Tracer()
  const span = tracer.startSpan('foo', { startTime })

  span.finish(finishTime)

  t.equal(span._span.timestamp, startTime * 1000)
  t.equal(span._span._timer.duration, 2000.123)
  t.equal(span._span.duration(), 2000.123)

  done(tracer._agent)
}))

test('#finish() - span', setup(function (t, done) {
  const tracer = new Tracer()
  tracer.startSpan('foo')
  const span = tracer.startSpan('bar')
  t.equal(span._span.ended, false)
  span.finish()
  t.equal(span._span.ended, true)
  done(tracer._agent)
}))

test('#finish(finishTime) - span', setup(function (t, done) {
  const startTime = Date.now() - 1000
  const finishTime = startTime + 2000.123

  const tracer = new Tracer()
  tracer.startSpan('foo')
  const span = tracer.startSpan('bar', { startTime })

  span.finish(finishTime)

  t.equal(span._span.timestamp, startTime * 1000)
  t.equal(span._span._timer.duration, 2000.123)
  t.equal(span._span.duration(), 2000.123)

  done(tracer._agent)
}))
