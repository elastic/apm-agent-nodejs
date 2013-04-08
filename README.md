**Node v0.9 compatible**

Log errors and stack traces in [Opbeat](http://opbeat.com/) from within
your Node.js applications. Includes middleware support for
[Connect](http://www.senchalabs.org/connect/)/[Express](http://expressjs.com/).

All processing and sending happens asynchronously to not slow things
down if/when Opbeat is down or slow.

## Compatibility
 * 0.6.x
 * 0.8.x
 * 0.9.x (latest unstable)

## Installation
```
$ npm install opbeat
```

## Basic Usage
```javascript
var opbeat = require('opbeat');
var client = new opbeat.Client([options]);

client.captureMessage('Hello, world!');
```

Options are:
```javascript
var options = {
  organization_id: '...', // Required unless OPBEAT_ORGANIZATION_ID environment variable is set
  app_id: '...',          // Required unless OPBEAT_APP_ID environment variable is set
  secret_token: '...',    // Required unless OPBEAT_SECRET_TOKEN environment variable is set
  env: 'production',      // Optional - falls back to NODE_ENV || 'development'
  logger: '...',          // Optional
  hostname: '...',        // Optional - falls back to OS hostname
  handleExceptions: false // Optional - defaults to true
};
```

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
})
client.on('connectionError', function (err) {
  console.log('Could not contact Opbeat :(');
})
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
var client = new opbeat.client({
  uncaughtExceptions: false
});

client.handleUncaughtExceptions(function (err) {
  // Do your own stuff... and then exit:
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Opbeat server.

## Methods
```javascript
new opbeat.Client([options])
client.captureMessage(string, [callback])
client.captureError(Error, [callback])
client.captureRequestError(Error, req, [callback])
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
