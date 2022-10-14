/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// An API endpoint.

// Always executed server-side.
export default function anApiEndpoint (req, res) {
  res.status(200).json({ ping: 'pong' })
}
