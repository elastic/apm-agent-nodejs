import assert from 'node:assert'
import http from 'node:http'
assert(http.get, 'http.get is defined')
assert(http.request, 'http.request is defined')
