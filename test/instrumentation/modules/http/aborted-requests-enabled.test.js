/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../../../..').start({
  serviceName: 'test-http-aborted-requests-enabled',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  // Testing these:
  abortedErrorThreshold: '250ms',
  errorOnAbortedRequests: true,
});

var http = require('http');

var test = require('tape');

var assert = require('./_assert');
var mockClient = require('../../../_mock_http_client');

var addEndedTransaction = agent._instrumentation.addEndedTransaction;

test(
  'client-side abort below error threshold - call end',
  { timeout: 10000 },
  function (t) {
    var clientReq;
    t.plan(9);

    t.on('end', function () {
      server.close();
    });

    resetAgent(function (data) {
      assert(t, data);
    });

    t.strictEqual(
      agent._apmClient._writes.length,
      0,
      'should not have any samples to begin with',
    );

    agent.captureError = function (_err, opts) {
      t.fail('should not register the closed socket as an error');
    };
    agent._instrumentation.addEndedTransaction = function () {
      addEndedTransaction.apply(this, arguments);
      t.strictEqual(
        agent._apmClient._writes.length,
        1,
        'should send transaction',
      );
    };

    var server = http.createServer(function (req, res) {
      setTimeout(
        function () {
          // Explicitly respond with headers before aborting the client request,
          // because:
          // (a) `assert(t, data)` above asserts that `trans.result` has been set
          //     to "HTTP 2xx", which depends on the wrapped `writeHead` having been
          //     called, and
          // (b) calling res.write('...') or res.end('...') *after* a clientReq.abort()
          //     in node >=15 leads to a race on whether `ServerResponse.writeHead()`
          //     is called.
          //
          // The race:
          // - clientReq.abort() closes the client-side of the socket
          // - The server-side of the socket closes (`onClose` in lib/_http_agent.js)
          // - (race) If the server-side socket is closed before `res.write` is
          //   called, then res.writeHead() will not be called as of this change:
          //   https://github.com/nodejs/node/pull/31818/files#diff-48d21edbddb6e855d1ee5716c49bcdc0d913c11ee8a24a98ea7dbc60cd253556L661-R706
          res.writeHead(200);

          clientReq.abort();
          res.write('sync write');
          process.nextTick(function () {
            res.write('nextTick write');
            setTimeout(function () {
              res.end('setTimeout write');
            }, 10);
          });
        },
        (agent._conf.abortedErrorThreshold * 1000) / 2,
      );
    });

    server.listen(function () {
      var port = server.address().port;
      clientReq = get('http://localhost:' + port, function (res) {
        t.fail('should not call http.get callback');
      });
      clientReq.on('error', function (err) {
        t.strictEqual(
          err.code,
          'ECONNRESET',
          'client request should emit ECONNRESET error',
        );
      });
    });
  },
);

test('client-side abort above error threshold - call end', function (t) {
  var clientReq;
  t.plan(10);

  resetAgent(function (data) {
    assert(t, data);
    server.close();
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (err, opts) {
    t.strictEqual(err, 'Socket closed with active HTTP request (>0.25 sec)');
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold * 1000);
  };
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments);
    t.strictEqual(
      agent._apmClient._writes.length,
      1,
      'should send transactions',
    );
  };

  var server = http.createServer(function (req, res) {
    setTimeout(
      function () {
        res.writeHead(200); // See race comment above.

        clientReq.abort();
        setTimeout(function () {
          res.write('Hello');
          setTimeout(function () {
            res.end(' World');
          }, 10);
        }, 10);
      },
      agent._conf.abortedErrorThreshold * 1000 + 10,
    );
  });

  server.listen(function () {
    var port = server.address().port;
    clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
    });
  });
});

test("client-side abort below error threshold - don't call end", function (t) {
  var clientReq;
  resetAgent(function () {
    t.fail('should not send any data');
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (_err, opts) {
    t.fail('should not register the closed socket as an error');
  };
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction');
  };

  var server = http.createServer(function (req, res) {
    setTimeout(
      function () {
        clientReq.abort();
        setTimeout(function () {
          res.write('Hello'); // server emits clientError if written in same tick as abort
          setTimeout(function () {
            server.close();
            t.end();
          }, 10);
        }, 10);
      },
      (agent._conf.abortedErrorThreshold * 1000) / 2,
    );
  });

  server.listen(function () {
    var port = server.address().port;
    clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
    });
  });
});

test("client-side abort above error threshold - don't call end", function (t) {
  var clientReq;
  resetAgent(function () {
    t.fail('should not send any data');
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (err, opts) {
    t.strictEqual(err, 'Socket closed with active HTTP request (>0.25 sec)');
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold * 1000);
    server.close();
    t.end();
  };
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction');
  };

  var server = http.createServer(function (req, res) {
    setTimeout(
      function () {
        clientReq.abort();
        setTimeout(function () {
          res.write('Hello'); // server emits clientError if written in same tick as abort
        }, 10);
      },
      agent._conf.abortedErrorThreshold * 1000 + 10,
    );
  });

  server.listen(function () {
    var port = server.address().port;
    clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
    });
  });
});

test('server-side abort below error threshold and socket closed - call end', function (t) {
  var timedout = false;
  var ended = false;
  t.plan(11);

  resetAgent(assert.bind(null, t));

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (_err, opts) {
    t.fail('should not register the closed socket as an error');
  };
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments);
    ended = true;
    t.strictEqual(
      agent._apmClient._writes.length,
      1,
      'should send transactions',
    );
  };

  var server = http.createServer(function (req, res) {
    res.writeHead(200); // See race comment above.
    setTimeout(
      function () {
        t.ok(timedout, 'should have closed socket');
        t.notOk(ended, 'should not have ended transaction');
        res.end('Hello World');
        t.ok(ended, 'should have ended transaction');
        server.close();
      },
      (agent._conf.abortedErrorThreshold * 1000) / 2 + 100,
    );
  });

  server.setTimeout((agent._conf.abortedErrorThreshold * 1000) / 2);

  server.listen(function () {
    var port = server.address().port;
    var clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
      timedout = true;
    });
  });
});

