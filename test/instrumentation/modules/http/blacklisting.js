'use strict'

var agent = require('../../_agent')()

var test = require('tape')
var http = require('http')

test('ignore url string - no match', function (t) {
  resetAgent({
    _ignoreUrlStr: ['/exact']
  }, function (endpoint, headers, data, cb) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/not/exact')
})

test('ignore url string - match', function (t) {
  resetAgent({
    _ignoreUrlStr: ['/exact']
  }, function (endpoint, headers, data, cb) {
    assertMatch(t, data)
    t.end()
  })
  request('/exact')
})

test('ignore url regex - no match', function (t) {
  resetAgent({
    _ignoreUrlRegExp: [/regex/]
  }, function (endpoint, headers, data, cb) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/no-match')
})

test('ignore url regex - match', function (t) {
  resetAgent({
    _ignoreUrlRegExp: [/regex/]
  }, function (endpoint, headers, data, cb) {
    assertMatch(t, data)
    t.end()
  })
  request('/foo/regex/bar')
})

test('ignore User-Agent string - no match', function (t) {
  resetAgent({
    _ignoreUserAgentStr: ['exact']
  }, function (endpoint, headers, data, cb) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'not-exact' })
})

test('ignore User-Agent string - match', function (t) {
  resetAgent({
    _ignoreUserAgentStr: ['exact']
  }, function (endpoint, headers, data, cb) {
    assertMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'exact-start' })
})

test('ignore User-Agent regex - no match', function (t) {
  resetAgent({
    _ignoreUserAgentRegExp: [/regex/]
  }, function (endpoint, headers, data, cb) {
    assertNoMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'no-match' })
})

test('ignore User-Agent regex - match', function (t) {
  resetAgent({
    _ignoreUserAgentRegExp: [/regex/]
  }, function (endpoint, headers, data, cb) {
    assertMatch(t, data)
    t.end()
  })
  request('/', { 'User-Agent': 'foo-regex-bar' })
})

function assertNoMatch (t, data) {
  // data.traces.groups:
  t.equal(data.traces.groups.length, 1)

  t.equal(data.traces.groups[0].transaction, 'GET unknown route')
  t.equal(data.traces.groups[0].signature, 'transaction')
  t.equal(data.traces.groups[0].kind, 'transaction')
  t.deepEqual(data.traces.groups[0].parents, [])

  // data.transactions:
  t.equal(data.transactions.length, 1)
  t.equal(data.transactions[0].transaction, 'GET unknown route')
  t.equal(data.transactions[0].durations.length, 1)
  t.ok(data.transactions[0].durations[0] > 0)

  // data.traces.raw:
  //
  // [
  //   [
  //     15.240414,          // total transaction time
  //     [ 0, 0, 15.240414 ] // root trace
  //   ]
  // ]
  t.equal(data.traces.raw.length, 1)
  t.equal(data.traces.raw[0].length, 3)
  t.equal(data.traces.raw[0][0], data.transactions[0].durations[0])
  t.equal(data.traces.raw[0][1].length, 3)

  t.equal(data.traces.raw[0][1][0], 0)
  t.equal(data.traces.raw[0][1][1], 0)
  t.equal(data.traces.raw[0][1][2], data.traces.raw[0][0])

  t.equal(data.traces.raw[0][2].http.method, 'GET')
}

function assertMatch (t, data) {
  t.deepEqual(data, { transactions: [], traces: { groups: [], raw: [] } })
}

function request (path, headers) {
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
        agent._instrumentation._queue._flush()
        server.close()
      })
      res.resume()
    }).end()
  })
}

function resetAgent (opts, cb) {
  agent._httpClient = { request: cb }
  agent._ignoreUrlStr = opts._ignoreUrlStr || []
  agent._ignoreUrlRegExp = opts._ignoreUrlRegExp || []
  agent._ignoreUserAgentStr = opts._ignoreUserAgentStr || []
  agent._ignoreUserAgentRegExp = opts._ignoreUserAgentRegExp || []
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
}
