/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Test that `import apm from ...` works for TypeScript using `esModuleInterop`.

import agent from '../../../'

agent.start({
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false,
  cloudProvider: 'none'
})
