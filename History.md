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
