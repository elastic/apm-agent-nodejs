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
  endTransaction (result?: string | number, endTime?: number): void;
  currentTransaction: Transaction | null;

  // Spans
  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
  currentSpan: Span | null;

  // Context
  setTag (name: string, value: TagValue): boolean;
  addTags (tags: Tags): boolean;
  setUserContext (user: UserObject): void;
  setCustomContext (custom: object): void;

  // Transport
  addFilter (fn: FilterFn): void;
  addErrorFilter (fn: FilterFn): void;
  addSpanFilter (fn: FilterFn): void;
  addTransactionFilter (fn: FilterFn): void;
  flush (callback?: Function): void;
  destroy (): void;

  // Utils
  logger: Logger;
}

declare class GenericSpan implements Taggable {
  // TODO: The following should not be documented right? constructor(), timestamp, ended, id, traceId, parentId, sampled, duration()
  type: string | null; // TODO: Should we allow null?

  setTag (name: string, value: TagValue): boolean;
  addTags (tags: Tags): boolean;
}

declare class Transaction extends GenericSpan implements StartSpanFn {
  // TODO: The following should not be documented right? constructor(), setUserContext(), setCustomContext(), toJSON(), setDefaultName(), setDefaultNameFromRequest()
  name: string | null; // TODO: Should we allow null?
  result: string | number;

  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
  ensureParentId (): string;
  end (result?: string | number, endTime?: number): void;
}

declare class Span extends GenericSpan {
  // TODO: The following should not be documented right? constructor(), customStackTrace(), setDbContext()
  transaction: Transaction;
  name: string | null; // TODO: Should we allow null?

  end (endTime?: number): void;
}

export interface AgentConfigOptions {
  abortedErrorThreshold?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  active?: boolean;
  apiRequestSize?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  apiRequestTime?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  asyncHooks?: boolean;
  captureBody?: CaptureBody;
  captureErrorLogStackTraces?: CaptureErrorLogStackTraces;
  captureExceptions?: boolean;
  captureHeaders?: boolean;
  captureSpanStackTraces?: boolean;
  containerId?: string;
  disableInstrumentations?: string | string[];
  errorMessageMaxLength?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
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
  metricsInterval?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  payloadLogFile?: string;
  secretToken?: string;
  serverTimeout?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
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

export interface CaptureErrorOptions {
  request?: IncomingMessage;
  response?: ServerResponse;
  timestamp?: number;
  handled?: boolean;
  user?: UserObject;
  tags?: Tags;
  custom?: object;
  message?: string;
}

export interface Tags {
  [key: string]: TagValue;
}

export interface UserObject {
  id?: string | number;
  username?: string;
  email?: string;
}

export interface ParameterizedMessageObject {
  message: string;
  params: Array<any>;
}

export interface Logger {
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

export interface TransactionOptions {
  startTime?: number;
  childOf?: Transaction | Span | string; // TODO: This technically accepts other values, but we might not want to document these?
}

export interface SpanOptions {
  childOf?: Transaction | Span | string // TODO: This technically accepts other values, but we might not want to document these?
}

export type CaptureBody = 'off' | 'errors' | 'transactions' | 'all';
export type CaptureErrorLogStackTraces = 'never' | 'messages' | 'always';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type CaptureErrorCallback = (err: Error | null, id: string) => void;
export type FilterFn = (payload: object) => object | Falsy | void;
export type TagValue = string | number | boolean | null | undefined;

interface Taggable {
  setTag (name: string, value: TagValue): boolean;
  addTags (tags: Tags): boolean;
}

interface StartSpanFn {
  startSpan (name?: string, type?: string, options?: SpanOptions): Span | null;
}

type Falsy = false | 0 | "" | null | undefined; // Not possible to define NaN
