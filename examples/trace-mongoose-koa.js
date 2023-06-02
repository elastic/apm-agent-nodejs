/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// eslint-disable-next-line no-unused-vars
const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-mongoose-koa',
  logUncaughtExceptions: true
})

const mongoose = require('mongoose')
const Koa = require('koa')
const app = new Koa()

// const ip = 'localhost'
// const port = 27017
// const username = 'root'
// const password = 'password'
// const database = 'database'

async function bootstrap () {
  // await mongoose.connect(`mongodb://${ip}:${port}/admin`, {
  //   auth: {
  //     username,
  //     password,
  //   },
  //   dbName: database,
  // }).catch(e => {
  //   console.error('Mongo connection error', e)
  //   // eslint-disable-next-line no-process-exit
  //   process.exit(1)
  // })
  await mongoose.connect('mongodb://localhost:27017/example-trace-mongoose-koa').catch(e => {
    console.error('Mongo connection error', e)
    // eslint-disable-next-line no-process-exit
    process.exit(1)
  })

  const Cat = mongoose.model('Cat', { name: String })

  // response
  app.use(async ctx => {
    const { pathname } = ctx.request.URL
    if (pathname === '/create') {
      const kitty = new Cat({ name: 'Zildjian' })
      await kitty.save()
      ctx.body = 'Meow'
    } else if (pathname === '/getAll') {
      ctx.body = await Cat.find()
    }
  })

  app.listen(3000)
  console.log('listening on 3000')
}

bootstrap()
