type TypeCounters = {
  received: number;
  processed: number;
  failed: number;
  ignored: number;
};

type MetricsState = {
  received: number;
  processed: number;
  failed: number;
  ignored: number;
  avgProcessLatencyMs: number;
  avgQueueLatencyMs: number;
  perType: Map<string, TypeCounters>;
};

const state: MetricsState = {
  received: 0,
  processed: 0,
  failed: 0,
  ignored: 0,
  avgProcessLatencyMs: 0,
  avgQueueLatencyMs: 0,
  perType: new Map(),
};

function ensureType(type: string): TypeCounters {
  if (!state.perType.has(type)) {
    state.perType.set(type, { received: 0, processed: 0, failed: 0, ignored: 0 });
  }
  return state.perType.get(type)!;
}

function ema(prev: number, next: number, alpha: number = 0.2): number {
  if (!Number.isFinite(prev) || prev <= 0) return next;
  return prev * (1 - alpha) + next * alpha;
}

export function recordWebhookReceived(type: string): void {
  state.received += 1;
  ensureType(type).received += 1;
}

export function recordWebhookProcessed(type: string, processLatencyMs: number, queueLatencyMs: number): void {
  state.processed += 1;
  ensureType(type).processed += 1;
  if (Number.isFinite(processLatencyMs)) {
    state.avgProcessLatencyMs = ema(state.avgProcessLatencyMs, processLatencyMs);
  }
  if (Number.isFinite(queueLatencyMs)) {
    state.avgQueueLatencyMs = ema(state.avgQueueLatencyMs, queueLatencyMs);
  }
}

export function recordWebhookFailed(type: string): void {
  state.failed += 1;
  ensureType(type).failed += 1;
}

export function recordWebhookIgnored(type: string): void {
  state.ignored += 1;
  ensureType(type).ignored += 1;
}

export function snapshotWebhookMetrics(queueDepth?: number): Record<string, unknown> {
  const perType = Array.from(state.perType.entries()).map(([type, counters]) => ({
    type,
    ...counters,
  }));
  return {
    received: state.received,
    processed: state.processed,
    failed: state.failed,
    ignored: state.ignored,
    avgProcessLatencyMs: Math.round(state.avgProcessLatencyMs || 0),
    avgQueueLatencyMs: Math.round(state.avgQueueLatencyMs || 0),
    queueDepth: typeof queueDepth === 'number' ? queueDepth : undefined,
    perType,
  };
}
