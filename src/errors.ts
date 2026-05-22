import type { ConversionErrorCode } from './types.js';

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
  readonly headers: Headers | undefined;
  readonly rawBody: string | undefined;

  constructor(options: PDFBoltAPIErrorOptions) {
    super({ message: options.message });
    this.name = 'PDFBoltAPIError';
    this.statusCode = options.statusCode;
    this.timestamp = options.timestamp;
    this.errorCode = options.errorCode;
    this.errorMessage = options.errorMessage;
    this.headers = options.headers;
    this.rawBody = options.rawBody;
  }
}

export class PDFBoltBadRequestError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltBadRequestError';
  }
}

export class PDFBoltAuthenticationError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltAuthenticationError';
  }
}

export class PDFBoltForbiddenError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltForbiddenError';
  }
}

export class PDFBoltConversionTimeoutError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltConversionTimeoutError';
  }
}

export class PDFBoltNotFoundError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltNotFoundError';
  }
}

export class PDFBoltPayloadTooLargeError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltPayloadTooLargeError';
  }
}

export class PDFBoltUnprocessableEntityError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltUnprocessableEntityError';
  }
}

export class PDFBoltRateLimitError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltRateLimitError';
  }

  get minuteLimit(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-limit-minute');
  }

  get minuteRemaining(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-remaining-minute');
  }

  get hourLimit(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-limit-hour');
  }

  get hourRemaining(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-remaining-hour');
  }

  get dayLimit(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-limit-day');
  }

  get dayRemaining(): number | null {
    return readNumberHeader(this.headers, 'x-pdfbolt-remaining-day');
  }
}

export class PDFBoltServiceUnavailableError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltServiceUnavailableError';
  }
}

export class PDFBoltGatewayTimeoutError extends PDFBoltAPIError {
  constructor(options: PDFBoltAPIErrorOptions) {
    super(options);
    this.name = 'PDFBoltGatewayTimeoutError';
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

function readNumberHeader(headers: Headers | undefined, name: string): number | null {
  const value = headers?.get(name);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
