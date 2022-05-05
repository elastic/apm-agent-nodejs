This directory includes a number of example Node.js scripts showing usage
of the OpenTelemetry JS API with the *Elastic APM agent* acting as the
OpenTelemetry SDK.

Setup dependencies via:

    cd examples/otel
    npm install

To run a script using the *Elastic APM Agent* use:

    export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true
    node -r elastic-apm-node/start.js THE-SCRIPT.js

For example:

    export ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED=true
    node -r elastic-apm-node/start.js trace-http-request.js


## Compare to using the OpenTelemetry JS SDK

Compare to running the same script with the OpenTelemetry JS SDK:

    node -r ./otel-sdk.js THE-SCRIPT.js

The "otel-sdk.js" file configures the OpenTelemetry SDK to just emit spans
on stdout for comparison.
