/**
 * Global error handling middleware
 */

import { NextFunction, Request, Response } from 'express';
import { createErrorResponse, isCacheError } from '../core/errors';
import { recordBackpressure } from '../metrics';

/**
 * Global error handler middleware
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log error with request context
  req.log.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      reqId: req.id,
    },
    'Request error'
  );

  // Handle known cache errors
  if (isCacheError(error)) {
    const response = createErrorResponse(error);
    res.status(error.statusCode).json(response);
    return;
  }

  // Handle backpressure errors
  if ((error as any).statusCode === 503) {
    recordBackpressure('service_overloaded');
    res
      .status(503)
      .header('Retry-After', (error as any).retryAfter || '1')
      .json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily overloaded',
        },
      });
    return;
  }

  // Handle validation errors (from zod or custom validators)
  if (error.name === 'ZodError' || error.message.includes('validation')) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid request data',
        details: { validation: error.message },
      },
    });
    return;
  }

  // Handle JSON parsing errors
  if (error.name === 'SyntaxError' && 'body' in error) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid JSON in request body',
      },
    });
    return;
  }

  // Handle request timeout
  if (error.message === 'Request timeout') {
    res.status(408).json({
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'Request timed out',
      },
    });
    return;
  }

  // Default to internal server error
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Internal server error',
    },
  });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
