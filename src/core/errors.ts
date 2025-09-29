/**
 * Error handling utilities and custom error classes
 */

export type ErrorCode =
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export interface ErrorDetails {
  [key: string]: unknown;
}

export class CacheError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.details = details;
    this.statusCode = this.getStatusCode(code);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }

  private getStatusCode(code: ErrorCode): number {
    switch (code) {
      case 'CONFLICT':
        return 409;
      case 'NOT_FOUND':
        return 404;
      case 'BAD_REQUEST':
        return 400;
      case 'PAYLOAD_TOO_LARGE':
        return 413;
      case 'UNAUTHORIZED':
        return 401;
      case 'INTERNAL':
        return 500;
      default:
        return 500;
    }
  }
}

export class ConflictError extends CacheError {
  constructor(message: string, details?: ErrorDetails) {
    super('CONFLICT', message, details);
  }
}

export class NotFoundError extends CacheError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', message);
  }
}

export class BadRequestError extends CacheError {
  constructor(message: string, details?: ErrorDetails) {
    super('BAD_REQUEST', message, details);
  }
}

export class PayloadTooLargeError extends CacheError {
  constructor(message: string = 'Payload too large', details?: ErrorDetails) {
    super('PAYLOAD_TOO_LARGE', message, details);
  }
}

export class UnauthorizedError extends CacheError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message);
  }
}

export class InternalError extends CacheError {
  constructor(message: string = 'Internal server error', details?: ErrorDetails) {
    super('INTERNAL', message, details);
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(error: CacheError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  };
}

/**
 * Check if an error is a CacheError
 */
export function isCacheError(error: unknown): error is CacheError {
  return error instanceof CacheError;
}
