/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { exec } = require('child_process');
const http = require('http');
const path = require('path');
const test = require('tape');
const utils = require('./lib/utils');

const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;
const assertIntakeReq = utils.assertIntakeReq;
const assertMetadata = utils.assertMetadata;
const assertEvent = utils.assertEvent;
const validOpts = utils.validOpts;

test('Event: close - if chopper ends', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    client._chopper.end();
    setTimeout(function () {
      // wait a little to allow close to be emitted
      t.end();
      server.close();
    }, 10);
  }).listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        apmServerVersion: '8.0.0',
      }),
    );

    client.on('finish', function () {
      t.fail('should not emit finish event');
    });
    client.on('close', function () {
      t.pass('should emit close event');
    });

    client.sendSpan({ req: 1 });
  });
});

test('Event: close - if chopper is destroyed', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    client._chopper.destroy();
    setTimeout(function () {
      // wait a little to allow close to be emitted
      t.end();
      server.close();
    }, 10);
  }).listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        apmServerVersion: '8.0.0',
      }),
    );

    client.on('finish', function () {
      t.fail('should not emit finish event');
    });
    client.on('close', function () {
      t.pass('should emit close event');
    });

    client.sendSpan({ req: 1 });
  });
});

test('write after end', function (t) {
  t.plan(2);
  const server = APMServer(function (req, res) {
    t.fail('should never get any request');
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'write after end');
      server.close();
      t.end();
    });
    client.end();
    client.sendSpan({ foo: 42 });
  });
});

test('request with error - no body', function (t) {
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.end();
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, undefined);
      t.equal(err.errors, undefined);
      t.equal(err.response, undefined);
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('request with error - non json body', function (t) {
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.end('boom!');
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, undefined);
      t.equal(err.errors, undefined);
      t.equal(err.response, 'boom!');
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('request with error - invalid json body', function (t) {
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.setHeader('Content-Type', 'application/json');
    res.end('boom!');
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, undefined);
      t.equal(err.errors, undefined);
      t.equal(err.response, 'boom!');
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('request with error - json body without accepted or errors properties', function (t) {
  const body = JSON.stringify({ foo: 'bar' });
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, undefined);
      t.equal(err.errors, undefined);
      t.equal(err.response, body);
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('request with error - json body with accepted and errors properties', function (t) {
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ accepted: 42, errors: [{ message: 'bar' }] }));
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, 42);
      t.deepEqual(err.errors, [{ message: 'bar' }]);
      t.equal(err.response, undefined);
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('request with error - json body where Content-Type contains charset', function (t) {
  const server = APMServer(function (req, res) {
    res.statusCode = 418;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ accepted: 42, errors: [{ message: 'bar' }] }));
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      t.equal(err.message, 'Unexpected APM Server response');
      t.equal(err.code, 418);
      t.equal(err.accepted, 42);
      t.deepEqual(err.errors, [{ message: 'bar' }]);
      t.equal(err.response, undefined);
      client.destroy();
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.flush();
  });
});

test('socket hang up', function (t) {
  const server = APMServer(function (req, res) {
    req.socket.destroy();
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    let closed = false;
    client.on('request-error', function (err) {
      t.equal(err.message, 'socket hang up');
      t.equal(err.code, 'ECONNRESET');
      // wait a little in case 'close' is emitted async
      setTimeout(function () {
        t.equal(closed, false, 'client should not emit close');
        t.end();
        server.close();
        client.destroy();
      }, 50);
    });
    client.on('close', function () {
      closed = true;
    });
    client.on('finish', function () {
      t.fail('should not emit finish');
    });
    client.sendSpan({ foo: 42 });
  });
});

test('socket hang up - continue with new request', function (t) {
  t.plan(
    4 +
      assertIntakeReq.asserts * 2 +
      assertMetadata.asserts +
      assertEvent.asserts,
  );
  let reqs = 0;
  let client;
  const datas = [assertMetadata, assertEvent({ span: { req: 2 } })];
  const server = APMServer(function (req, res) {
    assertIntakeReq(t, req);

    if (++reqs === 1) return req.socket.destroy();

    // We have to attach the listener directly to the HTTP request stream as it
    // will receive the gzip header once the write have been made on the
    // client. If we were to attach it to the gunzip+ndjson, it would not fire
    req.on('data', function () {
      client.flush();
    });

    req = processIntakeReq(req);
    req.on('data', function (obj) {
      datas.shift()(t, obj);
    });
    req.on('end', function () {
      t.pass('should end request');
      res.end();
      client.end(); // cleanup 1: end the client stream so it can 'finish'
    });
  }).client({ apmServerVersion: '8.0.0' }, function (_client) {
    client = _client;
    client.on('request-error', function (err) {
      t.equal(
        err.message,
        'socket hang up',
        'got "socket hang up" request-error',
      );
      t.equal(err.code, 'ECONNRESET', 'request-error code is "ECONNRESET"');
      client.sendSpan({ req: 2 });
    });
    client.on('finish', function () {
      t.equal(reqs, 2, 'should emit finish after last request');
      client.end();
      server.close();
      t.end();
    });
    client.sendSpan({ req: 1 });
  });
});

