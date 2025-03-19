---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/fastify.html
---

# Get started with Fastify [fastify]

Getting Elastic APM set up for your Fastify app is easy, and there are various ways you can tweak it to fit your needs.

Follow the guide below to get started, and for more advanced topics, check out the [API Reference](/reference/api.md).


## Installation [fastify-installation]

Add the `elastic-apm-node` module as a dependency to your application:

```bash
npm install elastic-apm-node --save
```


## Initialization [fastify-initialization]

It’s important that the agent is started before you require **any** other modules in your Node.js application - i.e. before `fastify`, `http`, etc.

This means that you should probably require and start the agent in your application’s main file (usually `index.js`, `server.js` or `app.js`).

Here’s a simple Fastify example with the Elastic APM agent installed:

```js
// Add this to the VERY top of the first file loaded in your app
var apm = require('elastic-apm-node').start({
  // Override service name from package.json
  // Allowed characters: a-z, A-Z, 0-9, -, _, and space
  serviceName: '',

  // Use if APM Server requires a token
  secretToken: '',

  // Use if APM Server uses API keys for authentication
  apiKey: '',

  // Set custom APM Server URL (default: http://127.0.0.1:8200)
  serverUrl: '',
})

// Require the framework and instantiate it
var fastify = require('fastify')({
  logger: true
})

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})

// Run the server!
fastify.listen(3000, function (err, address) {
  if (err) throw err
  fastify.log.info(`server listening on ${address}`)
})
```

The agent will now monitor the performance of your Fastify application and record any uncaught exceptions.


### Advanced configuration [fastify-advanced-configuration]

In the above example we initialize the agent by calling the [`start()`](/reference/agent-api.md#apm-start) function. This function takes an optional options object used to configure the agent. Any option not supplied via the options object can instead be configured using environment variables. So if you prefer, you can set the same configuration options using environment variables:

```bash
ELASTIC_APM_SERVICE_NAME=<service name>
ELASTIC_APM_SECRET_TOKEN=<token>
ELASTIC_APM_SERVER_URL=<server url>
```

And then just start the agent like so:

```js
// Start the agent before any thing else in your app
var apm = require('elastic-apm-node').start()
```

See all possible ways to configure the agent [in the API documentation](/reference/configuring-agent.md).


### Full documentation [fastify-full-documentation]

* [Setup and Configuration](/reference/advanced-setup.md)
* [API Reference](/reference/api.md)


## Performance monitoring [fastify-performance-monitoring]

Elastic APM automatically measures the performance of your Fastify application. It records spans for database queries, external HTTP requests, and other slow operations that happen during requests to your Fastify app.

By default, the agent will instrument [the most common modules](/reference/supported-technologies.md). To instrument other events, you can use custom spans. For information about custom spans, see the [Custom Spans section](/reference/custom-spans.md).

Spans are grouped in transactions - by default one for each incoming HTTP request. But it’s possible to create custom transactions not associated with an HTTP request. See the [Custom Transactions section](/reference/custom-transactions.md) for details.


### Unknown routes [fastify-unknown-routes]

When viewing the performance metrics of your application in Elastic APM, you might see some transactions named "unknown route". This indicates that the agent detected an incoming HTTP request to your application, but didn’t know which route in your Fastify app the HTTP request matched.

This might simply be 404 requests, which by definition don’t match any route, or it might be a symptom that the agent wasn’t installed correctly. If you see this or can’t get any meaningful metrics to show up, please follow the [Troubleshooting Guide](docs-content://troubleshoot/observability/apm-agent-nodejs/apm-nodejs-agent.md).


## Error logging [fastify-error-logging]

By default, the Node.js agent will watch for uncaught exceptions and send them to Elastic APM automatically. But in most cases, errors are not thrown but returned via a callback, caught by a promise, or simply manually created. Those errors will not automatically be sent to Elastic APM. To manually send an error to Elastic APM, simply call `apm.captureError()` with the error:

```js
var err = new Error('Ups, something broke!')

apm.captureError(err)
```

For advanced logging of errors, including adding extra metadata to the error, see [the API documentation](/reference/agent-api.md#apm-capture-error).


## Filter sensitive information [fastify-filter-sensitive-information]

By default, the Node.js agent will filter common sensitive information before sending errors and metrics to the Elastic APM server.

It’s possible for you to tweak these defaults or remove any information you don’t want to send to Elastic APM:

* By default, the Node.js agent will not log the body of HTTP requests. To enable this, use the [`captureBody`](/reference/configuration.md#capture-body) config option
* By default, the Node.js agent will filter certain HTTP headers known to contain sensitive information. To disable this, use the [`sanitizeFieldNames`](/reference/configuration.md#sanitize-field-names) config option
* To apply custom filters, use one of the [filtering](/reference/agent-api.md#apm-add-filter) functions


## Add your own data [fastify-add-your-own-data]

The Node.js agent will keep track of the active HTTP request and will link it to errors and recorded transaction metrics when they are sent to the Elastic APM server. This allows you to see details about which request resulted in a particular error or which requests cause a certain HTTP endpoint to be slow.

But in many cases, information about the HTTP request itself isn’t enough. To add even more metadata to errors and transactions, use one of the functions below:

* [`apm.setUserContext()`](/reference/agent-api.md#apm-set-user-context) - Call this to enrich collected performance data and errors with information about the user/client
* [`apm.setCustomContext()`](/reference/agent-api.md#apm-set-custom-context) - Call this to enrich collected performance data and errors with any information that you think will help you debug performance issues and errors (this data is only stored, but not indexed in Elasticsearch)
* [`apm.setLabel()`](/reference/agent-api.md#apm-set-label) - Call this to enrich collected performance data and errors with simple key/value strings that you think will help you debug performance issues and errors (labels are indexed in Elasticsearch)


## Compatibility [fastify-compatibility]

See [*Supported technologies*](/reference/supported-technologies.md) for details.

See also: [Fastify’s own LTS documentation.](https://www.fastify.io/docs/latest/LTS/)


## Troubleshooting [fastify-troubleshooting]

If you can’t get the Node.js agent to work as expected, please follow the [troubleshooting guide](docs-content://troubleshoot/observability/apm-agent-nodejs/apm-nodejs-agent.md).

