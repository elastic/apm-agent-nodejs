# Testing

There are three types of tests:

 1. The (ambiguously named) **tests**. This means running any or all of the
    ".test.js" files under the "test" directory. For example, running
    "test/config.test.js" or running "test/instrumentation/modules/ioredis.test.js"
    using the currently installed "ioredis" dev-dependency.

 2. The **TAV tests** (TAV stands for test-all-versions). This means running
    the relevant subset of the ".test.js" files against the supported range of
    versions of a module that the APM agent supports instrumenting.  For
    example, running the same "ioredis.test.js" multiple times, once for each
    version of the "ioredis" module that this Node.js APM agent supports
    instrumenting.

 3. The **Edge tests**. This means running the "tests" against an "edge", or
    non-release, version of Node.js. Relevant non-release versions are (a) the
    latest [nightly](https://nodejs.org/download/nightly/) build for the
    next version of Node.js, and (b) a possible [RC](https://nodejs.org/download/rc/)
    build for an upcoming release.


## Quick start test commands

```sh
npm run lint                  # or 'make check' if you are a Makefile kind of person

npm test                      # run test services and tests in Docker

docker-compose -f test/docker-compose.yml config --services  # list test services
npm run docker:start          # start all test services
npm run docker:start redis    # start one or more test services
npm run docker:stop           # stop all test services
npm run docker:clean          # clean up Docker containers and volumes

node test/some/file.test.js   # run a single test file
node test/test.js             # run all test files locally

npm run test:tav              # run TAV tests for all modules (takes a long time!)
TAV=foo,bar npm run test:tav  # run TAV tests for modules "foo" and "bar"
```


## Linting and style

    npm run lint
    npm run lint:fix          # fix some style issues

This project uses eslint (see [".eslintrc.json" config](./.eslintrc.json)) for
linting and style.


## Tests

The tests can be run in a Docker container or outside of Docker. This will run
the full test suite **in a Docker container**, using Docker Compose to run the
services required for testing (e.g. Redis, PostgreSQL):

    npm test

The filesystem inside Docker for Mac can be very slow, so running tests locally
can be faster. To run all tests **locally** (i.e. outside of Docker):

    npm run docker:start  # start all test services in Docker
    node test/test.js     # run all tests locally
    npm run docker:stop   # stop all test services

Test files are `*.test.js` under the "test" directory.  They are written so
each can be run individually:

    node test/.../FOO.test.js

Depending on the test, it may require a service to be running. These can
be run via `npm run docker:start [SERVICES]`. For example:

    npm run docker:start redis
    node test/instrumentation/modules/ioredis.test.js
    npm run docker:stop

Tests are run in CI on pull requests and on commits to the "main" branch,
as controlled by "[test.yml](./.github/workflows/test.yml)". See the [CI](#ci)
section below.


## TAV tests

This APM agent supports instrumenting (i.e. providing tracing information
from usage of) a number of third-party modules. It maintains support for a
range of versions of these modules -- as documented
[here](https://www.elastic.co/guide/en/apm/agent/nodejs/current/supported-technologies.html).
To test this support, the [`tav`](https://github.com/watson/test-all-versions)
tool is used. A few ".tav.yml" files (e.g. [./.tav.yml](./.tav.yml)) define
the supported ranges.

Run the TAV tests for **all modules** as follows. This will take a long time.
For each module to be tested, `tav` works out all the versions to test and
serially installs each version and runs the relevant test files.

    npm run test:tav

To run TAV tests for one or a few modules:

    TAV=redis,ioredis npm run test:tav

Or, to run TAV tests for a module in Docker as they are run in CI:

    .ci/scripts/test.sh -b "release" -t "ioredis" "18"

TAV tests are run in CI on commits to the "main" branch, as controlled by
"[tav.yml](./.github/workflows/tav.yml)". See the [CI](#ci) section below.
(TODO: TAV tests *will* be runnable on-demand for PRs, but that is awaiting
https://github.com/elastic/apm-agent-nodejs/issues/3227.)

### TAV tests on PRs

When a PR is making changes that might affect instrumentation of a particular
module it is useful to run the relevant subset of TAV tests for that module.
This can be triggered via a special PR review comment that starts with
`/test tav ...` -- it must be a *review* comment to associate with a
particular PR commit sha. The full syntax is:

```
/test tav[ module1,module2,...[ nodever1,nodever2]]
```

Examples:

```
/test tav ioredis 16        # run TAV tests for module "ioredis" with node 16
/test tav ioredis           # run TAV tests for module "ioredis" with all node versions
/test tav ioredis,redis 20  # run TAV tests for modules "ioredis" and "redis" with node 20

/test tav all 8             # run TAV tests for all modules with node 8

/test tav                   # run all TAV tests, avoid using this excessively
```


## Edge tests

Edge tests are run in CI for each push to main. It has two parts:

- `test-nightly` which looks for the penultimate
  [nightly](https://nodejs.org/download/nightly/) build for the next version of
  Node.js, installs it (using `nvm`), then runs the full set of
  ["tests"](#tests). The "penultimate" build is used instead of the latest
  because the Node.js nightly upload process is not atomic.

- `test-rc` which looks for a possible [RC](https://nodejs.org/download/rc/)
  build for an unreleased Node.js version. If it finds one it, likewise,
  installs it and runs the full set of "tests".

These tests are run in a [`node_tests` Docker container](https://github.com/elastic/apm-agent-nodejs/blob/main/.ci/docker/node-edge-container/Dockerfile)
using Docker Compose to run required services. You can run Edge tests locally
via:

```
.ci/scripts/test.sh -h              # show usage
.ci/scripts/test.sh -b nightly 21   # run nightly tests for Node.js v21
.ci/scripts/test.sh -b rc 20        # run RC tests for Node.js v20
```


## CI

Continuous Integration (CI) is setup to run following lint/test-related
workflows:

- [lint](./.github/workflows/lint.yml) - Lint and check style. Run on every
  commit to PRs and to "main".
- [test](./.github/workflows/test.yml) - Run [the tests](#tests) with every
  supported Node.js version. Run on every commit to PRs and to "main".
- [tav](./.github/workflows/tav.yml) - Run [the TAV tests](#tav-tests) with
  every supported Node.js version. Run on every commit to "main".
- [tav-command](./.github/workflows/tav-command.yml) - Run some or all [TAV tests](#tav-tests)
  *on demand* in a PR. See [TAV tests on PRs](#tav-tests-on-prs) above.
- [edge](./.github/workflows/edge.yml) - Run [the tests](#tests) on the
  penultimate [Node.js nightly](https://nodejs.org/download/nightly) build for
  the next upcoming release version; and on active
  [Node.js RC builds](https://nodejs.org/download/rc), if any. Run on every
  commit to "main"


## Other info

### `npm test` usage

The `npm test` command was briefly mentioned above. It actually supports
arguments: to run with particular node versions, to run the TAV tests, etc.
Here are some (out of date) docs on its usage.
(TODO: update these docs or drop them.)

```
npm test all [node_version] [packages]
```

The `all` command instructs the test suite to run everything inside of Docker.

Arguments:

- `node_version` - Specify major version of Node.js to run test suite on
  (default: same version as is installed locally).
- `packages` - Comma separated list of modules for which to run
  [TAV tests](#tav-tests). If used, `node_version` must be specified (default:
  none).

Example running test suite on Node.js 8:

```
npm test all 8
```

Example running PostgreSQL and Redis tav tests on Node.js 8:

```
npm test all 8 pg,redis
```


If you already have _all_ the required services installed and running locally,
run `npm test` with the `none` argument (which means "run nothing inside of
Docker"):

```
npm test none
```

If you only have a subset of the required services installed and running
locally, run `npm test` with a list of the services you want it to start for you,
e.g:

```
npm test mssql cassandra
```

### Running services locally

The most reliable and supported way to run services needed for testing is in
Docker. However, if it is useful to you, the `npm run local:*` commands support
starting most services locally (except SQL Server) if they have been installed
using [Homebrew](https://brew.sh/):

```sh
npm run local:start         # start most services needed for testing
npm run local:stop          # stop those services
```
