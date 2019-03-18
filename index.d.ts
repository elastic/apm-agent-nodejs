/// <reference types="node" />
/// <reference types="aws-lambda" />
/// <reference types="connect" />

import { IncomingMessage, ServerResponse } from 'http';
import { Handler } from 'aws-lambda';
import { ErrorHandleFunction } from 'connect';

export default agent;

declare const agent: Agent;

declare class Agent implements Taggable, StartSpanFn {
  // Configuration
  start (options?: AgentConfigOptions): Agent;
  isStarted (): boolean;

  // Data collection hooks
  middleware: { connect (): ErrorHandleFunction };
  lambda (handler: Handler): Handler;
  lambda (type: string, handler: Handler): Handler;
  handleUncaughtExceptions (
    fn: (err: Error) => void
  ): void;

  // Errors
  captureError (
    err: Error | string | ParameterizedMessageObject,
    callback?: CaptureErrorCallback
  ): void;
  captureError (
    err: Error | string | ParameterizedMessageObject,
    options?: CaptureErrorOptions,
    callback?: CaptureErrorCallback
  ): void;

  // Transactions
  startTransaction (
    name?: string,
    type?: string,
    options?: TransactionOptions
  ): Transaction | null;
  setTransactionName (name: string): void;
  endTransaction (result?: string, endTime?: number): void; // TODO: Should we allow number as well for result?
  currentTransaction: Transaction | null;

  // Spans
  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
  currentSpan: Span | null;

  // Context
  setTag(name: string, value: TagValue): boolean;
  addTags(tags: Tags): boolean;
  setUserContext (user: UserObject): void;
  setCustomContext (custom: object): void;

  // Transport
  addFilter (fn: FilterFn): void;
  addErrorFilter (fn: FilterFn): void;
  addSpanFilter (fn: FilterFn): void;
  addTransactionFilter (fn: FilterFn): void;
  flush (callback: Function): void;
  destroy (): void;

  // Utils
  logger: Logger;
}

declare class GenericSpan implements Taggable {
  // TODO: The following should not be documented right? constructor(), timestamp, ended, id, traceId, parentId, sampled, duration(), 
  type: string | null; // TODO: Should we allow null?

  setTag(name: string, value: TagValue): boolean;
  addTags(tags: Tags): boolean;
}

declare class Transaction extends GenericSpan implements StartSpanFn {
  // TODO: The following should not be documented right? constructor(), setUserContext(), setCustomContext(), toJSON(), setDefaultName(), setDefaultNameFromRequest()
  name: string | null; // TODO: Should we allow null?
  result: string; // TODO: Should we also document number?

  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
  ensureParentId (): string;
  end (result?: string, endTime?: number): void; // TODO: Should we allow number as well for result?
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
  captureBody?: 'off' | 'errors' | 'transactions' | 'all';
  captureErrorLogStackTraces?: 'never' | 'messages' | 'always';
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
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  logger?: Logger;
  metricsInterval?: string | number; // TODO: Do we officially want to support numbers?
  payloadLogFile?: string;
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
  tags?: Tags; // TODO: Currently not documented
  custom?: object;
  message?: string;
}

interface Tags {
  [key: string]: TagValue;
}

interface UserObject {
  id?: string | number;
  username?: string;
  email?: string;
}

interface ParameterizedMessageObject {
  message: string;
  params: Array<any>;
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
  [propName: string]: any;
}

interface TransactionOptions {
  startTime?: number;
  childOf?: Transaction | Span | string; // TODO: This technically accepts other values, but we might not want to document these?
}

interface SpanOptions {
  childOf?: Transaction | Span | string // TODO: This technically accepts other values, but we might not want to document these?
}

interface Taggable {
  setTag (name: string, value: TagValue): boolean;
  addTags (tags: Tags): boolean;
}

interface StartSpanFn {
  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
}

type CaptureErrorCallback = (err: Error | null, id: string) => void;

type FilterFn = (payload: object) => object | Falsy | void;

type TagValue = string | number | boolean | null | undefined;
type Falsy = false | 0 | "" | null | undefined; // Not possible to define NaN
