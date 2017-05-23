'use strict'

module.exports = function (router) {
  router.get('/hello', function (ctx, next) {
    ctx.body = 'hello world'
  })
  router.get('/hello/:name', function (ctx, next) {
    ctx.body = 'hello ' + ctx.params.name
  })
}
