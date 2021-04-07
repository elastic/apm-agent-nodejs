This document contains informal notes to help developers of the Elastic APM
Node.js agent. Developers should feel free to aggressively weed out obsolete
notes. For structured developer and contributing *rules and guidelines*, see
[CONTRIBUTING.md](./CONTRIBUTING.md).


# GitHub Usage

Work on the Elastic Node.js APM agent is coordinated with other Elastic APM
work via the [APM Agents project](https://github.com/orgs/elastic/projects/454?card_filter_query=label%3Aagent-nodejs)
and with releases of the full [Elastic Stack](https://www.elastic.co/elastic-stack) via
[milestones](https://github.com/elastic/apm-agent-nodejs/milestones) named
after Elastic Stack version numbers.


# Logging tips

## logging

`ELASTIC_APM_LOG_LEVEL=trace` will turn on trace-level logging in the agent
and apm http-client. Agent logging is in [ecs-logging format](https://www.elastic.co/guide/en/ecs-logging/overview/current/intro.html),
which can be pretty-formatted via the [`ecslog` tool](https://github.com/trentm/go-ecslog):

    ELASTIC_APM_LOG_LEVEL=trace node myapp.js | ecslog

One of the important libs in the agent is [require-in-the-middle](https://github.com/elastic/require-in-the-middle)
for intercepting `require(...)` statements for monkey-patching. You can get
debug output from it via:

    DEBUG=require-in-the-middle

And don't forget the node core [`NODE_DEBUG` and `NODE_DEBUG_NATIVE`](https://nodejs.org/api/all.html#cli_node_debug_module)
environment variables:

    NODE_DEBUG=*
    NODE_DEBUG_NATIVE=*


## debug logging of `async_hooks` usage

The following patch to the agent's async-hooks.js can be helpful to learn
how its async hook tracks relationships between async operations:

```diff
diff --git a/lib/instrumentation/async-hooks.js b/lib/instrumentation/async-hooks.js
index 1dd168f..f35877d 100644
--- a/lib/instrumentation/async-hooks.js
+++ b/lib/instrumentation/async-hooks.js
@@ -71,6 +71,9 @@ module.exports = function (ins) {
     // type, which will init for each scheduled timer.
     if (type === 'TIMERWRAP') return

+    const indent = ' '.repeat(triggerAsyncId % 80)
+    process._rawDebug(`${indent}${type}(${asyncId}): triggerAsyncId=${triggerAsyncId} executionAsyncId=${asyncHooks.executionAsyncId()}`);
+
     const transaction = ins.currentTransaction
     if (!transaction) return

```


# Testing tips

## Integration tests fail

If the "Integration Tests" check fails for your PR, here are some notes on
debugging that. (The actual ".ci/Jenkinsfile" and apm-integration-testing.git
are the authority. See also the [APM integration test troubleshooting guide](https://github.com/elastic/observability-dev/blob/master/docs/apm/apm-integration-test-troubleshooting-guide.md).)

The Node.js integration tests are ["test\_nodejs.py" in apm-integration-testing](https://github.com/elastic/apm-integration-testing/blob/master/tests/agent/test_nodejs.py). Roughly speaking, the integration tests:

- use that repo's scripts to start ES, kibana, apm-server and an [express test app](https://github.com/elastic/apm-integration-testing/blob/master/docker/nodejs/express/app.js) in Docker;
- run apm-integration-testing.git itself in a [Docker](https://github.com/elastic/apm-integration-testing/blob/master/Dockerfile) container and call `make test-agent-nodejs`;
- which runs [`pytest tests/agent/test_nodejs.py ...`](https://github.com/elastic/apm-integration-testing/blob/db7d9a26458832b812577a294e14c365c85001b9/Makefile#L102)

To reproduce the integration test failure on your dev machine mainly involves
getting the correct settings for that "express test app", in particular
using your PR commit sha. The following boilerplate *should* get you going.
Note that it might likely get out of date:

1. Create and active a Python virtual env for the Python bits that are used:

        python3 -m venv ./venv
        source ./venv/bin/activate

2. Set the apm-agent-nodejs.git commit you want to use:

        export MYCOMMIT=... # e.g. 3554f05fad6798f229f75eebc07bb66cee918385

3. Start the docker containers:

        export BUILD_OPTS="--nodejs-agent-package elastic/apm-agent-nodejs#$MYCOMMIT --opbeans-node-agent-branch $MYCOMMIT --build-parallel"
        export ELASTIC_STACK_VERSION=8.0.0
        export COMPOSE_ARGS="${ELASTIC_STACK_VERSION} ${BUILD_OPTS} \
          --with-agent-nodejs-express \
          --no-apm-server-dashboards \
          --no-apm-server-self-instrument \
          --force-build --no-xpack-secure \
          --apm-log-level=trace"
        make start-env

4. Run the test suite:

        pytest tests/agent/test_nodejs.py -v

5. (Optional) In a separate terminal, watch the log output from Node.js agent:

        docker logs -f expressapp | ecslog

6. When done, stop the docker containers via:

        make stop-env
        # OR: python3 scripts/compose.py stop

   Also, optionally, turn off the Python virtual env:

        deactivate

