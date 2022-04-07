const api = require('@opentelemetry/api');
const tracer = api.trace.getTracer('simplest')
function makeRequest() {
  const span = tracer.startSpan('makeRequest');
  span.end();
}
makeRequest();
