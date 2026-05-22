import type { WebhookRawBody, WebhookVerificationOptions } from '../src/index.js';

const rawBody: WebhookRawBody = Buffer.from('{}');

const options: WebhookVerificationOptions = {
  rawBody,
  signature: 'sha256=example',
  secret: 'webhook-secret'
};

void options;
