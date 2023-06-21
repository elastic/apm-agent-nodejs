const assert = require('assert')
const http = require('http')
assert(http.get, 'http.get is defined')
assert(http.request, 'http.request is defined')
