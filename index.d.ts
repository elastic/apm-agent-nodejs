/// <reference types="node" />

import { IncomingMessage, ServerResponse } from 'http';

export declare const agent: Agent;

declare class Agent {
  middleware: { connect: ConnectMiddlewareFn };
  lambda: LambdaFn;
  // logger: Logger // TODO: Is this an official API?
  currentTransaction: Transaction | null;
  currentSpan: Span | null;
  destroy (): void;
  startTransaction (name?: string, type?: string, options?: TransactionOptions): Transaction | null;
  endTransaction: EndTransactionFn;
  setTransactionName (name: string): void;
  startSpan: StartSpanFn;
  isStarted (): boolean;
  start (options: AgentConfigOptions): Agent;
  setUserContext (user: UserObject): void;
  setCustomContext (custom: object): void;
  setTag: SetTagFn; // TODO: Is this how to add a declared function to a class?
  addTags: AddTagsFn;
  addFilter (fn: FilterFn): void;
  addErrorFilter (fn: FilterFn): void;
  addTransactionFilter (fn: FilterFn): void;
  addSpanFilter (fn: FilterFn): void;
  captureError (err: Error | string | ParameterizedMessageObject, options?: CaptureErrorOptions, callback?: CaptureErrorCallback): void;
  handleUncaughtExceptions (fn: UncaughtExceptionFn): void;
  flush (callback: Function): void;
}

interface AgentConfigOptions {
  serviceName?: string;
  secretToken?: string;
  serverUrl?: string;
  verifyServerCert?: boolean;
  serviceVersion?: string;
  active?: boolean;
  logLevel?: LogLevel;
  hostname?: string;
  apiRequestSize?: string | number; // TODO: Do we officially want to support numbers?
  apiRequestTime?: string | number; // TODO: Do we officially want to support numbers?
  frameworkName?: string;
  frameworkVersion?: string;
  stackTraceLimit?: number;
  captureExceptions?: boolean;
  filterHttpHeaders?: boolean;
  captureErrorLogStackTraces?: CaptureErrorLogStackTraces;
  captureSpanStackTraces?: boolean;
  captureBody?: CaptureBody;
  errorOnAbortedRequests?: boolean;
  abortedErrorThreshold?: string | number; // TODO: Do we officially want to support numbers?
  instrument?: boolean;
  asyncHooks?: boolean;
  sourceLinesErrorAppFrames?: number;
  sourceLinesErrorLibraryFrames?: number;
  sourceLinesSpanAppFrames?: number;
  sourceLinesSpanLibraryFrames?: number;
  errorMessageMaxLength?: string | number; // TODO: Do we officially want to support numbers?
  transactionMaxSpans?: number;
  transactionSampleRate?: number;
  serverTimeout?: string | number; // TODO: Do we officially want to support numbers?
  disableInstrumentations?: string | string[]; // TODO: Do we officially want to support strings?
  payloadLogFile?: string; // TODO: Do we want to advertise this?
  containerId?: string;
  kubernetesNodeName?: string;
  kubernetesNamespace?: string;
  kubernetesPodName?: string;
  kubernetesPodUID?: string;
  captureHeaders?: boolean;
  metricsInterval?: string | number; // TODO: Do we officially want to support numbers?
  logger?: Logger;
  ignoreUrls?: Array<string | RegExp>;
  ignoreUserAgents?: Array<string | RegExp>;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type CaptureErrorLogStackTraces = 'never' | 'messages' | 'always';
type CaptureBody = 'off' | 'errors' | 'transactions' | 'all';

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
  fatal(msg: string, ...args: any[]): void;
  fatal(obj: {}, msg?: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  error(obj: {}, msg?: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  warn(obj: {}, msg?: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  info(obj: {}, msg?: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  debug(obj: {}, msg?: string, ...args: any[]): void;
  trace(msg: string, ...args: any[]): void;
  trace(obj: {}, msg?: string, ...args: any[]): void;
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

interface TransactionOptions {
  startTime?: number;
  childOf?: Transaction | Span | string // TODO: This technically accepts other values, but we might not want to document these?
}

declare class Span extends GenericSpan {
  // TODO: The following should not be documented right? constructor(), customStackTrace(), setDbContext()
  transaction: Transaction;
  name: string | null; // TODO: Should we allow null?
  end (endTime?: number): void;
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

type FilterFn = (payload: object) => object | Falsy;

type LambdaFn =
  | ((handler: LambdaHandlerFn) => LambdaHandlerFn)
  | ((type: string, handler: LambdaHandlerFn) => LambdaHandlerFn);
type LambdaHandlerFn = (event: object, context: object, callback: LambdaHandlerCallbackFn) => any;
type LambdaHandlerCallbackFn = (err?: Error | null | undefined, result?: any) => void;

type ConnectMiddlewareFn = (err: Error, req: IncomingMessage, res: ServerResponse, next: ConnectMiddlewareNextFn) => void;
type ConnectMiddlewareNextFn = (err?: Error) => void;

type Falsy = false | 0 | "" | null | undefined // Not possible to define NaN
