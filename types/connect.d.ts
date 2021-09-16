/// <reference types="node" />

// Inlined from @types/connect
//
// These types are inlined, rather than being used from `@types/connect`
// directly, as a trade-off. It avoids needing an additional entry in
// "dependencies" just for types. It avoids TypeScript users of
// elastic-apm-node needing to manually `npm install @types/connect`.
//
// https://github.com/elastic/apm-agent-nodejs/issues/2331#issuecomment-921251030

import type { IncomingMessage, ServerResponse } from 'http';

export declare namespace Connect {
  type NextFunction = (err?: any) => void;
  type ErrorHandleFunction = (err: any, req: IncomingMessage, res: ServerResponse, next: NextFunction) => void;
}
