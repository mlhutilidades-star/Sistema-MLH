import crypto from 'node:crypto';

type HeaderMap = Record<string, string | string[] | undefined>;

export type WebhookSignatureConfig = {
  secret: string;
  partnerId?: string;
  signatureHeaderCandidates: string[];
  timestampHeaderCandidates: string[];
  nonceHeaderCandidates: string[];
  signatureMode: 'template' | 'body' | 'body+timestamp' | 'path+timestamp+body' | 'partner_id+path+timestamp+body' | 'auto';
  signatureTemplate: string;
  signatureEncoding: 'hex' | 'base64';
  maxSkewSec: number;
  requireTimestamp: boolean;
  allowUnsigned: boolean;
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const raw = value.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

function parseList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getWebhookSignatureConfig(): WebhookSignatureConfig {
  const secret = String(process.env.SHOPEE_WEBHOOK_SECRET || process.env.SHOPEE_PARTNER_KEY || '').trim();
  const partnerId = String(process.env.SHOPEE_PARTNER_ID || '').trim() || undefined;
  const rawMode = String(process.env.SHOPEE_WEBHOOK_SIGNATURE_MODE || 'template').trim().toLowerCase();
  const signatureMode =
    rawMode === 'hmac-sha256' || rawMode === 'hmac_sha256' || rawMode === 'hmac'
      ? 'template'
      : (rawMode as WebhookSignatureConfig['signatureMode']);

  return {
    secret,
    partnerId,
    signatureHeaderCandidates: parseList(
      process.env.SHOPEE_WEBHOOK_SIGNATURE_HEADER,
      ['x-shopee-signature', 'authorization', 'x-authorization']
    ),
    timestampHeaderCandidates: parseList(
      process.env.SHOPEE_WEBHOOK_TIMESTAMP_HEADER,
      ['x-shopee-timestamp', 'timestamp', 'x-timestamp']
    ),
    nonceHeaderCandidates: parseList(
      process.env.SHOPEE_WEBHOOK_NONCE_HEADER,
      ['x-shopee-nonce', 'nonce', 'x-nonce']
    ),
    signatureMode,
    signatureTemplate: String(process.env.SHOPEE_WEBHOOK_SIGNATURE_TEMPLATE || '${partner_id}${path}${timestamp}${body}'),
    signatureEncoding: (String(process.env.SHOPEE_WEBHOOK_SIGNATURE_ENCODING || 'hex').trim().toLowerCase() as 'hex' | 'base64'),
    maxSkewSec: Number(process.env.SHOPEE_WEBHOOK_MAX_SKEW_SEC || 300),
    requireTimestamp: parseBool(process.env.SHOPEE_WEBHOOK_REQUIRE_TIMESTAMP, true),
    allowUnsigned: parseBool(process.env.SHOPEE_WEBHOOK_ALLOW_UNSIGNED, false),
  };
}

function normalizeSignature(value: string): string {
  return value.replace(/^sha256=/i, '').trim();
}

function getHeaderValue(headers: HeaderMap, candidates: string[]): string | null {
  for (const name of candidates) {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== target) continue;
      if (Array.isArray(v)) {
        const first = v.find((item) => typeof item === 'string' && item.trim());
        if (first) return first.trim();
      } else if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
  }
  return null;
}

function parseTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Heurística: timestamps > 1e12 são ms, senão segundos
  return n > 1_000_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function buildBaseFromTemplate(template: string, tokens: Record<string, string>): string {
  const replaceToken = (input: string, matcher: RegExp): string =>
    input.replace(matcher, (_, key: string) => tokens[key] ?? '');

  const withDollar = replaceToken(template, /\$\{(\w+)\}/g);
  return replaceToken(withDollar, /\{(\w+)\}/g);
}

function buildSignatureBases(input: {
  mode: WebhookSignatureConfig['signatureMode'];
  template: string;
  partnerId?: string;
  secret?: string;
  path: string;
  timestamp: string;
  body: string;
  shopId?: string;
  eventType?: string;
  nonce?: string;
}): string[] {
  const tokens = {
    partner_id: input.partnerId || '',
    secret: input.secret || '',
    path: input.path,
    timestamp: input.timestamp,
    body: input.body,
    shop_id: input.shopId || '',
    event_type: input.eventType || '',
    nonce: input.nonce || '',
  };

  switch (input.mode) {
    case 'body':
      return [input.body];
    case 'body+timestamp':
      return [`${input.timestamp}${input.body}`];
    case 'path+timestamp+body':
      return [`${input.path}${input.timestamp}${input.body}`];
    case 'partner_id+path+timestamp+body':
      return [`${input.partnerId || ''}${input.path}${input.timestamp}${input.body}`];
    case 'template':
      return [buildBaseFromTemplate(input.template, tokens)];
    case 'auto':
      return [
        buildBaseFromTemplate(input.template, tokens),
        `${input.partnerId || ''}${input.path}${input.timestamp}${input.body}`,
        `${input.path}${input.timestamp}${input.body}`,
        `${input.timestamp}${input.body}`,
        input.body,
      ];
    default:
      return [buildBaseFromTemplate(input.template, tokens)];
  }
}

