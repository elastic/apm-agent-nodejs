[![Build Status](https://travis-ci.org/watson/opbeat-node.png)](https://travis-ci.org/watson/opbeat-node)

Log errors and stack traces in [Opbeat](http://opbeat.com/) from within
your Node.js applications. Includes middleware support for
[Connect](http://www.senchalabs.org/connect/)/[Express](http://expressjs.com/).

All processing and sending happens asynchronously to not slow things
down if/when Opbeat is down or slow.

## Compatibility
 * 0.10.x

## Installation
```
$ npm install opbeat
```

## Basic Usage
```javascript
var opbeat = require('opbeat');
var client = opbeat.createClient(options); // options are optional

client.captureMessage('Hello, world!');
```

Options are:
```javascript
var options = {
  organization_id: '...',       // Required unless OPBEAT_ORGANIZATION_ID environment variable is set
  app_id: '...',                // Required unless OPBEAT_APP_ID environment variable is set
  secret_token: '...',          // Required unless OPBEAT_SECRET_TOKEN environment variable is set
  env: 'production',            // Optional - falls back to NODE_ENV || 'development'
  hostname: '...',              // Optional - falls back to OS hostname
  logger: '...',                // Optional
  handleExceptions: false,      // Optional - defaults to true
  silent: true,                 // Optional - defaults to false
  exceptionsAreCritical: false, // Optional - defaults to true
  stackTraceLimit: 10           // Optional - defaults to Infinity
};
```

You can always get access to the created client from another part of
your Node.js app by loading the `opbeat` module again and accessing the
`client` property:
```javascript
var opbeat = require('opbeat');
opbeat.client.captureError(new Error('foo'));
```

Note that `opbeat.client` will be undefined if you havent initialized
the client previously with a call to `opbeat.createClient()`.

## Logging an error
```javascript
client.captureError(new Error('Broke!'));
```

## Opbeat URL
```javascript
client.captureMessage('Hello, world!', function (opbeatErr, url) {
  console.log('The message can be found on:', url);
});
```

```javascript
client.captureError(new Error('Broke!'), function (opbeatErr, url) {
  console.log('The error can be found on:', url);
});
```

## Events
If you really care if the event was logged or errored out, Client emits three events, `logged`, `connectionError` and `error`:

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
client.captureMessage('Boom');
```

## Environment variables
### NODE_ENV
`NODE_ENV` must be anything else than `development` or `test` for Opbeat to actually work. Running in development or test mode, will issue a warning and logging will be disabled.

### OPBEAT_ORGANIZATION_ID
Optionally declare the organization id to use for the client through the environment. Initializing the client in your app won't require setting the organization id.

### OPBEAT_APP_ID
Optionally declare the application id to use for the client through the environment. Initializing the client in your app won't require setting the application id.

### OPBEAT_SECRET_TOKEN
Optionally declare the Opbeat token to use for the client through the environment. Initializing the client in your app won't require setting the token.

## Handling uncaught exceptions
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

It is recommended that you don't leave the process running after
receiving an `uncaughtException`
(http://nodejs.org/api/process.html#process_event_uncaughtexception), so
if you are using the optional callback, remember to terminate the node
process:

```javascript
var client = opbeat.createClient({
  handleExceptions: false
});

client.handleUncaughtExceptions(function (err) {
  // Do your own stuff... and then exit:
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Opbeat server.

## Methods
```javascript
client.captureMessage(string|object, options, callback); // options and callback are optional
client.captureError(Error, options, callback); // options and callback are optional
client.captureRequestError(Error, req, options, callback); // options and callback are optional
```

## Advanced usage

### Parameterized messages

If the message string contains state or time-specific data, Opbeat will
not recognize multiple errors as belonging to the same group, since the
message text differs. To group these kind of messages, send the message
as a parameterized message:

```javascript
client.captureMessage({
  message: 'Timeout exeeded by %d seconds',
  params: [seconds]
});
```

### Log levels

Opbeat supports 5 different severity levels: 'debug', 'info', 'warn',
'error', 'critical'.  By default the client logs everything as 'error'.
You can always override this using the optional options argument:

```javascript
client.captureMessage('Foobar', { level: 'warn' });
```

### Metadata

To ease debugging it's possible to send some extra data with each error/message you send to Opbeat. The Opbeat API supports a lot of different metadata fields, most of which are automatlically managed by the opbeat-node client. But if you wish you can supply some extra details using `client_supplied_id`, `extra`, `user` or `query`. If you want to know more about all the fields, you should take a look at the full [Opbeat API docs](https://opbeat.com/docs/api/errorlog/).

To supply any of these extra fields, use the optional options argument when calling either `client.captureMessage()`, `client.captureError()` or `client.captureRequestError()`.

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
client.captureMessage('Foobar', {
  extra: {
    some_important_metric: 'foobar'
  }
});
```

## Integrations
### Connect/Express middleware
The Opbeat middleware can be used as-is with either Connect or Express in the same way. Take note that in your middlewares, Opbeat must appear _after_ your main handler to pick up any errors that may result from handling a request.

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

__Note__: `opbeat.middleware.express` or `opbeat.middleware.connect` *must* be added to the middleware stack *before* any other error handling middlewares or there's a chance that the error will never get to Opbeat.

## Credit

This project is a fork of the
[raven-node](https://github.com/mattrobenolt/raven-node) module. It have
been modified to work with [Opbeat](http://opbeat.com) instead of
[Sentry](http://getsentry.com). All credit for the original work go out
to the original contributors and the main author [Matt
Robenolt](https://github.com/mattrobenolt).
