// A mock APM server to use in tests.
//
// Usage:
//    const server = new MockAPMServer()
//    server.start(function (serverUrl) {
//      // Test code using `serverUrl`...
//      // - Events received on the intake API will be on `server.events`.
//      // - Call `server.close()` when done.
//    })

const http = require('http')
const { URL } = require('url')
const zlib = require('zlib')

class MockAPMServer {
  constructor () {
    this.events = []
    this.serverUrl = null // set in .start()
    this._http = http.createServer(this._onRequest.bind(this))
  }

  _onRequest (req, res) {
    var parsedUrl = new URL(req.url, this.serverUrl)
    var instream = req
    if (req.headers['content-encoding'] === 'gzip') {
      instream = req.pipe(zlib.createGunzip())
    } else {
      instream.setEncoding('utf8')
    }

    let body = ''
    instream.on('data', (chunk) => {
      body += chunk
    })

    instream.on('end', () => {
      let resBody = ''
      if (parsedUrl.pathname === '/config/v1/agents') {
        // Central config mocking.
        res.writeHead(200)
        resBody = '{}'
      } else if (req.method === 'POST' && parsedUrl.pathname === '/intake/v2/events') {
        body
          .split(/\n/g) // parse each line
          .filter(line => line.trim()) // ... if it is non-empty
          .forEach(line => {
            this.events.push(JSON.parse(line)) // ... append to this.events
          })
        resBody = '{}'
        res.writeHead(202)
      } else {
        res.writeHead(404)
      }
      res.end(resBody)
    })
  }

  // Start listening and callback with `cb(serverUrl)`.
  start (cb) {
    return this._http.listen(() => {
      this.serverUrl = `http://localhost:${this._http.address().port}`
      cb(this.serverUrl)
    })
  }

  close () {
    return this._http.close()
  }
}

// const server = http.createServer(function (req, res) {
//   const parsedStream = req.pipe(zlib.createGunzip()).pipe(ndjson.parse())
//   let n = 0
//   parsedStream.on('data', function (obj) {
//     switch (n) {
//       case 0:
//         t.ok(obj.metadata, 'APM server got metadata obj')
//         break
//       case 1:
//         t.ok(obj.error, 'APM server got error obj')
//         theError = obj.error
//         break
//       default:
//         t.fail('APM server got unexpected intake obj: ' + obj)
//         break
//     }
//     n++
//   })
//   parsedStream.on('end', function () {
//     res.end()
//   })
// })

module.exports = {
  MockAPMServer
}
