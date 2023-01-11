const http = require('http')
const https = require('https')

module.exports = async function (context, req) {
  return new Promise((resolve, reject) => {
    // Call the 'Bye' Function in this same Function App...
    const url = new URL(req.url)
    url.pathname = '/api/Bye'
    const proto = (url.protocol === 'https:' ? https : http)
    proto.get(url, res => {
      res.resume()
      res.on('error', reject)
      res.on('end', () => {

        // ... then respond.
        const body = JSON.stringify({hi: 'there'});
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            body
        };
        resolve()
      })
    })
  })
}
