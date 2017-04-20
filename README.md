# Elastic APM Node.js Agent (Experimental)

[![Build status](https://travis-ci.org/elastic/apm-agent-nodejs.svg?branch=master)](https://travis-ci.org/elastic/apm-agent-nodejs)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/standard/standard)

**Warning: This project is currently in a pre-alpha stage and no support
or documentation is currently provided. Use it at your own risk.**

This is the official Node.js agent for Elastic APM. Read our
[announcement blog
post](https://www.elastic.co/blog/starting-down-the-path-for-elastic-apm)
for details.

If you are trying out APM and have feedback or problems, please post
them on the [Discuss forum](https://discuss.elastic.co/c/apm).

## Quick start

1. To run Elastic APM for your own applications make sure you have the
   prerequisites in place first. For details see ["APM Getting
   Started"](https://github.com/elastic/apm-server#apm-getting-started).

1. Install the module:
   ```
   npm install elastic-apm --save
   ```

1. To get started just require and start the Elastic APM agent **at the
   very top** of your app's startup script. The Elastic APM agent will
   be returned. The agent will now instrument your Node.js application
   and track unhandled exceptions automatically.
   ```js
   // Add this to the VERY top of the first file loaded in your app
   var apm = require('elastic-apm').start({
     // Set required app name (allowed characters: a-z, A-Z, 0-9, -, _, and space)
     appName: '',

     // Use if APM Server requires a token
     secretToken: '',

     // Set custom APM Server URL (default: http://localhost:8200)
     serverUrl: ''
   })
   ```
   If you want to manually send an error to Elastic APM, use the
   `captureError()` function:
   ```js
   apm.captureError(new Error('Ups, something broke'))
   ```

## Testing

The test suite expects the databases PostgreSQL, MySQL, MongoDB,
Elasticsearch and Redis to be present. The `npm test` command will try
and start them all automatically before running the tests. This should
work on OS X if the databases are all installed using
[Homebrew](http://brew.sh).

To run the linter without running any tests, run `npm run lint`. To
automatically fix linting errors run `npm run lint-fix`.

## License

BSD-2-Clause

<br>Made with ♥️ and ☕️ by Elastic and our community.
