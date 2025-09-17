---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/intro.html
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/index.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# APM Node.js agent [intro]

The Elastic APM Node.js Agent sends performance metrics and errors to the APM Server. It has built-in support for the most popular frameworks and routers, as well as a simple API which allows you to instrument any application.


## How does the Agent work? [how-it-works]

The agent auto-instruments [supported frameworks](/reference/supported-technologies.md#compatibility-frameworks) and records interesting events, like HTTP requests and database queries. To do this, it patches modules as they are loaded to capture when module functions and callbacks are called. Additionally, there are some cases where a module will be patched to allow tracing context to be propagated through the asynchronous continuation. This means that for the supported technologies, there are no code changes required.

The Agent automatically links module function calls to callback calls to measure their duration and metadata (like the DB statement), as well as HTTP related information (like the URL, parameters, and headers).

These events, called Transactions and Spans, are sent to the APM Server. The APM Server converts them to a format suitable for Elasticsearch, and sends them to an Elasticsearch cluster. You can then use the APM app in Kibana to gain insight into latency issues and error culprits within your application.


## Additional Components [additional-components]

APM Agents work in conjunction with the [APM Server](docs-content://solutions/observability/apm/index.md), [Elasticsearch](docs-content://get-started/index.md), and [Kibana](docs-content://get-started/the-stack.md). The [APM Guide](docs-content://solutions/observability/apm/index.md) provides details on how these components work together, and provides a matrix outlining [Agent and Server compatibility](docs-content://solutions/observability/apm/apm-agent-compatibility.md).

## Troubleshooting

If you're experiencing issues with the APM Node.js agent, refer to [Troubleshooting](docs-content:///troubleshoot/observability/apm-agent-nodejs/apm-nodejs-agent.md).