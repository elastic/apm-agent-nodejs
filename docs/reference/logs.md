---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/logs.html
---

# Logs [logs]

The Elastic APM Node.js Agent provides support for [Log correlation](#log-correlation-ids). When used together with the [`ecs-logging-nodejs` packages](ecs-logging-nodejs://reference/index.md), correlation IDs will be automatically injected into log records to allow navigation between logs, traces, and services.

This feature is part of [Application log ingestion strategies](docs-content://solutions/observability/logs/stream-application-logs.md).


## Log correlation [log-correlation-ids]

[Log correlation](docs-content://solutions/observability/apm/logs.md) allows you to navigate to all logs belonging to a particular trace and vice-versa: for a specific log, see in which context it has been logged and which parameters the user provided.

In order to correlate logs from your application with traces captured by the Elastic APM Node.js Agent, your logs must contain the following identifiers:

* [`trace.id`](ecs://reference/ecs-tracing.md)
* [`transaction.id`](ecs://reference/ecs-tracing.md) or [`span.id`](ecs://reference/ecs-tracing.md)

The APM Node.js Agent provides the [`apm.currentTraceIds`](/reference/agent-api.md#apm-current-trace-ids) API for this. If your application is also using one of the [ECS formatting plugin packages](ecs-logging-nodejs://reference/index.md) (available for Pino, Winston, and Morgan), then this APM Agent API will automatically be used to inject the appropriate tracing fields into your log records. Otherwise, configure your logger to add these fields when emitting a log record.

When your logs contain the appropriate identifiers, the final step is to ingest them into the same Elasticsearch instance that contains your APM data. See [Ingest your logs into Elasticsearch](docs-content://solutions/observability/logs/stream-application-logs.md) for more information.

