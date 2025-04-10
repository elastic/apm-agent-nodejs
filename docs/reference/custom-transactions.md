---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
---

# Custom transactions [custom-transactions]

This is an example of how to use custom transactions. For general information about the Elastic APM Node.js Transaction API, see the [Transaction API documentation](/reference/transaction-api.md).

The Elastic APM agent for Node.js instruments your application by grouping incoming HTTP requests into logical buckets. Each HTTP request is recorded in what we call a transaction. But if your application is not a regular HTTP server, the Node.js agent will not able to know when a transaction should start and when it ends.

If for instance your application is a background job processing worker or is only accepting WebSockets, you’ll need to manually start and end transactions.

Example of a background job application polling the SQS queuing system for jobs:

```js
var apm = require('elastic-apm-node').start()
var sqs = require('simple-sqs')()

// listen for jobs on the queue
var queue = sqs(queueUrl, function (msg, cb) {
  // The SQS queue will send multiple messages using an array
  // of records
  var tasks = msg.Body.Records.map(function (job) {
    return new Promise(function (resolve, reject) {
      // start one new transaction for each job record received
      // on the queue
      var name = 'Job ' + job.type
      var type = 'job'
      var trans = apm.startTransaction(name, type)

      // call the function that actually processes the job
      processJob(job, function (err) {
        // if the job could not be processes, set the result to
        // a 5xx error code. Here 500 indicates error, 200 is ok
        trans.result = err ? 'error' : 'success'

        // end the transaction
        trans.end()

        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  })

  Promise.all(tasks).then(function () {
    cb()
  }, cb)
})

queue.on('error', function (err) {
  // in case the queue encounters an error, report it to Elastic APM
  apm.captureError(err)
})
```

