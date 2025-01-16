/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { app } = require('@azure/functions');

app.http('HttpExample', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (_request, _context) => {
    return {
      body: 'HttpExample body',
      headers: {
        MyHeaderName: 'MyHeaderValue',
      },
    };
  },
});
