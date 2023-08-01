# http-apm-client

A low-level HTTP client for communicating with the Elastic APM intake
API version 2. This code was moved here from the once-separate
[Elastic APM HTTP client repo](https://github.com/elastic/apm-nodejs-http-client)


## Example Usage

```js
const { HttpApmClient } = require('path/to/lib/http-apm-client')

const client = new HttpApmClient({
  serviceName: 'My App',
  agentName: 'my-nodejs-agent',
  agentVersion: require('./package.json').version,
  userAgent: 'My Custom Elastic APM Agent'
  // ... other options.
})

const span = {
  name: 'SELECT FROM users',
  duration: 42,
  start: 0,
  type: 'db.mysql.query'
}

client.sendSpan(span)
```

## API

### `new HttpApmClient(options)`

Construct a new `client` object. Data given to the client will be
converted to ndjson, compressed using gzip, and streamed to the APM
Server.

Arguments:

- `options` - An object containing config options (see below). All options
  are optional, except those marked "(required)".

Data sent to the APM Server as part of the [metadata object](https://www.elastic.co/guide/en/apm/server/current/metadata-api.html).
See also the "Cloud & Extra Metadata" section below.

- `agentName` - (required) The APM agent name
- `agentVersion` - (required) The APM agent version
- `agentActivationMethod` - An enum string ([spec](https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#activation-method)) that identifies the way this agent was activated/started
- `serviceName` - (required) The name of the service being instrumented
- `serviceNodeName` - Unique name of the service being instrumented
- `serviceVersion` - The version of the service being instrumented
- `frameworkName` - If the service being instrumented is running a
  specific framework, use this config option to log its name
- `frameworkVersion` - If the service being instrumented is running a
  specific framework, use this config option to log its version
- `configuredHostname` - A user-configured hostname, if any, e.g. from the `ELASTIC_APM_HOSTNAME` envvar.
  See <https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#hostname>.
- `environment` - Environment name (default: `process.env.NODE_ENV || 'development'`)
- `containerId` - Docker container id, if not given will be parsed from `/proc/self/cgroup`
- `kubernetesNodeName` - Kubernetes node name
- `kubernetesNamespace` - Kubernetes namespace
- `kubernetesPodName` - Kubernetes pod name, if not given will be the hostname
- `kubernetesPodUID` - Kubernetes pod id, if not given will be parsed from `/proc/self/cgroup`
- `globalLabels` - An object of key/value pairs to use to label all data reported (only applied when using APM Server 7.1+)

HTTP client configuration:

- `userAgent` - (required) The HTTP user agent that your module should
  identify itself as
- `secretToken` - The Elastic APM intake API secret token
- `apiKey` - Elastic APM API key
- `serverUrl` - The APM Server URL (default: `http://127.0.0.1:8200`)
- `headers` - An object containing extra HTTP headers that should be
  used when making HTTP requests to he APM Server
- `rejectUnauthorized` - Set to `false` if the client shouldn't verify
  the APM Server TLS certificates (default: `true`)
- `serverCaCert` - The CA certificate used to verify the APM Server's
  TLS certificate, and has the same requirements as the `ca` option
  of [`tls.createSecureContext`](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options).
- `serverTimeout` - HTTP request timeout in milliseconds. If no data is
  sent or received on the socket for this amount of time, the request
  will be aborted. It's not recommended to set a `serverTimeout` lower
  than the `time` config option. That might result in healthy requests
  being aborted prematurely. (default: `15000` ms)
- `keepAlive` - If set the `false` the client will not reuse sockets
  between requests (default: `true`)
- `keepAliveMsecs` - When using the `keepAlive` option, specifies the
  initial delay for TCP Keep-Alive packets. Ignored when the `keepAlive`
  option is `false` or `undefined` (default: `1000` ms)
- `maxSockets` - Maximum number of sockets to allow per host (default:
  `Infinity`)
- `maxFreeSockets` - Maximum number of sockets to leave open in a free
  state. Only relevant if `keepAlive` is set to `true` (default: `256`)
- `freeSocketTimeout` - A number of milliseconds of inactivity on a free
  (kept-alive) socket after which to timeout and recycle the socket. Set this to
  a value less than the HTTP Keep-Alive timeout of the APM server to avoid
  [ECONNRESET exceptions](https://medium.com/ssense-tech/reduce-networking-errors-in-nodejs-23b4eb9f2d83).
  This defaults to 4000ms to be less than the [node.js HTTP server default of
  5s](https://nodejs.org/api/http.html#serverkeepalivetimeout) (useful when
  using a Node.js-based mock APM server) and the [Go lang Dialer `KeepAlive`
  default of 15s](https://pkg.go.dev/net#Dialer) (when talking to the Elastic
  APM Lambda extension). (default: `4000`)

Cloud & Extra Metadata Configuration. Zero or one of the following three
options may be used.

- `cloudMetadataFetcher` - An object with a `getCloudMetadata(cb)` method
  for fetching metadata related to the current cloud environment. The callback
  is of the form `function (err, cloudMetadata)` and the returned `cloudMetadata`
  will be set on `metadata.cloud` for intake requests to APM Server. If
  provided, this client will not begin any intake requests until the callback
  is called.
- `expectExtraMetadata` - A boolean option to indicate that the client should
  not allow any intake requests to begin until `cloud.setExtraMetadata(...)`
  has been called. It is the responsibility of the caller to call
  `cloud.setExtraMetadata()`. If not, then the Client will never perform an
  intake request.
- `extraMetadata` - An object with extra metadata to merge into the metadata
  object created from the individual fields above.

APM Agent Configuration via Kibana:

- `centralConfig` - Whether or not the client should poll the APM
  Server regularly for new agent configuration. If set to `true`, the
  `config` event will be emitted when there's an update to an agent config
  option (default: `false`). _Requires APM Server v7.3 or later and that
  the APM Server is configured with `kibana.enabled: true`._

Streaming configuration:

- `size` - The maxiumum compressed body size (in bytes) of each HTTP
  request to the APM Server. An overshoot of up to the size of the
  internal zlib buffer should be expected as the buffer is flushed after
  this limit is reached. The default zlib buffer size is 16kB. (default:
  `768000` bytes)
- `time` - The maxiumum number of milliseconds a streaming HTTP request
  to the APM Server can be ongoing before it's ended. Set to `-1` to
  disable (default: `10000` ms)
- `bufferWindowTime` - Objects written in quick succession are buffered
  and grouped into larger clusters that can be processed as a whole.
  This config option controls the maximum time that buffer can live
  before it's flushed (counted in milliseconds). Set to `-1` for no
  buffering (default: `20` ms)
- `bufferWindowSize` - Objects written in quick succession are buffered
  and grouped into larger clusters that can be processed as a whole.
  This config option controls the maximum size of that buffer (counted
  in number of objects). Set to `-1` for no max size (default: `50`
  objects)
- `maxQueueSize` - The maximum number of buffered events (transactions,
  spans, errors, metricsets). Events are buffered when the agent can't keep
  up with sending them to the APM Server or if the APM server is down.
  If the queue is full, events are rejected which means transactions, spans,
  etc. will be lost. This guards the application from consuming unbounded
  memory, possibly overusing CPU (spent on serializing events), and possibly
  crashing in case the APM server is unavailable for a long period of time. A
  lower value will decrease the heap overhead of the agent, while a higher
  value makes it less likely to lose events in case of a temporary spike in
  throughput. (default: 1024)
- `intakeResTimeout` - The time (in milliseconds) by which a response from the
  [APM Server events intake API](https://www.elastic.co/guide/en/apm/server/current/events-api.html)
  is expected *after all the event data for that request has been sent*. This
  allows a smaller timeout than `serverTimeout` to handle an APM server that
  is accepting connections but is slow to respond. (default: `10000` ms)
- `intakeResTimeoutOnEnd` - The same as `intakeResTimeout`, but used when
  the client has ended, hence for the possible last request to APM server. This
  is typically a lower value to not hang an ending process that is waiting for
  that APM server request to complete. (default: `1000` ms)

Data sanitizing configuration:

- `truncateKeywordsAt` - Maximum size in unicode characters for strings stored
  as Elasticsearch keywords. Strings larger than this will be trucated
  (default: `1024`)
- `truncateLongFieldsAt` - The maximum size in unicode characters for a
  specific set of long string fields. String values above this length will be
  truncated. Default: `10000`. This applies to the following fields:
    - `transaction.context.request.body`, `error.context.request.body`
    - `transaction.context.message.body`, `span.context.message.body`, `error.context.message.body`
    - `span.context.db.statement`
    - `error.exception.message` (unless `truncateErrorMessagesAt` is specified)
    - `error.log.message` (unless `truncateErrorMessagesAt` is specified)
- `truncateStringsAt` - The maximum size in unicode characters for strings.
  String values above this length will be truncated (default: `1024`)
- `truncateErrorMessagesAt` - **DEPRECATED:** prefer `truncateLongFieldsAt`.
  The maximum size in unicode characters for error messages. Messages above this
  length will be truncated. Set to `-1` to disable truncation. This applies to
  the following properties: `error.exception.message` and `error.log.message`.
  (default: `2048`)

Other options:

- `logger` - A [pino](https://getpino.io) logger to use for trace and
  debug-level logging.
- `payloadLogFile` - Specify a file path to which a copy of all data
  sent to the APM Server should be written. The data will be in ndjson
  format and will be uncompressed. Note that using this option can
  impact performance.
- `apmServerVersion` - A string version to assume is the version of the
  APM Server at `serverUrl`. This option is typically only used for testing.
  Normally this client will fetch the APM Server version at startup via a
  `GET /` request. Setting this option avoids that request.

### Event: `config`

Emitted every time a change to the agent config is pulled from the APM
Server. The listener is passed the updated config options as a key/value
object.

Each key is the lowercase version of the environment variable, without
the `ELASTIC_APM_` prefix, e.g. `transaction_sample_rate` instead of
`ELASTIC_APM_TRANSACTION_SAMPLE_RATE`.

If no central configuration is set up for the given `serviceName` /
`environment` when the client is started, this event will be emitted
once with an empty object. This will also happen after central
configuration for the given `serviceName` / `environment` is deleted.

### Event: `close`

The `close` event is emitted when the client and any of its underlying
resources have been closed. The event indicates that no more events will
be emitted, and no more data can be sent by the client.

### Event: `error`

Emitted if an error occurs. The listener callback is passed a single
Error argument when called.

### Event: `finish`

The `finish` event is emitted after the `client.end()` method has been
called, and all data has been flushed to the underlying system.

### Event: `request-error`

Emitted if an error occurs while communicating with the APM Server. The
listener callback is passed a single Error argument when called.

The request to the APM Server that caused the error is terminated and
the data included in that request is lost. This is normally only
important to consider for requests to the Intake API.

If a non-2xx response was received from the APM Server, the status code
will be available on `error.code`.

For requests to the Intake API where the response is a structured error
message, the `error` object will have the following properties:

- `error.accepted` - An integer indicating how many events was accepted
  as part of the failed request. If 100 events was sent to the APM
  Server as part of the request, and the error reports only 98 as
  accepted, it means that two events either wasn't received or couldn't
  be processed for some reason
- `error.errors` - An array of error messages. Each element in the array
  is an object containing a `message` property (String) and an optional
  `document` property (String). If the `document` property is given it
  will contain the failed event as it was received by the APM Server

If the response contained an error body that could not be parsed by the
client, the raw body will be available on `error.response`.

The client is not closed when the `request-error` event is emitted.

### `client.sent`

An integer indicating the number of events (spans, transactions, errors, or
metricsets) sent by the client. An event is considered sent when the HTTP
request used to transmit it has ended. Note that errors in requests to APM
server may mean this value is not the same as the number of events *accepted*
by the APM server.

### `client.config(options)`

Update the configuration given to the `Client` constructor. All
configuration options can be updated except:

- `size`
- `time`
- `keepAlive`
- `keepAliveMsecs`
- `maxSockets`
- `maxFreeSockets`
- `centralConfig`

### `client.supportsKeepingUnsampledTransaction()`

This method returns a boolean indicating whether the remote APM Server (per
the configured `serverUrl`) is of a version that requires unsampled transactions
to be sent.

This defaults to `true` if the remote APM server version is not known -- either
because the background fetch of the APM Server version hasn't yet completed,
or the version could not be fetched.

### `client.supportsActivationMethodField()`

This method returns a boolean indicating whether the remote APM Server (per
the configured `serverUrl`) is of a version that supports the
`metadata.service.agent.activation_method` field. This is true for APM server
versions >=8.7.1. It defaults to true if the APM server version is not (yet)
known.

### `client.addMetadataFilter(fn)`

Add a filter function for the ["metadata" object](https://www.elastic.co/guide/en/apm/server/current/metadata-api.html)
sent to APM server. This will be called once at client creation, and possibly
again later if `client.config()` is called to reconfigure the client or
`client.addMetadataFilter(fn)` is called to add additional filters.

Here is an example of a filter that removes the `metadata.process.argv` field:

```js
apm.addMetadataFilter(function dropArgv(md) {
  if (md.process && md.process.argv) {
    delete md.process.argv
  }
  return md
})
```

It is up to the user to ensure the returned object conforms to the
[metadata schema](https://www.elastic.co/guide/en/apm/server/current/metadata-api.html),
otherwise APM data injest will be broken. An example of that (when used with
the Node.js APM agent) is this in the application's log:

```
[2021-04-14T22:28:35.419Z] ERROR (elastic-apm-node): APM Server transport error (400): Unexpected APM Server response
APM Server accepted 0 events in the last request
Error: validation error: 'metadata' required
  Document: {"metadata":null}
```

See the [APM Agent `addMetadataFilter` documentation](https://www.elastic.co/guide/en/apm/agent/nodejs/current/agent-api.html#apm-add-metadata-filter)
for further details.

### `client.setExtraMetadata([metadata])`

Add extra metadata to be included in the "metadata" object sent to APM Server in
intake requests. The given `metadata` object is merged into the metadata
determined from the client configuration.

The reason this exists is to allow some metadata to be provided asynchronously,
especially in combination with the `expectExtraMetadata` configuration option
to ensure that event data is not sent to APM Server until this extra metadata
is provided. For example, in an AWS Lambda function some metadata is not
available until the first function invocation -- which is some async time after
Client creation.

### `client.lambdaStart()`

Tells the client that a Lambda function invocation has started.
See [Notes on Lambda Usage](#notes-on-lambda-usage) below.

### `client.lambdaShouldRegisterTransactions()`

This returns a boolean indicating if the APM agent -- when running in a Lambda
environment -- should bother calling `client.lambdaRegisterTransaction(...)`.
This can help the APM agent avoid some processing gathering transaction data.

Typically the reason this would return `false` is when the Lambda extension is
too old to support registering transactions.


### `client.lambdaRegisterTransaction(transaction, awsRequestId)`

Tells the Lambda Extension about the ongoing transaction, so that data can be
used to report the transaction in certain error cases -- e.g. a Lambda handler
timeout.  See [Notes on Lambda Usage](#notes-on-lambda-usage) below.

Arguments:

- `transaction` - A transaction object that can be serialized to JSON.
- `awsRequestId` - The AWS request ID for this invocation. This is a UUID
  available on the Lambda context object.

### `client.sendSpan(span[, callback])`

Send a span to the APM Server.

Arguments:

- `span` - A span object that can be serialized to JSON
- `callback` - Callback is called when the `span` have been flushed to
  the underlying system

### `client.sendTransaction(transaction[, callback])`

Send a transaction to the APM Server.

Arguments:

- `transaction` - A transaction object that can be serialized to JSON
- `callback` - Callback is called when the `transaction` have been
  flushed to the underlying system

### `client.sendError(error[, callback])`

Send a error to the APM Server.

Arguments:

- `error` - A error object that can be serialized to JSON
- `callback` - Callback is called when the `error` have been flushed to
  the underlying system

### `client.sendMetricSet(metricset[, callback])`

Send a metricset to the APM Server.

Arguments:

- `error` - A error object that can be serialized to JSON
- `callback` - Callback is called when the `metricset` have been flushed to
  the underlying system

### `client.flush([opts,] [callback])`

Flush the internal buffer and end the current HTTP request to the APM
Server. If no HTTP request is in process nothing happens. In an AWS Lambda
environment this will also initiate a quicker shutdown of the intake request,
because the APM agent always flushes at the end of a Lambda handler.

Arguments:

- `opts`:
  - `opts.lambdaEnd` - An optional boolean to indicate if this is the final
    flush at the end of the Lambda function invocation. The client will do
    some extra handling if this is the case. See notes in `client.lambdaStart()`
    above.
- `callback` - Callback is called when the internal buffer has been
  flushed and the HTTP request ended. If no HTTP request is in progress
  the callback is called in the next tick.

### `client.end([callback])`

Calling the `client.end()` method signals that no more data will be sent
to the `client`. If the internal buffer contains any data, this is
flushed before ending.

Arguments:

- `callback` - If provided, the optional `callback` function is attached
  as a listener for the 'finish' event

### `client.destroy()`

Destroy the `client`. After this call, the client has ended and
subsequent calls to `sendSpan()`, `sendTransaction()`, `sendError()`,
`flush()`, or `end()` will result in an error.

## Notes on Lambda usage

To properly handle [data flushing for instrumented Lambda functions](https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#data-flushing)
this Client should be used as follows in a Lambda environment.

 1. Ensure that metadata is set before any of the following calls. Typically
    in Lambda this is done by (a) configuring the client with
    `expectExtraMetadata` and (b) calling `setExtraMetadata()` at the start of
    the first invocation.

 2. When a Lambda invocation starts, `client.lambdaStart()` must be called.
    The Client prevents intake requests to APM Server when in a Lambda
    environment when a function invocation is *not* active. This is to ensure
    that an intake request does not accidentally span a period when a Lambda VM
    is frozen, which can lead to timeouts and lost APM data.

 3. When the transaction for this Lambda invocation has been created,
    `await client.lambdaRegisterTransaction(<transaction>, <awsRequestId>)` should be
    called. This is used to pass transaction details to the Lambda Extension so
    a transaction can be reported in certain failure modes (e.g. a Lambda
    handler timeout).

    `client.lambdaShouldRegisterTransactions()` can be used to avoid gathering
    data for this call.

 4. When a Lambda invocation finishes, `client.flush({lambdaEnd: true}, cb)`
    must be called.

    The `lambdaEnd: true` tells the Client to (a) mark the lambda as inactive so
    a subsequent intake request is not started until the next invocation, and
    (b) signal the Elastic AWS Lambda Extension that this invocation is done.
    The user's Lambda handler should not finish until `cb` is called. This
    ensures that the extension receives tracing data and the end signal before
    the Lambda Runtime freezes the VM.
