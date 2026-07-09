import {
  PDFBoltAPIError,
  PDFBoltConfigurationError,
  PDFBoltNetworkError,
  PDFBoltValidationError
} from './errors.js';
import type { ConversionErrorCode, FetchLike, PDFBoltClientOptions, PDFBoltRequestOptions } from './types.js';
import { VERSION } from './version.js';

const DEFAULT_BASE_URL = 'https://api.pdfbolt.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_REQUEST_TIMEOUT_MS = 2_147_483_647;

interface InternalClientOptions extends Required<Pick<PDFBoltClientOptions, 'apiKey'>> {
  baseUrl: string;
  requestTimeoutMs: number;
  fetch: FetchLike;
}

export class PDFBoltHttpClient {
  private readonly options: InternalClientOptions;

  constructor(options: PDFBoltClientOptions) {
    if (!isObjectRecord(options)) {
      throw new PDFBoltConfigurationError('PDFBolt client options are required.');
    }

    const apiKey = validateApiKey(options.apiKey);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new PDFBoltConfigurationError('No fetch implementation is available. Use Node.js 22+ or pass a custom fetch implementation.');
    }

    this.options = {
      apiKey,
      baseUrl: normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL),
      requestTimeoutMs: validateConfigurationRequestTimeoutMs(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
      fetch: (input, init) => fetchImpl(input, init)
    };
  }

  async requestJson<T>(method: string, path: string, body?: unknown, options: PDFBoltRequestOptions = {}): Promise<T> {
    return this.request(method, path, body, options, 'application/json', async (response) => {
      return (await response.json()) as T;
    });
  }

  async requestJsonWithHeaders<T>(
    method: string,
    path: string,
    body?: unknown,
    options: PDFBoltRequestOptions = {}
  ): Promise<{ body: T; headers: Headers }> {
    return this.request(method, path, body, options, 'application/json', async (response) => {
      return {
        body: (await response.json()) as T,
        headers: response.headers
      };
    });
  }

  async requestBinary(
    method: string,
    path: string,
    body?: unknown,
    options: PDFBoltRequestOptions = {}
  ): Promise<{ body: Buffer; headers: Headers }> {
    return this.request(method, path, body, options, 'application/pdf, text/plain, application/json', async (response) => {
      return {
        body: Buffer.from(await response.arrayBuffer()),
        headers: response.headers
      };
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    requestOptions: PDFBoltRequestOptions,
    accept: string,
    readResponse: (response: Response) => Promise<T>
  ): Promise<T> {
    const timeoutMs = validateRequestTimeoutMs(requestOptions.requestTimeoutMs ?? this.options.requestTimeoutMs);
    const requestBody = body === undefined ? undefined : serializeRequestBody(body);
    const abort = createAbortController(requestOptions.signal, timeoutMs);

    try {
      const init: RequestInit = {
        method,
        headers: this.createHeaders(accept, body !== undefined),
        signal: abort.signal
      };

      if (requestBody !== undefined) {
        init.body = requestBody;
      }

      const response = await this.options.fetch(`${this.options.baseUrl}${path}`, init);

      if (!response.ok) {
        throw await createAPIError(response);
      }

      return await readResponse(response);
    } catch (error) {
      if (error instanceof PDFBoltAPIError) {
        throw error;
      }

      if (error instanceof PDFBoltNetworkError) {
        throw error;
      }

      if (abort.timedOut) {
        throw new PDFBoltNetworkError(`PDFBolt request timed out after ${timeoutMs}ms.`, error);
      }

      if (requestOptions.signal?.aborted) {
        throw new PDFBoltNetworkError('PDFBolt request was aborted.', error);
      }

      throw new PDFBoltNetworkError('PDFBolt request failed before receiving a response.', error);
    } finally {
      abort.cleanup();
    }
  }

  private createHeaders(accept: string, hasBody: boolean): Headers {
    const headers = new Headers({
      Accept: accept,
      'API-KEY': this.options.apiKey,
      'User-Agent': `pdfbolt-node/${VERSION}`
    });

    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }
}

function validateApiKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value || /\s/.test(value)) {
    throw new PDFBoltConfigurationError('PDFBolt API key must be a non-empty string without whitespace.');
  }

  return value;
}

function normalizeBaseUrl(baseUrl: unknown): string {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '' || baseUrl.trim() !== baseUrl) {
    throw new PDFBoltConfigurationError('PDFBolt baseUrl must be an http or https URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new PDFBoltConfigurationError('PDFBolt baseUrl must be an http or https URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host === '') {
    throw new PDFBoltConfigurationError('PDFBolt baseUrl must be an http or https URL.');
  }

  return baseUrl.replace(/\/+$/, '');
}

function validateConfigurationRequestTimeoutMs(value: unknown): number {
  if (!isValidRequestTimeoutMs(value)) {
    throw new PDFBoltConfigurationError(
      `PDFBolt requestTimeoutMs must be a finite number of milliseconds between 0 and ${MAX_REQUEST_TIMEOUT_MS}.`
    );
  }

  return value;
}

function validateRequestTimeoutMs(value: unknown): number {
  if (!isValidRequestTimeoutMs(value)) {
    throw new PDFBoltValidationError(
      `requestTimeoutMs must be a finite number of milliseconds between 0 and ${MAX_REQUEST_TIMEOUT_MS}.`
    );
  }

  return value;
}

function isValidRequestTimeoutMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_REQUEST_TIMEOUT_MS;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeRequestBody(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    throw new PDFBoltValidationError('Request body must be JSON serializable.');
  }
}

function createAbortController(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`PDFBolt request timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  };
}

async function createAPIError(response: Response): Promise<PDFBoltAPIError> {
  const rawBody = await response.text();
  const parsed = parseJsonObject(rawBody);
  const timestamp = readString(parsed, 'timestamp');
  const errorCode = readString(parsed, 'errorCode') as ConversionErrorCode | undefined;
  const errorMessage = readString(parsed, 'errorMessage');
  const message = errorMessage || response.statusText || `PDFBolt API request failed with status ${response.status}.`;

  return new PDFBoltAPIError({
    message,
    statusCode: response.status,
    timestamp,
    errorCode,
    errorMessage,
    headers: response.headers,
    rawBody
  });
}

function parseJsonObject(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readString(source: Record<string, unknown> | null, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}
