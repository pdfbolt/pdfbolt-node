import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PDFBolt,
  PDFBoltAuthenticationError,
  PDFBoltConfigurationError,
  PDFBoltGatewayTimeoutError,
  PDFBoltNotFoundError,
  PDFBoltRateLimitError,
  PDFBoltServiceUnavailableError,
  PDFBoltUnprocessableEntityError,
  PDFBoltValidationError,
  PDFBoltWebhookSignatureError,
  VERSION
} from '../dist/esm/index.js';

describe('PDFBolt Node SDK', () => {
  it('converts raw HTML to Base64 for high-level direct.fromHtml calls', async () => {
    let capturedUrl = '';
    let capturedInit;
    const pdfBody = Buffer.from('%PDF-1.4\n');

    const fetch = async (input, init) => {
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
      printBackground: true
    });

    const headers = new Headers(capturedInit.headers);
    const body = JSON.parse(String(capturedInit.body));

    assert.equal(capturedUrl, 'https://api.example.test/v1/direct');
    assert.equal(headers.get('API-KEY'), 'test-key');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(body.html, Buffer.from('<h1>Hello</h1>', 'utf8').toString('base64'));
    assert.equal(body.headerTemplate, Buffer.from('<div>Header</div>', 'utf8').toString('base64'));
    assert.equal(body.footerTemplate, Buffer.from('<div>Footer</div>', 'utf8').toString('base64'));
    assert.equal(body.displayHeaderFooter, true);
    assert.equal(body.printBackground, true);
    assert.equal(result.buffer.equals(pdfBody), true);
    assert.equal(result.conversionCost, 1);
    assert.equal(result.filename, 'invoice.pdf');
    assert.equal(result.rateLimit.minuteLimit, 60);
    assert.equal(result.rateLimit.minuteRemaining, 59);
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

  it('maps API errors to specific error classes', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          timestamp: '2026-05-15T12:00:00Z',
          httpErrorCode: 429,
          errorCode: 'TOO_MANY_REQUESTS',
          errorMessage: 'Request limit exceeded.'
        }),
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
        assert.equal(error instanceof PDFBoltRateLimitError, true);
        assert.equal(error.statusCode, 429);
        assert.equal(error.timestamp, '2026-05-15T12:00:00Z');
        assert.equal(error.errorCode, 'TOO_MANY_REQUESTS');
        assert.equal(error.minuteLimit, 60);
        assert.equal(error.minuteRemaining, 0);
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

    assert.equal(VERSION, '1.0.0');
    assert.equal(usage.rateLimit.hourLimit, 50000);
    assert.equal(usage.rateLimit.hourRemaining, 49999);
  });

  it('maps authentication errors', async () => {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          errorCode: 'UNAUTHORIZED',
          errorMessage: 'The API key is missing, invalid or has been blocked.'
        }),
        { status: 401 }
      );

    const pdfbolt = new PDFBolt({
      apiKey: 'test-key',
      fetch
    });

    await assert.rejects(() => pdfbolt.usage.get(), PDFBoltAuthenticationError);
  });

  it('maps additional documented HTTP statuses', async () => {
    const cases = [
      [404, 'NOT_FOUND', PDFBoltNotFoundError],
      [422, 'UNPROCESSABLE_ENTITY', PDFBoltUnprocessableEntityError],
      [503, 'SERVICE_UNAVAILABLE', PDFBoltServiceUnavailableError],
      [504, 'GATEWAY_TIMEOUT', PDFBoltGatewayTimeoutError]
    ];

    for (const [status, errorCode, errorClass] of cases) {
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

      await assert.rejects(() => pdfbolt.usage.get(), errorClass);
    }
  });

  it('throws configuration errors before making API requests', () => {
    assert.throws(() => new PDFBolt({ apiKey: '' }), PDFBoltConfigurationError);
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
});
