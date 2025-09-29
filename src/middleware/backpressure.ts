/**
 * Backpressure middleware to prevent service overload
 */

import { NextFunction, Request, Response } from 'express';
import { activeRequestsGauge, recordBackpressure } from '../metrics';

/**
 * Track active requests and apply backpressure when overloaded
 */
export function backpressureMiddleware(maxInflight: number) {
  let activeRequests = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if we're at capacity
    if (activeRequests >= maxInflight) {
      recordBackpressure('max_inflight_exceeded');

      req.log.warn(
        {
          activeRequests,
          maxInflight,
          reqId: req.id,
        },
        'Request rejected due to backpressure'
      );

      res
        .status(503)
        .header('Retry-After', '0')
        .json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporarily overloaded',
            details: { activeRequests, maxInflight },
          },
        });
      return;
    }

    // Increment active request count
    activeRequests++;
    activeRequestsGauge.set(activeRequests);

    // Decrement when request finishes
    const cleanup = () => {
      activeRequests--;
      activeRequestsGauge.set(activeRequests);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
}
