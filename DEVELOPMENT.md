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

## How to show the slowest TAV tests from a CI run

The [TAV tests](./TESTING.md#tav-tests) run a large test matrix, where each
step can take a long time (installing and testing a large number of module
versions).  Part of maintaining this is to look at particularly slow steps
as candidates for speeding up.

    ./dev-utils/ci-tav-slow-jobs.sh

This script will list all the TAV test steps, from the latest run, with the
slowest last. For example:

```sh
% ./dev-utils/ci-tav-slow-jobs.sh | tail
1256 20m56s test-tav (14, next)
1307 21m47s test-tav (12, knex)
1307 21m47s test-tav (14, knex)
1323 22m03s test-tav (10, pg)
1386 23m06s test-tav (12, graphql)
1431 23m51s test-tav (14, tedious)
1496 24m56s test-tav (10, graphql)
1508 25m08s test-tav (8, graphql)
1757 29m17s test-tav (14, graphql)
1794 29m54s test-tav (10, knex)
```


## Reproducing CI test failures locally

Most of the time you should be able to reproduce a CI test step failure locally.
Sometimes this requires forcing an update to the latest Docker image for some
services.

```
$ docker system prune --all --force --volumes   # heavy-handed purge of all local Docker data
...

$ .ci/scripts/test.sh -b "release" "16"   # or a different value for "16" depending which stage failed
...
```

Once the failure is reproduced, you should be able to use `docker ps -a`,
`docker inspect $containerId` and other regular Docker commands and tooling to
dig into the issue.


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
It will list inconsistences between ".tav.yml" and
"supported-technologies.asciidoc", and will note newer releases of a module
that isn't covered. For example, redis@5 is not covered by the ranges above,
so the tool looks like this:

```
% ./dev-utils/bitrot.js
redis bitrot: latest redis@4.3.1 (released 2022-09-06): is not in .tav.yml ranges (>=2.0.0 <4.0.0), is not in supported-technologies.asciidoc ranges (>=2.0.0 <4.0.0)
```


# Other tips

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
