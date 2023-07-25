/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

var agent = require('../../..').start({
  serviceName: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
});

var stream = require('stream');
var mimicResponse = require('mimic-response');
var test = require('tape');

var cases = [
  { name: 'none bound', source: false, target: false },
  { name: 'source bound', source: true, target: false },
  { name: 'target bound', source: false, target: true },
  { name: 'both bound', source: true, target: true },
];

cases.forEach(function (testCase) {
  test(testCase.name, function (t) {
    const source = new stream.PassThrough();
    const upcase = new stream.Transform({
      transform(chunk, enc, cb) {
        cb(null, chunk.toString().toUpperCase());
      },
    });
    const target = new stream.PassThrough();

    if (testCase.source) agent._instrumentation.bindEmitter(source);
    if (testCase.target) agent._instrumentation.bindEmitter(target);

    mimicResponse(source, target);

    target.on('data', function (chunk) {
      t.ok(
        this === target,
        'target -> onData should be bound to target stream',
      );
      t.strictEqual(chunk.toString(), 'HELLO WORLD');
      t.end();
    });

    source.pipe(upcase).pipe(target);

    source.end('hello world');
  });
});
