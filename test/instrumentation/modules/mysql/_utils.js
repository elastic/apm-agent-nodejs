'use strict'

var mysql = require('mysql')

exports.reset = reset

function reset (cb) {
  var client = mysql.createConnection({user: 'root', database: 'mysql', host: process.env.MYSQL_HOST})

  client.connect(function (err) {
    if (err) throw err
    client.query('DROP DATABASE IF EXISTS test_elastic_apm', function (err) {
      if (err) throw err
      client.query('CREATE DATABASE test_elastic_apm', function (err) {
        if (err) throw err
        client.end(cb)
      })
    })
  })
}
