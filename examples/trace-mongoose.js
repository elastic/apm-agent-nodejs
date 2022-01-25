// A small example showing Elastic APM tracing the 'mongoose' package.
//
// This assumes a MongoDB server running on localhost. You can use:
//    npm run docker:start mongodb
// to start a MongoDB docker container. Then `npm run docker:stop` to stop it.
//
// Some of the following code is adapted from
// https://github.com/Automattic/mongoose/tree/master/examples/statics

const apm = require('../').start({ // elastic-apm-node
  serviceName: 'example-trace-mongoose',
  logUncaughtExceptions: true
})

const mongoose = require('mongoose')

const DB_URL = 'mongodb://localhost:27017/example-trace-mongoose'

// Define a schema.
const PersonSchema = new mongoose.Schema({
  name: String,
  age: Number,
  birthday: Date
})
mongoose.model('Person', PersonSchema)

async function run () {
  // For tracing spans to be created, there must be an active transaction.
  // Typically, a transaction is automatically started for incoming HTTP
  // requests to a Node.js server. However, because this script is not running
  // an HTTP server, we manually start a transaction. More details at:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/custom-transactions.html
  const t1 = apm.startTransaction('t1')

  const Person = mongoose.model('Person')
  await mongoose.connect(DB_URL)

  const bill = await Person.create({
    name: 'bill',
    age: 25,
    birthday: new Date().setFullYear((new Date().getFullYear() - 25))
  })
  console.log('Person added to db: %s', bill)

  const result = await Person.find({})
  console.log('find result:', result)

  // Cleanup.
  await Person.deleteMany()
  await mongoose.disconnect()
  t1.end()
}

run()
