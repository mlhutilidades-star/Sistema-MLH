type HeaderMap = Record<string, string | string[] | undefined>;

function normalizeScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function getHeaderValue(headers: HeaderMap | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== target) continue;
    if (Array.isArray(v)) {
      const first = v.find((item) => typeof item === 'string' && item.trim());
      return first ? first.trim() : null;
    }
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function collectValuesByKeys(
  input: unknown,
  keys: Set<string>,
  limit: number = 200,
  maxDepth: number = 6
): string[] {
  const results: string[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  let visited = 0;

  while (stack.length > 0 && visited < limit) {
    const { value, depth } = stack.pop()!;
    visited++;
    if (depth > maxDepth) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        stack.push({ value: entry, depth: depth + 1 });
      }
      continue;
    }

    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (keys.has(k)) {
          const normalized = normalizeScalar(v);
          if (normalized) results.push(normalized);
        }
        stack.push({ value: v, depth: depth + 1 });
      }
    }
  }

  return results;
}

export function normalizePayload(input: unknown): any {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input ?? {};
}

export function extractEventType(payload: any): string {
  const raw =
    normalizeScalar(payload?.event_type) ||
    normalizeScalar(payload?.eventType) ||
    normalizeScalar(payload?.type) ||
    normalizeScalar(payload?.event) ||
    normalizeScalar(payload?.topic) ||
    normalizeScalar(payload?.message_type);
  return raw ? raw : 'unknown';
}

export function extractEventId(payload: any, headers?: HeaderMap): string | null {
  const raw =
    normalizeScalar(payload?.event_id) ||
    normalizeScalar(payload?.eventId) ||
    normalizeScalar(payload?.message_id) ||
    normalizeScalar(payload?.msg_id) ||
    normalizeScalar(payload?.id) ||
    normalizeScalar(payload?.request_id);
  if (raw) return raw;

  const headerCandidates = ['x-shopee-event-id', 'x-event-id', 'event-id'];
  for (const name of headerCandidates) {
    const headerValue = getHeaderValue(headers, name);
    if (headerValue) return headerValue;
  }
  return null;
}

export function extractShopId(payload: any, headers?: HeaderMap): string | null {
  const raw =
    normalizeScalar(payload?.shop_id) ||
    normalizeScalar(payload?.shopId) ||
    normalizeScalar(payload?.shopid) ||
    normalizeScalar(payload?.merchant_id) ||
    normalizeScalar(payload?.seller_id);
  if (raw) return raw;

  const headerCandidates = ['x-shopee-shopid', 'x-shop-id', 'x-shopid'];
  for (const name of headerCandidates) {
    const headerValue = getHeaderValue(headers, name);
    if (headerValue) return headerValue;
  }
  return null;
}

export function extractItemIds(payload: any): string[] {
  const keys = new Set(['item_id', 'itemId']);
  const items = collectValuesByKeys(payload, keys);
  return Array.from(new Set(items));
}

export function extractModelIds(payload: any): string[] {
  const keys = new Set(['model_id', 'modelId']);
  const models = collectValuesByKeys(payload, keys);
  return Array.from(new Set(models));
}

export function isDeleteLikeEvent(eventType: string, payload: any): boolean {
  const type = String(eventType || '').toLowerCase();
  if (/(delete|del|remove|ban|unlist)/i.test(type)) return true;

  const status =
    normalizeScalar(payload?.item_status) ||
    normalizeScalar(payload?.status) ||
    normalizeScalar(payload?.data?.item_status);

  return status ? /(deleted|unlist|banned)/i.test(status) : false;
}
