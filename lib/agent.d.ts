/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'http';
import type { Logger as PinoLogger } from 'pino';
import * as Connect from 'connect';
import * as AwsLambda from 'aws-lambda';

export default class Agent {
  constructor();

  // Configuration
  start (options?: AgentConfigOptions): Agent;
  isStarted (): boolean;
  getServiceName (): string | undefined;
  setFramework (options: {
    name?: string;
    version?: string;
    overwrite?: boolean;
  }): void;
  addPatch (modules: string | Array<string>, handler: string | Agent.PatchHandler): void;
  removePatch (modules: string | Array<string>, handler: string | Agent.PatchHandler): void;
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
    err: Error | string | Agent.ParameterizedMessageObject,
    callback?: Agent.CaptureErrorCallback
  ): void;
  captureError (
    err: Error | string | Agent.ParameterizedMessageObject,
    options?: Agent.CaptureErrorOptions,
    callback?: Agent.CaptureErrorCallback
  ): void;

  // Distributed Tracing
  currentTraceparent: string | null;
  currentTraceIds: {
    'trace.id'?: string;
    'transaction.id'?: string;
    'span.id'?: string;
  }

  // Transactions
  startTransaction(
    name?: string | null,
    options?: Agent.TransactionOptions
  ): Agent.Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    options?: Agent.TransactionOptions
  ): Agent.Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: Agent.TransactionOptions
  ): Agent.Transaction | null;
  startTransaction(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: Agent.TransactionOptions
  ): Agent.Transaction | null;
  setTransactionName (name: string): void;
  endTransaction (result?: string | number, endTime?: number): void;
  currentTransaction: Agent.Transaction | null;

  // Spans
  startSpan(
    name?: string | null,
    options?: Agent.SpanOptions
  ): Agent.Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    options?: Agent.SpanOptions
  ): Agent.Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    options?: Agent.SpanOptions
  ): Agent.Span | null;
  startSpan(
    name: string | null,
    type: string | null,
    subtype: string | null,
    action: string | null,
    options?: Agent.SpanOptions
  ): Agent.Span | null;
  currentSpan: Agent.Span | null;

  // Context
  setLabel (name: string, value: Agent.LabelValue, stringify?: boolean): boolean;
  addLabels (labels: Agent.Labels, stringify?: boolean): boolean;
  setUserContext (user: Agent.UserObject): void;
  setCustomContext (custom: object): void;

  // Transport
  addFilter (fn: Agent.FilterFn): void;
  addErrorFilter (fn: Agent.FilterFn): void;
  addSpanFilter (fn: Agent.FilterFn): void;
  addTransactionFilter (fn: Agent.FilterFn): void;
  addMetadataFilter (fn: Agent.FilterFn): void;
  flush (callback?: Function): void;
  destroy (): void;

  // Utils
  logger: PinoLogger;

  // Custom metrics
  registerMetric(name: string, callback: Function): void;
  registerMetric(name: string, labels: Agent.Labels, callback: Function): void;

  setTransactionOutcome(outcome: Agent.Outcome): void;
  setSpanOutcome(outcome: Agent.Outcome): void;
}

export interface AgentConfigOptions {
  abortedErrorThreshold?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  active?: boolean;

  //XXX
  // addPatch?: KeyValueConfig;
  // apiKey?: string;
  // apiRequestSize?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  // apiRequestTime?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  // asyncHooks?: boolean;
  // breakdownMetrics?: boolean;
  // captureBody?: CaptureBody;
  // captureErrorLogStackTraces?: CaptureErrorLogStackTraces;
  captureExceptions?: boolean;
  // captureHeaders?: boolean;
  // captureSpanStackTraces?: boolean;
  // cloudProvider?: string;
  // configFile?: string;
  // containerId?: string;
  // disableInstrumentations?: string | string[];
  disableSend?: boolean;
  // environment?: string;
  // errorMessageMaxLength?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  // errorOnAbortedRequests?: boolean;
  // filterHttpHeaders?: boolean;
  // frameworkName?: string;
  // frameworkVersion?: string;
  // globalLabels?: KeyValueConfig;
  // hostname?: string;
  // ignoreMessageQueues?: Array<string>;
  // ignoreUrls?: Array<string | RegExp>;
  // ignoreUserAgents?: Array<string | RegExp>;
  // instrument?: boolean;
  // instrumentIncomingHTTPRequests?: boolean;
  // kubernetesNamespace?: string;
  // kubernetesNodeName?: string;
  // kubernetesPodName?: string;
  // kubernetesPodUID?: string;
  // logLevel?: LogLevel;
  // logUncaughtExceptions?: boolean;
  // logger?: SimpleLogger | PinoLogger;
  maxQueueSize?: number;
  metricsInterval?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  metricsLimit?: number;
  payloadLogFile?: string;
  centralConfig?: boolean;
  sanitizeFieldNames?: Array<string>;
  secretToken?: string;
  serverCaCertFile?: string;
  serverTimeout?: string; // Also support `number`, but as we're removing this functionality soon, there's no need to advertise it
  serverUrl?: string;
  serviceName?: string;
  serviceNodeName?: string;
  serviceVersion?: string;
  sourceLinesErrorAppFrames?: number;
  sourceLinesErrorLibraryFrames?: number;
  sourceLinesSpanAppFrames?: number;
  sourceLinesSpanLibraryFrames?: number;
  spanFramesMinDuration?: string;
  stackTraceLimit?: number;
  transactionIgnoreUrls?: Array<string>;
  transactionMaxSpans?: number;
  transactionSampleRate?: number;
  useElasticTraceparentHeader?: boolean;
  usePathAsTransactionName?: boolean;
  verifyServerCert?: boolean;
}

declare namespace Agent {
  type Outcome = 'unknown' | 'success' | 'failure'

  interface GenericSpan {
    // The following properties and methods are currently not documented as their API isn't considered official:
    // timestamp, ended, id, traceId, parentId, sampled, duration()

    type: string | null;
    subtype: string | null;
    action: string | null;
    traceparent: string;
    outcome: Outcome;

    setType (type?: string | null, subtype?: string | null, action?: string | null): void;
    setLabel (name: string, value: LabelValue, stringify?: boolean): boolean;
    addLabels (labels: Labels, stringify?: boolean): boolean;
  }

  export interface Transaction extends GenericSpan {
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
    setOutcome(outcome: Outcome): void;
  }

  export interface Span extends GenericSpan {
    // The following properties and methods are currently not documented as their API isn't considered official:
    // customStackTrace(), setDbContext()

    transaction: Transaction;
    name: string;

    end (endTime?: number): void;
    setOutcome(outcome: Outcome): void;
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
    captureAttributes?: boolean;
    skipOutcome?: boolean;
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

  interface SimpleLogger {
    fatal (msg: string, ...args: any[]): void;
    error (msg: string, ...args: any[]): void;
    warn (msg: string, ...args: any[]): void;
    info (msg: string, ...args: any[]): void;
    debug (msg: string, ...args: any[]): void;
    trace (msg: string, ...args: any[]): void;
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
  type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'warning' | 'error' | 'fatal' | 'critical' | 'off';

  type CaptureErrorCallback = (err: Error | null, id: string) => void;
  type FilterFn = (payload: Payload) => Payload | boolean | void;
  type LabelValue = string | number | boolean | null | undefined;
  type KeyValueConfig = string | Labels | Array<Array<LabelValue>>

  type Payload = { [propName: string]: any }

  interface PatchOptions {
    version: string | undefined,
    enabled: boolean
  }
  type PatchHandler = (exports: any, agent: Agent, options: PatchOptions) => any;
}
