import type { PDFBoltRequestOptions } from '../types.js';

export function splitRequestOptions<T extends PDFBoltRequestOptions>(
  params: T
): { body: Omit<T, keyof PDFBoltRequestOptions>; options: PDFBoltRequestOptions } {
  const { requestTimeoutMs, signal, maxRetries, ...body } = params;
  const options: PDFBoltRequestOptions = {};

  if (requestTimeoutMs !== undefined) {
    options.requestTimeoutMs = requestTimeoutMs;
  }

  if (signal !== undefined) {
    options.signal = signal;
  }

  if (maxRetries !== undefined) {
    options.maxRetries = maxRetries;
  }

  return {
    body: body as Omit<T, keyof PDFBoltRequestOptions>,
    options
  };
}
