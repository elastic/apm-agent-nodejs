---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/performance-tuning.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# Performance Tuning [performance-tuning]

The Node.js APM agent offers a variety of [configuration options](/reference/configuration.md), some of which can have a significant impact on performance. Areas where APM agent overhead might be seen are: CPU, memory, network, latency, and storage. This document discusses the options most significant for performance tuning the APM agent.


## Sample rate [performance-sampling]

The *sample rate* is the percentage of incoming requests that are recorded and sent to the APM Server. This is controlled by the [`transactionSampleRate`](/reference/configuration.md#transaction-sample-rate) configuration option. By default *all* requests are traced (`transactionSampleRate: 1.0`).

The amount of work the APM agent needs to do, generally scales linearly with the number of traced requests. Therefore, the sample rate impacts CPU, memory, network, and storage overhead.

Applications with a high request rate and/or many spans per incoming request may want to lower the the sampling rate. For example, see the example below to trace 20% of incoming requests. Note that incoming HTTP requests that are part of a [distributed trace](/reference/distributed-tracing.md) already have the sampling decision made — the `traceparent` header includes a [sampled flag](https://w3c.github.io/trace-context/#sampled-flag). In these cases the `transactionSampleRate` setting will not apply.

```js
require('elastic-apm-node').start({
  transactionSampleRate: 0.2 // sample 20% of incoming requests
})
```


## Stack Traces [performance-stack-traces]

When the APM agent captures an error, it records its stack trace for later analysis and viewing. Optionally, the APM agent can also record a stack trace for captured **spans**. Stack traces can have a significant impact on CPU and memory usage of the agent. There are several settings to adjust how they are used.


### Span Stack Traces [performance-span-stack-traces]

The [`spanStackTraceMinDuration`](/reference/configuration.md#span-stack-trace-min-duration) configuration option controls if stack traces are never captured for spans (the default), always captured for spans, or only captured for spans that are longer than a given duration. In a complex application, a traced request may capture many spans. Capturing and sending a stack trace for every span can result in significant CPU and memory usage.

It is because of the possibility of this CPU overhead that the APM Agent disables stack trace collection for *spans* by default. Unfortunately, even the capturing of raw stack trace data at span creation and then throwing that away for fast spans can have significant CPU overhead for heavily loaded applications. Therefore, care must be taken before using `spanStackTraceMinDuration`.


### Stack Trace Source Lines [performance-source-lines]

If you want to keep span stack traces enabled for context, the next thing to try is adjusting how many source lines are reported for each stack trace. When a stack trace is captured, the agent will also capture several lines of source code around each stack frame location in the stack trace.

The are four different settings to control this behaviour:

* [`sourceLinesErrorAppFrames`](/reference/configuration.md#source-context-error-app-frames)
* [`sourceLinesErrorLibraryFrames`](/reference/configuration.md#source-context-error-library-frames)
* [`sourceLinesSpanAppFrames`](/reference/configuration.md#source-context-span-app-frames)
* [`sourceLinesSpanLibraryFrames`](/reference/configuration.md#source-context-span-library-frames)

Source line settings are divided into app frames representing your app code and library frames representing the code of your dependencies. App and library categories are both split into error and span groups. Spans, by default, do not capture source lines. Errors, by default, will capture five lines of code around each stack frame.

Source lines are cached in-process. In memory-constrained environments, the source line cache may use more memory than desired. Turning the limits down will help prevent excessive memory use.


### Stack Frame Limit [performance-stack-frame-limit]

The [`stackTraceLimit`](/reference/configuration.md#stack-trace-limit) configuration option controls how many stack frames are captured when producing an `Error` instance of any kind. A large value may impact CPU and memory overhead of the agent.


### Error Log Stack Traces [performance-error-log-stack-traces]

Most stack traces recorded by the agent will point to where the error was instantiated, not where it was identified and reported to the agent with [`captureError`](/reference/agent-api.md#apm-capture-error). For this reason, the agent also has the [`captureErrorLogStackTraces`](/reference/configuration.md#capture-error-log-stack-traces) setting to enable capturing an additional stack trace pointing to the place an error was reported to the agent. By default, it will only capture the stack trace to the reporting point when [`captureError`](/reference/agent-api.md#apm-capture-error) is called with a string message.

Setting this to `always` will increase memory and bandwidth usage, so it helps to consider how frequently the app may capture errors.


## Spans [performance-transaction-max-spans]

The [`transactionMaxSpans`](/reference/configuration.md#transaction-max-spans) setting limits the number of spans which may be recorded within a single transaction before remaining spans are dropped.

Spans may include many things such as a stack trace and context data. Limiting the number of spans that may be recorded will reduce memory usage.

Reducing max spans could result in loss of useful data about what occurred within a request, if it is set too low.

An alternative to limiting the maximum number of spans can be to drop spans with a very short duration, as those might not be that relevant.

This, however, both reduces the amount of storage needed to store the spans in Elasticsearch, and the bandwidth needed to transport the data to the APM Server from the instrumented application.

This can be implemented by providing a span-filter:

```js
agent.addSpanFilter(payload => {
  return payload.duration < 10 ? null : payload
})
```

::::{note}
Using a span filter does not reduce the load of recording the spans in your application, but merely filters them out before sending them to the APM Server.
::::



## Max queue size [performance-max-queue-size]

The APM agent uses a persistent outgoing HTTP request (periodically refreshed) to stream data to the APM Server. If either the APM agent cannot keep up with events (transactions, spans, errors, and metricsets) from the application or if the APM Server is slow or not responding, then the agent will buffer events. If the buffer exceeds [`maxQueueSize`](/reference/configuration.md#max-queue-size), then events are dropped to limit memory usage of the agent.

A lower value for `maxQueueSize` will decrease the heap overhead (and possibly the CPU usage) of the agent, while a higher value makes it less likely to lose events in case of a temporary spike in throughput.

