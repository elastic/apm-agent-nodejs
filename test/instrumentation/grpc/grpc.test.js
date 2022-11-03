/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */
const agent = require('../../..').start({
  serviceName: 'test-grpc-js',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  spanCompressionEnabled: false
})
const mockClient = require('../../_mock_http_client')
const tape = require('tape')
const grpc = require('@grpc/grpc-js')
const { loadProto, grpcPort } = require('./load-proto.js')
const MAX_ERROR_STATUS = grpc.status.UNAUTHENTICATED
const HOST = '127.0.0.1'

function getError (msg, code) {
  const err = Object.assign(Object.assign({}, new Error(msg)), { name: msg, message: msg, code, details: msg })
  return err
}
const replicate = (request) => {
  const result = []
  for (let i = 0; i < request.num; i++) {
    result.push(request)
  }
  return result
}

function createServer() {
  const proto = loadProto()
  const server = new grpc.Server()
  server.addService(proto.GrpcTester.service, {
    // An error is emitted every time
    // request.num <= MAX_ERROR_STATUS = (status.UNAUTHENTICATED)
    // in those cases, erro.code = request.num
    // This method returns the request
    unaryMethod (call, callback) {
      // console.log(MAX_ERROR_STATUS)
      call.request.num <= MAX_ERROR_STATUS
        ? callback(getError('Unary Method Error', call.request.num))
        : callback(null, { num: call.request.num })
    },
    // This method returns the request
    camelCaseMethod (call, callback) {
      call.request.num <= MAX_ERROR_STATUS
        ? callback(getError('Unary Method Error', call.request.num))
        : callback(null, { num: call.request.num })
    },
    // This method sums the requests
    clientStreamMethod (call, callback) {
      let sum = 0
      let hasError = false
      let code = grpc.status.OK
      call.on('data', (data) => {
        sum += data.num
        if (data.num <= MAX_ERROR_STATUS) {
          hasError = true
          code = data.num
        }
      })
      call.on('end', () => {
        hasError
          ? callback(getError('Client Stream Method Error', code))
          : callback(null, { num: sum })
      })
    },
    // This method returns an array that replicates the request, request.num of
    // times
    serverStreamMethod: (call) => {
      const result = replicate(call.request)
      if (call.request.num <= MAX_ERROR_STATUS) {
        call.emit('error', getError('Server Stream Method Error', call.request.num))
      } else {
        result.forEach(element => {
          call.write(element)
        })
      }
      call.end()
    },
    // This method returns the request
    bidiStreamMethod: (call) => {
      call.on('data', (data) => {
        if (data.num <= MAX_ERROR_STATUS) {
          call.emit('error', getError('Server Stream Method Error', data.num))
        } else {
          call.write(data)
        }
      })
      call.on('end', () => {
        call.end()
      })
    }
  })
  return server
}

function bindServer(server, cb) {
  server.bindAsync(
    `${HOST}:${grpcPort}`,
    grpc.ServerCredentials.createInsecure(),
    cb
  )
}

const runTest = function(t, workCb) {
  const server = createServer()
  bindServer(server, function(){
    server.start()
    console.log(`Test service started on port ${arguments[1]}`)
    const proto = loadProto()
    const client = new proto.GrpcTester(`${HOST}:${grpcPort}`, grpc.credentials.createInsecure());
    workCb(client, server)
  })
}

tape.test(function (t) {
    resetAgent(function(data){
      t.equals(data.transactions.length, 1)
      t.pass()
      t.end()
    })
    runTest(t, function(client, server) {
      client.UnaryMethod({num:100},function(err, response) {
        t.equals(response.num, 100, 'call worked as expected')
        server.tryShutdown(function(){
          agent.flush()
        })
      })
    })
})

function resetAgent (cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(cb)
}
