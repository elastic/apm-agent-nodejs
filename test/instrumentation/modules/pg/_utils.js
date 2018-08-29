'use strict'

var Client = require('pg').Client

exports.reset = reset
exports.loadData = loadData

function reset (cb) {
  var client = new Client({ database: 'postgres' })

  client.connect(function (err) {
    if (err) throw err
    client.query('DROP DATABASE IF EXISTS test_elastic_apm', function (err) {
      if (err) throw err
      client.query('CREATE DATABASE test_elastic_apm', function (err) {
        if (err) throw err
        client.once('end', cb)
        client.end()
      })
    })
  })
}

function loadData (cb) {
  var client = new Client({ database: 'test_elastic_apm' })

  client.connect(function (err) {
    if (err) throw err
    client.query('CREATE TABLE test (id serial NOT NULL, c1 varchar, c2 varchar)', function (err) {
      if (err) throw err

      var sql = 'INSERT INTO test (c1, c2) ' +
        'VALUES (\'foo1\', \'bar1\'), ' +
               '(\'foo2\', \'bar2\'), ' +
               '(\'foo3\', \'bar3\'), ' +
               '(\'foo4\', \'bar4\'), ' +
               '(\'foo5\', \'bar5\')'

      client.query(sql, function (err) {
        if (err) throw err
        client.once('end', cb)
        client.end()
      })
    })
  })
}
