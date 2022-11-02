/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
}

module.exports = {
  loadProto: function () {
    const packageDefinition = protoLoader.loadSync(
      [__dirname, './grpc-test.proto'].join('/'), options
    )
    return grpc.loadPackageDefinition(packageDefinition).pkg_test
  },
  grpcPort: '7777'
}
