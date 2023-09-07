# Elastic APM Node.js Agent

This is the official Node.js [application performance monitoring](https://www.elastic.co/observability/application-performance-monitoring)
(APM) agent for the Elastic Observability solution. It is a Node.js package
that runs with your Node.js application to automatically capture errors, tracing
data, and performance metrics. APM data is sent to your Elastic Observability
deployment -- hosted in [Elastic's cloud](https://www.elastic.co/cloud/) or in
your own on-premises deployment -- where you can monitor your application,
create alerts, and quick identify root causes of service issues.

If you have any feedback or questions, please post them on the
[Discuss forum](https://discuss.elastic.co/tags/c/apm/nodejs).

[![npm](https://img.shields.io/npm/v/elastic-apm-node.svg)](https://www.npmjs.com/package/elastic-apm-node)
[![tests](https://github.com/github/docs/actions/workflows/test.yml/badge.svg)](https://github.com/elastic/apm-agent-nodejs/actions/workflows/test.yml)


## Installation

```
npm install --save elastic-apm-node
```

## Getting started

First, you will need an Elastic Stack deployment. This is a deployment of APM
Server (which receives APM data from the APM agent running in your application),
Elasticsearch (the database that stores all APM data), and Kibana (the
application that provides the interface to visualize and analyze the data). If
you do not already have an Elastic deployment to use, follow [this APM Quick
Start guide](https://www.elastic.co/guide/en/apm/guide/3.x/apm-quick-start.html)
to create a free trial on Elastic's cloud. From this deployment you will need
the APM **`serverUrl`** and **`secretToken`** (or a configured `apiKey`) to use
for configuring the APM agent.

Next, the best and easiest way to see how to install and start the APM agent is to follow
[one of the "Get started" guides](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/set-up.html)
for the web framework or technology that you are using:

- [Get started with Express](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/express.html)
- [Get started with Fastify](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/fastify.html)
- [Get started with Koa](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/koa.html)
- [Get started with hapi](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/hapi.html)
- [Get started with Restify](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/restify.html)
- [Get started with AWS Lambda](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/lambda.html)
- [Get started with Azure Functions](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/azure-functions.html)
- [Get started with TypeScript](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/typescript.html)

Typically, the quick start steps are:

1. Install the APM agent package as a dependency:

    ```
    npm install --save elastic-apm-node
    ```

2. Configure and start the APM agent. For the APM agent's automatic
   instrumentation of popular modules to work, it must be started **before your
   application imports its other dependencies**. For example, if you use
   CommonJS, then put this at the *very top* of your main application file:

    ```js
    require('elastic-apm-node').start({
        serverUrl: '<serverUrl from your Elastic Stack deployment>',
        secretToken: '<secretToken from your Elastic Stack deployment>'
        serviceName: '...', // https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/configuration.html#service-name
        environment: '...', // https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/configuration.html#environment
    });
    ```

There are other ways to start the APM agent: for example, to support starting
the APM agent without having to change application code; or to avoid certain
surprises when using TypeScript or other transpilers like Babel or esbuild. See
[Starting the agent](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/starting-the-agent.html)
for a reference of all ways to start the agent and for details on gotchas
with transpilers and bundlers (like Webpack and esbuild).

If your application is using ES modules, please see [ECMAScript module support](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/esm.html)
for the current *experimental* support.


## Documentation

The full [Node.js APM agent 3.x documentation is here](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/intro.html).
Some important links:

- [Release notes](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/release-notes.html)
- [Supported Technologies](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/supported-technologies.html) describes the supported Node.js versions, which modules (and version ranges) are automatically traced, and other technologies.
- [Configuring the agent](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/configuring-the-agent.html) describes the different ways to configure the APM agent (via options to `apm.start(...)`, environment variables, or other mechanisms).
- [Configuration options](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/configuration.html) is a full configuration reference.
- [Troubleshooting](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/troubleshooting.html) describes some common issues and a way to get debugging output from the APM agent for bug reports.
- [Upgrading](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/upgrading.html) includes a guide for upgrading from each past major version of the APM agent.
- [Metrics](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/metrics.html) describes the metrics that the APM agent automatically collects.
- The APM agent includes an [OpenTelemetry Bridge](https://www.elastic.co/guide/en/apm/agent/nodejs/3.x/opentelemetry-bridge.html) that allows one to use the vendor-agnostic OpenTelemetry API for manual instrumentation in your application, should you require manual instrumentation.


## Active release branches

The following git branches are active:

- The ["main" branch](https://github.com/elastic/apm-agent-nodejs/tree/main) is being used for **4.x releases**.
- The ["3.x" branch](https://github.com/elastic/apm-agent-nodejs/tree/3.x) is being used for **3.x maintenance releases**. The 3.x line will be [supported until 2024-03-07](https://www.elastic.co/support/eol) -- for 6 months after the release of v4.0.0.


## Contributing

Contributions are very welcome. You can get in touch with us through our
[Discuss forum](https://discuss.elastic.co/tags/c/apm/nodejs). If you have
found an issue, you can open an issue at <https://github.com/elastic/apm-agent-nodejs/issues>.

If you are considering contributing code to the APM agent, please read our
[contribution guide](CONTRIBUTING.md).

Please see [TESTING.md](TESTING.md) for instructions on how to run the test suite.


## License

[BSD-2-Clause](LICENSE)

<br>Made with ♥️ by Elastic and our community.
