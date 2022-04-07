// Based on https://github.com/open-telemetry/opentelemetry-js/blob/main/examples/http/client.js
/* eslint-disable */

'use strict';

const api = require('@opentelemetry/api');
// api.diag.setLogger({
//   verbose() { console.log('diag VERBOSE:', ...arguments) },
//   debug() { console.log('diag DEBUG:', ...arguments) },
//   info() { console.log('diag INFO:', ...arguments) },
//   warn() { console.log('diag WARN:', ...arguments) },
//   error() { console.log('diag ERROR:', ...arguments) }
// }, api.DiagLogLevel.ALL)


const tracer = api.trace.getTracer('example-http-request')

const http = require('http');

/** A function which makes requests and handles response. */
function makeRequest() {
  // span corresponds to outgoing requests. Here, we have manually created
  // the span, which is created to track work that happens outside of the
  // request lifecycle entirely.
  const span = tracer.startSpan('makeRequest');
  api.context.with(api.trace.setSpan(api.context.active(), span), () => {
    // XXX TODO sanity check what RunContext and OTelContext are here. Should be the 'makeRequest' transaction.
    http.get({
      host: 'httpstat.us',
      path: '/200',
      headers: { accept: '*/*' }
    }, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => {
        console.log('BODY:', body.toString());
        span.end();
      });
    });
  });
}

makeRequest();
