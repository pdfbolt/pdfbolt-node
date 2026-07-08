import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PDFBolt,
  PDFBoltAPIError,
  PDFBoltConfigurationError,
  PDFBoltNetworkError,
  PDFBoltValidationError,
  PDFBoltWebhookSignatureError,
  VERSION
} from '../dist/esm/index.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('PDFBolt Node SDK', () => {
  it('converts raw HTML to Base64 for high-level direct.fromHtml calls', async () => {
    let capturedUrl = '';
    let capturedInit;
    let capturedThis;
    const pdfBody = Buffer.from('%PDF-1.4\n');

    const fetch = async function (input, init) {
      capturedThis = this;
      capturedUrl = String(input);
      capturedInit = init;

      return new Response(pdfBody, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-pdfbolt-conversion-cost': '1',
          'x-pdfbolt-limit-minute': '60',
          'x-pdfbolt-remaining-minute': '59',
          'content-disposition': 'attachment; filename="invoice.pdf"'
        }
      });
    };

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.test',
      fetch
    });

    const result = await pdfbolt.direct.fromHtml({
      html: '<h1>Hello</h1>',
      displayHeaderFooter: true,
      headerTemplate: '<div>Header</div>',
      footerTemplate: '<div>Footer</div>',
      printBackground: true,
      extraHTTPHeaders: {
        'User-Agent': 'render-browser/1.0'
      }
    });

    const headers = new Headers(capturedInit.headers);
    const body = JSON.parse(String(capturedInit.body));

    assert.equal(capturedUrl, 'https://api.example.test/v1/direct');
    assert.equal(capturedThis, undefined);
    assert.equal(headers.get('API-KEY'), 'test-key');
    assert.equal(headers.get('User-Agent'), `pdfbolt-node/${VERSION}`);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(body.html, Buffer.from('<h1>Hello</h1>', 'utf8').toString('base64'));
    assert.equal(body.headerTemplate, Buffer.from('<div>Header</div>', 'utf8').toString('base64'));
    assert.equal(body.footerTemplate, Buffer.from('<div>Footer</div>', 'utf8').toString('base64'));
    assert.equal(body.displayHeaderFooter, true);
    assert.equal(body.printBackground, true);
    assert.deepEqual(body.extraHTTPHeaders, { 'User-Agent': 'render-browser/1.0' });
    assert.equal(result.buffer.equals(pdfBody), true);
    assert.equal(result.conversionCost, 1);
    assert.equal(result.filename, 'invoice.pdf');
    assert.equal(result.rateLimit.minute.limit, 60);
    assert.equal(result.rateLimit.minute.remaining, 59);
  });

  it('decodes Base64 direct responses so save and buffer still work', async () => {
    const pdfBody = Buffer.from('%PDF-1.4\n');
    const fetch = async () =>
      new Response(Buffer.from(pdfBody.toString('base64')), {
        status: 200,
        headers: {
          'content-type': 'text/plain'
        }
      });

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const result = await pdfbolt.direct.fromUrl({
      url: 'https://example.com',
      isEncoded: true
    });

    assert.equal(result.base64, pdfBody.toString('base64'));
    assert.equal(result.buffer.equals(pdfBody), true);
  });

  it('maps malformed Base64 direct responses to PDFBoltNetworkError', async () => {
    const fetch = async () =>
      new Response('not-valid-base64', {
        status: 200,
        headers: {
          'content-type': 'text/plain'
        }
      });

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.direct.fromUrl({ url: 'https://example.com', isEncoded: true }),
      (error) => {
        assert.equal(error instanceof PDFBoltNetworkError, true);
        assert.equal(error.message, 'PDFBolt API returned malformed Base64 response.');
        return true;
      }
    );
  });

  it('maps non-PDF direct success responses to PDFBoltNetworkError', async () => {
    const cases = [
      {
        body: '<html>not a pdf</html>',
        contentType: 'application/pdf',
        params: { url: 'https://example.com' }
      },
      {
        body: Buffer.from('<html>not a pdf</html>').toString('base64'),
        contentType: 'text/plain',
        params: { url: 'https://example.com', isEncoded: true }
      }
    ];

    for (const testCase of cases) {
      const fetch = async () =>
        new Response(testCase.body, {
          status: 200,
          headers: {
            'content-type': testCase.contentType
          }
        });

      const pdfbolt = new PDFBolt({
        apiKey: 'test-key',
        fetch
      });

      await assert.rejects(
        () => pdfbolt.direct.fromUrl(testCase.params),
        (error) => {
          assert.equal(error instanceof PDFBoltNetworkError, true);
          assert.equal(error.message, 'PDFBolt API returned a malformed PDF response.');
          return true;
        }
      );
    }
  });

  it('maps API errors to one backend error shape', async () => {
    const rawBody = JSON.stringify({
      timestamp: '2026-05-15T12:00:00Z',
      httpErrorCode: 429,
      errorCode: 'TOO_MANY_REQUESTS',
      errorMessage: 'Request limit exceeded.'
    });
    const fetch = async () =>
      new Response(
        rawBody,
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'x-pdfbolt-limit-minute': '60',
            'x-pdfbolt-remaining-minute': '0'
          }
        }
      );

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.usage.get(),
      (error) => {
        assert.equal(error instanceof PDFBoltAPIError, true);
        assert.equal(error.name, 'PDFBoltAPIError');
        assert.equal(error.statusCode, 429);
        assert.equal(error.timestamp, '2026-05-15T12:00:00Z');
        assert.equal(error.errorCode, 'TOO_MANY_REQUESTS');
        assert.equal(error.errorMessage, 'Request limit exceeded.');
        assert.equal(error.rawBody, rawBody);
        assert.equal(error.rateLimit.minute.limit, 60);
        assert.equal(error.rateLimit.minute.remaining, 0);
        assert.equal(error.rateLimit.hour.limit, null);
        return true;
      }
    );
  });

  it('exposes rate limits on successful JSON responses and exports VERSION', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          plan: 'BASIC_MONTHLY',
          recurring: [],
          oneTime: []
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-pdfbolt-limit-hour': '50000',
            'x-pdfbolt-remaining-hour': '49999'
          }
        }
      );

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const usage = await pdfbolt.usage.get();

    assert.equal(VERSION, packageJson.version);
    assert.equal(usage.rateLimit.hour.limit, 50000);
    assert.equal(usage.rateLimit.hour.remaining, 49999);
  });

  it('exposes sync conversion cost and nested rate limits', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          requestId: 'request-id',
          status: 'SUCCESS',
          errorCode: null,
          errorMessage: null,
          documentUrl: 'https://example.com/document.pdf',
          expiresAt: '2026-05-16T12:00:00Z',
          isAsync: false,
          duration: 120,
          documentSizeMb: 0.5,
          isCustomS3Bucket: false
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-pdfbolt-conversion-cost': '2',
            'x-pdfbolt-limit-day': '1000',
            'x-pdfbolt-remaining-day': '999'
          }
        }
      );

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const result = await pdfbolt.sync.fromHtml({
      html: '<h1>Hello</h1>'
    });

    assert.equal(result.conversionCost, 2);
    assert.equal(result.rateLimit.day.limit, 1000);
    assert.equal(result.rateLimit.day.remaining, 999);
  });

  it('uses null for missing or malformed numeric headers', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          requestId: 'request-id',
          status: 'SUCCESS',
          errorCode: null,
          errorMessage: null,
          documentUrl: 'https://example.com/document.pdf',
          expiresAt: '2026-05-16T12:00:00Z',
          isAsync: false,
          duration: 120,
          documentSizeMb: 0.5,
          isCustomS3Bucket: false
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-pdfbolt-conversion-cost': 'not-a-number',
            'x-pdfbolt-limit-minute': 'not-a-number'
          }
        }
      );

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const result = await pdfbolt.sync.fromHtml({
      html: '<h1>Hello</h1>'
    });

    assert.equal(result.conversionCost, null);
    assert.equal(result.rateLimit.minute.limit, null);
    assert.equal(result.rateLimit.minute.remaining, null);
    assert.equal(result.rateLimit.hour.limit, null);
    assert.equal(result.rateLimit.day.remaining, null);
  });

  it('parses supported Content-Disposition filename formats', async () => {
    const cases = [
      ['attachment; filename="invoice.pdf"', 'invoice.pdf'],
      ['attachment; filename="invoice.PDF"', 'invoice.PDF'],
      ['inline; filename="invoice.pdf"', 'invoice.pdf'],
      ['inline', null],
      [null, null]
    ];
    const pdfBody = Buffer.from('%PDF-1.4\n');

    for (const [contentDisposition, expectedFilename] of cases) {
      const fetch = async () => {
        const headers = new Headers({
          'content-type': 'application/pdf'
        });

        if (contentDisposition !== null) {
          headers.set('content-disposition', contentDisposition);
        }

        return new Response(pdfBody, {
          status: 200,
          headers
        });
      };

      const pdfbolt = new PDFBolt({
        apiKey: 'test-key',
        fetch
      });

      const result = await pdfbolt.direct.fromUrl({
        url: 'https://example.com'
      });

      assert.equal(result.filename, expectedFilename);
    }
  });

  it('keeps SDK request options out of the request body while sending async retryDelays', async () => {
    let requestCount = 0;
    let capturedBody;
    let capturedSignal;
    const fetch = async (_input, init) => {
      requestCount += 1;
      capturedBody = JSON.parse(String(init.body));
      capturedSignal = init.signal;

      return new Response(
        JSON.stringify({
          requestId: 'request-id'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-pdfbolt-limit-minute': '60',
            'x-pdfbolt-remaining-minute': '59'
          }
        }
      );
    };
    const signal = new AbortController().signal;
    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const job = await pdfbolt.asyncConversions.fromHtml({
      html: '<h1>Async</h1>',
      webhook: 'https://example.com/webhook',
      retryDelays: [5, 15, 60],
      requestTimeoutMs: 10_000,
      signal
    });

    assert.equal(requestCount, 1);
    assert.equal(capturedBody.html, Buffer.from('<h1>Async</h1>', 'utf8').toString('base64'));
    assert.deepEqual(capturedBody.retryDelays, [5, 15, 60]);
    assert.equal('requestTimeoutMs' in capturedBody, false);
    assert.equal('signal' in capturedBody, false);
    assert.equal(capturedSignal instanceof AbortSignal, true);
    assert.equal(job.rateLimit.minute.remaining, 59);
  });

  it('maps documented HTTP statuses to PDFBoltAPIError', async () => {
    const cases = [
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [408, 'CONVERSION_TIMEOUT'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [422, 'UNPROCESSABLE_ENTITY'],
      [429, 'TOO_MANY_REQUESTS'],
      [503, 'SERVICE_UNAVAILABLE'],
      [504, 'GATEWAY_TIMEOUT']
    ];

    for (const [status, errorCode] of cases) {
      const fetch = async () =>
        new Response(
          JSON.stringify({
            errorCode,
            errorMessage: `${errorCode} test`
          }),
          { status }
        );

      const pdfbolt = new PDFBolt({
        apiKey: 'test-key',
        fetch
      });

      await assert.rejects(
        () => pdfbolt.usage.get(),
        (error) => {
          assert.equal(error instanceof PDFBoltAPIError, true);
          assert.equal(error.name, 'PDFBoltAPIError');
          assert.equal(error.statusCode, status);
          assert.equal(error.errorCode, errorCode);
          assert.equal(error.errorMessage, `${errorCode} test`);
          return true;
        }
      );
    }
  });

  it('keeps malformed API error bodies available as rawBody', async () => {
    const fetch = async () =>
      new Response('not-json', {
        status: 500,
        statusText: 'Internal Server Error'
      });

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.usage.get(),
      (error) => {
        assert.equal(error instanceof PDFBoltAPIError, true);
        assert.equal(error.statusCode, 500);
        assert.equal(error.errorCode, undefined);
        assert.equal(error.errorMessage, undefined);
        assert.equal(error.message, 'Internal Server Error');
        assert.equal(error.rawBody, 'not-json');
        return true;
      }
    );
  });

  it('maps malformed successful JSON responses to PDFBoltNetworkError', async () => {
    const cases = [
      {
        run: (pdfbolt) => pdfbolt.sync.fromHtml({ html: '<h1>Hello</h1>' }),
        body: {},
        message: 'PDFBolt API returned a malformed sync conversion response.'
      },
      {
        run: (pdfbolt) => pdfbolt.sync.fromHtml({ html: '<h1>Hello</h1>' }),
        body: {
          requestId: 'request-id',
          status: 'SUCCESS',
          errorCode: null,
          errorMessage: null,
          documentUrl: 999,
          expiresAt: null,
          isAsync: false,
          duration: 120,
          documentSizeMb: 0.5,
          isCustomS3Bucket: false
        },
        message: 'PDFBolt API returned a malformed sync conversion response.'
      },
      {
        run: (pdfbolt) => pdfbolt.asyncConversions.fromHtml({ html: '<h1>Hello</h1>', webhook: 'https://example.com/webhook' }),
        body: {},
        message: 'PDFBolt API returned a malformed async conversion response.'
      },
      {
        run: (pdfbolt) => pdfbolt.usage.get(),
        body: {},
        message: 'PDFBolt API returned a malformed usage response.'
      },
      {
        run: (pdfbolt) => pdfbolt.usage.get(),
        body: {
          plan: 'FREE',
          recurring: [{ total: 'bad', left: 1, expires: '2026-01-01T00:00:00Z', overage: 0 }],
          oneTime: []
        },
        message: 'PDFBolt API returned a malformed usage response.'
      }
    ];

    for (const { run, body, message } of cases) {
      const fetch = async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        });
      const pdfbolt = new PDFBolt({
        apiKey: 'test-key',
        fetch
      });

      await assert.rejects(
        () => run(pdfbolt),
        (error) => {
          assert.equal(error instanceof PDFBoltNetworkError, true);
          assert.equal(error.message, message);
          return true;
        }
      );
    }
  });

  it('does not retry API errors', async () => {
    for (const status of [429, 503, 504]) {
      let requestCount = 0;
      const fetch = async () => {
        requestCount += 1;
        return new Response(
          JSON.stringify({
            errorCode: 'SERVICE_UNAVAILABLE',
            errorMessage: 'Temporary failure.'
          }),
          { status }
        );
      };

      const pdfbolt = new PDFBolt({
        apiKey: 'test-key',
        fetch
      });

      await assert.rejects(() => pdfbolt.usage.get(), PDFBoltAPIError);
      assert.equal(requestCount, 1);
    }
  });

  it('does not retry network failures', async () => {
    let requestCount = 0;
    const fetch = async () => {
      requestCount += 1;
      throw new Error('socket closed');
    };

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.usage.get(),
      (error) => {
        assert.equal(error instanceof PDFBoltNetworkError, true);
        assert.equal(error.message, 'PDFBolt request failed before receiving a response.');
        return true;
      }
    );
    assert.equal(requestCount, 1);
  });

  it('does not retry request timeouts', async () => {
    let requestCount = 0;
    const fetch = async (_input, init) => {
      requestCount += 1;

      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    };

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      requestTimeoutMs: 1,
      fetch
    });

    await assert.rejects(
      () => pdfbolt.usage.get(),
      (error) => {
        assert.equal(error instanceof PDFBoltNetworkError, true);
        assert.equal(error.message, 'PDFBolt request timed out after 1ms.');
        return true;
      }
    );
    assert.equal(requestCount, 1);
  });

  it('does not retry caller aborts', async () => {
    let requestCount = 0;
    const controller = new AbortController();
    controller.abort(new Error('caller abort'));

    const fetch = async (_input, init) => {
      requestCount += 1;

      if (init.signal.aborted) {
        throw init.signal.reason;
      }

      return new Response('{}', { status: 200 });
    };

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.usage.get({ signal: controller.signal }),
      (error) => {
        assert.equal(error instanceof PDFBoltNetworkError, true);
        assert.equal(error.message, 'PDFBolt request was aborted.');
        return true;
      }
    );
    assert.equal(requestCount, 1);
  });

  it('throws configuration errors before making API requests', () => {
    assert.throws(() => new PDFBolt({ apiKey: '' }), PDFBoltConfigurationError);
  });

  it('throws configuration errors for invalid global requestTimeoutMs values', () => {
    for (const requestTimeoutMs of [-1, NaN, Infinity, 2_147_483_648, '1000']) {
      assert.throws(
        () => new PDFBolt({ apiKey: 'test-key', requestTimeoutMs }),
        (error) => {
          assert.equal(error instanceof PDFBoltConfigurationError, true);
          assert.equal(
            error.message,
            'PDFBolt requestTimeoutMs must be a finite number of milliseconds between 0 and 2147483647.'
          );
          return true;
        }
      );
    }
  });

  it('throws validation errors before requests for invalid per-request requestTimeoutMs values', async () => {
    let requestCount = 0;
    const fetch = async () => {
      requestCount += 1;
      return new Response('{}', { status: 200 });
    };
    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    for (const requestTimeoutMs of [-1, NaN, Infinity, 2_147_483_648, '1000']) {
      await assert.rejects(
        () => pdfbolt.direct.fromHtml({ html: '<h1>Hello</h1>', requestTimeoutMs }),
        (error) => {
          assert.equal(error instanceof PDFBoltValidationError, true);
          assert.equal(
            error.message,
            'requestTimeoutMs must be a finite number of milliseconds between 0 and 2147483647.'
          );
          return true;
        }
      );
    }

    assert.equal(requestCount, 0);
  });

  it('throws validation errors before requests for non-serializable request bodies', async () => {
    let requestCount = 0;
    const fetch = async () => {
      requestCount += 1;
      return new Response('%PDF-1.4\n', { status: 200 });
    };
    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(
      () => pdfbolt.direct.fromTemplate({
        templateId: '00000000-0000-0000-0000-000000000000',
        templateData: { amount: 10n }
      }),
      (error) => {
        assert.equal(error instanceof PDFBoltValidationError, true);
        assert.equal(error.message, 'Request body must be JSON serializable.');
        return true;
      }
    );

    assert.equal(requestCount, 0);
  });

  it('throws validation errors before high-level helper requests', async () => {
    let requestCount = 0;
    const fetch = async () => {
      requestCount += 1;
      return new Response('{}', { status: 200 });
    };
    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    const cases = [
      () => pdfbolt.direct.fromUrl({}),
      () => pdfbolt.direct.fromHtml({}),
      () => pdfbolt.direct.fromTemplate({ templateId: 'template-id' }),
      () => pdfbolt.direct.fromTemplate({ templateId: 'template-id', templateData: [] }),
      () => pdfbolt.sync.fromUrl({}),
      () => pdfbolt.sync.fromHtml({}),
      () => pdfbolt.sync.fromTemplate({ templateData: {} }),
      () => pdfbolt.asyncConversions.fromUrl({ url: 'https://example.com' }),
      () => pdfbolt.asyncConversions.fromUrl({ webhook: 'https://example.com/webhook' }),
      () => pdfbolt.asyncConversions.fromHtml({ html: '<h1>Hello</h1>' }),
      () => pdfbolt.asyncConversions.fromHtml({ webhook: 'https://example.com/webhook' }),
      () => pdfbolt.asyncConversions.fromTemplate({ templateId: 'template-id', webhook: 'https://example.com/webhook' })
    ];

    for (const runCase of cases) {
      await assert.rejects(runCase, PDFBoltValidationError);
    }

    await assert.rejects(
      () => pdfbolt.direct.fromHtml({}),
      (error) => {
        assert.equal(error instanceof PDFBoltValidationError, true);
        assert.equal(error.message, 'html is required when using direct.fromHtml().');
        return true;
      }
    );

    assert.equal(requestCount, 0);
  });

  it('verifies webhook signatures and parses typed events', () => {
    const secret = 'webhook-secret';
    const rawBody = JSON.stringify({
      requestId: '4da0a428-16e0-4c95-b1d3-a8f475ed717e',
      status: 'SUCCESS',
      errorCode: null,
      errorMessage: null,
      documentUrl: 'https://example.com/document.pdf',
      expiresAt: '2026-05-16T12:00:00Z',
      isAsync: true,
      duration: 574,
      documentSizeMb: 0.02,
      isCustomS3Bucket: false
    });
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    assert.equal(PDFBolt.webhooks.verifySignature({ rawBody, signature, secret }), true);

    const event = PDFBolt.webhooks.verifyAndParse({ rawBody, signature, secret });
    assert.equal(event.status, 'SUCCESS');
    assert.equal(event.documentUrl, 'https://example.com/document.pdf');
  });

  it('verifies webhook signatures from ArrayBuffer raw bodies', () => {
    const secret = 'webhook-secret';
    const rawBody = Buffer.from('{"status":"SUCCESS"}');
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    assert.equal(
      PDFBolt.webhooks.verifySignature({
        rawBody: rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength),
        signature,
        secret
      }),
      true
    );
  });

  it('rejects invalid webhook signatures', () => {
    assert.throws(
      () =>
        PDFBolt.webhooks.verifyAndParse({
          rawBody: '{}',
          signature: 'sha256=bad',
          secret: 'webhook-secret'
        }),
      PDFBoltWebhookSignatureError
    );
  });

  it('rejects empty webhook secrets', () => {
    const rawBody = JSON.stringify({
      requestId: '4da0a428-16e0-4c95-b1d3-a8f475ed717e',
      status: 'SUCCESS',
      errorCode: null,
      errorMessage: null,
      documentUrl: 'https://example.com/document.pdf',
      expiresAt: '2026-05-16T12:00:00Z',
      isAsync: true,
      duration: 574,
      documentSizeMb: 0.02,
      isCustomS3Bucket: false
    });
    const signature = `sha256=${createHmac('sha256', '').update(rawBody).digest('hex')}`;

    assert.equal(PDFBolt.webhooks.verifySignature({ rawBody, signature, secret: '' }), false);

    assert.throws(
      () =>
        PDFBolt.webhooks.verifyAndParse({
          rawBody,
          signature,
          secret: ''
        }),
      PDFBoltWebhookSignatureError
    );
  });

  it('maps malformed webhook payloads to PDFBoltWebhookSignatureError', () => {
    const secret = 'webhook-secret';
    const rawBody = '{not json';
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    assert.throws(
      () =>
        PDFBolt.webhooks.verifyAndParse({
          rawBody,
          signature,
          secret
        }),
      (error) => {
        assert.equal(error instanceof PDFBoltWebhookSignatureError, true);
        assert.equal(error.message, 'Invalid PDFBolt webhook payload.');
        return true;
      }
    );
  });

  it('maps webhook schema errors to PDFBoltWebhookSignatureError', () => {
    const secret = 'webhook-secret';
    const rawBody = JSON.stringify({
      status: 'SUCCESS',
      errorCode: null,
      errorMessage: null,
      documentUrl: 'https://example.com/document.pdf',
      expiresAt: '2026-05-16T12:00:00Z',
      isAsync: true,
      duration: 574,
      documentSizeMb: 0.02,
      isCustomS3Bucket: false
    });
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    assert.throws(
      () =>
        PDFBolt.webhooks.verifyAndParse({
          rawBody,
          signature,
          secret
        }),
      (error) => {
        assert.equal(error instanceof PDFBoltWebhookSignatureError, true);
        assert.equal(error.message, 'Invalid PDFBolt webhook payload.');
        return true;
      }
    );
  });

  it('maps webhook field type errors to PDFBoltWebhookSignatureError', () => {
    const secret = 'webhook-secret';
    const rawBody = JSON.stringify({
      requestId: '4da0a428-16e0-4c95-b1d3-a8f475ed717e',
      status: 'SUCCESS',
      errorCode: null,
      errorMessage: null,
      documentUrl: 999,
      expiresAt: '2026-05-16T12:00:00Z',
      isAsync: true,
      duration: 'slow',
      documentSizeMb: 0.02,
      isCustomS3Bucket: false
    });
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    assert.throws(
      () =>
        PDFBolt.webhooks.verifyAndParse({
          rawBody,
          signature,
          secret
        }),
      (error) => {
        assert.equal(error instanceof PDFBoltWebhookSignatureError, true);
        assert.equal(error.message, 'Invalid PDFBolt webhook payload.');
        return true;
      }
    );
  });
});
