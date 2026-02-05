import axios from 'axios';
import crypto from 'node:crypto';
import { getWebhookSignatureConfig, signWebhookPayload } from '../src/modules/shopee/webhookSignature';

async function main(): Promise<void> {
  const baseUrl = String(process.env.WEBHOOK_TEST_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const path = String(process.env.WEBHOOK_PATH || '/api/shopee/webhook');
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const shopId = process.env.SHOPEE_SHOP_ID || '0';
  const payload = {
    event_type: 'item_update',
    shop_id: Number(shopId) || shopId,
    item_id: process.env.SHOPEE_TEST_ITEM_ID || '1234567890',
    timestamp: Math.floor(Date.now() / 1000),
  };

  const rawBody = JSON.stringify(payload);
  const timestampSec = payload.timestamp;
  const nonce = crypto.randomBytes(8).toString('hex');

  const config = getWebhookSignatureConfig();
  const { signature, base } = signWebhookPayload({
    rawBody,
    path,
    timestampSec,
    payload,
    nonce,
    config,
  });

  const signatureHeader = config.signatureHeaderCandidates[0] || 'x-shopee-signature';
  const timestampHeader = config.timestampHeaderCandidates[0] || 'x-shopee-timestamp';
  const nonceHeader = config.nonceHeaderCandidates[0] || 'x-shopee-nonce';

  const res = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      [signatureHeader]: signature,
      [timestampHeader]: String(timestampSec),
      [nonceHeader]: nonce,
    },
    validateStatus: () => true,
  });

  console.log('Webhook test URL:', url);
  console.log('Signature base:', base);
  console.log('Status:', res.status);
  console.log('Response:', res.data);
}

main().catch((err) => {
  console.error('Erro ao testar webhook:', err?.message || err);
  process.exit(1);
});
