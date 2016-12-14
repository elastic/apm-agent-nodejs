'use strict'

var agent = require('../../..').start({
  appId: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})
var ins = agent._instrumentation

var test = require('tape')
var Pool = require('generic-pool').Pool

test(function (t) {
  var active = 0

  var pool = new Pool({
    create: function (cb) {
      process.nextTick(function () {
        var client = {id: ++active}
        cb(null, client)
      })
    },
    destroy: function (client) {
      if (--active <= 0) {
        t.end()
      }
    }
  })

  var t1 = ins.startTransaction()

  pool.acquire(function (err, client) {
    t.error(err)
    t.equal(client.id, 1)
    t.equal(ins.currentTransaction._uuid, t1._uuid)
    pool.release(client)
  })

  t.equal(ins.currentTransaction._uuid, t1._uuid)
  var t2 = ins.startTransaction()

  pool.acquire(function (err, client) {
    t.error(err)
    t.equal(client.id, 1)
    t.equal(ins.currentTransaction._uuid, t2._uuid)
    pool.release(client)
  })

  t.equal(ins.currentTransaction._uuid, t2._uuid)

  pool.drain(function () {
    pool.destroyAllNow()
  })
})
