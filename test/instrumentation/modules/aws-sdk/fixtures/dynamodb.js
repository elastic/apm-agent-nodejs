'use strict'
module.exports = {
  query: {
    response: {
      Count: 1,
      Items:
                [{ id: { S: '001' }, name: { S: 'Richard Roe' }, number: { N: '1' } }],
      ScannedCount: 1
    },
    httpStatusCode: 200
  },
  listTable: {
    response: { Success: { TableNames: ['fixture-table'] } },
    httpStatusCode: 200
  },
  error: {
    response: { __type: 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException', message: 'Requested resource not found' },
    httpStatusCode: 400
  }
}
