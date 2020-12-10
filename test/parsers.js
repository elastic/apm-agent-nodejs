'use strict'

var http = require('http')
var path = require('path')

var test = require('tape')

var parsers = require('../lib/parsers')
var stackman = require('../lib/stackman')

var logger = {
  error () {},
  warn () {},
  info () {},
  debug () {}
}

test('#parseMessage()', function (t) {
  t.test('should parse string', function (t) {
    var data = parsers.parseMessage('Howdy')
    t.deepEqual(data, { log: { message: 'Howdy' } })
    t.end()
  })

  t.test('should parse object', function (t) {
    var data = parsers.parseMessage({ message: 'foo%s', params: ['bar'] })
    t.deepEqual(data, { log: { message: 'foobar', param_message: 'foo%s' } })
    t.end()
  })

  t.test('should parse an invalid object', function (t) {
    var data = parsers.parseMessage({ foo: /bar/ })
    t.deepEqual(data, { log: { message: '{ foo: /bar/ }' } })
    t.end()
  })

  t.test('should parse null', function (t) {
    var data = parsers.parseMessage(null)
    t.deepEqual(data, { log: { message: 'null' } })
    t.end()
  })
})

test('#getContextFromResponse()', function (t) {
  t.test('for error (before headers)', function (t) {
    onRequest(function (req, res) {
      req.on('end', function () {
        t.end()
      })

      res.sendDate = false

      var context = parsers.getContextFromResponse(res, { captureHeaders: true }, true)
      t.deepEqual(context, {
        status_code: 200,
        headers: {},
        headers_sent: false,
        finished: false
      })

      res.end()
    })
  })

  t.test('for error (after headers)', function (t) {
    onRequest(function (req, res) {
      req.on('end', function () {
        t.end()
      })

      res.sendDate = false
      res.write('foo')

      var context = parsers.getContextFromResponse(res, { captureHeaders: true }, true)
      t.deepEqual(context, {
        status_code: 200,
        headers: { connection: 'close', 'transfer-encoding': 'chunked' },
        headers_sent: true,
        finished: false
      })

      res.end()
    })
  })

  t.test('for error (request finished)', function (t) {
    onRequest(function (req, res) {
      req.on('end', function () {
        var context = parsers.getContextFromResponse(res, { captureHeaders: true }, true)
        t.deepEqual(context, {
          status_code: 200,
          headers: { connection: 'close', 'content-length': '0' },
          headers_sent: true,
          finished: true
        })
        t.end()
      })

      res.sendDate = false

      res.end()
    })
  })

  t.test('for transaction', function (t) {
    onRequest(function (req, res) {
      req.on('end', function () {
        var context = parsers.getContextFromResponse(res, { captureHeaders: true }, false)
        t.deepEqual(context, {
          status_code: 200,
          headers: { connection: 'close', 'content-length': '0' }
        })
        t.end()
      })
      res.sendDate = false
      res.end()
    })
  })
})

