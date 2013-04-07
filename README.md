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

Basic options are:
```javascript
var options = {
  organization_id: '...',   // Required unless OPBEAT_ORGANIZATION_ID environment variable is set
  app_id: '...',            // Required unless OPBEAT_APP_ID environment variable is set
  secret_token: '...',      // Required unless OPBEAT_SECRET_TOKEN environment variable is set
  env: 'production',        // Optional - falls back to NODE_ENV || 'development'
  logger: '...',            // Optional
  hostname: '...',          // Optional - falls back to OS hostname
  uncaughtExceptions: false // Optional - defaults to true
};
```

## Logging an error
```javascript
client.captureError(new Error('Broke!'));
```

## Opbeat Identifier
```javascript
client.captureMessage('Hello, world!', function(result) {
    console.log(client.getIdent(result));
});
```

```javascript
client.captureError(new Error('Broke!'), function(result) {
  console.log(client.getIdent(result));
});
```

__Note__: `client.captureMessage` will also return the result directly without the need for a callback, such as: `var result = client.captureMessage('Hello, world!');`

## Events
If you really care if the event was logged or errored out, Client emits two events, `logged` and `error`:

```javascript
client.on('logged', function(){
  console.log('Yay, it worked!');
});
client.on('error', function(e){
  console.log('oh well, Opbeat is broke.');
})
client.captureMessage('Boom');
```

### Error Event
The event error is augmented with the original Opbeat response object as well as the response body and statusCode for easier debugging.

```javascript
client.on('error', function(e){
  console.log(e.responseBody);  // raw response body, usually contains a message explaining the failure
  console.log(e.statusCode);  // status code of the http request
  console.log(e.response);  // entire raw http response object
});
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

## Catching global errors
For those times when you don't catch all errors in your application. ;)

```javascript
client.patchGlobal();
// or
opbeat.patchGlobal(client);
// or
opbeat.patchGlobal(options);
```

It is recommended that you don't leave the process running after receiving an `uncaughtException` (http://nodejs.org/api/process.html#process_event_uncaughtexception), so an optional callback is provided to allow you to hook in something like:

```javascript
client.patchGlobal(function() {
  console.log('Bye, bye, world.')
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the Opbeat server.

## Methods
```javascript
new opbeat.Client([options])
client.captureMessage(string[,callback])
client.captureError(Error[,callback])
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
function onError(err, req, res, next) {
  // The error id is attached to `res.opbeat` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.opbeat+'\n');
}
connect(
  connect.bodyParser(),
  connect.cookieParser(),
  mainHandler,
  opbeat.middleware.connect([options]),
  onError, // optional error handler if you want to display the error id to a user
).listen(3000);
```

#### Express
```javascript
var app = require('express').createServer();
app.use(opbeat.middleware.express([options]));
app.use(onError); // optional error handler if you want to display the error id to a user
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
