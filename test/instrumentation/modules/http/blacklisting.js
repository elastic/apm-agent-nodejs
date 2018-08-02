'use strict'

var agent = require('../../_agent')()

var http = require('http')

var test = require('tape')

var mockClient = require('../../../_mock_http_client')

test('ignore url string - no match', function (t) {
  resetAgent({
    ignoreUrlStr: ['/exact']
  }, function (data) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/not/exact')
})

test('ignore url string - match', function (t) {
  resetAgent({
    ignoreUrlStr: ['/exact']
  }, function () {
    t.fail('should not have any data')
  })
  request('/exact', null, function () {
    t.end()
  })
})

test('ignore url regex - no match', function (t) {
  resetAgent({
    ignoreUrlRegExp: [/regex/]
  }, function (data) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/no-match')
})

test('ignore url regex - match', function (t) {
  resetAgent({
    ignoreUrlRegExp: [/regex/]
  }, function () {
    t.fail('should not have any data')
  })
  request('/foo/regex/bar', null, function () {
    t.end()
  })
})

test('ignore User-Agent string - no match', function (t) {
  resetAgent({
    ignoreUserAgentStr: ['exact']
  }, function (data) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'not-exact' })
})

test('ignore User-Agent string - match', function (t) {
  resetAgent({
    ignoreUserAgentStr: ['exact']
  }, function () {
    t.fail('should not have any data')
  })
  request('/', { 'User-Agent': 'exact-start' }, function () {
    t.end()
  })
})

test('ignore User-Agent regex - no match', function (t) {
  resetAgent({
    ignoreUserAgentRegExp: [/regex/]
  }, function (data) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'no-match' })
})

test('ignore User-Agent regex - match', function (t) {
  resetAgent({
    ignoreUserAgentRegExp: [/regex/]
  }, function () {
    t.fail('should not have any data')
  })
  request('/', { 'User-Agent': 'foo-regex-bar' }, function () {
    t.end()
  })
})

function assertNoMatch (t, data) {
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].name, 'GET unknown route')
}

function request (path, headers, cb) {
  var server = http.createServer(function (req, res) {
    res.end()
  })

  server.listen(function () {
    var opts = {
      port: server.address().port,
      path: path,
      headers: headers
    }
    http.request(opts, function (res) {
      res.on('end', function () {
        server.close()
        if (cb) setTimeout(cb, 100)
      })
      res.resume()
    }).end()
  })
}

function resetAgent (opts, cb) {
  agent._apmServer = mockClient(1, cb)
  agent._conf.ignoreUrlStr = opts.ignoreUrlStr || []
  agent._conf.ignoreUrlRegExp = opts.ignoreUrlRegExp || []
  agent._conf.ignoreUserAgentStr = opts.ignoreUserAgentStr || []
  agent._conf.ignoreUserAgentRegExp = opts.ignoreUserAgentRegExp || []
  agent._instrumentation.currentTransaction = null
}
