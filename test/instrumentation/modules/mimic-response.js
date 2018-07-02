'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  captureExceptions: false
})

var PassThrough = require('stream').PassThrough
var mimicResponse = require('mimic-response')
var test = require('tape')

test('none bound', function (t) {
  const source = new PassThrough()
  const target = new PassThrough()

  mimicResponse(source, target)

  target.on('data', function (chunk) {
    t.ok(this === target, 'target -> onData should be bound to target stream')
    t.equal(chunk.toString(), 'hello world')
    t.end()
  })

  source.pipe(target)

  source.end('hello world')
})

test('source bound', function (t) {
  const source = new PassThrough()
  const target = new PassThrough()

  agent._instrumentation.bindEmitter(source)
  mimicResponse(source, target)

  target.on('data', function (chunk) {
    t.ok(this === target, 'target -> onData should be bound to target stream')
    t.equal(chunk.toString(), 'hello world')
    t.end()
  })

  source.pipe(target)

  source.end('hello world')
})

test('target bound', function (t) {
  const source = new PassThrough()
  const target = new PassThrough()

  agent._instrumentation.bindEmitter(target)
  mimicResponse(source, target)

  target.on('data', function (chunk) {
    t.ok(this === target, 'target -> onData should be bound to target stream')
    t.equal(chunk.toString(), 'hello world')
    t.end()
  })

  source.pipe(target)

  source.end('hello world')
})

test('both bound', function (t) {
  const source = new PassThrough()
  const target = new PassThrough()

  agent._instrumentation.bindEmitter(source)
  agent._instrumentation.bindEmitter(target)
  mimicResponse(source, target)

  target.on('data', function (chunk) {
    t.ok(this === target, 'target -> onData should be bound to target stream')
    t.equal(chunk.toString(), 'hello world')
    t.end()
  })

  source.pipe(target)

  source.end('hello world')
})
