# 3.21.0 - 2016/11/21
  * core: log extra meta data along with instrumented http request
  * core: don't log HTTP body by default (use `logBody` config option if you wish to log the HTTP body)
  * core: pretty print JSON and form data bodies on opbeat.com (only for smaller bodies)
  * core: filter sensitive cookies
  * core: don't log false '{}' request body
  * core: fix NA endpoint issue

# 3.20.0 - 2016/11/9
  * core: sample transactions to reduce bandwidth and memory usage
  * core: don't close transactions on premature close of tcp socket (wait till parent request ends)
  * core: ensure transaction name and result are always set in case of SSE
  * core: freeze transaction result when ended
  * core: freeze transaction name when ended
  * core: don't leak transactions when blacklisting
  * core: improve detection of ended responses

# 3.19.3 - 2016/10/27
  * core: fix Node.js v7.0.0 support

# 3.19.2 - 2016/10/25
  * core: fix issue with missing stack traces for certain traces

# 3.19.1 - 2016/10/12
  * express: expose express.static.mime

# 3.19.0 - 2016/10/11
  * bluebird: add support for bluebird ^2.0.0 (instrumented to ensure context is preserved across async boundaries)

# 3.18.0 - 2016/10/10
  * bluebird: instrument ^3.0.0 (instrumented to ensure context is preserved across async boundaries)

# 3.17.2 - 2016/9/12
  * core: improve native promise instrumentation

# 3.17.1 - 2016/8/26
  * core: logging of runtime and framework details to Opbeat intake API

# 3.17.0 - 2016/8/24
  * allow not instrumenting certain requests via `ignoreUrls` and `ignoreUserAgents`

# 3.16.0 - 2016/8/22
  * http: add support for SSE

# 3.15.0 - 2016/8/18
  * Anonymize HTTP Authorization headers
  * Allow use of filtering middleware using opbeat.addFilter()
  * deprecate: the filter option is deprecated in favor of opbeat.addFilter()

# 3.14.1 - 2016/8/4
  * redis: fix issue with optional callback

# 3.14.0 - 2016/7/30
  * pg: support all pg v6.x versions

# 3.13.0 - 2016/7/29
  * redis: add support for ioredis@2.x

# 3.12.0 - 2016/7/28
  * redis: add support for redis@2.x

# 3.11.0 - 2016/7/28
  * detect and report HTTP timeouts

# 3.10.0 - 2016/7/20
  * hapi: automatically capture request errors

# 3.9.0 - 2016/7/15
  * mongodb: instrument mongodb-core v2.x

# 3.8.2 - 2016/7/14
  * express: fix route naming for mounted middleware requests

# 3.8.1 - 2016/7/12
  * fix issue when associating https requests to captured errors in Node.js v0.10

# 3.8.0 - 2016/7/7
  * pg: support all pg v5.x versions

# 3.7.1 - 2016/7/5
  * mysql: ensure context is always kept when using pool.getConnection
  * Improve tests

# 3.7.0 - 2016/7/1
  * mysql: official support for mysql (no feature flag required)

# 3.6.15 - 2016/6/30
  * mysql: fix duplicate query traces when connection have been released
  * Refactor shimming
  * Improve tests

# 3.6.14 - 2016/6/22
  * mysql: improve grouping of mysql errors
  * mysql: don't record pool cluster queries multiple times

# 3.6.13 - 2016/6/19
  * Add mysql support (feature flag: ff_mysql)
  * Minor speed/memory improvements

# 3.6.12 - 2016/6/15
  * Send first batch of transactions within 5 seconds of the first request after the Node process boots
  * Fix: Don't record same request multipe times if multiple request listeners are added to the HTTP server

# 3.6.11 - 2016/6/6
  * Don't contact intake api if agent is inactive [Fixes #50]
  * Don't try to patch mongodb-core pre version 1.2.7

# 3.6.10 - 2016/6/3
  * Fix: Traces should now be associated with the correct transaction
  * Improve debug info and tests

# 3.6.9 - 2016/5/26
  * Revert new Promise instrumentation as it caused issues in certain cases

# 3.6.8 - 2016/5/24
  * Improve core Node.js instrumentation
  * Update dependencies
  * Fix test-cli

# 3.6.7 - 2016/4/22
  * Improve debugging output for unknown routes

# 3.6.6 - 2016/3/24
  * Fix: Recover from certain cases of missing traces that would result in a missing performance breakdown

# 3.6.5 - 2016/3/17
  * Express: Fix naming of mounted routes
  * Misc cleanup

