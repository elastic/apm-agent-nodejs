'use strict'

var agent = require('../../..').start({
  appName: 'test',
  organizationId: 'test',
  secretToken: 'test',
  captureExceptions: false
})
var ins = global.ins = agent._instrumentation

var semver = require('semver')
var pkg = require('generic-pool/package')

if (semver.lt(process.version, '4.0.0') && semver.gte(pkg.version, '3.0.0')) {
  console.log('Unsupported version of Node.js')
  process.exit()
}

var test = require('tape')
var genericPool = require('generic-pool')

if (genericPool.createPool) {
  test('v3.x', function (t) {
    var active = 0

    var pool = genericPool.createPool({
      create: function () {
        var p = new Promise(function (resolve, reject) {
          process.nextTick(function () {
            resolve({id: ++active})
          })
        })
        p.foo = 42
        return p
      },
      destroy: function (resource) {
        return new Promise(function (resolve, reject) {
          process.nextTick(function () {
            resolve()
            if (--active <= 0) t.end()
          })
        })
      }
    })

    var t1 = ins.startTransaction()

    pool.acquire().then(function (resource) {
      t.equal(resource.id, 1)
      t.equal(ins.currentTransaction._uuid, t1._uuid)
      pool.release(resource)
    }).catch(function (err) {
      t.error(err)
    })

    t.equal(ins.currentTransaction._uuid, t1._uuid)
    var t2 = ins.startTransaction()

    pool.acquire().then(function (resource) {
      t.equal(resource.id, 1)
      t.equal(ins.currentTransaction._uuid, t2._uuid)
      pool.release(resource)
    }).catch(function (err) {
      t.error(err)
    })

    t.equal(ins.currentTransaction._uuid, t2._uuid)

    pool.drain().then(function () {
      pool.clear()
    }).catch(function (err) {
      t.error(err)
    })
  })
} else {
  test('v2.x', function (t) {
    var active = 0

    var pool = new genericPool.Pool({
      create: function (cb) {
        process.nextTick(function () {
          cb(null, {id: ++active})
        })
      },
      destroy: function (resource) {
        if (--active <= 0) t.end()
      }
    })

    var t1 = ins.startTransaction()

    pool.acquire(function (err, resource) {
      t.error(err)
      t.equal(resource.id, 1)
      t.equal(ins.currentTransaction._uuid, t1._uuid)
      pool.release(resource)
    })

    t.equal(ins.currentTransaction._uuid, t1._uuid)
    var t2 = ins.startTransaction()

    pool.acquire(function (err, resource) {
      t.error(err)
      t.equal(resource.id, 1)
      t.equal(ins.currentTransaction._uuid, t2._uuid)
      pool.release(resource)
    })

    t.equal(ins.currentTransaction._uuid, t2._uuid)

    pool.drain(function () {
      pool.destroyAllNow()
    })
  })
}
