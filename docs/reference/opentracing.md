---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/opentracing.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: deprecated
---

# OpenTracing bridge [opentracing]

::::{note}
[OpenTracing](https://opentracing.io/) is discontinued in favor of OpenTelemetry. This Elastic APM OpenTracing bridge is **deprecated**. Consider using the [*OpenTelemetry bridge*](/reference/opentelemetry-bridge.md) instead.
::::


The Elastic APM OpenTracing bridge allows creating Elastic APM transactions and spans, using the [OpenTracing API](https://opentracing-javascript.surge.sh/). In other words, it translates the calls to the OpenTracing API to Elastic APM and thus allows for reusing existing instrumentation.

For more information about OpenTracing, see the [OpenTracing website](https://opentracing.io/).


## Prerequisites [ot-prerequisites]

OpenTracing support for the Elastic APM Node.js Agent is provided via a separate module called [`elastic-apm-node-opentracing`](https://www.npmjs.com/package/elastic-apm-node-opentracing).

This module requires that the Elastic APM Node.js Agent is installed separately. To ensure that both dependencies are added to the application, install them like so:

```bash
npm install elastic-apm-node elastic-apm-node-opentracing --save
```


## OpenTracing vs Elastic APM terminologies [ot-terminologies]

Elastic APM differentiates between [transactions](docs-content://solutions/observability/apm/transactions.md) and [spans](docs-content://solutions/observability/apm/spans.md). In the context of OpenTracing, a transaction can be thought of as a special kind of span.

Because OpenTracing natively only has the concept of spans, the Elastic APM OpenTracing bridge will automatically create either Elastic transactions or Elastic spans behind the scenes. There are a set of rules that determine which is created:

1. If `agent.currentTransaction` is `null`, a new Elastic transaction will be created when calling `tracer.startSpan()`.
2. If `agent.currentTransaction` holds an existing transaction, but that transaction is ended, a new Elastic transaction will be created when calling `tracer.startSpan()`.
3. In all other cases, a new Elastic span will be created when calling `tracer.startSpan()`.


## Initialization [ot-initialization]

It’s important that the agent is started before you require **any** other modules in your Node.js application - i.e. before `express`, `http`, etc.

This means that you should probably require and start the agent in your application’s main file (usually `index.js`, `server.js` or `app.js`).

Here’s a simple example where we first start the agent and then initialize the OpenTracing bridge:

```js
// Add this to the VERY top of the first file loaded in your app
const agent = require('elastic-apm-node').start({
  // Override service name from package.json
  // Allowed characters: a-z, A-Z, 0-9, -, _, and space
  serviceName: '',

  // Use if APM Server requires a token
  secretToken: '',

  // Use if APM Server uses API keys for authentication
  apiKey: '',

  // Set custom APM Server URL (default: http://127.0.0.1:8200)
  serverUrl: '',
})

const Tracer = require('elastic-apm-node-opentracing')

// Pass the Elastic APM agent as an argument to the OpenTracing tracer
const tracer = new Tracer(agent)

const span = tracer.startSpan('my-first-span')
// ... do some work ...
span.finish()
```


## API [ot-api]

```js
tracer = new Tracer(agent)
```

The `elastic-apm-node-opentracing` module exposes a Tracer class which is OpenTracing compatible.

When instantiating the Tracer object, an instance of the Elastic APM Node.js Agent must be provided as its only argument.

For details about the `tracer` API, see the [`opentracing-javascript` API docs](https://opentracing-javascript.surge.sh/).


## Elastic APM specific tags [ot-elastic-apm-tags]

Elastic APM defines some tags which have special meaning and which will not be stored as regular tags. Instead, they will be used to set certain metadata on the transaction or span.

The following tags have special meaning for both transactions and spans:

* `type` - sets the type of the transaction or span, for example `request` for transactions or `db.mysql.query` for spans

The following tags only have special meaning on the span if the underlying Elastic APM object is a transaction:

* `result` - sets the result of the transaction (defaults to `success`)
* `error` - sets the result of the transaction to `error` if the tag value is `true` (defaults to `success`)
* `http.status_code` - sets the result of the transaction. E.g. If the tag value is `200`, the transaction result will be set to `HTTP 2xx` (defaults to `success`)
* `user.id` - sets the user id, appears in the "User" tab in the transaction details in the Elastic APM app
* `user.email` - sets the user email, appears in the "User" tab in the transaction details in the Elastic APM app
* `user.username` - sets the user name, appears in the "User" tab in the transaction details in the Elastic APM app


## Caveats [ot-caveats]

Not all features of the OpenTracing API are supported.


### Context propagation [ot-propagation]

This bridge only supports the formats `opentracing.FORMAT_TEXT_MAP` and `opentracing.FORMAT_HTTP_HEADERS`. `opentracing.FORMAT_BINARY` is currently not supported.


### Span References [ot-references]

Currently, this bridge only supports `opentracing.REFERENCE_CHILD_OF` references. Other references, like `opentracing.REFERENCE_FOLLOWS_FROM`, are not supported yet.


### Baggage [ot-baggage]

The `span.setBaggageItem()` method is not supported. Baggage items are silently dropped.


### Logs [ot-logs]

Only error logging is supported. Logging an Error object on the OpenTracing span will create an Elastic APM [error](docs-content://solutions/observability/apm/errors.md). Example:

```js
const err = new Error('boom!')

span.log({
  event: 'error',
  'error.object': err
})
```

Other logs are silently dropped.
