import { PDFBoltNetworkError } from '../errors.js';

export function requireRecordResponse(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

export function requiredString(source: Record<string, unknown>, key: string, message: string): string {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (typeof value !== 'string') {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

export function requiredNonEmptyString(source: Record<string, unknown>, key: string, message: string): string {
  const value = requiredString(source, key, message);
  if (value === '') {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

export function requiredBool(source: Record<string, unknown>, key: string, message: string): boolean {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (typeof value !== 'boolean') {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

export function nullableString(source: Record<string, unknown>, key: string, message: string): string | null {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (value === null || typeof value === 'string') {
    return value;
  }

  throw new PDFBoltNetworkError(message);
}

export function nullableBool(source: Record<string, unknown>, key: string, message: string): boolean | null {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (value === null || typeof value === 'boolean') {
    return value;
  }

  throw new PDFBoltNetworkError(message);
}

export function nullableNumber(source: Record<string, unknown>, key: string, message: string): number | null {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }

  throw new PDFBoltNetworkError(message);
}

export function requiredNumber(source: Record<string, unknown>, key: string, message: string): number {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

export function requiredArray(source: Record<string, unknown>, key: string, message: string): unknown[] {
  if (!hasOwn(source, key)) {
    throw new PDFBoltNetworkError(message);
  }

  const value = source[key];
  if (!Array.isArray(value)) {
    throw new PDFBoltNetworkError(message);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}
