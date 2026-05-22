import type { RateLimitInfo } from './types.js';

export function readRateLimitInfo(headers: Headers | undefined): RateLimitInfo {
  return {
    minute: {
      limit: readNumberHeader(headers, 'x-pdfbolt-limit-minute'),
      remaining: readNumberHeader(headers, 'x-pdfbolt-remaining-minute')
    },
    hour: {
      limit: readNumberHeader(headers, 'x-pdfbolt-limit-hour'),
      remaining: readNumberHeader(headers, 'x-pdfbolt-remaining-hour')
    },
    day: {
      limit: readNumberHeader(headers, 'x-pdfbolt-limit-day'),
      remaining: readNumberHeader(headers, 'x-pdfbolt-remaining-day')
    }
  };
}

export function readNumberHeader(headers: Headers | undefined, name: string): number | null {
  const value = headers?.get(name);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
