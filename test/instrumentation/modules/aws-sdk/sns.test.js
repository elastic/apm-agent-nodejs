const tape = require('tape')
const {
  snsInstrumentation, getSpanNameFromRequest, getDestinationNameFromRequest,
  getMessageDestinationContextFromRequest
} = require('../../../../lib/instrumentation/modules/aws-sdk/sns')

tape.test('AWS SNS: Unit Test Functions', function (test) {
  test.test('getDestinationNameFromRequest tests', function(t){
    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:627286350134:topic-name'
      }
    }), 'topic-name')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:627286350134:topic-name'
      }
    }), 'topic-name')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint/withslashes'
      }
    }), 'accesspoint/withslashes')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint/withslashes'
      }
    }), 'accesspoint/withslashes')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint:withcolons'
      }
    }), 'accesspoint:withcolons')

    t.equals(getDestinationNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'work test',
        Subject: 'Admin',
        PhoneNumber:'15037299028'
      }
    }), '<PHONE_NUMBER>')

    t.equals(getDestinationNameFromRequest(null), undefined)
    t.equals(getDestinationNameFromRequest({}), undefined)
    t.equals(getDestinationNameFromRequest({params:{}}), undefined)
    t.end()
  })

  test.test('getDestinationNameFromRequest tests', function(t){
    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'work test',
        Subject: 'Admin',
        PhoneNumber:'15555555555'
      }
    }), 'SNS PUBLISH <PHONE_NUMBER>')

    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TargetArn: 'arn:aws:sns:us-west-2:627286350134:accesspoint:withcolons'
      }
    }), 'SNS PUBLISH accesspoint:withcolons')

    t.equals(getSpanNameFromRequest({
      operation: 'publish',
      params: {
        Message: 'this is my test, there are many lot like it but this one is mine',
        TopicArn: 'arn:aws:sns:us-west-2:627286350134:foo:topic-name'
      }
    }), 'SNS PUBLISH topic-name')

    t.equals(getSpanNameFromRequest(null), 'SNS PUBLISH undefined')
    t.equals(getSpanNameFromRequest({}), 'SNS PUBLISH undefined')
    t.equals(getSpanNameFromRequest({params:{}}), 'SNS PUBLISH undefined')
    t.end()
  })

  test.test('getMessageDestinationContextFromRequest tests', function(t){
    t.deepEquals(
      getMessageDestinationContextFromRequest({
        operation: 'publish',
        params: {
          Message: 'this is my test, there are many lot like it but this one is mine',
          TopicArn: 'arn:aws:sns:us-west-2:627286350134:foo:topic-name'
        },
        service:{
          config: {
            region: 'us-west-2'
          }
        }
      }),
      {
        resource:'sns/topic-name',
        type:'messaging',
        name:'sns',
        cloud:{region:'us-west-2'}
      }
    )

    t.deepEquals(
      getMessageDestinationContextFromRequest(null),
      {
        resource:'sns/undefined',
        type:'messaging',
        name:'sns',
        cloud:{region:null}
      }
    )

    t.deepEquals(
      getMessageDestinationContextFromRequest({}),
      {
        resource:'sns/undefined',
        type:'messaging',
        name:'sns',
        cloud:{region:undefined}
      }
    )
    t.end()
  })

  test.end()
})
