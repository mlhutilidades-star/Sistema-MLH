import crypto from 'node:crypto';
import { logger } from '../../shared/logger';

type HeaderMap = Record<string, string | string[] | undefined>;

export type WebhookSignatureConfig = {
  secret: string;
  secretFormat: 'utf8' | 'hex';
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

type SignatureMatch = {
  label: string;
  encoding: 'hex' | 'base64';
  secretFormat: 'utf8' | 'hex';
  path: string;
};

type SignatureBaseCandidate = {
  label: string;
  base: string;
  path: string;
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const raw = value.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeList(raw: string | undefined, fallback: string[]): string[] {
  const list = parseList(raw);
  if (list.length === 0) return fallback;
  const out = [...list];
  for (const item of fallback) {
    if (!out.some((entry) => entry.toLowerCase() === item.toLowerCase())) {
      out.push(item);
    }
  }
  return out;
}

export function getWebhookSignatureConfig(): WebhookSignatureConfig {
  const secret = String(process.env.SHOPEE_WEBHOOK_SECRET || process.env.SHOPEE_PARTNER_KEY || '').trim();
  const partnerId = String(process.env.SHOPEE_PARTNER_ID || '').trim() || undefined;
  const rawMode = String(process.env.SHOPEE_WEBHOOK_SIGNATURE_MODE || 'template').trim().toLowerCase();
  const signatureMode =
    rawMode === 'hmac-sha256' || rawMode === 'hmac_sha256' || rawMode === 'hmac'
      ? 'template'
      : (rawMode as WebhookSignatureConfig['signatureMode']);

  const secretFormatEnv = String(process.env.SHOPEE_WEBHOOK_SECRET_FORMAT || '').trim().toLowerCase();
  const isHexLike = !!secret && /^[0-9a-fA-F]+$/.test(secret) && secret.length % 2 === 0;
  const secretFormat: 'utf8' | 'hex' =
    secretFormatEnv === 'hex'
      ? 'hex'
      : secretFormatEnv === 'utf8'
        ? 'utf8'
        : isHexLike
          ? 'hex'
          : 'utf8';

  return {
    secret,
    secretFormat,
    partnerId,
    signatureHeaderCandidates: mergeList(
      process.env.SHOPEE_WEBHOOK_SIGNATURE_HEADER,
      ['x-shopee-signature', 'x-shopee-signature-256', 'x-signature', 'authorization', 'x-authorization']
    ),
    timestampHeaderCandidates: mergeList(
      process.env.SHOPEE_WEBHOOK_TIMESTAMP_HEADER,
      ['x-shopee-timestamp', 'x-timestamp', 'timestamp']
    ),
    nonceHeaderCandidates: mergeList(
      process.env.SHOPEE_WEBHOOK_NONCE_HEADER,
      ['x-shopee-nonce', 'x-nonce', 'nonce']
    ),
    signatureMode,
    signatureTemplate: String(process.env.SHOPEE_WEBHOOK_SIGNATURE_TEMPLATE || '${partner_id}${path}${timestamp}${body}'),
    signatureEncoding: (String(process.env.SHOPEE_WEBHOOK_SIGNATURE_ENCODING || 'hex').trim().toLowerCase() as 'hex' | 'base64'),
    maxSkewSec: Number(process.env.SHOPEE_WEBHOOK_MAX_SKEW_SEC || 900),
    requireTimestamp: parseBool(process.env.SHOPEE_WEBHOOK_REQUIRE_TIMESTAMP, true),
    allowUnsigned: parseBool(process.env.SHOPEE_WEBHOOK_ALLOW_UNSIGNED, false),
  };
}

function normalizeSignature(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/^bearer\s+/i, '');
  normalized = normalized.replace(/^signature[:=\s]+/i, '');
  normalized = normalized.replace(/^hmac[-_]?sha256[:=\s]+/i, '');
  normalized = normalized.replace(/^sha256[:=\s]+/i, '');
  return normalized.trim();
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

function getHeaderValueWithName(
  headers: HeaderMap,
  candidates: string[]
): { name: string; value: string } | null {
  for (const name of candidates) {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== target) continue;
      if (Array.isArray(v)) {
        const first = v.find((item) => typeof item === 'string' && item.trim());
        if (first) return { name: k, value: first.trim() };
      } else if (typeof v === 'string' && v.trim()) {
        return { name: k, value: v.trim() };
      }
    }
  }
  return null;
}

