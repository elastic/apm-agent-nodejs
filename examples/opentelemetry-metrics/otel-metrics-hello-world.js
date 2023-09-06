/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { createServer } = require('http');
const otel = require('@opentelemetry/api');

const meter = otel.metrics.getMeter('my-meter');
const numReqs = meter.createCounter('num_requests', {
  description: 'number of HTTP requests',
});

const server = createServer((req, res) => {
  numReqs.add(1);
  req.resume();
  req.on('end', () => {
    res.end('pong\n');
  });
});
server.listen(3000, () => {
  console.log('listening at http://127.0.0.1:3000/');
});
