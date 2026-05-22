import { readRateLimitInfo } from './rate-limit.js';
import type { ConversionErrorCode, RateLimitInfo } from './types.js';

export interface PDFBoltErrorOptions {
  message: string;
  cause?: unknown;
}

export class PDFBoltError extends Error {
  constructor(options: PDFBoltErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PDFBoltError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PDFBoltAPIErrorOptions {
  message: string;
  statusCode: number;
  timestamp?: string | undefined;
  errorCode?: ConversionErrorCode | undefined;
  errorMessage?: string | undefined;
  headers?: Headers | undefined;
  rawBody?: string | undefined;
}

export class PDFBoltAPIError extends PDFBoltError {
  readonly statusCode: number;
  readonly timestamp: string | undefined;
  readonly errorCode: ConversionErrorCode | undefined;
  readonly errorMessage: string | undefined;
  readonly rateLimit: RateLimitInfo;
  readonly headers: Headers | undefined;
  readonly rawBody: string | undefined;

  constructor(options: PDFBoltAPIErrorOptions) {
    super({ message: options.message });
    this.name = 'PDFBoltAPIError';
    this.statusCode = options.statusCode;
    this.timestamp = options.timestamp;
    this.errorCode = options.errorCode;
    this.errorMessage = options.errorMessage;
    this.rateLimit = readRateLimitInfo(options.headers);
    this.headers = options.headers;
    this.rawBody = options.rawBody;
  }
}

export class PDFBoltNetworkError extends PDFBoltError {
  constructor(message: string, cause?: unknown) {
    super({ message, cause });
    this.name = 'PDFBoltNetworkError';
  }
}

export class PDFBoltWebhookSignatureError extends PDFBoltError {
  constructor(message: string) {
    super({ message });
    this.name = 'PDFBoltWebhookSignatureError';
  }
}

export class PDFBoltValidationError extends PDFBoltError {
  constructor(message: string) {
    super({ message });
    this.name = 'PDFBoltValidationError';
  }
}

export class PDFBoltConfigurationError extends PDFBoltError {
  constructor(message: string, cause?: unknown) {
    super({ message, cause });
    this.name = 'PDFBoltConfigurationError';
  }
}