function parseTimestamp(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Heurística: timestamps > 1e12 são ms, senão segundos
  return n > 1_000_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function extractPayloadTimestampWithKey(
  payload: unknown
): { value: string | number; key: string; location: 'payload' | 'payload.data' } | null {
  if (!payload || typeof payload !== 'object') return null;
  const anyPayload = payload as Record<string, any>;

  const directKeys = ['timestamp', 'ts', 'time', 'event_time', 'eventTime', 'created_at', 'createdAt'];
  for (const key of directKeys) {
    const value = anyPayload[key];
    if (typeof value === 'string' || typeof value === 'number') return { value, key, location: 'payload' };
  }

  const nested = anyPayload.data;
  if (nested && typeof nested === 'object') {
    for (const key of directKeys) {
      const value = (nested as any)[key];
      if (typeof value === 'string' || typeof value === 'number') return { value, key, location: 'payload.data' };
    }
  }

  return null;
}

export function extractTimestampSec(input: {
  headers: HeaderMap;
  payload?: unknown;
  headerCandidates: string[];
}): { timestampSec: number | null; source: string } {
  const fromHeader = getHeaderValueWithName(input.headers, input.headerCandidates);
  if (fromHeader) {
    const parsed = parseTimestamp(fromHeader.value);
    if (parsed) return { timestampSec: parsed, source: `header:${fromHeader.name.toLowerCase()}` };
  }

  const fromPayload = extractPayloadTimestampWithKey(input.payload);
  if (fromPayload) {
    const parsed = parseTimestamp(fromPayload.value);
    if (parsed) return { timestampSec: parsed, source: `${fromPayload.location}:${fromPayload.key}` };
  }

  return { timestampSec: null, source: 'missing' };
}

function extractPayloadTimestamp(payload: unknown): string | number | null {
  const extracted = extractPayloadTimestampWithKey(payload);
  return extracted ? extracted.value : null;
}

function extractPayloadNonce(payload: unknown): string | number | null {
  if (!payload || typeof payload !== 'object') return null;
  const anyPayload = payload as Record<string, any>;
  const direct = anyPayload.nonce ?? anyPayload.random ?? anyPayload.rnd;
  if (typeof direct === 'string' || typeof direct === 'number') return direct;
  const nested = anyPayload.data?.nonce ?? anyPayload.data?.random ?? anyPayload.data?.rnd;
  if (typeof nested === 'string' || typeof nested === 'number') return nested;
  return null;
}

function extractPayloadSignature(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const anyPayload = payload as Record<string, any>;
  const direct = anyPayload.signature ?? anyPayload.sign ?? anyPayload.signing ?? anyPayload.hmac;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const nested = anyPayload.data?.signature ?? anyPayload.data?.sign ?? anyPayload.data?.signing ?? anyPayload.data?.hmac;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return null;
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
        `${input.partnerId || ''}${input.timestamp}${input.body}`,
        `${input.path}${input.timestamp}${input.body}`,
        `${input.timestamp}${input.body}`,
        `${input.timestamp}${input.nonce || ''}${input.body}`,
        `${input.partnerId || ''}${input.timestamp}${input.nonce || ''}${input.body}`,
        `${input.path}${input.timestamp}${input.nonce || ''}${input.body}`,
        `${input.nonce || ''}${input.timestamp}${input.body}`,
        input.body,
      ];
    default:
      return [buildBaseFromTemplate(input.template, tokens)];
  }
}

