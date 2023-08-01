/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

require('../../../..').start({
  serviceName: 'test-mimic-response',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

var gotVer = require('got/package.json').version;
var semver = require('semver');
if (semver.gte(gotVer, '10.0.0') && semver.lt(process.version, '10.16.0')) {
  // got@10 requires node v10 for JS syntax, and v10.16.0 for the added
  // zlib.brotliCompress.
  console.log(`# SKIP got@${gotVer} does not support node ${process.version}`);
  process.exit();
}
if (
  semver.gte(gotVer, '11.0.0') &&
  semver.satisfies(process.version, '>=14.0.0 <14.2.0')
) {
  // The "issues/423" test below fails with got@11 and node v14.0-v14.1. At
  // a guess this is due to Duplex stream fixes in v14.2 (see
  // https://nodejs.org/en/blog/release/v14.2.0/). This isn't worth working
  // around.
  console.log(
    `# SKIP tests below fail with old node v14 (${process.version}) and got@${gotVer}`,
  );
  process.exit();
}

var http = require('http');
var zlib = require('zlib');
var fs = require('fs');

var got = require('got');
var test = require('tape');

var fileSize = fs.readFileSync(__filename, 'utf8').length;

test('https://github.com/elastic/apm-agent-nodejs/issues/423', function (t) {
  // Start dummy remote server to fetch gzip'ed data from
  var remote = http.createServer(function (req, res) {
    res.setHeader('Content-Encoding', 'gzip');
    fs.createReadStream(__filename).pipe(zlib.createGzip()).pipe(res);
  });

  remote.listen(function () {
    var port = remote.address().port;
    var url = 'http://localhost:' + port;

    // Start simple server that performs got-request on every request
    var server = http.createServer(function (req, res) {
      got(url).then(function (response) {
        t.strictEqual(
          response.body.length,
          fileSize,
          'body should be expected size',
        );
        t.ok(
          response.body.includes('Copyright Elasticsearch'),
          'body should be uncompressed',
        );
        res.end();
      });
    });

    server.listen(function () {
      var port = server.address().port;
      var url = 'http://localhost:' + port;

      http.get(url, function (res) {
        res.resume();
        server.close();
        remote.close();
        t.end();
      });
    });
  });
});
