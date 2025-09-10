---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/upgrade-to-v2.html
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

# Upgrade to v2.x [upgrade-to-v2]

The following is a guide on upgrading your Node.js agent from version 1.x to version 2.x.

## Overview [v2-overview]

Version 2.0.0 of the Node.js agent requires version 6.5 of the APM Server or higher and makes use of the new HTTP intake API.

The new agent supports Node.js 6, 8, and 10+.

The format of the error ID’s have changed from a UUID4 to a hex formatted random 128 bit number. Likewise, the format of the transaction ID’s have changed from a UUID4 to a hex formatted random 64 bit number.


## Config options [v2-config-options]

### Configuration order [v2-configuration-order]

The Node.js agent can be configured using a combination of inline config options, environment variables, and a config file. Many config options also have default values. The order in which these are applied has changed in 2.0.0.

In 1.x the order in which config options overruled each other was (higher overwrites lower):

* Inline options given to [`.start()`](/reference/agent-api.md#apm-start)
* [Agent config file](/reference/configuring-agent.md#agent-configuration-file)
* Environment variables
* Default values

The new order in 2.0.0 is (higher overwrites lower):

* Environment variables
* Inline options given to [`.start()`](/reference/agent-api.md#apm-start)
* [Agent config file](/reference/configuring-agent.md#agent-configuration-file)
* Default values


### Changed units [v2-changed-units]

In 1.x, the config option [`abortedErrorThreshold`](/reference/configuration.md#aborted-error-threshold) expected a millisecond value. In 2.0.0 the default time unit is seconds. If you’d like to keep using milliseconds, you need to specify the unit, e.g: `1500ms`.

In 1.x, all boolean config options could be configured using the strings `on`, `yes`, `1`, etc., to mean `true` with similar values representing `false`. In 2.0.0 this has been restricted, and only the strings `true` and `false` will be interpreted as the boolean equivalent.


### Removed config options [v2-removed-config-options]

The following config options have been removed in version 2.0.0:

|     |     |
| --- | --- |
| Name | Note |
| `flushInterval` | Use [`apiRequestTime`](/reference/configuration.md#api-request-time) instead. Note that this option has a slightly different meaning as the intake API has changed. |
| `maxQueueSize` | Use [`apiRequestSize`](/reference/configuration.md#api-request-size) instead. Note that this option has a slightly different meaning as the intake API has changed. |



## Agent API [v2-agent-api]

The [`agent.addFilter()`](/reference/agent-api.md#apm-add-filter) callback is called with a different payload in 2.0.0 (see docs for details).

::::{note}
While the `addFilter()` function is still called for all types of data sent to the APM Server, three new filter functions have been added in 2.0.0 as well: [`agent.addErrorFilter()`](/reference/agent-api.md#apm-add-error-filter), [`agent.addTransactionFilter()`](/reference/agent-api.md#apm-add-transaction-filter), and [`agent.addSpanFilter()`](/reference/agent-api.md#apm-add-span-filter), called only for errors, transactions, and spans respectively.

::::


The previously undocumented method `span.offsetTime()` has been removed in 2.0.0.

The previously undocumented `transaction.buildSpan()` method has been replaced with [`transaction.startSpan(name, type)`](/reference/transaction-api.md#transaction-start-span) in 2.0.0.

The `agent.buildSpan(name, type)` and `span.start(name, type)` methods have been removed in 2.0.0. They have been replaced by [`agent.startSpan(name, type)`](/reference/agent-api.md#apm-start-span).


