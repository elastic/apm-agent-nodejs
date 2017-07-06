'use strict'

var test = require('tape')
var semver = require('semver')
var parsers = require('../lib/parsers')

test('#parseMessage()', function (t) {
  t.test('should parse string', function (t) {
    var data = parsers.parseMessage('Howdy')
    t.deepEqual(data, {log: {message: 'Howdy'}})
    t.end()
  })

  t.test('should parse object', function (t) {
    var data = parsers.parseMessage({message: 'foo%s', params: ['bar']})
    t.deepEqual(data, {log: {message: 'foobar', param_message: 'foo%s'}})
    t.end()
  })

  t.test('should parse an invalid object', function (t) {
    var data = parsers.parseMessage({foo: /bar/})
    t.deepEqual(data, {log: {message: '{ foo: /bar/ }'}})
    t.end()
  })

  t.test('should parse null', function (t) {
    var data = parsers.parseMessage(null)
    t.deepEqual(data, {log: {message: 'null'}})
    t.end()
  })
})

test('#getContextFromRequest()', function (t) {
  var mockReq = {
    method: 'GET',
    url: '/some/path?key=value',
    headers: {
      host: 'example.com',
      'user-agent': 'Mozilla Chrome Edge'
    },
    body: '',
    cookies: {},
    socket: {
      remoteAddress: '127.0.0.1',
      encrypted: true
    }
  }

  t.test('should parse a request object', function (t) {
    var parsed = parsers.getContextFromRequest(mockReq)
    t.deepEqual(parsed, {
      method: 'GET',
      url: {
        hostname: 'example.com',
        pathname: '/some/path',
        search: '?key=value',
        raw: '/some/path?key=value'
      },
      socket: {
        remote_address: '127.0.0.1',
        encrypted: true
      },
      headers: {
        host: 'example.com',
        'user-agent': 'Mozilla Chrome Edge'
      }
    })
    t.end()
  })

  t.test('empty query string', function (t) {
    mockReq.url = '/some/path?'
    var parsed = parsers.getContextFromRequest(mockReq)
    t.deepEqual(parsed.url, {
      hostname: 'example.com',
      pathname: '/some/path',
      search: '?',
      raw: '/some/path?'
    })
    t.end()
  })

  t.test('should slice too large body\'s', function (t) {
    mockReq.body = ''
    for (var n = 0; n < parsers._MAX_HTTP_BODY_CHARS + 10; n++) {
      mockReq.body += 'x'
    }
    mockReq.headers['content-length'] = String(mockReq.body.length)
    var parsed = parsers.getContextFromRequest(mockReq, true)
    t.equal(parsed.body.length, parsers._MAX_HTTP_BODY_CHARS)
    t.end()
  })

  t.test('should not log body if opts.body is false', function (t) {
    mockReq.body = 'secret stuff'
    mockReq.headers['content-length'] = String(mockReq.body.length)
    var parsed = parsers.getContextFromRequest(mockReq, false)
    t.equal(parsed.body, '[REDACTED]')
    t.end()
  })

  t.test('body is object', function (t) {
    mockReq.body = {foo: 42}
    mockReq.headers['content-length'] = JSON.stringify(mockReq.body).length
    var parsed = parsers.getContextFromRequest(mockReq, true)
    t.deepEqual(parsed.body, {foo: 42})
    t.end()
  })

  t.test('body is object, but too large', function (t) {
    mockReq.body = {foo: ''}
    for (var n = 0; n < parsers._MAX_HTTP_BODY_CHARS + 10; n++) {
      mockReq.body.foo += 'x'
    }
    mockReq.headers['content-length'] = JSON.stringify(mockReq.body).length
    var parsed = parsers.getContextFromRequest(mockReq, true)
    t.equal(typeof parsed.body, 'string')
    t.equal(parsed.body.length, parsers._MAX_HTTP_BODY_CHARS)
    t.equal(parsed.body.slice(0, 10), '{"foo":"xx')
    t.end()
  })
})

test('#parseError()', function (t) {
  t.test('should parse plain Error object', function (t) {
    parsers.parseError(new Error(), function (err, parsed) {
      t.error(err)
      t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.equal(parsed.exception.message, '')
      t.equal(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('uncaught' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse Error with message', function (t) {
    parsers.parseError(new Error('Crap'), function (err, parsed) {
      t.error(err)
      t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.equal(parsed.exception.message, 'Crap')
      t.equal(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('uncaught' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse TypeError with message', function (t) {
    parsers.parseError(new TypeError('Crap'), function (err, parsed) {
      t.error(err)
      t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.equal(parsed.exception.message, 'Crap')
      t.equal(parsed.exception.type, 'TypeError')
      t.notOk('code' in parsed.exception)
      t.notOk('uncaught' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse thrown Error', function (t) {
    try {
      throw new Error('Derp')
    } catch (e) {
      parsers.parseError(e, function (err, parsed) {
        t.error(err)
        t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
        t.notOk('log' in parsed)
        t.ok('exception' in parsed)
        t.equal(parsed.exception.message, 'Derp')
        t.equal(parsed.exception.type, 'Error')
        t.notOk('code' in parsed.exception)
        t.notOk('uncaught' in parsed.exception)
        t.notOk('attributes' in parsed.exception)
        t.ok('stacktrace' in parsed.exception)
        t.ok(parsed.exception.stacktrace.length > 0)
        t.end()
      })
    }
  })

  t.test('should parse caught real error', function (t) {
    try {
      var o = {}
      o['...']['Derp']()
    } catch (e) {
      parsers.parseError(e, function (err, parsed) {
        t.error(err)
        var msg = semver.lt(process.version, '0.11.0')
          ? 'Cannot call method \'Derp\' of undefined'
          : 'Cannot read property \'Derp\' of undefined'
        t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
        t.notOk('log' in parsed)
        t.ok('exception' in parsed)
        t.equal(parsed.exception.message, msg)
        t.equal(parsed.exception.type, 'TypeError')
        t.notOk('code' in parsed.exception)
        t.notOk('uncaught' in parsed.exception)
        t.notOk('attributes' in parsed.exception)
        t.ok('stacktrace' in parsed.exception)
        t.ok(parsed.exception.stacktrace.length > 0)
        t.end()
      })
    }
  })

  t.test('should gracefully handle .stack already being accessed', function (t) {
    var err = new Error('foo')
    t.ok(typeof err.stack === 'string')
    parsers.parseError(err, function (err, parsed) {
      t.error(err)
      t.equal(parsed.culprit, 'Test.<anonymous> (test/parsers.js)')
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.equal(parsed.exception.message, 'foo')
      t.equal(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('uncaught' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should gracefully handle .stack being overwritten', function (t) {
    var err = new Error('foo')
    err.stack = 'foo'
    parsers.parseError(err, function (err, parsed) {
      t.error(err)
      t.notOk('culprit' in parsed)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.equal(parsed.exception.message, 'foo')
      t.equal(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('uncaught' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.equal(parsed.exception.stacktrace.length, 0)
      t.end()
    })
  })
})
