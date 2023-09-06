/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');
const utils = require('./lib/utils');
const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');
const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;
const assertIntakeReq = utils.assertIntakeReq;
const assertMetadata = utils.assertMetadata;
const assertEvent = utils.assertEvent;

const dataTypes = ['span', 'transaction', 'error', 'metricset'];

const upper = {
  span: 'Span',
  transaction: 'Transaction',
  error: 'Error',
  metricset: 'MetricSet',
};

dataTypes.forEach(function (dataType) {
  const sendFn = 'send' + upper[dataType];

  test(`client.${sendFn}() + client.flush()`, function (t) {
    t.plan(
      assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
    );
    const datas = [assertMetadata, assertEvent({ [dataType]: { foo: 42 } })];
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
      client[sendFn]({ foo: 42 });
      client.flush(() => {
        client.destroy();
      });
    });
  });

  test(`client.${sendFn}(callback) + client.flush()`, function (t) {
    t.plan(
      1 +
        assertIntakeReq.asserts +
        assertMetadata.asserts +
        assertEvent.asserts,
    );
    const datas = [assertMetadata, assertEvent({ [dataType]: { foo: 42 } })];
    const server = APMServer(function (req, res) {
      assertIntakeReq(t, req);
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
      });
    }).client({ apmServerVersion: '8.0.0' }, function (client) {
      let nexttick = false;
      client[sendFn]({ foo: 42 }, function () {
        t.ok(nexttick, 'should call callback');
      });
      client.flush(() => {
        client.end();
        server.close();
        t.end();
      });
      nexttick = true;
    });
  });

  test(`client.${sendFn}() + client.end()`, function (t) {
    t.plan(
      assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
    );
    let client;
    const datas = [assertMetadata, assertEvent({ [dataType]: { foo: 42 } })];
    const server = APMServer(function (req, res) {
      assertIntakeReq(t, req);
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
        server.close();
        client.destroy();
        t.end();
      });
    }).client({ apmServerVersion: '8.0.0' }, function (client_) {
      client = client_;
      client[sendFn]({ foo: 42 });
      client.end();
    });
  });

  test(`single client.${sendFn}`, function (t) {
    t.plan(
      assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
    );
    let client;
    const datas = [assertMetadata, assertEvent({ [dataType]: { foo: 42 } })];
    const server = APMServer(function (req, res) {
      assertIntakeReq(t, req);
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
        server.close();
        client.destroy();
        t.end();
      });
    }).client({ time: 100, apmServerVersion: '8.0.0' }, function (client_) {
      client = client_;
      client[sendFn]({ foo: 42 });
    });
  });

  test(`multiple client.${sendFn} (same request)`, function (t) {
    t.plan(
      assertIntakeReq.asserts +
        assertMetadata.asserts +
        assertEvent.asserts * 3,
    );
    let client;
    const datas = [
      assertMetadata,
      assertEvent({ [dataType]: { req: 1 } }),
      assertEvent({ [dataType]: { req: 2 } }),
      assertEvent({ [dataType]: { req: 3 } }),
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
        client.destroy();
        t.end();
      });
    }).client({ time: 100, apmServerVersion: '8.0.0' }, function (client_) {
      client = client_;
      client[sendFn]({ req: 1 });
      client[sendFn]({ req: 2 });
      client[sendFn]({ req: 3 });
    });
  });

  test(`multiple client.${sendFn} (multiple requests)`, function (t) {
    t.plan(
      assertIntakeReq.asserts * 2 +
        assertMetadata.asserts * 2 +
        assertEvent.asserts * 6,
    );

    let clientReqNum = 0;
    let clientSendNum = 0;
    let serverReqNum = 0;
    let client;

    const datas = [
      assertMetadata,
      assertEvent({ [dataType]: { req: 1, send: 1 } }),
      assertEvent({ [dataType]: { req: 1, send: 2 } }),
      assertEvent({ [dataType]: { req: 1, send: 3 } }),
      assertMetadata,
      assertEvent({ [dataType]: { req: 2, send: 4 } }),
      assertEvent({ [dataType]: { req: 2, send: 5 } }),
      assertEvent({ [dataType]: { req: 2, send: 6 } }),
    ];

    const server = APMServer(function (req, res) {
      const reqNum = ++serverReqNum;
      assertIntakeReq(t, req);
      req = processIntakeReq(req);
      req.on('data', function (obj) {
        datas.shift()(t, obj);
      });
      req.on('end', function () {
        res.end();
        if (reqNum === 1) {
          send();
        } else {
          server.close();
          client.destroy();
          t.end();
        }
      });
    }).client({ time: 100, apmServerVersion: '8.0.0' }, function (_client) {
      client = _client;
      send();
    });

    function send() {
      clientReqNum++;
      for (let n = 0; n < 3; n++) {
        client[sendFn]({ req: clientReqNum, send: ++clientSendNum });
      }
    }
  });
});

