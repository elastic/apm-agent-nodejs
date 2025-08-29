---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/upgrade-to-v3.html
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

# Upgrade to v3.x [upgrade-to-v3]

The following is a guide on upgrading your Node.js agent from version 2.x to version 3.x.

## Overview [v3-overview]

Version 3.0.0 of the Node.js agent supports Node.js v8 (from v8.6.0 and onwards), v10, and v12.


## Config options [v3-config-options]

The [`disableInstrumentations`](/reference/configuration.md#disable-instrumentations) config option now behaves differently if given the values `http` and/or `https`. Previously this would disable tracing of incoming and outgoing requests. Now this config option only deals with outgoing requests. To disable tracing of incoming http(s) requests, use the new [`instrumentIncomingHTTPRequests`](/reference/configuration.md#instrument-incoming-http-requests) config option.

It’s now possible to make use of manual instrumention while the [`instrument`](/reference/configuration.md#instrument) config option is set to `false`. This means that calls to for instance [`apm.startTransaction()`](/reference/agent-api.md#apm-start-transaction) or [`apm.startSpan()`](/reference/agent-api.md#apm-start-span) will produce transactions and spans even if `instrument` is set to `false`.


## API changes [v3-api-changes]

The `type` associated with transactions and spans is no longer dot-separated. Instead the `type` property has been split into three distinct properties: `type`, `subtype`, and `action`. This has resulted in changes to the following API’s:

* [`apm.startTransaction()`](/reference/agent-api.md#apm-start-transaction): Function arguments changed
* [`apm.startSpan()`](/reference/agent-api.md#apm-start-span): Function arguments changed
* [`transaction.startSpan()`](/reference/transaction-api.md#transaction-start-span): Function arguments changed
* [`transaction.type`](/reference/transaction-api.md#transaction-type): String format changed
* [`span.type`](/reference/span-api.md#span-type): String format changed

The following deprecated API’s has been removed:

* `apm.setTag()`: Replaced by [`apm.setLabel()`](/reference/agent-api.md#apm-set-label)
* `apm.addTags()`: Replaced by [`apm.addLabels()`](/reference/agent-api.md#apm-add-labels)
* `transaction.setTag()`: Replaced by [`transaction.setLabel()`](/reference/transaction-api.md#transaction-set-label)
* `transaction.addTags()`: Replaced by [`transaction.addLabels()`](/reference/transaction-api.md#transaction-add-labels)
* `span.setTag()`: Replaced by [`span.setLabel()`](/reference/span-api.md#span-set-label)
* `span.addTags()`: Replaced by [`span.addLabels()`](/reference/span-api.md#span-add-labels)


## Changes in collected data [v3-changes-in-collected-data]

When instrumenting a GraphQL server that is run by [`apollo-server-express`](https://www.npmjs.com/package/apollo-server-express) the Transaction type is now `graphql` instead of `request`.

All Spans whose type was previously `ext` is now `external`.


