---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/typescript.html
---

# Get started with TypeScript [typescript]

The Elastic APM Node.js agent is implemented in vanilla JavaScript, but includes TypeScript types. This document shows how to integrate the APM agent with your TypeScript project.

A small, complete example project can be found [here](https://github.com/elastic/apm-agent-nodejs/tree/main/examples/typescript).


## Installation [typescript-installation]

Add `elastic-apm-node` as a dependency to your application, and possibly `@types/node` as a dev-dependency for type checking:

```bash
npm install --save elastic-apm-node
npm install --save-dev @types/node <1>
```

1. Installing `@types/node` can be skipped if you use [`skipLibCheck: true`](https://www.typescriptlang.org/tsconfig#skipLibCheck) in your "tsconfig.json".



## tsconfig compiler options [typescript-tsconfig]

The TypeScript authors strongly recommend that you use the [`"esModuleInterop": true`](https://www.typescriptlang.org/tsconfig/#esModuleInterop) option in your "tsconfig.json". In case you do not, then the "default" import of the agent will not work, so instead of using `import apm from 'elastic-apm-node/start'` or similar, you will have to use:

```js
import * as apm from 'elastic-apm-node/start' // if using esModuleInterop:false
```

Currently the Elastic APM Node.js agent [does not support instrumenting ECMA Script modules (ESM)](/reference/supported-technologies.md#compatibility-esm), so for full APM support you will need to tell TypeScript to generate JavaScript using CommonJS modules via the [`"module": "commonjs"`](https://www.typescriptlang.org/tsconfig/#module) compiler option.

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "esModuleInterop": true,
    "moduleResolution": "node"
    // ...
  }
}
```

The current TypeScript [recommended tsconfigs for node](https://github.com/tsconfig/bases#node-10-tsconfigjson) use options that work with the APM agent.


## Starting the agent [typescript-start]

For the APM agent to be able to automatically instrument modules it **must be started before you import other modules**.  This means that you should probably import and start the agent in your application’s main file (usually `index.js`, `server.js` or `app.js`). One way to do this is as follows.

```typescript
import 'elastic-apm-node/start' <1>

// Application code starts here.
// ...
```

1. This start method requires you to use environment variables to configure the agent. See [Starting the agent](/reference/starting-agent.md) for all the ways to start the agent.


Pay special attention to [the possible surprise gotcha](/reference/starting-agent.md#start-typescript) where the TypeScript compiler can throw away your import in the generated JavaScript.


## Next steps [typescript-next-steps]

The APM agent will now trace your application, monitor performance, and record any uncaught exceptions. Refer to the following documentation to configure and use the APM agent.

* [Setup and Configuration](/reference/advanced-setup.md)
* [API Reference](/reference/api.md)

If you can’t get the Node.js agent to work as expected, please follow the [troubleshooting guide](docs-content://troubleshoot/observability/apm-agent-nodejs/apm-nodejs-agent.md).

