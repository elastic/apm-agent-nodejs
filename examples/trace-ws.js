#!/usr/bin/env node --unhandled-rejections=strict

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small example showing Elastic APM tracing of the 'ws' package.
//
// Currently Elastic APM will create a span for `ws.send()` calls.
// For tracing spans to be created, there must be an active transaction.
// Typically, a transaction is automatically started for incoming HTTP
// requests to a Node.js server. However, because this script is not running
// an HTTP server, we manually start transactions in our websocket server and
// client. More details at:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html

const apm = require('../').start({
  serviceName: 'example-trace-ws',
});

const WebSocket = require('ws');
const PORT = 4567;

// Server
const wss = new WebSocket.Server({ port: PORT });
wss.on('connection', function (ws) {
  ws.on('message', function (message) {
    console.log('server on "message": %j', message);
    const tserver = apm.startTransaction('tserver');
    ws.send('pong');
    tserver.end();
  });
});

// Client
const ws = new WebSocket('ws://localhost:' + PORT);
ws.on('open', function () {
  const tclient = apm.startTransaction('tclient');
  console.log('client: send "ping"');
  ws.send('ping', function () {
    console.log('client: "ping" has been sent');
  });
  console.log('client: send "ring"');
  ws.send('ring');
  tclient.end();
});
ws.on('message', function (message) {
  console.log('client on "message": %j', message);
  wss.close();
});
