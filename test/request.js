'use strict'

var zlib = require('zlib')
var test = require('tape')
var nock = require('nock')
var helpers = require('./_helpers')
var opbeat = require('../')
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
  t.test('without callback and successful request', function (t) {
    zlib.deflate(body, function (err, buffer) {
      t.error(err)
      var client = opbeat(opts)
      var scope = nock('https://intake.opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'))
          return 'ok'
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200)
      client.on('logged', function (url) {
        scope.done()
        t.equal(url, 'foo')
        t.end()
      })
      request.error(client, data)
    })
  })

  t.test('with callback and successful request', function (t) {
    zlib.deflate(body, function (err, buffer) {
      t.error(err)
      var client = opbeat(opts)
      var scope = nock('https://intake.opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'))
          return 'ok'
        })
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', 'ok')
        .reply(200)
      request.error(client, data, function (err, url) {
        scope.done()
        t.error(err)
        t.equal(url, 'foo')
        t.end()
      })
    })
  })

  t.test('without callback and bad request', function (t) {
    var client = opbeat(opts)
    var scope = nock('https://intake.opbeat.com')
      .filteringRequestBody(function () { return '*' })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500)
    client.on('error', function (err) {
      helpers.restoreLogger()
      scope.done()
      t.equal(err.message, 'Opbeat error (500): ')
      t.end()
    })
    helpers.mockLogger()
    request.error(client, data)
  })

  t.test('with callback and bad request', function (t) {
    var called = false
    var client = opbeat(opts)
    var scope = nock('https://intake.opbeat.com')
      .filteringRequestBody(function () { return '*' })
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500)
    client.on('error', function (err) {
      helpers.restoreLogger()
      scope.done()
      t.ok(called)
      t.equal(err.message, 'Opbeat error (500): ')
      t.end()
    })
    helpers.mockLogger()
    request.error(client, data, function (err) {
      called = true
      t.equal(err.message, 'Opbeat error (500): ')
    })
  })
})
