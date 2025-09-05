---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/metrics.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# Metrics [metrics]

The Node.js agent tracks various system and application metrics. These metrics will be sent regularly to the APM Server and from there to Elasticsearch. You can adjust the interval by setting [`metricsInterval`](/reference/configuration.md#metrics-interval).

The metrics will be stored in the `apm-*` index and have the `processor.event` property set to `metric`.


## `system.cpu.total.norm.pct` [metric-system.cpu.total.norm.pct]

* **Type:** Float
* **Format:** Percent

The percentage of CPU time in states other than Idle and IOWait, normalized by the number of cores.


## `system.memory.total` [metric-system.memory.total]

* **Type:** Long
* **Format:** Bytes

The total memory of the system in bytes.


## `system.memory.actual.free` [metric-system.memory.actual.free]

* **Type:** Long
* **Format:** Bytes

Free memory of the system in bytes.


## `system.process.cpu.total.norm.pct` [metric-system.process.cpu.total.norm.pct]

* **Type:** Float
* **Format:** Percent

The percentage of CPU time spent by the process since the last event. This value is normalized by the number of CPU cores and it ranges from 0 to 100%.


## `system.process.memory.rss.bytes` [metric-system.process.memory.rss.bytes]

* **Type:** Long
* **Format:** Bytes

The Resident Set Size, the amount of memory the process occupies in main memory (RAM).


## `nodejs.handles.active` [metric-nodejs.handles.active]

* **Type:** Long
* **Format:** Counter

The number of active libuv handles, likely held open by currently running I/O operations.


## `nodejs.requests.active` [metric-nodejs.requests.active]

* **Type:** Long
* **Format:** Counter

The number of active libuv requests, likely waiting for a response to an I/O operation.


## `system.process.cpu.user.norm.pct` [metric-system.process.cpu.user.norm.pct]

* **Type:** Long
* **Format:** Counter

The number of CPU cycles spent executing application code.


## `system.process.cpu.system.norm.pct` [metric-system.process.cpu.system.norm.pct]

* **Type:** Long
* **Format:** Counter

The number of CPU cycles spent executing kernel code as a result of application activity.


## `nodejs.eventloop.delay.avg.ms` [metric-nodejs.eventloop.delay.avg.ms]

* **Type:** Float
* **Format:** Milliseconds

The number of milliseconds of event loop delay. Event loop delay is sampled every 10 milliseconds. Delays shorter than 10ms may not be observed, for example if a blocking operation starts and ends within the same sampling period.


## `nodejs.memory.heap.allocated.bytes` [metric-nodejs.memory.heap.allocated.bytes]

* **Type:** Long
* **Format:** Bytes

The current allocated heap size in bytes.


## `nodejs.memory.heap.used.bytes` [metric-nodejs.memory.heap.used.bytes]

* **Type:** Long
* **Format:** Bytes

The currently used heap size in bytes.


## `nodejs.memory.external.bytes` [metric-nodejs.memory.external.bytes]

* **Type:** Long
* **Format:** Bytes

Memory usage of C++ objects bound to JavaScript objects managed by V8.


## `nodejs.memory.arrayBuffers.bytes` [metric-nodejs.memory.arrayBuffers.bytes]

* **Type:** Long
* **Format:** Bytes

Memory allocated for ArrayBuffers and SharedArrayBuffers, including all Node.js Buffers. This is also included in the `nodejs.memory.external.bytes` value.


## `span.self_time.sum` [metrics-span.self_time.sum]

* **Type:** Long
* **Format:** Milliseconds

The sum of all span self-times in milliseconds since the last report (the delta). The `span.self_time.*` metrics are referred to as "breakdown metrics".

You can filter and group by these dimensions:

* `transaction.name`: The name of the transaction
* `transaction.type`: The type of the transaction, for example `request`
* `span.type`: The type of the span, for example `app`, `template` or `db`
* `span.subtype`: The sub-type of the span, for example `mysql` (optional)


## `span.self_time.count` [metrics-span.self_time.count]

* **Type:** Long
* **Format:** Counter

You can filter and group by these dimensions:

* `transaction.name`: The name of the transaction
* `transaction.type`: The type of the transaction, for example `request`
* `span.type`: The type of the span, for example `app`, `template` or `db`
* `span.subtype`: The sub-type of the span, for example `mysql` (optional)

