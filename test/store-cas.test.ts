/**
 * Unit tests for CAS (Compare-And-Swap) operations in the cache store
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CacheStore } from '../src/core/store.js';
import { ConflictError } from '../src/core/errors.js';

describe('CacheStore CAS Operations', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = new CacheStore(2, 1024 * 1024, undefined, 100, 100);
  });

  afterEach(() => {
    store.shutdown();
  });

  describe('If-None-Match (Create Only)', () => {
    it('should create new key with If-None-Match: *', async () => {
      const result = await store.set('new-key', 'value', undefined, undefined, true);

      expect(result.version).toBeDefined();

      const entry = await store.get('new-key');
      expect(entry?.value).toBe('value');
      expect(entry?.version).toBe(result.version);
    });

    it('should fail to create existing key with If-None-Match: *', async () => {
      // First create the key
      await store.set('existing-key', 'original');

      // Try to create again with If-None-Match
      await expect(
        store.set('existing-key', 'new-value', undefined, undefined, true)
      ).rejects.toThrow(ConflictError);

      // Original value should remain
      const entry = await store.get('existing-key');
      expect(entry?.value).toBe('original');
    });
  });

  describe('If-Match (Conditional Update)', () => {
    it('should update key with correct version', async () => {
      // Create initial key
      const createResult = await store.set('test-key', 'original');

      // Update with correct version
      const updateResult = await store.set(
        'test-key',
        'updated',
        undefined,
        createResult.version
      );

      expect(updateResult.version).not.toBe(createResult.version);

      const entry = await store.get('test-key');
      expect(entry?.value).toBe('updated');
      expect(entry?.version).toBe(updateResult.version);
    });

    it('should fail to update with incorrect version', async () => {
      // Create initial key
      const createResult = await store.set('test-key', 'original');

      // Try to update with wrong version
      await expect(
        store.set('test-key', 'updated', undefined, 'wrong-version')
      ).rejects.toThrow(ConflictError);

      // Original value should remain
      const entry = await store.get('test-key');
      expect(entry?.value).toBe('original');
      expect(entry?.version).toBe(createResult.version);
    });

    it('should fail to update non-existent key with If-Match', async () => {
      await expect(
        store.set('non-existent', 'value', undefined, 'some-version')
      ).rejects.toThrow(ConflictError);
    });

    it('should provide detailed error information on version mismatch', async () => {
      const createResult = await store.set('test-key', 'original');

      try {
        await store.set('test-key', 'updated', undefined, 'wrong-version');
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        const conflictError = error as ConflictError;
        expect(conflictError.details).toEqual({
          key: 'test-key',
          expected: 'wrong-version',
          actual: createResult.version,
        });
      }
    });
  });

  describe('Delete with If-Match', () => {
    it('should delete key with correct version', async () => {
      const createResult = await store.set('test-key', 'value');

      const deleted = await store.delete('test-key', createResult.version);
      expect(deleted).toBe(true);

      const entry = await store.get('test-key');
      expect(entry).toBeUndefined();
    });

    it('should fail to delete with incorrect version', async () => {
      const createResult = await store.set('test-key', 'value');

      await expect(store.delete('test-key', 'wrong-version')).rejects.toThrow(ConflictError);

      // Key should still exist
      const entry = await store.get('test-key');
      expect(entry?.value).toBe('value');
      expect(entry?.version).toBe(createResult.version);
    });

    it('should delete without version check when no If-Match provided', async () => {
      await store.set('test-key', 'value');

      const deleted = await store.delete('test-key');
      expect(deleted).toBe(true);

      const entry = await store.get('test-key');
      expect(entry).toBeUndefined();
    });
  });

  describe('Concurrent CAS Operations', () => {
    it('should handle concurrent updates correctly', async () => {
      const createResult = await store.set('concurrent-key', 'original');

      // Start two concurrent updates with the same version
      const update1Promise = store.set(
        'concurrent-key',
        'update1',
        undefined,
        createResult.version
      );

      const update2Promise = store.set(
        'concurrent-key',
        'update2',
        undefined,
        createResult.version
      );

      // One should succeed, one should fail
      const results = await Promise.allSettled([update1Promise, update2Promise]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // The failure should be a ConflictError
      const failedResult = failures[0] as PromiseRejectedResult;
      expect(failedResult.reason).toBeInstanceOf(ConflictError);
    });

    it('should handle rapid sequential updates', async () => {
      let currentVersion = (await store.set('rapid-key', 'v0')).version;

      // Perform 10 sequential updates
      for (let i = 1; i <= 10; i++) {
        const result = await store.set('rapid-key', `v${i}`, undefined, currentVersion);
        currentVersion = result.version;
      }

      const finalEntry = await store.get('rapid-key');
      expect(finalEntry?.value).toBe('v10');
      expect(finalEntry?.version).toBe(currentVersion);
    });
  });

  describe('Version Generation', () => {
    it('should generate unique versions for each update', async () => {
      const versions = new Set<string>();

      // Create and update the same key multiple times
      let currentVersion = (await store.set('version-test', 'v1')).version;
      versions.add(currentVersion);

      for (let i = 2; i <= 5; i++) {
        const result = await store.set(
          'version-test',
          `v${i}`,
          undefined,
          currentVersion
        );
        versions.add(result.version);
        currentVersion = result.version;
      }

      // All versions should be unique
      expect(versions.size).toBe(5);
    });

    it('should generate different versions for different keys', async () => {
      const result1 = await store.set('key1', 'value1');
      const result2 = await store.set('key2', 'value2');

      expect(result1.version).not.toBe(result2.version);
    });
  });

  describe('CAS with TTL', () => {
    it('should update TTL with CAS operation', async () => {
      const createResult = await store.set('ttl-key', 'value', 60);

      // Update with new TTL
      const updateResult = await store.set(
        'ttl-key',
        'updated',
        120,
        createResult.version
      );

      expect(updateResult.expiresAt).toBeDefined();
      expect(updateResult.expiresAt).toBeGreaterThan(createResult.expiresAt || 0);
    });

    it('should handle CAS operations on expired keys', async () => {
      // Create key with very short TTL
      const createResult = await store.set('expiring-key', 'value', 0.001);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to update expired key
      await expect(
        store.set('expiring-key', 'updated', undefined, createResult.version)
      ).rejects.toThrow(ConflictError);
    });
  });
});
