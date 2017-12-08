# Elastic APM Node.js Agent (Alpha)

[![Build status](https://travis-ci.org/elastic/apm-agent-nodejs.svg?branch=master)](https://travis-ci.org/elastic/apm-agent-nodejs)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/standard/standard)

**Warning: This project is currently in alpha. Use it at your own
risk.**

This is the official Node.js agent for Elastic APM. Read our
[announcement blog
post](https://www.elastic.co/blog/starting-down-the-path-for-elastic-apm)
for details.

If you are trying out APM and have feedback or problems, please post
them on the [Discuss forum](https://discuss.elastic.co/c/apm).

## Quick start

1. To run Elastic APM for your own applications make sure you have the
   prerequisites in place first. For details see [Getting Started with
   Elastic APM](https://www.elastic.co/guide/en/apm/get-started)

1. Now follow the documentation links below relevant to your framework
   or stack to get set up

## Documentation

- [Table of contents](https://www.elastic.co/guide/en/apm/agent/nodejs)
- [Introduction](https://www.elastic.co/guide/en/apm/agent/nodejs/current/intro.html)
- [Get started with Express](https://www.elastic.co/guide/en/apm/agent/nodejs/current/express.html)
- [Get started with hapi](https://www.elastic.co/guide/en/apm/agent/nodejs/current/hapi.html)
- [Get started with Koa](https://www.elastic.co/guide/en/apm/agent/nodejs/current/koa.html)
- [Get started with a custom Node.js stack](https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-stack.html)
- [Advanced Setup and Configuration](https://www.elastic.co/guide/en/apm/agent/nodejs/current/advanced-setup.html)
- [API Reference](https://www.elastic.co/guide/en/apm/agent/nodejs/current/api.html)
- [Custom Transactions](https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html)
- [Custom Spans](https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-spans.html)
- [Source Map Support](https://www.elastic.co/guide/en/apm/agent/nodejs/current/source-maps.html)
- [Compatibility Overview](https://www.elastic.co/guide/en/apm/agent/nodejs/current/compatibility.html)
- [Troubleshooting](https://www.elastic.co/guide/en/apm/agent/nodejs/current/troubleshooting.html)

## Development Notes

To ease development, set the environment variable `DEBUG_PAYLOAD=1` to
have the agent dump the JSON payload sent to the APM Server to a
temporary file on your local harddrive.

### Testing

The test suite expects the databases PostgreSQL, MySQL, MongoDB,
Elasticsearch and Redis to be present. The `npm test` command will try
and start them all automatically before running the tests. This should
work on OS X if the databases are all installed using
[Homebrew](http://brew.sh).

To run the linter without running any tests, run `npm run lint`. To
automatically fix linting errors run `npm run lint-fix`.

### Using Docker for Testing

Running the testsuite on _Jenkins_ is based on docker images.
You can also make use of this setup when running tests locally.
Scripts are provided for different stages of testing: testing the 
documentation, running tests against different Node.js versions and 
running tests against different versions of dependencies.
The scripts are tested with a minimum docker version of `17.06.2-ce`.
For a full overview of the supported test matrix have a look at 
[Jenkins Configuration](./Jenkinsfile).

#### Testing Documentation

```
./test/script/docker/run_docs.sh
```

#### Testing against Node.js versions

```
./test/script/docker/run_tests.sh nodejs-version
```

E.g. `./test/script/docker/run_tests.sh 8`

#### Testing Dependencies

```
./test/script/docker/run_tests.sh nodejs-version dependencies
```

E.g. `./test/script/docker/run_tests.sh 8 redis,pg`

#### Cleanup Docker Container and Volumes 

```
./test/script/docker/cleanup.sh
```

## License

BSD-2-Clause

<br>Made with ♥️ and ☕️ by Elastic and our community.
