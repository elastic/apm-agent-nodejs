/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A dynamic API endpoint.

// Always executed server-side.
export default function aDynamicApiEndpoint (req, res) {
  const { num } = req.query
  const n = Number(num)
  if (isNaN(n)) {
    res.status(400).json({
      num,
      error: 'num is not a Number'
    })
  } else {
    res.status(200).json({
      num,
      n,
      double: n * 2,
      floor: Math.floor(n)
    })
  }
}
