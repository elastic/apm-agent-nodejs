'use strict'

var zlib = require('zlib')
var test = require('tape')
var nock = require('nock')
var helpers = require('./_helpers')
var Agent = require('../lib/agent')
var request = require('../lib/request')

var opts = {
  organizationId: 'some-org-id',
  appId: 'some-app-id',
  secretToken: 'secret',
  captureExceptions: false
}

var data = { extra: { uuid: 'foo' } }
var body = JSON.stringify(data)

test('#error()', function (t) {
  t.test('non-string exception.value', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.error(opbeat, { exception: { value: 1 } })
  })

  t.test('non-string culprit', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.error(opbeat, { culprit: 1 })
  })

  t.test('non-string message', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.error(opbeat, { message: 1 })
  })

  t.test('without callback and successful request', function (t) {
    zlib.deflate(body, function (err, buffer) {
      t.error(err)
      global.__opbeat_initialized = null
      var opbeat = new Agent()
      opbeat.start(opts)
      var scope = nock('https://intake.opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'))
          return 'ok'
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200)
      opbeat.on('logged', function (url) {
        scope.done()
        t.equal(url, 'foo')
        t.end()
      })
      request.error(opbeat, data)
    })
  })

  t.test('with callback and successful request', function (t) {
    zlib.deflate(body, function (err, buffer) {
      t.error(err)
      global.__opbeat_initialized = null
      var opbeat = new Agent()
      opbeat.start(opts)
      var scope = nock('https://intake.opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'))
          return 'ok'
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200)
      request.error(opbeat, data, function (err, url) {
        scope.done()
        t.error(err)
        t.equal(url, 'foo')
        t.end()
      })
    })
  })

  t.test('without callback and bad request', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    var scope = nock('https://intake.opbeat.com')
      .filteringRequestBody(function () { return '*' })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500)
    opbeat.on('error', function (err) {
      helpers.restoreLogger()
      scope.done()
      t.equal(err.message, 'Opbeat error (500): ')
      t.end()
    })
    helpers.mockLogger()
    request.error(opbeat, data)
  })

  t.test('with callback and bad request', function (t) {
    var called = false
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    var scope = nock('https://intake.opbeat.com')
      .filteringRequestBody(function () { return '*' })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500)
    opbeat.on('error', function (err) {
      helpers.restoreLogger()
      scope.done()
      t.ok(called)
      t.equal(err.message, 'Opbeat error (500): ')
      t.end()
    })
    helpers.mockLogger()
    request.error(opbeat, data, function (err) {
      called = true
      t.equal(err.message, 'Opbeat error (500): ')
    })
  })
})

test('#transactions()', function (t) {
  t.test('non-string transactions.$.transaction', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.transactions(opbeat, {
      transactions: [{ transaction: 1 }],
      traces: { raw: [], groups: [] }
    })
  })

  t.test('non-string traces.groups.$.transaction', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.transactions(opbeat, {
      transactions: [{ transaction: 1 }],
      traces: { raw: [], groups: [{ transaction: 1 }] }
    })
  })

  t.test('non-string traces.groups.$.extra._frames.$.context_line', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.transactions(opbeat, {
      transactions: [{ transaction: 'foo' }],
      traces: {
        raw: [],
        groups: [{transaction: 'foo', extra: {_frames: [{context_line: 1}]}}]
      }
    })
  })

  t.test('non-string traces.groups.$.extra._frames.$.pre_context.$', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.transactions(opbeat, {
      transactions: [{ transaction: 'foo' }],
      traces: {
        raw: [],
        groups: [{transaction: 'foo', extra: {_frames: [{pre_context: [1]}]}}]
      }
    })
  })

  t.test('non-string traces.groups.$.extra._frames.$.pre_context.$', function (t) {
    global.__opbeat_initialized = null
    var opbeat = new Agent()
    opbeat.start(opts)
    opbeat._httpClient.request = function () {
      t.end()
    }
    request.transactions(opbeat, {
      transactions: [{ transaction: 'foo' }],
      traces: {
        raw: [],
        groups: [{transaction: 'foo', extra: {_frames: [{post_context: [1]}]}}]
      }
    })
  })
})
