import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFBolt, PDFBoltAuthenticationError } from '../dist/esm/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;
const baseUrl = process.env.PDFBOLT_BASE_URL || 'https://api.pdfbolt.com';
const shouldRun = process.env.PDFBOLT_RUN_INTEGRATION_TESTS === '1';

const describeIntegration = shouldRun && apiKey ? describe : describe.skip;

if (!shouldRun || !apiKey) {
  console.log(
    'Skipping integration tests. Set PDFBOLT_RUN_INTEGRATION_TESTS=1 and PDFBOLT_API_KEY to run real API checks.'
  );
}

describeIntegration('PDFBolt API integration', () => {
  const pdfbolt = new PDFBolt({
    apiKey,
    baseUrl,
    requestTimeoutMs: 120_000
  });

  it('gets usage details', async () => {
    const usage = await pdfbolt.usage.get();

    assert.equal(typeof usage.plan, 'string');
    assert.equal(Array.isArray(usage.recurring), true);
    assert.equal(Array.isArray(usage.oneTime), true);
  });

  it('generates a direct PDF from raw HTML', async () => {
    const pdf = await pdfbolt.direct.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt SDK integration test</h1></body></html>',
      format: 'A4',
      printBackground: true
    });

    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(pdf.size > 0);
  });

  it('generates a sync PDF URL from raw HTML', async () => {
    const result = await pdfbolt.sync.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt sync SDK integration test</h1></body></html>',
      format: 'A4'
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isAsync, false);
    assert.equal(typeof result.requestId, 'string');
    assert.ok(result.documentUrl || result.isCustomS3Bucket);
  });

  it('maps invalid API keys to PDFBoltAuthenticationError', async () => {
    const invalidClient = new PDFBolt({
      apiKey: 'invalid-api-key',
      baseUrl,
      requestTimeoutMs: 30_000
    });

    await assert.rejects(() => invalidClient.usage.get(), PDFBoltAuthenticationError);
  });
});