test('client.flush(callback) - with active request', function (t) {
  t.plan(4 + assertIntakeReq.asserts + assertMetadata.asserts);
  const datas = [
    assertMetadata,
    { span: { foo: 42, name: 'undefined', type: 'undefined' } },
  ];
  const server = APMServer(function (req, res) {
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      const expect = datas.shift();
      if (typeof expect === 'function') expect(t, obj);
      else t.deepEqual(obj, expect);
    });
    req.on('end', function () {
      res.end();
    });
  }).client(
    { bufferWindowTime: -1, apmServerVersion: '8.0.0' },
    function (client) {
      t.equal(
        client._activeIntakeReq,
        false,
        'no outgoing HTTP request to begin with',
      );
      client.sendSpan({ foo: 42 });
      t.equal(
        client._activeIntakeReq,
        true,
        'an outgoing HTTP request should be active',
      );
      client.flush(function () {
        t.equal(
          client._activeIntakeReq,
          false,
          'the outgoing HTTP request should be done',
        );
        client.end();
        server.close();
        t.end();
      });
    },
  );
});

test('client.flush(callback) - with queued request', function (t) {
  t.plan(4 + assertIntakeReq.asserts * 2 + assertMetadata.asserts * 2);
  const datas = [
    assertMetadata,
    { span: { req: 1, name: 'undefined', type: 'undefined' } },
    assertMetadata,
    { span: { req: 2, name: 'undefined', type: 'undefined' } },
  ];
  const server = APMServer(function (req, res) {
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      const expect = datas.shift();
      if (typeof expect === 'function') expect(t, obj);
      else t.deepEqual(obj, expect);
    });
    req.on('end', function () {
      res.end();
    });
  }).client(
    { bufferWindowTime: -1, apmServerVersion: '8.0.0' },
    function (client) {
      client.sendSpan({ req: 1 });
      client.flush();
      client.sendSpan({ req: 2 });
      t.equal(
        client._activeIntakeReq,
        true,
        'an outgoing HTTP request should be active',
      );
      client.flush(function () {
        t.equal(
          client._activeIntakeReq,
          false,
          'the outgoing HTTP request should be done',
        );
        client.end();
        server.close();
        t.end();
      });
    },
  );
});

test('2nd flush before 1st flush have finished', function (t) {
  t.plan(4 + assertIntakeReq.asserts * 2 + assertMetadata.asserts * 2);
  let requestStarts = 0;
  let requestEnds = 0;
  const datas = [
    assertMetadata,
    { span: { req: 1, name: 'undefined', type: 'undefined' } },
    assertMetadata,
    { span: { req: 2, name: 'undefined', type: 'undefined' } },
  ];
  const server = APMServer(function (req, res) {
    requestStarts++;
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      const expect = datas.shift();
      if (typeof expect === 'function') expect(t, obj);
      else t.deepEqual(obj, expect);
    });
    req.on('end', function () {
      requestEnds++;
      res.end();
    });
  }).client(
    { bufferWindowTime: -1, apmServerVersion: '8.0.0' },
    function (client) {
      client.sendSpan({ req: 1 });
      client.flush();
      client.sendSpan({ req: 2 });
      client.flush(() => {
        client.destroy();
      });
      setTimeout(function () {
        t.equal(requestStarts, 2, 'should have received 2 requests');
        t.equal(requestEnds, 2, 'should have received 2 requests completely');
        t.end();
        server.close();
      }, 200);
    },
  );
});

