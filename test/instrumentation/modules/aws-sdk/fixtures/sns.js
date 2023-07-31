/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
module.exports = {
  publish: {
    response: `<?xml version="1.0"?>
      <PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
      <PublishResult>
        <MessageId>32a3b682-ce0c-5b2a-b97f-efe5112e9f06</MessageId>
      </PublishResult>
      <ResponseMetadata>
        <RequestId>8e87dc3a-07f7-54f0-ae0d-855dd8d5f0dc</RequestId>
      </ResponseMetadata>
    </PublishResponse>`,
    httpStatusCode: 200,
  },
  publishNoTopic: {
    response: `<?xml version="1.0"?>
    <ErrorResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
    <Error>
      <Type>Sender</Type>
      <Code>NotFound</Code>
      <Message>Topic does not exist</Message>
    </Error>
    <RequestId>02672fe4-577a-5c2a-9a11-7683bd8777e1</RequestId>
  </ErrorResponse>`,
    httpStatusCode: 404,
  },
  listTopics: {
    response: `<?xml version="1.0"?>
    <ListTopicsResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/">
    <ListTopicsResult>
      <Topics>
        <member>
          <TopicArn>arn:aws:sns:us-west-2:111111111111:topic-name</TopicArn>
        </member>
        <member>
          <TopicArn>arn:aws:sns:us-west-2:111111111111:dynamodb</TopicArn>
        </member>
      </Topics>
    </ListTopicsResult>
    <ResponseMetadata>
      <RequestId>1cb1f1f2-48fa-523b-a01a-a895b59d244b</RequestId>
    </ResponseMetadata>
  </ListTopicsResponse>`,
    httpStatusCode: 200,
  },
};
