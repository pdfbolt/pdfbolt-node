import type { PDFBoltHttpClient } from '../http.js';
import { PDFBoltNetworkError } from '../errors.js';
import { readNumberHeader, readRateLimitInfo } from '../rate-limit.js';
import type {
  SyncConversionResult,
  SyncConvertParams,
  SyncFromHtmlParams,
  SyncFromTemplateParams,
  SyncFromUrlParams
} from '../types.js';
import { encodeBase64 } from '../utils/base64.js';
import { encodeHeaderFooterTemplates } from '../utils/encode-templates.js';
import { splitRequestOptions } from '../utils/request-options.js';
import {
  nullableBool,
  nullableNumber,
  nullableString,
  requiredBool,
  requiredNonEmptyString,
  requireRecordResponse
} from '../utils/response-shape.js';
import { requireObjectField, requireParamsObject, requireStringField, validateHeaderMaps } from '../utils/validation.js';

const MALFORMED_SYNC_RESPONSE = 'PDFBolt API returned a malformed sync conversion response.';

export class SyncResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async convert(params: SyncConvertParams): Promise<SyncConversionResult> {
    const validParams = requireParamsObject(params, 'sync.convert');
    validateHeaderMaps(validParams);
    const { body, options } = splitRequestOptions(validParams);
    const result = await this.http.requestJsonWithHeaders<Omit<SyncConversionResult, 'rateLimit' | 'conversionCost'>>(
      'POST',
      '/v1/sync',
      body,
      options
    );
    const responseBody = parseSyncConversionResult(result.body);

    return {
      ...responseBody,
      conversionCost: readNumberHeader(result.headers, 'x-pdfbolt-conversion-cost'),
      rateLimit: readRateLimitInfo(result.headers)
    };
  }

  async fromUrl(params: SyncFromUrlParams): Promise<SyncConversionResult> {
    requireStringField(params, 'url', 'sync.fromUrl');

    return this.convert(encodeHeaderFooterTemplates(params));
  }

  async fromHtml(params: SyncFromHtmlParams): Promise<SyncConversionResult> {
    const html = requireStringField(params, 'html', 'sync.fromHtml');

    return this.convert(encodeHeaderFooterTemplates({
      ...params,
      html: encodeBase64(html)
    }));
  }

  async fromTemplate(params: SyncFromTemplateParams): Promise<SyncConversionResult> {
    requireStringField(params, 'templateId', 'sync.fromTemplate');
    requireObjectField(params, 'templateData', 'sync.fromTemplate');

    return this.convert(encodeHeaderFooterTemplates(params));
  }
}

function parseSyncConversionResult(value: unknown): Omit<SyncConversionResult, 'rateLimit' | 'conversionCost'> {
  const body = requireRecordResponse(value, MALFORMED_SYNC_RESPONSE);
  const requestId = requiredNonEmptyString(body, 'requestId', MALFORMED_SYNC_RESPONSE);
  const status = requiredNonEmptyString(body, 'status', MALFORMED_SYNC_RESPONSE);
  const isAsync = requiredBool(body, 'isAsync', MALFORMED_SYNC_RESPONSE);

  if (status !== 'SUCCESS' || isAsync !== false) {
    throw new PDFBoltNetworkError(MALFORMED_SYNC_RESPONSE);
  }

  const documentUrl = nullableString(body, 'documentUrl', MALFORMED_SYNC_RESPONSE);
  const expiresAt = nullableString(body, 'expiresAt', MALFORMED_SYNC_RESPONSE);
  const isCustomS3Bucket = nullableBool(body, 'isCustomS3Bucket', MALFORMED_SYNC_RESPONSE);
  validateSuccessDocumentFields(documentUrl, expiresAt, isCustomS3Bucket, MALFORMED_SYNC_RESPONSE);

  return {
    requestId,
    status,
    errorCode: nullableString(body, 'errorCode', MALFORMED_SYNC_RESPONSE),
    errorMessage: nullableString(body, 'errorMessage', MALFORMED_SYNC_RESPONSE),
    documentUrl,
    expiresAt,
    isAsync: false,
    duration: nullableNumber(body, 'duration', MALFORMED_SYNC_RESPONSE),
    documentSizeMb: nullableNumber(body, 'documentSizeMb', MALFORMED_SYNC_RESPONSE),
    isCustomS3Bucket
  };
}

export function validateSuccessDocumentFields(
  documentUrl: string | null,
  expiresAt: string | null,
  isCustomS3Bucket: boolean | null,
  message: string
): void {
  if (isCustomS3Bucket === true) {
    if (documentUrl !== null || expiresAt !== null) {
      throw new PDFBoltNetworkError(message);
    }
    return;
  }

  if (documentUrl === null || expiresAt === null) {
    throw new PDFBoltNetworkError(message);
  }
}
