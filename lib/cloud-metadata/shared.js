'use strict'
/**
 * Cleans up a Request Object
 *
 * Clears all event listeners (to avoid multiple errors
 * triggering a callback twice) and destroys the request.
 * After clearing all listeners adds a new `error` listener
 * to avoid unhandled error event throws.
 */
function cleanupRequest (request) {
  // removing all the listeners ensures our error callback
  // will not be called multiple times for connectTimeout,
  // timeout, docket hang ups, etc.
  request.removeAllListeners()

  // create a new error handler to catch the socket
  // hang up the request will emit after we call
  // destroy
  request.on('error', function () {

  })
  request.destroy()
}
module.exports = {
  cleanupRequest
}
