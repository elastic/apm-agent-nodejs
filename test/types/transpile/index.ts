// Test that `import apm from ...` works for TypeScript using `esModuleInterop`.

import agent from '../../../'

agent.start({
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false,
  cloudProvider: 'none'
})
