import type { RateLimitInfo } from './types.js';

export function readRateLimitInfo(headers: Headers | undefined): RateLimitInfo {
  return {
    minuteLimit: readNumberHeader(headers, 'x-pdfbolt-limit-minute'),
    minuteRemaining: readNumberHeader(headers, 'x-pdfbolt-remaining-minute'),
    hourLimit: readNumberHeader(headers, 'x-pdfbolt-limit-hour'),
    hourRemaining: readNumberHeader(headers, 'x-pdfbolt-remaining-hour'),
    dayLimit: readNumberHeader(headers, 'x-pdfbolt-limit-day'),
    dayRemaining: readNumberHeader(headers, 'x-pdfbolt-remaining-day')
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
