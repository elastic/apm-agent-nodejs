'use strict'

exports.promise = promise
exports.nonPromise = nonPromise

async function promise (delay) {
  var res = await promise2(delay)
  return res.toUpperCase()
}

async function promise2 (delay) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve('success')
    }, delay)
  })
}

async function nonPromise () {
  var res = await 'success'
  return res.toUpperCase()
}
