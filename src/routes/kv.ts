/**
 * Key-Value API routes for cache operations
 */

import { NextFunction, Request, Response, Router } from 'express';
import { CacheStore } from '../core/store';
import {
  BatchDeleteRequestSchema,
  BatchGetRequestSchema,
  BatchSetRequestSchema,
  GetQuerySchema,
  IncrRequestSchema,
  KeySchema,
  SetRequestSchema,
  VersionSchema,
} from '../core/validators';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from '../core/errors';
import { recordCasConflict, recordPayloadSize, requestDurationSeconds } from '../metrics';
import { TracingHooks } from '../logging';

export function createKvRoutes(store: CacheStore, maxItemBytes: number): Router {
  const router = Router();

  /**
   * PUT /v1/kv/{key} - Set or update a key
   */
  router.put('/v1/kv/:key', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.set');

    try {
      // Validate key parameter
      const key = KeySchema.parse(req.params.key);

      // Validate request body
      const body = SetRequestSchema.parse(req.body);

      // Check payload size
      const payloadSize = JSON.stringify(body).length;
      if (payloadSize > maxItemBytes) {
        throw new PayloadTooLargeError(`Payload size ${payloadSize} exceeds limit ${maxItemBytes}`);
      }

      // Parse conditional headers
      const ifMatch = req.headers['if-match'] as string;
      const ifNoneMatch = req.headers['if-none-match'] === '*';

      // Validate If-Match header format if provided
      if (ifMatch && !VersionSchema.safeParse(ifMatch).success) {
        throw new BadRequestError('Invalid If-Match header format');
      }

      span.addAttribute('key', key);
      span.addAttribute('hasIfMatch', !!ifMatch);
      span.addAttribute('hasIfNoneMatch', ifNoneMatch);

      // Check if this is a create vs update operation
      const existingEntry = await store.get(key);
      const isCreate = !existingEntry;

      try {
        const result = await store.set(key, body.value, body.ttlSec, ifMatch, ifNoneMatch);

        // Record metrics - we'll infer the type from the stored entry
        const entry = await store.get(key);
        recordPayloadSize('set', entry?.type || 'unknown', payloadSize);

        const duration = (Date.now() - startTime) / 1000;
        requestDurationSeconds
          .labels(req.method, '/v1/kv/:key', isCreate ? '201' : '200')
          .observe(duration);

        span.addAttribute('success', true);
        span.addAttribute('version', result.version);
        span.end(true);

        // Return appropriate status code
        const statusCode = isCreate ? 201 : 200;
        res.status(statusCode).json({
          version: result.version,
          expiresAt: result.expiresAt ? new Date(result.expiresAt).toISOString() : undefined,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          recordCasConflict('set');
        }
        throw error;
      }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/:key', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * GET /v1/kv/{key} - Get a key's value
   */
  router.get('/v1/kv/:key', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.get');

    try {
      // Validate key parameter
      const key = KeySchema.parse(req.params.key);

      // Validate query parameters
      const query = GetQuerySchema.parse(req.query);
      const includeMeta = query.includeMeta === 'true';

      span.addAttribute('key', key);
      span.addAttribute('includeMeta', includeMeta);

      const entry = await store.get(key);

      if (!entry) {
        span.end(false, 'not found');
        throw new NotFoundError(`Key '${key}' not found`);
      }

      const duration = (Date.now() - startTime) / 1000;
      requestDurationSeconds.labels(req.method, '/v1/kv/:key', '200').observe(duration);

      span.addAttribute('success', true);
      span.addAttribute('type', entry.type);
      span.end(true);

      // Build response based on includeMeta flag
      const response: any = {
        value: entry.value,
        type: entry.type,
        version: entry.version,
      };

      if (includeMeta) {
        response.createdAt = new Date(entry.createdAt).toISOString();
        response.updatedAt = new Date(entry.updatedAt).toISOString();

        if (entry.expiresAt) {
          response.expiresAt = new Date(entry.expiresAt).toISOString();
          response.ttlSec = Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
        }
      }

      res.status(200).json(response);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/:key', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * DELETE /v1/kv/{key} - Delete a key
   */
  router.delete('/v1/kv/:key', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.delete');

    try {
      // Validate key parameter
      const key = KeySchema.parse(req.params.key);

      // Parse conditional headers
      const ifMatch = req.headers['if-match'] as string;

      // Validate If-Match header format if provided
      if (ifMatch && !VersionSchema.safeParse(ifMatch).success) {
        throw new BadRequestError('Invalid If-Match header format');
      }

      span.addAttribute('key', key);
      span.addAttribute('hasIfMatch', !!ifMatch);

      try {
        const deleted = await store.delete(key, ifMatch);

        const duration = (Date.now() - startTime) / 1000;
        const statusCode = deleted ? 204 : 404;
        requestDurationSeconds
          .labels(req.method, '/v1/kv/:key', statusCode.toString())
          .observe(duration);

        span.addAttribute('success', true);
        span.addAttribute('deleted', deleted);
        span.end(true);

        if (deleted) {
          res.status(204).send();
        } else {
          throw new NotFoundError(`Key '${key}' not found`);
        }
      } catch (error) {
        if (error instanceof ConflictError) {
          recordCasConflict('delete');
        }
        throw error;
      }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/:key', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * POST /v1/kv/batch/get - Batch get multiple keys
   */
  router.post('/v1/kv/batch/get', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.batch_get');

    try {
      const body = BatchGetRequestSchema.parse(req.body);

      span.addAttribute('keyCount', body.keys.length);

      const result = await store.batchGet(body);

      const duration = (Date.now() - startTime) / 1000;
      requestDurationSeconds.labels(req.method, '/v1/kv/batch/get', '200').observe(duration);

      span.addAttribute('success', true);
      span.addAttribute('hits', result.hits.length);
      span.addAttribute('misses', result.misses.length);
      span.end(true);

      res.status(200).json(result);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/batch/get', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * POST /v1/kv/batch/set - Batch set multiple keys
   */
  router.post('/v1/kv/batch/set', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.batch_set');

    try {
      const body = BatchSetRequestSchema.parse(req.body);

      // Check total payload size
      const payloadSize = JSON.stringify(body).length;
      if (payloadSize > maxItemBytes * 10) {
        // Allow larger batch payloads
        throw new PayloadTooLargeError(`Batch payload size ${payloadSize} exceeds limit`);
      }

      span.addAttribute('itemCount', body.items.length);

      const result = await store.batchSet(body);

      // Record metrics for each item - we'll use inferred types
      for (const item of body.items) {
        // Get the stored entry to find the inferred type
        const entry = await store.get(item.key);
        recordPayloadSize('batch_set', entry?.type || 'unknown', JSON.stringify(item.value).length);
      }

      const duration = (Date.now() - startTime) / 1000;
      requestDurationSeconds.labels(req.method, '/v1/kv/batch/set', '200').observe(duration);

      span.addAttribute('success', true);
      span.end(true);

      res.status(200).json(result);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/batch/set', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * POST /v1/kv/batch/delete - Batch delete multiple keys
   */
  router.post('/v1/kv/batch/delete', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.batch_delete');

    try {
      const body = BatchDeleteRequestSchema.parse(req.body);

      span.addAttribute('keyCount', body.keys.length);

      const result = await store.batchDelete(body);

      const duration = (Date.now() - startTime) / 1000;
      requestDurationSeconds.labels(req.method, '/v1/kv/batch/delete', '200').observe(duration);

      span.addAttribute('success', true);
      span.end(true);

      res.status(200).json(result);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/batch/delete', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  /**
   * POST /v1/kv/incr - Atomic increment operation
   */
  router.post('/v1/kv/incr', async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const span = new TracingHooks(req.log).startSpan('cache.increment');

    try {
      const body = IncrRequestSchema.parse(req.body);

      span.addAttribute('key', body.key);
      span.addAttribute('delta', body.delta);

      const result = await store.increment(body.key, body.delta);

      const duration = (Date.now() - startTime) / 1000;
      requestDurationSeconds.labels(req.method, '/v1/kv/incr', '200').observe(duration);

      span.addAttribute('success', true);
      span.addAttribute('newValue', result.value);
      span.end(true);

      res.status(200).json(result);
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = (error as any).statusCode || 500;
      requestDurationSeconds
        .labels(req.method, '/v1/kv/incr', statusCode.toString())
        .observe(duration);

      span.end(false, (error as Error).message);
      next(error);
    }
  });

  return router;
}
