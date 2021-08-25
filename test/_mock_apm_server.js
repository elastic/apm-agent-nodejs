// A mock APM server to use in tests.
//
// Usage:
//    const server = new MockAPMServer()
//    server.start(function (serverUrl) {
//      // Test code using `serverUrl`...
//      // - Events received on the intake API will be on `server.events`.
//      // - Raw request data is on `server.requests`.
//      // - Call `server.close()` when done.
//    })

const http = require('http')
const { URL } = require('url')
const zlib = require('zlib')

class MockAPMServer {
  constructor () {
    this.events = []
    this.requests = []
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
      this.requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body
      })
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

module.exports = {
  MockAPMServer
}
