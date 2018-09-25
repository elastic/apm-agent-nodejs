'use strict'

const exec = require('child_process').exec
const fs = require('fs')
const tmpdir = require('os').tmpdir
const join = require('path').join

const validator = require('is-my-json-valid')
const refParser = require('json-schema-ref-parser')
const rimraf = require('rimraf')
const thunky = require('thunky')

const schemaDir = thunky(function (cb) {
  const dir = join(tmpdir(), '.schemacache')
  fs.stat(dir, function (err) {
    if (!err) return cb(null, dir)

    const script = join(__dirname, 'download-json-schemas.sh')
    const cmd = `"${script}" "${dir}"`
    console.log('downloading schemas from GitHub to %s...', dir)
    exec(cmd, function (err) {
      if (err) {
        console.log('download failed. cleaning up...')
        return rimraf(dir, function (err2) {
          cb(err2 || err)
        })
      }

      cb(null, dir)
    })
  })
})

exports.metadataValidator = thunky(function (cb) {
  loadSchema('metadata.json', cb)
})

exports.transactionValidator = thunky(function (cb) {
  loadSchema(join('transactions', 'v2_transaction.json'), cb)
})

exports.spanValidator = thunky(function (cb) {
  loadSchema(join('spans', 'v2_span.json'), cb)
})

exports.errorValidator = thunky(function (cb) {
  loadSchema(join('errors', 'v2_error.json'), cb)
})

function loadSchema (relativePath, cb) {
  schemaDir(function (err, dir) {
    if (err) return cb(err)
    const path = join(dir, relativePath)
    console.log('processing %s...', path)
    refParser.dereference(path, function (err, schema) {
      if (err) return cb(err)
      cb(null, validator(schema, { verbose: true }))
    })
  })
}
