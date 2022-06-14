/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
module.exports = {
  sendMessage: {
    request: {
      DelaySeconds: 10,
      MessageAttributes: {
        Title: {
          DataType: 'String',
          StringValue: 'The Whistler'
        },
        Author: {
          DataType: 'String',
          StringValue: 'John Grisham'
        },
        WeeksOn: {
          DataType: 'Number',
          StringValue: '6'
        }
      },
      MessageBody: 'Information about current NY Times fiction bestseller for week of 12/11/2016.'

    },
    response: `<?xml version="1.0"?>
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
  sendMessageBatch: {
    request: {
      // Remove DelaySeconds parameter and value for FIFO queues
      Entries: [{
        Id: 'foo',
        DelaySeconds: 10,
        MessageAttributes: {
          Title: {
            DataType: 'String',
            StringValue: 'The Whistler'
          },
          Author: {
            DataType: 'String',
            StringValue: 'John Grisham'
          },
          WeeksOn: {
            DataType: 'Number',
            StringValue: '6'
          }
        },
        MessageBody: 'Information about current NY Times fiction bestseller for week of 12/11/2016.'
      }]
    },
    response: `<?xml version="1.0"?>
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
  deleteMessage: {
    request: {
      ReceiptHandle: 'AQEBylmNUj4N0S/U4rDCOgiJks1yfJVcInUpvhe5hmLbeHnEd9q5uynTpJvXOBwHSlMrWZhtus7xJzULz/fi90Ni0cImfu+G9dqp6kIqVXYIItf0iOOT0+w6Yu2RHtuRCGOfxo28EKCBZRbREh6EAmXRL7IAoYZgkR/BI4c9dZi6MHXXwyjW93yFbK+CkMTVh/MoW8ADr9D/4rzf5fb7ipKht73Fe1j1gLCxiBuQiNj7owaxVPb/jVY3NEtWYDKXkhCOscdPoLb6CueADxXPn7mC/l5Kp8DTi6GoI39E3Qbq4kIylA7wmPS5wo+rffLqi9gASN+YpmUG/03+poOzgtM2q0ZYIrFNPjNKSriuWE16V6iTl0ng7uG4pmeCj9zKwaAu8SOZQwRHmMq9qhiyDzBqfDP3GQcZXO8i5WRLdG6nmoRkyUzXq6Zo50eWzzsK2hZ5'
    },
    response: `<?xml version="1.0"?>
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
  deleteMessageBatch: {
    request: {
      Entries: [{
        Id: 'foo',
        ReceiptHandle: 'AQEBylmNUj4N0S/U4rDCOgiJks1yfJVcInUpvhe5hmLbeHnEd9q5uynTpJvXOBwHSlMrWZhtus7xJzULz/fi90Ni0cImfu+G9dqp6kIqVXYIItf0iOOT0+w6Yu2RHtuRCGOfxo28EKCBZRbREh6EAmXRL7IAoYZgkR/BI4c9dZi6MHXXwyjW93yFbK+CkMTVh/MoW8ADr9D/4rzf5fb7ipKht73Fe1j1gLCxiBuQiNj7owaxVPb/jVY3NEtWYDKXkhCOscdPoLb6CueADxXPn7mC/l5Kp8DTi6GoI39E3Qbq4kIylA7wmPS5wo+rffLqi9gASN+YpmUG/03+poOzgtM2q0ZYIrFNPjNKSriuWE16V6iTl0ng7uG4pmeCj9zKwaAu8SOZQwRHmMq9qhiyDzBqfDP3GQcZXO8i5WRLdG6nmoRkyUzXq6Zo50eWzzsK2hZ5'
      }]
    },
    response: `<?xml version="1.0"?>
      <DeleteMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <ResponseMetadata>
          <RequestId>2ce5ae8b-9308-5c11-8484-f64644126cd4</RequestId>
        </ResponseMetadata>
      </DeleteMessageResponse>`
  },
  receiveMessage: {
    request: {
      AttributeNames: [
        'SentTimestamp'
      ],
      MaxNumberOfMessages: 1,
      MessageAttributeNames: [
        'All'
      ],
      VisibilityTimeout: 20
    },
    response: `<?xml version="1.0"?>
      <ReceiveMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/">
        <ReceiveMessageResult>
          <Message>
            <MessageId>7e9faa90-1256-4ea8-aed1-f0d55d45f778</MessageId>
            <ReceiptHandle>AQEBXxpSdLbnmP0031G1uHDyfdIvRFcl6kYINW8Av1c5TVg+Awybw8zOVIOniGcPxYDo+XkaTE7Ms0Og906TjZA/KmB+ssF5Ycx0yb2SoMeIsSJOHkk8GfrDpJLr91s/QgY1qrmdojZkB8vADQr3JMGvrpjY2FvVf1h+mMRY8dvzPAI8YNNI3jErWd5s8jJs/8QNiH84mLdWkPWMUCgWVfG85kHUcd4lN6P4Va/rGOcMnCEsLOZKTzdnxbs4N2aT3qCzBjut71RHi7kZCGqVWMrEnWswhWcFdLvrmXyrVtQ3FESDMDy28e3UryLZVcuHui9qefGE8P82bYDaMO7JSAx6+cbsKx6On8uwzyX9ycuIdnTKv8YpvY8NIFYU/sC+bk7ZGpeGCJOUKXkthdr/DAmDTJWF2HGQThLDbWKsMtHarCPSK52MPdUv4kEi6x1OEtTX</ReceiptHandle>
            <MD5OfBody>bbdc5fdb8be7251f5c910905db994bab</MD5OfBody>
            <MD5OfMessageAttributes>d25a6aea97eb8f585bfa92d314504a92</MD5OfMessageAttributes>
            <Body>Information about current NY Times fiction bestseller for week of 12/11/2016.</Body>
            <Attribute>
              <Name>SentTimestamp</Name>
              <Value>1616098068631</Value>
            </Attribute>
            <MessageAttribute>
              <Name>Author</Name>
              <Value>
                <StringValue>John Grisham</StringValue>
                <DataType>String</DataType>
              </Value>
            </MessageAttribute>
            <MessageAttribute>
              <Name>Title</Name>
              <Value>
                <StringValue>The Whistler</StringValue>
                <DataType>String</DataType>
              </Value>
            </MessageAttribute>
            <MessageAttribute>
              <Name>WeeksOn</Name>
              <Value>
                <StringValue>6</StringValue>
                <DataType>Number</DataType>
              </Value>
            </MessageAttribute>
            <MessageAttribute>
              <Name>TrAcEpArEnT</Name>
              <Value>
                <StringValue>00-460d51b6ed3ab96be45f2580b8016509-8ba4419207a1f2f8-01</StringValue>
                <DataType>String</DataType>
              </Value>
            </MessageAttribute>
          </Message>
        </ReceiveMessageResult>
        <ResponseMetadata>
          <RequestId>c1f742a0-56ba-59a4-95d5-1a6e8dc7f577</RequestId>
        </ResponseMetadata>
      </ReceiveMessageResponse>`
  }
}
