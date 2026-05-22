import { PDFBolt } from '../src/index.js';

const apiKey = process.env.PDFBOLT_API_KEY;

if (!apiKey) {
  throw new Error('Set PDFBOLT_API_KEY before running this example.');
}

const pdfbolt = new PDFBolt({ apiKey });

const pdf = await pdfbolt.direct.fromUrl({
  url: 'https://example.com',
  printBackground: true
});

await pdf.save('example.pdf');

console.log(`Saved example.pdf (${pdf.size} bytes)`);
