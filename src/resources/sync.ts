import type { PDFBoltHttpClient } from '../http.js';
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
import { requireObjectField, requireStringField } from '../utils/validation.js';

export class SyncResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async convert(params: SyncConvertParams): Promise<SyncConversionResult> {
    const { body, options } = splitRequestOptions(params);
    const result = await this.http.requestJsonWithHeaders<Omit<SyncConversionResult, 'rateLimit' | 'conversionCost'>>(
      'POST',
      '/v1/sync',
      body,
      options
    );

    return {
      ...result.body,
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
