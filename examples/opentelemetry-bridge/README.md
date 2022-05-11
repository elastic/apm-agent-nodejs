This directory includes example Node.js scripts showing usage of the
OpenTelemetry JS API. These can be instrumented with the Elastic Node.js APM
agent using its OpenTelemetry Bridge.

Setup dependencies via:

    npm install

To run a script using the **Elastic Node.js APM Agent** use:

    export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true
    node -r elastic-apm-node/start.js THE-SCRIPT.js

For example:

    export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true
    node -r elastic-apm-node/start.js trace-https-request.js

While these examples are written to use the `node -r elastic-apm-node/start.js ...`
mechanism to start the APM agent. That isn't required. One can still load and
start the APM agent at the top of a script like this:

```js
require('elastic-apm-node').start({
    opentelemetryBridgeEnabled: true
    // serviceName: ...
    // serverUrl: ...
    // secretToken: ...
})
```

## Compare to using the OpenTelemetry JS SDK

For comparison, these scripts can be instrumented with the OpenTelemetry JS SDK
with something like the following:

    node -r ./otel-sdk.js trace-https-request.js

The "otel-sdk.js" is a simplified tracing setup of the OpenTelemetry SDK. For
the sake of simpler demonstration it writes tracing spans to the console rather
than sending to some collection service (like Jaeger or Elastic APM).
