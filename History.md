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
