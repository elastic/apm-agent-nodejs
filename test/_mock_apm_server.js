/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A mock APM server to use in tests.
// It also has an option to attempt to behave like the Elastic Lambda extension.
//
// Usage:
//    const server = new MockAPMServer(opts)
//    server.start(function (serverUrl) {
//      // Test code using `serverUrl`...
//      // - Events received on the intake API will be on `server.events`.
//      // - Raw request data is on `server.requests`.
//      // - Use `server.clear()` to clear `server.events` and `server.requests`
//      //   for re-use of the mock server in multiple test cases.
//      // - Call `server.close()` when done.
//    })

const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');

class MockAPMServer {
  /**
   * @param {object} opts
   *    - {string} opts.apmServerVersion - The version to report in the `GET /`
   *      response body. Defaults to "8.0.0".
   *    - {boolean} opts.mockLambdaExtension - Default false. If enabled then
   *      this will add some behaviour expected of APM Lambda extension, e.g.
   *      responding to the `POST /register/transaction` endpoint.
   */
  constructor(opts) {
    opts = opts || {};
    this.clear();
    this.serverUrl = null; // set in .start()
    this._apmServerVersion = opts.apmServerVersion || '8.0.0';
    this._mockLambdaExtension = !!opts.mockLambdaExtension;
    this._http = http.createServer(this._onRequest.bind(this));
  }

  clear() {
    this.events = [];
    this.requests = [];
  }

  _onRequest(req, res) {
    var parsedUrl = new URL(req.url, this.serverUrl);
    var instream = req;
    if (req.headers['content-encoding'] === 'gzip') {
      instream = req.pipe(zlib.createGunzip());
    } else {
      instream.setEncoding('utf8');
    }

    let body = '';
    instream.on('data', (chunk) => {
      body += chunk;
    });

    instream.on('end', () => {
      let resBody = '';
      if (req.method === 'GET' && parsedUrl.pathname === '/') {
        // https://www.elastic.co/guide/en/apm/server/current/server-info.html#server-info-endpoint
        res.writeHead(200);
        resBody = JSON.stringify({
          build_date: '2021-09-16T02:05:39Z',
          build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
          version: this._apmServerVersion,
        });
      } else if (parsedUrl.pathname === '/config/v1/agents') {
        // Central config mocking.
        res.writeHead(200);
        resBody = '{}';
      } else if (
        req.method === 'POST' &&
        parsedUrl.pathname === '/intake/v2/events'
      ) {
        body
          .split(/\n/g) // parse each line
          .filter((line) => line.trim()) // ... if it is non-empty
          .forEach((line) => {
            this.events.push(JSON.parse(line)); // ... append to this.events
          });
        resBody = '{}';
        res.writeHead(202);
      } else if (
        this._mockLambdaExtension &&
        req.method === 'POST' &&
        parsedUrl.pathname === '/register/transaction'
      ) {
        // See `func handleTransactionRegistration` in apm-aws-lambda.git.
        // This mock doesn't handle the various checks there. It only handles
        // the status code, so the APM agent will continue to register
        // transactions.
        res.writeHead(200);
      } else {
        res.writeHead(404);
      }
      this.requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      res.end(resBody);
    });
  }

  // Start listening and callback with `cb(serverUrl)`.
  start(cb) {
    return this._http.listen(() => {
      this.serverUrl = `http://localhost:${this._http.address().port}`;
      cb(this.serverUrl);
    });
  }

  close() {
    return this._http.close();
  }
}

module.exports = {
  MockAPMServer,
};
