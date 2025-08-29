---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/configuring-the-agent.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
products:
  - id: cloud-serverless
  - id: observability
  - id: apm
---

# Configuring the agent [configuring-the-agent]

There are multiple ways to configure the Node.js agent. In order of precedence:

1. APM Agent Central Configuration via Kibana. (supported options are marked with [![dynamic config](images/dynamic-config.svg "") ](#dynamic-configuration))
2. Environment variables.
3. If calling the `apm.start()` function, supply a [configurations object](#agent-configuration-object) as the first argument.
4. Via the [agent configuration file](#agent-configuration-file).

For information on the available configuration properties and the expected names of environment variables, see the [Configuration options](/reference/configuration.md) documentation.


## Dynamic configuration [dynamic-configuration]

Configuration options marked with the ![dynamic config](images/dynamic-config.svg "") badge can be changed at runtime when set from a supported source.

The Node.js Agent supports [Central configuration](docs-content://solutions/observability/apm/apm-agent-central-configuration.md), which allows you to fine-tune certain configurations via the APM app in Kibana. This feature is enabled in the Agent by default, with [`centralConfig`](/reference/configuration.md#central-config).


## Agent configuration object [agent-configuration-object]

To use the optional `options` argument, pass it into the `apm.start()` method:

```js
var apm = require('elastic-apm-node').start({
  // add configuration options here
})
```

This example shows how to configure the agent to only be active in production:

```js
// Add this to the VERY top of the first file loaded in your app
require('elastic-apm-node').start({
  // Override service name from package.json
  // Allowed characters: a-z, A-Z, 0-9, -, _, and space
  serviceName: '',

  // Use if APM Server requires a token
  secretToken: '',

  // Use if APM Server uses API keys for authentication
  apiKey: '',

  // Set custom APM Server URL (default: http://127.0.0.1:8200)
  serverUrl: '',

  // Only activate the agent if it's running in production
  active: process.env.NODE_ENV === 'production'
})
```


## Agent configuration file [agent-configuration-file]

The Node.js agent looks for a file named `elastic-apm-node.js` in the current working directory. You can specify a custom path for this file with the [`configFile`](/reference/configuration.md#config-file) configuration option.

