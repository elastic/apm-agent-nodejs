/// <reference types="node" />

import { IncomingMessage, ServerResponse } from 'http';

export default agent;

declare const agent: Agent;

declare class Agent {
  middleware: { connect(): ConnectMiddlewareFn };
  lambda: LambdaFn;
  // logger: Logger // TODO: Is this an official API?

  currentSpan: Span | null;
  currentTransaction: Transaction | null;

  start (options: AgentConfigOptions): Agent;
  isStarted (): boolean;

  addFilter (fn: FilterFn): void;
  addErrorFilter (fn: FilterFn): void;
  addSpanFilter (fn: FilterFn): void;
  addTransactionFilter (fn: FilterFn): void;
  handleUncaughtExceptions (fn: UncaughtExceptionFn): void;

  captureError (err: Error | string | ParameterizedMessageObject, options?: CaptureErrorOptions, callback?: CaptureErrorCallback): void;

  startTransaction (name?: string, type?: string, options?: TransactionOptions): Transaction | null;
  setTransactionName (name: string): void;
  endTransaction: EndTransactionFn;
  
  startSpan: StartSpanFn;

  setTag: SetTagFn; // TODO: Is this how to add a declared function to a class?
  addTags: AddTagsFn;
  setUserContext (user: UserObject): void;
  setCustomContext (custom: object): void;

  flush (callback: Function): void;
  destroy (): void;
}

declare class GenericSpan {
  // TODO: The following should not be documented right? constructor(), timestamp, ended, id, traceId, parentId, sampled, duration(), 
  type: string | null; // TODO: Should we allow null?

  setTag: SetTagFn;
  addTags: AddTagsFn;
}

declare class Transaction extends GenericSpan {
  // TODO: The following should not be documented right? constructor(), setUserContext(), setCustomContext(), toJSON(), setDefaultName(), setDefaultNameFromRequest()
  name: string | null; // TODO: Should we allow null?
  result: string; // TODO: Should we also document number?

  startSpan: StartSpanFn;
  ensureParentId (): string;
  end: EndTransactionFn;
}

declare class Span extends GenericSpan {
  // TODO: The following should not be documented right? constructor(), customStackTrace(), setDbContext()
  transaction: Transaction;
  name: string | null; // TODO: Should we allow null?

  end (endTime?: number): void;
}

interface AgentConfigOptions {
  abortedErrorThreshold?: string | number; // TODO: Do we officially want to support numbers?
  active?: boolean;
  apiRequestSize?: string | number; // TODO: Do we officially want to support numbers?
  apiRequestTime?: string | number; // TODO: Do we officially want to support numbers?
  asyncHooks?: boolean;
  captureBody?: CaptureBody;
  captureErrorLogStackTraces?: CaptureErrorLogStackTraces;
  captureExceptions?: boolean;
  captureHeaders?: boolean;
  captureSpanStackTraces?: boolean;
  containerId?: string;
  disableInstrumentations?: string | string[]; // TODO: Do we officially want to support strings?
  errorMessageMaxLength?: string | number; // TODO: Do we officially want to support numbers?
  errorOnAbortedRequests?: boolean;
  filterHttpHeaders?: boolean;
  frameworkName?: string;
  frameworkVersion?: string;
  hostname?: string;
  ignoreUrls?: Array<string | RegExp>;
  ignoreUserAgents?: Array<string | RegExp>;
  instrument?: boolean;
  kubernetesNamespace?: string;
  kubernetesNodeName?: string;
  kubernetesPodName?: string;
  kubernetesPodUID?: string;
  logLevel?: LogLevel;
  logger?: Logger;
  metricsInterval?: string | number; // TODO: Do we officially want to support numbers?
  payloadLogFile?: string; // TODO: Do we want to advertise this?
  secretToken?: string;
  serverTimeout?: string | number; // TODO: Do we officially want to support numbers?
  serverUrl?: string;
  serviceName?: string;
  serviceVersion?: string;
  sourceLinesErrorAppFrames?: number;
  sourceLinesErrorLibraryFrames?: number;
  sourceLinesSpanAppFrames?: number;
  sourceLinesSpanLibraryFrames?: number;
  stackTraceLimit?: number;
  transactionMaxSpans?: number;
  transactionSampleRate?: number;
  verifyServerCert?: boolean;
}

interface CaptureErrorOptions {
  request?: IncomingMessage; // TODO: Currently not documented - should we expose this?
  response?: ServerResponse; // TODO: Currently not documented - should we expose this?
  timestamp?: number;
  handled?: boolean; // TODO: Currently not documented - should we expose this?
  user?: UserObject;  
  tags?: Tags; // TODO: currently not documented
  custom?: object;
  message?: string;
}

interface Tags {
  [key: string]: any; // TODO: Can't we specify it a bit more than any?
}

interface UserObject {
  id?: any; // TODO: Only string?
  username?: string;
  email?: string;
}

interface ParameterizedMessageObject {
  message: string;
  params: Array<any>; // TODO: Can we narrow it down a bit more any
}

interface Logger {
  fatal (msg: string, ...args: any[]): void;
  fatal (obj: {}, msg?: string, ...args: any[]): void;
  error (msg: string, ...args: any[]): void;
  error (obj: {}, msg?: string, ...args: any[]): void;
  warn (msg: string, ...args: any[]): void;
  warn (obj: {}, msg?: string, ...args: any[]): void;
  info (msg: string, ...args: any[]): void;
  info (obj: {}, msg?: string, ...args: any[]): void;
  debug (msg: string, ...args: any[]): void;
  debug (obj: {}, msg?: string, ...args: any[]): void;
  trace (msg: string, ...args: any[]): void;
  trace (obj: {}, msg?: string, ...args: any[]): void;
}

interface TransactionOptions {
  startTime?: number;
  childOf?: Transaction | Span | string // TODO: This technically accepts other values, but we might not want to document these?
}

interface SpanOptions {
  childOf?: Transaction | Span | string // TODO: This technically accepts other values, but we might not want to document these?
}

type SetTagFn = (name: string, value: any) => boolean;
type AddTagsFn = (tags: Tags) => boolean;
type StartSpanFn = (name?: string, type?: string, options?: SpanOptions) => Span | null;
type EndTransactionFn = (result?: string | null, endTime?: number) => void; // TODO: Should we allow number as well for result?

type UncaughtExceptionFn = (err: Error) => void;

type CaptureErrorCallback = (err: Error | null, id: string) => void;

type FilterFn = (payload: object) => object | Falsy | void;

type LambdaFn =
  | ((handler: LambdaHandlerFn) => LambdaHandlerFn)
  | ((type: string, handler: LambdaHandlerFn) => LambdaHandlerFn);
type LambdaHandlerFn = (event: object, context: object, callback: LambdaHandlerCallbackFn) => any;
type LambdaHandlerCallbackFn = (err?: Error | null | undefined, result?: any) => void;

type ConnectMiddlewareFn = (err: Error, req: IncomingMessage, res: ServerResponse, next: ConnectMiddlewareNextFn) => void;
type ConnectMiddlewareNextFn = (err?: Error) => void;

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type CaptureErrorLogStackTraces = 'never' | 'messages' | 'always';
type CaptureBody = 'off' | 'errors' | 'transactions' | 'all';

type Falsy = false | 0 | "" | null | undefined // Not possible to define NaN
