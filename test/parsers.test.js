'use strict'

var http = require('http')

var test = require('tape')

var parsers = require('../lib/parsers')

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

  t.test('body is a Buffer', function (t) {
    const conf = { captureBody: 'all' }
    const requestPropsToTest = ['body', 'json', 'payload']
    for (const [, prop] of requestPropsToTest.entries()) {
      const req = getMockReq()
      req[prop] = Buffer.from('almost, but not quite, entirely unlike a string.')
      req.headers['content-length'] = req[prop].length
      const parsed = parsers.getContextFromRequest(req, conf)
      t.equals(parsed.body, '<Buffer>')
    }
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
