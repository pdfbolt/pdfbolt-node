import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFBolt, PDFBoltAPIError } from '../dist/esm/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;
const baseUrl = process.env.PDFBOLT_BASE_URL || 'https://api.pdfbolt.com';
const webhookUrl = process.env.PDFBOLT_WEBHOOK_URL;
const templateId = process.env.PDFBOLT_TEMPLATE_ID;
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
    assert.equal(usage.rateLimit.minute.limit === null || typeof usage.rateLimit.minute.limit === 'number', true);
    assert.equal(usage.rateLimit.minute.remaining === null || typeof usage.rateLimit.minute.remaining === 'number', true);
  });

  it('generates a direct PDF from raw HTML with metadata', async () => {
    const pdf = await pdfbolt.direct.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt SDK integration test</h1></body></html>',
      format: 'A4',
      printBackground: true,
      filename: 'sdk_integration_report'
    });

    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(pdf.size > 0);
    assert.equal(pdf.filename, 'sdk_integration_report.pdf');
    assert.equal(typeof pdf.conversionCost, 'number');
    assert.equal(typeof pdf.rateLimit.minute.limit, 'number');
    assert.equal(typeof pdf.rateLimit.minute.remaining, 'number');
  });

  it('generates a direct PDF from URL', async () => {
    const pdf = await pdfbolt.direct.fromUrl({
      url: 'https://example.com',
      format: 'A4'
    });

    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(pdf.size > 0);
  });

  it('generates a base64 direct PDF from raw HTML', async () => {
    const pdf = await pdfbolt.direct.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt encoded SDK integration test</h1></body></html>',
      format: 'A4',
      isEncoded: true
    });

    assert.equal(typeof pdf.base64, 'string');
    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(pdf.size > 0);
  });

  it('handles empty HTML with the default SDK User-Agent', async () => {
    const pdf = await pdfbolt.direct.fromHtml({
      html: '',
      format: 'A4'
    });

    assert.equal(pdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(pdf.size > 0);
  });

  it('generates a sync PDF URL from raw HTML with metadata', async () => {
    const result = await pdfbolt.sync.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt sync SDK integration test</h1></body></html>',
      format: 'A4'
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isAsync, false);
    assert.equal(typeof result.requestId, 'string');
    assert.ok(result.documentUrl || result.isCustomS3Bucket);
    assert.equal(typeof result.conversionCost, 'number');
    assert.equal(typeof result.rateLimit.minute.limit, 'number');
    assert.equal(typeof result.rateLimit.minute.remaining, 'number');
  });

  it('generates a sync PDF URL from URL', async () => {
    const result = await pdfbolt.sync.fromUrl({
      url: 'https://example.com',
      format: 'A4'
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.isAsync, false);
    assert.equal(typeof result.requestId, 'string');
    assert.ok(result.documentUrl || result.isCustomS3Bucket);
  });

  it('maps invalid API keys to PDFBoltAPIError', async () => {
    const invalidClient = new PDFBolt({
      apiKey: 'invalid-api-key',
      baseUrl,
      requestTimeoutMs: 30_000
    });

    await assert.rejects(
      () => invalidClient.usage.get(),
      (error) => {
        assert.equal(error instanceof PDFBoltAPIError, true);
        assert.equal(error.statusCode, 401);
        assert.equal(error.errorCode, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('generates a direct template PDF when PDFBOLT_TEMPLATE_ID is set', { skip: templateId ? false : 'Set PDFBOLT_TEMPLATE_ID to run this check.' }, async () => {
    const templateData = readTemplateData();

    const directPdf = await pdfbolt.direct.fromTemplate({
      templateId,
      templateData
    });

    assert.equal(directPdf.buffer.subarray(0, 5).toString('utf8'), '%PDF-');
    assert.ok(directPdf.size > 0);
  });

  it('accepts an async HTML job when PDFBOLT_WEBHOOK_URL is set', { skip: webhookUrl ? false : 'Set PDFBOLT_WEBHOOK_URL to run this check.' }, async () => {
    const job = await pdfbolt.asyncConversions.fromHtml({
      html: '<!doctype html><html><body><h1>PDFBolt async SDK integration test</h1></body></html>',
      webhook: webhookUrl,
      retryDelays: [5, 15]
    });

    assert.equal(typeof job.requestId, 'string');
    assert.equal(typeof job.rateLimit.minute.limit, 'number');
    assert.equal(typeof job.rateLimit.minute.remaining, 'number');
  });
});

function readTemplateData() {
  if (!process.env.PDFBOLT_TEMPLATE_DATA_JSON) {
    return {};
  }

  const parsed = JSON.parse(process.env.PDFBOLT_TEMPLATE_DATA_JSON);
  assert.equal(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), true);
  return parsed;
}
