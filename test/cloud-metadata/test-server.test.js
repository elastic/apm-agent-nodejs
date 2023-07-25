/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const { createTestServer } = require('./_lib');
const tape = require('tape');
const request = require('request');

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
    request(url, function (error, response, rawBody) {
      if (error) {
        throw error;
      }
      const body = JSON.parse(rawBody);
      t.ok(body.version, 'version set');
      listener.close();
      t.end();
    });
  });
});

tape.test('basic metadata request: gcp', function (t) {
  const serverGcp = createTestServer('gcp', 'default gcp fixture');
  const listener = serverGcp.listen(0, function () {
    const url = `http://127.0.0.1:${
      listener.address().port
    }/computeMetadata/v1/?recursive=true`;
    const options = {
      url,
      headers: {
        'Metadata-Flavor': 'Google',
      },
    };
    request(options, function (error, response, rawBody) {
      if (error) {
        throw error;
      }
      const body = JSON.parse(rawBody);
      t.ok(body.instance.id, 'id set');
      listener.close();
      t.end();
    });
  });
});

tape.test('basic metadata request: azure', function (t) {
  const serverAzure = createTestServer('azure', 'default azure fixture');
  const listener = serverAzure.listen(0, function () {
    const url = `http://127.0.0.1:${
      listener.address().port
    }/metadata/instance?api-version=2020-09-01`;
    const options = {
      url,
      headers: {
        Metadata: 'true',
      },
    };
    request(options, function (error, response, rawBody) {
      if (error) {
        throw error;
      }
      const body = JSON.parse(rawBody);
      t.ok(body.compute.vmId, 'vmId set');
      listener.close();
      t.end();
    });
  });
});

tape.test('IMDSv2 token fetching: aws', function (t) {
  const serverAws = createTestServer('aws-IMDSv2', 'default aws fixture');
  const listener = serverAws.listen(0, function () {
    const urlToken = `http://127.0.0.1:${
      listener.address().port
    }/latest/api/token`;
    const optionsToken = {
      url: urlToken,
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '300',
      },
    };
    request.put(
      optionsToken,
      function (errorToken, responseToken, rawBodyToken) {
        // token request succeded, now make real request
        t.equals(
          rawBodyToken,
          'AQAAAOaONNcThIsIsAfAkEtOkEn_b94UPLuLYRThIsIsAfAkEtOkEn==',
          'returns correct fake token',
        );
        const url = `http://127.0.0.1:${
          listener.address().port
        }/latest/dynamic/instance-identity/document`;
        const options = {
          url,
          headers: {
            'X-aws-ec2-metadata-token': rawBodyToken,
          },
        };
        request(options, function (error, response, rawBody) {
          if (error) {
            throw error;
          }

          const body = JSON.parse(rawBody);
          t.ok(body.version, 'version set');
          listener.close();
          t.end();
        });
      },
    );
  });
});
