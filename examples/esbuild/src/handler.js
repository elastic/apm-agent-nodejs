// Implement the HTTP request handler in a separate file to make the
// case for bundling slightly more interesting.

const apm = require('elastic-apm-node');
const pug = require('pug');

const resTemplate = pug.compile('p The time is #{time}.');

function handleRequest (req, res) {
  console.log('SERVER: apm.currentTransaction: %s', apm.currentTransaction)
  req.resume();
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html');
  res.end(resTemplate({time: new Date().toISOString()}));
}

module.exports = {
  handleRequest
};

