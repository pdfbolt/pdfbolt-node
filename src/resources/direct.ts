import { DirectConversionResult } from '../direct-result.js';
import type { PDFBoltHttpClient } from '../http.js';
import type {
  DirectConvertParams,
  DirectFromHtmlParams,
  DirectFromTemplateParams,
  DirectFromUrlParams
} from '../types.js';
import { encodeBase64 } from '../utils/base64.js';
import { encodeHeaderFooterTemplates } from '../utils/encode-templates.js';
import { splitRequestOptions } from '../utils/request-options.js';
import { requireObjectField, requireStringField } from '../utils/validation.js';

export class DirectResource {
  constructor(private readonly http: PDFBoltHttpClient) {}

  async convert(params: DirectConvertParams): Promise<DirectConversionResult> {
    const { body, options } = splitRequestOptions(params);
    const response = await this.http.requestBinary('POST', '/v1/direct', body, options);

    return new DirectConversionResult({
      body: response.body,
      headers: response.headers
    });
  }

  async fromUrl(params: DirectFromUrlParams): Promise<DirectConversionResult> {
    requireStringField(params, 'url', 'direct.fromUrl');

    return this.convert(encodeHeaderFooterTemplates(params));
  }

  async fromHtml(params: DirectFromHtmlParams): Promise<DirectConversionResult> {
    const html = requireStringField(params, 'html', 'direct.fromHtml');

    return this.convert(encodeHeaderFooterTemplates({
      ...params,
      html: encodeBase64(html)
    }));
  }

  async fromTemplate(params: DirectFromTemplateParams): Promise<DirectConversionResult> {
    requireStringField(params, 'templateId', 'direct.fromTemplate');
    requireObjectField(params, 'templateData', 'direct.fromTemplate');

    return this.convert(encodeHeaderFooterTemplates(params));
  }
}
