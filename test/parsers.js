'use strict'

var test = require('tape')
var semver = require('semver')
var parsers = require('../lib/parsers')

test('#parseMessage()', function (t) {
  t.test('should parse string', function (t) {
    var data = {}
    parsers.parseMessage('Howdy', data)
    t.equal(data.message, 'Howdy')
    t.end()
  })

  t.test('should parse object', function (t) {
    var data = {}
    parsers.parseMessage({ message: 'foo%s', params: ['bar'] }, data)
    t.equal(data.message, 'foobar')
    t.equal(data.param_message, 'foo%s')
    t.end()
  })

  t.test('should parse an invalid object', function (t) {
    var data = {}
    parsers.parseMessage({ foo: /bar/ }, data)
    t.equal(data.message, '{ foo: /bar/ }')
    t.end()
  })
})

test('#parseRequest()', function (t) {
  var mockReq = {
    method: 'GET',
    url: '/some/path?key=value',
    headers: {
      host: 'example.com'
    },
    body: '',
    cookies: {},
    socket: {
      encrypted: true
    }
  }

  t.test('should parse a request object', function () {
    var parsed = parsers.parseRequest(mockReq)
    t.equal(parsed.url, 'https://example.com/some/path?key=value')
    t.end()
  })

  t.test('should slice too large body\'s', function (t) {
    mockReq.body = ''
    for (var n = 0; n < parsers._MAX_HTTP_BODY_CHARS + 10; n++) {
      mockReq.body += 'x'
    }
    mockReq.headers['content-length'] = String(mockReq.body.length)
    var parsed = parsers.parseRequest(mockReq, {body: true})
    t.equal(parsed.data.length, parsers._MAX_HTTP_BODY_CHARS)
    t.end()
  })

  t.test('should not log body if opts.body is false', function (t) {
    mockReq.body = 'secret stuff'
    mockReq.headers['content-length'] = String(mockReq.body.length)
    var parsed = parsers.parseRequest(mockReq, {body: false})
    t.equal(parsed.data, '[REDACTED]')
    t.end()
  })
})

test('#parseError()', function (t) {
  t.test('should parse plain Error object', function (t) {
    parsers.parseError(new Error(), {}, function (parsed) {
      t.equal(parsed.message, 'Error: <no message>')
      t.ok('exception' in parsed)
      t.equal(parsed.exception.type, 'Error')
      t.equal(parsed.exception.value, '')
      t.ok('stacktrace' in parsed)
      t.ok('frames' in parsed.stacktrace)
      t.end()
    })
  })

  t.test('should parse Error with message', function (t) {
    parsers.parseError(new Error('Crap'), {}, function (parsed) {
      t.equal(parsed.message, 'Error: Crap')
      t.ok('exception' in parsed)
      t.equal(parsed.exception.type, 'Error')
      t.equal(parsed.exception.value, 'Crap')
      t.ok('stacktrace' in parsed)
      t.ok('frames' in parsed.stacktrace)
      t.end()
    })
  })

  t.test('should parse TypeError with message', function (t) {
    parsers.parseError(new TypeError('Crap'), {}, function (parsed) {
      t.equal(parsed.message, 'TypeError: Crap')
      t.ok('exception' in parsed)
      t.equal(parsed.exception.type, 'TypeError')
      t.equal(parsed.exception.value, 'Crap')
      t.ok('stacktrace' in parsed)
      t.ok('frames' in parsed.stacktrace)
      t.end()
    })
  })

  t.test('should parse thrown Error', function (t) {
    try {
      throw new Error('Derp')
    } catch (e) {
      parsers.parseError(e, {}, function (parsed) {
        t.equal(parsed.message, 'Error: Derp')
        t.ok('exception' in parsed)
        t.equal(parsed.exception.type, 'Error')
        t.equal(parsed.exception.value, 'Derp')
        t.ok('stacktrace' in parsed)
        t.ok('frames' in parsed.stacktrace)
        t.end()
      })
    }
  })

  t.test('should parse caught real error', function (t) {
    try {
      var o = {}
      o['...']['Derp']()
    } catch (e) {
      parsers.parseError(e, {}, function (parsed) {
        var msg = semver.lt(process.version, '0.11.0')
          ? 'Cannot call method \'Derp\' of undefined'
          : 'Cannot read property \'Derp\' of undefined'
        t.equal(parsed.message, 'TypeError: ' + msg)
        t.ok('exception' in parsed)
        t.equal(parsed.exception.type, 'TypeError')
        t.equal(parsed.exception.value, msg)
        t.ok('stacktrace' in parsed)
        t.ok('frames' in parsed.stacktrace)
        t.end()
      })
    }
  })

  t.test('should gracefully handle .stack already being accessed', function (t) {
    var err = new Error('foo')
    t.ok(typeof err.stack === 'string')
    parsers.parseError(err, {}, function (parsed) {
      t.equal(parsed.message, 'Error: foo')
      t.ok('exception' in parsed)
      t.equal(parsed.exception.type, 'Error')
      t.equal(parsed.exception.value, 'foo')
      t.ok('stacktrace' in parsed)
      t.ok('frames' in parsed.stacktrace)
      t.end()
    })
  })

  t.test('should gracefully handle .stack being overwritten', function (t) {
    var err = new Error('foo')
    err.stack = 'foo'
    parsers.parseError(err, {}, function (parsed) {
      t.equal(parsed.message, 'Error: foo')
      t.ok('exception' in parsed)
      t.equal(parsed.exception.type, 'Error')
      t.equal(parsed.exception.value, 'foo')
      t.ok(!('stacktrace' in parsed))
      t.end()
    })
  })
})
