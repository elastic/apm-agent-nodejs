This directory includes an example TypeScript project using the Elastic
Node.js APM agent. It uses a tsconfig as recommended at
https://github.com/tsconfig/bases#node-14-tsconfigjson

Install dependencies:

    npm install

Compile the TypeScript ("index.ts") to JavaScript ("dist/index.js"):

    npm run build

In this example we are importing and starting the agent with the following at
the top of "index.ts". (See [the docs](https://www.elastic.co/guide/en/apm/agent/nodejs/current/starting-the-agent.html)
for other ways of starting the APM agent.)

```ts
import 'elastic-apm-node/start'
```

This start methods means that we need to use environment variables (or an
"elastic-apm-node.js" config file) for [configuration](https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuring-the-agent.html).

Configure the APM agent with values from [your Elastic Stack](https://www.elastic.co/guide/en/apm/guide/8.3/apm-quick-start.html) and execute the script:

    export ELASTIC_APM_SERVER_URL='https://...apm...cloud.es.io:443'
    export ELASTIC_APM_SECRET_TOKEN='...'
    export ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME=true
    node dist/index.js

This simple script creates an HTTP server and makes a single request to it.
If things work properly, you should see a trace with a single HTTP transaction
named "GET /ping".