function computeHmac(secret: string, base: string) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(base, 'utf8');
  const hex = hmac.digest('hex');
  const base64 = Buffer.from(hex, 'hex').toString('base64');
  return { hex, base64 };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(input: {
  headers: HeaderMap;
  rawBody: string;
  path: string;
  payload?: any;
  config?: WebhookSignatureConfig;
}): {
  ok: boolean;
  reason?: string;
  signature?: string;
  timestampSec?: number | null;
  nonce?: string | null;
} {
  const config = input.config ?? getWebhookSignatureConfig();

  if (!config.secret) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'secret_missing_allow_unsigned' };
    }
    return { ok: false, reason: 'secret_missing' };
  }

  const signatureHeader = getHeaderValue(input.headers, config.signatureHeaderCandidates);
  if (!signatureHeader) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'signature_missing_allow_unsigned' };
    }
    return { ok: false, reason: 'signature_missing' };
  }

  const signature = normalizeSignature(signatureHeader);
  const timestampHeader = getHeaderValue(input.headers, config.timestampHeaderCandidates);
  const timestampSec = parseTimestamp(timestampHeader);

  if (config.requireTimestamp && !timestampSec) {
    return { ok: false, reason: 'timestamp_missing' };
  }

  if (timestampSec) {
    const now = Math.floor(Date.now() / 1000);
    const skew = Math.abs(now - timestampSec);
    if (Number.isFinite(config.maxSkewSec) && config.maxSkewSec > 0 && skew > config.maxSkewSec) {
      return { ok: false, reason: 'timestamp_out_of_range', signature, timestampSec };
    }
  }

  const nonceHeader = getHeaderValue(input.headers, config.nonceHeaderCandidates);
  const nonce = nonceHeader ? nonceHeader.trim() : null;
  const payload = input.payload ?? {};
  const shopId = typeof payload === 'object' ? String(payload?.shop_id ?? payload?.shopId ?? '') : '';
  const eventType = typeof payload === 'object' ? String(payload?.event_type ?? payload?.eventType ?? '') : '';

  const bases = buildSignatureBases({
    mode: config.signatureMode,
    template: config.signatureTemplate,
    partnerId: config.partnerId,
    secret: config.secret,
    path: input.path,
    timestamp: timestampSec ? String(timestampSec) : '',
    body: input.rawBody,
    shopId,
    eventType,
    nonce: nonce || '',
  });

  for (const base of bases) {
    const { hex, base64 } = computeHmac(config.secret, base);
    const normalized = signature.toLowerCase();
    if (safeEqual(normalized, hex.toLowerCase()) || safeEqual(signature, base64)) {
      return { ok: true, signature, timestampSec, nonce };
    }
  }

  return { ok: false, reason: 'signature_mismatch', signature, timestampSec, nonce };
}

export function signWebhookPayload(input: {
  rawBody: string;
  path: string;
  timestampSec: number;
  payload?: any;
  nonce?: string;
  config?: WebhookSignatureConfig;
}): { signature: string; base: string } {
  const config = input.config ?? getWebhookSignatureConfig();
  const bases = buildSignatureBases({
    mode: config.signatureMode,
    template: config.signatureTemplate,
    partnerId: config.partnerId,
    secret: config.secret,
    path: input.path,
    timestamp: String(input.timestampSec),
    body: input.rawBody,
    shopId: String(input.payload?.shop_id ?? input.payload?.shopId ?? ''),
    eventType: String(input.payload?.event_type ?? input.payload?.eventType ?? ''),
    nonce: input.nonce || '',
  });
  const base = bases[0] ?? input.rawBody;
  const { hex, base64 } = computeHmac(config.secret, base);
  const signature = config.signatureEncoding === 'base64' ? base64 : hex;
  return { signature, base };
}
