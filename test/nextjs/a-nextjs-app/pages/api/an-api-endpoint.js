// An API endpoint.

// Always executed server-side.
export default function anApiEndpoint(req, res) {
  res.status(200).json({ ping: 'pong' })
}

