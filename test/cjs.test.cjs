const assert = require('node:assert/strict');
const test = require('node:test');
const sdk = require('../dist/cjs/index.js');
const packageJson = require('../package.json');

test('CommonJS require exposes public SDK exports', () => {
  assert.equal(typeof sdk.PDFBolt, 'function');
  assert.equal(typeof sdk.DirectConversionResult, 'function');
  assert.equal(sdk.VERSION, packageJson.version);
  assert.equal(typeof sdk.Webhooks, 'function');
  assert.equal(typeof sdk.PDFBoltError, 'function');
  assert.equal(typeof sdk.PDFBoltAPIError, 'function');
  assert.equal(typeof sdk.PDFBoltNetworkError, 'function');
  assert.equal(typeof sdk.PDFBoltValidationError, 'function');
  assert.equal(typeof sdk.PDFBoltWebhookSignatureError, 'function');
  assert.equal(typeof sdk.PDFBoltConfigurationError, 'function');
  assert.equal(typeof sdk.webhooks.verifySignature, 'function');
  assert.equal(typeof sdk.webhooks.verifyAndParse, 'function');
  assert.equal(typeof sdk.PDFBolt.webhooks.verifySignature, 'function');
  assert.equal(typeof sdk.PDFBolt.webhooks.verifyAndParse, 'function');
});
