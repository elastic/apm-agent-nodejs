'use strict'

module.exports = function (router) {
  router.get('/hello', function * (next) {
    this.body = 'hello world'
  })

  // create a catch all (.*) route to test that we handle that correctly
  router.use(function * (gen) {
    gen.next()
  })

  router.get('/hello/:name', function * (next) {
    this.body = 'hello ' + this.params.name
  })
}
