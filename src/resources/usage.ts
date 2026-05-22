import type { PDFBoltHttpClient } from '../http.js';
import { readRateLimitInfo } from '../rate-limit.js';
import type { PDFBoltRequestOptions, UsageSummary } from '../types.js';

export class UsageResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async get(options: PDFBoltRequestOptions = {}): Promise<UsageSummary> {
    const result = await this.http.requestJsonWithHeaders<Omit<UsageSummary, 'rateLimit'>>(
      'GET',
      '/v1/usage',
      undefined,
      options
    );

    return {
      ...result.body,
      rateLimit: readRateLimitInfo(result.headers)
    };
  }
}
