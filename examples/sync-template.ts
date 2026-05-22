import { PDFBolt } from '../src/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;
const templateId = process.env.PDFBOLT_TEMPLATE_ID;

if (!apiKey) {
  throw new Error('Set PDFBOLT_API_KEY before running this example.');
}

if (!templateId) {
  throw new Error('Set PDFBOLT_TEMPLATE_ID before running this example.');
}

const pdfbolt = new PDFBolt({ apiKey });

const result = await pdfbolt.sync.fromTemplate({
  templateId,
  templateData: {
    invoice_number: 'INV-2026-0112',
    total: '$250.00'
  }
});

console.log(result.documentUrl);
