'use strict'

var test = require('tape')
var mockAgent = require('./_agent')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Span = require('../../lib/instrumentation/span')

var agent = mockAgent()

test('properties', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start('sig', 'type')
  t.equal(span.transaction, trans)
  t.equal(span.name, 'sig')
  t.equal(span.type, 'type')
  t.equal(span.ended, false)
  t.end()
})

test('#end()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start('sig', 'type')
  t.equal(span.ended, false)
  t.equal(trans.spans.indexOf(span), -1)
  span.end()
  t.equal(span.ended, true)
  t.equal(trans.spans.indexOf(span), 0)
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  setTimeout(function () {
    span.end()
    t.ok(span.duration() > 49, span.duration() + ' should be larger than 49')
    t.end()
  }, 50)
})

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  t.equal(span.duration(), null)
  t.end()
})

test('#offsetTime() - return null if span isn\'t started', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.equal(span.offsetTime(), null)
  t.end()
})

test('#offsetTime() - not return null if span is started', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  t.ok(span.offsetTime() > 0)
  t.ok(span.offsetTime() < 100)
  t.end()
})

test('#offsetTime() - sub span', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.ok(span.offsetTime() > 49, span.offsetTime() + ' should be larger than 49')
    t.end()
  })._agent)
  var span
  setTimeout(function () {
    span = new Span(trans)
    span.start()
    span.end()
    trans.end()
  }, 50)
})