# 3.6.4 - 2016/2/29
  * Fix: Ensure Express middleware calls next() even if agent is inactive

# 3.6.3 - 2016/2/29
  * Fix: no longer log outgoing https requests twice on Opbeat

# 3.6.2 - 2016/2/28
  * Fix: error parsing support for Node.js 0.10

# 3.6.1 - 2016/2/28
  * Fix: Read stack trace source code on Windows

# 3.6.0 - 2016/2/24
  * hapi: Improved route naming in case of errors during the request (PR #34, @AdriVanHoudt)
  * hapi: Automatic CORS detection

# 3.5.4 - 2016/2/23
  * Fix: Improve extraction of PostgreSQL quries

# 3.5.3 - 2016/2/22
  * Improve debugging output

# 3.5.2 - 2016/2/17
  * Upgrade dependencies

# 3.5.1 - 2016/2/17
  * Lower memory consumption
  * Fix: Long running transactions sometimes did not have any associated traces

# 3.5.0 - 2016/2/17
  * Hapi: Automatically attach HTTP body to errors

# 3.4.3 - 2016/2/16
  * Improve caching of stack traces during instrumentation (in some use cases this will also reduce memory usage)

# 3.4.2 - 2016/2/15
  * Fix: Do not fail on modules with no main in package.json or index.js file

# 3.4.1 - 2016/2/15
  * Fix: Handle API limits client-side
  * Fix: Only instrument supported module versions

# 3.4.0 - 2016/2/11
  * Make 2nd argument to trace.start optional

# 3.3.0 - 2016/2/5
  * Express: support sub-apps and sub-routes

# 3.2.0 - 2016/2/2
  * Express: group all static file requests in same transaction
  * Log path of outgoing requests in performance metrics

# 3.1.4 - 2015/12/16
  * Fix minor PostgreSQL instrumentation bug

# 3.1.3 - 2015/12/3
  * Fix support for instrumenting HTTPS servers

# 3.1.2 - 2015/12/3
  * Add more debugging information on startup

# 3.1.1 - 2015/12/3
  * Improve npmjs.com documentation

# 3.1.0 - 2015/12/3
  * Add Hapi support

# 3.0.6 - 2015/12/3
  * Fix another stacktrace collection bug that sometimes would result in an uncaught exception

# 3.0.5 - 2015/12/1
  * Fix stacktrace collection bug that sometimes would result in an uncaught exception

# 3.0.4 - 2015/11/28
  * Improve debug logging for edge cases

# 3.0.3 - 2015/11/26
  * Improve MongoDB query instrumentation

# 3.0.2 - 2015/11/22
  * Fix crash if the stacktrace for some reason is missing

# 3.0.1 - 2015/11/22
  * Remove temp files

# 3.0.0 - 2015/11/22
  * New: Performance metrics
  * Breaking: New configuration API
  * Breaking: Remove deprecated `trackDeployment` function
  * Breaking: Renamed `agentLogLevel` config option to `logLevel`
  * Breaking: Throw if agent is started more than once

# 1.6.0 - 2015/09/21
  * New: Add automatic HTTP server request logging
  * New: Prefix all output with the an error id
  * Output stack traces closer in the log to where the error happened
  * Use milliseconds in timestamps
  * Improve exactness of error capture time
  * Limit logged body to 2048 UTF8 chars
  * Update license to one approved by SPDX OSI
  * Bug fix: Make sure the specified exceptionLogLevel is used

# 1.5.0 - 2015/09/01
  * Experimental: Log location in code where error was discovered (feature flag: _ff_captureFrame)

# 1.4.2 - 2015/07/14
  * Don't fail if options.extra is invalid format

# 1.4.1 - 2015/05/24
  * Fix bug where messages chould not have custom culprit

# 1.4.0 - 2015/05/17
  * Allow the `culprit` to be set by the user when calling `captureError`

# 1.3.0 - 2015/04/24
  * Rename `trackDeployment` to `trackRelease`
  * Rename `trackRelease` option `path` to `cwd`
  * Split code out into separate dependencies
  * Update dependencies
  * Add tests for io.js and Node.js 0.12.x

# 1.2.0 - 2015/03/06
  * New: Add `filter` config option
  * Use new API domian endpoint

# 1.1.2 - 2015/01/16
  * Allow `active` config option to be other values than 1/0
  * Improve tests

# 1.1.1 - 2015/01/14
  * Fix: Ensure invalid objects are logged in a more human readable way

# 1.1.0 - 2015/01/08
  * New: Log if an error is uncaught under the "Extra" tab
  * New: Support custom loggers using the new `options.logger` option
  * Internal improvements

# 1.0.8 - 2015/01/02
  * Bug fix: Fix connect/express middleware

# 1.0.7 - 2014/12/11
  * Bug fix: Exit process even if Opbeat cannot be reached
  * Improve tests

# 1.0.6 - 2014/12/4
  * Fix issue with logging json HTTP requests if using req.json
  * Rename internal options.apiHost to options._apiHost (hopefully you did not use this)

# 1.0.5 - 2014/11/8
  * Log missing line numbers as line zero

# 1.0.4 - 2014/11/8
  * Bug fix: Ensure the agent doesn't fail on circular dependencies

# 1.0.3 - 2014/11/8
  * API update: The new version of the Opbeat API expects the stack frames in reverse order

# 1.0.2 - 2014/10/30
  * Big fix: Ensure emitted errors after an uncaught exception doesn't throw

# 1.0.1 - 2014/10/23
  * Minor bugfixes and improvements

# 1.0.0 - 2014/9/25
  * Remove createClient() function
  * Replace options.env with options.active
  * Rename options.handleExceptions to options.captureExceptions
  * Rename options.app_id to options.appId
  * Rename options.organization_id to options.organizationId
  * Rename options.secret_token to options.secretToken
  * Add deployment tracking support
  * Merge captureMessage, captureError and captureRequestError into one function
  * Remove support for overriding the Opbeat http API port number
  * Automatically log custom properties on the Error object
  * Log HTTP User-Agent header if present
  * Log name of Node.js module where error occured
  * Log request.json if present
  * Log whether http requests are secure or not
  * Log remote IP
  * Allow options.stackTraceLimit to be falsy
  * Remove client.version property
  * Remove event connectionError (use error event instead)
  * Control log level of client with options.clientLogLevel (replaces options.silent)
  * Allow handleUncaughtExceptions to be called multiple times
  * Allow the severity level of exceptions to be set in options
  * Allow all options to be set via environment variables
  * Parse the Opbeat URL to the captureUncaughtExceptions callback
  * Don't log stack-frame path as absolute
  * Only log cookies if they are present
  * Security fix: Don't shamelessly track all environment variables
  * Bug fix: Support the new Opbeat param_message API format
  * Improve HTTP message parsing
  * A lot of code cleanup

# 0.3.1 - 2014/4/28
  * Allow you to call client functions without having to worry about
    binding

# 0.3.0 - 2014/4/9
  * Removed support for Node.js versions below v0.10

# 0.2.9 - 2014/4/9
  * Internal improvements

# 0.2.8 - 2013/8/25
  * Bug fix: Set culprit correctly on errors sent to Opbeat

# 0.2.7 - 2013/6/10
  * Bug fix: The express/connect middleware now correctly uses or
    creates an instance of the Opbeat client

# 0.2.6 - 2013/6/10
  * Never published

# 0.2.5 - 2013/6/10
  * Some exceptions where logged twice in the local log
  * Improved opbeat error logging: If opbeat returns an error, the
    entire error is now written to the log
  * Bug fix: Thrown exceptions was not logged to Opbeat

# 0.2.4 - 2013/5/7
  * Bug fix: Request errors was printet twice in the server-logs

# 0.2.3 - 2013/5/2
  * Create an opbeat client once and reuse it. Now you can create a
    client using `opbeat.createClient()` and reuse it using
    `opbeat.client`
  * Added silent option. Opbeat will not output anything to STDOUT or
    STDERR, except configuration errors
  * Added exceptionsAreCritical option, which is on my default. This
    means that uncaught exceptions are logged as critical as opposed to
    the error level
  * Allow better grouping of messages:
    21384d7c0df1ffec5b985d918cab3a91208e75e3
  * Added default event listeners, so you do not have to:
    9b83e18835c2b7e24dd211b51fb38f9d820a9956
  * Bug fixing

# 0.2.2 - 2013/4/27
  * All output is now directed to STDERR
  * Always output result of sending something to Opbeat, even if you
    have disabled automatic exception handling and are providing a
    custom callback to `handleUncaughtExceptions`

# 0.2.1 - 2013/4/8
  * Bug fixing

# 0.2.0 - 2013/4/8
  * Brand new API - Not backward compatible

# 0.1.0 - 2013/4/2
  * Initial release. Forked raven-node and converted to Opbeat API
