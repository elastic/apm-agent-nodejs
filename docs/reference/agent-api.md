---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/agent-api.html
---

# Agent API [agent-api]

The Elastic APM Node.js agent is a singleton. You get the agent instance by requiring either `elastic-apm-node` or `elastic-apm-node/start`. The agent is also returned by the [`.start()`](#apm-start) method, which allows you to require and start the agent on the same line:

```js
const apm = require('elastic-apm-node').start(...)
```

If you need to access the `Agent` in any part of your codebase, you can simply require `elastic-apm-node` to access the already started singleton. You therefore don’t need to manage or pass around the started `Agent` yourself.

## `apm.start([options])` [apm-start]

Starts the Elastic APM agent for Node.js and returns itself.

::::{important}
For the APM agent to automatically instrument Node.js modules, it must be started before those modules are loaded. See [Starting the agent](/reference/starting-agent.md) for details and possible surprises with compilers/transpilers/bundlers.

::::


See the [Configuration documentation](/reference/configuration.md) for available options.


## `apm.isStarted()` [apm-is-started]

Added in: v1.5.0

Use `isStarted()` to check if the agent has already started. Returns `true` if the agent has started, otherwise returns `false`.


## `apm.getServiceName()` [apm-get-service-name]

Added in: v3.11.0

Get the configured [`serviceName`](/reference/configuration.md#service-name). If a service name was not explicitly configured, this value may have been automatically determined. The service name is not determined until `agent.start()`, so will be `undefined` until then. A misconfigured agent can have a `null` service name.


## `apm.getServiceVersion()` [apm-get-service-version]

Added in: v4.2.0

Get the configured [`serviceVersion`](/reference/configuration.md#service-version). If a service version was not explicitly configured, this value may have been automatically determined.  The service version is not determined until `agent.start()`, so will be `undefined` until then.


## `apm.getServiceEnvironment()` [apm-get-service-environment]

Added in: v4.2.0

Get the configured [`environment`](/reference/configuration.md#environment).


## `apm.getServiceNodeName()` [apm-get-service-node-name]

Added in: v4.2.0

Get the configured [`serviceNodeName`](/reference/configuration.md#service-node-name). If the APM agent is not configured with an explicit value, this will return `undefined`.


## `apm.setFramework(options)` [apm-set-framework]

Added in: v2.8.0

* `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The following options are supported:

    * `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Framework name.
    * `version` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Framework version.
    * `overwrite` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If set to `false`, the [`frameworkName`](/reference/configuration.md#framework-name) and [`frameworkVersion`](/reference/configuration.md#framework-version) provided as [config options](/reference/configuration.md) will not be overwritten. **Default:** `true`.


Set or change the [`frameworkName`](/reference/configuration.md#framework-name) or [`frameworkVersion`](/reference/configuration.md#framework-version) after the agent has started. These config options can also be provided as part of the [regular agent configuration](/reference/configuration.md).


## `apm.addFilter(fn)` [apm-add-filter]

Added in: v0.1.0

Use `addFilter()` to supply a filter function.

Each filter function will be called just before data is being sent to the APM Server. This will allow you to manipulate the data being sent, for instance to remove sensitive information like passwords etc. (Note: Filters added via `addFilter` are **not** applied to the "metadata" object sent to the APM Server — use `addMetadataFilter` instead.)

Each filter function will be called in the order they were added, and will receive a `payload` object as the only argument, containing the data about to be sent to the APM Server.

The format of the payload depends on the event type being sent. For details about the different formats, see the [events intake API docs](docs-content://solutions/observability/apps/elastic-apm-events-intake-api.md).

The filter function is synchronous and should return the manipulated payload object. If a filter function doesn’t return any value or returns a falsy value, the remaining filter functions will not be called and the payload **will not** be sent to the APM Server.

Example usage:

```js
apm.addFilter(function redactSecretHeader(payload) {
  if (payload.context &&
      payload.context.request &&
      payload.context.request.headers &&
      payload.context.request.headers['x-secret']) {
    // redact sensitive data
    payload.context.request.headers['x-secret'] = '[REDACTED]'
  }

  // remember to return the modified payload
  return payload
})
```

Though you can also use filter functions to add new contextual information to the `user` and `custom` properties, it’s recommended that you use [`apm.setUserContext()`](#apm-set-user-context) and [`apm.setCustomContext()`](#apm-set-custom-context) for that purpose.


## `apm.addErrorFilter(fn)` [apm-add-error-filter]

Added in: v2.0.0

Similar to [`apm.addFilter()`](#apm-add-filter), but the `fn` will only be called with error payloads.


## `apm.addTransactionFilter(fn)` [apm-add-transaction-filter]

Added in: v2.0.0

Similar to [`apm.addFilter()`](#apm-add-filter), but the `fn` will only be called with transaction payloads.


## `apm.addSpanFilter(fn)` [apm-add-span-filter]

Added in: v2.0.0

Similar to [`apm.addFilter()`](#apm-add-filter), but the `fn` will only be called with span payloads.


## `apm.addMetadataFilter(fn)` [apm-add-metadata-filter]

Added in: v3.14.0

Use `addMetadataFilter(fn)` to supply a filter function for the [metadata object](docs-content://solutions/observability/apps/elastic-apm-events-intake-api.md#apm-api-events-schema-definition) sent to the APM Server. This will allow you to manipulate the data being sent, for instance to remove possibly sensitive information.

Each filter function will be called in the order they were added, and will receive a `metadata` object as the only argument. The filter function is synchronous and must return the manipulated object. Example usage:

```js
apm.addMetadataFilter(function dropArgv(metadata) {
  if (metadata.process && metadata.process.argv) {
    delete metadata.process.argv
  }
  return metadata
})
```

Warning: It is the responsibility of the author to ensure the returned object conforms to the [metadata schema](docs-content://solutions/observability/apps/elastic-apm-events-intake-api.md#apm-api-events-schema-definition) otherwise all APM data injest will fail. A metadata filter that breaks the metadata will result in error logging from the agent, something like:

```text
ERROR (elastic-apm-node): APM Server transport error (400): Unexpected APM Server response
APM Server accepted 0 events in the last request
Error: validation error: 'metadata' required
  Document: {"metadata":null}
```


## `apm.setUserContext(context)` [apm-set-user-context]

Added in: v0.1.0

* `context` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Accepts the following optional properties:

    * `id` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The user’s ID.
    * `username` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The user’s username.
    * `email` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The user’s e-mail.


Call this to enrich collected performance data and errors with information about the user/client. This function can be called at any point during the request/response life cycle (i.e. while a transaction is active).

The given `context` will be added to the active transaction. If no active transaction can be found, `false` is returned. Otherwise `true`.

It’s possible to call this function multiple times within the scope of the same active transaction. For each call, the properties of the `context` argument are shallow merged with the context previously given.

If an error is captured, the context from the active transaction is used as context for the captured error, and any custom context given as the 2nd argument to [`apm.captureError`](#apm-capture-error) takes precedence and is shallow merged on top.

The provided user context is stored under `context.user` in Elasticsearch on both errors and transactions.


## `apm.setCustomContext(context)` [apm-set-custom-context]

Added in: v0.1.0

* `context` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Can contain any property that can be JSON encoded.

Call this to enrich collected errors and transactions with any information that you think will help you debug performance issues or errors. This function can be called at any point while a transaction is active (e.g. during the request/response life cycle of an incoming HTTP request).

The provided custom context is stored under `context.custom` in APM Server pre-7.0, or `transaction.custom` and `error.custom` in APM Server 7.0+.

The given `context` will be added to the active transaction. If no active transaction can be found, `false` is returned. Otherwise `true`.

It’s possible to call this function multiple times within the scope of the same active transaction. For each call, the properties of the `context` argument are shallow merged with the context previously given.

If an error is captured, the context from the active transaction is used as context for the captured error, and any custom context given as the 2nd argument to [`apm.captureError`](#apm-capture-error) takes precedence and is shallow merged on top.

::::{tip}
Before using custom context, ensure you understand the different types of [metadata](docs-content://solutions/observability/apps/metadata.md) that are available.
::::



## `apm.setLabel(name, value[, stringify = true])` [apm-set-label]

Added in: v0.1.0<br> Renamed from `apm.setTag()` to `apm.setLabel()`: v2.10.0<br> Added `stringify` argument in: v3.11.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
* `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.
* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
apm.setLabel('productId', 42, false);
```

Set a label on the current transaction. You can set multiple labels on the same transaction. If an error happens during the current transaction, it will also get tagged with the same label.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apps/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `apm.addLabels({ [name]: value }[, stringify = true])` [apm-add-labels]

Added in: v1.5.0<br> Renamed from `apm.addTags()` to `apm.addLabels()`: v2.10.0<br> Added `stringify` argument in: v3.11.0

* `labels` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Contains key/value pairs:

    * `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
    * `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.

* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
apm.addLabels({productId: 42, productName: 'butter'}, false);
```

Add several labels on the current transaction. You can add labels multiple times. If an error happens during the current transaction, it will also get tagged with the same labels.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apps/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `apm.setGlobalLabel(name, value)` [apm-set-global-label]

Added in: v3.47.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)
* `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type)

Extends the [`globalLabels`](/reference/configuration.md#global-labels) configuration. It allows setting labels that are applied to all transactions. A potential use case is to specify a label with the state of your application: `'initializing' | 'available' | 'unhealthy'`.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apps/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `apm.captureError(error[, options][, callback])` [apm-capture-error]

Added in: v0.1.0

* `error` - Can be either an [`<Error>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object, a [message string](#message-strings), or a [special parameterized message object](#parameterized-message-object)
* `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The following options are supported:

    * `timestamp` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the error happened. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used
    * `message` - If the `error` argument is an [`<Error>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object, it’s possible to use this option to supply an additional message string that will be stored along with the error message under `log.message`
    * `user` - See [metadata section](#metadata) for details about this option
    * `custom` - See [metadata section](#metadata) for details about this option
    * `request` [`<http.IncomingMessage>`](https://nodejs.org/api/http.html#http_class_http_incomingmessage) You can associate an error with information about the incoming request to gain additional context such as the request url, headers, and cookies. However, in most cases, the agent will detect if an error was in response to an http request and automatically add the request details for you. See [http requests section](#http-requests) for more details.
    * `response` [`<http.ServerResponse>`](https://nodejs.org/api/http.html#http_class_http_serverresponse) You can associate an error with information about the http response to get additional details such as status code and headers. However, in most cases, the agent will detect if an error occured during an http request and automatically add response details for you. See [http responses section](#http-responses) for more details.
    * `handled` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) Adds additional context to the exception to show whether the error is handled or uncaught. Unhandled errors are immediately flushed to APM server, in case the application is about the crash. **Default:** `true`.
    * `labels` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Add additional context with labels, these labels will be added to the error along with the labels from the current transaction. See the [`apm.addLabels()`](#apm-add-labels) method for details about the format.
    * `captureAttributes` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) Whether to include properties on the given [`<Error>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object in the data sent to the APM Server (as `error.exception.attributes`). **Default:** `true`.
    * `skipOutcome` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) Whether to skip setting the outcome value for the current span to `failure`.  See [Span outcome](/reference/span-api.md#span-outcome) for more information. **Default:** `false`.
    * `parent` [Transaction](/reference/transaction-api.md) | [Span](/reference/span-api.md) | `null` - A Transaction or Span instance to make the parent of this error. If not given (or `undefined`), then the current span or transaction will be used. If `null` is given, then no span or transaction will be used. (Added in v3.33.0.)

* `callback` - Will be called after the error has been sent to the APM Server. It will receive an `Error` instance if the agent failed to send the error, and the id of the captured error.

Send an error to the APM Server:

```js
apm.captureError(new Error('boom!'))
```

### Message strings [message-strings]

Instead of an `Error` object, you can log a plain text message:

```js
apm.captureError('Something happened!')
```

This will also be sent as an error to the APM Server, but will not be associated with an exception.


### Parameterized message object [parameterized-message-object]

Instead of an `Error` object or a string, you can supply a special parameterized message object:

```js
apm.captureError({
  message: 'Could not find user %s with id %d in the database',
  params: ['Peter', 42]
})
```

This makes it possible to better group error messages that contain variable data like ID’s or names.


### Metadata [metadata]

To ease debugging it’s possible to send some extra data with each error you send to the APM Server. The APM Server intake API supports a lot of different metadata fields, most of which are automatically managed by the Elastic APM Node.js Agent. But if you wish you can supply some extra details using `user` or `custom`. For more details on the properties accepted by the events intake API see the [events intake API docs](docs-content://solutions/observability/apps/elastic-apm-events-intake-api.md).

To supply any of these extra fields, use the optional options argument when calling `apm.captureError()`.

Here are some examples:

```js
// Sending some extra details about the user
apm.captureError(error, {
  user: {
    id: 'unique_id',
    username: 'foo',
    email: 'foo@example.com'
  }
})

// Sending some arbitrary details using the `custom` field
apm.captureError(error, {
  custom: {
    some_important_metric: 'foobar'
  }
})
```

To supply per-request metadata to all errors captured in one central location, use [`apm.setUserContext()`](#apm-set-user-context) and [`apm.setCustomContext()`](#apm-set-custom-context).


### HTTP requests [http-requests]

Besides the options described in the [metadata section](#metadata), you can use the `options` argument to associate the error with an HTTP request:

```js
apm.captureError(err, {
  request: req // an instance of http.IncomingMessage
})
```

This will log the URL that was requested, the HTTP headers, cookies and other useful details to help you debug the error.

In most cases, this isn’t needed, as the agent is pretty smart at figuring out if your Node.js app is an HTTP server and if an error occurred during an incoming request. In which case it will automate this processes for you.


### HTTP responses [http-responses]

Besides the options described in the [metadata section](#metadata), you can use the `options` argument to associate the error with an HTTP response:

```js
apm.captureError(err, {
  response: res // an instance of http.ServerResponse
})
```

This will log the response status code, headers and other useful details to help you debug the error.

In most cases, this isn’t needed, as the agent is pretty smart at figuring out if your Node.js app is an HTTP server and if an error occurred during an incoming request. In which case it will automate this processes for you.



## `apm.middleware.connect()` [apm-middleware-connect]

Added in: v0.1.0

Returns a middleware function used to collect and send errors to the APM Server.

```js
const apm = require('elastic-apm-node').start()
const connect = require('connect')

const app = connect()

// your regular middleware:
app.use(...)
app.use(...)

// your main HTTP router
app.use(function (req, res, next) {
  throw new Error('Broke!')
})

// add Elastic APM in the bottom of the middleware stack
app.use(apm.middleware.connect())

app.listen(3000)
```

::::{note}
`apm.middleware.connect` *must* be added to the middleware stack *before* any other error handling middleware functions or there’s a chance that the error will never get to the agent.
::::



## `apm.startTransaction([name][, type][, options])` [apm-start-transaction]

Added in: v0.1.0<br> Transaction `subtype` and `action` deprecated in: v3.25.0<br> Transaction `subtype` and `action` removed in: v4.0.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The name of the transaction. You can always set this later via [`transaction.name`](/reference/transaction-api.md#transaction-name) or [`apm.setTransactionName()`](#apm-set-transaction-name). **Default:** `unnamed`
* `type` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The type of the transaction. You can always set this later via [`transaction.type`](/reference/transaction-api.md#transaction-type).
* `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The following options are supported:

    * `startTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the transaction started. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used
    * `childOf` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) A W3C trace-context "traceparent" string, typically received from a remote service call.
    * `tracestate` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) A W3C trace-context "tracestate" string.
    * `links` [`<Array>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) Span links. A transaction can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `links` argument is an array of objects with a single "context" field that is a `Transaction`, `Span`, or W3C trace-context *traceparent* string. For example: `apm.startTransaction('aName', { links: [{ context: anotherSpan }] })`.


Start a new custom/manual transaction. See the [Transaction API](/reference/transaction-api.md) docs for details on how to use custom transactions.

Note that the APM agent will automatically start a transaction for incoming HTTP requests. You only need to use this function to create custom transactions, for example for a periodic background routine. There’s a special `type` called `request` which is used by the agent for the transactions automatically created when an incoming HTTP request is detected.

If the APM agent has not yet been started, then a do-nothing "no-op" transaction object will be returned.


## `apm.endTransaction([result][, endTime])` [apm-end-transaction]

Added in: v0.1.0

* `result` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Describes the result of the transaction. This is typically the HTTP status code, or e.g. "success" or "failure" for a background task
* `endTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the transaction ended. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used

Ends the active transaction. If no transaction is currently active, nothing happens.

Note that the agent will do this for you automatically for all regular HTTP transactions. You only need to use this function to end custom transactions created by [`apm.startTransaction()`](#apm-start-transaction) or if you wish the end a regular transaction prematurely.

Alternatively you can call [`end()`](/reference/transaction-api.md#transaction-end) directly on an active transaction object.


## `apm.currentTransaction` [apm-current-transaction]

Added in: v1.9.0

Get the currently active transaction, if used within the context of a transaction.

::::{note}
If there’s no active transaction available, `null` will be returned.
::::



## `apm.currentSpan` [apm-current-span]

Added in: v2.0.0

Get the currently active span, if used within the context of a span.

::::{note}
If there’s no active span available, `null` will be returned.
::::



## `apm.currentTraceparent` [apm-current-traceparent]

Added in: v2.9.0

Get the serialized traceparent string of the current transaction or span.

::::{note}
If there’s no active transaction or span available, `null` will be returned.
::::



## `apm.setTransactionName(name)` [apm-set-transaction-name]

Added in: v0.1.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Set or overwrite the name of the current transaction.

If you use a supported router/framework the agent will automatically set the transaction name for you.

If you do not use Express, hapi, koa-router, Restify, or Fastify or if the agent for some reason cannot detect the name of the HTTP route, the transaction name will default to `METHOD unknown route` (e.g. `POST unknown route`).

Read more about naming routes manually in the [Get started with a custom Node.js stack](/reference/custom-stack.md#custom-stack-route-naming) article.


## `apm.startSpan([name][, type][, subtype][, action][, options])` [apm-start-span]

Added in: v1.1.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The name of the span. You can alternatively set this via [`span.name`](/reference/span-api.md#span-name). **Default:** `unnamed`
* `type` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The type of the span. You can alternatively set this via [`span.type`](/reference/span-api.md#span-type).
* `subtype` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The subtype of the span. You can alternatively set this via [`span.subtype`](/reference/span-api.md#span-subtype).
* `action` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The action of the span. You can alternatively set this via [`span.action`](/reference/span-api.md#span-action).
* `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The following options are supported:

    * `startTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the span started. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used
    * `exitSpan` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) Make an "exit span". Exit spans represent outgoing communication. They are used to create a node in the [Service Map](docs-content://solutions/observability/apps/service-map.md) and a downstream service in the [Dependencies Table](docs-content://solutions/observability/apps/dependencies.md). The provided subtype will be used as the downstream service name.
    * `links` [`<Array>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) Span links. A span can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `links` argument is an array of objects with a single "context" field that is a `Transaction`, `Span`, or W3C trace-context *traceparent* string.  For example: `apm.startSpan('aName', { links: [{ context: anotherSpan }] })`.


Start and return a new custom span associated with the current active transaction. This is the same as getting the current transaction with `apm.currentTransaction` and, if a transaction was found, calling `transaction.startSpan(name, type, options)` on it.

When a span is started it will measure the time until [`span.end()`](/reference/span-api.md#span-end) is called.

See [Span API](/reference/span-api.md) docs for details on how to use custom spans.

::::{note}
If there’s no active transaction available, `null` will be returned.
::::



## `apm.handleUncaughtExceptions([callback])` [apm-handle-uncaught-exceptions]

Added in: v0.1.0

By default, the agent will terminate the Node.js process when an uncaught exception is detected. Use this function if you need to run any custom code before the process is terminated.

```js
apm.handleUncaughtExceptions(function (err) {
  // Do your own stuff... and then exit:
  process.exit(1)
})
```

The callback is called **after** the event has been sent to the APM Server with the following arguments:

* `err` [`<Error>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) the captured exception

This function will also enable the uncaught exception handler if it was disabled using the [`captureExceptions`](/reference/configuration.md#capture-exceptions) configuration option.

If you don’t specify a callback, the node process is terminated automatically when an uncaught exception has been captured and sent to the APM Server.

[It is recommended](https://nodejs.org/api/process.md#process_event_uncaughtexception) that you don’t leave the process running after receiving an uncaught exception, so if you are using the optional callback, remember to terminate the node process.


## `apm.flush([callback])` [apm-flush]

Added in: v0.12.0

```js
// with node-style callback
apm.flush(function (err) {
  // Flush complete
})

// with promises
apm.flush().then(function () {
  // Flush complete
}).catch(function (err) {
  // Flush returned an error
})

// inside of an async function
try {
  await apm.flush()
  // Flush complete
} catch (err) {
  // Flush returned an error
}
```

Manually end the active outgoing HTTP request to the APM Server. The HTTP request is otherwise ended automatically at regular intervals, controlled by the [`apiRequestTime`](/reference/configuration.md#api-request-time) and [`apiRequestSize`](/reference/configuration.md#api-request-size) config options.

If an optional `callback` is provided as the first argument to this method, it will call `callback(flushErr)` when complete. If no `callback` is provided, then a `Promise` will be returned, which will either resolve with `void` or reject with `flushErr`.

The callback is called (or the `Promise` resolves if no `callback` argument is provided) **after** the active HTTP request has ended. The callback is called even if no HTTP request is currently active.


## `apm.lambda([type, ]handler)` [apm-lambda]

Added in: v1.4.0

```js
exports.hello = apm.lambda(function (event, context, callback) {
  callback(null, `Hello, ${payload.name}!`)
})
```

Manually instrument an AWS Lambda function to form a transaction around each execution. Optionally, a type may also be provided to group lambdas together. By default, "lambda" will be used as the type name.

Read more lambda support in the [Lambda](/reference/lambda.md) article.


## `apm.addPatch(modules, handler)` [apm-add-patch]

Added in: v2.7.0

* `modules` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type[<string[\]>]` Name of module(s) to apply the patch to, when required.
* `handler` [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) | [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Must be a patch function or a path to a module exporting a patch function

    * `exports` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The original export object of the module
    * `agent` - The agent instance to use in the patch function
    * `options` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) The following options are supported:

        * `version` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<undefined>`](https://developer.mozilla.org/en-US/docs/Glossary/Undefined) The module version, if applicable.
        * `enabled` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) A flag indicating if the instrumentation is enabled. Any module patch can be disabled, by module name, with [`disableInstrumentations`](/reference/configuration.md#disable-instrumentations).


Register a module patch to apply on intercepted `require` calls.

A module can have any number of patches and will be applied in the order they are added.

```js
apm.addPatch('timers', (exports, agent, { version, enabled }) => {
  const setTimeout = exports.setTimeout
  exports.setTimeout = (fn, ms) => {
    const span = agent.startSpan('set-timeout')
    return setTimeout(() => {
      span.end()
      fn()
    }, ms)
  }

  return exports
})

// or ...

apm.addPatch('timers', './timer-patch')
```

This and the other "Patch"-related API methods should be called **before** starting the APM agent. Changes after the agent has started and relevant modules have been `require`d can have surprising caching behavior.


## `apm.removePatch(modules, handler)` [apm-remove-patch]

Added in: v2.7.0

Removes a module patch. This will generally only be needed when replacing an existing patch. To *disable* instrumentation while keeping context propagation support, see [`disableInstrumentations`](/reference/configuration.md#disable-instrumentations).

```js
apm.removePatch('timers', './timers-patch')

// or ...

apm.removePatch(['timers'], './timers-patch')

// or ...

apm.removePatch('timers', timerPatchFunction)
```


## `apm.clearPatches(modules)` [apm-clear-patches]

Added in: v2.7.0

Clear all patches for the given module. This will generally only be needed when replacing an existing patch. To *disable* instrumentation while keeping context propagation support, see [`disableInstrumentations`](/reference/configuration.md#disable-instrumentations).

```js
apm.clearPatches('timers')

// or ...

apm.clearPatches(['timers'])
```


## `apm.currentTraceIds` [apm-current-trace-ids]

Added in: v2.17.0

`apm.currentTraceIds` produces an object containing `trace.id` and either `transaction.id` or `span.id` when a current transaction or span is available. When no transaction or span is available it will return an empty object. This enables [log correlation](/reference/logs.md#log-correlation-ids) to APM traces with structured loggers.

```js
{
  "trace.id": "abc123",
  "transaction.id": "abc123"
}
// or ...
{
  "trace.id": "abc123",
  "span.id": "abc123"
}
```


## `apm.registerMetric(name[, labels], callback)` [apm-register-custom-metrics]

::::{warning}
This functionality is in technical preview and may be changed or removed in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.
::::


* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Name of the metrics.
* `labels` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Contains key/value pairs. Optional labels. Omittable.
* `callback` [`<Function>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function) Must be a function that returns the current metric value.

Register a metric callback.

Take care not to use the names of [built-in metrics](/reference/metrics.md).

```js
apm.registerMetric( 'ws.connections' , () => {
  return wss.clients.size;
})

// or, to additionally label the metric with "module: 'ws'":

apm.registerMetric( 'ws.connections' , {module : 'ws'}, () => {
  return wss.clients.size;
})
```


## `apm.setTransactionOutcome(outcome)` [apm-transaction-outcome]

Added in: v3.12.0

* `outcome` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)

Will set the outcome property on the *current* transaction.

See the [Transaction Outcome docs](/reference/transaction-api.md#transaction-outcome) for more information.


## `apm.setSpanOutcome(outcome)` [apm-span-outcome]

Added in: v3.12.0

* `outcome` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)

Will set the outcome property on the *current* span.

See the [Span Outcome docs](/reference/span-api.md#span-outcome) for more information.


