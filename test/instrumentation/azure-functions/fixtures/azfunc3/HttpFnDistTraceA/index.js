/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const apm = require('../../../../../../'); // elastic-apm-node

const http = require('http');
const https = require('https');

async function callHttpFnDistTrace(req, suffix) {
  const u = new URL(req.url);
  u.pathname = u.pathname.replace(/.$/, suffix);
  const url = u.toString();
  const proto = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const clientReq = proto.request(url, function (clientRes) {
      const chunks = [];
      clientRes.on('data', function (chunk) {
        chunks.push(chunk);
      });
      clientRes.on('end', function () {
        const body = chunks.join('');
        resolve({
          statusCode: clientRes.statusCode,
          headers: clientRes.headers,
          body,
        });
      });
      clientRes.on('error', reject);
    });
    clientReq.on('error', reject);
    clientReq.end();
  });
}

module.exports = async function (context, req) {
  const span = apm.startSpan('spanA');
  await callHttpFnDistTrace(req, 'B');
  if (span) {
    span.end();
  }

  context.res = {
    status: 200,
    body: 'HttpFnDistTraceA body',
  };
};