test('client.end(callback)', function (t) {
  t.plan(
    1 + assertIntakeReq.asserts + assertMetadata.asserts + assertEvent.asserts,
  );
  let client;
  const datas = [assertMetadata, assertEvent({ span: { foo: 42 } })];
  const server = APMServer(function (req, res) {
    assertIntakeReq(t, req);
    req = processIntakeReq(req);
    req.on('data', function (obj) {
      datas.shift()(t, obj);
    });
    req.on('end', function () {
      res.end();
      server.close();
      client.destroy();
      t.end();
    });
  }).client({ apmServerVersion: '8.0.0' }, function (client_) {
    client = client_;
    client.sendSpan({ foo: 42 });
    client.end(function () {
      t.pass('should call callback');
    });
  });
});

test('client.sent', function (t) {
  t.plan(4);
  const server = APMServer(function (req, res) {
    t.comment('APM server got a request');
    req.resume();
    req.on('end', function () {
      res.end();
    });
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.sendError({ foo: 42 });
    client.sendSpan({ foo: 42 });
    client.sendTransaction({ foo: 42 });
    t.equal(client.sent, 0, 'sent=0 after 1st round of sending');
    client.flush(function () {
      t.equal(client.sent, 3, 'sent=3 after 1st flush');
      client.sendError({ foo: 42 });
      client.sendSpan({ foo: 42 });
      client.sendTransaction({ foo: 42 });
      t.equal(client.sent, 3, 'sent=3 after 2nd round of sending');
      client.flush(function () {
        t.equal(client.sent, 6, 'sent=6 after 2nd flush');
        client.end();
        server.close();
        t.end();
      });
    });
  });
});

test("should not open new request until it's needed after flush", function (t) {
  let client;
  let requests = 0;
  let expectRequest = false;
  const server = APMServer(function (req, res) {
    t.equal(expectRequest, true, 'should only send new request when expected');
    expectRequest = false;

    req.resume();
    req.on('end', function () {
      res.end();

      if (++requests === 2) {
        server.close();
        client.destroy();
        t.end();
      } else {
        setTimeout(sendData, 250);
      }
    });
  }).client({ apmServerVersion: '8.0.0' }, function (_client) {
    client = _client;
    sendData();
  });

  function sendData() {
    expectRequest = true;
    client.sendError({ foo: 42 });
    client.flush();
  }
});

test("should not open new request until it's needed after timeout", function (t) {
  let client;
  let requests = 0;
  let expectRequest = false;
  const server = APMServer(function (req, res) {
    t.equal(expectRequest, true, 'should only send new request when expected');
    expectRequest = false;

    req.resume();
    req.on('end', function () {
      res.end();

      if (++requests === 2) {
        server.close();
        client.destroy();
        t.end();
      } else {
        setTimeout(sendData, 250);
      }
    });
  }).client({ time: 1, apmServerVersion: '8.0.0' }, function (_client) {
    client = _client;
    sendData();
  });

  function sendData() {
    expectRequest = true;
    client.sendError({ foo: 42 });
  }
});

