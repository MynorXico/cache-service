/**
 * Unit tests for batch operations in the cache store
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CacheStore } from '../src/core/store.js';

describe('Batch Operations', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore(4, 1024 * 1024, undefined, 100, 100);
  });

  afterEach(() => {
    store.shutdown();
  });

  describe('Batch Get', () => {
    beforeEach(async () => {
      // Set up test data across different shards
      const testData = [
        { key: 'user:1', value: { id: 1, name: 'Alice' } },
        { key: 'user:2', value: { id: 2, name: 'Bob' } },
        { key: 'counter:views', value: 1000 },
        { key: 'config:theme', value: 'dark' },
        { key: 'flag:enabled', value: true },
      ];

      for (const item of testData) {
        await store.set(item.key, item.value);
      }
    });

    it('should retrieve multiple existing keys', async () => {
      const result = await store.batchGet({
        keys: ['user:1', 'user:2', 'counter:views'],
      });

      expect(result.hits).toHaveLength(3);
      expect(result.misses).toHaveLength(0);

      const hitKeys = result.hits.map((h) => h.key).sort();
      expect(hitKeys).toEqual(['counter:views', 'user:1', 'user:2']);

      // Verify data integrity
      const user1 = result.hits.find((h) => h.key === 'user:1');
      expect(user1?.value).toEqual({ id: 1, name: 'Alice' });
      expect(user1?.type).toBe('json');
    });

    it('should handle mix of existing and non-existing keys', async () => {
      const result = await store.batchGet({
        keys: ['user:1', 'non-existent', 'counter:views', 'another-missing'],
      });

      expect(result.hits).toHaveLength(2);
      expect(result.misses).toHaveLength(2);
      expect(result.misses.sort()).toEqual(['another-missing', 'non-existent']);

      const hitKeys = result.hits.map((h) => h.key).sort();
      expect(hitKeys).toEqual(['counter:views', 'user:1']);
    });

    it('should handle empty key list', async () => {
      const result = await store.batchGet({ keys: [] });

      expect(result.hits).toHaveLength(0);
      expect(result.misses).toHaveLength(0);
    });

    it('should handle all non-existent keys', async () => {
      const result = await store.batchGet({
        keys: ['missing:1', 'missing:2', 'missing:3'],
      });

      expect(result.hits).toHaveLength(0);
      expect(result.misses).toHaveLength(3);
      expect(result.misses.sort()).toEqual(['missing:1', 'missing:2', 'missing:3']);
    });

    it('should handle keys distributed across shards', async () => {
      // Create keys that will hash to different shards
      const keys = Array.from({ length: 20 }, (_, i) => `shard-test:${i}`);

      // Set values for half the keys
      for (let i = 0; i < 10; i++) {
        await store.set(keys[i], `value-${i}`, 'string');
      }

      const result = await store.batchGet({ keys });

      expect(result.hits).toHaveLength(10);
      expect(result.misses).toHaveLength(10);

      // Verify all expected hits are present
      const hitKeys = result.hits.map((h) => h.key).sort();
      const expectedHits = keys.slice(0, 10).sort();
      expect(hitKeys).toEqual(expectedHits);
    });
  });

  describe('Batch Set', () => {
    it('should set multiple keys successfully', async () => {
      const items = [
        { key: 'batch:1', value: 'value1' },
        { key: 'batch:2', value: 42 },
        { key: 'batch:3', value: true },
        { key: 'batch:4', value: { data: 'test' } },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(4);

      // All operations should succeed
      result.results.forEach((r) => {
        expect(r.status).toBe('created');
        expect(r.version).toBeDefined();
        expect(r.error).toBeUndefined();
      });

      // Verify data was actually stored with correct inferred types
      const expectedTypes = ['string', 'number', 'boolean', 'json'];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = await store.get(item.key);
        expect(entry?.value).toEqual(item.value);
        expect(entry?.type).toBe(expectedTypes[i]);
      }
    });

    it('should handle TTL in batch operations', async () => {
      const items = [
        { key: 'ttl:1', value: 'expires-soon', ttlSec: 3600 },
        { key: 'ttl:2', value: 'no-expiry' },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(2);
      result.results.forEach((r) => expect(r.status).toBe('created'));

      // Check TTL was applied
      const entry1 = await store.get('ttl:1');
      const entry2 = await store.get('ttl:2');

      expect(entry1?.expiresAt).toBeDefined();
      expect(entry2?.expiresAt).toBeUndefined();
    });

    it('should handle mixed success and failure scenarios', async () => {
      // First create a key
      await store.set('existing-key', 'original', 'string');

      const items = [
        { key: 'new-key', value: 'new-value', type: 'string' as const },
        { key: 'existing-key', value: 'updated', type: 'string' as const },
        { key: 'another-new', value: 123, type: 'number' as const },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(3);

      // Should have mix of created and updated statuses
      const statuses = result.results.map((r) => r.status);
      expect(statuses).toContain('created');

      // All should succeed (no errors expected in this scenario)
      result.results.forEach((r) => {
        expect(r.error).toBeUndefined();
        expect(r.version).toBeDefined();
      });
    });

    it('should maintain result order matching input order', async () => {
      const items = [
        { key: 'order:3', value: 'third', type: 'string' as const },
        { key: 'order:1', value: 'first', type: 'string' as const },
        { key: 'order:2', value: 'second', type: 'string' as const },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].key).toBe('order:3');
      expect(result.results[1].key).toBe('order:1');
      expect(result.results[2].key).toBe('order:2');
    });
  });

  describe('Batch Delete', () => {
    beforeEach(async () => {
      // Set up test data
      const keys = ['delete:1', 'delete:2', 'delete:3', 'delete:4'];
      for (const key of keys) {
        await store.set(key, `value-${key}`, 'string');
      }
    });

    it('should delete multiple existing keys', async () => {
      const result = await store.batchDelete({
        keys: ['delete:1', 'delete:2', 'delete:3'],
      });

      expect(result.results).toHaveLength(3);

      result.results.forEach((r) => {
        expect(r.status).toBe('deleted');
        expect(r.error).toBeUndefined();
      });

      // Verify keys were actually deleted
      for (const key of ['delete:1', 'delete:2', 'delete:3']) {
        const entry = await store.get(key);
        expect(entry).toBeUndefined();
      }

      // Verify remaining key still exists
      const remaining = await store.get('delete:4');
      expect(remaining).toBeDefined();
    });

    it('should handle mix of existing and non-existing keys', async () => {
      const result = await store.batchDelete({
        keys: ['delete:1', 'non-existent', 'delete:2'],
      });

      expect(result.results).toHaveLength(3);

      const statuses = result.results.map((r) => ({ key: r.key, status: r.status }));
      expect(statuses).toContainEqual({ key: 'delete:1', status: 'deleted' });
      expect(statuses).toContainEqual({ key: 'non-existent', status: 'missing' });
      expect(statuses).toContainEqual({ key: 'delete:2', status: 'deleted' });
    });

    it('should handle all non-existent keys', async () => {
      const result = await store.batchDelete({
        keys: ['missing:1', 'missing:2', 'missing:3'],
      });

      expect(result.results).toHaveLength(3);
      result.results.forEach((r) => {
        expect(r.status).toBe('missing');
        expect(r.error).toBeUndefined();
      });
    });

    it('should maintain result order matching input order', async () => {
      const keys = ['delete:3', 'delete:1', 'non-existent', 'delete:2'];

      const result = await store.batchDelete({ keys });

      expect(result.results).toHaveLength(4);
      expect(result.results[0].key).toBe('delete:3');
      expect(result.results[1].key).toBe('delete:1');
      expect(result.results[2].key).toBe('non-existent');
      expect(result.results[3].key).toBe('delete:2');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle large batch operations efficiently', async () => {
      const batchSize = 100;
      const items = Array.from({ length: batchSize }, (_, i) => ({
        key: `perf:${i}`,
        value: `value-${i}`,
        type: 'string' as const,
      }));

      const startTime = Date.now();
      const result = await store.batchSet({ items });
      const duration = Date.now() - startTime;

      expect(result.results).toHaveLength(batchSize);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      // Verify all were successful
      result.results.forEach((r) => {
        expect(r.status).toBe('created');
        expect(r.error).toBeUndefined();
      });
    });

    it('should handle concurrent batch operations', async () => {
      const batch1 = Array.from({ length: 50 }, (_, i) => ({
        key: `concurrent:a:${i}`,
        value: `value-a-${i}`,
        type: 'string' as const,
      }));

      const batch2 = Array.from({ length: 50 }, (_, i) => ({
        key: `concurrent:b:${i}`,
        value: `value-b-${i}`,
        type: 'string' as const,
      }));

      // Run both batches concurrently
      const [result1, result2] = await Promise.all([
        store.batchSet({ items: batch1 }),
        store.batchSet({ items: batch2 }),
      ]);

      expect(result1.results).toHaveLength(50);
      expect(result2.results).toHaveLength(50);

      // All operations should succeed
      [...result1.results, ...result2.results].forEach((r) => {
        expect(r.status).toBe('created');
        expect(r.error).toBeUndefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty batch operations', async () => {
      const setResult = await store.batchSet({ items: [] });
      const getResult = await store.batchGet({ keys: [] });
      const deleteResult = await store.batchDelete({ keys: [] });

      expect(setResult.results).toHaveLength(0);
      expect(getResult.hits).toHaveLength(0);
      expect(getResult.misses).toHaveLength(0);
      expect(deleteResult.results).toHaveLength(0);
    });

    it('should handle duplicate keys in batch operations', async () => {
      const items = [
        { key: 'duplicate', value: 'first', type: 'string' as const },
        { key: 'duplicate', value: 'second', type: 'string' as const },
        { key: 'unique', value: 'unique-value', type: 'string' as const },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(3);

      // The final value should be from the last operation
      const entry = await store.get('duplicate');
      expect(entry?.value).toBe('second');
    });

    it('should handle mixed value types in batch operations', async () => {
      const items = [
        { key: 'mixed:string', value: 'text', type: 'string' as const },
        { key: 'mixed:number', value: 42, type: 'number' as const },
        { key: 'mixed:boolean', value: false, type: 'boolean' as const },
        { key: 'mixed:json', value: { nested: { data: true } }, type: 'json' as const },
      ];

      const result = await store.batchSet({ items });

      expect(result.results).toHaveLength(4);
      result.results.forEach((r) => expect(r.status).toBe('created'));

      // Verify type preservation
      for (const item of items) {
        const entry = await store.get(item.key);
        expect(entry?.value).toEqual(item.value);
        expect(entry?.type).toBe(item.type);
      }
    });
  });
});
