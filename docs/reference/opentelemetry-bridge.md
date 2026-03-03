---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/opentelemetry-bridge.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# OpenTelemetry bridge [opentelemetry-bridge]

::::{note}
Integration with the OpenTelemetry Tracing API was added as experimental in v3.34.0. Integration with the OpenTelemetry Metrics API was added as experimental in v3.45.0.
::::

The Elastic APM OpenTelemetry bridge allows one to use the vendor-neutral [OpenTelemetry API](https://opentelemetry.io/docs/instrumentation/js/) ([`@opentelemetry/api`](https://www.npmjs.com/package/@opentelemetry/api)) in your code, and have the Elastic Node.js APM agent handle those API calls. This allows one to use the Elastic APM agent for tracing and metrics without any vendor lock-in to the APM agent’s own [public API](/reference/api.md) when adding manual tracing or custom metrics.

## Using the OpenTelemetry Tracing API [otel-tracing-api]

① First, you will need to add the Elastic APM agent and OpenTelemetry API dependencies to your project. The minimum required OpenTelemetry API version is 1.0.0; see [the OpenTelemetry compatibility section](/reference/supported-technologies.md#compatibility-opentelemetry) for the current maximum supported API version. For example:

```bash
npm install --save elastic-apm-node @opentelemetry/api
```

② Second, you will need to configure and start the APM agent. This can be done completely with environment variables (so that there is no need to touch your application code):

```bash
export ELASTIC_APM_SERVER_URL='<url of your APM server>'
export ELASTIC_APM_SECRET_TOKEN='<secret token for your APM server>'  <1>
export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true                  <2>
export NODE_OPTIONS='-r elastic-apm-node/start.js'                    <3>
node my-app.js
```

1. Or use ELASTIC_APM_API_KEY=
2. Future versions may drop this config var and enable usage of the tracing API by default.
3. Tell node to preload and start the APM agent.

Or, alternatively, you can configure and start the APM agent at the top of your application code:

```js
require('elastic-apm-node').start({
    serverUrl: '<url of your APM server>',
    secretToken: '<secret token for your APM server>', <1>
    opentelemetryBridgeEnabled: true
});

// Application code ...
```

1. Alternatively, you can use `apiKey: '<your API key>'`.

See [the full APM agent configuration reference](/reference/configuration.md) for other configuration options.

③ Finally, you can use the [OpenTelemetry API](https://open-telemetry.github.io/opentelemetry-js/modules/_opentelemetry_api.html) for any manual tracing in your code. For example, the following script uses [Tracer#startActiveSpan()](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Tracer.html#startactivespan) to trace an outgoing HTTPS request:

```js
const https = require('https');
const otel = require('@opentelemetry/api');
const tracer = otel.trace.getTracer('trace-https-request');

tracer.startActiveSpan('makeRequest', (span) => {
  https.get('https://httpstat.us/200', (response) => {
    console.log('STATUS:', response.statusCode);
    const body = [];
    response.on('data', (chunk) => body.push(chunk));
    response.on('end', () => {
      console.log('BODY:', body.toString());
      span.end();
    });
  });
});
```

The APM agent source code repository includes [some examples using the OpenTelemetry tracing bridge](https://github.com/elastic/apm-agent-nodejs/tree/main/examples/opentelemetry-bridge).

## Using the OpenTelemetry Metrics API [otel-metrics-api]

① As above, install the needed dependencies. The minimum required OpenTelemetry API version is 1.3.0 (the version when metrics were added); see [the OpenTelemetry compatibility section](/reference/supported-technologies.md#compatibility-opentelemetry) for the current maximum supported API version. For example:

```bash
npm install --save elastic-apm-node @opentelemetry/api
```

② Configure and start the APM agent. This can be done completely with environment variables — as shown below — or in code. (See [Starting the agent](/reference/starting-agent.md) and [the full APM agent configuration reference](/reference/configuration.md) for other configuration options.)

```bash
export ELASTIC_APM_SERVER_URL='<url of your APM server>'
export ELASTIC_APM_SECRET_TOKEN='<secret token for your APM server>'  # or ELASTIC_APM_API_KEY=...
export NODE_OPTIONS='-r elastic-apm-node/start.js'  # Tell node to preload and start the APM agent
node my-app.js
```

③ Finally, you can use the OpenTelemetry Metrics API, to [create metrics](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Meter.html) and the APM agent will periodically ship those metrics to your Elastic APM deployment where you can visualize them in Kibana.

```js
// otel-metrics-hello-world.js <1>
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
```

1. The full example is [here](https://github.com/elastic/apm-agent-nodejs/blob/main/examples/opentelemetry-metrics/otel-metrics-hello-world.js).

### Using the OpenTelemetry Metrics SDK [otel-metrics-sdk]

The Elastic APM agent also supports exporting metrics to APM server when the OpenTelemetry Metrics **SDK** is being used directly. You might want to use the OpenTelemetry Metrics SDK to use a [`View`](https://opentelemetry.io/docs/reference/specification/metrics/sdk/#view) to configure histogram bucket sizes, to setup a Prometheus exporter, or for other reasons. For example:

```js
// use-otel-metrics-sdk.js <1>
const otel = require('@opentelemetry/api');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter({ host: '127.0.0.1', port: 3001 });
const meterProvider = new MeterProvider({
  readers: [exporter],
});
otel.metrics.setGlobalMeterProvider(meterProvider);

const meter = otel.metrics.getMeter('my-meter');
const latency = meter.createHistogram('latency', {
  description: 'Response latency (s)',
});
// ...
```

1. The full example is [here](https://github.com/elastic/apm-agent-nodejs/blob/main/examples/opentelemetry-metrics/use-otel-metrics-sdk.js).

### OpenTelemetry Metrics configuration [otel-metrics-conf]

A few configuration options can be used to control OpenTelemetry Metrics support.

- Specific metrics names can be filtered out via the [`disableMetrics`](/reference/configuration.md#disable-metrics) configuration option.
- Integration with the OpenTelemetry Metrics API can be disabled via the [`disableInstrumentations: '@opentelemetry/api'`](/reference/configuration.md#disable-instrumentations) configuration option.
- Integration with the OpenTelemetry Metrics SDK can be disabled via the [`disableInstrumentations: '@opentelemetry/sdk-metrics'`](/reference/configuration.md#disable-instrumentations) configuration option.
- All metrics support in the APM agent can be disabled via the [`metricsInterval: '0s'`](/reference/configuration.md#metrics-interval) configuration option.
- The default histogram bucket boundaries are different from the OpenTelemetry default, to provide better resolution. The boundaries used by the APM agent can be configured with the [`customMetricsHistogramBoundaries`](/reference/configuration.md#custom-metrics-histogram-boundaries) configuration option.

## Bridge architecture [otel-architecture]

The OpenTelemetry Tracing bridge works similarly to the [OpenTelemetry Node.js Trace SDK](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node/). It registers Tracer and ContextManager providers with the OpenTelemetry API. Subsequent `@opentelemetry/api` calls in user code will use those providers. The APM agent translates from OpenTelemetry to Elastic APM semantics and sends tracing data to your APM server for full support in [Elastic Observability’s APM app](https://www.elastic.co/apm).

Some examples of semantic translations: The first entry span of a service (e.g. an incoming HTTP request) will be converted to an [Elasic APM `Transaction`](docs-content://solutions/observability/apm/transactions.md), subsequent spans are mapped to [Elastic APM `Span`s](docs-content://solutions/observability/apm/spans.md). OpenTelemetry Span attributes are translated into the appropriate fields in Elastic APM’s data model.

The only difference, from the user’s point of view, is in the setup of tracing. Instead of setting up the OpenTelemetry JS SDK, one sets up the APM agent as [described above](#otel-tracing-api).

<hr>
The OpenTelemetry Metrics support, is slightly different. If your code uses just the Metrics **API**, then the APM agent provides a full MeterProvider so that metrics are accumulated and sent to APM server. If your code uses the Metrics **SDK**, then the APM agents adds a MetricReader to your MeterProvider to send metrics on to APM server. This allows you to use the APM agent as either an easy setup for using metrics or in conjunction with your existing OpenTelemetry Metrics configuration.

## Caveats [otel-caveats]

Not all features of the OpenTelemetry API are supported. This section describes any limitations and differences.

#### Tracing [otel-caveats-tracing]

- Span Link Attributes. Adding links when [starting a span](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Tracer.html) is supported, but any added span link **attributes** are silently dropped.
- Span events ([`Span#addEvent()`](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Span.html#addevent)) are not currently supported. Events will be silently dropped.
- [Propagating baggage](https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_api._opentelemetry_api.PropagationAPI.html) within or outside the process is not supported. Baggage items are silently dropped.

#### Metrics [otel-caveats-metrics]

- Metrics [exemplars](https://opentelemetry.io/docs/reference/specification/metrics/data-model/#exemplars) are not supported.
- [Summary metrics](https://opentelemetry.io/docs/reference/specification/metrics/data-model/#summary-legacy) are not supported.
- [Exponential Histograms](https://opentelemetry.io/docs/reference/specification/metrics/data-model/#exponentialhistogram) are not yet supported.
- The `sum`, `count`, `min` and `max` within the OpenTelemetry histogram data are discarded.
- The default histogram bucket boundaries are different from the OpenTelemetry default. They provide better resolution. They can be configured with the [`customMetricsHistogramBoundaries`](/reference/configuration.md#custom-metrics-histogram-boundaries) configuration option.
- Metrics label names are dedotted (`s/\./_/g`) in APM server to avoid possible mapping collisions in Elasticsearch.
- The default [Aggregation Temporality](https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#aggregation-temporality) used differs from the OpenTelemetry default — preferring **delta**-temporality (nicer for visualizing in Kibana) to cumulative-temporality.

Metrics support requires an APM server >=7.11 — for earlier APM server versions, metrics with label names including `.`, `*`, or `"` will get dropped.

#### Logs [otel-caveats-logs]

The OpenTelemetry Logs API is currently not support — only the Tracing and Metrics APIs.