test('cloud metadata: _encodedMetadata maintains cloud info after re-config', function (t) {
  const conf = {
    agentName: 'a',
    agentVersion: 'b',
    serviceName: 'c',
    userAgent: 'd',
  };
  const client = new HttpApmClient(conf);

  // test initial values
  const metadataPreUpdate = JSON.parse(client._encodedMetadata).metadata;
  t.equals(
    metadataPreUpdate.service.name,
    conf.serviceName,
    'initial service name set',
  );
  t.equals(
    metadataPreUpdate.service.agent.name,
    conf.agentName,
    'initial agent name set',
  );
  t.equals(
    metadataPreUpdate.service.agent.version,
    conf.agentVersion,
    'initial agent version set',
  );
  t.ok(!metadataPreUpdate.cloud, 'no cloud metadata set initially');

  // Simulate cloud metadata having been gathered.
  client._cloudMetadata = { foo: 'bar' };
  client._resetEncodedMetadata();

  // Ensure cloud metadata is on `_encodedMetadata`.
  const metadataPostCloud = JSON.parse(client._encodedMetadata).metadata;
  t.equals(
    metadataPostCloud.service.name,
    conf.serviceName,
    'service name still set',
  );
  t.equals(
    metadataPostCloud.service.agent.name,
    conf.agentName,
    'agent name still set',
  );
  t.equals(
    metadataPostCloud.service.agent.version,
    conf.agentVersion,
    'agent version still set',
  );
  t.ok(metadataPostCloud.cloud, 'cloud metadata set after fetch');
  t.equals(
    metadataPostCloud.cloud.foo,
    'bar',
    'cloud metadata set after fetch',
  );

  // Simulate an update of some metadata from re-config.
  client.config({
    frameworkName: 'superFastify',
    frameworkVersion: '1.0.0',
  });

  // Ensure _encodedMetadata keeps cloud info and updates appropriately.
  const metadataPostUpdate = JSON.parse(client._encodedMetadata).metadata;
  t.equals(
    metadataPostUpdate.service.name,
    conf.serviceName,
    'service name still set',
  );
  t.equals(
    metadataPostUpdate.service.agent.name,
    conf.agentName,
    'agent name still set',
  );
  t.equals(
    metadataPostUpdate.service.agent.version,
    conf.agentVersion,
    'agent version still set',
  );
  t.equals(
    metadataPostUpdate.service.framework.name,
    'superFastify',
    'service.framework.name properly set',
  );
  t.equals(
    metadataPostUpdate.service.framework.version,
    '1.0.0',
    'service.framework.version properly set',
  );
  t.ok(metadataPostUpdate.cloud, 'cloud metadata still set after re-config');
  t.equals(
    metadataPostUpdate.cloud.foo,
    'bar',
    'cloud metadata "passed through" after re-config',
  );
  t.end();
});

test('cloud metadata: _fetchAndEncodeMetadata with fetcher configured ', function (t) {
  // test with a fetcher configured
  const conf = {
    agentName: 'a',
    agentVersion: 'b',
    serviceName: 'c',
    userAgent: 'd',
  };
  conf.cloudMetadataFetcher = {};
  conf.cloudMetadataFetcher.getCloudMetadata = function (cb) {
    process.nextTick(cb, null, { foo: 'bar' });
  };
  const client = new HttpApmClient(conf);
  client._fetchAndEncodeMetadata(function () {
    const metadata = JSON.parse(client._encodedMetadata).metadata;
    t.equals(metadata.service.name, conf.serviceName, 'service name set');
    t.equals(metadata.service.agent.name, conf.agentName, 'agent name set');
    t.equals(
      metadata.service.agent.version,
      conf.agentVersion,
      'agent version set',
    );
    t.ok(metadata.cloud, 'cloud metadata set with a fetcher configured');
    t.equals(metadata.cloud.foo, 'bar', 'cloud metadata value represented');
    t.end();
  });
});

test('cloud metadata: _fetchAndEncodeMetadata with fetcher configured but an error', function (t) {
  // fetcher configured but its callback returns an error
  const conf = {
    agentName: 'a',
    agentVersion: 'b',
    serviceName: 'c',
    userAgent: 'd',
  };
  conf.cloudMetadataFetcher = {};
  conf.cloudMetadataFetcher.getCloudMetadata = function (cb) {
    const error = new Error('whoops');
    process.nextTick(cb, error, { foo: 'bar' });
  };
  const client = new HttpApmClient(conf);
  client._fetchAndEncodeMetadata(function () {
    const metadata = JSON.parse(client._encodedMetadata).metadata;
    t.equals(metadata.service.name, conf.serviceName, 'service name set');
    t.equals(metadata.service.agent.name, conf.agentName, 'agent name set');
    t.equals(
      metadata.service.agent.version,
      conf.agentVersion,
      'agent version set',
    );
    t.ok(
      !metadata.cloud,
      'cloud metadata not set when there is a fetcher error',
    );
    t.end();
  });
});
