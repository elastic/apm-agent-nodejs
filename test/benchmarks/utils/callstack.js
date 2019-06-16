'use strict'

const stack = []

for (let depth = 0; depth < 50; depth++) {
  /* eslint-disable no-eval */
  eval(`
    stack[${depth}] = function level${depth} (depth, cb) {
      if (--depth === 0) return cb()
      else stack[depth](depth, cb)
    }
  `)
  /* eslint-endable no-eval */
}

module.exports = function deep (depth, cb) {
  stack[depth](depth, cb)
}
