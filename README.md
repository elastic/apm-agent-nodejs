# Opbeat

[![Build Status](https://travis-ci.org/watson/opbeat-node.png)](https://travis-ci.org/watson/opbeat-node)

Log errors and stack traces in [Opbeat](http://opbeat.com/) from within
your Node.js applications. Includes middleware support for
[Connect](http://www.senchalabs.org/connect/) and
[Express](http://expressjs.com/).

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
  app_id: '...',
  organization_id: '...',
  secret_token: '...'
});
```

If you want to manually send an error to Opbeat, use the
`captureError()` function:

```javascript
opbeat.captureError(new Error('Ups, something broke'));
```

If you need access to the Opbeat client in other files after
initializing it in you app's main module, just require the module
and call the main function without parsing in any arguments:

```javascript
var opbeat = require('opbeat')();
```

## Configuration

When you've required the Opbeat module you can supply an optional
options object to configure the client.

```javascript
require('opbeat')({
  app_id: '...',
  organization_id: '...',
  secret_token: '...',
  ...
});
```

Note that if you do not supply an options object, you'll need to
configure the Opbeat client using environment varialbes.

The available options are:

### app_id

- **Type:** String

Your Opbeat app id. Required unless set via the `OPBEAT_APP_ID`
environment variable.

### organization_id

- **Type:** String

Your Opbeat orgainization id. Required unless set via the
`OPBEAT_ORGANIZATION_ID` environment variable.

### secret_token

- **Type:** String

Your secret Opbeat token. Required unless set via the
`OPBEAT_SECRET_TOKEN` environment variable.

### active

- **Type:** Boolean
- **Default:** `true`

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

The OS hostname is automatically logged along with all errors (you can
see it under the "Environment" tab on each error. If you want to
overwrite this, use this option.

### level

- **Type:** String
- **Default:** `info`

Set the verbosity level the Opbeat client. Note that this does not have
any influence what types of errors that are logged to Opbeat. This only
controls how chatty the Opbeat client are in your logs.

Possible levels are: `debug`, `info`, `warn`, `error` and `fatal`.

### captureExceptions

- **Type:** Boolean
- **Default:** `true`

### exceptionLogLevel

- **Type:** String
- **Default:** `fatal`

When calling `captureError()` the error is logged on Opbeat with the
level "error", but uncaught exceptions are by default logged on Opbeat
with the level "fatal". Use this option to overwrite that default.

Possible levels are: `debug`, `info`, `warn`, `error` and `fatal`.

### stackTraceLimit

- **Type:** Number
- **Default:** `Infinity`

Setting it to `0` will disable stack trace collection. Any finite integer
value will be used as the maximum number of frames to collect. Setting
it to `Infinity` means that all frames will be collected.

## Events

Client emits three events: `logged`, `connectionError` and `error`.

```javascript
opbeat.on('logged', function (url) {
  console.log('Yay, it worked! View online at: ' + url);
});

opbeat.on('error', function (err) {
  console.log('oh well, Opbeat returned an error');
});

opbeat.on('connectionError', function (err) {
  console.log('Could not contact Opbeat :(');
});

opbeat.captureError('Boom');
```

## Uncaught exceptions

The client captures uncaught exceptions automatically and reports them
to Opbeat. To disable this, set the configuration option
`captureExceptions` to `false` when initializing the Opbeat client.

You can enable capturing of uncaught exceptions later by calling the
`captureUncaughtExceptions()` function. This also gives you the option to
add a callback which will be called once an uncaught exception have been
sent to Opbeat.

```javascript
opbeat.captureUncaughtExceptions([callback]);
```

If you don't specify a callback, the node process is terminated when an
uncaught exception is handled by the Opbeat client.

[It is
recommended](http://nodejs.org/api/process.html#process_event_uncaughtexception)
that you don't leave the process running after receiving an
`uncaughtException`, so if you are using the optional callback, remember
to terminate the node process:

```javascript
var opbeat = require('opbeat')();

opbeat.captureUncaughtExceptions(function (err) {
  // Do your own stuff... and then exit:
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Opbeat
server.

## Deployment tracking

Though Opbeat provides [other
means](https://opbeat.com/docs/release_tracking/) of tracking
deployment, you can also use this client for to track deployments.

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

Will be called when the deployment have been tracked. Note that the
callback will not be called upon errors. Listen instead for the `error`
or `connectionError` events.

## Advanced usage

The `captureError()` function can also be given an optional callback
which will be called once the error have been logged:

```javascript
opbeat.captureError(error, function (opbeatErr, url) {
  // ...
});
```

The callback is called with two arguments:

- `opbeatErr` - set if something went wrong while trying to log the error
- `url` - the URL of where you can find the logged error on Opbeat

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

### Log levels

Opbeat supports 5 different severity levels: 'debug', 'info', 'warning',
'error', 'fatal'.  By default the client logs everything as 'error'.
You can always override this using the optional options argument:

```javascript
opbeat.captureError(error, { level: 'warning' });
```

### Metadata

To ease debugging it's possible to send some extra data with each
error you send to Opbeat. The Opbeat API supports a lot of different
metadata fields, most of which are automatlically managed by the
opbeat node client. But if you wish you can supply some extra details
using `client_supplied_id`, `extra`, `user` or `query`. If you want to
know more about all the fields, you should take a look at the full
[Opbeat API docs](https://opbeat.com/docs/api/errorlog/).

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

function mainHandler(req, res) {
  throw new Error('Broke!');
}

connect(
  connect.bodyParser(),
  connect.cookieParser(),
  mainHandler,
  opbeat.middleware.connect(),
).listen(3000);
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

## Compatibility

The module is tested against Node.js v0.10 and above. Previous versions
of Node.js is not supported.

## Credit

This project is a fork of the
[raven-node](https://github.com/mattrobenolt/raven-node) module. It have
been modified to work with [Opbeat](http://opbeat.com) instead of
[Sentry](http://getsentry.com). All credit for the original work go out
to the original contributors and the main author [Matt
Robenolt](https://github.com/mattrobenolt).

## LICENSE

BSD
