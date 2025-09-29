/**
 * Request ID middleware for tracing requests
 */

import { NextFunction, Request, Response } from 'express';
import { ulid } from 'ulid';

/**
 * Add unique request ID to each request
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const reqId = (req.headers['x-request-id'] as string) || ulid();

  // Add to request object
  req.id = reqId;

  // Add to response headers
  res.setHeader('X-Request-ID', reqId);

  next();
}
