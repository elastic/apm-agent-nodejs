---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/transaction-api.html
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

# Transaction API [transaction-api]

A transaction groups multiple spans in a logical group.

To get a `Transaction` object, you need to call [`apm.startTransaction()`](/reference/agent-api.md#apm-start-transaction).

To see an example of using custom transactions, see the [Custom Transactions in Node.js](/reference/custom-transactions.md) article.

## `transaction.name` [transaction-name]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `unnamed`

The name of the transaction.

Can be used to set or overwrite the name of the transaction (visible in the performance monitoring breakdown). If you don’t have access to the current transaction, you can also set the name using [`apm.setTransactionName()`](/reference/agent-api.md#apm-set-transaction-name).

Transactions with the same name and [type](#transaction-type) are grouped together.


## `transaction.type` [transaction-type]

```{applies_to}
apm_agent_node: ga 0.1.0
```

Split components into `type`, `subtype` and `action` in: v3.0.0

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The type of the transaction.

There’s a special type called `request` which is used by the agent for the transactions automatically created when an incoming HTTP request is detected.


## `transaction.subtype` [v3.25.0] [transaction-subtype]

```{applies_to}
apm_agent_node: ga 3.0.0
```

Deprecated in: v3.25.0

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The subtype of the transaction. The transaction `subtype` field is deprecated: it is not used and will be removed in the next major version.


## `transaction.action` [v3.25.0] [transaction-action]

```{applies_to}
apm_agent_node: ga 3.0.0
```

Deprecated in: v3.25.0

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The action of the transaction. The transaction `action` field is deprecated: it is not used and will be removed in the next major version.


## `transaction.traceparent` [transaction-traceparent]

```{applies_to}
apm_agent_node: ga 2.9.0
```

Get the serialized traceparent string of the transaction.


## `transaction.result` [transaction-result]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `success`

A string describing the result of the transaction. This is typically the HTTP status code, or e.g. "success" or "failure" for a background task.


## `transaction.startSpan([name][, type][, subtype][, action][, options])` [transaction-start-span]

```{applies_to}
apm_agent_node: ga 2.0.0
```

Split `type` into `type`, `subtype` and `action` in: v3.0.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The name of the span. You can alternatively set this via [`span.name`](/reference/span-api.md#span-name). **Default:** `unnamed`
* `type` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The type of the span. You can alternatively set this via [`span.type`](/reference/span-api.md#span-type).
* `subtype` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The subtype of the span. You can alternatively set this via [`span.subtype`](/reference/span-api.md#span-subtype).
* `action` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) The action of the span. You can alternatively set this via [`span.action`](/reference/span-api.md#span-action).
* `options` - The following options are supported:

    * `startTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the span started. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used
    * `exitSpan` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) Make an "exit span". Exit spans represent outgoing communication. They are used to create a node in the [Service Map](docs-content://solutions/observability/apm/service-map.md) and a downstream service in the [Dependencies Table](docs-content://solutions/observability/apm/dependencies.md). The provided subtype will be used as the downstream service name.
    * `links` [`<Array>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) Span links. A span can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `links` argument is an array of objects with a single "context" field that is a `Transaction`, `Span`, or W3C trace-context *traceparent* string.  For example: `transaction.startSpan('aName', { links: [{ context: anotherSpan }] })`.


Start and return a new custom span associated with this transaction. When a span is started it will measure the time until [`span.end()`](/reference/span-api.md#span-end) is called.

See [Span API](/reference/span-api.md) docs for details on how to use custom spans.


## `transaction.setLabel(name, value[, stringify = true])` [transaction-set-label]

```{applies_to}
apm_agent_node: ga 0.1.0
```

Renamed from `transaction.setTag()` to `transaction.setLabel()`: v2.10.0
Added `stringify` argument in: v3.11.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
* `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.
* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
transaction.setLabel('productId', 42, false);
```

Set a label on the transaction. You can set multiple labels on the same transaction. If an error happens during the transaction, it will also get tagged with the same labels.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](/reference/agent-api.md#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apm/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `transaction.addLabels({ [name]: value }[, stringify = true])` [transaction-add-labels]

```{applies_to}
apm_agent_node: ga 1.5.0
```

Renamed from `transaction.addTags()` to `transaction.addLabels()`: v2.10.0
Added `stringify` argument in: v3.11.0

* `labels` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Contains key/value pairs:

    * `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
    * `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.

* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
transaction.addLabels({productId: 42, productName: 'butter'}, false);
```

Add several labels on the transaction. You can add labels multiple times. If an error happens during the transaction, it will also get tagged with the same labels.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](/reference/agent-api.md#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apm/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `transaction.ensureParentId()` [transaction-ensure-parent-id]

```{applies_to}
apm_agent_node: ga 2.0.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)

If the transaction does not already have a parent id, calling this method generates a new parent id, sets it as the parent id of this transaction, and returns it as a [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type).

This enables the correlation of the spans the JavaScript Real User Monitoring (RUM) agent creates for the initial page load with the transaction of the backend service. If your backend service generates the HTML page dynamically, initializing the JavaScript RUM agent with the value of this method allows analyzing the time spent in the browser vs in the backend services.

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

See the [JavaScript RUM agent documentation](apm-agent-rum-js://reference/index.md) for more information.


## `transaction.ids` [transaction-ids]

```{applies_to}
apm_agent_node: ga 2.17.0
```

Produces an object containing `transaction.id` and `trace.id`. This enables log correlation to APM traces with structured loggers.

```js
{
  "trace.id": "abc123",
  "transaction.id": "abc123"
}
```


## `transaction.end([result][, endTime])` [transaction-end]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* `result` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Describes the result of the transaction. This is typically the HTTP status code, or e.g. "success" or "failure" for a background task
* `endTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the transaction ended. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used

Ends the transaction. If the transaction has already ended, nothing happens.

Alternatively you can call [`apm.endTransaction()`](/reference/agent-api.md#apm-end-transaction) to end the active transaction.


## `transaction.outcome` [transaction-outcome]

```{applies_to}
apm_agent_node: ga 3.12.0
```

The Node.js agent automatically sets an `outcome` property on transactions.  This property will be one of three values:

* `success`: Indicates the transaction’s operation was a success.
* `failure`: Indicates the transaction’s operation was *not* a success.
* `unknown`: Indicates we were unable to determine if the transaction’s operation was a success or not.  An `unknown` outcome removes a transaction from error rate considerations.

A transaction is considered a success if the underlying HTTP request handling produces a response with a status code that is less than `500`.  A status code of `500` or greater is considered a failure.

Non-HTTP transactions will begin with an outcome of `unknown`.


## `transaction.setOutcome(outcome)` [transaction-setoutcome]

```{applies_to}
apm_agent_node: ga 3.12.0
```

* `outcome` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)

The `setOutcome` method allows an end user to override the Node.js agent’s default setting of a transaction’s `outcome` property.  The `setOutcome` method accepts a string of either `success`, `failure`, or `unknown`, and will force the agent to report this value for a specific span.


## `transaction.addLink(link)` [transaction-addlink]

```{applies_to}
apm_agent_node: ga 4.7.0
```

* `link` `{{type-link}}`

A transaction can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `link` argument is an object with a single "context" field that is a `Transaction`, `Span`, OpenTelemetry `SpanContext` object, or W3C trace-context *traceparent* string. For example: `transaction.addLink({ context: anotherSpan })`.


## `transaction.addLinks([links])` [transaction-addlinks]

```{applies_to}
apm_agent_node: ga 4.7.0
```

* `links` [`<Array>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) Span links.

Add span links to this transaction.

A transaction can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `link` argument is an object with a single "context" field that is a `Transaction`, `Span`, OpenTelemetry `SpanContext` object, or W3C trace-context *traceparent* string. For example: `transaction.addLinks([{ context: anotherSpan }])`.


