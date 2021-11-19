'use strict'

function assertError (t, received, expected) {
  t.strictEqual(received, expected)
}

function assertTransaction (t, trans, name) {
  t.strictEqual(trans.name, name)
  t.ok(trans.ended)
}

module.exports = {
  assertError,
  assertTransaction
}
