/**
 * Request timeout middleware
 */

import { NextFunction, Request, Response } from 'express';

/**
 * Add request timeout handling
 */
export function requestTimeout(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout for the request
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        req.log.warn(
          {
            reqId: req.id,
            timeoutMs,
            timeout: true,
          },
          'Request timeout'
        );

        const error = new Error('Request timeout');
        next(error);
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    // Clear timeout when response is closed
    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}
