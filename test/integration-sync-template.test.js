import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFBolt } from '../dist/esm/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;
const baseUrl = process.env.PDFBOLT_BASE_URL || 'https://api.pdfbolt.com';
const templateId = process.env.PDFBOLT_TEMPLATE_ID;
const shouldRun = process.env.PDFBOLT_RUN_INTEGRATION_TESTS === '1';

const describeIntegration = shouldRun && apiKey && templateId ? describe : describe.skip;

if (!shouldRun || !apiKey || !templateId) {
  console.log(
    'Skipping sync template integration test. Set PDFBOLT_RUN_INTEGRATION_TESTS=1, PDFBOLT_API_KEY, and PDFBOLT_TEMPLATE_ID to run this check.'
  );
}

describeIntegration('PDFBolt sync template integration', () => {
  const pdfbolt = new PDFBolt({
    apiKey,
    baseUrl,
    requestTimeoutMs: 120_000
  });

  it('generates a sync template PDF URL when PDFBOLT_TEMPLATE_ID is set', async () => {
    const templateData = readTemplateData();

    const syncResult = await pdfbolt.sync.fromTemplate({
      templateId,
      templateData
    });

    assert.equal(syncResult.status, 'SUCCESS');
    assert.equal(syncResult.isAsync, false);
    assert.equal(typeof syncResult.requestId, 'string');
    assert.ok(syncResult.documentUrl || syncResult.isCustomS3Bucket);
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
