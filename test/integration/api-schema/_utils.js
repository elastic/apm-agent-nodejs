'use strict'

const exec = require('child_process').exec
const tmpdir = require('os').tmpdir
const join = require('path').join

const validator = require('is-my-json-valid')
const refParser = require('json-schema-ref-parser')
const thunky = require('thunky')

const schemaDir = thunky(function (cb) {
  const dir = join(tmpdir(), '.schemacache')
  const script = join(__dirname, 'download-json-schemas.sh')
  const cmd = `"${script}" "${dir}"`
  console.log('downloading schemas from GitHub to %s...', dir)
  exec(cmd, function (err) {
    if (err) return cb(err)
    cb(null, dir)
  })
})

exports.transactionsValidator = thunky(function (cb) {
  loadSchema(join('transactions', 'payload.json'), cb)
})

exports.errorsValidator = thunky(function (cb) {
  loadSchema(join('errors', 'payload.json'), cb)
})

function loadSchema (relativePath, cb) {
  schemaDir(function (err, dir) {
    if (err) return cb(err)
    const path = join(dir, relativePath)
    console.log('processing %s...', path)
    refParser.dereference(path, function (err, schema) {
      if (err) return cb(err)
      cb(null, validator(schema, {verbose: true}))
    })
  })
}
