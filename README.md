# Opbeat

[![Build Status](https://travis-ci.org/opbeat/opbeat-node.png)](https://travis-ci.org/opbeat/opbeat-node)

Log errors and stacktraces in [Opbeat](http://opbeat.com/) from within
your Node.js applications. Includes middleware support for
[Connect](http://www.senchalabs.org/connect/) and
[Express](http://expressjs.com/).

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

**Important:** If you've been using version 0.3.x or earlier, please
read our [upgrade guide](https://github.com/opbeat/opbeat-node/wiki/Upgrade-to-version-1.0).

**Compatibility:** Make sure you read our [Compatibility
Guide](https://github.com/opbeat/opbeat-node/wiki/Compatibility-Guide)
if you use New Relic, longjohn or other modules that also captures
uncaught exceptions or modifies the stacktraces.

## Installation

```
npm install opbeat
```

## Basic Usage

To get started just require and initialize the Opbeat module in the top
of your app's main module. Out of the box this will catch unhandled
exceptions automatically.

```javascript
var opbeat = require('opbeat')({
  appId: '...',
  organizationId: '...',
  secretToken: '...'
});
```

If you want to manually send an error to Opbeat, use the
`captureError()` function:

```javascript
opbeat.captureError(new Error('Ups, something broke'));
```

## Configuration

When you've required the Opbeat module you can supply an optional
options object to configure the client.

```javascript
require('opbeat')({
  appId: '...',
  organizationId: '...',
  secretToken: '...',
  ...
});
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

A boolean specifying if errors should be collected by the Opbeat client
or not. Normally you would not want to capture errors in your
development or testing environments. If you are using the `NODE_ENV`
envrionment variable, you can use this to determine the state:

```javascript
var options = {
  active: process.env.NODE_ENV === 'production'
};
```

### hostname

- **Type:** String
- **Default:** OS hostname
- **Env:** `OPBEAT_HOSTNAME`

The OS hostname is automatically logged along with all errors (you can
see it under the "Environment" tab on each error. If you want to
overwrite this, use this option.

### clientLogLevel

- **Type:** String
- **Default:** `'info'`
- **Env:** `OPBEAT_CLIENT_LOG_LEVEL`

Set the verbosity level the Opbeat client. Note that this does not have
any influence on what types of errors that are sent to Opbeat. This only
controls how chatty the Opbeat client are in your logs.

Possible levels are: `debug`, `info`, `warn`, `error` and `fatal`.

### logger

- **Type:** object

Set a custom logger, e.g.
[bunyan](https://github.com/trentm/node-bunyan):

```js
require('opbeat')({
  logger: require('bunyan')({ level: 'info' })
});
```

If no custom logger is provided, Opbeat will use its built-in logger
which will log to STDOUT and STDERR depending on the log level.

The logger should expose the following functions: `debug`, `info`,
`warn`, `error` and `fatal`.

Note that if a custom logger is provided, the `clientLogLevel` option
will be ignored.

### captureExceptions

- **Type:** Boolean
- **Default:** `true`
- **Env:** `OPBEAT_CAPTURE_EXCEPTIONS`

Whether or not the Opbeat client should monitor for uncaught exceptions
and sent them to Opbeat automatically.

### stackTraceLimit

- **Type:** Number
- **Default:** `Infinity`
- **Env:** `OPBEAT_STACK_TRACE_LIMIT`

Setting it to `0` will disable stacktrace collection. Any finite integer
value will be used as the maximum number of frames to collect. Setting
it to `Infinity` means that all frames will be collected.

## Events

The client emits two events: `logged` and `error`.

```javascript
opbeat.on('logged', function (url) {
  console.log('Yay, it worked! View online at: ' + url);
});

opbeat.on('error', function (err) {
  console.log('Something went wrong. The error was not logged!');
});

opbeat.captureError('Boom');
```

## Uncaught exceptions

The client captures uncaught exceptions automatically and reports them
to Opbeat. To disable this, set the configuration option
`captureExceptions` to `false` when initializing the Opbeat client.

You can enable capturing of uncaught exceptions later by calling the
`handleUncaughtExceptions()` function. This also gives you the option to
add a callback which will be called once an uncaught exception have been
sent to Opbeat.

```javascript
opbeat.handleUncaughtExceptions([callback]);
```

If you don't specify a callback, the node process is terminated
automatically when an uncaught exception have been captured and sent to
Opbeat.

[It is
recommended](http://nodejs.org/api/process.html#process_event_uncaughtexception)
that you don't leave the process running after receiving an
`uncaughtException`, so if you are using the optional callback, remember
to terminate the node process:

```javascript
var opbeat = require('opbeat')();

opbeat.handleUncaughtExceptions(function (err, url) {
  // Do your own stuff... and then exit:
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Opbeat
server with the following arguments:

- `err` - the captured exception
- `url` - the URL of where you can find the sent error on Opbeat

## Advanced usage

### HTTP requests

You can specify an optional options argument as the 2nd argument to
`.captureError()`. Besides the options described in the [the metedata
section](#metadata), you can use the options to associate the error with
an HTTP request:

```javascript
opbeat.captureError(err, {
  request: req // an instance of http.IncomingMessage
});
```

This will log the URL that was requested, the HTTP headers, cookies and
other useful details to help you debug the error.

### Callback

The `captureError()` function can also be given an optional callback
which will be called once the error have been sent to Opbeat:

```javascript
opbeat.captureError(error, function (opbeatErr, url) {
  // ...
});
```

The callback is called with two arguments:

- `opbeatErr` - set if something went wrong while trying to log the error
- `url` - the URL of where you can find the sent error on Opbeat

### Non-exceptions

Instead of an `Error` object, you can log a plain text error-message:

```javascript
opbeat.captureError('Something happened!');
```

This will also be logged as an error in Opbeat, but will not be
associated with an exception.

#### Parameterized messages

If the message string contains state or time-specific data, Opbeat will
not always recognize multiple errors as belonging to the same group,
since the message text differs. To group these kind of messages, send
the message as a parameterized message:

```javascript
opbeat.captureError({
  message: 'Timeout exeeded by %d seconds',
  params: [seconds]
});
```

### Metadata

To ease debugging it's possible to send some extra data with each
error you send to Opbeat. The Opbeat API supports a lot of different
metadata fields, most of which are automatlically managed by the
opbeat node client. But if you wish you can supply some extra details
using `client_supplied_id`, `extra`, `user` or `query`. If you want to
know more about all the fields, you should take a look at the full
[Opbeat API docs](http://docs.opbeat.com/api/intake/v1/#error-logging).

To supply any of these extra fields, use the optional options argument
when calling `opbeat.captureError()`.

Here are some examples:

```javascript
// Sending some extra details about the user
opbeat.captureError(error, {
  user: {
    is_authenticated: true,
    id: 'unique_id',
    username: 'foo',
    email: 'foo@example.com'
  }
});

// Sending some abitrary extra details using the `extra` field
opbeat.captureError(error, {
  extra: {
    some_important_metric: 'foobar'
  }
});
```

## Singleton access

Don't waste time initializing the Opbeat client more than once. If you
need access the client in multiple files, just create an *opbeat.js*
file somewhere in your project, initialize Opbeat in there and export
it:

```javascript
// opbeat.js
module.exports = require('opbeat')({
  appId: '...',
  organizationId: '...',
  secretToken: '...'
});
```

## Integrations

### Connect/Express middleware

The Opbeat middleware can be used as-is with either Connect or Express
in the same way. Take note that in your middlewares, Opbeat must appear
_after_ your main handler to pick up any errors that may result from
handling a request.

#### Connect

```javascript
var opbeat = require('opbeat')();
var connect = require('connect');

var app = connect();

// your regular middleware:
// app.use(...)
// app.use(...)

// your main HTTP handler
app.use(function (req, res, next) {
  throw new Error('Broke!');
});

// add Opbeat in the bottom of the middleware stack
app.use(opbeat.middleware.connect());

app.listen(3000);
```

#### Express

```javascript
var opbeat = require('opbeat')();
var app = require('express').createServer();

app.use(opbeat.middleware.express());
app.get('/', function mainHandler(req, res) {
  throw new Error('Broke!');
});
app.listen(3000);
```

__Note__: `opbeat.middleware.express` or `opbeat.middleware.connect`
*must* be added to the middleware stack *before* any other error
handling middlewares or there's a chance that the error will never get
to Opbeat.

## Release tracking

Though Opbeat provides other
means of handling [release tracking](http://docs.opbeat.com/topics/release-tracking/), you can also use this client to do the same.

Use the `trackDeployment()` function with the optional options and
callback arguments:

```javascript
opbeat.trackDeployment(options, callback);
```

Options:

- `path` - An optional path on the filesystem where the git repo can be found (defaults to the current working directory)
- `rev` - An optional full git revision (will try to guess the `rev` based on the `path`)
- `status` - `completed` (default) or `machine-completed`. If `machine-completed` is specified, the `hostname` attribute must be present
- `branch` - Optional git branch (will try to guess the `rev` based on the `path`)
- `hostname` - Optional hostname of the server that was updated. Required if `status=machine-completed`

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

BSD
