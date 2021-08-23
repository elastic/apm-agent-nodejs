// Test that `import * as apm from ...` works for TypeScript default of
// no `esModuleInterop`.
import * as apm from '../../../'
apm.start({
  captureExceptions: false,
  metricsInterval: '0',
  centralConfig: false,
  cloudProvider: 'none'
})
