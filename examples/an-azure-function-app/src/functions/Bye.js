const { app } = require('@azure/functions');

app.http('Bye', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_request, _context) => {
    const body = JSON.stringify({ good: 'bye' })
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    };
  },
});
