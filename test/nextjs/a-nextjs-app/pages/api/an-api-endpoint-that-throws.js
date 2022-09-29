// An API endpoint whose handler throws, to test error handling.

// Always executed server-side.
export default function anApiEndpointThatThrows(req, res) {
  throw new Error('An error thrown in anApiEndpointThatThrows handler')
}