test('#getContextFromRequest()', function (t) {
  t.test('should parse a request object', function (t) {
    var conf = { captureHeaders: true, captureBody: 'off' }
    var parsed = parsers.getContextFromRequest(getMockReq(), conf)
    t.deepEqual(parsed, {
      http_version: '1.1',
      method: 'GET',
      url: {
        hostname: 'example.com',
        pathname: '/some/path',
        search: '?key=value',
        full: 'http://example.com/some/path?key=value',
        protocol: 'http:',
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

  t.test('full URI', function (t) {
    var req = getMockReq()
    req.url = 'https://www.example.com:8080/some/path?key=value'
    var parsed = parsers.getContextFromRequest(req, {})
    t.deepEqual(parsed.url, {
      pathname: '/some/path',
      search: '?key=value',
      protocol: 'https:',
      hostname: 'www.example.com',
      port: '8080',
      full: 'https://www.example.com:8080/some/path?key=value',
      raw: 'https://www.example.com:8080/some/path?key=value'
    })
    t.end()
  })

  t.test('port in host header', function (t) {
    var req = getMockReq()
    req.headers.host = 'example.com:8080'
    var parsed = parsers.getContextFromRequest(req, {})
    t.deepEqual(parsed.url, {
      hostname: 'example.com',
      port: '8080',
      pathname: '/some/path',
      search: '?key=value',
      protocol: 'http:',
      full: 'http://example.com:8080/some/path?key=value',
      raw: '/some/path?key=value'
    })
    t.end()
  })

  t.test('empty query string', function (t) {
    var req = getMockReq()
    req.url = '/some/path?'
    var parsed = parsers.getContextFromRequest(req, {})
    t.deepEqual(parsed.url, {
      hostname: 'example.com',
      pathname: '/some/path',
      search: '?',
      protocol: 'http:',
      full: 'http://example.com/some/path?',
      raw: '/some/path?'
    })
    t.end()
  })

  t.test('should slice too large body\'s', function (t) {
    var conf = { captureBody: 'all' }
    var req = getMockReq()
    req.body = ''
    for (var n = 0; n < parsers._MAX_HTTP_BODY_CHARS + 10; n++) {
      req.body += 'x'
    }
    req.headers['content-length'] = String(req.body.length)
    var parsed = parsers.getContextFromRequest(req, conf)
    t.strictEqual(parsed.body.length, parsers._MAX_HTTP_BODY_CHARS)
    t.end()
  })

  t.test('should not log body if opts.body is false', function (t) {
    var conf = { captureBody: 'off' }
    var req = getMockReq()
    req.body = 'secret stuff'
    req.headers['content-length'] = String(req.body.length)
    var parsed = parsers.getContextFromRequest(req, conf)
    t.strictEqual(parsed.body, '[REDACTED]')
    t.end()
  })

  t.test('body is object', function (t) {
    var conf = { captureBody: 'all' }
    var req = getMockReq()
    req.body = { foo: 42 }
    req.headers['content-length'] = JSON.stringify(req.body).length
    var parsed = parsers.getContextFromRequest(req, conf)
    t.deepEqual(parsed.body, JSON.stringify({ foo: 42 }))
    t.end()
  })

  t.test('body is object, but too large', function (t) {
    var conf = { captureBody: 'all' }
    var req = getMockReq()
    req.body = { foo: '' }
    for (var n = 0; n < parsers._MAX_HTTP_BODY_CHARS + 10; n++) {
      req.body.foo += 'x'
    }
    req.headers['content-length'] = JSON.stringify(req.body).length
    var parsed = parsers.getContextFromRequest(req, conf)
    t.strictEqual(typeof parsed.body, 'string')
    t.strictEqual(parsed.body.length, parsers._MAX_HTTP_BODY_CHARS)
    t.strictEqual(parsed.body.slice(0, 10), '{"foo":"xx')
    t.end()
  })

  t.test('body is object, but not safe to stringify', function (t) {
    var conf = { captureBody: 'all' }
    var req = getMockReq()
    req.body = { foo: 42 }
    req.body.bar = req.body
    req.headers['transfer-encoding'] = 'chunked'
    var parsed = parsers.getContextFromRequest(req, conf)
    t.deepEqual(parsed.body, JSON.stringify({ foo: 42, bar: '[Circular]' }))
    t.end()
  })

  t.test('body is an array', function (t) {
    var conf = { captureBody: 'all' }
    var req = getMockReq()
    req.body = [{ foo: 42 }]
    req.headers['content-length'] = JSON.stringify(req.body).length
    var parsed = parsers.getContextFromRequest(req, conf)
    t.deepEqual(parsed.body, JSON.stringify([{ foo: 42 }]))
    t.end()
  })

  function getMockReq () {
    return {
      httpVersion: '1.1',
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
  }
})

test('#parseError()', function (t) {
  t.test('should parse plain Error object', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    parsers.parseError(new Error(), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, '')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse Error with message', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    parsers.parseError(new Error('Crap'), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, 'Crap')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse TypeError with message', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    parsers.parseError(new TypeError('Crap'), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, 'Crap')
      t.strictEqual(parsed.exception.type, 'TypeError')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse thrown Error', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    try {
      throw new Error('Derp')
    } catch (e) {
      parsers.parseError(e, true, fakeAgent, function (err, parsed) {
        t.error(err)
        t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
        t.notOk('log' in parsed)
        t.ok('exception' in parsed)
        t.strictEqual(parsed.exception.message, 'Derp')
        t.strictEqual(parsed.exception.type, 'Error')
        t.notOk('code' in parsed.exception)
        t.notOk('handled' in parsed.exception)
        t.notOk('attributes' in parsed.exception)
        t.ok('stacktrace' in parsed.exception)
        t.ok(parsed.exception.stacktrace.length > 0)
        t.end()
      })
    }
  })

  t.test('should parse caught real error', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    try {
      var o = {}
      o['...'].Derp()
    } catch (e) {
      parsers.parseError(e, true, fakeAgent, function (err, parsed) {
        t.error(err)
        t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
        t.notOk('log' in parsed)
        t.ok('exception' in parsed)
        t.strictEqual(parsed.exception.message, 'Cannot read property \'Derp\' of undefined')
        t.strictEqual(parsed.exception.type, 'TypeError')
        t.notOk('code' in parsed.exception)
        t.notOk('handled' in parsed.exception)
        t.notOk('attributes' in parsed.exception)
        t.ok('stacktrace' in parsed.exception)
        t.ok(parsed.exception.stacktrace.length > 0)
        t.end()
      })
    }
  })

  t.test('should gracefully handle .stack already being accessed', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    var err = new Error('foo')
    t.ok(typeof err.stack === 'string')
    parsers.parseError(err, true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, 'foo')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      t.end()
    })
  })

  t.test('should parse errors whose .stack is overwritten', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    var err = new Error('foo')
    err.stack = 'foo'
    parsers.parseError(err, true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.ok('culprit' in parsed)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, 'foo')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(frame => {
        t.ok('abs_path' in frame)
        t.ok('filename' in frame)
        t.ok('function' in frame)
        t.ok('lineno' in frame)
        t.ok('library_frame' in frame)
      })
      t.end()
    })
  })

  t.test('should gracefully handle errors with .originalError property', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    var err = new Error('error with originalError')
    err.stack = ''
    err.originalError = {
      message: 'foo',
      stack: 'original stack'
    }
    parsers.parseError(err, true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, 'original stack')
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, 'error with originalError')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(frame => {
        t.ok('abs_path' in frame)
        t.ok('filename' in frame)
        t.ok('function' in frame)
        t.ok('lineno' in frame)
        t.ok('library_frame' in frame)
      })
      t.end()
    })
  })

  t.test('should handle captureAttributes', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }

    var err = new Error('boom')
    err.stack = ''
    err.aProperty = 'this is my property'

    // captureAttributes=true
    parsers.parseError(err, true, fakeAgent, function (parseErr1, parsed) {
      t.error(parseErr1)
      t.ok('exception' in parsed)
      t.ok('attributes' in parsed.exception)
      t.strictEqual(parsed.exception.attributes.aProperty, 'this is my property')

      // captureAttributes=false
      parsers.parseError(err, false, fakeAgent, function (parseErr2, parsed) {
        t.error(parseErr2)
        t.ok('exception' in parsed)
        t.notOk('attributes' in parsed.exception,
          'should not have captured any attributes')

        t.end()
      })
    })
  })

  t.test('should be able to exclude source context data', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 0,
        sourceLinesErrorLibraryFrames: 0
      },
      logger: logger
    }
    parsers.parseError(new Error(), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.strictEqual(parsed.culprit, `Test.<anonymous> (${path.join('test', 'parsers.js')})`)
      t.notOk('log' in parsed)
      t.ok('exception' in parsed)
      t.strictEqual(parsed.exception.message, '')
      t.strictEqual(parsed.exception.type, 'Error')
      t.notOk('code' in parsed.exception)
      t.notOk('handled' in parsed.exception)
      t.notOk('attributes' in parsed.exception)
      t.ok('stacktrace' in parsed.exception)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(function (callsite) {
        t.ok('filename' in callsite)
        t.ok('lineno' in callsite)
        t.ok('function' in callsite)
        t.ok('library_frame' in callsite)
        t.ok('abs_path' in callsite)
        t.notOk('pre_context' in callsite)
        t.notOk('context_line' in callsite)
        t.notOk('post_context' in callsite)
      })
      t.end()
    })
  })

  t.test('should be able to exclude source context data for library frames only', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 5,
        sourceLinesErrorLibraryFrames: 0
      },
      logger: logger
    }
    parsers.parseError(new Error(), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(function (callsite) {
        if (callsite.library_frame) {
          t.notOk('pre_context' in callsite)
          t.notOk('context_line' in callsite)
          t.notOk('post_context' in callsite)
        } else {
          t.ok(Array.isArray(callsite.pre_context))
          t.strictEqual(callsite.pre_context.length, 2)
          t.strictEqual(typeof callsite.context_line, 'string')
          t.ok(callsite.context_line.length > 0)
          t.ok(Array.isArray(callsite.post_context))
          t.strictEqual(callsite.post_context.length, 2)
        }
      })
      t.end()
    })
  })

  t.test('should be able to exclude source context data for in-app frames only', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 0,
        sourceLinesErrorLibraryFrames: 5
      },
      logger: logger
    }
    parsers.parseError(new Error(), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(function (callsite) {
        var nodeCore = callsite.abs_path.indexOf(path.sep) === -1
        if (callsite.library_frame && !nodeCore) {
          t.ok(Array.isArray(callsite.pre_context))
          t.strictEqual(callsite.pre_context.length, 2)
          t.strictEqual(typeof callsite.context_line, 'string')
          t.ok(callsite.context_line.length > 0)
          t.ok(Array.isArray(callsite.post_context))
          t.strictEqual(callsite.post_context.length, 2)
        } else {
          t.notOk('pre_context' in callsite)
          t.notOk('context_line' in callsite)
          t.notOk('post_context' in callsite)
        }
      })
      t.end()
    })
  })

  t.test('should be able to choose number of source context line per frame type', function (t) {
    var fakeAgent = {
      _conf: {
        sourceLinesErrorAppFrames: 3,
        sourceLinesErrorLibraryFrames: 6
      },
      logger: logger
    }
    parsers.parseError(new Error(), true, fakeAgent, function (err, parsed) {
      t.error(err)
      t.ok(parsed.exception.stacktrace.length > 0)
      parsed.exception.stacktrace.forEach(function (callsite) {
        var nodeCore = callsite.abs_path.indexOf(path.sep) === -1
        if (nodeCore) {
          t.notOk('pre_context' in callsite)
          t.notOk('context_line' in callsite)
          t.notOk('post_context' in callsite)
        } else if (callsite.library_frame) {
          t.ok(Array.isArray(callsite.pre_context))
          t.strictEqual(callsite.pre_context.length, 3)
          t.strictEqual(typeof callsite.context_line, 'string')
          t.ok(callsite.context_line.length > 0)
          t.ok(Array.isArray(callsite.post_context))
          t.strictEqual(callsite.post_context.length, 2)
        } else {
          t.ok(Array.isArray(callsite.pre_context))
          t.strictEqual(callsite.pre_context.length, 1)
          t.strictEqual(typeof callsite.context_line, 'string')
          t.ok(callsite.context_line.length > 0)
          t.ok(Array.isArray(callsite.post_context))
          t.strictEqual(callsite.post_context.length, 1)
        }
      })
      t.end()
    })
  })
})

