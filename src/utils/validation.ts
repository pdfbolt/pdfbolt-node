import { PDFBoltValidationError } from '../errors.js';

export function requireStringField(params: unknown, fieldName: string, methodName: string): string {
  const value = readField(params, fieldName, methodName);

  if (typeof value !== 'string') {
    throw new PDFBoltValidationError(`${fieldName} is required when using ${methodName}().`);
  }

  return value;
}

export function requireObjectField(params: unknown, fieldName: string, methodName: string): Record<string, unknown> {
  const value = readField(params, fieldName, methodName);

  if (!isObjectRecord(value)) {
    throw new PDFBoltValidationError(`${fieldName} must be an object when using ${methodName}().`);
  }

  return value;
}

function readField(params: unknown, fieldName: string, methodName: string): unknown {
  if (!isObjectRecord(params)) {
    throw new PDFBoltValidationError(`Parameters object is required when using ${methodName}().`);
  }

  return params[fieldName];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
