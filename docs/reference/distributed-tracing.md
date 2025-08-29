---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/distributed-tracing.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
products:
  - id: cloud-serverless
  - id: observability
  - id: apm
---

# Distributed tracing [distributed-tracing]

Distributed tracing enables you to analyze performance throughout your microservices architecture all in one view. This is accomplished by tracing all of the requests — from the initial web request to your front-end service — to queries made to your back-end services. This makes finding possible bottlenecks throughout your application much easier and faster.

Elastic APM automatically supports distributed tracing, but there are some cases, outlined below, where additional setup is necessary.


## Real User Monitoring (RUM) correlation [tracing-rum-correlation]

If your backend service generates an HTML page dynamically, the trace ID and parent span ID must be injected into the page when the RUM Agent is initialized. This ensures that the web browser’s page load appears as the root of the trace, and allows you to analyze the time spent in the browser vs in backend services.

To enable the JavaScript RUM agent, add a snippet similar to this to the body of your HTML page, preferably before other JavaScript libraries:

```js
elasticApm.init({
  serviceName: 'my-frontend-app', // Name of your frontend app
  serverUrl: 'https://example.com:8200', // APM Server host
  pageLoadTraceId: '${transaction.traceId}',
  pageLoadSpanId: '${transaction.ensureParentId()}',
  pageLoadSampled: ${transaction.sampled}
})
```

For more information, see [`transaction.ensureParentId()`](/reference/transaction-api.md#transaction-ensure-parent-id).


## Custom protocols [tracing-custom-protocol]

Distributed tracing is automatically supported with HTTP/HTTPS. If you’re using another protocol, like TCP, UDP, WebSocket, or Protocol Buffers, there are a few manual setup steps you must follow.

In a distributed trace, multiple transactions are linked together with a `traceparent`. To create your own distributed trace, you must pass the current `traceparent` from an outgoing service, to a receiving service, and create a new transaction as a child of that `traceparent`:

1. In one service, start a transaction with [`apm.startTransaction()`](/reference/agent-api.md#apm-start-transaction), or a span with [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).
2. Get the serialized `traceparent` string of the started transaction/span with [`apm.currentTraceparent`](/reference/agent-api.md#apm-current-traceparent).
3. Encode the `traceparent` and send it to the receiving service inside your regular request.
4. Decode and store the `traceparent` in the receiving service.
5. Manually start a new transaction as a child of the received `traceparent`, with [`apm.startTransaction()`](/reference/agent-api.md#apm-start-transaction). Pass in the `traceparent` as the `childOf` option.


### Example [tracing-custom-example]

Consider a scenario where you’re using raw UDP to communicate between two services, A and B:

**Service A**

Service A starts a transaction, and gets the current `traceparent`.

```js
agent.startTransaction('my-service-a-transaction')
const traceparent = agent.currentTraceparent
```

Service A then sends the `traceparent` as a "header" to service B.

```js
// Pseudocode for sending data
sendMetadata(`traceparent: ${traceparent}\n`)
```

**Service B**

Service B reads the `traceparent` from the incoming request.

```js
// Pseudocode for reading incoming request
const traceparent = readTraceparentFromUDPPacket()
```

Service B uses the `traceparent` to initialize a new transaction that is a child of the original `traceparent`.

```js
agent.startTransaction('my-service-b-transaction', { childOf: traceparent })
```
