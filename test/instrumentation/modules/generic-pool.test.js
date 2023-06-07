/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows')
  process.exit(0)
}

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const genericPool = require('generic-pool')
const test = require('tape')

const ins = global.ins = agent._instrumentation

if (genericPool.createPool) {
  test('v3.x', function (t) {
    let active = 0

    const pool = genericPool.createPool({
      create () {
        const p = new Promise(function (resolve, reject) {
          process.nextTick(function () {
            resolve({ id: ++active })
          })
        })
        p.foo = 42
        return p
      },
      destroy (resource) {
        return new Promise(function (resolve, reject) {
          process.nextTick(function () {
            resolve()
            if (--active <= 0) t.end()
          })
        })
      }
    })

    const t1 = ins.startTransaction()

    pool.acquire().then(function (resource) {
      t.strictEqual(resource.id, 1)
      t.strictEqual(ins.currTransaction().id, t1.id)
      pool.release(resource)
    }).catch(function (err) {
      t.error(err)
    })

    t.strictEqual(ins.currTransaction().id, t1.id)
    const t2 = ins.startTransaction()

    pool.acquire().then(function (resource) {
      t.strictEqual(resource.id, 1)
      t.strictEqual(ins.currTransaction().id, t2.id)
      pool.release(resource)
    }).catch(function (err) {
      t.error(err)
    })

    t.strictEqual(ins.currTransaction().id, t2.id)

    pool.drain().then(function () {
      pool.clear()
    }).catch(function (err) {
      t.error(err)
    })
  })
} else {
  test('v2.x', function (t) {
    let active = 0

    const pool = new genericPool.Pool({
      create (cb) {
        process.nextTick(function () {
          cb(null, { id: ++active })
        })
      },
      destroy (resource) {
        if (--active <= 0) t.end()
      }
    })

    const t1 = ins.startTransaction()

    pool.acquire(function (err, resource) {
      t.error(err)
      t.strictEqual(resource.id, 1)
      t.strictEqual(ins.currTransaction().id, t1.id)
      pool.release(resource)
    })

    t.strictEqual(ins.currTransaction().id, t1.id)
    const t2 = ins.startTransaction()

    pool.acquire(function (err, resource) {
      t.error(err)
      t.strictEqual(resource.id, 1)
      t.strictEqual(ins.currTransaction().id, t2.id)
      pool.release(resource)
    })

    t.strictEqual(ins.currTransaction().id, t2.id)

    pool.drain(function () {
      pool.destroyAllNow()
    })
  })
}
