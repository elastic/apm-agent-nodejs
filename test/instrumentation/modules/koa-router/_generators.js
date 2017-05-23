'use strict'

module.exports = function (router) {
  router.get('/hello', function * (next) {
    this.body = 'hello world'
  })
  router.get('/hello/:name', function * (next) {
    this.body = 'hello ' + this.params.name
  })
}
