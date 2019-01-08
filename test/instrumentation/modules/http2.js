'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  captureExceptions: false
})
var ins = agent._instrumentation

var semver = require('semver')

// The http2 module wasn't included before Node.js v8.4.0
if (semver.lt(process.version, '8.4.0')) process.exit()

var fs = require('fs')
var http2 = require('http2')

var test = require('tape')
var pem = require('https-pem')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

var isSecure = [false, true]
isSecure.forEach(secure => {
  var method = secure ? 'createSecureServer' : 'createServer'

  test(`http2.${method} compatibility mode`, t => {
    resetAgent((data) => {
      assert(t, data, secure, port)
      server.close()
      t.end()
    })

    function onRequest (req, res) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      res.writeHead(200, {
        'content-type': 'text/plain'
      })
      res.end('foo')
    }

    var port
    var server = secure
      ? http2.createSecureServer(pem, onRequest)
      : http2.createServer(onRequest)

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.listen(() => {
      port = server.address().port
      var client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, 'foo')
      req.resume()
      req.on('end', () => client.destroy())
      req.end()
    })
  })

  test(`http2.${method} stream respond`, t => {
    resetAgent((data) => {
      assert(t, data, secure, port)
      server.close()
      t.end()
    })

    var port
    var server = secure
      ? http2.createSecureServer(pem)
      : http2.createServer()

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.on('stream', function (stream, headers) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      stream.respond({
        'content-type': 'text/plain',
        ':status': 200
      })
      stream.end('foo')
    })

    server.listen(() => {
      port = server.address().port
      var client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, 'foo')
      req.resume()
      req.on('end', () => client.destroy())
      req.end()
    })
  })

  test(`http2.${method} stream respondWithFD`, t => {
    resetAgent((data) => {
      assert(t, data, secure, port)
      server.close()
      t.end()
    })

    var port
    var server = secure
      ? http2.createSecureServer(pem)
      : http2.createServer()

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.on('stream', function (stream, headers) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      fs.open(__filename, 'r', function (err, fd) {
        t.error(err)

        stream.respondWithFD(fd, {
          ':status': 200,
          'content-type': 'text/plain'
        })

        stream.on('close', function () {
          fs.close(fd, function () {})
        })
      })
    })

    server.listen(() => {
      port = server.address().port
      var client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, fs.readFileSync(__filename).toString())
      req.resume()
      req.on('end', () => client.destroy())
      req.end()
    })
  })

  test(`http2.${method} stream respondWithFile`, t => {
    resetAgent((data) => {
      assert(t, data, secure, port)
      server.close()
      t.end()
    })

    var port
    var server = secure
      ? http2.createSecureServer(pem)
      : http2.createServer()

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.on('stream', function (stream, headers) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      stream.respondWithFile(__filename, {
        ':status': 200,
        'content-type': 'text/plain'
      })
    })

    server.listen(() => {
      port = server.address().port
      var client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, fs.readFileSync(__filename).toString())
      req.resume()
      req.on('end', () => client.destroy())
      req.end()
    })
  })

  test(`http2.${method} ignore push streams`, t => {
    addShouldCall(t)

    var done = after(3, () => {
      client.destroy()
      t.end()
    })

    resetAgent((data) => {
      assert(t, data, secure, port)
      server.close()
      done()
    })

    var port
    var client
    var server = secure
      ? http2.createSecureServer(pem)
      : http2.createServer()

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.on('stream', function (stream, headers) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      function onPushStream (stream, headers) {
        stream.respond({
          'content-type': 'text/plain',
          ':status': 200
        })
        stream.end('some pushed data')
        done()
      }

      stream.pushStream({ ':path': '/pushed' }, t.shouldCall(
        semver.lt(process.version, '8.11.2-rc')
          ? onPushStream
          : (err, pushStream, headers) => {
            t.error(err)
            onPushStream(pushStream, headers)
          }
      ))

      stream.respond({
        'content-type': 'text/plain',
        ':status': 200
      })
      stream.end('foo')
    })

    server.listen(() => {
      port = server.address().port
      client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      // Receive push stream
      client.on('stream', t.shouldCall((stream, headers, flags) => {
        t.equal(headers[':path'], '/pushed')
        assertResponse(t, stream, 'some pushed data', done)
      }))

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, 'foo')
      req.end()
    })
  })

  test(`http2.request${secure ? ' secure' : ' '}`, t => {
    resetAgent(3, (data) => {
      t.equal(data.transactions.length, 2)
      t.equal(data.spans.length, 1)

      var sub = data.transactions[0]
      assertPath(t, sub, secure, port, '/sub')

      var root = data.transactions[1]
      assertPath(t, root, secure, port, '/')

      var span = findObjInArray(data.spans, 'transaction_id', root.id)
      t.ok(span, 'root transaction should have span')
      t.equal(span.type, 'ext')
      t.equal(span.subtype, 'http2')
      t.notOk(span.action)
      t.equal(span.name, `undefined http${secure ? 's' : ''}://localhost:${port}/sub`)

      server.close()
      t.end()
    })

    var port
    var server = secure
      ? http2.createSecureServer(pem)
      : http2.createServer()

    var onError = err => t.error(err)
    server.on('error', onError)
    server.on('socketError', onError)

    server.on('stream', function (stream, headers) {
      var trans = ins.currentTransaction
      t.ok(trans, 'have current transaction')
      t.equal(trans.type, 'request')

      if (headers[':path'] === '/') {
        var client = connect(secure, port)
        client.on('error', onError)
        client.on('socketError', onError)

        stream.respond({
          'content-type': 'text/plain',
          ':status': 200
        })

        var req = client.request({ ':path': '/sub' })
        req.on('end', () => client.destroy())
        req.pipe(stream)
      } else {
        stream.respond({
          'content-type': 'text/plain',
          ':status': 200
        })
        stream.end('foo')
      }
    })

    server.listen(() => {
      port = server.address().port
      var client = connect(secure, port)
      client.on('error', onError)
      client.on('socketError', onError)

      var req = client.request({ ':path': '/' })
      assertResponse(t, req, 'foo')
      req.resume()
      req.on('end', () => client.destroy())
      req.end()
    })
  })
})

