var shimmer = require('../shimmer')

module.exports = function (nodemailer, agent, version, enabled) {
  if (!enabled) return nodemailer
  agent.logger.debug('shimming nodemailer.createTransport')
  shimmer.wrap(nodemailer, 'createTransport', function (orig) {
    return function () {
      var transport = orig.apply(this, arguments)

      shimTransport(transport)
      return transport
    }
  })

  function shimTransport (transport) {
    agent.logger.debug('shimming transport.sendMail')

    shimmer.wrap(transport, 'sendMail', function (orig) {
      return function () {
        const transaction = agent.currentTransaction ||
                                        agent.startTransaction('Nodemailer', 'Nodemailer')

        const span = transaction.startSpan('Send Email', 'nodemailer.sendMail')
        if (!span) {
          return orig.apply(this, arguments)
        }

        function endTransaction (transaction) {
          if (transaction.type === 'Nodemailer') {
            transaction.end()
          }
        }

        // callback is provided
        if (typeof arguments[1] === 'function') {
          const cb = arguments[1]

          return orig.call(this, arguments[0], function (err, result) {
            if (err) {
              agent.captureError(err)
            }
            span.end()
            endTransaction(transaction)

            cb(err, result)
          })
        }

        return new Promise((resolve, reject) => {
          return orig.apply(this, arguments).then((result) => {
            span.end()
            endTransaction(transaction)

            resolve()
          }, (err) => {
            agent.captureError(err)

            span.end()
            endTransaction(transaction)

            reject(err)
          })
        })
      }
    })
  }

  return nodemailer
}
