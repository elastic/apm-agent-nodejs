![Opbeat](http://opbeat-brand-assets.s3-website-us-east-1.amazonaws.com/png/logo/logo@1x.png)

[![Build status](https://travis-ci.org/opbeat/opbeat-node.svg?branch=master)](https://travis-ci.org/opbeat/opbeat-node)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard)

[Opbeat](https://opbeat.com/nodejs) combines performance metrics,
release tracking, and error logging into a single simple service for you
Node.js application.

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Uncaught exceptions](#uncaught-exceptions)
- [Advanced usage](#advanced-usage)
- [Integrations](#integrations)
- [Release tracking](#release-tracking)
- [Compatibility](#compatibility)
- [Credit](#credit)
- [License](#license)

**Troubleshooting:** If you encounter any problems setting up the Opbeat
agent, please see our [troubleshooting
guide](https://github.com/opbeat/opbeat-node/wiki/Troubleshooting).

**Upgrading:** If you've been using version 2.x or earlier, please
read our [upgrade guide](https://github.com/opbeat/opbeat-node/wiki/Upgrade-to-version-3.x).

**Compatibility:** Make sure you read our [Compatibility
Guide](https://github.com/opbeat/opbeat-node/wiki/Compatibility-Guide)
if you use New Relic, longjohn or other modules that also captures
uncaught exceptions or modifies the stacktraces.

## Installation

```
npm install opbeat --save
```

## Basic Usage

To get started just require and start the Opbeat module **at the very
top** of your apps main file. The Opbeat agent will be returned. The
agent will now instrument your Node.js application and track unhandled
exceptions automatically.

```js
// add this snippet to the VERY top of your main file
var opbeat = require('opbeat').start({
  appId: '...',
  organizationId: '...',
  secretToken: '...'
})
```

If you want to manually send an error to Opbeat, use the
`captureError()` function:

```js
opbeat.captureError(new Error('Ups, something broke'))
```

## Configuration

The Opbeat agent can be configured either by pasing in an options object
as the first arugment when calling the `start` function or via
environment variables (or a combination of both).

```js
require('opbeat').start({
  // configuration options
})
```

Note that even if you rely purely on environment variables to configure
the Opbeat agent, `.start()` should still be called:

```js
require('opbeat').start()
```

The available options are listed below, but can alternatively be set via
the listed environment variables.

### appId

- **Type:** String
- **Env:** `OPBEAT_APP_ID`

Your Opbeat app id. Required unless set via the `OPBEAT_APP_ID`
environment variable.

### organizationId

- **Type:** String
- **Env:** `OPBEAT_ORGANIZATION_ID`

Your Opbeat orgainization id. Required unless set via the
`OPBEAT_ORGANIZATION_ID` environment variable.

### secretToken

- **Type:** String
- **Env:** `OPBEAT_SECRET_TOKEN`

Your secret Opbeat token. Required unless set via the
`OPBEAT_SECRET_TOKEN` environment variable.

### active

- **Type:** Boolean
- **Default:** `true`
- **Env:** `OPBEAT_ACTIVE`

A boolean specifying if the agent should be active or not. If active,
the agent will instrument incoming HTTP requests and track errors.
Normally you would not want to run the agent in your development or
testing environments. If you are using the `NODE_ENV` envrionment
variable, you can use this to determine the state:

```js
var options = {
  active: process.env.NODE_ENV === 'production'
}
```

### instrument

- **Type:** Boolean
- **Default:** `true`
- **Env:** `OPBEAT_INSTRUMENT`

A boolean specifying if the Opbeat agent should collect performance
metrics for the app.

Note that both `active` and `instrument` needs to be `true` for
instrumentation to be running.

### hostname

- **Type:** String
- **Default:** OS hostname
- **Env:** `OPBEAT_HOSTNAME`

The OS hostname is automatically logged along with all errors (you can
see it under the "Environment" tab on each error). If you want to
overwrite this, use this option.

### logLevel

- **Type:** String
- **Default:** `'info'`
- **Env:** `OPBEAT_LOG_LEVEL`

Set the verbosity level the Opbeat agent. Note that this does not have
any influence on what types of errors that are sent to Opbeat. This only
controls how chatty the Opbeat agent are in your logs.

Possible levels are: `trace`, `debug`, `info`, `warn`, `error` and
`fatal`.

### logger

- **Type:** object

Set a custom logger, e.g.
[bunyan](https://github.com/trentm/node-bunyan):

```js
require('opbeat').start({
  logger: require('bunyan')({ level: 'info' })
})
```

If no custom logger is provided, Opbeat will use its built-in logger
which will log to STDOUT and STDERR depending on the log level.

The logger should expose the following functions: `trace`, `debug`,
`info`, `warn`, `error` and `fatal`.

Note that if a custom logger is provided, the `logLevel` option will be
ignored.

### captureExceptions

- **Type:** Boolean
- **Default:** `true`
- **Env:** `OPBEAT_CAPTURE_EXCEPTIONS`

Whether or not the Opbeat agent should monitor for uncaught exceptions
and sent them to Opbeat automatically.

### stackTraceLimit

- **Type:** Number
- **Default:** `Infinity`
- **Env:** `OPBEAT_STACK_TRACE_LIMIT`

Setting it to `0` will disable stacktrace collection. Any finite integer
value will be used as the maximum number of frames to collect. Setting
it to `Infinity` means that all frames will be collected.

### filter

- **Type:** Function
- **Default:** `undefined`

If you supply a filter function it will be called just before an error
is being sent to Opbeat. This will allow you to manipulate the data
being sent, for instance to always supply certain information in the
`extra` field. The function is synchronous and should return the
manipulated data object.

The function will be called with two arguments:

1. The original error object for reference
1. The JSON data that is about to be sent to Opbeat (in object literal
   form)

## Events

The agent emits two events: `logged` and `error`.

```js
opbeat.on('logged', function (url, uuid) {
  console.log('Yay, it worked! View online at: ' + url)
})

opbeat.on('error', function (err, uuid) {
  console.log('Something went wrong. The error was not logged!')
})

opbeat.captureError('Boom')
```

Note that the `uuid` argument might not always be available when the
`error` event is emitted depending on the type of error emitted.

## Uncaught exceptions

The agent captures uncaught exceptions automatically and reports them
to Opbeat. To disable this, set the configuration option
`captureExceptions` to `false` when initializing the Opbeat agent.

You can enable capturing of uncaught exceptions later by calling the
`handleUncaughtExceptions()` function. This also gives you the option to
add a callback which will be called once an uncaught exception have been
sent to Opbeat.

```js
opbeat.handleUncaughtExceptions([callback])
```

If you don't specify a callback, the node process is terminated
automatically when an uncaught exception have been captured and sent to
Opbeat.

[It is
recommended](http://nodejs.org/api/process.html#process_event_uncaughtexception)
that you don't leave the process running after receiving an
`uncaughtException`, so if you are using the optional callback, remember
to terminate the node process:

```js
var opbeat = require('opbeat').start()

opbeat.handleUncaughtExceptions(function (err, url) {
  // Do your own stuff... and then exit:
  process.exit(1)
})
```

The callback is called **after** the event has been sent to the Opbeat
server with the following arguments:

- `err` - the captured exception
- `url` - the URL of where you can find the sent error on Opbeat

## Advanced usage

### Instrumentation

By default, the Opbeat agent will track incoming HTTP requests and group
them in transactions. During a transaction, the associated database
queries, requests to external services etc. are measured along with the
total transaction time.

If you are using Express 4.x or hapi 9+, the transactions will be
grouped together based on the names of your routes. If you use another
framework or a custom router you will see that the transactions are
simply grouped together in a few big chunks named "unknown route". In
that case, you will need to help us out a little by supplying a name for
each transaction. You can do that by calling
`opbeat.setTransactionName()` at any time during the transaction with
the name of the transaction as the first argument.

### HTTP requests

You can specify an optional options argument as the 2nd argument to
`.captureError()`. Besides the options described in the [the metedata
section](#metadata), you can use the options to associate the error with
an HTTP request:

```js
opbeat.captureError(err, {
  request: req // an instance of http.IncomingMessage
})
```

This will log the URL that was requested, the HTTP headers, cookies and
other useful details to help you debug the error.

In most cases this isn't needed though, as the Opbeat agent is pretty
smart at figuring out if your Node.js app is an HTTP server and if an
error occurred during an incoming request. If so, it will automate the
above processes for you.

### Callback

The `captureError()` function can also be given an optional callback
which will be called once the error have been sent to Opbeat:

```js
opbeat.captureError(error, function (opbeatErr, url) {
  // ...
})
```

The callback is called with two arguments:

- `opbeatErr` - set if something went wrong while trying to log the error
- `url` - the URL of where you can find the sent error on Opbeat

### Non-Error Objects

Instead of an `Error` object, you can log a plain text error-message:

```js
opbeat.captureError('Something happened!')
```

This will also be logged as an error in Opbeat, but will not be
associated with an exception.

#### Parameterized messages

If the message string contains state or time-specific data, Opbeat will
not always recognize multiple errors as belonging to the same group,
since the message text differs. To group these kind of messages, send
the message as a parameterized message:

```js
opbeat.captureError({
  message: 'Timeout exeeded by %d seconds',
  params: [seconds]
})
```

### Metadata

To ease debugging it's possible to send some extra data with each
error you send to Opbeat. The Opbeat API supports a lot of different
metadata fields, most of which are automatically managed by the opbeat
node agent. But if you wish you can supply some extra details using
`client_supplied_id`, `extra`, `user` or `query`. If you want to know
more about all the fields, you should take a look at the full [Opbeat
API docs](https://opbeat.com/docs/api/intake/v1/#error-logging).

To supply any of these extra fields, use the optional options argument
when calling `opbeat.captureError()`.

Here are some examples:

```js
// Sending some extra details about the user
opbeat.captureError(error, {
  user: {
    is_authenticated: true,
    id: 'unique_id',
    username: 'foo',
    email: 'foo@example.com'
  }
})

// Sending some abitrary extra details using the `extra` field
opbeat.captureError(error, {
  extra: {
    some_important_metric: 'foobar'
  }
})
```

## Integrations

### Connect/Express middleware

The Opbeat middleware can be used as-is with either Connect or Express
in the same way. Take note that in your middlewares, Opbeat must appear
_after_ your main handler to pick up any errors that may result from
handling a request.

#### Connect

```js
var opbeat = require('opbeat').start()
var connect = require('connect')

var app = connect()

// your regular middleware:
// app.use(...)
// app.use(...)

// your main HTTP handler
app.use(function (req, res, next) {
  throw new Error('Broke!')
})

// add Opbeat in the bottom of the middleware stack
app.use(opbeat.middleware.connect())

app.listen(3000)
```

#### Express

```js
var opbeat = require('opbeat').start()
var app = require('express').createServer()

app.use(opbeat.middleware.express())
app.get('/', function mainHandler(req, res) {
  throw new Error('Broke!')
})
app.listen(3000)
```

__Note__: `opbeat.middleware.express` or `opbeat.middleware.connect`
*must* be added to the middleware stack *before* any other error
handling middlewares or there's a chance that the error will never get
to Opbeat.

## Release tracking

Though Opbeat provides other means of handling [release
tracking](https://opbeat.com/docs/articles/get-started-with-release-tracking/),
you can also use this agent to do the same.

Use the `trackRelease()` function with the optional options and
callback arguments:

```js
opbeat.trackRelease(options, callback)
```

Options:

- `cwd` - An optional path on the filesystem where the git repo can be found (defaults to the current working directory)
- `rev` - An optional full git revision (will try to guess the `rev` based on the `cwd`)
- `status` - `completed` (default) or `machine-completed`. If `machine-completed` is specified, the `machine` attribute must be present
- `branch` - Optional git branch (will try to guess the `branch` based on the `cwd`)
- `machine` - Optional hostname of the server that was updated. Required if `status=machine-completed`

Callback:

Will be called when the release has been tracked. Note that the
callback will not be called upon errors. Listen instead for the `error`
events.

## Compatibility

The module is tested against Node.js v0.10 and above. Previous versions
of Node.js is not supported.

## Credit

All credit for the original work go out to the original contributors and
the main author [Matt Robenolt](https://github.com/mattrobenolt).

## License

BSD-2-Clause
