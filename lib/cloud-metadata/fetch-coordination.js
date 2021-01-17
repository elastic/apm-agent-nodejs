const { EventEmitter } = require('events')
/**
 * Coordinates fetching of metadata from multiple provides
 *
 * Implements event based coordination for fetching meta data
 * from multiple providers.  The first provider to return
 * a non-error result "wins".  When this happens the object
 * will emit a `result` event.
 *
 * If all the metadata providers fail to return a result, then the
 * object will emit an error event indicating which signals the
 * failure to collect metadata from any event.
 */
class FetchCoordination extends EventEmitter {
  constructor (maxWaitMS=-1) {
    super()

    // how many results have we seen
    this.resultCount = 0
    this.expectedResults = 0
    this.errors = []
    this.scheduled = []
    this.done = false

    if(maxWaitMS !== -1) {
      setTimeout(()=>{
        if(!this.done) {
          const error = new FetchCoordinationError('callback coordination reached timeout')
          error.allErrors = this.errors
          this.emit('error', error)
        }
      }, maxWaitMS)
    }
  }

  /**
   * Accepts and schedules a callback function
   *
   * Callback will be in the form
   *     function(fetcher) {
   *         //... work to fetch data ...
   *
   *         // this callback calls the recordResult method
   *         // method of the fetcher
   *         fetcher.recordResult(error, result)
   *     }
   *
   * Method also increments expectedResults counter to keep track
   * of how many callbacks we're scheding
   */
  schedule (fetcherCallback) {
    this.expectedResults++
    this.scheduled.push(fetcherCallback)
  }

  /**
   * Starts processing of the callbacks scheduled by the `schedule` method
   */
  start () {
    // if called with nothing, send an error through so we don't hang
    if (this.scheduled.length === 0) {
      const error = new FetchCoordinationError('no callbacks to run')
      this.recordResult(error)
    }

    for (const [, cb] of this.scheduled.entries()) {
      process.nextTick(cb.bind(null, this))
    }
  }

  /**
   * Receives calls from scheduled callbacks.
   *
   * If called with a non-error, the method will emit a `result` event
   * and include the results as an argument.  Only a single result
   * is emitted -- in the unlikely event of additional metadata servers
   * responding this method will ignore them.
   *
   * If called by _all_ scheduled callbacks without a non-error, this method
   * will issue an error event.
   *
   */
  recordResult (error, result) {
    // console.log('.')
    this.resultCount++
    if (error) {
      this.errors.push(error)
      if (this.resultCount >= this.expectedResults && !this.done) {
        // we've made every request with success, signal an error
        const error = new FetchCoordinationError('all callbacks failed')
        error.allErrors = this.errors
        this.emit('error', error)
      }
    }

    if (!error && result && !this.done) {
      this.done = true
      this.emit('result', result)
    }
  }
}

/**
 * Error for FetchCoordination class
 *
 * Includes the individual errors from each callback
 * of the FetchCoordination object
 */
class FetchCoordinationError extends Error {
  constructor () {
    super(...arguments)
    this.allErrors = []
  }
}

module.exports = {
  FetchCoordination,
  FetchCoordinationError
}
