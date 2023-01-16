This directory includes an example showing how the esbuild bundler
(https://esbuild.github.io) can be configured to be used with the Elastic
Node.js APM agent.

For the APM agent to work with esbuild you must:

- mark 'elastic-apm-node' as external so it is *not* included in the bundle; and
- any modules that you would like the APM agent to instrument (e.g. a database
  client) must also be marked as external

This can be done by passing this to the `esbuild` command:

    --external:elastic-apm-node --external:<module-to-instrument>

or if you are using an esbuild build script:

    require('esbuild').build({
        ...
        external: ['elastic-apm-node', '<module-to-instrument>']
    }).catch(() => process.exit(1))


# Example

This example implements an HTTP server that uses the [pug template
library](https://pugjs.org/api/getting-started.html) in its request handler.
Then a single request is made to the HTTP server. When tracing this we
expect a trace like this:

    transaction "GET unknown route"
    `- span "pug"

Setup dependencies and build the bundle. The bundle file is written to
"dist/index.js".

    npm install
    npm run build

Configure the APM agent to point to [your Elastic APM setup](https://www.elastic.co/guide/en/apm/guide/current/apm-quick-start.html)

    export ELASTIC_APM_SERVER_URL=...
    export ELASTIC_APM_SECRET_TOKEN=...

Run the script:

    node dist/index.js

