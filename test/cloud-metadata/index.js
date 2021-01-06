const tape = require('tape')

const {getMetadataAws} = require('../../lib/instrumentation/cloud-metadata')

tape('cloud metadata', function(t) {
    t.plan(1)
    const host = 'localhost'
    const validPort = 3000
    const invalidPort = 30001
    const protocol = 'http'

    getMetadataAws(host, validPort, 1000, protocol, function(err, data){
      t.error(err,'no errors expected')
      t.ok(data,'returned data')
    })

    getMetadataAws(host, validPort, 0, protocol, function(err){
      // console.log(err)
      t.ok(err, 'expected timeout error')
    })

    getMetadataAws(host, invalidPort, 1000, protocol, function(err){
      console.log(err)
      t.ok(err, 'expected unreachable server error')
    })
})
