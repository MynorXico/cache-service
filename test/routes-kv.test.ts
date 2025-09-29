/**
 * Integration tests for KV API routes
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CacheServer } from '../src/server.js';
import { CacheConfig } from '../src/core/types.js';

describe('KV API Routes', () => {
  let server: CacheServer;
  let app: any;

  const testConfig: CacheConfig = {
    port: 0, // Use random port for testing
    apiToken: 'test-token',
    readRequiresAuth: false,
    shards: 2,
    maxItemBytes: 1024 * 1024,
    memoryBudgetBytes: undefined,
    requestTimeoutMs: 5000,
    maxInflight: 100,
    maxShardMailbox: 100,
    logLevel: 'error', // Reduce noise in tests
    enableSwagger: false,
  };

  beforeEach(() => {
    server = new CacheServer(testConfig);
    app = server.getApp();
  });

  afterEach(() => {
    server.getStore().shutdown();
  });

  describe('PUT /v1/kv/:key', () => {
    it('should create a new key', async () => {
      const response = await request(app)
        .put('/v1/kv/test-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: 'test-value',
        });

      expect(response.status).toBe(201);
      expect(response.body.version).toBeDefined();
      expect(response.body.expiresAt).toBeUndefined();
    });

    it('should update an existing key', async () => {
      // Create key first
      const createResponse = await request(app)
        .put('/v1/kv/test-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: 'original-value',
        });

      // Update the key
      const updateResponse = await request(app)
        .put('/v1/kv/test-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: 'updated-value',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.version).not.toBe(createResponse.body.version);
    });

    it('should create key with TTL', async () => {
      const response = await request(app)
        .put('/v1/kv/ttl-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: 'ttl-value',
          ttlSec: 3600,
        });

      expect(response.status).toBe(201);
      expect(response.body.expiresAt).toBeDefined();
    });

    it('should handle If-None-Match for create-only', async () => {
      const response = await request(app)
        .put('/v1/kv/create-only-key')
        .set('X-API-Token', 'test-token')
        .set('If-None-Match', '*')
        .send({
          value: 'create-value',
        });

      expect(response.status).toBe(201);

      // Try to create again - should fail
      const conflictResponse = await request(app)
        .put('/v1/kv/create-only-key')
        .set('X-API-Token', 'test-token')
        .set('If-None-Match', '*')
        .send({
          value: 'another-value',
        });

      expect(conflictResponse.status).toBe(409);
      expect(conflictResponse.body.error.code).toBe('CONFLICT');
    });

    it('should handle If-Match for conditional update', async () => {
      // Create key first
      const createResponse = await request(app)
        .put('/v1/kv/conditional-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: 'original',
        });

      // Update with correct version
      const updateResponse = await request(app)
        .put('/v1/kv/conditional-key')
        .set('X-API-Token', 'test-token')
        .set('If-Match', createResponse.body.version)
        .send({
          value: 'updated',
        });

      expect(updateResponse.status).toBe(200);

      // Try to update with old version - should fail
      const conflictResponse = await request(app)
        .put('/v1/kv/conditional-key')
        .set('X-API-Token', 'test-token')
        .set('If-Match', createResponse.body.version)
        .send({
          value: 'conflict',
        });

      expect(conflictResponse.status).toBe(409);
    });

    it('should require authentication for write operations', async () => {
      const response = await request(app).put('/v1/kv/auth-test').send({
        value: 'test',
      });

      expect(response.status).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .put('/v1/kv/invalid-key')
        .set('X-API-Token', 'test-token')
        .send({
          // Missing required 'value' field - this should trigger validation error
          ttlSec: 3600
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /v1/kv/:key', () => {
    beforeEach(async () => {
      // Set up test data
      await request(app).put('/v1/kv/existing-key').set('X-API-Token', 'test-token').send({
        value: 'existing-value',
        ttlSec: 3600,
      });
    });

    it('should retrieve existing key', async () => {
      const response = await request(app).get('/v1/kv/existing-key');

      expect(response.status).toBe(200);
      expect(response.body.value).toBe('existing-value');
      expect(response.body.type).toBe('string');
      expect(response.body.version).toBeDefined();
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app).get('/v1/kv/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should include metadata when requested', async () => {
      const response = await request(app).get('/v1/kv/existing-key?includeMeta=true');

      expect(response.status).toBe(200);
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body.ttlSec).toBeDefined();
    });

    it('should not require auth for read operations by default', async () => {
      const response = await request(app).get('/v1/kv/existing-key');

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /v1/kv/:key', () => {
    beforeEach(async () => {
      await request(app).put('/v1/kv/delete-test').set('X-API-Token', 'test-token').send({
        value: 'to-be-deleted',
      });
    });

    it('should delete existing key', async () => {
      const response = await request(app)
        .delete('/v1/kv/delete-test')
        .set('X-API-Token', 'test-token');

      expect(response.status).toBe(204);

      // Verify key is deleted
      const getResponse = await request(app).get('/v1/kv/delete-test');
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .delete('/v1/kv/non-existent')
        .set('X-API-Token', 'test-token');

      expect(response.status).toBe(404);
    });

    it('should handle conditional delete with If-Match', async () => {
      // Get current version
      const getResponse = await request(app).get('/v1/kv/delete-test');

      const response = await request(app)
        .delete('/v1/kv/delete-test')
        .set('X-API-Token', 'test-token')
        .set('If-Match', getResponse.body.version);

      expect(response.status).toBe(204);
    });
  });

  describe('POST /v1/kv/batch/get', () => {
    beforeEach(async () => {
      // Set up test data
      const keys = ['batch1', 'batch2', 'batch3'];
      for (const key of keys) {
        await request(app)
          .put(`/v1/kv/${key}`)
          .set('X-API-Token', 'test-token')
          .send({
            value: `value-${key}`,
          });
      }
    });

    it('should retrieve multiple keys', async () => {
      const response = await request(app)
        .post('/v1/kv/batch/get')
        .set('X-API-Token', 'test-token')
        .send({
          keys: ['batch1', 'batch2', 'non-existent'],
        });

      expect(response.status).toBe(200);
      expect(response.body.hits).toHaveLength(2);
      expect(response.body.misses).toEqual(['non-existent']);

      const hitKeys = response.body.hits.map((h: any) => h.key).sort();
      expect(hitKeys).toEqual(['batch1', 'batch2']);
    });

    it('should validate batch size limits', async () => {
      const largeKeyList = Array.from({ length: 101 }, (_, i) => `key${i}`);

      const response = await request(app)
        .post('/v1/kv/batch/get')
        .set('X-API-Token', 'test-token')
        .send({
          keys: largeKeyList,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /v1/kv/incr', () => {
    it('should increment new counter', async () => {
      const response = await request(app)
        .post('/v1/kv/incr')
        .set('X-API-Token', 'test-token')
        .send({
          key: 'counter',
          delta: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body.value).toBe(5);
      expect(response.body.version).toBeDefined();
    });

    it('should increment existing counter', async () => {
      // Create initial counter
      await request(app).put('/v1/kv/existing-counter').set('X-API-Token', 'test-token').send({
        value: 10,
      });

      const response = await request(app)
        .post('/v1/kv/incr')
        .set('X-API-Token', 'test-token')
        .send({
          key: 'existing-counter',
          delta: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body.value).toBe(13);
    });

    it('should handle negative deltas', async () => {
      const response = await request(app)
        .post('/v1/kv/incr')
        .set('X-API-Token', 'test-token')
        .send({
          key: 'decrement-counter',
          delta: -5,
        });

      expect(response.status).toBe(200);
      expect(response.body.value).toBe(-5);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .put('/v1/kv/malformed')
        .set('X-API-Token', 'test-token')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('should handle oversized payloads', async () => {
      const largeValue = 'x'.repeat(2 * 1024 * 1024); // 2MB

      const response = await request(app)
        .put('/v1/kv/large-key')
        .set('X-API-Token', 'test-token')
        .send({
          value: largeValue,
        });

      expect(response.status).toBe(413);
    });

    it('should handle invalid key names', async () => {
      const response = await request(app)
        .put('/v1/kv/') // Empty key
        .set('X-API-Token', 'test-token')
        .send({
          value: 'test',
        });

      expect(response.status).toBe(404); // Route not found
    });
  });
});
