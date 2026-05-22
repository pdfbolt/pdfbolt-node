import { encodeBase64 } from './base64.js';

type HeaderFooterTemplates = {
  headerTemplate?: string | null;
  footerTemplate?: string | null;
};

export function encodeHeaderFooterTemplates<T extends HeaderFooterTemplates>(params: T): T {
  return {
    ...params,
    headerTemplate:
      typeof params.headerTemplate === 'string' ? encodeBase64(params.headerTemplate) : params.headerTemplate,
    footerTemplate:
      typeof params.footerTemplate === 'string' ? encodeBase64(params.footerTemplate) : params.footerTemplate
  };
}
