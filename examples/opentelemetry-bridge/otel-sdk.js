/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Start a simply-configured OpenTelemetry SDK for Node.js tracing for demo
// purposes.
//
// Based on https://github.com/open-telemetry/opentelemetry-js/blob/main/examples/http/tracer.js
//
// Usage:
//    node -r ./otel-sdk.js MY-SCRIPT.js

// Uncomment this to get OpenTelemetry internal diagnostic messages.
// const otel = require('@opentelemetry/api')
// otel.diag.setLogger({
//   verbose () { console.log('diag VERBOSE:', ...arguments) },
//   debug () { console.log('diag DEBUG:', ...arguments) },
//   info () { console.log('diag INFO:', ...arguments) },
//   warn () { console.log('diag WARN:', ...arguments) },
//   error () { console.log('diag ERROR:', ...arguments) }
// }, opentelemetry.DiagLogLevel.ALL)

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require('@opentelemetry/sdk-trace-base');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

module.exports = (() => {
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  registerInstrumentations({
    instrumentations: [new HttpInstrumentation()],
  });
})();
