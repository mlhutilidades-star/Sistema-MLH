import crypto from 'node:crypto';

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

function parseTimestamp(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Heurística: timestamps > 1e12 são ms, senão segundos
  return n > 1_000_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function extractPayloadTimestamp(payload: unknown): { value: string | number; source: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const anyPayload = payload as Record<string, any>;

  // Direct top-level fields (in priority order)
  const directCandidates: Array<[string, unknown]> = [
    ['timestamp', anyPayload.timestamp],
    ['ts', anyPayload.ts],
    ['time', anyPayload.time],
    ['event_time', anyPayload.event_time],
    ['eventTime', anyPayload.eventTime],
    ['created_at', anyPayload.created_at],
    ['createdAt', anyPayload.createdAt],
    ['update_time', anyPayload.update_time],
  ];
  for (const [key, val] of directCandidates) {
    if ((typeof val === 'string' && val.trim()) || typeof val === 'number') {
      return { value: val, source: `body.${key}` };
    }
  }

  // Nested under .data
  if (anyPayload.data && typeof anyPayload.data === 'object') {
    const nestedCandidates: Array<[string, unknown]> = [
      ['data.timestamp', anyPayload.data.timestamp],
      ['data.ts', anyPayload.data.ts],
      ['data.time', anyPayload.data.time],
      ['data.event_time', anyPayload.data.event_time],
      ['data.created_at', anyPayload.data.created_at],
    ];
    for (const [key, val] of nestedCandidates) {
      if ((typeof val === 'string' && val.trim()) || typeof val === 'number') {
        return { value: val, source: key };
      }
    }
  }

  return null;
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

  // --- Timestamp resolution with diagnostics ---
  const timestampHeader = getHeaderValue(input.headers, config.timestampHeaderCandidates);
  let timestampSec: number | null = null;
  let timestampSource: string = 'none';

  if (timestampHeader) {
    timestampSec = parseTimestamp(timestampHeader);
    if (timestampSec) timestampSource = 'header';
  }
  if (!timestampSec) {
    const bodyTs = extractPayloadTimestamp(input.payload);
    if (bodyTs) {
      timestampSec = parseTimestamp(bodyTs.value);
      if (timestampSec) timestampSource = bodyTs.source;
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skewSec = timestampSec ? Math.abs(nowSec - timestampSec) : null;
  const timestampStale = timestampSec && skewSec !== null
    && Number.isFinite(config.maxSkewSec) && config.maxSkewSec > 0
    && skewSec > config.maxSkewSec;

  // Log timestamp diagnostics
  if (typeof globalThis !== 'undefined') {
    try {
      const { logger: tsLogger } = require('../../shared/logger');
      tsLogger.info('webhook_timestamp_diag', {
        timestampSource,
        timestampSec,
        nowSec,
        skewSec,
        maxSkewSec: config.maxSkewSec,
        decision: !timestampSec ? 'missing' : (timestampStale ? 'stale_will_try_hmac' : 'ok'),
      });
    } catch { /* ignore */ }
  }

  if (config.requireTimestamp && !timestampSec) {
    if (config.allowUnsigned) {
      return { ok: true, reason: 'timestamp_missing_allow_unsigned' };
    }
    return { ok: false, reason: 'timestamp_missing', signature };
  }

  // NOTE: timestamp freshness check moved AFTER HMAC verification.
  // If HMAC is valid the event is authentic (timestamp is bound into the HMAC),
  // so we accept it even if the timestamp is stale (e.g. Shopee test pushes).

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
        // HMAC matched — event is authentic. Warn if timestamp stale but accept.
        if (timestampStale) {
          try {
            const { logger: tsWarnLogger } = require('../../shared/logger');
            tsWarnLogger.warn('webhook_timestamp_stale_accepted', {
              skewSec, timestampSec, maxSkewSec: config.maxSkewSec,
              label: candidate.label,
            });
          } catch { /* ignore */ }
        }
        return {
          ok: true,
          signature,
          timestampSec,
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
        if (timestampStale) {
          try {
            const { logger: tsWarnLogger } = require('../../shared/logger');
            tsWarnLogger.warn('webhook_timestamp_stale_accepted', {
              skewSec, timestampSec, maxSkewSec: config.maxSkewSec,
              label: candidate.label,
            });
          } catch { /* ignore */ }
        }
        return {
          ok: true,
          signature,
          timestampSec,
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
    return { ok: true, reason: 'signature_mismatch_allow_unsigned', signature, timestampSec, nonce };
  }

  // If timestamp was stale, report that as the reason (HMAC base changes with timestamp)
  if (timestampStale) {
    return { ok: false, reason: 'timestamp_out_of_range', signature, timestampSec, nonce };
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
  const { hex, base64 } = computeHmac(config.secret, base, config.secretFormat);
  const signature = config.signatureEncoding === 'base64' ? base64 : hex;
  return { signature, base };
}
