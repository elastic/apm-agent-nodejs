apm-agent-nodejs
Copyright 2011-2022 Elasticsearch B.V.

# Notice

This project contains several dependencies which have been vendored in
due to a need for minor changes. Where possible changes have been
contributed back to the original project.

## async-listener

- **path:** [lib/instrumentation/patch-async.js](lib/instrumentation/patch-async.js)
- **author:** Forrest L Norvell
- **project url:** https://github.com/othiym23/async-listener
- **original file:** https://github.com/othiym23/async-listener/blob/master/index.js
- **license:** BSD-2-Clause, http://opensource.org/licenses/BSD-2-Clause

Copyright (c) 2013-2017, Forrest L Norvell
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## shimmer

- **path:** [lib/instrumentation/shimmer.js](lib/instrumentation/shimmer.js)
- **author:** Forrest L Norvell
- **project url:** https://github.com/othiym23/shimmer
- **original file:** https://github.com/othiym23/shimmer/blob/master/index.js
- **license:** BSD-2-Clause, http://opensource.org/licenses/BSD-2-Clause

Copyright (c) 2013-2019, Forrest L Norvell
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## process-top

- **path:** [lib/metrics/platforms/generic/process-top.js](lib/metrics/platforms/generic/process-top.js)
- **author:** Mathias Buus
- **project url:** https://github.com/mafintosh/process-top
- **original file:** https://github.com/mafintosh/process-top/blob/master/index.js
- **license:** MIT License (MIT), http://opensource.org/licenses/MIT

Copyright (c) 2018 Mathias Buus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## opentelemetry-js

- **path:** [lib/instrumentation/run-context/](lib/instrumentation/run-context/)
- **author:** OpenTelemetry Authors
- **project url:** https://github.com/open-telemetry/opentelemetry-js
- **original file:** https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-context-async-hooks/src
- **license:** Apache License 2.0, https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/LICENSE

Parts of "lib/instrumentation/run-context" have been adapted from or influenced
by TypeScript code in `@opentelemetry/context-async-hooks`.

- **path:** [lib/opentelemetry-bridge/otelutils.js](lib/opentelemetry-bridge/otelutils.js)
- **author:** OpenTelemetry Authors
- **project url:** https://github.com/open-telemetry/opentelemetry-js
- **original file:** https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core/src/common/time.ts
- **license:** Apache License 2.0, https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/LICENSE

"lib/opentelemetry-bridge/opentelemetry-core-mini/" includes files adapted from
code in `@opentelemetry/core`.

- **path:** [lib/opentelemetry-bridge/opentelemetry-core-mini/](lib/opentelemetry-bridge/opentelemetry-core-mini/)
- **author:** OpenTelemetry Authors
- **project url:** https://github.com/open-telemetry/opentelemetry-js
- **original file:** https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core/src/
- **license:** Apache License 2.0, https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/LICENSE


## load-source-map

- **path:** [lib/load-source-map.js](lib/load-source-map.js)
- **author:** Espen Hovlandsdal
- **project url:** https://github.com/rexxars/load-source-map
- **original file:** https://github.com/rexxars/load-source-map/blob/v2.0.0/lib/index.js
- **license:** MIT License (MIT), http://opensource.org/licenses/MIT

The MIT License (MIT)

Copyright (c) 2017 Espen Hovlandsdal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## esbuild

A small part of esbuild's runtime JS code is used in this project's
"lib/propwrap.js" module.

- **path:** [lib/propwrap.js](lib/propwrap.js)
- **author:** Evan Wallace
- **project url:** https://github.com/evanw/esbuild
- **original file:** https://github.com/evanw/esbuild/blob/v0.14.42/internal/runtime/runtime.go
- **license:** MIT License (MIT), http://opensource.org/licenses/MIT

MIT License

Copyright (c) 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