function buildSignatureCandidates(input: {
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
}): SignatureBaseCandidate[] {
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

  const candidates: SignatureBaseCandidate[] = [];
  if (input.mode === 'auto') {
    candidates.push({
      label: `template:${input.template}`,
      base: buildBaseFromTemplate(input.template, tokens),
      path: input.path,
    });
    candidates.push({
      label: 'partner_id+path+timestamp+body',
      base: `${input.partnerId || ''}${input.path}${input.timestamp}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'partner_id+timestamp+body',
      base: `${input.partnerId || ''}${input.timestamp}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'path+timestamp+body',
      base: `${input.path}${input.timestamp}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'timestamp+body',
      base: `${input.timestamp}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'timestamp+nonce+body',
      base: `${input.timestamp}${input.nonce || ''}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'partner_id+timestamp+nonce+body',
      base: `${input.partnerId || ''}${input.timestamp}${input.nonce || ''}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'path+timestamp+nonce+body',
      base: `${input.path}${input.timestamp}${input.nonce || ''}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'nonce+timestamp+body',
      base: `${input.nonce || ''}${input.timestamp}${input.body}`,
      path: input.path,
    });
    candidates.push({
      label: 'body',
      base: input.body,
      path: input.path,
    });

    const debugTemplates = [
      { label: 'secret+timestamp+nonce+body', template: '{secret}{timestamp}{nonce}{body}' },
      { label: 'body+secret+timestamp+nonce', template: '{body}{secret}{timestamp}{nonce}' },
      { label: 'timestamp+nonce+body+secret', template: '{timestamp}{nonce}{body}{secret}' },
    ];
    for (const item of debugTemplates) {
      candidates.push({
        label: item.label,
        base: buildBaseFromTemplate(item.template, tokens),
        path: input.path,
      });
    }
  } else {
    const bases = buildSignatureBases(input);
    const baseLabel = input.mode === 'template' ? `template:${input.template}` : `mode:${input.mode}`;
    for (const base of bases) {
      candidates.push({ label: baseLabel, base, path: input.path });
    }
  }

  return candidates;
}

function computeHmac(secret: string, base: string, format: 'utf8' | 'hex') {
  const key = format === 'hex' ? Buffer.from(secret, 'hex') : Buffer.from(secret, 'utf8');
  const hmac = crypto.createHmac('sha256', key);
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
  timestampSource?: string;
  skewSec?: number | null;
  nonce?: string | null;
  match?: SignatureMatch;
} {
  const config = input.config ?? getWebhookSignatureConfig();

  if (!config.secret) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'secret_missing_allow_unsigned' };
    }
    return { ok: false, reason: 'secret_missing' };
  }

  const signatureHeader = getHeaderValue(input.headers, config.signatureHeaderCandidates);
  const signatureFromPayload = extractPayloadSignature(input.payload);
  const signatureRaw = signatureHeader ?? signatureFromPayload;
  if (!signatureRaw) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'signature_missing_allow_unsigned' };
    }
    return { ok: false, reason: 'signature_missing' };
  }

  const signature = normalizeSignature(signatureRaw);
  const extractedTimestamp = extractTimestampSec({
    headers: input.headers,
    payload: input.payload,
    headerCandidates: config.timestampHeaderCandidates,
  });
  let timestampSec = extractedTimestamp.timestampSec;
  const timestampSource = extractedTimestamp.source;
  const nowSec = Math.floor(Date.now() / 1000);
  const skewSec = timestampSec ? Math.abs(nowSec - timestampSec) : null;

  const logHits = String(process.env.SHOPEE_WEBHOOK_LOG_HITS || '').trim().toLowerCase() === 'true';
  if (logHits) {
    logger.info('webhook_timestamp_check', {
      timestamp_source: timestampSource,
      timestampSec: timestampSec ?? null,
      nowSec,
      skewSec,
      decision: !timestampSec && config.requireTimestamp ? 'missing' : skewSec !== null && skewSec > config.maxSkewSec ? 'out_of_range' : 'ok',
      requireTimestamp: config.requireTimestamp,
      maxSkewSec: config.maxSkewSec,
    });
  }

  if (config.requireTimestamp && !timestampSec) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'timestamp_missing_allow_unsigned', timestampSec, timestampSource, skewSec };
    }
    return { ok: false, reason: 'timestamp_missing', signature, timestampSec, timestampSource, skewSec };
  }

  if (timestampSec) {
    if (Number.isFinite(config.maxSkewSec) && config.maxSkewSec > 0 && (skewSec ?? 0) > config.maxSkewSec) {
      if (config.allowUnsigned) {
        return { ok: true, reason: 'timestamp_out_of_range_allow_unsigned', signature, timestampSec, timestampSource, skewSec };
      }
      return { ok: false, reason: 'timestamp_out_of_range', signature, timestampSec, timestampSource, skewSec };
    }
  }

  const nonceHeader = getHeaderValue(input.headers, config.nonceHeaderCandidates);
  const nonceFallback = extractPayloadNonce(input.payload);
  const nonce = nonceHeader ? nonceHeader.trim() : nonceFallback ? String(nonceFallback).trim() : null;
  const payload = input.payload ?? {};
  const shopId = typeof payload === 'object' ? String(payload?.shop_id ?? payload?.shopId ?? '') : '';
  const eventType = typeof payload === 'object' ? String(payload?.event_type ?? payload?.eventType ?? '') : '';

  const pathCandidates = [input.path];
  const trimmedSlash = input.path.replace(/\/+$/, '');
  if (trimmedSlash && trimmedSlash !== input.path) {
    pathCandidates.push(trimmedSlash);
  }
  if (input.path.startsWith('/api/shopee')) {
    const shortPath = input.path.replace(/^\/api\/shopee/, '') || '/';
    if (!pathCandidates.includes(shortPath)) pathCandidates.push(shortPath);
  }

  const candidates: SignatureBaseCandidate[] = [];
  for (const candidate of pathCandidates) {
    candidates.push(
      ...buildSignatureCandidates({
        mode: config.signatureMode,
        template: config.signatureTemplate,
        partnerId: config.partnerId,
        secret: config.secret,
        path: candidate,
        timestamp: timestampSec ? String(timestampSec) : '',
        body: input.rawBody,
        shopId,
        eventType,
        nonce: nonce || '',
      })
    );
  }

  const formats: Array<'utf8' | 'hex'> =
    config.secretFormat === 'hex' ? ['hex', 'utf8'] : ['utf8', 'hex'];

  for (const candidate of candidates) {
    for (const format of formats) {
      const { hex, base64 } = computeHmac(config.secret, candidate.base, format);
      const normalized = signature.toLowerCase();
      if (safeEqual(normalized, hex.toLowerCase())) {
        return {
          ok: true,
          signature,
          timestampSec,
          timestampSource,
          skewSec,
          nonce,
          match: {
            label: candidate.label,
            encoding: 'hex',
            secretFormat: format,
            path: candidate.path,
          },
        };
      }
      if (safeEqual(signature, base64)) {
        return {
          ok: true,
          signature,
          timestampSec,
          timestampSource,
          skewSec,
          nonce,
          match: {
            label: candidate.label,
            encoding: 'base64',
            secretFormat: format,
            path: candidate.path,
          },
        };
      }
    }
  }

  if (config.allowUnsigned) {
    return {
      ok: true,
      reason: 'signature_mismatch_allow_unsigned',
      signature,
      timestampSec,
      timestampSource,
      skewSec,
      nonce,
    };
  }
  return { ok: false, reason: 'signature_mismatch', signature, timestampSec, timestampSource, skewSec, nonce };
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
  const { hex, base64 } = computeHmac(config.secret, base, config.secretFormat);
  const signature = config.signatureEncoding === 'base64' ? base64 : hex;
  return { signature, base };
}
