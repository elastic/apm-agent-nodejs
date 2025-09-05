---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/esm.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: preview
---

# ECMAScript module support [esm]

::::{note}
ECMAScript module support is currently incomplete and experimental. It was added in version v3.48.0.
::::


The Elastic APM Node.js agent includes *limited and experimental* support for auto-instrumentation of [ECMAScript modules](https://nodejs.org/api/esm.html#modules-ecmascript-modules) (ESM) — i.e. modules loaded via the `import ...` statement or the `import(...)` expression.  Support is based on the experimental [Node.js Loaders API](https://nodejs.org/api/#loaders), which requires passing the `--experimental-loader` option to node.

As a first example, the APM agent can provide HTTP tracing for the following Express server:

```js
// server.mjs
import bodyParser from 'body-parser'
import express from 'express'

const app = express()
app.use(bodyParser.json())
app.get('/hello/:name', function (request, reply) {
  reply.send({ hello: request.params.name })
})

app.listen({ port: 3000}, () => {
  console.log('Server is listening. Try:\n  curl -i http://localhost:3000/hello/grace')
})
```

when invoked as follows:

```bash
export ELASTIC_APM_SERVER_URL='https://...apm...cloud.es.io:443'
export ELASTIC_APM_SECRET_TOKEN='...'
node -r elastic-apm-node/start.js \
  --experimental-loader=elastic-apm-node/loader.mjs \
  node server.mjs
```

The current ESM support is limited — only a subset of the modules listed at [*Supported technologies*](/reference/supported-technologies.md) are implemented. More will be added in subsequent releases. See below for full details.

The ESM limitations only affects the agent’s automatic instrumentation. Other functionality — such as metrics collection, manual instrumentation and error capture — still work when using ES modules.


## Enabling ESM auto-instrumentation [esm-enabling]

Enabling ESM auto-instrumentation requires starting Node.js with the `--experimental-loader=elastic-apm-node/loader.mjs` option. This can be done by passing the argument on the command line or by setting the [`NODE_OPTIONS`](https://nodejs.org/api/all.html#all_cli_node_optionsoptions) environment variable.

```bash
node --experimental-loader=elastic-apm-node/loader.mjs server.mjs

# or

NODE_OPTIONS='--experimental-loader=elastic-apm-node/loader.mjs'
node server.mjs
```

As well, the APM agent must also be separately **started** — for example via `--require=elastic-apm-node/start.js`. See [Starting the agent](/reference/starting-agent.md) for the various ways of starting the APM agent.


## Supported Node.js versions [esm-compat-node]

Automatic instrumentation of ES modules is based on the experimental Node.js Loaders API. ESM support in the Elastic APM Node.js agent will remain **experimental** while the Loaders API is experimental.

ESM auto-instrumentation is only supported for Node.js versions that match **`^12.20.0 || ^14.13.1 || ^16.0.0 || ^18.1.0 || >=20.2.0`**. The behavior when using `node --experimental-loader=elastic-apm-node/loader.mjs` with earlier Node.js versions is undefined and unsupported.


## Supported modules [esm-compat-modules]

Automatic instrumentation of ES modules is currently limited as described here. Note that the supported module version ranges often differ from those for CommonJS (i.e. `require()`) auto-instrumentation.

| Module | Version | Note |  |
| --- | --- | --- | --- |
| `@aws-sdk/client-dynamodb` | >=3.15.0 <4 |  |  |
| `@aws-sdk/client-s3` | >=3.15.0 <4 |  |  |
| `@aws-sdk/client-sns` | >=3.15.0 <4 |  |  |
| `@aws-sdk/client-sqs` | >=3.15.0 <4 |  |  |
| `cassandra-driver` | >=3.0.0 <5 |  |  |
| `express` | >=4.0.0 <6 |  |  |
| `fastify` | >=3.5.0 |  |  |
| `http` |  | See [Supported Node.js versions](#esm-compat-node) above. |  |
| `https` |  | See [Supported Node.js versions](#esm-compat-node) above. |  |
| `ioredis` | >=2 <6 |  |  |
| `knex` | >=0.20.0 <4 | Also, only with pg@8. |  |
| `pg` | ^8 |  |  |


## Troubleshooting ESM support [esm-troubleshooting]

If you see an error like the following, then you are attempting to use ESM auto-instrumentation support with too early of a version of Node.js. See [Supported Node.js versions](#esm-compat-node) above.

```
file:///.../node_modules/import-in-the-middle/hook.mjs:6
import { createHook } from './hook.js'
         ^^^^^^^^^^
SyntaxError: The requested module './hook.js' is expected to be of type CommonJS, which does not support named exports. CommonJS modules can be imported by importing the default export.
For example:
import pkg from './hook.js';
const { createHook } = pkg;
    at ModuleJob._instantiate (internal/modules/esm/module_job.js:98:21)
    at async ModuleJob.run (internal/modules/esm/module_job.js:137:5)
    at async Loader.import (internal/modules/esm/loader.js:165:24)
    at async internal/process/esm_loader.js:57:9
    at async Object.loadESM (internal/process/esm_loader.js:67:5)
```

