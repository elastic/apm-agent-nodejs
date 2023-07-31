/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A mock Elasticsearch server to use in tests.
//
// Usage:
//    const server = new MockES({
//      responses: [ // an array of responses to cycle through
//        {
//          statusCode: 200, // required field
//          headers: {...}, // optional response headers
//          body: ... // optional response body
//        }
//        // ...
//      ]
//    })
//    server.start(function (serverUrl) {
//      // - Test code using `serverUrl`.
//      // - Use `server.requests` to see the requests the ES server received
//      // - Call `server.close()` when done.
//    })

const http = require('http');
const assert = require('assert').strict;

class MockES {
  constructor(opts) {
    assert(typeof opts === 'object', 'opts Object argument');
    assert(
      Array.isArray(opts.responses) && opts.responses.length > 0,
      'opts.responses array',
    );
    this._responses = opts.responses;
    this._reqCount = 0;
    this.serverUrl = null; // set in .start()
    this.requests = [];
    this._http = http.createServer(this._onRequest.bind(this));
  }

  _onRequest(req, res) {
    const response = this._responses[this._reqCount % this._responses.length];
    this._reqCount++;
    req.on('end', () => {
      this.requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
      });
      res.writeHead(response.statusCode, response.headers || {});
      res.end(response.body);
    });
    req.resume();
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
  MockES,
};
