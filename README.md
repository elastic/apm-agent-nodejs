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

```javascript
var opbeat = require('opbeat');
var client = opbeat.createClient(options); // options are optional

client.captureError(new Error('Hello, world!'));
```

Options are:

```javascript
var options = {
  app_id: '...',                // Required unless OPBEAT_APP_ID environment variable is set
  organization_id: '...',       // Required unless OPBEAT_ORGANIZATION_ID environment variable is set
  secret_token: '...',          // Required unless OPBEAT_SECRET_TOKEN environment variable is set
  env: 'production',            // Optional - falls back to NODE_ENV || 'development'
  hostname: '...',              // Optional - falls back to OS hostname
  request: null,                // Optional - An instance of `http.IncomingMessage`
  logger: '...',                // Optional
  handleExceptions: false,      // Optional - defaults to true
  silent: true,                 // Optional - defaults to false
  exceptionsAreCritical: false, // Optional - defaults to true
  stackTraceLimit: 10           // Optional - defaults to Infinity
};
```

The `captureError` function can also be given an optional callback which
will be called once the error have been logged:

```javascript
client.captureError(new Error('Broke!'), function (opbeatErr, url) {
  console.log('The error can be found at:', url);
});
```

You can always get access to the created client from another part of
your Node.js app by requireing the `opbeat` module again and accessing
the `client` property:

```javascript
var opbeat = require('opbeat');

opbeat.client.captureError(new Error('Something else broke!'));
```

Note that `opbeat.client` will be undefined if you havent initialized
the client previously with a call to `opbeat.createClient()`.

## Events

Client emits three events: `logged`, `connectionError` and `error`.

```javascript
client.on('logged', function (url) {
  console.log('Yay, it worked! View online at: ' + url);
});
client.on('error', function (err) {
  console.log('oh well, Opbeat returned an error');
});
client.on('connectionError', function (err) {
  console.log('Could not contact Opbeat :(');
});
client.captureError('Boom');
```

## Environment variables

### NODE_ENV

`NODE_ENV` must be anything else than `development` or `test` for Opbeat
to actually work. Running in development or test mode, will issue a
warning and logging will be disabled.

### OPBEAT_APP_ID

Optionally declare the application id to use for the client through the
environment. Initializing the client in your app won't require setting
the application id.

### OPBEAT_ORGANIZATION_ID

Optionally declare the organization id to use for the client through the
environment. Initializing the client in your app won't require setting
the organization id.

### OPBEAT_SECRET_TOKEN

Optionally declare the Opbeat token to use for the client through the
environment. Initializing the client in your app won't require setting
the token.

## Uncaught exceptions

By default uncaught exceptions are handled by the client and reported
automatically to Opbeat. To disable this, set the configration option
`handleExceptions` to `false` when initializing the Opbeat client.

If you need you can then enable global error handling manually:

```javascript
client.handleUncaughtExceptions();
// or
client.handleUncaughtExceptions(callback);
```

If you don't specify a callback, the node process is terminated when an
uncaught exception is handled by the Opbeat client.

[It is
recommended](http://nodejs.org/api/process.html#process_event_uncaughtexception)
that you don't leave the process running after receiving an
`uncaughtException`, so if you are using the optional callback, remember
to terminate the node process:

```javascript
var client = opbeat.createClient({
  handleExceptions: false
});

client.handleUncaughtExceptions(function (err) {
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

Use the `.trackDeployment()` function with the optional options and
callback arguments:

```javascript
client.trackDeployment(options, callback);
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

### Non-exceptions

Instead of an `Error` object, you can log a plain text error-message:

```javascript
client.captureError('Something happened!');
```

This will also be logged as an error in Opbeat, but will not be
associated with an exception.

#### Parameterized messages

If the message string contains state or time-specific data, Opbeat will
not recognize multiple errors as belonging to the same group, since the
message text differs. To group these kind of messages, send the message
as a parameterized message:

```javascript
client.captureError({
  message: 'Timeout exeeded by %d seconds',
  params: [seconds]
});
```

### Log levels

Opbeat supports 5 different severity levels: 'debug', 'info', 'warning',
'error', 'fatal'.  By default the client logs everything as 'error'.
You can always override this using the optional options argument:

```javascript
client.captureError('Foobar', { level: 'warning' });
```

### Metadata

To ease debugging it's possible to send some extra data with each
error/message you send to Opbeat. The Opbeat API supports a lot of
different metadata fields, most of which are automatlically managed by
the opbeat-node client. But if you wish you can supply some extra
details using `client_supplied_id`, `extra`, `user` or `query`. If you
want to know more about all the fields, you should take a look at the
full [Opbeat API docs](https://opbeat.com/docs/api/errorlog/).

To supply any of these extra fields, use the optional options argument
when calling `client.captureError()`.

Here are some examples:

```javascript
// Sending some extra details about the user
client.captureError(new Error('Boom!'), {
  user: {
    is_authenticated: true,
    id: 'unique_id',
    username: 'foo',
    email: 'foo@example.com'
  }
});

// Sending some abitrary extra details using the `extra` field
client.captureError('Foobar', {
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
var connect = require('connect');
function mainHandler(req, res) {
  throw new Error('Broke!');
}
connect(
  connect.bodyParser(),
  connect.cookieParser(),
  mainHandler,
  opbeat.middleware.connect(client || options),
).listen(3000);
```

#### Express

```javascript
var app = require('express').createServer();
app.use(opbeat.middleware.express(client || options));
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
