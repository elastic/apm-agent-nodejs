---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/starting-the-agent.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
---

# Starting the agent [starting-the-agent]

There are a few ways to start the Node.js APM agent. Choose the one that works best for you. The most important considerations for selecting a method are:

* ensuring the APM agent starts early enough, and
* having a convenient way to configure the agent.

For the Node.js APM agent to be able to fully function, it **must be started before `require(...)` statements for other modules**. The APM agent automatically instruments modules by interposing itself in the import process. If a given module is imported before the APM agent has started, then it won’t be able to instrument that module.

## Start methods [_start_methods]

### `require('elastic-apm-node').start(...)` [start-option-require-and-start]

The most common way to start the APM agent is to require the `elastic-apm-node` module and call the [`.start()`](/reference/agent-api.md#apm-start) method at the top of your main module. This allows you to use any of the methods to [configure the agent](/reference/configuring-agent.md).

```js
const apm = require('elastic-apm-node').start({
  // Add configuration options here.
});

// Application main code goes here.
```


### `require('elastic-apm-node/start')` [start-option-require-start-module]

Another way to start the agent is with the `elastic-apm-node/start` module that imports and *starts* the agent.

```js
const apm = require('elastic-apm-node/start');

// Application main code goes here.
```

This start method exists for those that use a tool like Babel or esbuild to translate/transpile from code using ES modules (as in the following example) to code using CommonJS. It ensures that the APM agent is started before other imports in the same file. See [Hoisted ES module imports](#start-esm-imports) below for details.

```js
import 'elastic-apm-node/start.js';

// Application main code goes here.
```

A limitation of this approach is that you cannot configure the agent with an options object, but instead have to rely on [one of the other methods of configuration](/reference/configuring-agent.md), such as setting `ELASTIC_APM_...` environment variables.

Note: As of elastic-apm-node version 3.47.0, the "elastic-apm-node/start.js" will **not start the agent in a Node.js Worker thread.**


### `node -r elastic-apm-node/start.js ...` [start-option-node-require-opt]

Another way to start the agent is with the `-r elastic-apm-node/start.js` [command line option to `node`](https://nodejs.org/api/cli.md#-r---require-module). This will load and start the APM agent before your application code starts. This method allows you to enable the agent *without touching any code*. This is the recommended start method for [monitoring AWS Lambda functions](/reference/lambda.md) and for tracing [a Next.js server](/reference/nextjs.md).

```bash
node -r elastic-apm-node/start.js app.js
```

The `-r, --require` option can also be specified via the [`NODE_OPTIONS` environment variable](https://nodejs.org/api/cli.md#node_optionsoptions):

```bash
# export ELASTIC_APM_...  # Configure the agent with envvars.
export NODE_OPTIONS='-r elastic-apm-node/start.js'
node app.js
```

Note: As of elastic-apm-node version 3.47.0, the "elastic-apm-node/start.js" will **not start the agent in a [Node.js Worker thread](https://nodejs.org/api/worker_threads.md).** New Worker threads inherit the `process.execArgv` and environment, so "elastic-apm-node/start.js" is executed again. Starting a new APM agent in each Worker thread because of "start.js" is deemed surprise, so is disabled for now.


### Separate APM init module [start-option-separate-init-module]

If you want to avoid [the gotcha with hoisted ES modules](#start-esm-imports) but still want the flexibility of passing a config object to the [agent start method](/reference/agent-api.md#apm-start), then a good option is to write a separate JavaScript or TypeScript module that starts the agent, and import **that** init module at the top of your main file. For example:

```ts
// initapm.ts
import apm from 'elastic-apm-node';
apm.start({
  serverUrl: 'https://...',
  secretToken: '...',
  // ...
});
```

```ts
// main.ts
import './initapm.js';

// Application code starts here.
```



## Start gotchas [start-gotchas]

This section shows some sometimes subtle surprises starting the APM agent with some technologies. A general troubleshooting tip for using the agent with any build tool/system that produces compiled JavaScript is to look at the compiled JavaScript to see what is actually being executed by `node`.

### Hoisted ES module imports [start-esm-imports]

When using a tool like Babel or esbuild to translate/transpile from code using ES modules (i.e. `import ...` statements) to code using CommonJS (i.e. `require(...)`), all imports are "hoisted" to the top of a module, properly following ECMAScript module (ESM) semantics. This means the `apm.start()` method is called too late—**after** the `http` module has been imported.

For example, running Babel on the following code does not initiate APM early enough:

```js
import apm from 'elastic-apm-node';
apm.start() // This does not work.

import http from 'http';
// ...
```

Babel translates this to the equivalent of:

```js
var apm = require('elastic-apm-node');
var http = require('http');
apm.start() // This is started too late.
// ...
```

The [the `elastic-apm-node/start` module](#start-option-require-start-module) fixes this problem. The following will work:

```js
import 'elastic-apm-node/start'; // This works.
import http from 'http';
// ...
```

A more complete example using Babel is [here](https://github.com/elastic/apm-agent-nodejs/tree/main/test/babel).

The same is true for ES module usage translated by esbuild (as explained well in [the esbuild docs here](https://esbuild.github.io/content-types/#real-esm-imports)). Notably, TypeScript does *not* following ECMAScript module semantics in this regard.

Another good option is [to use a separate APM init module](#start-option-separate-init-module) and import that first.


### TypeScript gotcha [start-typescript]

TypeScript is a language that compiles to JavaScript, via the `tsc` TypeScript compiler, and is then executed via `node` (or some other JavaScript interpreter). Sometimes the produced JavaScript has a gotcha for using this APM agent. TypeScript assumes that module imports do not have side-effects, so it will [elide the following import](https://github.com/Microsoft/TypeScript/wiki/FAQ#why-are-imports-being-elided-in-my-emit) if the `apm` variable is not used:

```js
import apm from 'elastic-apm-node/start'; // Be careful
```

One can avoid that elision with:

```js
import 'elastic-apm-node/start';
```

Or with something like this:

```js
import apm from 'elastic-apm-node/start'; apm; // Ensure import is kept for its side-effect.
```

TypeScript 5.0 [introduced a `--verbatimModuleSyntax`](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#verbatimmodulesyntax) option that avoids this elision.


### Bundlers and APM [start-bundlers]

JavaScript Bundlers are tools that bundle up a number of JavaScript files into one, or a few, JavaScript files to be executed. Often they also include other features such as compilation (from newer to older JavaScript syntax, from TypeScript), tree-shaking (removing sections of code that are unused), minifying, bundling of CSS/images, etc. There are many bundler tools, including: [Webpack](https://webpack.js.org/), [esbuild](https://esbuild.github.io/), [Rollup](https://rollupjs.org/), [Parcel](https://parceljs.org/).

The main use case for bundlers is for improving performance in *browser apps*, where reducing the size and number of separate files helps with network and CPU overhead. The use case is typically less strong for server-side JavaScript code executed with `node`. However, some tooling will use bundlers for server-side JavaScript, not necessarily for the *bundling* but for some of the other features.

Unfortunately, **using a bundler typically breaks the APM agent**. Bundling multiple modules into a single file necessarily means replacing `require(...)` calls with custom bundler code that handles returning the module object. But the APM agent relies on those `require(...)` calls to instrument a module. There is no automatic fix for this. The workaround is to:

1. exclude the `elastic-apm-node` APM agent module from the bundle; and
2. optionally exclude other modules from the bundle that you would like the APM agent to instrument.

"Excluding" a module *foo* from the bundle (Webpack calls these "externals") means that a `require('foo')` expects "node_modules/foo/… " to exist at runtime. This means that you need to deploy both your bundle file(s) *and* the excluded modules. This may or may not defeat your reasons for using a bundler.

The rest of this section shows how to configure externals with various bundlers. If you know of a mechanism for a bundler that we haven’t documented, please [let us know.](https://github.com/elastic/apm-agent-nodejs/blob/main/CONTRIBUTING.md#contributing-to-the-apm-agent)


### Webpack [start-webpack]

Webpack supports ["externals"](https://webpack.js.org/configuration/externals/) configuration options to exclude specific modules from its bundle. At a minimum, the *elastic-apm-agent* module must be made external. In addition, any modules that you want the APM agent to instrument (e.g. a database client) must also be made external. The easiest way to do this is to **use the [*webpack-node-externals*](https://github.com/liady/webpack-node-externals) module to make all of "node_modules/… " external**.

For webpack@5 ensure your "webpack.config.js" has the following:

```js
const nodeExternals = require('webpack-node-externals');

module.exports = {
    // ...

    // Set these so Webpack emits code using Node's CommonJS
    // require functions and knows to use Node's core modules.
    target: 'node',
    externalsPresets: {
        node: true
    },

    // This tells Webpack to make everything under
    // "node_modules/" external.
    externals: [nodeExternals()],
};
```

For webpack@4, the `externalsPresets` config var does not exist, so use:

```js
const nodeExternals = require('webpack-node-externals');

module.exports = {
    // ...

    target: 'node',
    externals: [nodeExternals()],
};
```


### esbuild [start-esbuild]

Esbuild supports marking modules/files as ["external"](https://esbuild.github.io/api/#external) to the bundle. At a minimum, the *elastic-apm-agent* module must be made external for the APM agent to work. In addition, any modules that you want the APM agent to instrument (e.g. a database client) must also be made external.

Here is an example build script for "package.json" to bundle a Node.js application (with "src/index.js" as the entry point, targetting node v14.x, and ensuring that the `pg` PostgreSQL module is instrumented):

```json
{
  "scripts": {
    "build": "esbuild src/index.js --outdir=dist --bundle --sourcemap --minify --platform=node --target=node14 --external:elastic-apm-node --external:pg"
  }
}
```

This can be invoked via:

```bash
npm run build
```

Or the esbuild configuration can be put into a build script and invoked via `node esbuild.build.js`.

```js
// esbuild.build.js
require('esbuild').build({
    entryPoints: ['./src/index.js'],
    outdir: 'dist',
    bundle: true,
    platform: 'node',
    target: 'node14',
    sourcemap: true,
    minify: true,
    external: ['elastic-apm-node', 'pg']
}).catch(() => process.exit(1))
```

An alternative to manually listing specific dependencies as "external" is to use the following esbuild option to exclude **all** dependencies:

```bash
esbuild ... --external:'./node_modules/*'
```

A more complete example using esbuild and the APM agent is [here](https://github.com/elastic/apm-agent-nodejs/tree/main/examples/esbuild/).



