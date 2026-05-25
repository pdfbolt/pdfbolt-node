# PDFBolt Node SDK

Official Node.js SDK for the PDFBolt API.

PDFBolt generates PDFs from HTTPS URLs, HTML, and published templates. See the [PDFBolt docs](https://pdfbolt.com/docs) and [OpenAPI reference](https://pdfbolt.com/docs/api-reference) for the full REST API. The SDK is TypeScript-first, uses native `fetch`, and is intended for server-side Node.js applications.

## Installation

```bash
npm install @pdfbolt/node
```

Requires Node.js 24 or newer.

## Quick Start

```ts
import { PDFBolt, VERSION } from '@pdfbolt/node';

const pdfbolt = new PDFBolt({
  apiKey: process.env.PDFBOLT_API_KEY!
});

const pdf = await pdfbolt.direct.fromUrl({
  url: 'https://example.com',
  printBackground: true
});

await pdf.save('example.pdf');

console.log(`Using PDFBolt SDK ${VERSION}`);
console.log(`Saved ${pdf.size} bytes`);
```

## Convert a URL to PDF

Use `fromUrl()` when you want PDFBolt to load an HTTPS page and render it as a PDF.

```ts
const pdf = await pdfbolt.direct.fromUrl({
  url: 'https://example.com',
  format: 'A4',
  printBackground: true
});

await pdf.save('url.pdf');
```

## Convert HTML to PDF

Use `fromHtml()` when you have raw HTML. The SDK automatically encodes it to Base64 for the API.

```ts
const pdf = await pdfbolt.direct.fromHtml({
  html: '<h1>Hello from PDFBolt</h1>',
  format: 'A4'
});

await pdf.save('hello.pdf');
```

If you already have a Base64-encoded HTML string, use `convert()` directly. It returns the same `DirectConversionResult` as `fromHtml()`.

```ts
const pdf = await pdfbolt.direct.convert({
  html: 'PGgxPkhlbGxvPC9oMT4='
});

await pdf.save('hello.pdf');
```

Header and footer templates work the same way: `fromUrl()`, `fromHtml()`, and `fromTemplate()` accept raw HTML templates and automatically encode them to Base64, while `convert()` expects Base64-encoded template values.

This rule applies to all low-level `convert()` methods: `direct.convert()`, `sync.convert()`, and `asyncConversions.convert()` send HTML and header/footer template values as provided.

See the [`headerTemplate`](https://pdfbolt.com/docs/parameters#headertemplate) and [`footerTemplate`](https://pdfbolt.com/docs/parameters#footertemplate) parameter docs for supported placeholders and examples.

```ts
const pdf = await pdfbolt.direct.fromHtml({
  html: '<h1>Invoice</h1>',
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:9px;width:100%;text-align:center;">Invoice</div>',
  footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  margin: {
    top: '20mm',
    bottom: '20mm'
  }
});

await pdf.save('invoice.pdf');
```

## Convert a Template to PDF

Use `fromTemplate()` with a published PDFBolt template ID and the JSON data for that template.

```ts
const pdf = await pdfbolt.direct.fromTemplate({
  templateId: '00000000-0000-0000-0000-000000000000',
  templateData: {
    invoiceNumber: 'INV-1001',
    customerName: 'Acme Inc.',
    total: '$250.00'
  }
});

await pdf.save('template.pdf');
```

## Direct Results

Use `pdfbolt.direct` when you want the generated PDF returned in the HTTP response. Direct conversions return a `DirectConversionResult`.

`DirectConversionResult.buffer` always contains PDF bytes. When you pass `isEncoded: true`, PDFBolt returns Base64 text and the SDK exposes it as `DirectConversionResult.base64`. `DirectConversionResult.buffer` still contains decoded PDF bytes, so `save()` works the same way.

```ts
const pdf = await pdfbolt.direct.fromUrl({
  url: 'https://example.com',
  filename: 'example.pdf'
});

await pdf.save('example.pdf');

console.log(pdf.buffer); // Buffer with PDF bytes
console.log(pdf.base64); // string only when isEncoded: true, otherwise null
console.log(pdf.size);
console.log(pdf.contentType);
console.log(pdf.contentDisposition);
console.log(pdf.filename);
console.log(pdf.conversionCost);
console.log(pdf.rateLimit.minute.remaining);
console.log(pdf.headers.get('x-pdfbolt-conversion-cost'));
```

All result types expose parsed rate-limit values through `rateLimit`. Direct results also expose raw HTTP headers via `pdf.headers`.

## Get a Temporary URL

Use `pdfbolt.sync` when you want PDFBolt to generate the document and return a temporary download URL (valid for 24 hours).

```ts
const result = await pdfbolt.sync.fromUrl({
  url: 'https://example.com'
});

console.log(result.requestId);
console.log(result.status);
console.log(result.documentUrl);
console.log(result.expiresAt);
console.log(result.duration);
console.log(result.documentSizeMb);
console.log(result.rateLimit.minute.remaining);
console.log(result.conversionCost);
```

For custom S3 uploads, pass a valid presigned URL. PDFBolt uploads the generated PDF to your S3-compatible bucket, so `documentUrl` and `expiresAt` are `null`.

```ts
const result = await pdfbolt.sync.fromHtml({
  html: '<h1>Invoice</h1>',
  customS3PresignedUrl: process.env.PDFBOLT_CUSTOM_S3_PRESIGNED_URL!
});

console.log(result.isCustomS3Bucket); // true
console.log(result.documentUrl); // null
```

Presigned URLs are usually time-limited and often single-use. Generate a new one for each conversion. See [Uploading to Your S3 Bucket](https://pdfbolt.com/docs/s3-bucket-upload) for setup details.

## Run an Async Conversion

Use `pdfbolt.asyncConversions` when the conversion should run in the background. The request returns an accepted job with a `requestId` immediately, and PDFBolt sends the final success or failure payload to your HTTPS webhook later.

```ts
const job = await pdfbolt.asyncConversions.fromUrl({
  url: 'https://example.com',
  webhook: 'https://your-app.com/webhooks/pdfbolt',
  retryDelays: [5, 15, 60]
});

console.log(job.requestId);
console.log(job.rateLimit.minute.remaining);
```

[`retryDelays`](https://pdfbolt.com/docs/api-endpoints/async#retrydelays) are in minutes and retry the conversion attempt itself, not webhook delivery.

For async custom S3 uploads, pass a valid `customS3PresignedUrl` in the async request. After a successful upload, the final webhook has `isCustomS3Bucket: true`, `documentUrl: null`, and `expiresAt: null`.

## Verify Webhook Signatures

Use the exact raw request body received from your framework. Do not parse and re-serialize JSON before verification. Supported raw body types are `string`, `Buffer`, `Uint8Array`, `ArrayBuffer`, and `ArrayBufferView`.

When using Express, configure the webhook route with a raw body parser, for example `express.raw({ type: 'application/json' })`, before calling `verifyAndParse()`.

The `secret` value is your PDFBolt webhook signature key, not your API key.

```ts
const event = PDFBolt.webhooks.verifyAndParse({
  rawBody,
  signature: req.headers['x-pdfbolt-signature'],
  secret: process.env.PDFBOLT_WEBHOOK_SECRET!
});

console.log(event.requestId);
console.log(event.status);
console.log(event.errorCode);
console.log(event.documentUrl);
```

`verifyAndParse()` verifies the HMAC signature first and parses JSON only after the signature is valid. If you only need a boolean result, use `PDFBolt.webhooks.verifySignature()`.

`PDFBolt.webhooks` and the top-level `webhooks` export reference the same helper object. Use whichever import style fits your codebase.

## Error Handling

The PDFBolt API returns one common error response shape. The SDK mirrors that with one backend error class: `PDFBoltAPIError`. Check `statusCode` for HTTP-level handling and `errorCode` for PDFBolt-specific causes.

```ts
import {
  PDFBoltAPIError,
  PDFBoltNetworkError,
  PDFBoltValidationError
} from '@pdfbolt/node';

try {
  await pdfbolt.direct.fromUrl({ url: 'https://example.com' });
} catch (error) {
  if (error instanceof PDFBoltValidationError) {
    console.log(error.message);
  } else if (error instanceof PDFBoltAPIError) {
    console.log(error.statusCode);
    console.log(error.timestamp);
    console.log(error.errorCode);
    console.log(error.errorMessage);
    console.log(error.rateLimit.minute.limit);
    console.log(error.rateLimit.minute.remaining);
    console.log(error.rawBody);

    if (error.statusCode === 401) {
      console.log('Check your API key.');
    }

    if (error.errorCode === 'TOO_MANY_REQUESTS') {
      console.log(error.rateLimit.minute.remaining);
    }
  } else if (error instanceof PDFBoltNetworkError) {
    console.log(error.message);
  } else {
    throw error;
  }
}
```

`PDFBoltError` is the base class for all SDK errors. `PDFBoltAPIError` is thrown when the PDFBolt API returns an HTTP error response.

Exported error classes:

```ts
PDFBoltError
PDFBoltAPIError
PDFBoltNetworkError
PDFBoltWebhookSignatureError
PDFBoltValidationError
PDFBoltConfigurationError
```

See [Error Handling](https://pdfbolt.com/docs/error-handling) for the full API error reference. These SDK-specific classes are worth calling out:

- `PDFBoltValidationError` is thrown before a request is sent when a high-level helper is called with missing or invalid SDK-side parameters.
- `PDFBoltConfigurationError` is thrown before a request is sent, for example when the API key is missing.
- `PDFBoltNetworkError` means the SDK did not receive a usable HTTP response, for example because of a network failure, timeout, or aborted request.
- `PDFBoltWebhookSignatureError` is thrown by `verifyAndParse()` when the webhook signature is invalid.

## Advanced Client Options

```ts
const pdfbolt = new PDFBolt({
  apiKey: process.env.PDFBOLT_API_KEY!,
  requestTimeoutMs: 120_000
});
```

The SDK does not perform automatic transport retries. One SDK method call sends at most one HTTP request. For async conversion retries handled by the PDFBolt backend, use the `retryDelays` conversion parameter.

`requestTimeoutMs` is the SDK HTTP timeout. The default is `120_000` ms. The conversion `timeout` option is different: it is sent to the PDFBolt API and controls the browser render timeout for the PDF conversion.

The SDK always sends `User-Agent: pdfbolt-node/<version>` to the PDFBolt API. This identifies the SDK version in backend logs. To control headers used by Chromium/Playwright while rendering the target page, use the conversion `extraHTTPHeaders` parameter.

Common conversion options such as `format`, `margin`, `printBackground`, `contentDisposition`, `filename`, and `compression` use the same names as the REST API. See [Conversion Parameters](https://pdfbolt.com/docs/parameters) for the full parameter reference.

## CommonJS

Use `require()` if your Node.js project uses CommonJS.

```js
const { PDFBolt } = require('@pdfbolt/node');

const pdfbolt = new PDFBolt({
  apiKey: process.env.PDFBOLT_API_KEY
});
```

## Usage

Use `pdfbolt.usage.get()` to read the current account plan, remaining conversion credits, and rate-limit metadata.

```ts
const usage = await pdfbolt.usage.get();

console.log(usage.plan);
console.log(usage.recurring);
console.log(usage.oneTime);
console.log(usage.rateLimit.day.remaining);
```

## SDK Reference

Main client methods:

```ts
pdfbolt.direct.convert(...)
pdfbolt.direct.fromUrl(...)
pdfbolt.direct.fromHtml(...)
pdfbolt.direct.fromTemplate(...)

pdfbolt.sync.convert(...)
pdfbolt.sync.fromUrl(...)
pdfbolt.sync.fromHtml(...)
pdfbolt.sync.fromTemplate(...)

pdfbolt.asyncConversions.convert(...)
pdfbolt.asyncConversions.fromUrl(...)
pdfbolt.asyncConversions.fromHtml(...)
pdfbolt.asyncConversions.fromTemplate(...)

pdfbolt.usage.get(...)
```

Webhook helpers:

```ts
PDFBolt.webhooks.verifySignature(...)
PDFBolt.webhooks.verifyAndParse(...)

webhooks.verifySignature(...)
webhooks.verifyAndParse(...)
```

Common runtime exports:

```ts
PDFBolt
DirectConversionResult
VERSION
webhooks
```

TypeScript type exports include conversion requests, conversion results, webhook events, rate-limit metadata, cookies, margins, dimensions, and other REST API parameter types.
