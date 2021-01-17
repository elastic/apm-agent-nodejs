const tape = require('tape')
const { CallbackCoordination } = require('../../lib/cloud-metadata/callback-coordination')
tape.test('fetch coordination: all successful', function(t) {
  const fetcher = new CallbackCoordination;
  fetcher.schedule(function(fetcher) {
    // to do -- can this just be a callback?
    setTimeout(function(){
      fetcher.recordResult(null, 'pass1')
    }, 10)
  })

  fetcher.schedule(function(fetcher) {
    // to do -- can this just be a callback?
    setTimeout(function(){
      fetcher.recordResult(null, 'pass2')
    }, 20)
  })

  fetcher.schedule(function(fetcher) {
    // to do -- can this just be a callback?
    setTimeout(function(){
      fetcher.recordResult(null, 'pass3')
    }, 30)
  })

  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 200)
  })

  fetcher.on('result', function(result){
    t.equals('pass1', result, 'first callback\'s value is the result')
    t.end()
  })

  fetcher.on('error', function(error) {
    t.fail('no errors expected')
  })
  fetcher.start()
})

tape.test('fetch coordination: all errors', function(t) {
  const fetcher = new CallbackCoordination;
  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 10)
  })

  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 20)
  })

  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 30)
  })

  fetcher.on('result', function(result){
    t.fail('no results')
  })

  fetcher.on('error', function(error) {
    t.ok(error)
    t.equals(error.allErrors.length, 3, 'all three errors captured')
    t.end()
  })
  fetcher.start()
})

tape.test('fetch coordination: fails to invoke callback (timeout)', function(t) {
  const fetcher = new CallbackCoordination(100);
  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 10)
  })

  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      fetcher.recordResult(new Error('an error'))
    }, 20)
  })

  fetcher.schedule(function(fetcher) {
    setTimeout(function(){
      // forgot to call the final recordResult
    }, 30)
  })

  fetcher.on('result', function(result){
  })

  fetcher.on('error', function(error) {
    t.ok(error)
    t.equals(error.allErrors.length, 2, 'two of three errors captured')
    t.equals(error.message, 'callback coordination reached timeout')
    t.end()
  })
  fetcher.start()
})
