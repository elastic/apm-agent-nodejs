'use strict'
/**
 * Cleans up a Request Object
 *
 * Clears all event listeners (to avoid multiple errors
 * triggering a callback twice) and destroys the request.
 * After clearing all listeners adds a new `error` listener
 * to avoid unhandled error events.
 */
function cleanupRequest (request) {
  // removing all the listeners ensures our error callback
  // will not be called multiple times for connectTimeout,
  // timeout, socket hang ups, etc.
  request.removeAllListeners()

  // create a new error handler to catch any errors
  // that may be lingering
  request.on('error', function () {

  })
  request.destroy()
}
module.exports = {
  cleanupRequest
}
