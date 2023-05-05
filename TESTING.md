# Testing

There are two sets of tests:

 1. The (ambiguously named) **tests**. This means running any or all of the
    ".test.js" files under the "test" directory. For example, running
    "test/config.test.js" or running "test/instrumentation/modules/ioredis.test.js"
    using the currently installed "ioredis" dev-dependency.

 2. The **TAV tests** (TAV stands for test-all-versions). This means running a
    relevant subset of the ".test.js" files against a range of versions of the
    module under test. For example, running the same "ioredis.test.js" multiple
    times, once for each version of the "ioredis" module that this Node.js APM
    agent supports instrumenting.


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

Test files are "*.test.js" under the "test" directory.  They are written so
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
`tav` works out all the versions to test and serially installs each version and
runs the relevant test files.

    npm run test:tav

To run TAV tests for one or a few modules:

    TAV=redis,ioredis npm run test:tav

TAV tests are run in CI on commits to the "main" branch, as controlled by
"[tav.yml](./.github/workflows/tav.yml)". See the [CI](#ci) section below.
(TODO: TAV tests *will* be runnable on-demand for PRs, but that is awaiting
https://github.com/elastic/apm-agent-nodejs/issues/3227.)


## CI

Continuous Integration (CI) is setup to run following lint/test-related
workflows:

- [lint](./.github/workflows/lint.yml) - Lint and check style. Run on every
  commit to PRs and to "main".
- [test](./.github/workflows/test.yml) - Run [the tests](#tests) with every
  supported Node.js version. Run on every commit to PRs and to "main".
- [tav](./.github/workflows/tav.yml) - Run [the TAV tests](#tav-tests) with
  every supported Node.js version. Run on every commit to "main".
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
