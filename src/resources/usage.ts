import type { PDFBoltHttpClient } from '../http.js';
import { readRateLimitInfo } from '../rate-limit.js';
import type { OneTimeCredits, PDFBoltRequestOptions, RecurringCredits, UsageSummary } from '../types.js';
import {
  requiredArray,
  requiredNumber,
  requiredString,
  requireRecordResponse
} from '../utils/response-shape.js';

const MALFORMED_USAGE_RESPONSE = 'PDFBolt API returned a malformed usage response.';

export class UsageResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async get(options: PDFBoltRequestOptions = {}): Promise<UsageSummary> {
    const result = await this.http.requestJsonWithHeaders<Omit<UsageSummary, 'rateLimit'>>(
      'GET',
      '/v1/usage',
      undefined,
      options
    );
    const body = parseUsageSummary(result.body);

    return {
      ...body,
      rateLimit: readRateLimitInfo(result.headers)
    };
  }
}

function parseUsageSummary(value: unknown): Omit<UsageSummary, 'rateLimit'> {
  const body = requireRecordResponse(value, MALFORMED_USAGE_RESPONSE);

  return {
    plan: requiredString(body, 'plan', MALFORMED_USAGE_RESPONSE),
    recurring: requiredArray(body, 'recurring', MALFORMED_USAGE_RESPONSE).map(parseRecurringCredits),
    oneTime: requiredArray(body, 'oneTime', MALFORMED_USAGE_RESPONSE).map(parseOneTimeCredits)
  };
}

function parseRecurringCredits(value: unknown): RecurringCredits {
  const item = requireRecordResponse(value, MALFORMED_USAGE_RESPONSE);

  return {
    total: requiredNumber(item, 'total', MALFORMED_USAGE_RESPONSE),
    left: requiredNumber(item, 'left', MALFORMED_USAGE_RESPONSE),
    expires: requiredString(item, 'expires', MALFORMED_USAGE_RESPONSE),
    overage: requiredNumber(item, 'overage', MALFORMED_USAGE_RESPONSE)
  };
}

function parseOneTimeCredits(value: unknown): OneTimeCredits {
  const item = requireRecordResponse(value, MALFORMED_USAGE_RESPONSE);

  return {
    total: requiredNumber(item, 'total', MALFORMED_USAGE_RESPONSE),
    left: requiredNumber(item, 'left', MALFORMED_USAGE_RESPONSE),
    expires: requiredString(item, 'expires', MALFORMED_USAGE_RESPONSE)
  };
}
