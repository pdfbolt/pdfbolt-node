import {
  PDFBoltAPIError,
  PDFBoltAuthenticationError,
  PDFBoltBadRequestError,
  PDFBoltConfigurationError,
  PDFBoltConversionTimeoutError,
  PDFBoltForbiddenError,
  PDFBoltGatewayTimeoutError,
  PDFBoltNetworkError,
  PDFBoltNotFoundError,
  PDFBoltPayloadTooLargeError,
  PDFBoltRateLimitError,
  PDFBoltServiceUnavailableError,
  PDFBoltUnprocessableEntityError
} from './errors.js';
import type { FetchLike, PDFBoltClientOptions, PDFBoltRequestOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.pdfbolt.com';

interface InternalClientOptions extends Required<Pick<PDFBoltClientOptions, 'apiKey'>> {
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  fetch: FetchLike;
  userAgent: string | undefined;
}

export class PDFBoltHttpClient {
  private readonly options: InternalClientOptions;

  constructor(options: PDFBoltClientOptions) {
    if (!options.apiKey) {
      throw new PDFBoltConfigurationError('PDFBolt API key is required.');
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new PDFBoltConfigurationError('No fetch implementation is available. Use Node.js 22+ or pass a custom fetch implementation.');
    }

    this.options = {
      apiKey: options.apiKey,
      baseUrl: normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL),
      requestTimeoutMs: options.requestTimeoutMs ?? 120_000,
      maxRetries: options.maxRetries ?? 0,
      retryDelayMs: options.retryDelayMs ?? 250,
      fetch: fetchImpl,
      userAgent: options.userAgent
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
    const maxRetries = requestOptions.maxRetries ?? this.options.maxRetries;
    let attempt = 0;

    while (true) {
      const abort = createAbortController(
        requestOptions.signal,
        requestOptions.requestTimeoutMs ?? this.options.requestTimeoutMs
      );

      try {
        const init: RequestInit = {
          method,
          headers: this.createHeaders(accept, body !== undefined),
          signal: abort.signal
        };

        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }

        const response = await this.options.fetch(`${this.options.baseUrl}${path}`, init);

        if (response.ok) {
          const result = await readResponse(response);
          abort.cleanup();
          return result;
        }

        if (shouldRetryStatus(response.status) && attempt < maxRetries) {
          abort.cleanup();
          await delay(this.options.retryDelayMs * 2 ** attempt);
          attempt += 1;
          continue;
        }

        const apiError = await createAPIError(response);
        abort.cleanup();
        throw apiError;
      } catch (error) {
        abort.cleanup();

        if (error instanceof PDFBoltAPIError) {
          throw error;
        }

        if (requestOptions.signal?.aborted) {
          throw new PDFBoltNetworkError('PDFBolt request was aborted.', error);
        }

        if (attempt < maxRetries) {
          await delay(this.options.retryDelayMs * 2 ** attempt);
          attempt += 1;
          continue;
        }

        throw new PDFBoltNetworkError('PDFBolt request failed before receiving a response.', error);
      }
    }
  }

  private createHeaders(accept: string, hasBody: boolean): Headers {
    const headers = new Headers({
      Accept: accept,
      'API-KEY': this.options.apiKey
    });

    if (this.options.userAgent) {
      headers.set('User-Agent', this.options.userAgent);
    }

    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function shouldRetryStatus(status: number): boolean {
  return status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createAbortController(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
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
  const errorCode = readString(parsed, 'errorCode');
  const errorMessage = readString(parsed, 'errorMessage');
  const message = errorMessage || response.statusText || `PDFBolt API request failed with status ${response.status}.`;
  const options = {
    message,
    statusCode: response.status,
    timestamp,
    errorCode,
    errorMessage,
    headers: response.headers,
    rawBody
  };

  switch (response.status) {
    case 400:
      return new PDFBoltBadRequestError(options);
    case 401:
      return new PDFBoltAuthenticationError(options);
    case 403:
      return new PDFBoltForbiddenError(options);
    case 404:
      return new PDFBoltNotFoundError(options);
    case 408:
      return new PDFBoltConversionTimeoutError(options);
    case 413:
      return new PDFBoltPayloadTooLargeError(options);
    case 422:
      return new PDFBoltUnprocessableEntityError(options);
    case 429:
      return new PDFBoltRateLimitError(options);
    case 503:
      return new PDFBoltServiceUnavailableError(options);
    case 504:
      return new PDFBoltGatewayTimeoutError(options);
    default:
      return new PDFBoltAPIError(options);
  }
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
