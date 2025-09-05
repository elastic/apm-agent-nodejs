---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/span-api.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# Span API [span-api]

A span measures the duration of a single event. When a span is created it will measure the time until [`span.end()`](#span-end) is called.

To get a `Span` object, you need to call [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).

To see an example of using custom spans, see the [Custom Spans in Node.js](/reference/custom-spans.md) article.

## `span.transaction` [span-transaction]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* **Type:** Transaction

A reference to the parent transaction object.

All spans belong to a transaction.


## `span.name` [span-name]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `unnamed`

The name of the span. This can also be set via [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).


## `span.type` [span-type]

```{applies_to}
apm_agent_node: ga 0.1.0
```

Split components into `type`, `subtype` and `action` in: v3.0.0

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The type of span. This can also be set via [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).

The type is used to group similar spans together. For instance, all spans of MySQL queries are given the type `db`, with a subtype of `mysql` and an action of `query`.

In the above example, `db` is considered the type. Though there are no naming restrictions for the type, the following are standardized across all Elastic APM agents: `app`, `db`, `cache`, `template`, and `ext`.


## `span.subtype` [span-subtype]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The subtype of the span. This can also be set via [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).

The subtype is typically the name of a module or library. For example, MySQL queries have a subtype of `mysql`.


## `span.action` [span-action]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) **Default:** `custom`

The action of the span. This can also be set via [`apm.startSpan()`](/reference/agent-api.md#apm-start-span).

The action is typically a specific function name or a general description of specific functionality. For example, a database query would generally have an action of `query`.


## `span.traceparent` [span-traceparent]

```{applies_to}
apm_agent_node: ga 2.9.0
```

Get the serialized traceparent string of the span.


## `span.setLabel(name, value[, stringify = true])` [span-set-label]

```{applies_to}
apm_agent_node: ga 2.1.0
```

Renamed from `span.setTag()` to `span.setLabel()`: v2.10.0
Added `stringify` argument in: v3.11.0

* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
* `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.
* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
span.setLabel('productId', 42, false);
```

Set a label on the span. You can set multiple labels on the same span.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](/reference/agent-api.md#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apm/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `span.addLabels({ [name]: value }[, stringify = true])` [span-add-labels]

```{applies_to}
apm_agent_node: ga 2.1.0
```

Renamed from `span.addTags()` to `span.addLabels()`: v2.10.0
Added `stringify` argument in: v3.11.0

* `labels` [`<Object>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) Contains key/value pairs:

    * `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) Any periods (`.`), asterisks (`*`), or double quotation marks (`"`) will be replaced by underscores (`_`), as those characters have special meaning in Elasticsearch
    * `value` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) | [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) If the `stringify` argument is not given, or set to `true` then the given value will be converted to a string.

* `stringify` [`<boolean>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type) This defaults to `true` for backwards compatibility, but new usage will typically want `false`. When true, if a non-string `value` is given, it is converted to a string before being sent to the APM Server.

```js
span.addLabels({productId: 42, productName: 'butter'}, false);
```

Add several labels on the span. You can add labels multiple times.

::::{tip}
Labels are key/value pairs that are indexed by Elasticsearch and therefore searchable (as opposed to data set via [`apm.setCustomContext()`](/reference/agent-api.md#apm-set-custom-context)). Before using custom labels, ensure you understand the different types of [metadata](docs-content://solutions/observability/apm/metadata.md) that are available.
::::


::::{warning}
Avoid defining too many user-specified labels. Defining too many unique fields in an index is a condition that can lead to a [mapping explosion](docs-content://manage-data/data-store/mapping.md#mapping-limit-settings).
::::



## `span.ids` [span-ids]

```{applies_to}
apm_agent_node: ga 2.17.0
```

Produces an object containing `span.id` and `trace.id`. This enables log correlation to APM traces with structured loggers.

```js
{
  "trace.id": "abc123",
  "span.id": "abc123"
}
```


## `span.end([endTime])` [span-end]

```{applies_to}
apm_agent_node: ga 0.1.0
```

* `endTime` [`<number>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type) The time when the span ended. Must be a Unix Time Stamp representing the number of milliseconds since January 1, 1970, 00:00:00 UTC. Sub-millisecond precision can be achieved using decimals. If not provided, the current time will be used

End the span. If the span has already ended, nothing happens.


## `span.outcome` [span-outcome]

```{applies_to}
apm_agent_node: ga 3.12.0
```

The Node.js agent automatically sets an `outcome` property on spans.  This property will be one of three values:

* `success`: Indicates the span’s operation was a success.
* `failure`: Indicates the span’s operation was *not* a success.
* `unknown`: Indicates the agent was unable to determine whether the span’s operation was a success or not. An `unknown` outcome removes a transaction from error rate considerations.

What constitutes a success or failure will depend on the span type.

For the general case, a span’s outcome is considered a failure if the Node.js agent captures an error during the execution of the work a span represents.

However, for exit spans that represent an HTTP request, the `outcome` is based on the status code of the HTTP response.  A status code less than `400` is considered a success.  A status code greater or equal to `400` is considered a failure.


## `span.setOutcome(outcome)` [span-setoutcome]

```{applies_to}
apm_agent_node: ga 3.12.0
```

* `outcome` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type)

The `setOutcome` method allows an end user to override the Node.js agent’s default setting of a span’s `outcome` property.  The `setOutcome` method accepts a string of either `success`, `failure`, or `unknown`, and will force the agent to report this value for a specific span.


## `span.setServiceTarget(type, name)` [span-setservicetarget]

```{applies_to}
apm_agent_node: ga 3.39.0
```

* `type` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | null The target service type, usually the same value as `span.subtype`, e.g. "mysql".
* `name` [`<string>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type) | null The target service name, an optional scoping of the service. For databases it is typically the database name.

Manually set the `service.target.type` and `service.target.name` fields that identify a downstream service. They are used for [Service Maps](docs-content://solutions/observability/apm/service-map.md) and [Dependencies](docs-content://solutions/observability/apm/dependencies.md) in the Kibana APM app.  The values are only used for "exit" spans — spans representing outgoing communication, marked with `exitSpan: true` at span creation.

If false-y values (e.g. `null`) are given for both `type` and `name`, then `service.target` will explicitly be excluded from this span. This may impact Service Maps and other Kibana APM app reporting for this service.

If this method is not called, the service target values are inferred from other span fields ([spec](https://github.com/elastic/apm/blob/main/specs/agents/tracing-spans-service-target.md#field-values)).

`service.target.*` fields are ignored for APM Server before v8.3.


## `span.addLink(link)` [span-addlink]

```{applies_to}
apm_agent_node: ga 4.7.0
```

* `link` `{{type-link}}`

A span can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `link` argument is an object with a single "context" field that is a `Transaction`, `Span`, OpenTelemetry `SpanContext` object, or W3C trace-context *traceparent* string. For example: `span.addLink({ context: anotherSpan })`.


## `span.addLinks([links])` [span-addlinks]

```{applies_to}
apm_agent_node: ga 4.7.0
```

* `links` [`<Array>`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) Span links.

Add span links to this span.

A span can refer to zero or more other transactions or spans (separate from its parent). Span links will be shown in the Kibana APM app trace view. The `link` argument is an object with a single "context" field that is a `Transaction`, `Span`, OpenTelemetry `SpanContext` object, or W3C trace-context *traceparent* string. For example: `span.addLinks([{ context: anotherSpan }])`.


