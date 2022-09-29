/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An API endpoint whose handler throws, to test error handling.

// Always executed server-side.
export default function anApiEndpointThatThrows (req, res) {
  throw new Error('An error thrown in anApiEndpointThatThrows handler')
}
