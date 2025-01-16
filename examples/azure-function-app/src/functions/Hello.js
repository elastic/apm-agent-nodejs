const { app } = require('@azure/functions');

app.http('Hello', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_request, _context) => {
    const url = new URL('http://worldtimeapi.org/api/timezone/America/Vancouver');
    const timeRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const timeBody = await timeRes.json();

    const body = JSON.stringify({
      hello: 'world',
      'current time in Vancouver': timeBody.datetime
    });
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
