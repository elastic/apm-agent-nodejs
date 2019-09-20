'use strict'

process.addListener('unhandledRejection', handler)

exports.remove = function stop () {
  process.removeListener('unhandledRejection', handler)
}

function handler (promise, reason) {
  console.error('Unhandled Rejection at:', promise, '\nreason:', reason)
  process.exit(1)
}
