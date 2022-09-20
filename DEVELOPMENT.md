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

When using the `AsyncHooksRunContextManager` the following debug printf in
the `init` async hook can be helpful to learn how its async hook tracks
relationships between async operations:

```diff
diff --git a/lib/instrumentation/run-context/AsyncHooksRunContextManager.js b/lib/instrumentation/run-context/AsyncHooksRunContextManager.js
index 94376188..571539aa 100644
--- a/lib/instrumentation/run-context/AsyncHooksRunContextManager.js
+++ b/lib/instrumentation/run-context/AsyncHooksRunContextManager.js
@@ -60,6 +60,8 @@ class AsyncHooksRunContextManager extends BasicRunContextManager {
       return
     }

+    process._rawDebug(`${' '.repeat(triggerAsyncId % 80)}${type}(${asyncId}): triggerAsyncId=${triggerAsyncId} executionAsyncId=${asyncHooks.executionAsyncId()}`);
+
     const context = this._stack[this._stack.length - 1]
     if (context !== undefined) {
       this._runContextFromAsyncId.set(asyncId, context)
```


# Testing tips

## Integration tests fail

If the "Integration Tests" check fails for your PR, here are some notes on
debugging that. (The actual ".ci/Jenkinsfile" and apm-integration-testing.git
are the authority. See also the [APM integration test troubleshooting guide](https://github.com/elastic/observability-dev/blob/main/docs/apm/apm-integration-test-troubleshooting-guide.md).)

The Node.js integration tests are ["test\_nodejs.py" in apm-integration-testing](https://github.com/elastic/apm-integration-testing/blob/main/tests/agent/test_nodejs.py). Roughly speaking, the integration tests:

- use that repo's scripts to start ES, kibana, apm-server and an [express test app](https://github.com/elastic/apm-integration-testing/blob/main/docker/nodejs/express/app.js) in Docker;
- run apm-integration-testing.git itself in a [Docker](https://github.com/elastic/apm-integration-testing/blob/main/Dockerfile) container and call `make test-agent-nodejs`;
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

        # OR: replace all this with a suitable call to
        #     'python3 scripts/compose.py start ...'

    Note: There is an easier way with "ELASTIC_STACK_VERSION=...
    APM_AGENT_NODEJS_VERSION=... make start-env" I believe. See the README.

4. Run the test suite:

        pytest tests/agent/test_nodejs.py -v

5. (Optional) In a separate terminal, watch the log output from Node.js agent:

        docker logs -f expressapp | ecslog

6. When done, stop the docker containers via:

        make stop-env
        # OR: python3 scripts/compose.py stop

   Also, optionally, turn off the Python virtual env:

        deactivate


## How to show the slowest TAV tests from a Jenkins build

Jenkins builds of the agent produce a "steps-info.json" artifact that gives
execution time of each of the build steps. For a build that ran the TAV tests
we can list the slowest ones via:

```
npm install -g json  # Re-writing this to use jq is an exercise for the reader.

curl -s https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/.../artifact/steps-info.json \
    | json -c 'this.displayName==="Run Tests"' -ga durationInMillis state result displayDescription | sort -n -k1 | tail -20
```

For example:

```
% curl -s https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/job/main/903/artifact/steps-info.json \
    | json -c 'this.displayName==="Run Tests"' -ga durationInMillis state result displayDescription | sort -n -k1 | tail -10
1940297 FINISHED SUCCESS .ci/scripts/test.sh "14" "fastify" "false"
2434461 FINISHED SUCCESS .ci/scripts/test.sh "15" "apollo-server-express" "false"
2867593 FINISHED SUCCESS .ci/scripts/test.sh "16" "apollo-server-express" "false"
3232404 FINISHED SUCCESS .ci/scripts/test.sh "8" "pg" "false"
3233514 FINISHED SUCCESS .ci/scripts/test.sh "12" "pg" "false"
3371890 FINISHED SUCCESS .ci/scripts/test.sh "10" "pg" "false"
5394174 FINISHED SUCCESS .ci/scripts/test.sh "12" "apollo-server-express" "false"
5832066 FINISHED SUCCESS .ci/scripts/test.sh "10" "apollo-server-express" "false"
6481178 FINISHED SUCCESS .ci/scripts/test.sh "14" "apollo-server-express" "false"
6626799 FINISHED SUCCESS .ci/scripts/test.sh "8" "apollo-server-express" "false"
```

# Maintenance tips

## How to check for outdated instrumentation modules

The APM agent instruments a number of npm modules. Typically, each such
instrumentation supports an explicit version range of the module. This supported
version range is expressed in three places:

1. Version guard code at the top of the instrumentation module. For example this
   at the top of "lib/instrumentation/modules/redis.js" for the `redis` npm
   package:

    ```js
    if (!semver.satisfies(version, '>=2.0.0 <4.0.0')) {
      agent.logger.debug('redis version %s not supported - aborting...', version)
      return redis
    }
    ```

2. One or more config blocks in ".tav.yml" that are used to define all versions
   of the module that are tested regularly in CI. For example,

    ```yaml
    redis:
      versions: '>=2.0.0 <4.0.0'
      commands: node test/instrumentation/modules/redis.test.js
    ```

3. The "docs/supported-technologies.asciidoc" document. For example,

    ```
    |https://www.npmjs.com/package/redis[redis] |>=2.0.0 <4.0.0 |Will instrument all queries
    ```

Two maintenance tasks are (a) to keep these three places in sync and (b) to
know when support for newer versions of module needs to be added. The latter
is partially handled by automated dependabot PRs (see ".github/dependabot.yml").
Both tasks are also partially supported by the **`./dev-utils/bitrot.js`** tool.
It will list inconsistences between ".tav.yaml" and
"supported-technologies.asciidoc", and will note newer releases of a module
that isn't covered. For example, redis@5 is not covered by the ranges above,
so the tool looks like this:

```
% ./dev-utils/bitrot.js
redis bitrot: latest redis@4.3.1 (released 2022-09-06): is not in .tav.yml ranges (>=2.0.0 <4.0.0), is not in supported-technologies.asciidoc ranges (>=2.0.0 <4.0.0)
```


# Other tips

## How to trigger a benchmark run for a PR

1. Go to the [apm-ci list of apm-agent-nodejs PRs](https://apm-ci.elastic.co/job/apm-agent-nodejs/job/apm-agent-nodejs-mbp/view/change-requests/) and click on your PR.
2. Click "Build with Parameters" in the left sidebar. (If you don't have "Build with Parameters" then you aren't logged in.)
3. Select these options to (mostly) *only* run the ["Benchmarks" step](https://github.com/elastic/apm-agent-nodejs/blob/v3.14.0/.ci/Jenkinsfile#L311-L330):
    - [x] Run\_As\_Main\_Branch
    - [x] bench\_ci
    - [ ] tav\_ci
    - [ ] tests\_ci
    - [ ] test\_edge\_ci

Limitation: The current dashboard for benchmark results only shows datapoints
from the "main" branch. It would be useful to have a separate chart that
showed PR values.

(Another way to start the "Benchmarks" step is via a GitHub comment
"run benchmark tests". However, that also triggers the "Test" step
and, depending on other conditions, the "TAV Test" step -- both of which are
long and will run before getting to the Benchmarks run.)


## How to test your local agent in Docker

If you are developing on macOS, it can be convenient to test your local
agent changes in Linux via docker:

1. Optionally start services whose clients the agent instruments (redis, mysql,
   etc.). These are placed on the `test_default` network.

        npm run docker:start

2. Start Bash in a linux container on that same network, mounting your current
   dir:

        docker run --rm -ti --network test_default -v $(pwd):/app --workdir /app node:16 /bin/bash

3. When you are done, stop the services:

        npm run docker:stop

For example:

```
% docker run --rm -ti --network test_default -v $(pwd):/app --workdir /app node:16 /bin/bash
root@248cddc5b508:/app# ls package.json
package.json

root@248cddc5b508:/app# ping mongodb
PING mongodb (172.20.0.3) 56(84) bytes of data.
64 bytes from test_mongodb_1.test_default (172.20.0.3): icmp_seq=1 ttl=64 time=0.315 ms
^C
--- mongodb ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 0.315/0.315/0.315/0.000 ms
```
