import { writeFile } from 'node:fs/promises';
import { readNumberHeader, readRateLimitInfo } from './rate-limit.js';
import type { RateLimitInfo } from './types.js';

export interface DirectConversionResultOptions {
  body: Buffer;
  headers: Headers;
}

export class DirectConversionResult {
  readonly buffer: Buffer;
  readonly base64: string | null;
  readonly contentType: string;
  readonly contentDisposition: string | null;
  readonly conversionCost: number | null;
  readonly filename: string | null;
  readonly rateLimit: RateLimitInfo;
  readonly headers: Headers;

  constructor(options: DirectConversionResultOptions) {
    this.headers = options.headers;
    this.contentType = normalizeContentType(options.headers.get('content-type'));
    this.contentDisposition = options.headers.get('content-disposition');
    this.conversionCost = readNumberHeader(options.headers, 'x-pdfbolt-conversion-cost');
    this.filename = parseContentDispositionFilename(this.contentDisposition);
    this.rateLimit = readRateLimitInfo(options.headers);

    if (this.contentType === 'text/plain') {
      this.base64 = options.body.toString('utf8').trim();
      this.buffer = Buffer.from(this.base64, 'base64');
    } else {
      this.base64 = null;
      this.buffer = options.body;
    }
  }

  get size(): number {
    return this.buffer.byteLength;
  }

  async save(filePath: string): Promise<void> {
    await writeFile(filePath, this.buffer);
  }
}

function normalizeContentType(value: string | null): string {
  return value?.split(';')[0]?.trim().toLowerCase() || 'application/pdf';
}

function parseContentDispositionFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = /(?:^|;)\s*filename="?(?<filename>[^";]+)"?/i.exec(contentDisposition);
  return match?.groups?.filename ?? null;
}
