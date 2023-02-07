
# Use Cases

Here are a number of use cases for getting metrics from an app. We'll compare
end results for each of these.

1. `prom-prom` - Using a Prometheus client and export metrics to Prometheus.
2. `otel-prom` - Using OTel Metrics (API and SDK) to create metrics and export
   to Prometheus.
3. `otel-otlp` - Using OTel Metrics (API and SDK) to create metrics and export
   via OTLP/gRPC. Elastic APM supports OTLP/gRPC intake.
4. `otelsdk-elastic` - Using OTel Metrics SDK (and optionally the API) to create
   (and optionally export) metrics. Enabling the Elastic APM agent will result
   in an exporter being added to the Metrics SDK instance (via
   auto-instrumentation), which sends metrics to Elastic APM via the Elastic
   intake API.
5. `otelapi-elastic` - Using the OTel Metrics API *without* registering a
   global MeterProvider. Enabling the Elastic APM agent will result in a global
   MeterProvider being registered that will export metrics to Elastic APM via
   the Elastic intake API.

# Links

- Prom "dashboard": http://localhost:9090/graph?g0.expr=test_counter&g0.tab=0&g0.stacked=1&g0.show_exemplars=0&g0.range_input=15m&g1.expr=test_counter_total&g1.tab=0&g1.stacked=1&g1.show_exemplars=0&g1.range_input=15m
- Elastic dashboard: https://my-deployment-31a70c.kb.us-west2.gcp.elastic-cloud.com:9243/app/dashboards#/view/be0f56b0-a1cc-11ed-9fae-bbff25ada9d8


# setup prom

https://prometheus.io/docs/prometheus/latest/getting_started/

```
curl -LO https://github.com/prometheus/prometheus/releases/download/v2.41.0/prometheus-2.41.0.darwin-amd64.tar.gz
tar xf prometheus-2.41.0.darwin-amd64.tar.gz

make start  # starts prom and apps
```


# node prom-client vs OTel Metrics SDK

An interesting difference in Prometheus metrics from simple node prom-client usage
OTel Metrics SDK usage. Abridged usage:

```js
// prom-client
prom.register.setDefaultLabels({ 'serviceName': SERVICE_NAME })
const counter = new prom.Counter({
  name: 'test_counter',
  help: 'A test Counter',
})

// OTel Metrics
const meterProvider = new MeterProvider({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME })
})
const counter = meter.createCounter('test_counter', {
  description: 'A test Counter'
})
```

Resultant Prometheus metrics:

```
// prom-client
# HELP test_counter A test Counter
# TYPE test_counter counter
test_counter{serviceName="examples-opentelemetry-metrics"} 6

// OTel Metrics
# HELP target_info Target metadata
# TYPE target_info gauge
target_info{service_name="examples-opentelemetry-metrics",telemetry_sdk_language="nodejs",telemetry_sdk_name="opentelemetry",telemetry_sdk_version="1.9.1"} 1
# HELP test_counter_total A test Counter
# TYPE test_counter_total counter
test_counter_total 3 1675211231572
```

Differences:
- Resource/metadata in `target_info` metric.
- `_total` suffix on the counter.

