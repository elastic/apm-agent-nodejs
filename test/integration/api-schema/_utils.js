'use strict'

const exec = require('child_process').exec
const fs = require('fs')
const tmpdir = require('os').tmpdir
const join = require('path').join

const Ajv = require('ajv')
const rimraf = require('rimraf')
const thunky = require('thunky')

const ajv = new Ajv({ allErrors: true })

const schemaDir = thunky(function (cb) {
  const dir = join(tmpdir(), 'apm-schema-v2-cache')
  fs.stat(dir, function (err) {
    if (!err) return cb(null, dir)

    const script = join(__dirname, 'download-json-schemas.sh')
    const cmd = `"${script}" "${dir}"`
    console.log('downloading apm-server schemas from GitHub to "%s"...', dir)
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
  loadSchema('transaction.json', cb)
})

exports.spanValidator = thunky(function (cb) {
  loadSchema('span.json', cb)
})

exports.errorValidator = thunky(function (cb) {
  loadSchema('error.json', cb)
})

function loadSchema (relativePath, cb) {
  schemaDir(function (err, dir) {
    if (err) {
      return cb(err)
    }

    const path = join(dir, relativePath)
    console.log('processing "%s"...', path)
    fs.readFile(path, { encoding: 'utf8' }, function (readErr, content) {
      if (readErr) {
        cb(readErr)
        return
      }

      let schema
      try {
        schema = JSON.parse(content)
      } catch (parseErr) {
        cb(parseErr)
        return
      }

      const validator = ajv.compile(schema)
      cb(null, validator)
    })
  })
}