test('#parseCallsite()', function (t) {
  var cases = [
    { isApp: true, isError: true, lines: 0 },
    { isApp: true, isError: true, lines: 1 },
    { isApp: true, isError: true, lines: 2 },
    { isApp: true, isError: true, lines: 3 },
    { isApp: true, isError: true, lines: 4 },
    { isApp: true, isError: true, lines: 5 },
    { isApp: true, isError: false, lines: 0 },
    { isApp: true, isError: false, lines: 1 },
    { isApp: true, isError: false, lines: 2 },
    { isApp: true, isError: false, lines: 3 },
    { isApp: true, isError: false, lines: 4 },
    { isApp: true, isError: false, lines: 5 },
    { isApp: false, isError: true, lines: 0 },
    { isApp: false, isError: true, lines: 1 },
    { isApp: false, isError: true, lines: 2 },
    { isApp: false, isError: true, lines: 3 },
    { isApp: false, isError: true, lines: 4 },
    { isApp: false, isError: true, lines: 5 },
    { isApp: false, isError: false, lines: 0 },
    { isApp: false, isError: false, lines: 1 },
    { isApp: false, isError: false, lines: 2 },
    { isApp: false, isError: false, lines: 3 },
    { isApp: false, isError: false, lines: 4 },
    { isApp: false, isError: false, lines: 5 }
  ]

  cases.forEach(function (opts) {
    t.test('#parseCallsite() ' + JSON.stringify(opts), function (t) {
      validateParseCallsite(t, opts)
    })
  })
})

