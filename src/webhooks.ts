import { createHmac, timingSafeEqual } from 'node:crypto';
import { PDFBoltWebhookSignatureError } from './errors.js';
import type { AsyncConversionWebhookEvent } from './types.js';

export type WebhookRawBody = string | Buffer | Uint8Array | ArrayBuffer | ArrayBufferView;

export interface WebhookVerificationOptions {
  rawBody: WebhookRawBody;
  signature: string | string[] | null | undefined;
  secret: string;
}

export class Webhooks {
  verifySignature(options: WebhookVerificationOptions): boolean {
    if (options.secret === '') {
      return false;
    }

    const signature = normalizeSignature(options.signature);
    if (!signature) {
      return false;
    }

    const expected = signBody(options.rawBody, options.secret);
    return safeEqual(signature, expected);
  }

  verifyAndParse<T extends AsyncConversionWebhookEvent = AsyncConversionWebhookEvent>(options: WebhookVerificationOptions): T {
    if (!this.verifySignature(options)) {
      throw new PDFBoltWebhookSignatureError('Invalid PDFBolt webhook signature.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(toBuffer(options.rawBody).toString('utf8'));
    } catch {
      throw new PDFBoltWebhookSignatureError('Invalid PDFBolt webhook payload.');
    }

    if (!isAsyncConversionWebhookEvent(payload)) {
      throw new PDFBoltWebhookSignatureError('Invalid PDFBolt webhook payload.');
    }

    return payload as T;
  }
}

export const webhooks = new Webhooks();

function signBody(rawBody: WebhookRawBody, secret: string): string {
  const digest = createHmac('sha256', secret).update(toBuffer(rawBody)).digest('hex');
  return `sha256=${digest}`;
}

function normalizeSignature(signature: string | string[] | null | undefined): string | null {
  if (Array.isArray(signature)) {
    return signature[0] ?? null;
  }

  return signature ?? null;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.byteLength !== expectedBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function toBuffer(rawBody: WebhookRawBody): Buffer {
  if (Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  if (typeof rawBody === 'string') {
    return Buffer.from(rawBody, 'utf8');
  }

  if (rawBody instanceof ArrayBuffer) {
    return Buffer.from(rawBody);
  }

  if (ArrayBuffer.isView(rawBody)) {
    return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  }

  return Buffer.from(rawBody);
}

function isAsyncConversionWebhookEvent(payload: unknown): payload is AsyncConversionWebhookEvent {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    isNonEmptyString(payload.requestId) &&
    (payload.status === 'SUCCESS' || payload.status === 'FAILURE') &&
    isNullableString(payload.errorCode) &&
    isNullableString(payload.errorMessage) &&
    isNullableString(payload.documentUrl) &&
    isNullableString(payload.expiresAt) &&
    payload.isAsync === true &&
    isNullableNumber(payload.duration) &&
    isNullableNumber(payload.documentSizeMb) &&
    isNullableBool(payload.isCustomS3Bucket)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableBool(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
}
