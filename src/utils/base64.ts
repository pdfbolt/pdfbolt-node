export function encodeBase64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64');
}
