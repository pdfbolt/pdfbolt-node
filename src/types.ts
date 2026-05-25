export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PDFBoltClientOptions {
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetch?: FetchLike;
}

export interface PDFBoltRequestOptions {
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface RateLimitWindow {
  limit: number | null;
  remaining: number | null;
}

export interface RateLimitInfo {
  minute: RateLimitWindow;
  hour: RateLimitWindow;
  day: RateLimitWindow;
}

export type EmulateMediaType = 'screen' | 'print';
export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
export type PaperFormat =
  | 'Letter'
  | 'Legal'
  | 'Tabloid'
  | 'Ledger'
  | 'A0'
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6';
export type ContentDisposition = 'inline' | 'attachment';
export type CompressionLevel = 'lossless' | 'low' | 'medium' | 'high';

export type DimensionUnit = 'px' | 'in' | 'cm' | 'mm';
export type PageDimension = number | `${number}` | `${number}${DimensionUnit}`;
export type MarginDimension = number | `${number}` | `${number}${DimensionUnit}`;

export interface HttpCredentials {
  username: string;
  password: string;
}

export interface ViewportSize {
  width: number;
  height: number;
}

interface CookieOptions {
  expires?: number | null;
  httpOnly?: boolean | null;
  secure?: boolean | null;
}

export type PDFBoltCookie =
  | ({
      name: string;
      value: string;
      url: string;
      domain?: never;
      path?: never;
    } & CookieOptions)
  | ({
      name: string;
      value: string;
      domain: string;
      path: string;
      url?: never;
    } & CookieOptions);

export interface WaitForSelector {
  selector: string;
  state: 'attached' | 'detached' | 'visible' | 'hidden';
}

export interface Margin {
  top?: MarginDimension | null;
  right?: MarginDimension | null;
  bottom?: MarginDimension | null;
  left?: MarginDimension | null;
}

export interface PrintProduction {
  pdfStandard?: 'pdf-x-4' | 'pdf-x-1a' | null;
  colorSpace?: 'rgb' | 'cmyk' | null;
  iccProfile?: 'fogra39' | 'fogra51' | 'swop' | 'gracol' | null;
  preserveBlack?: boolean | null;
}

export interface ConversionOptions extends PDFBoltRequestOptions {
  emulateMediaType?: EmulateMediaType | null;
  javaScriptEnabled?: boolean | null;
  httpCredentials?: HttpCredentials | null;
  viewportSize?: ViewportSize | null;
  isMobile?: boolean | null;
  deviceScaleFactor?: number | null;
  extraHTTPHeaders?: Record<string, string> | null;
  applyExtraHTTPHeadersToAllResources?: boolean | null;
  cookies?: PDFBoltCookie[] | null;
  waitUntil?: WaitUntil | null;
  waitForFunction?: string | null;
  waitForSelector?: WaitForSelector | null;
  /**
   * Browser render timeout sent to the PDFBolt API, in milliseconds.
   * This is different from `requestTimeoutMs`, which controls how long
   * the SDK waits for the HTTP response.
   */
  timeout?: number | null;
  format?: PaperFormat | null;
  landscape?: boolean | null;
  width?: PageDimension | null;
  height?: PageDimension | null;
  margin?: Margin | null;
  pageRanges?: string | null;
  preferCssPageSize?: boolean | null;
  printBackground?: boolean | null;
  scale?: number | null;
  displayHeaderFooter?: boolean | null;
  /**
   * Raw HTML in high-level helpers (`fromUrl`, `fromHtml`, `fromTemplate`).
   * Base64-encoded HTML when using the low-level `convert()` method.
   */
  headerTemplate?: string | null;
  /**
   * Raw HTML in high-level helpers (`fromUrl`, `fromHtml`, `fromTemplate`).
   * Base64-encoded HTML when using the low-level `convert()` method.
   */
  footerTemplate?: string | null;
  tagged?: boolean | null;
  printProduction?: PrintProduction | null;
  contentDisposition?: ContentDisposition | null;
  filename?: string | null;
  compression?: CompressionLevel | null;
}

export type UrlSource = {
  url: string;
  html?: never;
  templateId?: never;
  templateData?: never;
};

export type HtmlSource = {
  html: string;
  url?: never;
  templateId?: never;
  templateData?: never;
};

export type TemplateSource = {
  templateId: string;
  templateData: Record<string, unknown>;
  url?: never;
  html?: never;
};

export type ConversionSource = UrlSource | HtmlSource | TemplateSource;

export type DirectOptions = ConversionOptions & {
  isEncoded?: boolean | null;
};

export type DirectConvertParams = ConversionSource & DirectOptions;

export type SyncOptions = ConversionOptions & {
  customS3PresignedUrl?: string | null;
};

export type SyncConvertParams = ConversionSource & SyncOptions;

export type AsyncOptions = ConversionOptions & {
  webhook: string;
  customS3PresignedUrl?: string | null;
  additionalWebhookHeaders?: Record<string, string> | null;
  retryDelays?: number[] | null;
};

export type AsyncConvertParams = ConversionSource & AsyncOptions;

export type DirectFromUrlParams = UrlSource & DirectOptions;
export type DirectFromHtmlParams = HtmlSource & DirectOptions;
export type DirectFromTemplateParams = TemplateSource & DirectOptions;

export type SyncFromUrlParams = UrlSource & SyncOptions;
export type SyncFromHtmlParams = HtmlSource & SyncOptions;
export type SyncFromTemplateParams = TemplateSource & SyncOptions;

export type AsyncFromUrlParams = UrlSource & AsyncOptions;
export type AsyncFromHtmlParams = HtmlSource & AsyncOptions;
export type AsyncFromTemplateParams = TemplateSource & AsyncOptions;

export type ConversionErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'PDF_SIZE_TOO_LARGE'
  | 'TEMPLATE_EVAL_ERROR'
  | 'TOO_MANY_REQUESTS'
  | 'UNPROCESSABLE_ENTITY'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'CUSTOM_S3_UPLOAD_ERROR'
  | 'TARGET_CLOSED'
  | 'NO_BROWSER_CONTEXT'
  | 'URL_NOT_RESOLVED'
  | 'PDF_PRINTING_FAILED'
  | 'CONVERSION_TIMEOUT'
  | 'UNEXPECTED_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'HTTP_RESPONSE_FAILURE'
  | 'CLIENT_DISCONNECTED'
  | (string & {});

export interface SyncConversionResult {
  requestId: string;
  status: 'SUCCESS';
  errorCode: ConversionErrorCode | null;
  errorMessage: string | null;
  documentUrl: string | null;
  expiresAt: string | null;
  isAsync: false;
  duration: number | null;
  documentSizeMb: number | null;
  isCustomS3Bucket: boolean | null;
  conversionCost: number | null;
  rateLimit: RateLimitInfo;
}

export interface AsyncConversionJob {
  requestId: string;
  rateLimit: RateLimitInfo;
}

export interface AsyncConversionWebhookEvent {
  requestId: string;
  status: 'SUCCESS' | 'FAILURE';
  errorCode: ConversionErrorCode | null;
  errorMessage: string | null;
  documentUrl: string | null;
  expiresAt: string | null;
  isAsync: true;
  duration: number | null;
  documentSizeMb: number | null;
  isCustomS3Bucket: boolean | null;
}

export interface RecurringCredits {
  total: number;
  left: number;
  expires: string;
  overage: number;
}

export interface OneTimeCredits {
  total: number;
  left: number;
  expires: string;
}

export interface UsageSummary {
  plan: string;
  recurring: RecurringCredits[];
  oneTime: OneTimeCredits[];
  rateLimit: RateLimitInfo;
}
