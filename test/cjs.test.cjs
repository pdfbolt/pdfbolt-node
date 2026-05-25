const assert = require('node:assert/strict');
const test = require('node:test');
const sdk = require('../dist/cjs/index.js');

test('CommonJS require exposes public SDK exports', () => {
  assert.equal(typeof sdk.PDFBolt, 'function');
  assert.equal(typeof sdk.DirectConversionResult, 'function');
  assert.equal(sdk.VERSION, '1.0.0');
  assert.equal(typeof sdk.PDFBoltAPIError, 'function');
  assert.equal(typeof sdk.PDFBoltValidationError, 'function');
  assert.equal(typeof sdk.PDFBoltWebhookSignatureError, 'function');
  assert.equal(sdk.PDFBoltAuthenticationError, undefined);
  assert.equal(sdk.PDFBoltRateLimitError, undefined);
  assert.equal(sdk.PDFBoltServiceUnavailableError, undefined);
  assert.equal(typeof sdk.PDFBolt.webhooks.verifySignature, 'function');
  assert.equal(typeof sdk.PDFBolt.webhooks.verifyAndParse, 'function');
});
