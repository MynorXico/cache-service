/**
 * Input validation using Zod schemas
 */

import { z } from 'zod';
import { ValueType } from './types';
import { BadRequestError } from './errors';

// Value type validation
export const ValueTypeSchema = z.enum(['string', 'number', 'boolean', 'json', 'bytes']);

// Base schemas for common patterns
export const KeySchema = z.string().min(1).max(250);
export const VersionSchema = z.string().min(1);
export const TTLSchema = z.number().int().min(0).max(2147483647); // Max 32-bit int

// Set request validation
export const SetRequestSchema = z.object({
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ]),
  ttlSec: TTLSchema.optional(),
});

// Batch operations
export const BatchGetRequestSchema = z.object({
  keys: z.array(KeySchema).min(1).max(100), // Limit batch size
});

export const BatchSetItemSchema = z.object({
  key: KeySchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ]),
  ttlSec: TTLSchema.optional(),
});

export const BatchSetRequestSchema = z.object({
  items: z.array(BatchSetItemSchema).min(1).max(100),
});

export const BatchDeleteRequestSchema = z.object({
  keys: z.array(KeySchema).min(1).max(100),
});

// Increment request
export const IncrRequestSchema = z.object({
  key: KeySchema,
  delta: z.number().int().min(-2147483648).max(2147483647),
});

// Query parameters
export const GetQuerySchema = z.object({
  includeMeta: z.enum(['true', 'false']).optional().default('false'),
});

/**
 * Infer the type of a JavaScript value
 */
export function inferValueType(value: unknown): ValueType {
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (
    value !== null &&
    value !== undefined &&
    (typeof value === 'object' || Array.isArray(value))
  ) {
    return 'json';
  }
  // Default to string for null, undefined, or other edge cases
  return 'string';
}

/**
 * Validate and parse a value based on its inferred type
 */
export function validateInferredValue(value: unknown): { value: unknown; type: ValueType } {
  const type = inferValueType(value);
  const validatedValue = validateValueType(value, type);
  return { value: validatedValue, type };
}

/**
 * Validate and parse a value based on its declared type
 */
export function validateValueType(value: unknown, type: ValueType): unknown {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new BadRequestError(`Expected string, got ${typeof value}`);
      }
      return value;

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestError(`Expected finite number, got ${typeof value}`);
      }
      return value;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new BadRequestError(`Expected boolean, got ${typeof value}`);
      }
      return value;

    case 'json':
      if (value === null || value === undefined) {
        throw new BadRequestError('JSON value cannot be null or undefined');
      }
      if (typeof value !== 'object' && !Array.isArray(value)) {
        throw new BadRequestError(`Expected object or array for JSON type, got ${typeof value}`);
      }
      return value;

    case 'bytes':
      if (typeof value !== 'string') {
        throw new BadRequestError('Bytes value must be a base64 string');
      }
      try {
        return Buffer.from(value, 'base64');
      } catch (error) {
        throw new BadRequestError('Invalid base64 string for bytes type');
      }

    default:
      throw new BadRequestError(`Unknown value type: ${type}`);
  }
}

/**
 * Calculate the size in bytes of a cache value
 */
export function calculateValueSize(value: unknown, type: ValueType): number {
  switch (type) {
    case 'string':
      return Buffer.byteLength(value as string, 'utf8');

    case 'number':
      return 8; // 64-bit number

    case 'boolean':
      return 1;

    case 'json':
      return Buffer.byteLength(JSON.stringify(value), 'utf8');

    case 'bytes':
      return (value as Buffer).length;

    default:
      return 0;
  }
}

/**
 * Serialize a value for storage
 */
export function serializeValue(value: unknown, type: ValueType): unknown {
  switch (type) {
    case 'bytes':
      // Convert Buffer to base64 for JSON serialization
      return (value as Buffer).toString('base64');
    default:
      return value;
  }
}

/**
 * Deserialize a value from storage
 */
export function deserializeValue(value: unknown, type: ValueType): unknown {
  switch (type) {
    case 'bytes':
      // Convert base64 back to Buffer
      return Buffer.from(value as string, 'base64');
    default:
      return value;
  }
}