test('intakeResTimeoutOnEnd', function (t) {
  const server = APMServer(function (req, res) {
    req.resume();
  }).client(
    {
      intakeResTimeoutOnEnd: 500,
      apmServerVersion: '8.0.0',
    },
    function (client) {
      const start = Date.now();
      client.on('request-error', function (err) {
        t.ok(err, 'got a request-error from the client');
        const end = Date.now();
        const delta = end - start;
        t.ok(
          delta > 400 && delta < 600,
          `timeout should be about 500ms, got ${delta}ms`,
        );
        t.equal(
          err.message,
          'intake response timeout: APM server did not respond within 0.5s of gzip stream finish',
        );
        server.close();
        t.end();
      });
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

test('intakeResTimeout', function (t) {
  const server = APMServer(function (req, res) {
    req.resume();
  }).client(
    {
      intakeResTimeout: 400,
      apmServerVersion: '8.0.0',
    },
    function (client) {
      const start = Date.now();
      client.on('request-error', function (err) {
        t.ok(err, 'got a request-error from the client');
        const end = Date.now();
        const delta = end - start;
        t.ok(
          delta > 300 && delta < 500,
          `timeout should be about 400ms, got ${delta}ms`,
        );
        t.equal(
          err.message,
          'intake response timeout: APM server did not respond within 0.4s of gzip stream finish',
        );
        server.close();
        t.end();
      });
      client.sendSpan({ foo: 42 });
      // Do *not* `client.end()` else we are testing intakeResTimeoutOnEnd.
      client.flush();
    },
  );
});

test('socket timeout - server response too slow', function (t) {
  const server = APMServer(function (req, res) {
    req.resume();
  }).client(
    {
      serverTimeout: 1000,
      // Set the intake res timeout higher to be able to test serverTimeout.
      intakeResTimeoutOnEnd: 5000,
      apmServerVersion: '8.0.0',
    },
    function (client) {
      const start = Date.now();
      client.on('request-error', function (err) {
        t.ok(err, 'got a request-error from the client');
        const end = Date.now();
        const delta = end - start;
        t.ok(
          delta > 1000 && delta < 2000,
          `timeout should occur between 1-2 seconds: delta=${delta}ms`,
        );
        t.equal(err.message, 'APM Server response timeout (1000ms)');
        server.close();
        t.end();
      });
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

test('socket timeout - client request too slow', function (t) {
  const server = APMServer(function (req, res) {
    req.resume();
    req.on('end', function () {
      res.end();
    });
  }).client(
    { serverTimeout: 1000, apmServerVersion: '8.0.0' },
    function (client) {
      const start = Date.now();
      client.on('request-error', function (err) {
        const end = Date.now();
        const delta = end - start;
        t.ok(
          delta > 1000 && delta < 2000,
          'timeout should occur between 1-2 seconds',
        );
        t.equal(err.message, 'APM Server response timeout (1000ms)');
        server.close();
        t.end();
      });
      client.sendSpan({ foo: 42 });
    },
  );
});

test('client.destroy() - on fresh client', function (t) {
  t.plan(1);
  const client = new HttpApmClient(validOpts());
  client.on('finish', function () {
    t.fail('should not emit finish');
  });
  client.on('close', function () {
    t.pass('should emit close');
  });
  client.destroy();
  process.nextTick(function () {
    // wait a little to allow close to be emitted
    t.end();
  });
});

test('client.destroy() - on ended client', function (t) {
  t.plan(2);
  let client;

  // create a server that doesn't unref incoming sockets to see if
  // `client.destroy()` will make the server close without hanging
  const server = http.createServer(function (req, res) {
    req.resume();
    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      process.nextTick(function () {
        // wait a little to allow close to be emitted
        t.end();
      });
    });
  });

  server.listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        apmServerVersion: '8.0.0',
      }),
    );
    client.on('finish', function () {
      t.pass('should emit finish only once');
    });
    client.on('close', function () {
      t.pass('should emit close event');
    });
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('client.destroy() - on client with request in progress', function (t) {
  t.plan(1);
  let client;

  // create a server that doesn't unref incoming sockets to see if
  // `client.destroy()` will make the server close without hanging
  const server = http.createServer(function (req, res) {
    server.close();
    client.destroy();
    process.nextTick(function () {
      // wait a little to allow close to be emitted
      t.end();
    });
  });

  server.listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        // TODO: the _fetchApmServerVersion() here *is* hanging.
      }),
    );
    client.on('finish', function () {
      t.fail('should not emit finish');
    });
    client.on('close', function () {
      t.pass('should emit close event');
    });
    client.sendSpan({ foo: 42 });
  });
});

