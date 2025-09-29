/**
 * Unit tests for Size-Aware LRU cache implementation
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SizeAwareLRU } from '../src/core/lru.js';

describe('SizeAwareLRU', () => {
  let lru: SizeAwareLRU<string>;

  beforeEach(() => {
    lru = new SizeAwareLRU<string>(3, 100); // capacity: 3, maxSize: 100 bytes
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      const evicted = lru.set('key1', 'value1', 10);
      expect(evicted).toEqual([]);
      expect(lru.get('key1')).toBe('value1');
      expect(lru.length).toBe(1);
      expect(lru.memoryBytes).toBe(10);
    });

    it('should return undefined for non-existent keys', () => {
      expect(lru.get('nonexistent')).toBeUndefined();
    });

    it('should update existing keys', () => {
      lru.set('key1', 'value1', 10);
      const evicted = lru.set('key1', 'updated', 15);
      expect(evicted).toEqual([]);
      expect(lru.get('key1')).toBe('updated');
      expect(lru.length).toBe(1);
      expect(lru.memoryBytes).toBe(15);
    });

    it('should delete keys', () => {
      lru.set('key1', 'value1', 10);
      expect(lru.delete('key1')).toBe(true);
      expect(lru.get('key1')).toBeUndefined();
      expect(lru.length).toBe(0);
      expect(lru.memoryBytes).toBe(0);
    });

    it('should return false when deleting non-existent keys', () => {
      expect(lru.delete('nonexistent')).toBe(false);
    });

    it('should check if keys exist', () => {
      lru.set('key1', 'value1', 10);
      expect(lru.has('key1')).toBe(true);
      expect(lru.has('nonexistent')).toBe(false);
    });
  });

  describe('LRU Eviction by Count', () => {
    it('should evict least recently used item when capacity exceeded', () => {
      lru.set('key1', 'value1', 10);
      lru.set('key2', 'value2', 10);
      lru.set('key3', 'value3', 10);

      // This should evict key1 (least recently used)
      const evicted = lru.set('key4', 'value4', 10);
      expect(evicted).toEqual(['value1']);
      expect(lru.length).toBe(3);
      expect(lru.get('key1')).toBeUndefined();
      expect(lru.get('key4')).toBe('value4');
    });

    it('should update LRU order on access', () => {
      lru.set('key1', 'value1', 10);
      lru.set('key2', 'value2', 10);
      lru.set('key3', 'value3', 10);

      // Access key1 to make it most recently used
      lru.get('key1');

      // This should evict key2 (now least recently used)
      const evicted = lru.set('key4', 'value4', 10);
      expect(evicted).toEqual(['value2']);
      expect(lru.get('key1')).toBe('value1');
      expect(lru.get('key2')).toBeUndefined();
    });
  });

  describe('Size-Aware Eviction', () => {
    it('should evict items when memory limit exceeded', () => {
      const largeLru = new SizeAwareLRU<string>(10, 50); // Large capacity, small memory limit

      largeLru.set('key1', 'value1', 20);
      largeLru.set('key2', 'value2', 20);

      // This should evict key1 to make room
      const evicted = largeLru.set('key3', 'value3', 20);
      expect(evicted).toEqual(['value1']);
      expect(largeLru.memoryBytes).toBe(40);
      expect(largeLru.get('key1')).toBeUndefined();
    });

    it('should evict multiple items if necessary', () => {
      const largeLru = new SizeAwareLRU<string>(10, 50);

      largeLru.set('key1', 'value1', 15);
      largeLru.set('key2', 'value2', 15);
      largeLru.set('key3', 'value3', 15);

      // This should evict key1 and key2 to make room for 30 bytes
      const evicted = largeLru.set('key4', 'value4', 30);
      expect(evicted).toHaveLength(2);
      expect(evicted).toContain('value1');
      expect(evicted).toContain('value2');
      expect(largeLru.memoryBytes).toBe(45);
    });
  });

  describe('LRU Order', () => {
    it('should maintain correct LRU order', () => {
      lru.set('key1', 'value1', 10);
      lru.set('key2', 'value2', 10);
      lru.set('key3', 'value3', 10);

      const keys = lru.keys();
      expect(keys).toEqual(['key1', 'key2', 'key3']); // LRU order (oldest first)
    });

    it('should update order on access', () => {
      lru.set('key1', 'value1', 10);
      lru.set('key2', 'value2', 10);
      lru.set('key3', 'value3', 10);

      // Access key1 to move it to front
      lru.get('key1');

      const keys = lru.keys();
      expect(keys).toEqual(['key2', 'key3', 'key1']); // key1 is now most recent
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      lru.set('key1', 'value1', 20);
      lru.set('key2', 'value2', 30);

      const stats = lru.getStats();
      expect(stats.size).toBe(2);
      expect(stats.memoryBytes).toBe(50);
      expect(stats.capacity).toBe(3);
      expect(stats.maxSizeBytes).toBe(100);
    });
  });

  describe('Clear', () => {
    it('should clear all entries', () => {
      lru.set('key1', 'value1', 10);
      lru.set('key2', 'value2', 10);

      lru.clear();

      expect(lru.length).toBe(0);
      expect(lru.memoryBytes).toBe(0);
      expect(lru.get('key1')).toBeUndefined();
      expect(lru.get('key2')).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero capacity', () => {
      const zeroLru = new SizeAwareLRU<string>(0, 100);
      const evicted = zeroLru.set('key1', 'value1', 10);
      expect(evicted).toEqual(['value1']);
      expect(zeroLru.length).toBe(0);
    });

    it('should handle zero memory limit', () => {
      const zeroMemLru = new SizeAwareLRU<string>(10, 0);
      const evicted = zeroMemLru.set('key1', 'value1', 10);
      expect(evicted).toEqual(['value1']);
      expect(zeroMemLru.length).toBe(0);
    });

    it('should handle infinite capacity and memory', () => {
      const infiniteLru = new SizeAwareLRU<string>();

      for (let i = 0; i < 1000; i++) {
        infiniteLru.set(`key${i}`, `value${i}`, 10);
      }

      expect(infiniteLru.length).toBe(1000);
      expect(infiniteLru.memoryBytes).toBe(10000);
    });
  });
});
