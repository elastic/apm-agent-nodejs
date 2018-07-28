# Testing

The test suite uses [Docker](https://www.docker.com/community-edition) to spin up the following databases when running `npm test`:

| Database      | Service Name |
|---------------|--------------|
| PostgreSQL    | `postgres` |
| MySQL         | `mysql` |
| MongoDB       | `mongodb` |
| Elasticsearch | `elasticsearch` |
| Cassandra     | `cassandra` |
| SQL Server    | `mssql` |
| Redis         | `redis` |

Note:
The `npm test` command uses [Docker Compose](https://docs.docker.com/compose/install/).
If you have installed Docker,
you most likely have Docker Compose as well.

## Run tests inside Docker

You can also run the test site it self inside of a Docker container:

```
npm test -- --docker [node_version] [packages]
```

Arguments:

- `node_version` - Specify major version of Node.js to run test suite on (default: same version as is installed locally)
- `packages` - Comma separated list of npm package names for which to run [tav](https://github.com/watson/test-all-versions) tests.
  If used,
  `node_version` must be specified (default: none)

Example running test suite on Node.js 8:

```
npm test -- --docker 8
```

Example running PostgreSQL and Redis tav tests on Node.js 8:

```
npm test -- --docker 8 pg,redis
```

## Run tests outside Docker

If running the test suite multiple times,
it might be convenient to start these these databases in advance so that `npm test` doesn't have to do that.
There's two ways to do this:

### Run databases via Docker

Start all databases:

```
npm run docker-start
```

Start a subset of databases:

```
npm run docker-start mssql cassandra
```

### Run databases locally

If you already have _all_ the required databases installed and running locally,
just run `npm test` with the `--no-deps` flag:

```
npm test -- --no-deps
```

If you only have a subset of the required databases installed and running locally,
run `npm test` with a list of the datases you want it to start for you,
e.g:

```
npm test mssql cassandra
```

#### Advanced

The agent test suite supports starting all databases locally (expect SQL Server) if they have been installed using [Homebrew](https://brew.sh/):

```
npm run local-start
```

To later stop the local databases,
run:

```
npm run local-stop
```

## Other notable test commands

Run the documentation tests inside of Docker:

```
npm run test-docs
```

Clean up Docker containers and volumes:

```
npm run docker-clean
```
