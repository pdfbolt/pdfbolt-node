import { PDFBolt } from '../src/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;

if (!apiKey) {
  throw new Error('Set PDFBOLT_API_KEY before running this example.');
}

const pdfbolt = new PDFBolt({ apiKey });

const pdf = await pdfbolt.direct.fromHtml({
  html: '<html><body><h1>Invoice #1042</h1><p>Amount: $250.00</p></body></html>',
  format: 'A4',
  printBackground: true
});

await pdf.save('invoice.pdf');

console.log(`Saved invoice.pdf (${pdf.size} bytes)`);