test('server-side abort above error threshold and socket closed - call end', function (t) {
  var timedout = false;
  var ended = false;
  t.plan(13);

  resetAgent(assert.bind(null, t));

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (err, opts) {
    t.strictEqual(err, 'Socket closed with active HTTP request (>0.25 sec)');
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold * 1000);
  };
  agent._instrumentation.addEndedTransaction = function () {
    addEndedTransaction.apply(this, arguments);
    ended = true;
    t.strictEqual(
      agent._apmClient._writes.length,
      1,
      'should send transactions',
    );
  };

  var server = http.createServer(function (req, res) {
    res.writeHead(200); // See race comment above.
    setTimeout(
      function () {
        t.ok(timedout, 'should have closed socket');
        t.notOk(ended, 'should not have ended transaction');
        res.end('Hello World');
        t.ok(ended, 'should have ended transaction');
        server.close();
      },
      agent._conf.abortedErrorThreshold * 1000 + 100,
    );
  });

  server.setTimeout(agent._conf.abortedErrorThreshold * 1000 + 10);

  server.listen(function () {
    var port = server.address().port;
    var clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
      timedout = true;
    });
  });
});

test("server-side abort below error threshold and socket closed - don't call end", function (t) {
  var timedout = false;
  var ended = false;
  t.plan(3);

  resetAgent(function () {
    t.fail('should not send any data');
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (_err, opts) {
    t.fail('should not register the closed socket as an error');
  };
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction');
  };

  var server = http.createServer(function (req, res) {
    setTimeout(
      function () {
        t.ok(timedout, 'should have closed socket');
        t.notOk(ended, 'should not have ended transaction');
        server.close();
      },
      (agent._conf.abortedErrorThreshold * 1000) / 2 + 100,
    );
  });

  server.setTimeout((agent._conf.abortedErrorThreshold * 1000) / 2);

  server.listen(function () {
    var port = server.address().port;
    var clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
      timedout = true;
    });
  });
});

test("server-side abort above error threshold and socket closed - don't call end", function (t) {
  var timedout = false;
  var ended = false;
  t.plan(5);

  resetAgent(function () {
    t.fail('should not send any data');
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (err, opts) {
    t.strictEqual(err, 'Socket closed with active HTTP request (>0.25 sec)');
    t.ok(opts.extra.abortTime > agent._conf.abortedErrorThreshold * 1000);
  };
  agent._instrumentation.addEndedTransaction = function () {
    t.fail('should not end the transaction');
  };

  var server = http.createServer(function (req, res) {
    setTimeout(
      function () {
        t.ok(timedout, 'should have closed socket');
        t.notOk(ended, 'should have ended transaction');
        server.close();
      },
      agent._conf.abortedErrorThreshold * 1000 + 150,
    );
  });

  server.setTimeout(agent._conf.abortedErrorThreshold * 1000 + 50);

  server.listen(function () {
    var port = server.address().port;
    var clientReq = get('http://localhost:' + port, function (res) {
      t.fail('should not call http.get callback');
    });
    clientReq.on('error', function (err) {
      if (err.code !== 'ECONNRESET') throw err;
      timedout = true;
    });
  });
});

test('server-side abort below error threshold but socket not closed - call end', function (t) {
  t.plan(8);

  resetAgent(function (data) {
    assert(t, data);
    server.close();
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (_err, opts) {
    t.fail('should not register the closed socket as an error');
  };
  agent._instrumentation.addEndedTransaction = addEndedTransaction;

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {});

    setTimeout(
      function () {
        res.end('Hello World');
      },
      (agent._conf.abortedErrorThreshold * 1000) / 2 + 100,
    );
  });

  server.setTimeout((agent._conf.abortedErrorThreshold * 1000) / 2);

  server.listen(function () {
    var port = server.address().port;
    get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.strictEqual(
          agent._apmClient._writes.length,
          1,
          'should send transactions',
        );
      });
      res.resume();
    });
  });
});

test('server-side abort above error threshold but socket not closed - call end', function (t) {
  t.plan(8);

  resetAgent(function (data) {
    assert(t, data);
    server.close();
  });

  t.strictEqual(
    agent._apmClient._writes.length,
    0,
    'should not have any samples to begin with',
  );

  agent.captureError = function (_err, opts) {
    t.fail('should not register the closed socket as an error');
  };
  agent._instrumentation.addEndedTransaction = addEndedTransaction;

  var server = http.createServer(function (req, res) {
    // listening on for the timeout event on either the server or the response
    // will hinder the socket from closing automatically when a timeout occurs
    res.on('timeout', function () {});

    setTimeout(
      function () {
        res.end('Hello World');
      },
      agent._conf.abortedErrorThreshold * 1000 + 100,
    );
  });

  server.setTimeout(agent._conf.abortedErrorThreshold * 1000 + 10);

  server.listen(function () {
    var port = server.address().port;
    get('http://localhost:' + port, function (res) {
      res.on('end', function () {
        t.strictEqual(
          agent._apmClient._writes.length,
          1,
          'should send transactions',
        );
      });
      res.resume();
    });
  });
});

function resetAgent(cb) {
  agent._instrumentation.testReset();
  agent._apmClient = mockClient(1, cb);
}

function get() {
  agent._instrumentation.testReset();
  return http.get.apply(http, arguments);
}
