import Agent_, {
  AgentConfigOptions as AgentConfigOptions_,
  Transaction as Transaction_,
  TransactionOptions as TransactionOptions_,
  Span as Span_,
  SpanOptions as SpanOptions_,
} from './lib/agent';

// The export is a singleton instance of the `Agent` class.
declare const agent: Agent_;
export = agent

// Re-export some public API types/interfaces.
declare namespace agent {
  export type Agent = Agent_;
  export type AgentConfigOptions = AgentConfigOptions_;
  export type Transaction = Transaction_;
  export type TransactionOptions = TransactionOptions_;
  export type Span = Span_;
  export type SpanOptions = SpanOptions_;
}
