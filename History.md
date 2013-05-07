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
