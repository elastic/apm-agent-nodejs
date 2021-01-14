'use strict'

// A lib that provides a slightly enhanced method for making an HTTP request.

const { URL } = require('url')

// A wrapper around `{http|https}.request()` that adds support for a connection
// timeout separate from the existing `options.timeout`.
//
// The existing `options.timeout` to `http.request()` sets `socket.setTimeout()`
// which will emit the 'timeout' event if there is an period of socket idleness
// that is this long. In practice for short-lived requests, it is a timeout on
// getting the start of response data back from the server.
//
// The new `opts.connectTimeout` is a number of milliseconds count from socket
// creation to socket 'connect'. If this time is reached a 'connectTimeout'
// event will be emitted on the request object. As with 'timeout', it is up
// to the caller to handle destroying the request. See "Usage" below.
// In pratice this allows for a shorter timeout to see if the remote server
// is handling connections in a timely manner. To be useful, a `connectTimeout`
// is typically shorter than a given `timeout`.
//
// Note on call signature:
//
// Currenly this only supports the one signature:
//      httpRequest(url: String, opts?: Object, cb?: Function)
// rather than the three signatures (and 25 lines of argument normalization)
// that core `http.request()` supports. If we need the other signatures we
// can add them later.
//
// Usage:
//    const { httpRequest } = require('./http-request')
//
//    var req = httpRequest(url, {
//        connectTimeout: connectTimeout,
//        // Any {http|https}.request options...
//        timeout: timeout
//    }, function onRes(res) {
//        // Handling of the response...
//    })
//
//    // For both 'timeout' and 'connectTimeout', it is the responsibility
//    // of the caller to abort the request to clean up.
//    //
//    // This `req.destroy()` has the side-effect of self-induced
//    // "socket hang up" error event, so typically an 'error' event handler
//    // is also required. One technique is to pass a specific error to
//    // `req.destroy(...)` that can be inspected in the 'error' event handler.
//    req.on('timeout', function () {
//        // ...
//        req.destroy(new Error('got timeout'))
//    });
//
//    req.on('connectTimeout', function () {
//        // ...
//        req.destroy(new Error('got connectTimeout'))
//    });
//
//    req.on('error', function (err) {
//        // ...
//    })
//
//     req.end()
//
function httpRequest (url, opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  const {
    connectTimeout,
    ...reqOpts
  } = opts

  // http or https
  const protocol = reqOpts.protocol || (new URL(url)).protocol
  let proto
  if (protocol === 'http:') {
    proto = require('http')
  } else if (protocol === 'https:') {
    proto = require('https')
  } else {
    throw new Error(`unsupported protocol: "${protocol}"`)
  }

  const req = proto.request(url, reqOpts, cb)

  if (connectTimeout) {
    // Handle a connection timeout with a timer starting when the request
    // socket is *created* ("socket" event) and ending when the socket
    // is connected.
    req.on('socket', function (socket) {
      // log.trace({url: url}, 'start connectTimeout')
      var connectTimer = setTimeout(function onConnectTimeout () {
        // log.trace({url: url}, 'connectTimeout')
        req.emit('connectTimeout')
      }, connectTimeout)

      socket.on('connect', function () {
        // log.trace({url: url}, 'socket connected, clear connectTimeout')
        clearTimeout(connectTimer)
        connectTimer = null
      })
      socket.on('close', function () {
        if (connectTimer) {
          // log.trace({url: url}, 'socket close with active connectTimer, clear connectTimeout')
          clearTimeout(connectTimer)
        }
      })
    })
  }

  return req
}

module.exports = {
  httpRequest
}

// ---- mainline

// This main is only intended to demonstrate usage of this lib; not to be a
// useful tool.
//
// Example:
//      node http-request.js https://www.elastic.co 100 1000 > elastic.html
//
// Example: download a ~1GB file, requiring a 30ms connect time, 2s idle timeout
//      node http-request.js http://mirror.uoregon.edu/ubuntu-releases/20.04/ubuntu-20.04.1-live-server-amd64.iso 30 2000 > ubuntu.iso
//
// Example: connect timeout because google port 81 drops TCP SYN packets:
//      node http-request.js http://www.google.com:81/foo 1000 10000
//
// Example: use `NODE_DEBUG=*` to see internal node debugging details
//      NODE_DEBUG=* node http-request.js $url 30 1000
//
// Example: quick connection, slow response
//      % cat server.js
//      var http = require('http');
//      http.createServer(function (req, res) {
//          console.log('SERVER: got request')
//          setTimeout((function() {
//              res.writeHead(200, {'Content-Type': 'text/plain'});
//              res.write('line one\n')
//              setTimeout((function() {
//                  res.write('line two\n')
//                  setTimeout((function() {
//                      res.write('line three\n')
//                      res.end()
//                      console.log('SERVER: responded')
//                  }), 500);
//              }), 500);
//          }), 500);
//      }).listen(8080);
//      % node server.js &
//      % node http-request.js http://127.0.0.1:8080/ 10 1000
function main (argv) {
  if (argv.length !== 5) {
    process.stderr.write('http-request: error: incorrect number of args\n')
    process.stderr.write('usage: http-request $url $connectTimeoutMs $timeoutMs\n')
    process.exitCode = 1
    return
  }
  const url = argv[2]
  const connectTimeout = Number(argv[3])
  const timeout = Number(argv[4])

  var req = httpRequest(url, {
    timeout: timeout,
    connectTimeout: connectTimeout
    // TODO: log support
  }, function onRes (res) {
    res.pipe(process.stdout)
  })

  req.on('timeout', function () {
    console.warn(`http-request: response timeout (${timeout}ms): destroying request`)
    req.destroy(new Error('got timeout event'))
    process.exitCode = 28 // using cURL's errno for a timeout
  })

  req.on('connectTimeout', function () {
    console.warn(`http-request: connect timeout (${connectTimeout}ms): destroying request`)
    req.destroy(new Error('got connectTimeout event'))
    process.exitCode = 28 // using cURL's errno for a timeout
  })

  req.on('error', function (err) {
    console.warn('http-request: request error:', err)
    process.exitCode = 1
  })

  req.end()
}

if (require.main === module) {
  main(process.argv)
}
