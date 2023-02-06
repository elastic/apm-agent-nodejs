
# Cases

A. Pure OTel, exporting to Prom
B. Pure OTel, exporting via OTLP/gRPC to Elastic
C. Node Prom lib, exporting to Prom
D. OTel Metrics SDK explicitly used (configured to export to Prom with custom Views), elastic-apm-node turned on and duplicating metrics to APM server. (This is "Exporter Installation" method 1.)
E. OTel Metrics API used (e.g. by a dep), elastic-apm-node turned on and providing a default global MetricsProvider sending to APM server, as long as a global MetricsProvider isn't already provided by user code.


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

