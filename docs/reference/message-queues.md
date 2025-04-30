---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/message-queues.html
---

# Message queues [message-queues]

The Node.js Agent will automatically create spans for activity to/from your Amazon SQS message queues.  To record these spans, your message queue activity must occur during a transaction. If you’re performing queue operations during an HTTP request from a [supported framework](/reference/supported-technologies.md#compatibility-frameworks), the agent will start a transaction automatically.  However, if you’re performing queue operations in a stand-alone program (such as a message processor), you’ll need to use the Node.js Agent’s [`startTransaction()`](/reference/agent-api.md#apm-start-transaction) method to manually create transactions for your messages.

You can see an example of this in the following code sample.

```js
const apm = require('elastic-apm-node').start({/*...*/})
const AWS = require('aws-sdk');
// Set the region
AWS.config.update({region: 'us-west'});

// Create an SQS service object
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});

/* ... */

const transaction = apm.startTransaction("Process Messages", 'cli') <1>
sqs.receiveMessage(params, function(err, data) {
  if(err) {
    console.log("Receive Error", err);
  } else {
    console.log(`Length: ${data.Messages.length}`)
    /* process messages */
  }
  // end the transaction
  transaction.end() <2>
})
```

1. Prior to calling the `sqs.receiveMessage` method, start a new transaction.
2. Only end the transaction *after* the queue’s processing callback finishes executing. The will ensure a transaction is active while processing your queue messages.



## Distributed tracing and messaging queues [message-queues-distributed-tracing]

To enable queue scheduling and queue processing with distributed tracing, use the Node.js Agent’s API to *store* a `traceparent` header with your queue message; then, provide that `traceparent` header when starting a new transaction.

Here’s a *new* example that uses the Node.js Agent API to store the `traceparent` as a message attribute and then uses that attribute to link your new transaction with the original.

**Storing the Traceparent**

When sending the message, you’ll want to add the trace as one of the `MessageAttributes`.

```js
// stores the traceparent when sending the queue message
const traceParent = apm.currentTransaction ? apm.currentTransaction.traceparent : ''

// Use the Amazon SQS `MessageAttributes` to pass
// on the  traceparent header
const params = {
  /* ... other params ... */
  MessageAttributes: {
    /* ... other attributes ... */
    "MyTraceparent":{
        DataType: "String",
        StringValue: traceParent
    }
  }

}
sqs.sendMessage(params, function(err, data) {
  /* ... */
});
```

This will save the traceparent value so we can use it later on when receiving the messages.

**Applying the Traceparent**

When we receive our queue messages, we’ll check the message for our Traceparent header, and use it to start a new transaction.  By starting a transaction with this traceparent header we’ll be linking the sending and receiving via distributed tracing.

```js
// uses the traceparent to start a transaction

sqs.receiveMessage(params, function(err, data) {
  if(!data.Messages) {
    return
  }

  // loop over your returned messages
  for(const message of data.Messages) { <1>
    // start a transaction to process each message, using our previously
    // saved distributed tracing traceparent header
    let traceparent
    if(message.MessageAttributes.MyTraceparent) {
        traceparent = message.MessageAttributes.MyTraceparent.StringValue
    }
    const transactionMessage = apm.startTransaction('RECEIVE_TRANSACTION', 'cli', {
      childOf:traceparent <2>
    })
    /* ... process message ... */
    transactionMessage.end() <3>
  }
})
```

1. Even though we only scheduled one queue message, Amazon’s SQS API returns an array of  *multiple* messages.  Therefore we’ll need to loop over each one.
2. We extract the traceparent header we’d previously save, and use it to start a transaction.
3. Once we’re done processing a single message, we end the transaction and move on to the next.
