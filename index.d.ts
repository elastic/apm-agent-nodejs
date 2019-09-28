/// <reference types="node" />

import { IncomingMessage, ServerResponse } from 'http';

export = agent;

declare const agent: Agent;

declare class Agent implements Taggable, StartSpanFn {
  // Configuration
  start (options?: AgentConfigOptions): Agent;
  isStarted (): boolean;
  setFramework (options: {
    name?: string;
    version?: string;
    overwrite?: boolean;
  }): void;
  addPatch (modules: string | Array<string>, handler: string | PatchHandler): void;
  removePatch (modules: string | Array<string>, handler: string | PatchHandler): void;
  clearPatches (modules: string | Array<string>): void;

  // Data collection hooks
  middleware: { connect (): Connect.ErrorHandleFunction };
  lambda (handler: AwsLambda.Handler): AwsLambda.Handler;
  lambda (type: string, handler: AwsLambda.Handler): AwsLambda.Handler;
  handleUncaughtExceptions (
    fn?: (err: Error) => void
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

  // Distributed Tracing
  currentTraceparent: string | null;

  // Transactions
  startTransaction(
    name?: string | null,
    options?: TransactionOptions
  ): Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    options?: TransactionOptions
  ): Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: TransactionOptions
  ): Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: TransactionOptions
  ): Transaction | null;
  setTransactionName (name: string): void;
  endTransaction (result?: string | number, endTime?: number): void;
  currentTransaction: Transaction | null;

  // Spans
  startSpan(
    name?: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: SpanOptions
  ): Span | null;
  currentSpan: Span | null;

  // Context
  setLabel (name: string, value: LabelValue): boolean;
  addLabels (labels: Labels): boolean;
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
  // The following properties and methods are currently not documented as their API isn't considered official:
  // timestamp, ended, id, traceId, parentId, sampled, duration()

  type: string | null;
  subtype: string | null;
  action: string | null;
  traceparent: string;

  setType (type?: string | null, subtype?: string | null, action?: string | null): void;
  setLabel (name: string, value: LabelValue): boolean;
  addLabels (labels: Labels): boolean;
}

declare class Transaction extends GenericSpan implements StartSpanFn {
  // The following properties and methods are currently not documented as their API isn't considered official:
  // setUserContext(), setCustomContext(), toJSON(), setDefaultName(), setDefaultNameFromRequest()

  name: string;
  result: string | number;

  startSpan(
    name?: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: SpanOptions
  ): Span | null;
  ensureParentId (): string;
  end (result?: string | number | null, endTime?: number): void;
}

declare class Span extends GenericSpan {
  // The following properties and methods are currently not documented as their API isn't considered official:
  // customStackTrace(), setDbContext()

  transaction: Transaction;
  name: string;

  end (endTime?: number): void;
}

interface AgentConfigOptions {
  abortedErrorThreshold?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  active?: boolean;
  addPatch?: KeyValueConfig;
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
  environment?: string;
  errorMessageMaxLength?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  errorOnAbortedRequests?: boolean;
  filterHttpHeaders?: boolean;
  frameworkName?: string;
  frameworkVersion?: string;
  globalLabels?: KeyValueConfig;
  hostname?: string;
  ignoreUrls?: Array<string | RegExp>;
  ignoreUserAgents?: Array<string | RegExp>;
  instrument?: boolean;
  instrumentIncomingHTTPRequests?: boolean;
  kubernetesNamespace?: string;
  kubernetesNodeName?: string;
  kubernetesPodName?: string;
  kubernetesPodUID?: string;
  logLevel?: LogLevel;
  logger?: Logger;
  metricsInterval?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  payloadLogFile?: string;
  centralConfig?: boolean;
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
  usePathAsTransactionName?: boolean;
  verifyServerCert?: boolean;
}

interface CaptureErrorOptions {
  request?: IncomingMessage;
  response?: ServerResponse;
  timestamp?: number;
  handled?: boolean;
  user?: UserObject;
  labels?: Labels;
  tags?: Labels;
  custom?: object;
  message?: string;
}

interface Labels {
  [key: string]: LabelValue;
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
  childOf?: Transaction | Span | string;
}

interface SpanOptions {
  childOf?: Transaction | Span | string;
}

type CaptureBody = 'off' | 'errors' | 'transactions' | 'all';
type CaptureErrorLogStackTraces = 'never' | 'messages' | 'always';
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

type CaptureErrorCallback = (err: Error | null, id: string) => void;
type FilterFn = (payload: Payload) => Payload | boolean | void;
type LabelValue = string | number | boolean | null | undefined;
type KeyValueConfig = string | Labels | Array<Array<LabelValue>>

type Payload = { [propName: string]: any }

type PatchHandler = (exports: any, agent: Agent, options: PatchOptions) => any;

interface PatchOptions {
  version: string | undefined,
  enabled: boolean
}

interface Taggable {
  setLabel (name: string, value: LabelValue): boolean;
  addLabels (labels: Labels): boolean;
}

interface StartSpanFn {
  startSpan(
    name?: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: SpanOptions
  ): Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: SpanOptions
  ): Span | null;
}

// Inlined from @types/aws-lambda - start
declare namespace AwsLambda {
  interface CognitoIdentity {
    cognitoIdentityId: string;
    cognitoIdentityPoolId: string;
  }

  interface ClientContext {
    client: ClientContextClient;
    custom?: any;
    env: ClientContextEnv;
  }

  interface ClientContextClient {
    installationId: string;
    appTitle: string;
    appVersionName: string;
    appVersionCode: string;
    appPackageName: string;
  }

  interface ClientContextEnv {
    platformVersion: string;
    platform: string;
    make: string;
    model: string;
    locale: string;
  }

  type Callback<TResult = any> = (error?: Error | null | string, result?: TResult) => void;

  interface Context {
    // Properties
    callbackWaitsForEmptyEventLoop: boolean;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: number;
    awsRequestId: string;
    logGroupName: string;
    logStreamName: string;
    identity?: CognitoIdentity;
    clientContext?: ClientContext;

    // Functions
    getRemainingTimeInMillis(): number;

    // Functions for compatibility with earlier Node.js Runtime v0.10.42
    // For more details see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-using-old-runtime.html#nodejs-prog-model-oldruntime-context-methods
    done(error?: Error, result?: any): void;
    fail(error: Error | string): void;
    succeed(messageOrObject: any): void;
    succeed(message: string, object: any): void;
  }

  type Handler<TEvent = any, TResult = any> = (
    event: TEvent,
    context: Context,
    callback: Callback<TResult>,
  ) => void | Promise<TResult>;
}

// Inlined from @types/connect - start
declare namespace Connect {
  type NextFunction = (err?: any) => void;
  type ErrorHandleFunction = (err: any, req: IncomingMessage, res: ServerResponse, next: NextFunction) => void;
}
