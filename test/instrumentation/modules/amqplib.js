'use strict'

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var amqplib = require('amqplib')
// var amqplibCallback = require('amqplib/callback_api')
var test = require('tape')

var mockClient = require('../../_mock_http_client')

test('instrument simple message - publish method (promise)', function (t) {
  resetAgent(done(t))

  amqplib.connect(`amqp://${process.env.RABBITMQ_HOST || '127.0.0.1'}`).then(function (connection) {
    connection.createChannel().then(function (channel) {
      channel.assertExchange('my_exchange', 'fanout', { durable: false }).then(function () {
        agent.startTransaction('foo', 'bar')
        channel.publish('my_exchange', 'my_routing_key', Buffer.from('helloworld', 'utf8'))
        agent.endTransaction()

        channel.close().then(function () {
          connection.close().then(function () {
            agent.flush()
          })
        })
      })
    })
  })
})

test('instrument simple message - sendToQueue method (promise)', function (t) {
  resetAgent(done(t))

  amqplib.connect(`amqp://${process.env.RABBITMQ_HOST || '127.0.0.1'}`).then(function (connection) {
    connection.createChannel().then(function (channel) {
      channel.assertQueue('my_queue', { durable: false }).then(function () {
        agent.startTransaction('foo', 'bar')
        channel.sendToQueue('my_queue', Buffer.from('helloworld', 'utf8'))
        agent.endTransaction()

        channel.close().then(function () {
          connection.close().then(function () {
            agent.flush()
          })
        })
      })
    })
  })
})

// test('instrument simple message - publish method (callback)', function (t) {
//   resetAgent(done(t))

//   amqplibCallback.connect(`amqp://${process.env.RABBITMQ_HOST || '127.0.0.1'}`, function (err, connection) {
//     connection.createChannel(function (err, channel) {
//       channel.assertExchange('my_exchange', 'fanout', { durable: false }, function () {
//         agent.startTransaction('foo', 'bar')
//         channel.publish('my_exchange', 'my_routing_key', Buffer.from('helloworld', 'utf8'))
//         agent.endTransaction()

//         channel.close(function () {
//           connection.close(function () {
//             agent.flush()
//           })
//         })
//       })
//     })
//   })
// })

// test('instrument simple message - sendToQueue method (callback)', function (t) {
//   resetAgent(done(t))

//   amqplibCallback.connect(`amqp://${process.env.RABBITMQ_HOST || '127.0.0.1'}`, function (err, connection) {
//     connection.createChannel(function (err, channel) {
//       channel.assertQueue('my_queue', { durable: false }, function (err) {
//         agent.startTransaction('foo', 'bar')
//         channel.sendToQueue('my_queue', Buffer.from('helloworld', 'utf8'))
//         agent.endTransaction()

//         channel.close(function (err) {
//           connection.close(function (err) {
//             agent.flush()
//           })
//         })
//       })
//     })
//   })
// })

function done (t) {
  return function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)

    var trans = data.transactions[0]

    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'bar')
    t.strictEqual(trans.result, 'success')

    var span = data.spans[0]

    // t.strictEqual(span.name, null)
    t.strictEqual(span.type, 'messaging')
    t.strictEqual(span.subtype, 'amqp')
    t.strictEqual(span.action, 'publish')
    t.deepEqual(span.context.destination, {
      service: { name: 'amqp', resource: 'amqp', type: 'messaging' },
      address: process.env.RABBITMQ_HOST || '127.0.0.1',
      port: 5672
    })

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(2, cb)
  agent.captureError = function (err) { throw err }
}
