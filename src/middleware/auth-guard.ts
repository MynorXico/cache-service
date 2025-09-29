/**
 * Authentication middleware for API token validation
 */

import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../core/errors';
import { recordAuthFailure } from '../metrics';

/**
 * Authentication guard middleware
 */
export function authGuard(apiToken: string, readRequiresAuth: boolean = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const isReadOperation = req.method === 'GET';

    // Skip auth for read operations if not required
    if (isReadOperation && !readRequiresAuth) {
      next();
      return;
    }

    // Skip auth for health endpoints
    if (req.path === '/healthz' || req.path === '/readyz' || req.path === '/metrics') {
      next();
      return;
    }

    // Get token from header
    const providedToken = req.headers['x-api-token'] as string;

    if (!providedToken) {
      recordAuthFailure('missing_token');
      req.log.warn(
        {
          reqId: req.id,
          path: req.path,
          method: req.method,
        },
        'Missing API token'
      );

      throw new UnauthorizedError('Missing X-API-Token header');
    }

    if (providedToken !== apiToken) {
      recordAuthFailure('invalid_token');
      req.log.warn(
        {
          reqId: req.id,
          path: req.path,
          method: req.method,
        },
        'Invalid API token'
      );

      throw new UnauthorizedError('Invalid API token');
    }

    next();
  };
}
