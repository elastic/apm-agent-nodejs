# Testing

The test suite uses [Docker](https://www.docker.com/community-edition) to spin up the databases required by the test suite.

The `npm test` command also uses [Docker Compose](https://docs.docker.com/compose/install/).
If you have installed Docker,
you most likely have Docker Compose as well.

To get a list of the databases used by the test suite,
run:

```
docker-compose -f test/docker-compose.yml config --services
```

This list can be useful if you want to specify which databases to start (more on that later).

## Run tests inside Docker

You can also run the test site it self inside of a Docker container:

```
npm test all [node_version] [packages]
```

The `all` command instructs the test suite to run everything inside of Docker.

Arguments:

- `node_version` - Specify major version of Node.js to run test suite on (default: same version as is installed locally)
- `packages` - Comma separated list of npm package names for which to run [tav](https://github.com/watson/test-all-versions) tests.
  See [`.tav.yml`](.tav.yml) for list of possible names.
  If used,
  `node_version` must be specified (default: none)

Example running test suite on Node.js 8:

```
npm test all 8
```

Example running PostgreSQL and Redis tav tests on Node.js 8:

```
npm test all 8 pg,redis
```

## Run tests outside Docker

If running the test suite multiple times,
it might be convenient to start these databases in advance so that `npm test` doesn't have to do that.
There's two ways to do this:

### Run databases via Docker

Start all databases:

```
npm run docker:start
```

Start a subset of databases:

```
npm run docker:start mssql cassandra
```

### Run databases locally

If you already have _all_ the required databases installed and running locally,
just run `npm test` with the `none` command:

```
npm test none
```

The `none` command instructs the test suite to run nothing inside of Docker.

If you only have a subset of the required databases installed and running locally,
run `npm test` with a list of the datases you want it to start for you,
e.g:

```
npm test mssql cassandra
```

#### Advanced

The agent test suite supports starting all databases locally (expect SQL Server) if they have been installed using [Homebrew](https://brew.sh/):

```
npm run local:start
```

To later stop the local databases,
run:

```
npm run local:stop
```

## Other notable test commands

Run the documentation tests inside of Docker:

```
npm run test:docs
```

Run all the tav tests:

```
npm run test:tav
```

Run only the tav tests for PostgreSQL and Redis:

```
TAV=pg,redis npm run test:tav
```

Clean up Docker containers and volumes:

```
npm run docker:clean
```

Run the benchmarks:

```
npm run bench
```

## Jenkins

Below are some useful GitHub PR comments that will trigger Jenkins
builds for the current PR (you need to be a project member for these to
have any effect).

Run the regular test suite:

```
/test
```

Run TAV tests for one or more modules, where `<modules>` can be either a
comma separated list of modules (e.g.  `memcached,redis`) or the
string literal `ALL` to test _all_ modules:

```
run module tests for <modules>
```

Run the benchmark test only:

```
run benchmark tests
```
