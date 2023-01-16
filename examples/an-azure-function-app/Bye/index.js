module.exports = async function (context, _req) {
  const body = JSON.stringify({ good: 'bye' })
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    body
  }
}
