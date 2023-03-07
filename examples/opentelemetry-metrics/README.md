XXX 'splain

# Setup

XXX get started with APM server

npm install
cp .env.template .env
vi .env
XXX prom download? or use docker?


# Application metrics use cases

Here are a number of use cases for getting metrics from an app. We'll compare
end results for each of these. The first three do not involve the Elastic
APM Node.js agent.

1. Using a Prometheus client and export metrics to Prometheus.
   ```
   node use-prom.js
   ```

2. Using OTel Metrics (API and SDK) to create metrics and export to Prometheus.
   ```
   node use-otel-prom.js
   ```

This one shows that OTel Metrics can be **sent directly to an Elastic APM server
via OTLP/gRPC**, configured via the
[OTLP exporter environment variables](https://opentelemetry.io/docs/concepts/sdk-configuration/otlp-exporter-configuration/):

3. Using OTel Metrics to create metrics and export via OTLP/gRPC.
   Elastic APM server supports OTLP/gRPC intake.
   ```
   OTEL_EXPORTER_OTLP_ENDPOINT=https://APM-SERVER-URL:8200 \
      OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer APM-SECRET-TOKEN" \
      OTEL_RESOURCE_ATTRIBUTES=service.name=use-otel-otlp \
      node use-otel-otlp.js
   ```

Cases 4 and 5 show how the Elastic APM agent can be used to collect metrics
from OTel-using code **without any code changes**:

4. Use the same "otel-prom.js" script from above, but also start the Elastic APM
   agent. The APM agent will send metrics to APM server without interfering with
   the Prometheus metrics.
   ```
   ELASTIC_APM_SERVER_URL=https://... \
      ELASTIC_APM_SECRET_TOKEN=... \
      ELASTIC_APM_SERVICE_NAME=use-otel-prom-elastic \
      PROM_PORT=3004 \
      node -r elastic-apm-node/start use-otel-prom.js
   ```

5. A script that just uses the OTel *API*, without configuring an SDK. The
   Elastic APM agent will provide a fallback MeterProvider to send created
   metrics to APM server.
   ```
   ELASTIC_APM_SERVER_URL=https://... \
      ELASTIC_APM_SECRET_TOKEN=... \
      ELASTIC_APM_SERVICE_NAME=use-otel-api \
      node -r elastic-apm-node/start use-otel-api.js
   ```

XXX TODO: a use case using the OTel *Node SDK*. More realistic. What's the experience then?
   https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/opentelemetry-sdk-node/README.md
   This also uses the EnvDetector, so can use that for OTEL_RESOURCE_ATTRIBUTES.

# Running everything

XXX prom setup
XXX note prom config

```
make start
```

# Links

A Prometheus quick dashboard showing the `my_counter` metric exported from
the three cases (1, 2, and 4) exporting to Prometheus:

http://localhost:9090/graph?g0.expr=my_counter%7Bjob%3D%22use-prom%22%7D&g0.tab=0&g0.stacked=1&g0.show_exemplars=0&g0.range_input=5m&g1.expr=my_counter_total%7Bjob%3D%22use-otel-prom%22%7D&g1.tab=0&g1.stacked=1&g1.show_exemplars=0&g1.range_input=5m&g2.expr=my_counter_total%7Bjob%3D%22use-otel-prom-elastic%22%7D&g2.tab=0&g2.stacked=1&g2.show_exemplars=0&g2.range_input=5m


XXX internal, but show a screenshot

- Elastic dashboard: https://my-deployment-31a70c.kb.us-west2.gcp.elastic-cloud.com:9243/app/dashboards#/view/be0f56b0-a1cc-11ed-9fae-bbff25ada9d8



# setup prom

XXX

https://prometheus.io/docs/prometheus/latest/getting_started/

```
curl -LO https://github.com/prometheus/prometheus/releases/download/v2.41.0/prometheus-2.41.0.darwin-amd64.tar.gz
tar xf prometheus-2.41.0.darwin-amd64.tar.gz

make start  # starts prom and apps
```


# node prom-client vs OTel Metrics SDK

XXX move to issue

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

