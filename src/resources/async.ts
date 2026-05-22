import type { PDFBoltHttpClient } from '../http.js';
import { readRateLimitInfo } from '../rate-limit.js';
import type {
  AsyncConvertParams,
  AsyncConversionJob,
  AsyncFromHtmlParams,
  AsyncFromTemplateParams,
  AsyncFromUrlParams
} from '../types.js';
import { encodeBase64 } from '../utils/base64.js';
import { encodeHeaderFooterTemplates } from '../utils/encode-templates.js';
import { splitRequestOptions } from '../utils/request-options.js';
import { requireObjectField, requireStringField } from '../utils/validation.js';

export class AsyncConversionsResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async convert(params: AsyncConvertParams): Promise<AsyncConversionJob> {
    const { body, options } = splitRequestOptions(params);
    const result = await this.http.requestJsonWithHeaders<Omit<AsyncConversionJob, 'rateLimit'>>(
      'POST',
      '/v1/async',
      body,
      options
    );

    return {
      ...result.body,
      rateLimit: readRateLimitInfo(result.headers)
    };
  }

  async fromUrl(params: AsyncFromUrlParams): Promise<AsyncConversionJob> {
    requireStringField(params, 'url', 'asyncConversions.fromUrl');
    requireStringField(params, 'webhook', 'asyncConversions.fromUrl');

    return this.convert(encodeHeaderFooterTemplates(params));
  }

  async fromHtml(params: AsyncFromHtmlParams): Promise<AsyncConversionJob> {
    const html = requireStringField(params, 'html', 'asyncConversions.fromHtml');
    requireStringField(params, 'webhook', 'asyncConversions.fromHtml');

    return this.convert(encodeHeaderFooterTemplates({
      ...params,
      html: encodeBase64(html)
    }));
  }

  async fromTemplate(params: AsyncFromTemplateParams): Promise<AsyncConversionJob> {
    requireStringField(params, 'templateId', 'asyncConversions.fromTemplate');
    requireObjectField(params, 'templateData', 'asyncConversions.fromTemplate');
    requireStringField(params, 'webhook', 'asyncConversions.fromTemplate');

    return this.convert(encodeHeaderFooterTemplates(params));
  }
}
