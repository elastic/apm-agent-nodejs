/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const http = require('http');
const { createTestServer } = require('./_lib');
const tape = require('tape');

tape.test('test the test server: valid', function (t) {
  const serverAws = createTestServer('aws', 'default aws fixture');
  t.ok(serverAws, 'created test aws metadata server');

  t.end();
});

tape.test('test the test server: unknown provider', function (t) {
  t.throws(function () {
    createTestServer('awss', 'default aws fixture');
  });
  t.throws(function () {
    createTestServer('aws', 'default awss fixture');
  });
  t.end();
});

tape.test('basic metadata request: aws', function (t) {
  const serverAws = createTestServer('aws', 'default aws fixture');
  const listener = serverAws.listen(0, function () {
    const url = `http://127.0.0.1:${
      listener.address().port
    }/latest/dynamic/instance-identity/document`;
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks));
        t.ok(body.version, 'version set');
        listener.close();
        t.end();
      });
    });
  });
});

tape.test('basic metadata request: gcp', function (t) {
  const serverGcp = createTestServer('gcp', 'default gcp fixture');
  const listener = serverGcp.listen(0, function () {
    http.get(
      {
        hostname: '127.0.0.1',
        port: listener.address().port,
        path: '/computeMetadata/v1/?recursive=true',
        headers: {
          'Metadata-Flavor': 'Google',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks));
          t.ok(body.instance.id, 'id set');
          listener.close();
          t.end();
        });
      },
    );
  });
});

tape.test('basic metadata request: azure', function (t) {
  const serverAzure = createTestServer('azure', 'default azure fixture');
  const listener = serverAzure.listen(0, function () {
    http.get(
      {
        hostname: '127.0.0.1',
        port: listener.address().port,
        path: '/metadata/instance?api-version=2020-09-01',
        headers: {
          Metadata: 'true',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks));
          t.ok(body.compute.vmId, 'vmId set');
          listener.close();
          t.end();
        });
      },
    );
  });
});

tape.test('IMDSv2 token fetching: aws', function (t) {
  const serverAws = createTestServer('aws-IMDSv2', 'default aws fixture');
  const listener = serverAws.listen(0, function () {
    // First request to get API token.
    const req = http.request(
      {
        method: 'PUT',
        hostname: '127.0.0.1',
        port: listener.address().port,
        path: '/latest/api/token',
        headers: {
          'X-aws-ec2-metadata-token-ttl-seconds': '300',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const rawBodyToken = Buffer.concat(chunks).toString('utf8');
          t.equals(
            rawBodyToken,
            'AQAAAOaONNcThIsIsAfAkEtOkEn_b94UPLuLYRThIsIsAfAkEtOkEn==',
            'returns correct fake token',
          );

          // Second request to get metadata, using that token.
          http.get(
            {
              hostname: '127.0.0.1',
              port: listener.address().port,
              path: '/latest/dynamic/instance-identity/document',
              headers: {
                'X-aws-ec2-metadata-token': rawBodyToken,
              },
            },
            (res) => {
              const chunks = [];
              res.on('data', (chunk) => {
                chunks.push(chunk);
              });
              res.on('end', () => {
                const body = JSON.parse(Buffer.concat(chunks));
                t.ok(body.version, 'version set');
                listener.close();
                t.end();
              });
            },
          );
        });
      },
    );
    req.end();
  });
});