var matchId = /^[\da-f]{16}$/

function assertPath (t, trans, secure, port, path) {
  t.ok(trans)
  t.ok(matchId.test(trans.id))
  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.type, 'request')
  t.equal(trans.result, 'HTTP 2xx')
  t.ok(trans.duration > 0)
  t.ok(trans.timestamp > 0)

  t.deepEqual(trans.context.request, {
    http_version: '2.0',
    method: 'GET',
    url: {
      raw: path,
      protocol: 'http:',
      pathname: path
    },
    socket: {
      remote_address: '::ffff:127.0.0.1',
      encrypted: secure
    },
    headers: {
      ':scheme': secure ? 'https' : 'http',
      ':authority': `localhost:${port}`,
      ':method': 'GET',
      ':path': path
    }
  })

  t.deepEqual(trans.context.response, {
    status_code: 200,
    headers: {
      'content-type': 'text/plain',
      ':status': 200
    }
  })
}

function assert (t, data, secure, port) {
  t.equal(data.transactions.length, 1)
  t.equal(data.spans.length, 0)

  // Top-level props of the transaction need to be checked individually
  // because there are a few dynamic properties
  var trans = data.transactions[0]
  assertPath(t, trans, secure, port, '/')
}

function assertResponse (t, stream, expected, done) {
  const chunks = []
  stream.on('data', function (chunk) {
    chunks.push(chunk)
  })
  stream.on('end', function () {
    t.equal(Buffer.concat(chunks).toString(), expected, 'should have expected body')
    if (done) done()
  })
}

function connect (secure, port) {
  var proto = secure ? 'https' : 'http'
  var opts = { rejectUnauthorized: false }
  return http2.connect(`${proto}://localhost:${port}`, opts)
}

function resetAgent (expected, cb) {
  if (typeof expected === 'function') return resetAgent(1, expected)
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expected, cb)
}

function addShouldCall (t) {
  var calls = []
  var realEnd = t.end

  t.end = function end () {
    for (var i = 0; i < calls.length; i++) {
      t.equal(calls[i].called, true, 'should have called function')
    }
    return realEnd.apply(this, arguments)
  }

  t.shouldCall = function shouldCall (fn) {
    var record = { called: false }
    calls.push(record)
    return function shouldCallWrap () {
      record.called = true
      return fn.apply(this, arguments)
    }
  }
}

function after (n, fn) {
  return function () {
    --n || fn()
  }
}
