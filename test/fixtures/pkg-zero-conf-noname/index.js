const apm = require('../../..').start({
  disableSend: true
})
console.log(JSON.stringify(apm._conf))