// If the client is destroyed while waiting for cloud metadata to be fetched,
// there should not be an error:
//    Error: Cannot call write after a stream was destroyed
// when cloud metadata *has* returned.
test('getCloudMetadata after client.destroy() should not result in error', function (t) {
  const server = http.createServer(function (req, res) {
    res.end('bye');
  });

  server.listen(function () {
    // 1. Create a client with a slow cloudMetadataFetcher.
    const client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        cloudMetadataFetcher: {
          getCloudMetadata: function (cb) {
            setTimeout(function () {
              t.comment('calling back with cloud metadata');
              cb(null, { fake: 'cloud metadata' });
            }, 1000);
          },
        },
      }),
    );
    client.on('close', function () {
      t.pass('should emit close event');
    });
    client.on('finish', function () {
      t.fail('should not emit finish');
    });
    client.on('error', function (err) {
      t.ifError(err, 'should not get a client "error" event');
    });
    client.on('cloud-metadata', function () {
      t.end();
    });

    // 2. Start sending something to the (mock) APM server.
    client.sendSpan({ foo: 42 });

    // 3. Then destroy the client soon after, but before the `getCloudMetadata`
    //    above finishes.
    setImmediate(function () {
      t.comment('destroy client');
      client.destroy();
      server.close();
    });
  });
});

// FWIW, the current apm-agent-nodejs will happily call
// `client.sendTransaction()` after it has called `client.destroy()`.
test('client.send*() after client.destroy() should not result in error', function (t) {
  const mockApmServer = http.createServer(function (req, res) {
    res.end('bye');
  });

  mockApmServer.listen(function () {
    const UNCORK_TIMER_MS = 100;
    const client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + mockApmServer.address().port,
        bufferWindowTime: UNCORK_TIMER_MS,
      }),
    );

    // 2. We should *not* receive:
    //      Error: Cannot call write after a stream was destroyed
    client.on('error', function (err) {
      t.ifErr(
        err,
        'should *not* receive a "Cannot call write after a stream was destroyed" error',
      );
    });

    // 1. Destroy the client, and then call one of its `.send*()` methods.
    client.destroy();
    client.sendSpan({ a: 'fake span' });

    // 3. Give it until after `conf.bufferWindowTime` time (the setTimeout
    //    length used for `_corkTimer`) -- which is the error code path we
    //    are testing.
    setTimeout(function () {
      t.ok('waited 2 * UNCORK_TIMER_MS');
      mockApmServer.close(function () {
        t.end();
      });
    }, 2 * UNCORK_TIMER_MS);
  });
});

const dataTypes = ['span', 'transaction', 'error'];
dataTypes.forEach(function (dataType) {
  const sendFn = 'send' + dataType.charAt(0).toUpperCase() + dataType.substr(1);

  test(`client.${sendFn}(): handle circular references`, function (t) {
    t.plan(
      assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
    );
    const datas = [
      assertMetadata,
      assertEvent({ [dataType]: { foo: 42, bar: '[Circular]' } }),
    ];
    const server = APMServer(function (req, res) {
      assertIntakeReq(t, req);
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
        server.close();
        t.end();
      });
    }).client({ apmServerVersion: '8.0.0' }, function (client) {
      const obj = { foo: 42 };
      obj.bar = obj;
      client[sendFn](obj);
      client.flush(() => {
        client.destroy();
      });
    });
  });
});

// Ensure that the client.flush(cb) callback is called even if there are no
// active handles -- i.e. the process is exiting. We test this out of process
// to ensure no conflict with other tests or the test framework.
test('client.flush callbacks must be called, even if no active handles', function (t) {
  let theError;

  const server = APMServer(function (req, res) {
    const objStream = processIntakeReq(req);
    let n = 0;
    objStream.on('data', function (obj) {
      if (++n === 2) {
        theError = obj.error;
      }
    });
    objStream.on('end', function () {
      res.statusCode = 202;
      res.end();
      server.close();
    });
  });

  server.listen(function () {
    const url = 'http://localhost:' + server.address().port;
    const script = path.resolve(__dirname, 'lib', 'call-me-back-maybe.js');
    const start = Date.now();
    exec(
      `"${process.execPath}" ${script} ${url}`,
      function (err, stdout, stderr) {
        if (stderr.trim()) {
          t.comment(`stderr from ${script}:\n${stderr}`);
        }
        if (err) {
          throw err;
        }
        t.equal(
          stdout,
          'sendCb called\nflushCb called\n',
          'stdout shows both callbacks were called',
        );
        const duration = Date.now() - start;
        t.ok(
          duration < 1000,
          `should complete quickly, ie. not timeout (was: ${duration}ms)`,
        );

        t.ok(theError, `APM server got an error object from ${script}`);
        if (theError) {
          t.equal(
            theError.exception.message,
            'boom',
            'error message is "boom"',
          );
        }
        t.end();
      },
    );
  });
});
