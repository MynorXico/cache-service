/**
 * Unit tests for MinHeap implementation used for TTL expiration
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HeapEntry, MinHeap } from '../src/core/minheap.js';

describe('MinHeap', () => {
  let heap: MinHeap;

  beforeEach(() => {
    heap = new MinHeap();
  });

  describe('Basic Operations', () => {
    it('should start empty', () => {
      expect(heap.size).toBe(0);
      expect(heap.isEmpty).toBe(true);
      expect(heap.peek()).toBeUndefined();
      expect(heap.pop()).toBeUndefined();
    });

    it('should push and peek entries', () => {
      const entry: HeapEntry = { key: 'test', expiresAt: 1000, shard: 0 };
      heap.push(entry);

      expect(heap.size).toBe(1);
      expect(heap.isEmpty).toBe(false);
      expect(heap.peek()).toEqual(entry);
    });

    it('should pop the minimum entry', () => {
      const entry1: HeapEntry = { key: 'test1', expiresAt: 2000, shard: 0 };
      const entry2: HeapEntry = { key: 'test2', expiresAt: 1000, shard: 0 };

      heap.push(entry1);
      heap.push(entry2);

      expect(heap.pop()).toEqual(entry2); // Should return the one with earlier expiration
      expect(heap.size).toBe(1);
      expect(heap.pop()).toEqual(entry1);
      expect(heap.size).toBe(0);
    });
  });

  describe('Heap Property', () => {
    it('should maintain min-heap property with multiple entries', () => {
      const entries: HeapEntry[] = [
        { key: 'test1', expiresAt: 5000, shard: 0 },
        { key: 'test2', expiresAt: 2000, shard: 1 },
        { key: 'test3', expiresAt: 8000, shard: 0 },
        { key: 'test4', expiresAt: 1000, shard: 1 },
        { key: 'test5', expiresAt: 3000, shard: 0 },
      ];

      // Push entries in random order
      entries.forEach((entry) => heap.push(entry));

      // Pop entries - should come out in sorted order by expiresAt
      const popped: HeapEntry[] = [];
      while (!heap.isEmpty) {
        popped.push(heap.pop()!);
      }

      const expectedOrder = [1000, 2000, 3000, 5000, 8000];
      const actualOrder = popped.map((e) => e.expiresAt);
      expect(actualOrder).toEqual(expectedOrder);
    });

    it('should handle duplicate expiration times', () => {
      const entries: HeapEntry[] = [
        { key: 'test1', expiresAt: 1000, shard: 0 },
        { key: 'test2', expiresAt: 1000, shard: 1 },
        { key: 'test3', expiresAt: 1000, shard: 0 },
      ];

      entries.forEach((entry) => heap.push(entry));

      // All should have the same expiration time
      while (!heap.isEmpty) {
        expect(heap.pop()!.expiresAt).toBe(1000);
      }
    });
  });

  describe('Expired Entries', () => {
    it('should pop all expired entries', () => {
      const now = 5000;
      const entries: HeapEntry[] = [
        { key: 'expired1', expiresAt: 2000, shard: 0 },
        { key: 'expired2', expiresAt: 3000, shard: 1 },
        { key: 'future1', expiresAt: 6000, shard: 0 },
        { key: 'expired3', expiresAt: 4000, shard: 1 },
        { key: 'future2', expiresAt: 7000, shard: 0 },
      ];

      entries.forEach((entry) => heap.push(entry));

      const expired = heap.popExpired(now);

      expect(expired).toHaveLength(3);
      expect(expired.map((e) => e.key).sort()).toEqual(['expired1', 'expired2', 'expired3']);
      expect(heap.size).toBe(2); // Should have 2 future entries left

      // Remaining entries should not be expired
      const remaining = heap.toArray();
      remaining.forEach((entry) => {
        expect(entry.expiresAt).toBeGreaterThan(now);
      });
    });

    it('should return empty array when no entries are expired', () => {
      const now = 1000;
      const entries: HeapEntry[] = [
        { key: 'future1', expiresAt: 2000, shard: 0 },
        { key: 'future2', expiresAt: 3000, shard: 1 },
      ];

      entries.forEach((entry) => heap.push(entry));

      const expired = heap.popExpired(now);
      expect(expired).toEqual([]);
      expect(heap.size).toBe(2);
    });

    it('should pop all entries when all are expired', () => {
      const now = 10000;
      const entries: HeapEntry[] = [
        { key: 'expired1', expiresAt: 2000, shard: 0 },
        { key: 'expired2', expiresAt: 5000, shard: 1 },
        { key: 'expired3', expiresAt: 8000, shard: 0 },
      ];

      entries.forEach((entry) => heap.push(entry));

      const expired = heap.popExpired(now);
      expect(expired).toHaveLength(3);
      expect(heap.isEmpty).toBe(true);
    });
  });

  describe('Clear and Array Operations', () => {
    it('should clear all entries', () => {
      const entries: HeapEntry[] = [
        { key: 'test1', expiresAt: 1000, shard: 0 },
        { key: 'test2', expiresAt: 2000, shard: 1 },
      ];

      entries.forEach((entry) => heap.push(entry));
      expect(heap.size).toBe(2);

      heap.clear();
      expect(heap.size).toBe(0);
      expect(heap.isEmpty).toBe(true);
    });

    it('should return array representation', () => {
      const entries: HeapEntry[] = [
        { key: 'test1', expiresAt: 3000, shard: 0 },
        { key: 'test2', expiresAt: 1000, shard: 1 },
        { key: 'test3', expiresAt: 2000, shard: 0 },
      ];

      entries.forEach((entry) => heap.push(entry));

      const array = heap.toArray();
      expect(array).toHaveLength(3);

      // The array should contain all entries (order may vary due to heap structure)
      const keys = array.map((e) => e.key).sort();
      expect(keys).toEqual(['test1', 'test2', 'test3']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single entry', () => {
      const entry: HeapEntry = { key: 'single', expiresAt: 1000, shard: 0 };
      heap.push(entry);

      expect(heap.peek()).toEqual(entry);
      expect(heap.pop()).toEqual(entry);
      expect(heap.isEmpty).toBe(true);
    });

    it('should handle large number of entries', () => {
      const entries: HeapEntry[] = [];

      // Create 1000 entries with random expiration times
      for (let i = 0; i < 1000; i++) {
        entries.push({
          key: `test${i}`,
          expiresAt: Math.floor(Math.random() * 10000),
          shard: i % 4,
        });
      }

      entries.forEach((entry) => heap.push(entry));
      expect(heap.size).toBe(1000);

      // Pop all entries and verify they come out in sorted order
      let lastExpiration = -1;
      while (!heap.isEmpty) {
        const entry = heap.pop()!;
        expect(entry.expiresAt).toBeGreaterThanOrEqual(lastExpiration);
        lastExpiration = entry.expiresAt;
      }
    });

    it('should handle entries with same expiration time but different shards', () => {
      const entries: HeapEntry[] = [
        { key: 'test1', expiresAt: 1000, shard: 0 },
        { key: 'test2', expiresAt: 1000, shard: 1 },
        { key: 'test3', expiresAt: 1000, shard: 2 },
      ];

      entries.forEach((entry) => heap.push(entry));

      const expired = heap.popExpired(1000);
      expect(expired).toHaveLength(3);

      // Should include entries from all shards
      const shards = expired.map((e) => e.shard).sort();
      expect(shards).toEqual([0, 1, 2]);
    });
  });
});
