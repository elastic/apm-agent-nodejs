module.exports = {
  'sendMessage':{
    'request': {
      DelaySeconds: 10,
      MessageAttributes: {
        "Title": {
          DataType: "String",
          StringValue: "The Whistler"
        },
        "Author": {
          DataType: "String",
          StringValue: "John Grisham"
        },
        "WeeksOn": {
          DataType: "Number",
          StringValue: "6"
        }
      },
      MessageBody: "Information about current NY Times fiction bestseller for week of 12/11/2016.",

    },
    'response':`<?xml version="1.0"?>
      <SendMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <SendMessageResult>
          <MessageId>4b8a5a94-e3a3-43b7-9a98-16179f3b894f</MessageId>
          <MD5OfMessageBody>bbdc5fdb8be7251f5c910905db994bab</MD5OfMessageBody>
          <MD5OfMessageAttributes>d25a6aea97eb8f585bfa92d314504a92</MD5OfMessageAttributes>
        </SendMessageResult>
        <ResponseMetadata>
          <RequestId>d1ec32a3-1f87-5264-ad1b-6a6eaa0d3385</RequestId>
        </ResponseMetadata>
      </SendMessageResponse>`
  },
  'sendMessageBatch': {
    'request':{
      // Remove DelaySeconds parameter and value for FIFO queues
      Entries:[{
        Id: 'foo',
        DelaySeconds: 10,
        MessageAttributes: {
          "Title": {
            DataType: "String",
            StringValue: "The Whistler"
          },
          "Author": {
            DataType: "String",
            StringValue: "John Grisham"
          },
          "WeeksOn": {
            DataType: "Number",
            StringValue: "6"
          }
        },
        MessageBody: "Information about current NY Times fiction bestseller for week of 12/11/2016.",
      }],
    },
    'respnse':`<?xml version="1.0"?>
      <SendMessageBatchResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <SendMessageBatchResult>
          <SendMessageBatchResultEntry>
            <Id>foo</Id>
            <MessageId>44e78a10-85f7-49d7-88af-a6b8e760a89f</MessageId>
            <MD5OfMessageBody>bbdc5fdb8be7251f5c910905db994bab</MD5OfMessageBody>
            <MD5OfMessageAttributes>d25a6aea97eb8f585bfa92d314504a92</MD5OfMessageAttributes>
          </SendMessageBatchResultEntry>
        </SendMessageBatchResult>
        <ResponseMetadata>
          <RequestId>10c1406c-b56a-544e-92e2-18a17b0b0988</RequestId>
        </ResponseMetadata>
      </SendMessageBatchResponse>`
  },
  'deleteMessage': {
    'request':{
      ReceiptHandle:`AQEBylmNUj4N0S/U4rDCOgiJks1yfJVcInUpvhe5hmLbeHnEd9q5uynTpJvXOBwHSlMrWZhtus7xJzULz/fi90Ni0cImfu+G9dqp6kIqVXYIItf0iOOT0+w6Yu2RHtuRCGOfxo28EKCBZRbREh6EAmXRL7IAoYZgkR/BI4c9dZi6MHXXwyjW93yFbK+CkMTVh/MoW8ADr9D/4rzf5fb7ipKht73Fe1j1gLCxiBuQiNj7owaxVPb/jVY3NEtWYDKXkhCOscdPoLb6CueADxXPn7mC/l5Kp8DTi6GoI39E3Qbq4kIylA7wmPS5wo+rffLqi9gASN+YpmUG/03+poOzgtM2q0ZYIrFNPjNKSriuWE16V6iTl0ng7uG4pmeCj9zKwaAu8SOZQwRHmMq9qhiyDzBqfDP3GQcZXO8i5WRLdG6nmoRkyUzXq6Zo50eWzzsK2hZ5`
    },
    'resonse':`<?xml version="1.0"?>
    <DeleteMessageBatchResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
      <DeleteMessageBatchResult>
        <DeleteMessageBatchResultEntry>
          <Id>foo</Id>
        </DeleteMessageBatchResultEntry>
      </DeleteMessageBatchResult>
      <ResponseMetadata>
        <RequestId>7c240380-2a3d-53c6-b785-5b4e6d63acf8</RequestId>
      </ResponseMetadata>
    </DeleteMessageBatchResponse>`
  },
  'deleteMessageBatch': {
    'request':{
      Entries:[{
        Id: 'foo',
        ReceiptHandle:`AQEBylmNUj4N0S/U4rDCOgiJks1yfJVcInUpvhe5hmLbeHnEd9q5uynTpJvXOBwHSlMrWZhtus7xJzULz/fi90Ni0cImfu+G9dqp6kIqVXYIItf0iOOT0+w6Yu2RHtuRCGOfxo28EKCBZRbREh6EAmXRL7IAoYZgkR/BI4c9dZi6MHXXwyjW93yFbK+CkMTVh/MoW8ADr9D/4rzf5fb7ipKht73Fe1j1gLCxiBuQiNj7owaxVPb/jVY3NEtWYDKXkhCOscdPoLb6CueADxXPn7mC/l5Kp8DTi6GoI39E3Qbq4kIylA7wmPS5wo+rffLqi9gASN+YpmUG/03+poOzgtM2q0ZYIrFNPjNKSriuWE16V6iTl0ng7uG4pmeCj9zKwaAu8SOZQwRHmMq9qhiyDzBqfDP3GQcZXO8i5WRLdG6nmoRkyUzXq6Zo50eWzzsK2hZ5`
      }]
    },
    'resonse':`<?xml version="1.0"?>
      <DeleteMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <ResponseMetadata>
          <RequestId>2ce5ae8b-9308-5c11-8484-f64644126cd4</RequestId>
        </ResponseMetadata>
      </DeleteMessageResponse>`
  }
}
