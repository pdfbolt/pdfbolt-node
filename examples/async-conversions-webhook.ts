import { createServer } from 'node:http';
import { PDFBolt } from '../src/index.js';

const webhookSecret = process.env.PDFBOLT_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error('Set PDFBOLT_WEBHOOK_SECRET before running this example.');
}

createServer(async (request, response) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks);
  const signature = request.headers['x-pdfbolt-signature'];

  try {
    const event = PDFBolt.webhooks.verifyAndParse({
      rawBody,
      signature,
      secret: webhookSecret
    });

    console.log(`Received ${event.status} for ${event.requestId}`);
    response.writeHead(200).end('ok');
  } catch {
    response.writeHead(400).end('invalid signature');
  }
}).listen(3000, () => {
  console.log('Listening on http://localhost:3000');
});
