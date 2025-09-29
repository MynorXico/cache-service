/**
 * Health check endpoints for liveness and readiness probes
 */

import { Request, Response, Router } from 'express';
import { CacheStore } from '../core/store';
import { getMetricsRegistry } from '../metrics';

export function createHealthRoutes(store: CacheStore): Router {
  const router = Router();

  /**
   * Liveness probe - checks if the service is running
   */
  router.get('/healthz', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'cache-service',
    });
  });

  /**
   * Readiness probe - checks if the service is ready to handle requests
   */
  router.get('/readyz', (req: Request, res: Response) => {
    try {
      // Check if store is operational by getting stats
      const stats = store.getStats();

      // Service is ready if we can get stats and have shards
      const isReady = stats.shards.length > 0;

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          shards: stats.shards.length,
          totalEntries: stats.total.entries,
          memoryBytes: stats.total.memoryBytes,
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          reason: 'No shards available',
        });
      }
    } catch (error) {
      req.log.error({ error: error.message }, 'Readiness check failed');
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        reason: 'Internal error during readiness check',
      });
    }
  });

  /**
   * Prometheus metrics endpoint
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const register = getMetricsRegistry();
      const metrics = await register.metrics();

      res.set('Content-Type', register.contentType);
      res.send(metrics);
    } catch (error) {
      req.log.error({ error: error.message }, 'Failed to generate metrics');
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to generate metrics',
        },
      });
    }
  });

  return router;
}