function validateParseCallsite (t, opts) {
  // before 2
  // before 1
  var err = new Error()
  // after 1
  // after 2

  switch (opts.lines) {
    case 1:
      opts.pre = []
      opts.line = '  var err = new Error()'
      opts.post = []
      break
    case 2:
      opts.pre = ['  // before 1']
      opts.line = '  var err = new Error()'
      opts.post = []
      break
    case 3:
      opts.pre = ['  // before 1']
      opts.line = '  var err = new Error()'
      opts.post = ['  // after 1']
      break
    case 4:
      opts.pre = ['  // before 2', '  // before 1']
      opts.line = '  var err = new Error()'
      opts.post = ['  // after 1']
      break
    case 5:
      opts.pre = ['  // before 2', '  // before 1']
      opts.line = '  var err = new Error()'
      opts.post = ['  // after 1', '  // after 2']
      break
  }

  var conf = {
    sourceLinesErrorAppFrames: opts.isError && opts.isApp ? opts.lines : 10,
    sourceLinesErrorLibraryFrames: opts.isError && !opts.isApp ? opts.lines : 10,
    sourceLinesSpanAppFrames: !opts.isError && opts.isApp ? opts.lines : 10,
    sourceLinesSpanLibraryFrames: !opts.isError && !opts.isApp ? opts.lines : 10
  }

  var agent = {
    _conf: conf,
    logger: logger
  }

  stackman.callsites(err, function (err, callsites) {
    t.error(err)
    var callsite = callsites[0]
    callsite.isApp = function () { return opts.isApp }
    parsers.parseCallsite(callsite, opts.isError, agent, function (err, frame) {
      t.error(err)
      t.strictEqual(frame.filename, callsite.getRelativeFileName(), 'should have expected frame filename')
      t.strictEqual(frame.lineno, callsite.getLineNumber(), 'should have expected frame lineno')
      t.strictEqual(frame.function, callsite.getFunctionNameSanitized(), 'should have expected frame function')
      t.strictEqual(frame.library_frame, !callsite.isApp(), 'should have expected frame library_frame')
      t.strictEqual(frame.abs_path, callsite.getFileName(), 'should have expected frame abs_path')
      t.deepEqual(frame.pre_context, opts.pre, opts.pre
        ? 'should have expected frame pre_context'
        : 'should not have a frame pre_context')
      t.strictEqual(frame.context_line, opts.line, opts.line
        ? 'should have expected frame context_line'
        : 'should not have a frame context_line')
      t.deepEqual(frame.post_context, opts.post, opts.post
        ? 'should have expected frame post_context'
        : 'should not have a frame post_context')
      t.end()
    })
  })
}

function onRequest (cb) {
  var server = http.createServer(cb)

  server.listen(function () {
    var opts = {
      port: server.address().port
    }
    var req = http.request(opts, function (res) {
      res.on('end', function () {
        server.close()
      })
      res.resume()
    })
    req.end()
  })
}
